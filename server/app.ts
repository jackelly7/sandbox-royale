import {
  cleanName,
  applyCommand,
  advance,
  parseCommand,
  snapshot,
  GameError,
} from './model.ts';
import { authorize, create, join, pool, rateLimit, transact } from './store.ts';
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
const clients = new Map<
  SocketLike,
  { code: string; id: string; lastMessage: number }
>();
const origins = new Set([
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
  if (socket.readyState === 1 && socket.bufferedAmount < 256000)
    socket.send(JSON.stringify(data));
}
export function attachSocket(socket: SocketLike) {
  let authenticated = false,
    closed = false,
    working = false,
    lastPose: unknown = null;
  const queue: unknown[] = [];
  let count = 0,
    windowAt = Date.now();
  const timeout = setTimeout(() => {
    if (!authenticated) socket.close(4001, 'Authentication required');
  }, 5000);
  socket.addEventListener('close', () => {
    closed = true;
    clearTimeout(timeout);
    clients.delete(socket);
  });
  socket.addEventListener('error', () => {
    socket.close();
  });
  const drain = async () => {
    if (working || closed) return;
    working = true;
    try {
      while (!closed && (queue.length || lastPose)) {
        const data = queue.length ? queue.shift() : lastPose;
        if (!queue.length && data === lastPose) lastPose = null;
        if (!authenticated) {
          const auth = data as {
            type?: string;
            code?: string;
            playerId?: string;
            token?: string;
          };
          if (
            auth?.type !== 'auth' ||
            typeof auth.code !== 'string' ||
            typeof auth.playerId !== 'string' ||
            typeof auth.token !== 'string'
          )
            throw new GameError('Authentication required.', 401);
          await authorize(auth.code, auth.playerId, auth.token);
          authenticated = true;
          clearTimeout(timeout);
          clients.set(socket, {
            code: auth.code,
            id: auth.playerId,
            lastMessage: Date.now(),
          });
          send(socket, { type: 'ready' });
          continue;
        }
        const session = clients.get(socket);
        if (!session) return;
        session.lastMessage = Date.now();
        const command = parseCommand(data);
        await transact(session.code, (room) =>
          applyCommand(room, session.id, command, Date.now()),
        );
        if (command.type === 'leave') {
          send(socket, { type: 'left' });
          socket.close(1000, 'Left room');
        }
      }
    } catch (error) {
      const err =
        error instanceof GameError
          ? error
          : new GameError('Connection interrupted. Reconnecting...', 503);
      send(socket, { type: 'error', message: err.message, status: err.status });
      if (err.status === 401 || err.status === 404 || err.status >= 500)
        socket.close(4001, err.message.slice(0, 100));
    } finally {
      working = false;
    }
  };
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data.length > 4096) {
      socket.close(4002, 'Invalid message');
      return;
    }
    if (Date.now() - windowAt > 1000) {
      count = 0;
      windowAt = Date.now();
    }
    if (++count > 70) {
      socket.close(4008, 'Too many messages');
      return;
    }
    try {
      const data = JSON.parse(event.data) as { type?: string };
      if (authenticated && data.type === 'pose') lastPose = data;
      else {
        if (queue.length > 16) {
          socket.close(4008, 'Too many commands');
          return;
        }
        queue.push(data);
      }
      void drain();
    } catch {
      socket.close(4002, 'Invalid JSON');
    }
  });
}
let polling = false;
const poll = setInterval(() => {
  if (polling || clients.size === 0) return;
  polling = true;
  const codes = [...new Set([...clients.values()].map((s) => s.code))];
  void Promise.all(
    codes.map(async (code) => {
      try {
        const state = await transact(code, (room) => {
          advance(room, Date.now());
          return snapshot(room, Date.now());
        });
        for (const [socket, session] of clients)
          if (session.code === code) {
            if (Date.now() - session.lastMessage > 15000) {
              socket.close(4000, 'Heartbeat timeout');
              continue;
            }
            send(socket, { type: 'snapshot', room: state });
          }
      } catch (error) {
        for (const [socket, session] of clients)
          if (session.code === code) {
            send(socket, {
              type: 'error',
              message:
                error instanceof Error ? error.message : 'Room unavailable.',
            });
            socket.close(4004, 'Room unavailable');
          }
      }
    }),
  ).finally(() => {
    polling = false;
  });
}, 100);
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
