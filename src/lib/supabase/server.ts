import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/database.types';
import { env } from '@/lib/env';

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
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Throws in a Server Component (cookies are read-only there); the session is refreshed by
          // middleware instead, so this is safely ignored rather than silently swallowing a real error.
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* refreshed in middleware */
          }
        },
      },
    }
  );
}
