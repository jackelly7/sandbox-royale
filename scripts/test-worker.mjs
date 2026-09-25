// Exercise the built app inside workerd; Vite dev does not enforce Worker global-scope rules.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const port = 8799;
const child = spawn(
  process.execPath,
  [
    require.resolve('wrangler/bin/wrangler.js'),
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--port',
    String(port),
  ],
  {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  },
);
let log = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (data) => {
    log = (log + data).slice(-12000);
  });
try {
  let response;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      response = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(3000),
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.ok(response, 'Built Worker did not start');
  assert.equal(
    response.status,
    200,
    'Built homepage must render without client recovery',
  );
  assert.ok((await response.text()).includes('Sandbox'));
  console.log('Built Worker homepage: HTTP 200.');
} catch (error) {
  console.error(log);
  throw error;
} finally {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
}
