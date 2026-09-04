import assert from 'node:assert/strict';
import WebSocket from 'ws';
const url = process.env.MULTIPLAYER_TEST_URL || 'http://localhost:3001';
async function post(path, data) {
  const res = await fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${body.error}`);
  return body;
}
async function connect(session, endpoint = url) {
  const socket = new WebSocket(endpoint.replace(/^http/, 'ws') + '/ws');
  const messages = [];
  let readyResolve;
  const ready = new Promise((r) => {
    readyResolve = r;
  });
  socket.on('open', () =>
    socket.send(JSON.stringify({ type: 'auth', ...session })),
  );
  socket.on('message', (raw) => {
    const m = JSON.parse(
      Buffer.isBuffer(raw)
        ? raw.toString()
        : Buffer.from(
            raw instanceof ArrayBuffer ? raw : Buffer.concat(raw),
          ).toString(),
    );
    messages.push(m);
    if (m.type === 'ready') readyResolve();
  });
  socket.on('error', () => {});
  await Promise.race([
    ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('WebSocket auth timeout')), 15000),
    ),
  ]);
  return {
    socket,
    messages,
    send: (command) => socket.send(JSON.stringify(command)),
    wait: async (pred) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const match = messages.find(pred);
        if (match) return match;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('Snapshot timeout');
    },
  };
}
const aSession = await post('/rooms', { name: 'Network Test Host' }),
  bSession = await post(`/rooms/${aSession.code}/join`, {
    name: 'Network Test Friend',
  });
let a, b, c;
try {
  [a, b] = await Promise.all([
    connect(aSession),
    connect(bSession, process.env.SECONDARY_TEST_URL || url),
  ]);
  const roster = await a.wait(
    (m) => m.type === 'snapshot' && m.room.players.length === 2,
  );
  assert.equal(roster.room.host, aSession.playerId);
  console.log('PASS two authenticated players see the same roster');
  b.send({ type: 'start' });
  await b.wait((m) => m.type === 'error' && m.status === 403);
  console.log('PASS non-host start rejected');
  a.send({ type: 'start' });
  const [as, bs] = await Promise.all([
    a.wait((m) => m.type === 'snapshot' && m.room.phase === 'countdown'),
    b.wait((m) => m.type === 'snapshot' && m.room.phase === 'countdown'),
  ]);
  assert.equal(as.room.startAt, bs.room.startAt);
  console.log('PASS shared countdown across sockets');
  const playing = await a.wait(
    (m) => m.type === 'snapshot' && m.room.phase === 'playing',
  );
  const p = playing.room.players.find((p) => p.id === aSession.playerId);
  a.send({ type: 'pose', pose: { ...p, z: p.z - 0.4 } });
  await b.wait(
    (m) =>
      m.type === 'snapshot' &&
      m.room.players.some(
        (other) =>
          other.id === aSession.playerId &&
          Math.abs(other.z - (p.z - 0.4)) < 0.01,
      ),
  );
  console.log('PASS movement propagates to other player');
  b.socket.close();
  c = await connect(bSession, process.env.SECONDARY_TEST_URL || url);
  await c.wait((m) => m.type === 'snapshot' && m.room.phase === 'playing');
  console.log('PASS reconnect rejoins the existing match');
  c.send({ type: 'leave' });
  const won = await a.wait(
    (m) => m.type === 'snapshot' && m.room.phase === 'finished',
  );
  assert.equal(won.room.winner, aSession.playerId);
  console.log('PASS one shared winner after opponent leaves');
  a.send({ type: 'rematch' });
  await a.wait(
    (m) =>
      m.type === 'snapshot' && m.room.phase === 'waiting' && m.room.round === 1,
  );
  console.log('PASS rematch returns the same room to waiting');
} finally {
  for (const client of [a, b, c])
    if (client) {
      if (client.socket.readyState === WebSocket.OPEN)
        client.send({ type: 'leave' });
      client.socket.close();
    }
}
process.exit(0);
