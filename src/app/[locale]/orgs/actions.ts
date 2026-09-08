'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requestIsHttps } from '@/lib/supabase/public-config';
import { getCurrentUser } from '@/lib/auth/dal';
import { ACTIVE_ORG_COOKIE } from '@/lib/orgs/active-org';
import { listMemberships } from '@/lib/orgs/dal';

/**
 * Organization mutations — SPEC-005 REQ-3, REQ-4, REQ-6.
 *
 * Each one authorizes its own caller. A page-level check does not extend to a Server Action, and an
 * exported action is reachable by direct POST whether or not any UI calls it (SPEC-004 REQ-3).
 *
 * None of these is the isolation boundary. Row-level security refuses the write, the SPEC-001
 * triggers refuse an owner demotion or a last-owner departure, and these checks are the layer that
 * makes the refusal legible instead of a raw database error.
 */

const Name = z.string().trim().min(1).max(200);
const Slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'lowercase letters, digits and hyphens');
const Uuid = z.uuid();
const Role = z.enum(['owner', 'admin', 'member']);
const Email = z.email().max(320);
// 32 bytes, hex. Shape-checked before it reaches the database so a malformed value is refused here
// rather than becoming a hash lookup that misses -- same outcome, but one of them is a query.
const Token = z.string().regex(/^[0-9a-f]{64}$/);

export type ActionResult = { ok: true } | { ok: false; message: string };

/** REQ-3 — through the RPC, which makes the creator an owner atomically. */
export async function createOrganization(formData: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  if (!(formData instanceof FormData)) return { ok: false, message: 'invalid' };

  const name = Name.safeParse(formData.get('name'));
  const slug = Slug.safeParse(formData.get('slug'));
  if (!name.success || !slug.success) return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  // Not an INSERT: the direct grant was revoked (20260908130000) so creation has one path with the
  // validation and the ownership grant inside it.
  const { error } = await supabase.rpc('create_organization', {
    org_name: name.data,
    org_slug: slug.data,
  });
  // The slug is unique across the whole table, so a collision is a normal outcome and reads as one.
  if (error)
    return { ok: false, message: error.message.includes('duplicate') ? 'taken' : 'failed' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** REQ-4 — remembering a preference. Refused unless the caller is actually a member. */
export async function setActiveOrganization(organizationId: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const parsed = Uuid.safeParse(organizationId);
  if (!parsed.success) return { ok: false, message: 'invalid' };

  // Checked here so a wrong value is REFUSED rather than silently ignored on the next read. The
  // read path falls back regardless (REQ-1), so this is about telling the truth, not about access.
  const memberships = await listMemberships();
  if (!memberships.some((m) => m.organization_id === parsed.data)) {
    return { ok: false, message: 'not a member' };
  }

  (await cookies()).set(ACTIVE_ORG_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // A preference, not a credential — but it names a tenant, so it gets the same protocol
    // treatment as the session cookie (F-36).
    secure: requestIsHttps(await headers()),
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** REQ-6 — RLS gates the write; the SPEC-001 triggers hold the invariants; this reports honestly. */
export async function changeMemberRole(
  organizationId: unknown,
  userId: unknown,
  role: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const org = Uuid.safeParse(organizationId);
  const target = Uuid.safeParse(userId);
  const next = Role.safeParse(role);
  if (!org.success || !target.success || !next.success) return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from('organization_member')
    .update({ role: next.data }, { count: 'exact' })
    .eq('organization_id', org.data)
    .eq('user_id', target.data);

  // A trigger refusal (demoting an owner) arrives as an error; a policy refusal arrives as zero
  // rows, because RLS filters rather than raises. Both are refusals and both are reported — a UI
  // that showed "saved" on a zero-row update would be lying in the most consequential place.
  if (error) return { ok: false, message: error.message };
  if (count === 0) return { ok: false, message: 'not permitted' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** REQ-6 — the last owner cannot leave; that is a trigger, and this surfaces its refusal. */
export async function removeMember(
  organizationId: unknown,
  userId: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const org = Uuid.safeParse(organizationId);
  const target = Uuid.safeParse(userId);
  if (!org.success || !target.success) return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from('organization_member')
    .delete({ count: 'exact' })
    .eq('organization_id', org.data)
    .eq('user_id', target.data);
  if (error) return { ok: false, message: error.message };
  if (count === 0) return { ok: false, message: 'not permitted' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * REQ-1 — minting an invitation. The token is returned to the CALLER, once, and never stored in the
 * clear: the row holds a sha256 of it, so a leaked table is not a set of working invitations.
 *
 * The admin check here is not the boundary. `invite_member` is security-definer, which means RLS is
 * bypassed inside it, so it re-checks `is_org_admin` itself — and that check is what an attacker
 * posting straight at this action meets. This layer exists to make the refusal legible.
 */
export async function inviteMember(
  organizationId: unknown,
  email: unknown,
  role: unknown,
): Promise<ActionResult & { token?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const org = Uuid.safeParse(organizationId);
  const address = Email.safeParse(email);
  const invited = Role.safeParse(role);
  if (!org.success || !address.success || !invited.success)
    return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invite_member', {
    org: org.data,
    invitee_email: address.data,
    invited_role: invited.data,
  });
  // 42501 is the function refusing a caller who does not administer the organization. It arrives as
  // an error rather than zero rows because a definer function raises; a policy would have filtered.
  if (error) return { ok: false, message: error.code === '42501' ? 'not permitted' : 'failed' };
  revalidatePath('/', 'layout');
  return { ok: true, token: data ?? undefined };
}

/**
 * REQ-6 — revocation, which takes effect on the next read rather than at some expiry. There is no
 * cached copy of an invitation's validity anywhere: the preview asks the table every time.
 */
export async function revokeInvitation(invitationId: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const id = Uuid.safeParse(invitationId);
  if (!id.success) return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_invitation', { invitation: id.data });
  if (error) return { ok: false, message: error.code === '42501' ? 'not permitted' : 'failed' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * REQ-5 — acceptance binds the invitation to whoever is signed in NOW, and grants the role the
 * inviter chose. The caller supplies a token and nothing else: no organization id, no role, so
 * there is no parameter for them to tamper with.
 *
 * A signed-in caller is required. Deliberately: accepting is a membership change, and the identity
 * it binds to has to be one the database can name.
 */
export async function acceptInvitation(token: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'unauthorized' };
  const parsed = Token.safeParse(token);
  if (!parsed.success) return { ok: false, message: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_invitation', { token: parsed.data });
  // Spent, revoked, expired and invented tokens all raise the same P0001, and this reports them the
  // same way. Distinguishing them here would undo the care taken in the function.
  if (error) return { ok: false, message: 'invalid invitation' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
