import { floorAvailable, floorRarity } from '../lib/game/loot.ts';
import { floorAmmo, CHEST_SPOTS, chestDrops } from '../lib/game/chests.ts';
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
  assert.equal(host.room.loot.filter((used) => !used).length, 16);
  assert.equal(host.room.chests.filter((c) => c.active).length, 18);
  // Select a guaranteed interior chest with a lower-rarity floor counterpart.
  const chestIndex = [0, 1, 2, 3, 4, 5].find((i) => {
    const gun = chestDrops(`${host.room.code}:${host.room.round}`, i)[0];
    return MAP.loot.some(
      (l, j) =>
        floorAvailable(j) && l.kind === gun.kind && floorRarity(j) < gun.rarity,
    );
  });
  assert.ok(chestIndex !== undefined);
  const spot = CHEST_SPOTS[chestIndex];
  await walk(host, spot.x, spot.z + 2);
  host.send({ type: 'chest', index: chestIndex });
  await host.until((r) => r.chests[chestIndex].openedAt > 0);
  await friend.until(
    (r) =>
      r.chests[chestIndex].openedAt > 0 &&
      r.drops.length === floorAmmo().length + 3,
  );
  host.send({ type: 'chest', index: chestIndex });
  await wait(200);
  assert.equal(host.room.drops.length, floorAmmo().length + 3);
  const dropIndex = floorAmmo().length;
  const gun = host.room.drops[dropIndex];
  await walk(host, gun.x, gun.z);
  assert.equal(mine(host).owned[gun.kind], false);
  const ammo = host.room.drops[dropIndex + 1];
  await walk(host, ammo.x, ammo.z);
  await host.until((r) => r.drops[dropIndex + 1].used);
  assert.ok(mine(host).reserve[gun.kind] > 0);
  assert.equal(mine(host).owned[gun.kind], false);
  host.send({ type: 'pickup', index: 63 + dropIndex });
  await host.until((r) => r.drops[dropIndex].used);
  await friend.until((r) => r.drops[dropIndex].used);
  assert.equal(mine(host).tiers[gun.kind], gun.rarity);
  const lowerIndex = MAP.loot.findIndex(
    (l, i) =>
      floorAvailable(i) && l.kind === gun.kind && floorRarity(i) < gun.rarity,
  );
  assert.ok(lowerIndex >= 0);
  const lower = MAP.loot[lowerIndex];
  await walk(host, lower.x, lower.z);
  const countBefore = host.room.drops.length;
  host.send({ type: 'pickup', index: lowerIndex });
  await host.until(
    () => mine(host).tiers[gun.kind] === floorRarity(lowerIndex),
  );
  await friend.until((r) => r.loot[lowerIndex]);
  const swappedIndex = host.room.drops.findIndex(
    (d, i) =>
      i >= countBefore && d.kind === gun.kind && d.rarity === gun.rarity,
  );
  assert.ok(swappedIndex >= 0, 'The previous gun falls to the ground');
  const total = mine(host).ammo[gun.kind] + mine(host).reserve[gun.kind];
  host.send({ type: 'pickup', index: 63 + swappedIndex });
  await host.until(() => mine(host).tiers[gun.kind] === gun.rarity);
  assert.equal(
    host.room.drops.length,
    countBefore + 1,
    'Repeat swaps reuse the same ground object',
  );
  assert.equal(
    mine(host).ammo[gun.kind] + mine(host).reserve[gun.kind],
    total,
    'Swapping creates no ammo',
  );
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
  assert.equal(host.room.drops.length, floorAmmo().length);
  assert.ok(
    host.room.players.every((p) => !p.ready && p.dropping && !p.spectator),
  );
  console.log(
    'PASS castle entry, 18 chests, separate walk-over ammo, manual gun pickup, rarity downgrade/swap, late join and ready-up across live sockets',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(200);
  for (const c of clients) c.ws.close();
}
