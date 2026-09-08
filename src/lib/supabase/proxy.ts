import type { NextRequest, NextResponse } from 'next/server';
import { createResponseClient, type Config } from './response-client';

type SessionAuth = { getClaims: () => Promise<{ data: { claims: unknown } | null }> };

/**
 * Session refresh at the network boundary — SPEC-004 REQ-1, REQ-2.
 *
 * **This module refreshes; it does not authorize.** Nothing here decides whether a caller may see a
 * row. That is the Data Access Layer's job, on every read and every write, because the Proxy is not
 * a boundary an application can rely on: Next.js says so itself when explaining the rename away from
 * "middleware" — the name Proxy "implies a network boundary in front of the app" — and a matcher
 * change or a moved Server Function silently removes its coverage. GHSA-f82v-jwr5-mffw is the same
 * lesson with a CVSS score of 9.1.
 */

/**
 * Refresh the session for one request, writing any rotated cookies — and the headers that keep them
 * out of a shared cache — onto `response`.
 *
 * @returns the verified claims, or null when there is no session.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
  config: Config<SessionAuth>,
) {
  const supabase = createResponseClient(request, response, config);

  // Called before any response body exists, per the library's timing rule: a refresh completing
  // after the response is committed cannot be written, and is lost — so the next request refreshes
  // again, forever.
  //
  // `getClaims()`, not `getUser()`: it verifies the JWT signature against the project's published
  // keys. `getSession()` is never used for identity anywhere, because it does not revalidate.
  const { data } = await supabase.auth.getClaims();
  return { claims: data?.claims ?? null };
}
