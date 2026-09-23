import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerClient } from '../lib/game/network.ts';
import type { PlayerPose } from '../lib/game/multiplayer.ts';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  advance,
  snapshot,
  forViewer,
} from '../server/model.ts';

function fakeSockets(t: TestContext) {
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
  return sockets;
}

void test('live client sends actions over a persistent socket and reconciles acknowledgments', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const sockets = fakeSockets(t);
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

void test('congested sockets preserve pose/action order and replay only after reconnect', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const sockets = fakeSockets(t);
  const client = new MultiplayerClient(
    { code: 'ABC234', playerId: 'friend', token: 'test' },
    () => {},
    () => {},
    (message) => assert.fail(message),
  );
  t.after(() => client.close(false));
  const socket = sockets[0];
  socket.open();
  socket.receive({ type: 'ready' });
  socket.bufferedAmount = 65000;
  const pose = { x: 1, y: 1.7, z: 62, yaw: 0, pitch: 0, weapon: -1 };
  client.send({ type: 'pose', pose });
  client.send({ type: 'pickup', index: 19 });
  client.send({ type: 'pose', pose: { ...pose, x: 2 } });
  client.send({ type: 'pose', pose: { ...pose, x: 3 } });
  socket.bufferedAmount = 0;
  t.mock.timers.tick(50);
  const packet = JSON.parse(socket.sent.at(-1)!);
  assert.deepEqual(
    packet.actions.map((a: { command: { type: string } }) => a.command.type),
    ['pose', 'pickup', 'pose'],
  );
  assert.equal(packet.actions[0].command.pose.x, 1);
  assert.equal(packet.actions[2].command.pose.x, 3);
  const packets = () =>
    socket.sent.map((s) => JSON.parse(s)).filter((m) => m.type === 'commands');
  t.mock.timers.tick(500);
  assert.equal(
    packets().length,
    1,
    'No retransmission while a reliable socket awaits its ack',
  );
  socket.close();
  t.mock.timers.tick(500);
  const replacement = sockets[1];
  replacement.open();
  replacement.receive({ type: 'ready' });
  assert.deepEqual(
    JSON.parse(replacement.sent.at(-1)!).actions,
    packet.actions,
  );
  replacement.receive({
    type: 'snapshot',
    ack: packet.actions.at(-1).seq,
    room: {},
  });
  assert.equal(client.pending.length, 0);
  socket.onclose?.();
  assert.equal(
    client.socketReady,
    true,
    'A stale socket cannot shut down its replacement',
  );
});

for (const mode of ['gun-game'] as const) {
  void test(`${mode}: eight clients and eight bots keep commands ordered with 250ms snapshot delay`, (t) => {
    t.mock.timers.enable({
      apis: ['setTimeout', 'setInterval', 'Date'],
      now: 10000,
    });
    const sockets = fakeSockets(t);
    const room = createRoom(
      'ABC234',
      createMember('p0', 'Player 0', 'hash', 1000),
      1000,
    );
    for (let i = 1; i < 8; i++)
      addMember(room, createMember(`p${i}`, `Player ${i}`, 'hash', 1000));
    applyCommand(room, 'p0', { type: 'mode', mode }, 1000);
    applyCommand(room, 'p0', { type: 'bots', count: 8 }, 1000);
    applyCommand(room, 'p0', { type: 'start' }, 1000);
    const updates = Array(8).fill(0) as number[];
    const clients = Array.from(
      { length: 8 },
      (_, i) =>
        new MultiplayerClient(
          { code: room.code, playerId: `p${i}`, token: 'test' },
          (next) => {
            assert.equal(next.mode, mode);
            assert.equal(next.players.length, 16);
            updates[i]++;
          },
          () => {},
          (message) => assert.fail(message),
        ),
    );
    t.after(() => clients.forEach((client) => client.close(false)));
    sockets.forEach((socket) => {
      socket.open();
      socket.receive({ type: 'ready' });
    });
    const sequences = clients.map(() => new Set<number>());
    let total = 0;
    for (let frame = 0; frame < 40; frame++) {
      for (const [i, client] of clients.entries()) {
        const p = room.players.find((p) => p.id === `p${i}`)!;
        client.send({
          type: 'pose',
          pose: {
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: frame / 100,
            pitch: 0,
            weapon: p.weapon,
          },
        });
        if (frame % 5 === 0) client.send({ type: 'reload' });
      }
      t.mock.timers.tick(50);
      const now = Date.now();
      for (const [i, socket] of sockets.entries()) {
        const p = room.players.find((p) => p.id === `p${i}`)!;
        p.lastSeen = now;
        for (const raw of socket.sent.splice(0)) {
          const message = JSON.parse(raw);
          if (message.type !== 'commands') continue;
          for (const action of message.actions) {
            assert.ok(
              !sequences[i].has(action.seq),
              'Congestion must not duplicate actions',
            );
            sequences[i].add(action.seq);
            applyCommand(room, p.id, action.command, now);
            p.lastCommand = action.seq;
            total++;
          }
        }
      }
      advance(room, now);
      for (const [i, socket] of sockets.entries()) {
        const p = room.players.find((p) => p.id === `p${i}`)!;
        const message = structuredClone({
          type: 'snapshot',
          ack: p.lastCommand,
          room: forViewer(snapshot(room, now), p.id),
        });
        setTimeout(() => socket.receive(message), 250);
      }
    }
    t.mock.timers.tick(300);
    assert.ok(updates.every((count) => count >= 40));
    assert.ok(clients.every((client) => client.pending.length === 0));
    assert.ok(
      room.players
        .filter((p) => !p.bot && p.health > 0)
        .every((p) => p.yaw === 0.39),
    );
    console.log(
      `${mode}: ${total} actions, zero duplicate sends, 8 clients / 16 participants`,
    );
  });
}
