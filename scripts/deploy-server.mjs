import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const { project_id, branch_id, slug } = JSON.parse(
  readFileSync(new URL('../server/deployment.json', import.meta.url), 'utf8'),
);
const origin = process.env.SITE_TEST_URL;
if (
  !origin ||
  new URL(origin).origin !== origin ||
  !origin.startsWith('https://')
) {
  throw new Error(
    'Set SITE_TEST_URL to the production HTTPS origin without a trailing slash.',
  );
}
const result = spawnSync(
  'npx',
  [
    '--yes',
    '--package=neon@6.0.0',
    'neon',
    'functions',
    'deploy',
    slug,
    '--project-id',
    project_id,
    '--branch',
    branch_id,
    '--src',
    'work/multiplayer/index.mjs',
    '--no-bundle',
    '--env',
    `ALLOWED_ORIGINS=${origin}`,
    '--wait',
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
