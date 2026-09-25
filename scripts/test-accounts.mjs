// Run against a local website and local server (or set SITE_TEST_URL and ACCOUNT_SERVER_URL).
// Test identities use reserved example.com addresses; passwords/tokens are never printed.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import deployment from '../server/deployment.json' with { type: 'json' };
const site = process.env.SITE_TEST_URL || 'http://localhost:3000';
const server =
  process.env.ACCOUNT_SERVER_URL ||
  (process.env.SITE_TEST_URL ? deployment.url : 'http://localhost:3001');
const pool = new Pool({
  connectionString: process.env.MULTIPLAYER_DATABASE_URL,
});
const users = [],
  rooms = [];
async function identity(name) {
  const email = `sandbox-test-${randomBytes(8).toString('hex')}@example.com`;
  const password = randomBytes(24).toString('hex');
  let cookies = '';
  async function auth(path, body) {
    const r = await fetch(site + '/api/auth/' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Origin: site,
        Cookie: cookies,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.getSetCookie();
    if (set.length) {
      const jar = new Map(
        cookies
          .split('; ')
          .filter(Boolean)
          .map((c) => [
            c.slice(0, c.indexOf('=')),
            c.slice(c.indexOf('=') + 1),
          ]),
      );
      for (const c of set) {
        const part = c.split(';')[0],
          index = part.indexOf('=');
        jar.set(part.slice(0, index), part.slice(index + 1));
      }
      cookies = [...jar].map(([k, v]) => k + '=' + v).join('; ');
    }
    const data = await r.json();
    assert.equal(
      r.status,
      200,
      JSON.stringify({ path, error: data?.message || data?.error }),
    );
    return { data, jwt: r.headers.get('set-auth-jwt') };
  }
  const signup = await auth('sign-up/email', { name, email, password });
  users.push(signup.data.user.id);
  const session = await auth('get-session');
  assert.equal(session.data.user.id, signup.data.user.id);
  assert.ok(
    (await auth('token')).data.token,
    'Auth service issues a signed access token',
  );
  await auth('sign-out', {});
  assert.equal((await auth('get-session')).data, null);
  await auth('sign-in/email', { email, password });
  const signedIn = await auth('get-session');
  assert.equal(signedIn.data.user.id, signup.data.user.id);
  return { id: signup.data.user.id, token: (await auth('token')).data.token };
}
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(server + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  assert.equal((await api('/account')).status, 401);
  assert.equal((await api('/account', 'forged')).status, 401);
  const a = await identity('Account test A'),
    b = await identity('Account test B');
  const initial = await api('/account', a.token);
  assert.equal(initial.status, 200);
  assert.equal(initial.data.rounds, 0);
  assert.equal((await api('/account', b.token)).status, 200);
  const preferences = {
    look: 1.8,
    arenaWeapon: 4,
    muted: true,
    crosshairColor: '#abcdef',
    slots: [2, 0, 1],
  };
  assert.equal(
    (await api('/account', a.token, { preferences, accountId: a.id }, 'PUT'))
      .status,
    200,
  );
  assert.equal((await api('/account', a.token)).data.preferences.look, 1.8);
  assert.equal(
    (await api('/account', b.token, { preferences, accountId: a.id }, 'PUT'))
      .status,
    409,
  );
  assert.equal((await api('/account', b.token)).data.preferences, null);
  assert.equal(
    (await api('/account', null, { preferences, accountId: a.id }, 'PUT'))
      .status,
    401,
  );
  const created = await api('/rooms', a.token, {
    name: 'Spoof',
    accountId: b.id,
  });
  assert.equal(created.status, 201);
  rooms.push(created.data.code);
  const stored = (
    await pool.query('SELECT state FROM lastlight_rooms WHERE code=$1', rooms)
  ).rows[0].state;
  assert.equal(stored.players[0].accountId, a.id);
  assert.equal(stored.players[0].name, 'Account test A');
  assert.equal(stored.players[0].loadout, 4);
  assert.equal(
    (await api(`/rooms/${rooms[0]}/join`, a.token, { name: 'Other' })).status,
    409,
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matchId = crypto.randomUUID();
    const results = JSON.stringify([
      { matchId, accountId: a.id, mode: 'solo', wins: 1, kills: 4, deaths: 0 },
    ]);
    await client.query(
      "UPDATE lastlight_rooms SET state=jsonb_set(state,'{accountResults}',$2::jsonb) WHERE code=$1",
      [rooms[0], results],
    );
    await client.query(
      "UPDATE lastlight_rooms SET state=state-'accountResults' WHERE code=$1",
      rooms,
    );
    await client.query(
      "UPDATE lastlight_rooms SET state=jsonb_set(state,'{accountResults}',$2::jsonb) WHERE code=$1",
      [rooms[0], results],
    );
    const recorded = await client.query(
      'SELECT * FROM lastlight_results WHERE match_id=$1',
      [matchId],
    );
    assert.equal(recorded.rowCount, 1);
    assert.equal(recorded.rows[0].kills, 4);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  const stats = await api('/account', a.token);
  assert.equal(stats.data.rounds, 1);
  assert.equal(stats.data.wins, 1);
  assert.equal(stats.data.kills, 4);
  const board = await api('/account/leaderboard');
  assert.equal(board.status, 200);
  assert.ok(
    board.data.leaderboard.some(
      (row) => row.name === 'Account test A' && row.wins === 1,
    ),
  );
  assert.ok(!JSON.stringify(board.data).includes('@'));
  console.log(
    'Accounts passed: signup, logout/login, token rejection, settings isolation, verified room identity, duplicate seat rejection, atomic result deduplication, public leaderboard.',
  );
} finally {
  if (rooms.length)
    await pool.query('DELETE FROM lastlight_rooms WHERE code=ANY($1::text[])', [
      rooms,
    ]);
  if (users.length) {
    await pool.query(
      'DELETE FROM lastlight_accounts WHERE id=ANY($1::text[])',
      [users],
    );
    await pool.query('DELETE FROM neon_auth.user WHERE id=ANY($1::uuid[])', [
      users,
    ]);
  }
  await pool.end();
}
