import { describe, expect, it } from 'vitest';
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from './active-org';

/**
 * SPEC-005 REQ-4, and REQ-1 stated as a property rather than assumed.
 *
 * The active organization is a VIEW SELECTION, not a security boundary — every read stays
 * membership-scoped in the policy. So the job here is narrow and worth stating: never render one
 * organization's name above another's rows, and never let a cookie decide anything a policy would
 * not already permit.
 */

const memberships = [
  { organization_id: 'org-a', name: 'Acme', role: 'owner' as const },
  { organization_id: 'org-b', name: 'Beta', role: 'member' as const },
];

describe('resolveActiveOrg', () => {
  it('honours a cookie naming an organization the caller belongs to', () => {
    expect(resolveActiveOrg('org-b', memberships)?.organization_id).toBe('org-b');
  });

  it('falls back to a real membership when the cookie is absent', () => {
    expect(resolveActiveOrg(null, memberships)?.organization_id).toBe('org-a');
  });

  it('falls back — never errors — when the cookie names an organization the caller left', () => {
    // Revocation is immediate at the policy layer, so this is a rendering question, not an access
    // one. Erroring would log a person out of a product they still belong to.
    expect(resolveActiveOrg('org-gone', memberships)?.organization_id).toBe('org-a');
  });

  it('falls back on a forged value, including one shaped like an id', () => {
    expect(resolveActiveOrg('../../etc/passwd', memberships)?.organization_id).toBe('org-a');
    expect(
      resolveActiveOrg('00000000-0000-0000-0000-000000000000', memberships)?.organization_id,
    ).toBe('org-a');
  });

  it('returns null when the caller belongs to nothing — the honest empty state', () => {
    expect(resolveActiveOrg('org-a', [])).toBeNull();
  });

  it('INVARIANT: whatever comes back is always one of the caller’s own memberships', () => {
    // The property REQ-1 rests on, stated once rather than as a list of payloads. A cookie can
    // change WHICH of your organizations you are looking at, and can never add one.
    for (const cookie of [null, '', 'org-a', 'org-b', 'org-zzz', '../x', 'null', 'undefined']) {
      const resolved = resolveActiveOrg(cookie, memberships);
      expect(
        resolved === null ||
          memberships.some((m) => m.organization_id === resolved.organization_id),
      ).toBe(true);
    }
  });

  it('names its cookie once, so the writer and the reader cannot drift', () => {
    expect(ACTIVE_ORG_COOKIE).toMatch(/^[a-z0-9_-]+$/);
  });
});
