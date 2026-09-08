import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { buildCsp, headersFor, type HeaderMode } from '@/lib/security-headers';
import { updateSession } from '@/lib/supabase/proxy';
import { publicSupabaseConfig } from '@/lib/supabase/public-config';

/**
 * The network boundary in front of the app — SPEC-004 REQ-1.
 *
 * `middleware.ts` was renamed to `proxy.ts` in Next.js 16.0.0; the old convention is deprecated on
 * the version this repository pins. The rename is worth understanding rather than just applying:
 * the framework chose "proxy" because the name "implies a network boundary in front of the app",
 * and it recommends avoiding reliance on this layer "unless no other options exist".
 *
 * So this file does three things that are safe to do at a network boundary — localize, set security
 * headers, refresh the session — and **decides nothing**. There is no authorization here, and
 * adding some would be a defect rather than a hardening: a matcher change or a Server Function moved
 * to another route removes this file's coverage silently, and GHSA-f82v-jwr5-mffw is what that costs
 * when it is the only check.
 */

const intl = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = intl(request);

  const mode = (process.env.KEELBLOCK_SECURITY_HEADERS ?? 'report-only') as HeaderMode;
  const csp = buildCsp({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    isDev: process.env.NODE_ENV === 'development',
  });
  for (const [key, value] of Object.entries(headersFor(mode, csp))) {
    response.headers.set(key, value);
  }

  // LAST, and the order is load-bearing: a refresh writes `Cache-Control: private, no-store` onto
  // this response, and a later header pass that overwrote it would put a Set-Cookie carrying one
  // user's session into a shared cache. Nothing above sets Cache-Control today; running after is
  // what keeps that true when something does.
  //
  // Read from `process.env` rather than the validated `env` object for the same reason
  // `supabase/client.ts` does: `NEXT_PUBLIC_*` are inlined by the bundler, and `env` is
  // `server-only`.
  await updateSession(request, response, publicSupabaseConfig());

  return response;
}

export const config = {
  // A STATIC literal, and it has to be: Next analyses this at build time and "dynamic values such as
  // variables will be ignored" — an imported constant fails the build outright, which is how this
  // was found. The test reads it back with the TypeScript parser rather than a regex.
  //
  // `auth` is excluded: next-intl would redirect /auth/callback to a locale prefix and the code
  // would never be exchanged. That route writes its own session cookies onto a response it owns.
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
