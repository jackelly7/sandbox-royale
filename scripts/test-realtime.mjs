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
try {
  const host = await connect(await post('/rooms', { name: 'Latency Host' }));
  for (let i = 1; i < 8; i++)
    await connect(
      await post(`/rooms/${host.session.code}/join`, {
        name: `Latency Friend ${i}`,
      }),
    );
  await host.until((r) => r.players.length === 8);
  await assert.rejects(
    post(`/rooms/${host.session.code}/join`, { name: 'Ninth' }),
    /full/,
  );
  host.send({ type: 'start' });
  const dropping = await host.until((r) => r.phase === 'playing');
  assert.ok(dropping.players.every((p) => p.dropping && p.y > 20));
  console.log('PASS all eight players begin under parachutes');
  const room = await host.until(
    (r) => r.phase === 'playing' && r.players.every((p) => !p.dropping),
  );
  assert.ok(
    room.players.every((p) => p.weapon === -1 && p.owned.every((v) => !v)),
  );
  console.log(
    'PASS eight real sockets share an unarmed start; ninth player rejected',
  );
  const poses = clients.map((c) => ({
    ...room.players.find((p) => p.id === c.session.playerId),
  }));
  const expected = new Map(),
    latencies = [];
  clients[1].onRoom = (r) => {
    const yaw = r.players.find((p) => p.id === host.session.playerId).yaw;
    const key = Math.round(yaw * 1000),
      sent = expected.get(key);
    if (sent) {
      latencies.push(Date.now() - sent);
      expected.delete(key);
    }
  };
  for (let n = 1; n <= 60; n++) {
    expected.set(n, Date.now());
    clients.forEach((c, i) =>
      c.send({
        type: 'pose',
        pose: { ...poses[i], yaw: n / 1000, z: poses[i].z + (n % 2) * 0.1 },
      }),
    );
    await wait(50);
  }
  await wait(300);
  assert.ok(
    latencies.length >= 30,
    `Only ${latencies.length} movement updates arrived`,
  );
  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length * 0.5)],
    p95 = latencies[Math.floor(latencies.length * 0.95)];
  console.log(
    `Eight-player movement latency: median ${median} ms, p95 ${p95} ms, ${latencies.length}/60 observed updates`,
  );
  assert.ok(p95 < 500, 'Movement updates are still too slow');
  host.send({ type: 'pose', pose: { ...poses[0], x: 3, z: 62, yaw: 0 } });
  await host.until(
    (r) =>
      Math.abs(r.players.find((p) => p.id === host.session.playerId).x - 3) <
      0.01,
  );
  host.send({ type: 'pickup', index: 19 });
  let own = (
    await host.until(
      (r) => r.players.find((p) => p.id === host.session.playerId).owned[0],
    )
  ).players.find((p) => p.id === host.session.playerId);
  assert.equal(own.weapon, 0);
  assert.equal(own.ammo[0], 30);
  const shot = host.send({ type: 'shoot', pose: own, aiming: true });
  await host.until(
    (r) => r.players.find((p) => p.id === host.session.playerId).ammo[0] === 29,
  );
  host.ws.send(JSON.stringify({ type: 'commands', actions: [shot] }));
  await wait(250);
  own = host.room.players.find((p) => p.id === host.session.playerId);
  assert.equal(own.ammo[0], 29);
  for (const [kind, x, index] of [
    [1, 6, 20],
    [2, 9, 21],
  ]) {
    host.send({ type: 'pose', pose: { ...own, x, z: 62 } });
    await host.until(
      (r) =>
        Math.abs(r.players.find((p) => p.id === host.session.playerId).x - x) <
        0.01,
    );
    host.send({ type: 'pickup', index });
    await host.until(
      (r) => r.players.find((p) => p.id === host.session.playerId).owned[kind],
    );
    own = host.room.players.find((p) => p.id === host.session.playerId);
    assert.equal(own.weapon, kind);
    host.send({ type: 'pose', pose: { ...own, weapon: -1 } });
    await wait(150);
    assert.equal(
      host.room.players.find((p) => p.id === host.session.playerId).weapon,
      kind,
    );
  }
  console.log(
    'PASS AR, shotgun and sniper unlock and equip; repeated commands stay idempotent',
  );
} finally {
  clients.forEach((c) => {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  });
  await wait(300);
  clients.forEach((c) => c.ws.close());
}
