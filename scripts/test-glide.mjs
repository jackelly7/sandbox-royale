import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { LAUNCH_PADS } from '../lib/game/traversal.ts';
import { MAP } from '../lib/game/map-data.ts';
import { botPath } from '../server/bots.ts';
const endpoint =
  process.env.MULTIPLAYER_TEST_URL ||
  'https://br-frosty-surf-a5j1d8vg-lastlight.compute.c-1.us-east-2.aws.neon.tech';
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
try {
  const host = await connect(await post('/rooms', { name: 'Glide QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, {
      name: 'Glide Witness QA',
    }),
  );
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && r.now - r.startAt >= 8000);
  host.send({ type: 'jumpBus' });
  await host.until(() => mine(host).onBus === false);
  const start = { ...mine(host) };
  await travel(host, { x: start.x + 28, z: start.z });
  assert.ok(
    mine(host).x - start.x > 27 && mine(host).y > start.y - 14,
    'longer horizontal travel without snapping back',
  );
  await travel(host, MAP.loot[2]);
  await host.until(() => !mine(host).dropping);
  host.send({ type: 'pickup', index: 2 });
  await host.until(() => mine(host).weapon === 2 && mine(host).ammo[2] > 0);
  const path = botPath(mine(host), LAUNCH_PADS[5]);
  assert.ok(path.length);
  for (const point of path) await travel(host, point, 0.75);
  await host.until(() => mine(host).launchAt > 0);
  await host.until(
    (r) => r.now >= mine(host).launchAt + 1000 && mine(host).dropping,
  );
  const before = mine(host).ammo[2],
    shotAfter = host.room.now;
  host.send({
    type: 'shoot',
    pose: { ...mine(host), pitch: 0.5 },
    aiming: true,
  });
  await host.until(() => mine(host).ammo[2] === before - 1);
  await friend.until((r) =>
    r.events.some(
      (e) =>
        e.type === 'shot' &&
        e.player === host.session.playerId &&
        e.at >= shotAfter,
    ),
  );
  host.send({ type: 'reload' });
  await host.until((r) => mine(host).reloadUntil > r.now);
  await host.until(
    () => mine(host).ammo[2] === before && !mine(host).reloadUntil,
  );
  assert.equal(mine(host).dropping, true, 'reload completes during descent');
  console.log(
    'PASS longer glide movement, normal loot acquisition, aimed fire from pad glide, replicated shot, and airborne reload',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
