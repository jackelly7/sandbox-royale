import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { REBOOT_STATIONS } from '../lib/game/comeback.ts';
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
async function walk(c, target) {
  const path = botPath(mine(c), target);
  assert.ok(path.length, 'Reachable test destination');
  for (const point of path) await travel(c, point, 0.8);
  await travel(c, target, 0.8);
}
try {
  const carrier = await connect(
    await post('/rooms', { name: 'Comeback Carrier QA' }),
  );
  const attacker = await connect(
    await post(`/rooms/${carrier.session.code}/join`, {
      name: 'Comeback Rival QA',
    }),
  );
  const victim = await connect(
    await post(`/rooms/${carrier.session.code}/join`, {
      name: 'Comeback Return QA',
    }),
  );
  carrier.send({ type: 'mode', mode: 'duos' });
  await victim.until((r) => r.mode === 'duos');
  carrier.send({ type: 'start' });
  await carrier.until(
    (r) => r.phase === 'playing' && r.now - r.startAt >= 8000,
  );
  for (const c of [carrier, attacker, victim]) c.send({ type: 'jumpBus' });
  await Promise.all(
    [carrier, attacker, victim].map((c) => c.until(() => !mine(c).onBus)),
  );
  await Promise.all([
    travel(carrier, { x: 8, z: 50 }),
    travel(attacker, { x: 0, z: 52.2 }),
    travel(victim, { x: 0, z: 50 }),
  ]);
  await Promise.all(
    [carrier, attacker, victim].map((c) => c.until(() => !mine(c).dropping)),
  );
  const deadline = Date.now() + 25000;
  while (mine(victim).health > 0 && Date.now() < deadline) {
    const a = mine(attacker),
      v = mine(victim);
    attacker.send({
      type: 'melee',
      pose: { ...a, yaw: Math.atan2(-(v.x - a.x), -(v.z - a.z)), pitch: 0 },
    });
    await wait(750);
  }
  await victim.until(() => mine(victim).health === 0);
  await carrier.until((r) =>
    r.tokens.some((t) => t.player === victim.session.playerId),
  );
  assert.equal(
    attacker.room.tokens.length,
    0,
    'Enemy cannot see teammate token',
  );
  await travel(carrier, mine(victim), 0.8);
  await carrier.until((r) =>
    r.tokens.some((t) => t.carriedBy === carrier.session.playerId),
  );
  const station = REBOOT_STATIONS[0];
  await walk(carrier, { x: station.x, z: station.z + 2 });
  carrier.send({ type: 'reboot', station: 0 });
  await carrier.until(
    () => mine(carrier).rebooting === victim.session.playerId,
  );
  await victim.until(
    () => mine(victim).health === 100 && mine(victim).comebackUsed,
  );
  assert.equal(mine(victim).weapon, -1);
  assert.equal(mine(victim).shield, 0);
  assert.equal(mine(victim).rank, 0);
  assert.equal(mine(victim).deaths, 1);
  await carrier.until((r) => r.tokens.length === 0);
  console.log(
    'PASS live duos elimination, private token, automatic retrieval, station channel, and synchronized unarmed comeback',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
