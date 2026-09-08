import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { activeOrg } from '@/lib/orgs/dal';

/**
 * Invitation reads — SPEC-006 REQ-1, REQ-2.
 *
 * Two reads with deliberately different shapes, because they answer to different callers.
 *
 * `listInvitations` is an ordinary tenant read: the caller carries their session, the admin-only
 * SELECT policy refuses everyone else, and the `.eq()` is view selection rather than a boundary
 * (SPEC-005's rule, unchanged here).
 *
 * `previewInvitation` is the ONE exception in the schema — the only row a non-member may learn
 * anything about. It goes through a security-definer function whose return type names two columns,
 * so the boundary is a type in a migration rather than a `select` list somebody can widen while
 * refactoring. It is called with the anonymous key on purpose: the person holding the link has no
 * account yet, and requiring one to read "who invited you" would invert the flow.
 */

export type PendingInvitation = {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  expires_at: string;
};

/** REQ-1 — what an admin sees. Empty for everyone else, because the policy says so. */
export async function listInvitations(): Promise<PendingInvitation[]> {
  const org = await activeOrg();
  if (!org) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organization_invitation')
    .select('id, email, role, expires_at')
    .eq('organization_id', org.organization_id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * REQ-2, REQ-4 — what a stranger holding a link may learn: the organization's name and the role
 * offered. `null` covers invented, expired, revoked and already-spent tokens with ONE answer, and
 * that sameness is the requirement, not an implementation detail: "already accepted" would confirm
 * to whoever is guessing that the guess had once been good.
 */
export async function previewInvitation(
  token: string,
): Promise<{ organizationName: string; role: 'owner' | 'admin' | 'member' } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invitation_preview', { token });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  if (!row?.organization_name || !row.invited_role) return null;
  return { organizationName: row.organization_name, role: row.invited_role };
}
