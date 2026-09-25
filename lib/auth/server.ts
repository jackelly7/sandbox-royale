import { createNeonAuth } from '@neondatabase/auth/next/server';
import { env } from 'cloudflare:workers';
import deployment from '../../server/deployment.json';

export function getAuth() {
  const secret = (env as { NEON_AUTH_COOKIE_SECRET?: string })
    .NEON_AUTH_COOKIE_SECRET;
  if (!secret) throw new Error('Authentication is not configured.');
  return createNeonAuth({
    baseUrl: deployment.auth_url,
    cookies: { secret, sameSite: 'lax' },
  });
}
