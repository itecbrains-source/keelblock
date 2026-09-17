'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/dal';
import { activeOrg } from '@/lib/orgs/dal';

/**
 * Project mutations — SPEC-007 AC-8.
 *
 * Authorizes its own caller: a page-level check does not extend to a Server Action, and an exported
 * action is a public POST endpoint whether or not any UI calls it (SPEC-004 REQ-3).
 *
 * **None of the checks here is the entitlement gate.** The gate is `project_insert`'s `WITH CHECK`,
 * which calls `is_org_entitled`. What this file does is make the database's refusal legible.
 */

const Name = z.string().trim().min(1).max(200);

export type CreateResult =
  { ok: true } | { ok: false; reason: 'unauthorized' | 'invalid' | 'unentitled' | 'failed' };

/**
 * Create a project in the active organization.
 *
 * **The order is the point, and it is the opposite of the instinct.** The insert is attempted
 * first, unconditionally. Only once the database has refused is the entitlement read — and it is
 * read solely to decide WHICH refusal to describe, because an RLS refusal carries no reason: a
 * non-member and an unentitled member produce the identical error.
 *
 * Checking entitlement BEFORE the insert would be faster and would be wrong. It would make the
 * application the thing that decides, with the policy demoted to a backstop nobody exercises — the
 * pattern `AGENTS.md` opens by forbidding, and the one every competing kit ships. Here the policy is
 * always what refuses, and this function never does.
 */
export async function createProject(formData: unknown): Promise<CreateResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'unauthorized' };
  if (!(formData instanceof FormData)) return { ok: false, reason: 'invalid' };

  const name = Name.safeParse(formData.get('name'));
  if (!name.success) return { ok: false, reason: 'invalid' };

  const org = await activeOrg();
  if (!org) return { ok: false, reason: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('project')
    .insert({ organization_id: org.organization_id, name: name.data });

  if (!error) {
    revalidatePath('/projects');
    return { ok: true };
  }

  // Refused. Now — and only now — ask why, so the person gets a sentence instead of a shrug.
  // A failure to answer that question is not a failure to create the project: the refusal already
  // stands, so this falls back to the generic message rather than throwing over the top of it.
  try {
    const { data: entitled } = await supabase.rpc('is_org_entitled', {
      org: org.organization_id,
    });
    return { ok: false, reason: entitled === true ? 'failed' : 'unentitled' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
