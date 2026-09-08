import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/dal';
import { ACTIVE_ORG_COOKIE, resolveActiveOrg, type Member, type Membership } from './active-org';

/**
 * Organization reads — SPEC-005 REQ-1, REQ-4, REQ-5.
 *
 * Every query here carries the caller's session, so row-level security is what refuses. The
 * `.eq('organization_id', …)` filters are a VIEW SELECTION and a performance measure — Supabase's
 * own guidance is to "add explicit filters in your application queries alongside RLS checks"
 * (measured 171ms → 9ms) — never the boundary. Delete one and you see too many of YOUR OWN
 * organizations' rows, which is a correctness bug; you never see somebody else's.
 */

/** The caller's memberships, newest-stable order. Cached per request. */
export const listMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organization_member')
    .select('organization_id, role, organization(name)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    organization_id: row.organization_id,
    role: row.role,
    // A membership whose organization row is unreadable cannot happen under these policies — both
    // are gated on the same predicate — so this is a type narrowing, not a fallback for a real case.
    name: (row.organization as { name: string } | null)?.name ?? '',
  }));
});

/** Which organization is being viewed. Always one the caller belongs to — see `resolveActiveOrg`. */
export const activeOrg = cache(async (): Promise<Membership | null> => {
  const [memberships, store] = await Promise.all([listMemberships(), cookies()]);
  return resolveActiveOrg(store.get(ACTIVE_ORG_COOKIE)?.value ?? null, memberships);
});

/** The members of the ACTIVE organization. Returns [] rather than throwing when there is none. */
export async function listMembers(): Promise<Member[]> {
  const org = await activeOrg();
  if (!org) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organization_member')
    .select('user_id, role')
    .eq('organization_id', org.organization_id);
  if (error) throw error;
  return data ?? [];
}
