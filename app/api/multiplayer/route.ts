import { MULTIPLAYER_ORIGIN } from '../../../lib/game/network-config';
import { env } from 'cloudflare:workers';
import { multiplayerRequest } from '../../../server/http';
export async function POST(request: Request) {
  // Room discovery and membership share the same locked transactions as live
  // sockets. HTTP compare-and-swap joins can starve behind 20Hz match updates.
  if (Number(request.headers.get('content-length') || 0) > 16000)
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 16000)
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== 'object') throw new Error();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (data.type === 'create' || data.type === 'join' || data.type === 'list') {
    const code = typeof data.code === 'string' ? data.code.toUpperCase() : '';
    if (data.type === 'join' && !/^[A-Z2-9]{6}$/.test(code))
      return Response.json(
        { error: 'Enter a six-character room code.' },
        { status: 400 },
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        MULTIPLAYER_ORIGIN +
          (data.type === 'join' ? `/rooms/${code}/join` : '/rooms'),
        {
          method: data.type === 'list' ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For':
              request.headers.get('cf-connecting-ip') ||
              request.headers.get('x-forwarded-for')?.split(',')[0] ||
              'unknown',
          },
          body:
            data.type === 'list'
              ? undefined
              : JSON.stringify({ name: data.name }),
          signal: controller.signal,
        },
      );
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error();
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return Response.json(
        { error: 'Could not reach the sandbox. Please try again.' },
        { status: 503 },
      );
    } finally {
      clearTimeout(timer);
    }
  }
  const databaseUrl = (env as { MULTIPLAYER_DATABASE_URL?: string })
    .MULTIPLAYER_DATABASE_URL;
  if (!databaseUrl)
    return Response.json(
      { error: 'The multiplayer server is not configured.' },
      { status: 503 },
    );
  return multiplayerRequest(
    new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: raw,
    }),
    databaseUrl,
  );
}
