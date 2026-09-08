import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/redirect';
import { createResponseClient } from '@/lib/supabase/response-client';
import { publicSupabaseConfig } from '@/lib/supabase/public-config';

/**
 * The PKCE callback — SPEC-004 REQ-7.
 *
 * Both sign-in methods land here: a magic link and an OAuth provider return with a `code`, which is
 * exchanged for a session. It is one of the two places in the application that legitimately writes
 * auth cookies onto a **GET** response, so it uses the response-bound client — the cookies and the
 * headers that keep them out of a shared cache travel together or not at all.
 *
 * It is excluded from the proxy matcher: `next-intl` would otherwise redirect it to a locale prefix
 * and the code would never be exchanged.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = safeNext(requestUrl.searchParams.get('next'));

  // One destination for every failure, carrying no detail. Which half failed — no code, a stale
  // code, a code for another browser's verifier — is not something to tell an unauthenticated
  // caller, and none of the three changes what the person can do about it.
  const failed = NextResponse.redirect(new URL('/login?error=link', requestUrl.origin));
  if (!code) return failed;

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  const supabase = createResponseClient<{
    exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>;
  }>(request, response, publicSupabaseConfig());

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? failed : response;
}
