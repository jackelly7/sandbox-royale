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
  const pose = { ...mine(c) };
  for (let step = 0; step < 250; step++) {
    const dx = x - pose.x,
      dz = z - pose.z,
      length = Math.hypot(dx, dz);
    if (length < 0.03) break;
    const amount = Math.min(0.8, length);
    pose.x += (dx / length) * amount;
    pose.z += (dz / length) * amount;
    c.send({ type: 'pose', pose });
    await wait(100);
  }
  await c.until((r) =>
    r.players.some(
      (p) => p.id === c.session.playerId && Math.hypot(p.x - x, p.z - z) < 0.2,
    ),
  );
}
try {
  const host = await connect(await post('/rooms', { name: 'Recovery Host' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Recovery Friend' }),
  );
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && mine(host).dropping);
  const height = mine(host).y;
  host.send({ type: 'pose', pose: { ...mine(host), x: 3, y: 1.7 } });
  await host.until(() => Math.abs(mine(host).x - 3) < 0.1);
  assert.ok(mine(host).y > 10 && mine(host).y <= height);
  host.send({ type: 'pickup', index: 19 });
  await wait(300);
  assert.equal(mine(host).owned[0], false);
  console.log(
    'PASS drop steers horizontally, rejects instant landing and airborne loot',
  );
  await host.until((r) => r.players.every((p) => !p.dropping));
  await walk(host, 5, 62);
  host.send({ type: 'pickup', index: 19 });
  await host.until(() => mine(host).owned[0]);
  for (const [x, z] of [
    [12, -67],
    [12, -44],
    [12, -35],
    [0, -35],
    [0, 58],
    [17, 58],
  ])
    await walk(friend, x, z);
  friend.send({ type: 'pickup', index: 43 });
  friend.send({ type: 'pickup', index: 44 });
  await friend.until(
    () => mine(friend).medkits === 1 && mine(friend).cells === 1,
  );
  console.log(
    'PASS recovery items stored on landing and synchronized to both players',
  );
  const fire = () => {
    const p = mine(host),
      t = mine(friend);
    host.send({
      type: 'shoot',
      pose: { ...p, yaw: Math.atan2(-(t.x - p.x), -(t.z - p.z)), pitch: 0 },
      aiming: true,
    });
  };
  for (let n = 0; n < 4; n++) {
    fire();
    await wait(250);
  }
  await friend.until(
    () =>
      mine(friend).health < 100 &&
      mine(friend).health > 0 &&
      mine(friend).shield === 0,
  );
  friend.send({ type: 'heal', item: 'medkit' });
  await friend.until(() => mine(friend).healing === 'medkit');
  assert.equal(mine(friend).medkits, 1);
  await friend.until(
    () => mine(friend).health === 100 && mine(friend).medkits === 0,
  );
  await host.until(
    (r) =>
      r.players.find((p) => p.id === friend.session.playerId).health === 100,
  );
  console.log('PASS timed medkit restores shared health exactly once');
  friend.send({ type: 'heal', item: 'shield' });
  await friend.until(() => mine(friend).healing === 'shield');
  fire();
  await friend.until(
    () => mine(friend).healing === null && mine(friend).health < 100,
  );
  assert.equal(mine(friend).cells, 1);
  friend.send({ type: 'heal', item: 'shield' });
  await friend.until(
    () => mine(friend).shield === 50 && mine(friend).cells === 0,
  );
  console.log(
    'PASS incoming fire interrupts healing without spending the item; retry completes',
  );
  for (let n = 0; n < 14 && mine(friend).health > 0; n++) {
    fire();
    await wait(250);
  }
  await friend.until(
    (r) => r.phase === 'finished' && mine(friend).health === 0,
  );
  assert.equal(mine(friend).killedBy, host.session.playerId);
  assert.ok(mine(friend).diedAt > 0);
  await wait(1700);
  assert.equal(mine(friend).killedBy, host.session.playerId);
  host.send({ type: 'rematch' });
  await host.until((r) => r.phase === 'waiting');
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'countdown');
  assert.ok(
    host.room.players.every(
      (p) =>
        p.medkits === 0 &&
        p.cells === 0 &&
        !p.healing &&
        p.killedBy === null &&
        p.dropping,
    ),
  );
  console.log(
    'PASS killer persists for spectating and rematch resets supplies, loadout and parachutes',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(500);
  clients.forEach((c) => c.ws.close());
}
