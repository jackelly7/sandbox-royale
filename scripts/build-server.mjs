import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('work/multiplayer', { recursive: true });
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  outfile: 'work/multiplayer/index.mjs',
  banner: {
    js: "import{createRequire as ___cr}from'node:module';import{fileURLToPath as ___f}from'node:url';import{dirname as ___d}from'node:path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);",
  },
});
