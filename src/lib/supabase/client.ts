import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/database.types';
import { authCookieOptions } from './public-config';

/**
 * Browser client. Carries the user's session, so every read and write is subject to row-level
 * security — the isolation boundary applies by construction rather than by remembering to filter.
 */
export function createClient() {
  // Deliberately NOT the validated `env` object: `NEXT_PUBLIC_*` are inlined by the bundler at
  // build time, and reading them through a runtime indirection defeats that inlining. The schema in
  // env.schema.ts still validates these on the server, where a failure is visible at boot.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The third client writes cookies too, when it refreshes a token in the browser — so it needs
    // the same `Secure` treatment as the two server-side ones (F-36). Guarded on `window` because a
    // client component also renders on the server during prerender, where there is no location.
    {
      cookieOptions: authCookieOptions(
        typeof window !== 'undefined' && window.location.protocol === 'https:',
      ),
    },
  );
}
