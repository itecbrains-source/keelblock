import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { activeOrg } from './dal';

export type Project = { id: string; name: string; created_at: string };

/**
 * Project reads — SPEC-007 AC-8's surface.
 *
 * The same posture as the rest of the DAL: the caller's session goes with the query and row-level
 * security is what refuses. The `.eq('organization_id', …)` is view selection and a performance
 * measure, never the boundary.
 *
 * **Reads are NOT entitlement-gated, and that is the decision rather than an oversight.** The owner
 * chose INSERT-only on 2026-09-17: an organization whose subscription lapses keeps everything it
 * already made — it can read it, rename it and delete it. Only creating more is refused. So this
 * function asks nothing about entitlement, and a lapsed organization's list looks exactly as it did
 * the day before.
 *
 * **There is deliberately no `isEntitled` read in this file.** One was written and deleted: a helper
 * here invites a page to ask "are we entitled?" before deciding what to render, which is the access
 * decision moving into application code — the pattern `AGENTS.md` opens by forbidding, reappearing
 * at the presentation layer where no policy and no pgTAP suite would see it. The only entitlement
 * read in the product is in `actions.ts`, AFTER the database has already refused, and it exists to
 * choose a sentence rather than to decide anything.
 */
export async function listProjects(): Promise<Project[]> {
  const org = await activeOrg();
  if (!org) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project')
    .select('id, name, created_at')
    .eq('organization_id', org.organization_id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
