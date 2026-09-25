import { createRemoteJWKSet, jwtVerify } from 'jose';
import deployment from './deployment.json' with { type: 'json' };
import { cleanPreferences } from '../lib/game/preferences.ts';
import { cleanName, GameError } from './model.ts';
import { pool } from './store.ts';
const issuer = new URL(deployment.auth_url).origin;
const jwks = createRemoteJWKSet(
  new URL(deployment.auth_url + '/.well-known/jwks.json'),
);
export type Account = { id: string; name: string };
export async function identify(request: Request): Promise<Account | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  try {
    if (!authorization.startsWith('Bearer ')) throw new Error();
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience: issuer,
    });
    if (!payload.sub || payload.role !== 'authenticated' || payload.banned)
      throw new Error();
    return { id: payload.sub, name: cleanName(payload.name || 'Player') };
  } catch {
    throw new GameError('Your sign-in has expired. Sign in again.', 401);
  }
}
export async function ensureAccount(account: Account) {
  await pool.query(
    `INSERT INTO lastlight_accounts(id,name) VALUES($1,$2)
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name`,
    [account.id, account.name],
  );
}
export async function accountHttp(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === '/account/leaderboard' && request.method === 'GET') {
    const { rows } = await pool.query(`SELECT a.name, COUNT(*)::int AS rounds,
      SUM(r.wins)::int AS wins, SUM(r.kills)::int AS kills, SUM(r.deaths)::int AS deaths
      FROM lastlight_results r JOIN lastlight_accounts a ON a.id=r.account_id
      GROUP BY a.id, a.name ORDER BY wins DESC, kills DESC, rounds ASC, a.id ASC LIMIT 50`);
    return Response.json({ leaderboard: rows });
  }
  if (path !== '/account' || !['GET', 'PUT'].includes(request.method))
    throw new GameError('Not found.', 404);
  const account = await identify(request);
  if (!account) throw new GameError('Sign in to view your account.', 401);
  await ensureAccount(account);
  if (request.method === 'PUT') {
    const raw = await request.text();
    if (raw.length > 4096) throw new GameError('Request too large.', 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError('Invalid settings.');
    }
    if (body?.accountId !== account.id)
      throw new GameError(
        'Your account changed. Reload before saving settings.',
        409,
      );
    if (!body?.preferences || typeof body.preferences !== 'object')
      throw new GameError('Invalid settings.');
    await pool.query(
      'UPDATE lastlight_accounts SET preferences=$2::jsonb WHERE id=$1',
      [account.id, JSON.stringify(cleanPreferences(body.preferences))],
    );
  }
  const { rows } = await pool.query(
    `SELECT a.id,a.name,a.preferences,
    COUNT(r.match_id)::int AS rounds, COALESCE(SUM(r.wins),0)::int AS wins,
    COALESCE(SUM(r.kills),0)::int AS kills, COALESCE(SUM(r.deaths),0)::int AS deaths
    FROM lastlight_accounts a LEFT JOIN lastlight_results r ON r.account_id=a.id
    WHERE a.id=$1 GROUP BY a.id`,
    [account.id],
  );
  return Response.json(rows[0]);
}
