import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { activeRoom, ACTIVE_ROOMS_QUERY } from './directory.ts';
import {
  addMember,
  advance,
  createMember,
  createRoom,
  GameError,
  type Room,
} from './model.ts';
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (error) =>
  console.error('Database connection interrupted', error.message),
);
export const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export async function listRooms() {
  const now = Date.now();
  const { rows } = await pool.query(ACTIVE_ROOMS_QUERY, [now - 15000]);
  return rows.map((row) => activeRoom(row.state as Room, now)).filter(Boolean);
}
export async function transact<T>(
  code: string,
  fn: (room: Room) => T,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT state FROM lastlight_rooms WHERE code=$1 AND expires_at>NOW() FOR UPDATE',
      [code],
    );
    if (!rows[0]) throw new GameError('Room not found or expired.', 404);
    const room = rows[0].state as Room;
    const result = fn(room);
    await client.query(
      'UPDATE lastlight_rooms SET state=$2::jsonb,revision=revision+1 WHERE code=$1',
      [code, JSON.stringify(room)],
    );
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function create(name: string) {
  const token = randomBytes(32).toString('base64url'),
    id = randomUUID(),
    now = Date.now();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = randomBytes(6),
      code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    const room = createRoom(
      code,
      createMember(id, name, hash(token), now),
      now,
    );
    const result = await pool.query(
      "INSERT INTO lastlight_rooms(code,state,expires_at) VALUES($1,$2::jsonb,NOW()+INTERVAL '2 hours') ON CONFLICT DO NOTHING",
      [code, JSON.stringify(room)],
    );
    if (result.rowCount) return { code, playerId: id, token };
  }
  throw new GameError('Could not create a room. Try again.', 503);
}
export async function join(code: string, name: string) {
  const token = randomBytes(32).toString('base64url'),
    id = randomUUID();
  await transact(code, (room) => {
    advance(room, Date.now());
    addMember(room, createMember(id, name, hash(token), Date.now()));
  });
  return { code, playerId: id, token };
}
export async function authorize(code: string, id: string, token: string) {
  if (
    !/^[A-Z2-9]{6}$/.test(code) ||
    !id ||
    token.length < 32 ||
    token.length > 100
  )
    throw new GameError('Invalid session.', 401);
  return transact(code, (room) => {
    const member = room.players.find(
      (p) => p.id === id && p.tokenHash === hash(token),
    );
    if (!member) throw new GameError('Your room session has ended.', 401);
    member.lastSeen = Date.now();
    member.connected = true;
    return member.id;
  });
}
export async function rateLimit(ip: string) {
  const key = hash(ip + Math.floor(Date.now() / 60000));
  const { rows } = await pool.query(
    "INSERT INTO lastlight_rate_limits(key,count,expires_at) VALUES($1,1,NOW()+INTERVAL '2 minutes') ON CONFLICT(key) DO UPDATE SET count=lastlight_rate_limits.count+1 RETURNING count",
    [key],
  );
  if (rows[0].count > 20)
    throw new GameError(
      'Too many room requests. Wait a minute and try again.',
      429,
    );
}
