'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_AFTER_SIGN_IN, safeNext } from '@/lib/auth/redirect';
import { getCurrentUser } from '@/lib/auth/dal';
import { redirect } from 'next/navigation';

/**
 * Sign-in — SPEC-004 REQ-7.
 *
 * Both methods are PKCE: `@supabase/ssr` sets the flow, the code verifier is a cookie this action
 * writes, and the exchange happens in `/auth/callback`.
 *
 * Every argument is parsed. A Server Action is reachable by a direct POST whether or not any UI
 * calls it — Next.js documents this plainly — so `unknown` in, parsed, or nothing (ADR-011).
 */

const Email = z.email();

export type SignInState = { status: 'idle' | 'sent' | 'error'; message?: string };

/** Where the provider or the emailed link comes back to. */
async function callbackUrl(next: string) {
  const host = (await headers()).get('host');
  const proto = host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function requestMagicLink(
  _previous: SignInState,
  formData: unknown,
): Promise<SignInState> {
  if (!(formData instanceof FormData)) return { status: 'error', message: 'invalid' };
  const parsed = Email.safeParse(formData.get('email'));
  const next = safeNext(String(formData.get('next') ?? DEFAULT_AFTER_SIGN_IN));

  // The same answer whether or not the address parses, and whether or not an account exists.
  // Sign-in is an account-enumeration surface, and "we sent a link" for an address that has none is
  // the only reply that does not answer the attacker's actual question.
  const sent: SignInState = { status: 'sent' };
  if (!parsed.success) return sent;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(next) },
  });

  // Anti-enumeration means not revealing whether an ACCOUNT EXISTS. It does not mean reporting a
  // refusal as a success. This swallowed a `429` for the whole of SPEC-004's life, so a person who
  // asked twice in quick succession was told a link was on its way and never received one, with
  // nothing recorded anywhere (F-39).
  //
  // A throttle is safe to surface: it is keyed on the address that was typed, not on whether that
  // address has an account, so saying "wait a moment" tells an attacker nothing they did not
  // already supply.
  if (error?.status === 429) return { status: 'error', message: 'too soon' };
  if (error) {
    // Anything else stays generic to the caller and loud to the operator. Silence here is how a
    // misconfigured mail provider looks exactly like a working one.
    console.error('sign-in email failed', { code: error.code, status: error.status });
  }
  return sent;
}

/**
 * OAuth start. Returns the provider URL for the caller to navigate to rather than redirecting
 * here, so the code verifier cookie this sets is committed with the response.
 */
export async function startOAuth(provider: 'github' | 'google', next = DEFAULT_AFTER_SIGN_IN) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: await callbackUrl(safeNext(next)) },
  });
  if (error || !data?.url) return { status: 'error' as const };
  return { status: 'ok' as const, url: data.url };
}

/**
 * Sign out — SPEC-004 REQ-8.
 *
 * Server-side and complete: the cookies are cleared on the response, so the next request is
 * unauthenticated because the Data Access Layer says so, not because a client component changed
 * some state. Signing out while already signed out is not an error — the end state is what was
 * asked for either way.
 *
 * Scope is `local`, deliberately: this ends THIS session, not every session for the user. "Sign out
 * everywhere" is a different promise, and it is the one a person means after losing a laptop, so it
 * gets its own control rather than being silently bundled here.
 */
export async function signOut() {
  // Reads the caller rather than requiring one: this is the authorization call the boundaries gate
  // looks for, and refusing an already-signed-out request would be refusing the outcome it wants.
  await getCurrentUser();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect(DEFAULT_AFTER_SIGN_IN);
}
