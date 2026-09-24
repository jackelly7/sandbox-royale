import {
  cleanName,
  applyCommand,
  advance,
  parseCommand,
  snapshot,
  forViewer,
  GameError,
} from './model.ts';
import {
  authorize,
  create,
  join,
  listRooms,
  pool,
  rateLimit,
  transact,
} from './store.ts';
export type SocketLike = {
  readyState: number;
  bufferedAmount: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (
    name: string,
    listener: (event: { data?: unknown }) => void,
  ) => void;
};
type Session = {
  code: string;
  id: string;
  lastMessage: number;
  actions: Map<number, ReturnType<typeof parseCommand>>;
  legacySequence: number;
};
const clients = new Map<SocketLike, Session>();
const origins = new Set([
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  'https://lastlight-battle-royale.jack794585.chatgpt.site',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
const json = (data: unknown, status = 200) => Response.json(data, { status });
export function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origins.has(origin);
}
function send(socket: SocketLike, data: unknown) {
  if (socket.readyState === 1 && socket.bufferedAmount < 128000)
    socket.send(JSON.stringify(data));
}
export function attachSocket(socket: SocketLike) {
  let authenticating = false;
  let count = 0,
    windowAt = Date.now();
  const timeout = setTimeout(() => {
    if (!clients.has(socket)) socket.close(4001, 'Authentication required');
  }, 8000);
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    clients.delete(socket);
  });
  socket.addEventListener('error', () => socket.close());
  socket.addEventListener('message', (message) => {
    if (typeof message.data !== 'string' || message.data.length > 16000) {
      socket.close(4002, 'Invalid message');
      return;
    }
    if (Date.now() - windowAt >= 1000) {
      count = 0;
      windowAt = Date.now();
    }
    if (++count > 70) {
      socket.close(4008, 'Too many messages');
      return;
    }
    try {
      const data = JSON.parse(message.data);
      const session = clients.get(socket);
      if (!session) {
        if (authenticating) return;
        if (
          data.type !== 'auth' ||
          typeof data.code !== 'string' ||
          typeof data.playerId !== 'string' ||
          typeof data.token !== 'string'
        )
          throw new GameError('Authentication required.', 401);
        authenticating = true;
        void authorize(data.code, data.playerId, data.token)
          .then(() => {
            if (socket.readyState !== 1) return;
            clearTimeout(timeout);
            clients.set(socket, {
              code: data.code,
              id: data.playerId,
              lastMessage: Date.now(),
              actions: new Map(),
              legacySequence: 0,
            });
            send(socket, { type: 'ready' });
          })
          .catch(() => socket.close(4001, 'Room session unavailable'));
        return;
      }
      session.lastMessage = Date.now();
      if (data.type === 'ping') {
        send(socket, { type: 'pong', at: data.at });
        return;
      }
      const actions =
        data.type === 'commands' && Array.isArray(data.actions)
          ? data.actions.slice(0, 24)
          : [{ seq: ++session.legacySequence, command: data }];
      for (const action of actions) {
        if (!Number.isSafeInteger(action.seq) || action.seq < 1)
          throw new GameError('Invalid command sequence');
        session.actions.set(action.seq, parseCommand(action.command));
      }
      if (session.actions.size > 96)
        socket.close(4008, 'Too many queued commands');
    } catch (error) {
      send(socket, {
        type: 'error',
        message: error instanceof Error ? error.message : 'Invalid message',
      });
    }
  });
}
// One local room batch per tick, shared under a Postgres row lock. Concurrent
// isolates see the same authoritative match, without a database trip per input.
const working = new Set<string>();
const poll = setInterval(() => {
  const codes = new Set([...clients.values()].map((s) => s.code));
  for (const code of codes) {
    if (working.has(code)) continue;
    working.add(code);
    const batch = [...clients.entries()]
      .filter(([, s]) => s.code === code)
      .map(([socket, session]) => ({
        socket,
        session,
        actions: [...session.actions.entries()].sort((a, b) => a[0] - b[0]),
      }));
    void transact(code, (room) => {
      const now = Date.now();
      const errors = new Map<string, { message: string; status: number }>();
      for (const { session } of batch) {
        const p = room.players.find((p) => p.id === session.id);
        if (p && p.lastSeen !== 0)
          p.lastSeen = Math.max(p.lastSeen, session.lastMessage);
      }
      for (const { session, actions } of batch) {
        for (const [seq, command] of actions) {
          const p = room.players.find((p) => p.id === session.id);
          if (!p || p.lastSeen === 0 || seq <= p.lastCommand) continue;
          try {
            applyCommand(room, p.id, command, now);
          } catch (e) {
            errors.set(p.id, {
              message: e instanceof Error ? e.message : 'Invalid command',
              status: e instanceof GameError ? e.status : 400,
            });
          }
          p.lastCommand = seq;
        }
      }
      advance(room, now);
      return {
        room: snapshot(room, now),
        acks: new Map(room.players.map((p) => [p.id, p.lastCommand])),
        errors,
      };
    })
      .then((result) => {
        for (const { socket, session, actions } of batch) {
          for (const [seq] of actions) session.actions.delete(seq);
          if (Date.now() - session.lastMessage > 15000) {
            socket.close(4000, 'Heartbeat timeout');
            continue;
          }
          const error = result.errors.get(session.id);
          if (error) send(socket, { type: 'error', ...error });
          send(socket, {
            type: 'snapshot',
            room: forViewer(result.room, session.id),
            ack:
              result.acks.get(session.id) ??
              Math.max(0, ...actions.map((a) => a[0])),
          });
          if (actions.some(([, command]) => command.type === 'leave'))
            socket.close(1000, 'Left room');
        }
      })
      .catch((error) => {
        for (const { socket } of batch) {
          send(socket, {
            type: 'error',
            message:
              error instanceof GameError
                ? error.message
                : 'Connection interrupted. Reconnecting...',
          });
          socket.close(4004, 'Room unavailable');
        }
      })
      .finally(() => working.delete(code));
  }
}, 50);
poll.unref?.();
const cleanup = setInterval(() => {
  if (!clients.size) return;
  void pool
    .query('DELETE FROM lastlight_rooms WHERE expires_at<NOW()')
    .catch(() => {});
  void pool
    .query('DELETE FROM lastlight_rate_limits WHERE expires_at<NOW()')
    .catch(() => {});
}, 60000);
cleanup.unref?.();
export async function handleHttp(request: Request) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(request))
    return new Response('Origin not allowed', { status: 403 });
  let response: Response;
  try {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS')
      response = new Response(null, { status: 204 });
    else if (url.pathname === '/health')
      response = json({ ok: true, service: 'lastlight-multiplayer' });
    else if (request.method === 'GET' && url.pathname === '/rooms')
      response = json({ rooms: await listRooms() });
    else if (
      request.method === 'POST' &&
      (url.pathname === '/rooms' ||
        /^\/rooms\/[A-Z2-9]{6}\/join$/.test(url.pathname))
    ) {
      if (Number(request.headers.get('content-length') || 0) > 1024)
        throw new GameError('Request too large.', 413);
      const body = await request.text();
      if (body.length > 1024) throw new GameError('Request too large.', 413);
      const data = JSON.parse(body) as { name?: unknown };
      const name = cleanName(data.name);
      await rateLimit(
        request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      );
      response = json(
        url.pathname === '/rooms'
          ? await create(name)
          : await join(url.pathname.split('/')[2], name),
        201,
      );
    } else response = json({ error: 'Not found.' }, 404);
  } catch (error) {
    const err =
      error instanceof GameError
        ? error
        : new GameError('The room service is unavailable. Try again.', 503);
    console.error(error instanceof Error ? error.message : 'Request failed');
    response = json({ error: err.message }, err.status);
  }
  if (origin && origins.has(origin))
    response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
