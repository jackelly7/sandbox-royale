import { env } from 'cloudflare:workers';
import { multiplayerRequest } from '../../../server/http';
export async function POST(request: Request) {
  const databaseUrl = (env as { MULTIPLAYER_DATABASE_URL?: string })
    .MULTIPLAYER_DATABASE_URL;
  if (!databaseUrl)
    return Response.json(
      { error: 'The multiplayer server is not configured.' },
      { status: 503 },
    );
  return multiplayerRequest(request, databaseUrl);
}
