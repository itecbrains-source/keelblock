import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/database.types';
import { publicSupabaseConfig } from './public-config';

/**
 * Server client for Server Components, Server Actions and Route Handlers. Carries the user's
 * session, so RLS applies.
 *
 * ADR-004: this reads cookies, so any component calling it must sit inside a `<Suspense>` boundary
 * or the production build fails with Cache Components enabled. That is not a nuisance — it is what
 * makes the static shell and the streamed tenant region an explicit decision on every page.
 */
export async function createClient() {
  const store = await cookies();
  const { url, key } = publicSupabaseConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      // Takes only the cookies, and that is a recorded exemption in the boundaries gate rather
      // than an oversight — see `CACHE_HEADER_EXEMPT` there for the same reason in one line.
      //
      // MEASURED against the local stack on 2026-09-08: `signInWithOtp` from a Server Action
      // calls `setAll` three times, and the FIRST carries `Cache-Control`, `Expires` and
      // `Pragma` while the other two carry nothing. So auth cookies really are written here with
      // headers attached — and there is no response object in this context to attach them to.
      //
      // Safe, for a reason specific to this context rather than by assumption: a Server Action
      // answers a POST, which no CDN caches, and a Server Component cannot write cookies at all
      // (the call below throws and the refresh already happened in `proxy.ts`). Every GET path
      // that may rotate a session uses `response-client.ts`, which owns a response and applies
      // both halves.
      //
      // Refusing the write instead would break sign-in outright: that first cookie is the PKCE
      // code verifier, and without it the callback has nothing to exchange.
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Read-only in a Server Component. `proxy.ts` refreshed this request already.
        }
      },
    },
  });
}
