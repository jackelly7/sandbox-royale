import assert from 'node:assert/strict';
const endpoint =
  process.env.MULTIPLAYER_TEST_URL || 'http://localhost:3000/api/multiplayer';
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.SITES_TEST_TOKEN
    ? { 'OAI-Sites-Authorization': `Bearer ${process.env.SITES_TEST_TOKEN}` }
    : {}),
};
async function post(data) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${value.error}`);
  return value;
}
const sessions = [];
const seq = new Map();
async function sync(session, commands = []) {
  let n = seq.get(session.playerId) || 0;
  const actions = commands.map((command) => ({ seq: ++n, command }));
  seq.set(session.playerId, n);
  return post({ type: 'sync', ...session, actions });
}
try {
  const host = await post({ type: 'create', name: 'HTTP Test Host' });
  sessions.push(host);
  const friend = await post({
    type: 'join',
    code: host.code,
    name: 'HTTP Test Friend',
  });
  sessions.push(friend);
  const views = await Promise.all(sessions.map((s) => sync(s)));
  assert.equal(views[0].room.players.length, 2);
  assert.equal(views[1].room.players.length, 2);
  console.log('PASS shared roster over deployed-compatible API');
  const rejected = await sync(friend, [{ type: 'start' }]);
  assert.match(rejected.error, /Only the host/);
  console.log('PASS host permissions enforced');
  let state = (await sync(host, [{ type: 'start' }])).room;
  assert.equal(state.phase, 'countdown');
  const deadline = Date.now() + 12000;
  while (state.phase === 'countdown' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    const next = await Promise.all(sessions.map((s) => sync(s)));
    state = next[0].room;
    assert.equal(next[0].room.startAt, next[1].room.startAt);
  }
  assert.equal(state.phase, 'playing');
  console.log('PASS synchronized match start');
  const p = state.players.find((p) => p.id === host.playerId);
  await sync(host, [{ type: 'pose', pose: { ...p, z: p.z - 0.4 } }]);
  const observed = (await sync(friend)).room.players.find(
    (other) => other.id === host.playerId,
  );
  assert.ok(Math.abs(observed.z - (p.z - 0.4)) < 0.01);
  console.log('PASS movement reaches another player');
  assert.equal(observed.weapon, -1);
  await sync(host, [
    { type: 'pose', pose: { ...observed, x: 3, z: 62 } },
    { type: 'pickup', index: 19 },
  ]);
  const equipped = (await sync(host)).room.players.find(
    (p) => p.id === host.playerId,
  );
  assert.equal(equipped.weapon, 0);
  assert.equal(equipped.owned[0], true);
  const shot = {
    seq: (seq.get(host.playerId) || 0) + 1,
    command: { type: 'shoot', pose: { ...equipped, weapon: 0 }, aiming: true },
  };
  seq.set(host.playerId, shot.seq);
  const once = await post({ type: 'sync', ...host, actions: [shot] }),
    twice = await post({ type: 'sync', ...host, actions: [shot] });
  assert.equal(
    once.room.players.find((p) => p.id === host.playerId).ammo[0],
    29,
  );
  assert.equal(
    twice.room.players.find((p) => p.id === host.playerId).ammo[0],
    29,
  );
  console.log('PASS retried commands never fire twice');
  const bad = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'sync',
      ...friend,
      token: 'wrong',
      actions: [],
    }),
  });
  assert.equal(bad.status, 401);
  console.log('PASS invalid session rejected');
  await sync(friend, [{ type: 'leave' }]);
  state = (await sync(host)).room;
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, host.playerId);
  console.log('PASS shared winner');
  const back = await sync(host, [{ type: 'rematch' }]);
  assert.equal(back.room.phase, 'waiting');
  console.log('PASS room supports a rematch');
} finally {
  await Promise.all(
    sessions.map((s) => sync(s, [{ type: 'leave' }]).catch(() => {})),
  );
}
