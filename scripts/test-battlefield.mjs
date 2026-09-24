import { MULTIPLAYER_ORIGIN } from '../lib/game/network-config.ts';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { MAP } from '../lib/game/map-data.ts';
import { botPath } from '../server/bots.ts';
const endpoint = process.env.MULTIPLAYER_TEST_URL || MULTIPLAYER_ORIGIN;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, data) => {
  const response = await fetch(endpoint + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
  return result;
};
const clients = [];
async function connect(session) {
  const ws = new WebSocket(endpoint.replace(/^http/, 'ws') + '/ws');
  const client = { session, ws, seq: 0, room: null, received: 0, onRoom: null };
  client.send = (command) => {
    const action = { seq: ++client.seq, command };
    ws.send(JSON.stringify({ type: 'commands', actions: [action] }));
    return action;
  };
  client.until = async (predicate) => {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (client.room && predicate(client.room)) return client.room;
      await wait(10);
    }
    throw new Error('Room update timed out');
  };
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', ...session })));
  ws.on('message', (raw) => {
    const m = JSON.parse(
      Buffer.isBuffer(raw)
        ? raw.toString()
        : Buffer.from(
            raw instanceof ArrayBuffer ? raw : Buffer.concat(raw),
          ).toString(),
    );
    if (m.type === 'snapshot') {
      client.room = m.room;
      client.received++;
      client.onRoom?.(m.room);
    }
    if (m.type === 'error') console.log('Room error:', m.message);
  });
  ws.on('error', () => {});
  client.heartbeat = setInterval(() => {
    if (ws.readyState === 1)
      ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
  }, 1000);
  clients.push(client);
  await client.until(() => true);
  return client;
}
const mine = (c) => c.room.players.find((p) => p.id === c.session.playerId);

async function travel(c, target, speed = 1.65) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const me = mine(c),
      dx = target.x - me.x,
      dz = target.z - me.z,
      d = Math.hypot(dx, dz);
    if (d < 0.25) return;
    const step = Math.min(speed, d);
    c.send({
      type: 'pose',
      pose: { ...me, x: me.x + (dx / d) * step, z: me.z + (dz / d) * step },
    });
    await wait(100);
  }
  throw new Error('Travel timed out');
}
async function walk(c, target) {
  const path = botPath(mine(c), target);
  assert.ok(path.length, 'Reachable test destination');
  for (const point of path) await travel(c, point, 0.8);
  await travel(c, target, 0.8);
}
try {
  const host = await connect(await post('/rooms', { name: 'Supply Smoke QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, {
      name: 'Supply Smoke Witness QA',
    }),
  );
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && r.now - r.startAt >= 8000);
  host.send({ type: 'jumpBus' });
  await host.until(() => !mine(host).onBus);
  const smokeIndex = host.room.drops.findIndex((d) => d.kind === 8),
    drop = host.room.drops[smokeIndex];
  await travel(host, drop);
  await host.until(() => !mine(host).dropping);
  host.send({ type: 'pickup', index: MAP.loot.length + smokeIndex });
  await host.until(() => mine(host).smokes === 1);
  host.send({ type: 'smoke', pose: { ...mine(host), yaw: 0, pitch: 0 } });
  await friend.until((r) => r.smokes.length === 1);
  const s = friend.room.smokes[0];
  assert.equal(s.endsAt - s.startsAt, 10000);
  assert.deepEqual(Object.keys(s.from).sort(), ['x', 'y', 'z']);
  await host.until(() => mine(host).smokes === 0);
  const supply = host.room.supply;
  assert.ok(supply.rarity >= 2);
  await walk(host, { x: supply.x, z: supply.z + 2 });
  while (host.room.now - host.room.startAt < supply.arrivesAt) await wait(250);
  const count = host.room.drops.length;
  host.send({ type: 'supply' });
  await friend.until((r) => r.supply.opened && r.drops.length === count + 5);
  assert.equal(
    friend.room.drops[count + 1].kind,
    friend.room.drops[count].kind + 5,
  );
  assert.equal(friend.room.drops[count + 4].kind, 8);
  host.send({ type: 'supply' });
  await wait(300);
  assert.equal(host.room.drops.length, count + 5);
  assert.equal(host.room.smokes.length, 0);
  console.log(
    'PASS live smoke pickup, shared throw/expiry, sanitized payload, falling supply drop, and one shared claim with separate ammo',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
