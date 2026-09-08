import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/db/database.types';

/**
 * A Supabase client bound to a response it can write to — SPEC-004 REQ-4.
 *
 * Used by every path that answers a **GET** and may rotate the session: the proxy, and the auth
 * callback. Those are the responses a CDN could store, and from `@supabase/ssr`'s own type
 * definitions, a stored one is a real leak:
 *
 *   "Responses that set auth cookies must not be cached by CDNs or reverse proxies, otherwise one
 *    user's session token can be served to a different user."
 *
 * Server Actions do not use this: they answer a POST, which is not cached, and Next gives them no
 * response object to hang headers on. `server.ts` is that path.
 */

/**
 * What the library sends when it writes auth cookies. A **fallback**, not the value — `setAll`
 * receives the real headers and those are applied verbatim.
 *
 * It exists because of the library's own caveat: the headers "are delivered only with the first
 * cookie write", so a client reused across requests writes cookies on later responses with an empty
 * headers object. Cookies arriving without them is exactly the unsafe state, so this treats it as
 * one rather than trusting it cannot happen.
 */
export const CACHE_HEADERS_ON_REFRESH: Readonly<Record<string, string>> = {
  'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  expires: '0',
  pragma: 'no-cache',
};

export type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
export type SetAll = (cookies: CookieToSet[], headers?: Record<string, string>) => void;

/** Injected so the cookie contract can be driven by a test with no Supabase project in existence. */
export type ClientFactory<Auth> = (
  url: string,
  key: string,
  opts: { cookies: { getAll: () => { name: string; value: string }[]; setAll: SetAll } },
) => { auth: Auth };

/**
 * Parameterised by the slice of the auth surface a caller actually uses: the proxy needs
 * `getClaims`, the callback needs `exchangeCodeForSession`, and neither should have to satisfy the
 * other's shape to be tested.
 */
export type Config<Auth> = { url: string; key: string; createClient?: ClientFactory<Auth> };

export function createResponseClient<Auth>(
  request: NextRequest,
  response: NextResponse,
  { url, key, createClient }: Config<Auth>,
): { auth: Auth } {
  const factory = createClient ?? (createServerClient<Database> as unknown as ClientFactory<Auth>);
  return factory(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value, options } of cookiesToSet) {
          // The request too, so anything reading cookies later in this same request sees the
          // refreshed value rather than the one that arrived.
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        if (cookiesToSet.length === 0) return;
        const supplied = headers && Object.keys(headers).length ? headers : null;
        for (const [k, v] of Object.entries(supplied ?? CACHE_HEADERS_ON_REFRESH)) {
          response.headers.set(k, v);
        }
      },
    },
  });
}
