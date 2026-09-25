import { MULTIPLAYER_ORIGIN } from '../../../../lib/game/network-config';
async function proxy(request: Request) {
  const path = new URL(request.url).pathname.replace('/api/account', '');
  if (!['', '/leaderboard'].includes(path))
    return new Response(null, { status: 404 });
  if (
    request.method === 'PUT' &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  const body = request.method === 'PUT' ? await request.text() : undefined;
  if (body && body.length > 4096) return new Response(null, { status: 413 });
  try {
    const response = await fetch(MULTIPLAYER_ORIGIN + '/account' + path, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('authorization') || '',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: 'Account service is unavailable. Please try again.' },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const PUT = proxy;
