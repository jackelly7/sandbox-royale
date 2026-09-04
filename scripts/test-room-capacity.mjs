import assert from 'node:assert/strict';
const endpoint =
  process.env.MULTIPLAYER_TEST_URL || 'http://localhost:3000/api/multiplayer';
const clients = [];
const timings = [];
let conflicts = 0;
async function request(body) {
  const start = performance.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  timings.push(performance.now() - start);
  if (res.status === 503) conflicts++;
  return { status: res.status, data };
}
try {
  const created = await request({ type: 'create', name: 'Capacity Host' });
  assert.equal(created.status, 201);
  clients.push(created.data);
  for (let i = 1; i < 8; i++) {
    const joined = await request({
      type: 'join',
      code: clients[0].code,
      name: `Capacity ${i}`,
    });
    assert.equal(joined.status, 201);
    clients.push(joined.data);
  }
  const ninth = await request({
    type: 'join',
    code: clients[0].code,
    name: 'Overflow',
  });
  assert.equal(ninth.status, 409);
  await Promise.all(
    clients.map(async (session) => {
      for (let i = 0; i < 10; i++) {
        const res = await request({ type: 'sync', ...session, actions: [] });
        assert.equal(res.status, 200);
        assert.equal(res.data.room.players.length, 8);
        await new Promise((r) => setTimeout(r, 100));
      }
    }),
  );
  timings.sort((a, b) => a - b);
  console.log(
    `PASS eight clients synchronized; ninth rejected; ${conflicts} failed conflict retries; median request ${Math.round(timings[Math.floor(timings.length * 0.5)])}ms, p95 ${Math.round(timings[Math.floor(timings.length * 0.95)])}ms`,
  );
} finally {
  await Promise.all(
    clients.map((session) =>
      request({
        type: 'sync',
        ...session,
        actions: [{ seq: 1, command: { type: 'leave' } }],
      }).catch(() => {}),
    ),
  );
}
