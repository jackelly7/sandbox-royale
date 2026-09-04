import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../lib/game/network.ts';
import type { PlayerPose } from '../lib/game/multiplayer.ts';

void test('live client sends actions over a persistent socket and reconciles acknowledgments', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    readyState = 0;
    bufferedAmount = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    constructor() {
      sockets.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
  }
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: FakeSocket,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'WebSocket', original);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
  });
  t.mock.method(globalThis, 'fetch', () => {
    assert.fail('Gameplay must not make HTTP round trips');
  });
  let acknowledged: PlayerPose | undefined;
  const client = new MultiplayerClient(
    { code: 'ABC234', playerId: 'friend', token: 'test' },
    (_room, pose) => {
      acknowledged = pose;
    },
    () => {},
    () => {},
  );
  const socket = sockets[0];
  socket.open();
  socket.receive({ type: 'ready' });
  const pose = { x: 1, y: 1.7, z: 62, yaw: 0, pitch: 0, weapon: -1 };
  client.send({ type: 'pose', pose });
  client.send({ type: 'pickup', index: 19 });
  const packet = JSON.parse(socket.sent.at(-1)!);
  assert.equal(packet.type, 'commands');
  assert.deepEqual(
    packet.actions.map((a: { seq: number }) => a.seq),
    [1, 2],
  );
  socket.receive({ type: 'snapshot', ack: 2, room: { phase: 'playing' } });
  assert.deepEqual(acknowledged, pose);
  assert.equal(client.pending.length, 0);
  socket.close();
  t.mock.timers.tick(500);
  assert.equal(sockets.length, 2, 'Dropped connections reopen');
  sockets[1].open();
  sockets[1].receive({ type: 'ready' });
  client.send({ type: 'reload' });
  assert.equal(
    JSON.parse(sockets[1].sent.at(-1)!).actions[0].seq,
    3,
    'Reconnect preserves command sequence',
  );
  client.close(false);
  t.mock.timers.tick(500);
});

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
    'http',
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
