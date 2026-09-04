import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../lib/game/network.ts';

void test('joining still works in browsers without AbortSignal.timeout', async (t) => {
  t.mock.method(AbortSignal, 'timeout', () => {
    throw new Error('AbortSignal.timeout is unavailable');
  });
  const session = { code: 'ABC234', playerId: 'friend', token: 'test' };
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: string, init: RequestInit) => {
      assert.deepEqual(JSON.parse(init.body as string), {
        type: 'join',
        name: 'Friend',
        code: 'ABC234',
      });
      return Response.json(session, { status: 201 });
    },
  );
  assert.deepEqual(
    await MultiplayerClient.enter('Friend', ' abc234 '),
    session,
  );
});

void test('a stalled join releases the form with an actionable timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  t.mock.method(
    globalThis,
    'fetch',
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
  );
  const rejected = assert.rejects(
    MultiplayerClient.enter('Friend', 'ABC234'),
    /Connection timed out/,
  );
  t.mock.timers.tick(12000);
  await rejected;
  assert.equal(aborted, true);
});

void test('an HTML error page produces a useful room error', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('<html>Unavailable</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      }),
  );
  await assert.rejects(
    MultiplayerClient.enter('Friend', 'ABC234'),
    /Please try joining again/,
  );
});

void test('an initial room connection stops retrying instead of hanging forever', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Unavailable' }, { status: 503 }),
  );
  const statuses: string[] = [];
  const errors: string[] = [];
  const client = new MultiplayerClient(
    { code: 'ABC234', playerId: 'friend', token: 'test' },
    () => assert.fail('No room should have loaded'),
    (status) => statuses.push(status),
    (error) => errors.push(error),
  );
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(4000);
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.closed, true);
  assert.equal(statuses.at(-1), 'offline');
  assert.match(errors.at(-1)!, /Leave the room and try joining again/);
});
