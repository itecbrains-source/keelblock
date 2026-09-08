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
