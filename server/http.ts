import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  addMember,
  advance,
  applyCommand,
  cleanName,
  createMember,
  createRoom,
  GameError,
  parseCommand,
  snapshot,
  type Room,
} from './model.ts';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
type Action = { seq: number; command: unknown };
export async function multiplayerRequest(
  request: Request,
  databaseUrl: string,
) {
  const sql = neon(databaseUrl);
  const now = Date.now();
  async function change<T>(code: string, fn: (room: Room) => T) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const rows = await sql.query(
        'SELECT state,revision FROM lastlight_rooms WHERE code=$1 AND expires_at>NOW()',
        [code],
      );
      if (!rows[0]) throw new GameError('Room not found or expired.', 404);
      const row = rows[0] as { state: Room; revision: number };
      const result = fn(row.state);
      const updated = await sql.query(
        'UPDATE lastlight_rooms SET state=$1::jsonb,revision=revision+1 WHERE code=$2 AND revision=$3 RETURNING revision',
        [JSON.stringify(row.state), code, row.revision],
      );
      if (updated.length) return result;
      await new Promise((resolve) =>
        setTimeout(resolve, 10 + Math.random() * 20),
      );
    }
    throw new GameError('The room is busy. Reconnecting...', 503);
  }
  try {
    if (request.method !== 'POST')
      return Response.json({ error: 'Use POST.' }, { status: 405 });
    if (Number(request.headers.get('content-length') || 0) > 16000)
      throw new GameError('Request too large.', 413);
    const raw = await request.text();
    if (raw.length > 16000) throw new GameError('Request too large.', 413);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new GameError('Invalid request.');
    }
    if (!data || typeof data !== 'object')
      throw new GameError('Invalid request.');
    if (data.type === 'create' || data.type === 'join') {
      const name = cleanName(data.name),
        ip =
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0] ||
          'unknown';
      const rate = await sql.query(
        "INSERT INTO lastlight_rate_limits(key,count,expires_at) VALUES($1,1,NOW()+INTERVAL '2 minutes') ON CONFLICT(key) DO UPDATE SET count=lastlight_rate_limits.count+1 RETURNING count",
        [hash(ip + Math.floor(now / 60000))],
      );
      if (rate[0].count > 20)
        throw new GameError('Too many room requests. Wait a minute.', 429);
      const token = randomBytes(32).toString('base64url'),
        playerId = randomUUID(),
        member = createMember(playerId, name, hash(token), now);
      if (data.type === 'join') {
        const code =
          typeof data.code === 'string' ? data.code.toUpperCase() : '';
        if (!/^[A-Z2-9]{6}$/.test(code))
          throw new GameError('Enter a six-character room code.');
        await change(code, (room) => {
          advance(room, Date.now());
          addMember(room, member);
        });
        return Response.json({ code, playerId, token }, { status: 201 });
      }
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from(
            randomBytes(6),
            (b) => alphabet[b % alphabet.length],
          ).join(''),
          room = createRoom(code, member, now);
        const inserted = await sql.query(
          "INSERT INTO lastlight_rooms(code,state,expires_at) VALUES($1,$2::jsonb,NOW()+INTERVAL '2 hours') ON CONFLICT DO NOTHING RETURNING code",
          [code, JSON.stringify(room)],
        );
        if (inserted.length) {
          // Expiration cleanup is bounded to room creation rather than every frame.
          await sql.query('DELETE FROM lastlight_rooms WHERE expires_at<NOW()');
          await sql.query(
            'DELETE FROM lastlight_rate_limits WHERE expires_at<NOW()',
          );
          return Response.json({ code, playerId, token }, { status: 201 });
        }
      }
      throw new GameError('Could not create a room. Try again.', 503);
    }
    if (data.type !== 'sync') throw new GameError('Invalid request.');
    const { code, playerId, token } = data;
    if (
      typeof code !== 'string' ||
      !/^[A-Z2-9]{6}$/.test(code) ||
      typeof playerId !== 'string' ||
      typeof token !== 'string' ||
      token.length > 100
    )
      throw new GameError('Invalid room session.', 401);
    const tokenHash = hash(token);
    const actions = Array.isArray(data.actions)
      ? (data.actions.slice(0, 16) as Action[])
      : [];
    const found = await sql.query(
      'SELECT state FROM lastlight_rooms WHERE code=$1 AND expires_at>NOW()',
      [code],
    );
    if (!found[0]) throw new GameError('Room not found or expired.', 404);
    let room = found[0].state as Room;
    const authenticated = room.players.find(
      (p) => p.id === playerId && p.tokenHash === tokenHash,
    );
    if (!authenticated || authenticated.lastSeen === 0)
      throw new GameError('Your room session has ended.', 401);
    const commands = actions.map((action) => {
      if (!action || !Number.isSafeInteger(action.seq) || action.seq < 1)
        throw new GameError('Invalid command.');
      return { seq: action.seq, command: parseCommand(action.command) };
    });
    commands.push({ seq: 0, command: { type: 'ping' } });
    await sql.query(
      `INSERT INTO lastlight_commands(code,player_id,seq,command,seen_at)
      SELECT $1,$2,(entry->>'seq')::bigint,entry->'command',$4 FROM jsonb_array_elements($3::jsonb) AS entry
      ON CONFLICT(code,player_id,seq) DO UPDATE SET seen_at=EXCLUDED.seen_at`,
      [code, playerId, JSON.stringify(commands), Date.now()],
    );
    const lease = randomUUID();
    const claimed = await sql.query(
      "UPDATE lastlight_rooms SET lease_token=$2,lease_until=NOW()+INTERVAL '1 second' WHERE code=$1 AND lease_until<NOW() RETURNING state,revision",
      [code, lease],
    );
    if (claimed[0]) {
      room = claimed[0].state as Room;
      const revision = claimed[0].revision as number;
      const queued = (await sql.query(
        'SELECT id,player_id,seq,command,seen_at FROM lastlight_commands WHERE code=$1 ORDER BY id LIMIT 256',
        [code],
      )) as {
        id: string;
        player_id: string;
        seq: string;
        command: unknown;
        seen_at: string;
      }[];
      for (const entry of queued) {
        const p = room.players.find((p) => p.id === entry.player_id);
        if (p && p.lastSeen !== 0) {
          p.lastSeen = Math.max(p.lastSeen, Number(entry.seen_at));
          p.connected = true;
        }
      }
      for (const entry of queued) {
        const p = room.players.find((p) => p.id === entry.player_id),
          seq = Number(entry.seq);
        if (!p || p.lastSeen === 0 || seq === 0 || seq <= p.lastCommand)
          continue;
        const command = parseCommand(entry.command);
        if (command.type !== 'pose' && command.type !== 'ping')
          p.commandError = '';
        try {
          applyCommand(room, p.id, command, Date.now());
        } catch (e) {
          if (e instanceof GameError) p.commandError = e.message;
          else throw e;
        }
        p.lastCommand = seq;
      }
      advance(room, Date.now());
      const committed = await sql.query(
        "UPDATE lastlight_rooms SET state=$1::jsonb,revision=revision+1,lease_until='1970-01-01' WHERE code=$2 AND lease_token=$3 AND revision=$4 RETURNING revision",
        [JSON.stringify(room), code, lease, revision],
      );
      if (committed.length && queued.length)
        await sql.query(
          'DELETE FROM lastlight_commands WHERE code=$1 AND id<=$2',
          [code, queued[queued.length - 1].id],
        );
      if (!committed.length) {
        await sql.query(
          "UPDATE lastlight_rooms SET lease_until='1970-01-01' WHERE code=$1 AND lease_token=$2",
          [code, lease],
        );
        const latest = await sql.query(
          'SELECT state FROM lastlight_rooms WHERE code=$1',
          [code],
        );
        room = latest[0].state as Room;
      }
    }
    const own = room.players.find((p) => p.id === playerId);
    const result = {
      room: snapshot(room, Date.now()),
      ack: own?.lastCommand ?? Math.max(0, ...actions.map((a) => a.seq)),
      error: own?.commandError ?? '',
    };
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const err =
      error instanceof GameError
        ? error
        : new GameError(
            'The room service is unavailable. Reconnecting...',
            503,
          );
    if (!(error instanceof GameError))
      console.error(
        'Multiplayer request failed',
        error instanceof Error ? error.message : 'Unknown',
      );
    return Response.json(
      { error: err.message },
      { status: err.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
