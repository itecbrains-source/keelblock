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
