import { upgradeWebSocket, attachDatabasePool } from '@neon/functions';
import { attachSocket, allowedOrigin, handleHttp } from './app.ts';
import { pool } from './store.ts';
attachDatabasePool(pool);
const handler = {
  fetch(request: Request): Promise<Response> | Response {
    if (
      new URL(request.url).pathname === '/ws' &&
      request.headers.get('upgrade')?.toLowerCase() === 'websocket'
    ) {
      if (!allowedOrigin(request))
        return new Response('Origin not allowed', { status: 403 });
      const { socket, response } = upgradeWebSocket(request);
      attachSocket(socket);
      return response;
    }
    return handleHttp(request);
  },
};

export default handler;
