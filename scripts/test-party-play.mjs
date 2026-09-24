import { MULTIPLAYER_ORIGIN } from '../lib/game/network-config.ts';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { botPath } from '../server/bots.ts';
const endpoint = process.env.MULTIPLAYER_TEST_URL || MULTIPLAYER_ORIGIN;
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
  const path = botPath(mine(c), target, true);
  assert.ok(path.length, 'Reachable test destination');
  for (const point of path) await travel(c, point, 0.8);
  await travel(c, target, 0.8);
}
try {
  const host = await connect(await post('/rooms', { name: 'Party Host QA' }));
  const rival = await connect(
    await post(`/rooms/${host.session.code}/join`, { name: 'Party Rival QA' }),
  );
  const mate = await connect(
    await post(`/rooms/${host.session.code}/join`, {
      name: 'Party Teammate QA',
    }),
  );
  console.log(
    'Live party capability:',
    Array.isArray(host.room.teamScores),
    Boolean(host.room.votes),
  );
  host.send({ type: 'mode', mode: 'team-deathmatch' });
  await mate.until((r) => r.mode === 'team-deathmatch');
  host.send({ type: 'loadout', weapon: 1 });
  rival.send({ type: 'loadout', weapon: 2 });
  await host.until(
    (r) =>
      r.players.find((p) => p.id === rival.session.playerId).loadout === 2 &&
      mine(host).loadout === 1,
  );
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'playing' && r.now - r.startAt > 2000);
  assert.equal(mine(host).team, mine(mate).team);
  assert.notEqual(mine(host).team, mine(rival).team);
  assert.equal(mine(host).weapon, 1);
  assert.equal(mine(rival).weapon, 2);
  assert.deepEqual(host.room.teamScores, [0, 0]);
  assert.equal(host.room.storm, 51);
  await Promise.all([
    walk(host, { x: 0, z: 27 }),
    walk(rival, { x: 0, z: 22 }),
  ]);
  for (let i = 0; i < 8 && mine(rival).health > 0; i++) {
    host.send({
      type: 'shoot',
      pose: { ...mine(host), yaw: 0, pitch: 0 },
      aiming: true,
    });
    await wait(950);
  }
  await mate.until((r) => r.teamScores[mine(host).team] === 1);
  assert.equal(mine(host).kills, 1);
  assert.equal(mine(host).gunStage, 0);
  await rival.until(() => mine(rival).health > 0 && mine(rival).deaths === 1);
  assert.equal(mine(rival).weapon, 2);
  const late = await connect(
    await post(`/rooms/${host.session.code}/join`, {
      name: 'Party Late Join QA',
    }),
  );
  assert.equal(mine(late).team, mine(rival).team);
  assert.equal(mine(late).health, 100);
  assert.equal(mine(late).spectator, false);
  late.send({ type: 'leave' });
  rival.send({ type: 'leave' });
  await host.until((r) => r.phase === 'finished');
  assert.equal(host.room.winningTeam, mine(host).team);
  assert.equal(
    host.room.scores.find((s) => s.id === mate.session.playerId).wins,
    1,
  );
  host.send({ type: 'vote', mode: 'gun-game' });
  mate.send({ type: 'vote', mode: 'gun-game' });
  await host.until((r) => r.votes?.[mate.session.playerId] === 'gun-game');
  host.send({ type: 'ready' });
  mate.send({ type: 'ready' });
  await mate.until(
    (r) => r.phase === 'countdown' && r.round === 2 && r.mode === 'gun-game',
  );
  assert.equal(mate.room.code, host.session.code);
  assert.equal(
    mate.room.scores.find((s) => s.id === host.session.playerId).wins,
    1,
  );
  assert.equal(mine(mate).weapon, 3);
  console.log(
    'PASS live Team Deathmatch loadouts, team scoring, respawn, balanced late join, shared victory, mode voting and same-room countdown with session wins',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    try {
      if (c.ws.readyState === 1) c.send({ type: 'leave' });
    } catch {}
  }
  await wait(100);
  clients.forEach((c) => c.ws.close());
}
