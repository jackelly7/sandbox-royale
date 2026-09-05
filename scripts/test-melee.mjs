import assert from 'node:assert/strict';
import WebSocket from 'ws';
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
    const deadline = Date.now() + 12000;
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
async function walk(c, x, z) {
  const pose = { ...mine(c), sprinting: true };
  for (let step = 0; step < 250; step++) {
    const dx = x - pose.x,
      dz = z - pose.z,
      length = Math.hypot(dx, dz);
    if (length < 0.03) break;
    const amount = Math.min(1.3, length);
    pose.x += (dx / length) * amount;
    pose.z += (dz / length) * amount;
    c.send({ type: 'pose', pose });
    await wait(100);
  }
  try {
    await c.until((r) =>
      r.players.some(
        (p) =>
          p.id === c.session.playerId && Math.hypot(p.x - x, p.z - z) < 0.2,
      ),
    );
  } catch {
    const p = mine(c);
    throw new Error(
      `Walk to ${x},${z} stopped at ${p.x},${p.z}; health ${p.health}; phase ${c.room.phase}`,
    );
  }
}
try {
  const host = await connect(await post('/rooms', { name: 'Melee QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Melee Rival QA' }),
  );
  host.send({ type: 'start' });
  await host.until(
    (r) => r.phase === 'playing' && r.players.every((p) => !p.dropping),
  );
  assert.equal(host.room.loot.filter((used) => !used).length, 47);
  assert.ok(host.room.players.every((p) => p.weapon === -1));
  await Promise.all([
    (async () => {
      for (const [x, z] of [
        [5, 62],
        [6, 40],
        [14, 40],
      ])
        await walk(host, x, z);
    })(),
    (async () => {
      for (const [x, z] of [
        [12, -67],
        [12, -44],
        [12, -35],
        [6, -35],
        [7, -6],
        [6, 40],
        [16, 40],
      ])
        await walk(friend, x, z);
    })(),
  ]);
  const punch = () => {
    const p = mine(host),
      q = mine(friend);
    host.send({
      type: 'melee',
      pose: {
        ...p,
        yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z)),
        pitch: 0,
        sprinting: false,
      },
    });
  };
  punch();
  await friend.until(() => mine(friend).shield === 25);
  assert.ok(mine(host).meleeAt > 0);
  punch();
  punch();
  await wait(180);
  assert.equal(
    mine(friend).shield,
    25,
    'Rapid repeated commands cannot bypass punch cooldown',
  );
  console.log(
    'PASS 47 floor pickups and unarmed melee damage synchronize over real sockets',
  );
  for (let i = 0; i < 6 && mine(friend).health > 0; i++) {
    await wait(700);
    punch();
    await wait(100);
  }
  await host.until((r) => r.phase === 'finished');
  assert.equal(mine(friend).killedBy, host.session.playerId);
  assert.equal(host.room.winner, host.session.playerId);
  assert.equal(mine(host).weapon, -1);
  assert.deepEqual(mine(host).ammo, [0, 0, 0]);
  console.log(
    'PASS melee cooldown, elimination credit, and shared victory without guns',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
