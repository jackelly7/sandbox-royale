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
let code;
try {
  const host = await connect(await post('/rooms', { name: 'Sandbox QA' }));
  code = host.session.code;
  const list = await (await fetch(endpoint + '/rooms')).json();
  const row = list.rooms.find((r) => r.code === code);
  assert.ok(row && row.phase === 'waiting' && row.joinable);
  assert.ok(!JSON.stringify(row).includes('token'));
  const b = await connect(
    await post(`/rooms/${code}/join`, { name: 'Red One' }),
  );
  const c = await connect(
    await post(`/rooms/${code}/join`, { name: 'Green Two' }),
  );
  const d = await connect(
    await post(`/rooms/${code}/join`, { name: 'Red Two' }),
  );
  host.send({ type: 'mode', mode: 'duos' });
  await Promise.all(
    [host, b, c, d].map((client) => client.until((r) => r.mode === 'duos')),
  );
  assert.equal(mine(host).team, mine(c).team);
  await b.until((r) => r.mode === 'duos');
  assert.equal(mine(b).team, mine(d).team);
  host.send({ type: 'start' });
  await host.until(
    (r) => r.phase === 'playing' && r.players.every((p) => !p.dropping),
  );
  host.send({ type: 'mark', point: [0, 1, 58], label: 'Loot' });
  await c.until((r) =>
    r.events.some(
      (e) => e.type === 'mark' && e.player === host.session.playerId,
    ),
  );
  assert.ok(!b.room.events.some((e) => e.type === 'mark'));
  console.log(
    'PASS active directory, four-player Duos, and private teammate pings',
  );
  assert.ok(host.room.zone?.next.radius < host.room.storm);
  assert.equal(host.room.zone.stage, 'waiting');
  await walk(host, 5, 62);
  host.send({ type: 'pickup', index: 19 });
  await host.until(() => mine(host).owned[0]);
  await Promise.all([
    (async () => {
      await walk(host, 6, 40);
      await walk(c, 0, 50);
      c.send({ type: 'mantle', pose: { ...mine(c), yaw: 0 } });
      await c.until(() => (mine(c).mantleUntil ?? 0) > 0);
      await c.until(() => mine(c).mantleUntil === 0);
      assert.ok(mine(c).y > 4, 'Mantle reaches the cover top');
      c.send({
        type: 'pose',
        pose: { ...mine(c), crouching: true, sprinting: false },
      });
      await c.until(() => mine(c).crouching === true);
      console.log('PASS sprint movement, server mantle, and crouching');
    })(),
    ...[b, d].map(async (player) => {
      for (const [x, z] of [
        [12, -67],
        [12, -44],
        [12, -35],
        [6, -35],
        [7, -6],
        [6, 40],
        [player === b ? 16 : 14, player === b ? 40 : 42],
      ]) {
        await walk(player, x, z);
        if (player === b && z === -6) {
          b.send({ type: 'pickup', index: 2 });
          await b.until(() => mine(b).owned[2]);
        }
      }
    }),
  ]);
  const fire = (target) => {
    const p = mine(host),
      t = mine(target);
    host.send({
      type: 'shoot',
      pose: {
        ...p,
        yaw: Math.atan2(-(t.x - p.x), -(t.z - p.z)),
        pitch: Math.atan2(
          t.y - 1.7 + (t.downed ? 0.45 : 1.3) - p.y,
          Math.hypot(t.x - p.x, t.z - p.z),
        ),
      },
      aiming: true,
    });
  };
  for (let n = 0; n < 14 && !mine(b).downed; n++) {
    fire(b);
    await wait(250);
  }
  await b.until(() => mine(b).downed);
  assert.equal(mine(b).rank, 0);
  assert.equal(mine(host).kills, 0);
  d.send({ type: 'revive', target: b.session.playerId });
  await d.until(() => mine(d).reviving === b.session.playerId);
  await b.until(() => !mine(b).downed && mine(b).health === 50);
  console.log(
    'PASS real weapon downs enemy, teammate channels revive, shared health restores',
  );
  for (let n = 0; n < 18 && mine(b).health > 0; n++) {
    fire(b);
    await wait(170);
  }
  await b.until(() => mine(b).health === 0);
  await host.until((r) =>
    r.drops?.some((drop) => drop.kind === 2 && !drop.used),
  );
  const dropIndex = host.room.drops.findIndex(
    (drop) => drop.kind === 2 && !drop.used,
  );
  assert.ok(dropIndex >= 0, 'Eliminated player drops their sniper');
  const dropped = host.room.drops[dropIndex];
  await walk(host, 16, 40);
  host.send({ type: 'pickup', index: host.room.loot.length + dropIndex });
  await host.until(() => mine(host).owned[2]);
  assert.equal(mine(host).tiers[2], dropped.rarity);
  console.log(
    'PASS real elimination drops transferable weapon rarity and ammo',
  );
  const late = await connect(
    await post(`/rooms/${code}/join`, { name: 'Late Visitor' }),
  );
  assert.equal(mine(late).spectator, true);
  assert.equal(mine(late).health, 0);
  b.send({ type: 'leave' });
  d.send({ type: 'leave' });
  await host.until((r) => r.phase === 'finished');
  assert.equal(host.room.winningTeam, mine(host).team);
  host.send({ type: 'rematch' });
  await host.until((r) => r.phase === 'waiting');
  host.send({ type: 'start' });
  await late.until((r) => r.phase === 'countdown' && !mine(late).spectator);
  assert.equal(mine(late).health, 100);
  console.log(
    'PASS late visitor spectates, duo wins together, visitor joins next parachute drop',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(700);
  clients.forEach((c) => c.ws.close());
}
const finalList = await (await fetch(endpoint + '/rooms')).json();
assert.ok(!finalList.rooms.some((r) => r.code === code));
console.log('PASS empty rooms disappear from the active directory');
