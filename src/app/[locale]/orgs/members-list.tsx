'use client';

import { useState, useTransition } from 'react';
import { changeMemberRole, removeMember, type ActionResult } from './actions';
import type { Member } from '@/lib/orgs/active-org';

/**
 * SPEC-005 REQ-5, REQ-6. The controls render for an admin; the DATABASE decides. An admin cannot
 * demote an owner and the last owner cannot leave — both are SPEC-001 triggers (F-9, F-10), and
 * this surface reports their refusal rather than presenting it as success.
 */
export function MembersList({
  organizationId,
  members,
  viewerId,
  viewerRole,
  labels,
}: {
  organizationId: string;
  members: Member[];
  viewerId: string;
  viewerRole: 'owner' | 'admin' | 'member';
  labels: { heading: string; you: string; remove: string; makeAdmin: string; makeMember: string };
}) {
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState('');
  const canAdminister = viewerRole === 'owner' || viewerRole === 'admin';
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setRefusal(r.ok ? '' : r.message);
    });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{labels.heading}</h2>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
          >
            <span>
              {m.user_id === viewerId ? `${m.user_id} (${labels.you})` : m.user_id} — {m.role}
            </span>
            {canAdminister && m.user_id !== viewerId ? (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      changeMemberRole(
                        organizationId,
                        m.user_id,
                        m.role === 'admin' ? 'member' : 'admin',
                      ),
                    )
                  }
                  className="underline underline-offset-4 disabled:opacity-60"
                >
                  {m.role === 'admin' ? labels.makeMember : labels.makeAdmin}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeMember(organizationId, m.user_id))}
                  className="underline underline-offset-4 disabled:opacity-60"
                >
                  {labels.remove}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p role="alert" className="min-h-5 text-sm">
        {refusal}
      </p>
    </section>
  );
}
