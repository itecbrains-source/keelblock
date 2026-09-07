import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * ⚠ SERVICE-ROLE CLIENT — BYPASSES ROW-LEVEL SECURITY ENTIRELY.
 *
 * Every isolation guarantee keel makes is void for anything using this. It exists for the narrow set
 * of operations that legitimately act outside a user session: Stripe webhooks, scheduled jobs, and
 * administrative tooling.
 *
 * Rules, and a gate will enforce them (SPEC-003 REQ-3):
 *   · only imported from modules under `server-only/`
 *   · never reachable from a rendered page — a service-role client in a component tree is a total
 *     isolation bypass, and no policy or test in this repository would catch it
 *   · every call site carries a one-line justification
 *
 * The `server-only` import above turns a client-side import into a build error rather than a review
 * miss. It is the cheapest boundary available and it is not optional.
 */
export function createAdminClient() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
