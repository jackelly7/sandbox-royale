import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { WEAPONS } from '../lib/game/rules.ts';
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
  const host = await connect(await post('/rooms', { name: 'Gun Game QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, {
      name: 'Gun Game Witness QA',
    }),
  );
  host.send({ type: 'mode', mode: 'gun-game' });
  await friend.until((r) => r.mode === 'gun-game');
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && r.now - r.startAt > 2000);
  assert.equal(mine(host).weapon, 3);
  assert.equal(mine(friend).weapon, 3);
  assert.equal(host.room.busDuration, 0);
  assert.equal(host.room.drops.length, 0);
  await Promise.all([
    walk(host, { x: 0, z: 55 }),
    walk(friend, { x: 0, z: 50 }),
  ]);
  async function eliminate(attacker, victim) {
    const stage = mine(attacker).gunStage,
      limit = Date.now() + 20000;
    while (mine(victim).health > 0 && Date.now() < limit) {
      const a = mine(attacker),
        b = mine(victim),
        distance = Math.hypot(b.x - a.x, b.z - a.z);
      attacker.send({
        type: 'shoot',
        pose: {
          ...a,
          yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
          pitch: Math.atan2(b.y - a.y, distance),
        },
        aiming: true,
      });
      await wait(WEAPONS[a.weapon].interval * 1000 + 110);
    }
    await attacker.until(() => mine(attacker).gunStage === stage + 1);
    await victim.until(
      () => mine(victim).health === 0 && mine(victim).respawnAt > 0,
    );
    assert.equal(attacker.room.phase, 'playing');
    await victim.until(
      () => mine(victim).health === 100 && mine(victim).respawnAt === 0,
    );
    await victim.until((r) => r.now > mine(victim).protectedUntil);
  }
  await eliminate(host, friend);
  assert.equal(mine(host).weapon, 4);
  assert.equal(mine(friend).gunStage, 0);
  await walk(friend, { x: 0, z: 50 });
  await eliminate(friend, host);
  assert.equal(mine(host).gunStage, 1);
  assert.equal(mine(host).weapon, 4);
  const late = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Late Gunner QA' }),
  );
  assert.equal(mine(late).spectator, false);
  assert.equal(mine(late).weapon, 3);
  const listed = await fetch(endpoint + '/rooms').then((r) => r.json());
  assert.ok(JSON.stringify(listed).includes('gun-game'));
  console.log(
    'PASS live Gun Game selection, two-way eliminations, weapon advancement, synchronized respawns, saved progress, and immediate late join',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
