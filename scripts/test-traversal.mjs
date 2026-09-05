import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { LAUNCH_PADS } from '../lib/game/traversal.ts';
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

try {
  const host = await connect(await post('/rooms', { name: 'Bus QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Bus Rival QA' }),
  );
  host.send({ type: 'bots', count: 4 });
  await friend.until((r) => r.botCount === 4);
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && r.now - r.startAt >= 2000);
  assert.equal(host.room.players.filter((p) => p.bot).length, 4);
  assert.equal(mine(host).onBus, true);
  host.send({ type: 'jumpBus' });
  await host.until(() => mine(host).onBus === false);
  await friend.until(
    (r) =>
      r.players.find((p) => p.id === host.session.playerId)?.onBus === false,
  );
  assert.equal(mine(friend).onBus, true, 'friend chooses their own jump');
  const pad = LAUNCH_PADS[0];
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !(mine(host).launchAt > 0)) {
    const me = mine(host),
      dx = pad.x - me.x,
      dz = pad.z - me.z,
      d = Math.hypot(dx, dz),
      step = Math.min(0.65, d);
    if (d > 0.1)
      host.send({
        type: 'pose',
        pose: { ...me, x: me.x + (dx / d) * step, z: me.z + (dz / d) * step },
      });
    await wait(100);
  }
  assert.ok(mine(host).launchAt > 0, 'landing on pad launches the player');
  await host.until(() => mine(host).y > 10);
  await friend.until(
    (r) => r.players.find((p) => p.id === host.session.playerId)?.launchAt > 0,
  );
  // Steer clear of the pad so landing does not launch again.
  for (let i = 0; i < 10; i++) {
    const me = mine(host);
    host.send({ type: 'pose', pose: { ...me, x: me.x + 0.6 } });
    await wait(100);
  }
  await friend.until(() => mine(friend).onBus === false);
  await friend.until(() => mine(friend).dropping === false);
  assert.ok(
    friend.room.now - friend.room.startAt > 18000,
    'rider automatically jumps at route end',
  );
  await host.until((r) =>
    r.players.some((p) => p.bot && p.owned.some(Boolean)),
  );
  assert.ok(
    host.room.chests.some((c) => c.openedAt),
    'bots open chests',
  );
  const late = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Late Bus QA' }),
  );
  assert.equal(mine(late).spectator, true);
  console.log(
    'PASS shared bot setting, independent bus jumps, automatic jump, synchronized launch pads, bot looting, and late-join spectator',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
