import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { buildCsp, headersFor, type HeaderMode } from '@/lib/security-headers';

const intl = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const response = intl(request);

  const mode = (process.env.KEELBLOCK_SECURITY_HEADERS ?? 'report-only') as HeaderMode;
  const csp = buildCsp({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    isDev: process.env.NODE_ENV === 'development',
  });
  for (const [key, value] of Object.entries(headersFor(mode, csp))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
