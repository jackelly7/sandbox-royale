import assert from 'node:assert/strict';
import WebSocket from 'ws';
const endpoint =
  process.env.MULTIPLAYER_TEST_URL ||
  'https://br-frosty-surf-a5j1d8vg-lastlight.compute.c-1.us-east-2.aws.neon.tech';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clients = [];
async function connect(session) {
  const ws = new WebSocket(endpoint.replace(/^http/, 'ws') + '/ws', {
    origin: process.env.SITE_TEST_URL || 'http://localhost:3000',
  });
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
async function site(body) {
  const response = await fetch(
    (process.env.SITE_TEST_URL || 'http://localhost:3000') + '/api/multiplayer',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
  return data;
}
try {
  const host = await connect(
    await site({ type: 'create', name: 'Homepage QA' }),
  );
  const code = host.session.code;
  const list = await site({ type: 'list' });
  assert.ok(list.rooms.some((r) => r.code === code));
  await connect(await site({ type: 'join', code, name: 'Join QA' }));
  host.send({ type: 'start' });
  await host.until((r) => r.phase === 'countdown');
  const late = await connect(
    await site({ type: 'join', code, name: 'Late QA' }),
  );
  assert.ok(mine(late).spectator && mine(late).health === 0);
  console.log(
    'PASS homepage API lists rooms and joins waiting and in-progress games',
  );
} finally {
  for (const c of clients) {
    clearInterval(c.heartbeat);
    if (c.ws.readyState === 1) c.send({ type: 'leave' });
  }
  await wait(700);
  clients.forEach((c) => c.ws.close());
}
