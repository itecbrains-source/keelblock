import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * The Data Access Layer's front door — SPEC-004 REQ-1, REQ-2, REQ-3.
 *
 * **This is where authorization happens.** Not the proxy, which is a network boundary whose coverage
 * a matcher change can delete; not a page, whose check does not extend to the Server Actions defined
 * within it. Next.js states both plainly, and GHSA-f82v-jwr5-mffw is what the first one costs when
 * it is the only check.
 *
 * `getClaims()` and never `getSession()`: it verifies the JWT signature against the project's
 * published keys, where `getSession()` "isn't guaranteed to revalidate the Auth token".
 *
 * Wrapped in React's `cache` so repeated calls within one request are one verification — which is
 * what makes it cheap enough to call in every action and every read, instead of passing a user
 * object down through components and hoping nobody hands it to a client.
 */

export type Claims = { sub: string; email?: string };

/** The verified caller, or null. Never throws — for surfaces that legitimately render both ways. */
export const getCurrentUser = cache(async (): Promise<Claims | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Claims | undefined;
  return claims?.sub ? { sub: claims.sub, email: claims.email } : null;
});

/*
 * `requireUser()` — the throwing variant — is deliberately NOT here yet. It has no caller until the
 * first authenticated-only surface exists (SPEC-005), and an exported function nothing calls is a
 * stub by this project's own rule, not an investment.
 */
