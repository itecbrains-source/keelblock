import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client. Carries the user's session, so every read and write is subject to row-level
 * security — the isolation boundary applies by construction rather than by remembering to filter.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
