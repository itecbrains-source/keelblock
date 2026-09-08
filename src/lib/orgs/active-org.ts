/**
 * Which organization the caller is currently looking at — SPEC-005 REQ-1, REQ-4.
 *
 * **This is a view selection, not a security boundary.** Every read stays membership-scoped in the
 * policy, so a wrong value here changes which of YOUR organizations you see and can never add one
 * you do not belong to. That is the property, and `resolveActiveOrg` is written so it holds by
 * construction: the returned value is chosen FROM the caller's own memberships, never parsed out of
 * the cookie.
 *
 * The cookie is therefore untrusted input with a small job — remembering a preference between
 * requests — and a bad one falls back rather than erroring. Erroring would log a person out of a
 * product they still belong to because a cookie went stale.
 */

/** Named once. A writer and a reader that disagree about the name is a switcher that never sticks. */
export const ACTIVE_ORG_COOKIE = 'keelblock_org';

/** One row of a members list. Lives here, not in the server-only DAL, because a client component
 *  needs the shape — and importing a `server-only` module for a type is how that boundary gets
 *  weakened by someone who only wanted an interface. */
export type Member = { user_id: string; role: 'owner' | 'admin' | 'member' };

export type Membership = {
  organization_id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
};

/**
 * @param cookie the raw cookie value, or null
 * @param memberships the caller's own memberships, already read under RLS
 * @returns one of `memberships`, or null when the caller belongs to nothing
 */
export function resolveActiveOrg(
  cookie: string | null | undefined,
  memberships: Membership[],
): Membership | null {
  if (memberships.length === 0) return null;
  // Chosen from the list, not parsed from the input — which is why no validation of the cookie's
  // SHAPE is needed or attempted. A value that matches nothing is simply not found.
  return memberships.find((m) => m.organization_id === cookie) ?? memberships[0];
}
