import { getAuth } from '../../../../lib/auth/server';
import type { NextRequest } from 'next/server';
type Context = { params: Promise<{ path: string[] }> };
export function GET(request: NextRequest, context: Context) {
  return getAuth().handler().GET(request, context);
}
export function POST(request: NextRequest, context: Context) {
  return getAuth().handler().POST(request, context);
}
