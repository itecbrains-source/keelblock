/**
 * The two public Supabase values, read at call time — SPEC-004 REQ-1.
 *
 * Deliberately NOT the validated `env` object, for the reason `supabase/client.ts` already records:
 * `NEXT_PUBLIC_*` are inlined by the bundler, and `env` is `server-only`. Reading it at module scope
 * from a Route Handler also makes `next build` require a configured project to collect page data,
 * which turns a missing variable into a build failure on a clean clone rather than a clear runtime
 * error.
 *
 * `env.schema.ts` still requires both, so a misconfigured deployment fails at boot anywhere that
 * imports `env`. This is the fallback for the two places that cannot.
 */
export function publicSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Loud and named. Never a silent skip: a path that quietly stops refreshing or exchanging
    // sessions looks exactly like one that works.
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. See .env.example.',
    );
  }
  return { url, key };
}

/**
 * Cookie attributes for the session — SPEC-004 REQ-6, and F-31's rule applied to a library default
 * rather than a platform one.
 *
 * MEASURED 2026-09-08: `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` is
 * `{ path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 days }` — **`secure` is not in it at
 * all.** So over HTTPS in production the session cookie would be set without `Secure`, and a browser
 * would also send it over plain http to the same host.
 *
 * `httpOnly: false` is the library's deliberate design and is NOT overridden: `createBrowserClient`
 * reads the session from these cookies, so making them server-only breaks client-side auth outright.
 * The honest consequence, stated rather than discovered later: **an XSS on this origin can read the
 * session token.** The mitigation is the CSP, not the cookie.
 *
 * **`secure` is derived from the request's own protocol, not from `NODE_ENV`.** The obvious version
 * — `secure: NODE_ENV === 'production'` — is a trap: `next start` sets `NODE_ENV=production`, so a
 * locally served http build would set `Secure`, the browser would silently drop every auth cookie,
 * and sign-in would present as doing nothing with no error anywhere. Asking the request is exact and
 * needs no configuration.
 *
 * @param isHttps whether THIS request arrived over https
 */
export function authCookieOptions(isHttps: boolean) {
  return { secure: isHttps };
}

/** `x-forwarded-proto` is what a proxy or load balancer sets; `origin` covers the direct case. */
export function requestIsHttps(headers: { get(name: string): string | null }): boolean {
  const forwarded = headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return (headers.get('origin') ?? headers.get('referer') ?? '').startsWith('https://');
}
