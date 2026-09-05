import { MAP } from '../lib/game/map-data.ts';
import { blocksBody } from '../lib/game/movement.ts';
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
async function segment(c, x, z) {
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
function clear(a, b) {
  const n = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.3);
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    if (
      blocksBody(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0, MAP.colliders)
    )
      return false;
  }
  return true;
}
async function walk(c, x, z) {
  const start = { x: mine(c).x, z: mine(c).z },
    goal = { x, z };
  if (clear(start, goal)) return segment(c, x, z);
  const key = (x, z) => `${x},${z}`;
  const first = {
    x: Math.round(start.x / 2) * 2,
    z: Math.round(start.z / 2) * 2,
    g: 0,
    parent: null,
  };
  const pending = [first],
    seen = new Map([[key(first.x, first.z), 0]]);
  let end;
  while (pending.length) {
    pending.sort(
      (a, b) =>
        a.g + Math.hypot(a.x - x, a.z - z) - b.g - Math.hypot(b.x - x, b.z - z),
    );
    const p = pending.shift();
    if (Math.hypot(p.x - x, p.z - z) < 4 && clear(p, goal)) {
      end = p;
      break;
    }
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2],
    ]) {
      const q = {
        x: p.x + dx,
        z: p.z + dz,
        g: p.g + Math.hypot(dx, dz),
        parent: p,
      };
      const k = key(q.x, q.z);
      if (
        Math.hypot(q.x, q.z) > 178 ||
        (seen.get(k) ?? Infinity) <= q.g ||
        !clear(p, q)
      )
        continue;
      seen.set(k, q.g);
      pending.push(q);
    }
  }
  assert.ok(end, 'A walking route reaches the castle');
  const path = [goal];
  for (let p = end; p; p = p.parent) path.unshift({ x: p.x, z: p.z });
  let current = start;
  while (path.length) {
    let i = path.length - 1;
    while (i > 0 && !clear(current, path[i])) i--;
    const next = path[i];
    await segment(c, next.x, next.z);
    current = next;
    path.splice(0, i + 1);
  }
}

try {
  const host = await connect(await post('/rooms', { name: 'Chest QA' }));
  const friend = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Chest Rival QA' }),
  );
  host.send({ type: 'start' });
  await host.until(
    (r) => r.phase === 'playing' && r.players.every((p) => !p.dropping),
  );
  assert.equal(host.room.loot.filter((used) => !used).length, 31);
  assert.equal(host.room.chests.filter((c) => c.active).length, 8);
  // Both castles have guaranteed treasure. Follow the open central path to the southern doorway.
  await walk(host, 0, -23);
  await walk(host, 29.7, -23);
  await walk(host, 29.7, -35.95);
  host.send({ type: 'chest', index: 0 });
  await host.until((r) => r.chests[0].openedAt > 0);
  await friend.until((r) => r.chests[0].openedAt > 0 && r.drops.length === 2);
  host.send({ type: 'chest', index: 0 });
  await wait(200);
  assert.equal(host.room.drops.length, 2);
  const gun = host.room.drops[0];
  await walk(host, gun.x, gun.z);
  host.send({ type: 'pickup', index: 63 });
  await host.until((r) => r.drops[0].used);
  await friend.until((r) => r.drops[0].used);
  assert.equal(mine(host).tiers[gun.kind], gun.rarity);
  friend.send({ type: 'leave' });
  await host.until((r) => r.phase === 'finished');
  const late = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Next Drop QA' }),
  );
  await host.until((r) =>
    r.players.some((p) => p.id === late.session.playerId),
  );
  assert.ok(mine(late).spectator);
  late.send({ type: 'ready' });
  await host.until(
    (r) => r.players.find((p) => p.id === late.session.playerId)?.ready,
  );
  host.send({ type: 'ready' });
  await host.until((r) => r.phase === 'countdown' && r.round === 2);
  await late.until((r) => r.phase === 'countdown' && r.round === 2);
  assert.ok(host.room.chests.every((c) => !c.openedAt));
  assert.equal(host.room.drops.length, 0);
  assert.ok(
    host.room.players.every((p) => !p.ready && p.dropping && !p.spectator),
  );
  console.log(
    'PASS castle entry, shared chest opening/pickup, late join, and ready-up rematch across live sockets',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
