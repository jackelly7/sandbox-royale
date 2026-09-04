import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { attachSocket, handleHttp } from './app.ts';
const server = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req)
      chunks.push(Buffer.from(chunk as Uint8Array));
    const response = await handleHttp(
      new Request(`http://localhost:3001${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  })().catch(() => {
    res.writeHead(500);
    res.end('Request failed');
  });
});
const ws = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
ws.on('connection', (socket) =>
  attachSocket({
    get readyState() {
      return socket.readyState;
    },
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    addEventListener: (name, listener) => {
      socket.on(name, (data: unknown) =>
        listener({ data: name === 'message' ? String(data) : undefined }),
      );
    },
  }),
);
server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () =>
  console.log('LASTLIGHT game server http://localhost:3001'),
);
