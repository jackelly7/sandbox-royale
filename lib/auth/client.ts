'use client';
import { createAuthClient } from '@neondatabase/auth/next';
export const authClient = createAuthClient();
export async function accountHeaders(): Promise<Record<string, string>> {
  const { data, error } = await authClient.getSession();
  if (error) throw new Error('Could not check your account. Please try again.');
  if (!data?.user) return {};
  // Fetch the JWT endpoint directly: the SDK's token() shares its getSession
  // cache, which can contain an opaque cookie token instead of a JWT.
  const response = await fetch('/api/auth/token', { cache: 'no-store' });
  const result = (await response.json()) as { token?: string };
  if (!response.ok || !result.token)
    throw new Error('Your sign-in has expired. Sign in again.');
  return { Authorization: `Bearer ${result.token}` };
}
export async function accountRequest<T = unknown>(
  path: string,
  preferences?: unknown,
  accountId?: string,
) {
  const response = await fetch(`/api/account${path}`, {
    method: preferences === undefined ? 'GET' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await accountHeaders()),
    },
    body:
      preferences === undefined
        ? undefined
        : JSON.stringify({ preferences, accountId }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Account request failed.');
  return data;
}
