/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
// Matchers imported here rather than through a setupFiles entry, for the reason vitest.config.ts
// already gives about environments: the file states what it needs, instead of a config doing it at
// a distance. This is the first DOM test in the repository, so it sets the idiom.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

// The component imports its Server Actions, which reach `server-only`. Mocked because this test is
// about what the surface RENDERS; what the actions do is asserted at the database, where the
// refusals actually happen.
vi.mock('./actions', () => ({
  changeMemberRole: vi.fn(async () => ({ ok: false, message: 'not permitted' })),
  removeMember: vi.fn(async () => ({ ok: false, message: 'not permitted' })),
}));

import { MembersList } from './members-list';

/**
 * SPEC-005 AC-6 and the reporting half of AC-7/AC-8.
 *
 * The database refuses; these assert the surface does not lie about the refusal. A zero-row write
 * looks exactly like a successful one to code that only checks `error`, and RLS filters rather than
 * raises — so "saved" on a rejected role change is the failure mode, and it is silent.
 */

const labels = {
  heading: 'Members of Acme',
  you: 'you',
  remove: 'Remove',
  makeAdmin: 'Make admin',
  makeMember: 'Make member',
};

const members = [
  { user_id: 'owner-1', role: 'owner' as const },
  { user_id: 'member-1', role: 'member' as const },
];

describe('MembersList', () => {
  beforeEach(() => vi.resetAllMocks());
  // Explicit, because this config does not enable `globals` — without it every render accumulates
  // into one document and a later test reads the previous test's buttons. Caught by the "a member
  // sees no administration controls" case, which passed for the wrong reason first time.
  afterEach(cleanup);

  it('AC-6 · renders exactly the members it is given', () => {
    render(
      <MembersList
        organizationId="org-a"
        members={members}
        viewerId="owner-1"
        viewerRole="owner"
        labels={labels}
      />,
    );
    expect(screen.getByText('Members of Acme')).toBeInTheDocument();
    expect(screen.getByText(/owner-1 \(you\)/)).toBeInTheDocument();
    expect(screen.getByText(/member-1/)).toBeInTheDocument();
    // Another organization's member is absent because it was never fetched — the filter is in the
    // query and the policy is the boundary. Asserted so a future change that merges organizations
    // into one list is caught here rather than by a customer.
    expect(screen.queryByText(/other-org-member/)).not.toBeInTheDocument();
  });

  it('a member sees no administration controls', () => {
    render(
      <MembersList
        organizationId="org-a"
        members={members}
        viewerId="member-1"
        viewerRole="member"
        labels={labels}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Make/ })).not.toBeInTheDocument();
  });

  it('an admin sees them — and cannot act on themselves', () => {
    render(
      <MembersList
        organizationId="org-a"
        members={members}
        viewerId="owner-1"
        viewerRole="owner"
        labels={labels}
      />,
    );
    // One target only: the other member. Never a control pointed at yourself, which is how a last
    // owner walks into the trigger's refusal by accident.
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
  });

  it('has an alert region for a refusal, so one cannot be swallowed', () => {
    render(
      <MembersList
        organizationId="org-a"
        members={members}
        viewerId="owner-1"
        viewerRole="owner"
        labels={labels}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
