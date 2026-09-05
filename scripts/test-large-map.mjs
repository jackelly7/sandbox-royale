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
  const host = await connect(await post('/rooms', { name: 'Large Map QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Map Rival QA' }),
  );
  host.send({ type: 'start' });
  await host.until(
    (r) => r.phase === 'playing' && r.players.every((p) => !p.dropping),
  );
  assert.ok(host.room.storm > 170, 'Small rooms use the full expanded circle');
  assert.equal(host.room.zone.stage, 'waiting');
  assert.ok(
    host.room.zone.remaining > 40,
    'Opening phase leaves time to explore',
  );
  assert.ok(Math.abs(mine(host).z) > 100);
  await walk(host, 0, 130);
  assert.ok(
    mine(host).z > 125,
    'Server permits travel past the old 110m boundary',
  );
  await walk(host, 8.25, 118.8);
  host.send({ type: 'pickup', index: 16 });
  await host.until(() => mine(host).owned[1]);
  assert.ok(
    friend.room.players.find((p) => p.id === host.session.playerId).z > 110,
  );
  assert.equal(host.room.loot.filter((used) => !used).length, 30);
  console.log(
    'PASS expanded movement, outer-map loot, and 55-second opening circle across two live sockets',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
