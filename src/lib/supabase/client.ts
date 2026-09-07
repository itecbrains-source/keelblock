import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/database.types';

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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
