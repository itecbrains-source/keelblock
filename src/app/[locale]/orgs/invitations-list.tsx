'use client';

import { useState, useTransition } from 'react';
import { inviteMember, revokeInvitation, type ActionResult } from './actions';
import type { PendingInvitation } from '@/lib/orgs/invitations';

/**
 * SPEC-006 REQ-1, REQ-6. The controls render for an admin; the DATABASE decides — `invite_member`
 * and `revoke_invitation` re-check authority inside themselves, because a definer function has
 * bypassed the policy that would otherwise have refused.
 *
 * The link is displayed ONCE, here, and that is a deliberate limitation rather than a placeholder
 * for a mail step. keelblock does not send this email: it has no opinion about your provider, and a
 * starter that ships a hardcoded one is a starter you have to unpick. What it does guarantee is
 * that the token is never recoverable afterwards — the row holds a sha256, so there is no screen,
 * anywhere, that can show it to you a second time. Wiring a sender means calling `inviteMember` and
 * passing `token` to it.
 */
export function InvitationsList({
  organizationId,
  invitations,
  canAdminister,
  origin,
  labels,
}: {
  organizationId: string;
  invitations: PendingInvitation[];
  canAdminister: boolean;
  origin: string;
  labels: {
    heading: string;
    email: string;
    role: string;
    invite: string;
    revoke: string;
    none: string;
    linkOnce: string;
    expires: string;
  };
}) {
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState('');
  const [link, setLink] = useState('');

  const run = (fn: () => Promise<ActionResult & { token?: string }>) =>
    start(async () => {
      const r = await fn();
      setRefusal(r.ok ? '' : r.message);
      if (r.ok && 'token' in r && r.token) setLink(`${origin}/invite/${r.token}`);
    });

  if (!canAdminister) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{labels.heading}</h2>

      <form
        className="flex flex-wrap items-end gap-2"
        action={(formData) =>
          run(() =>
            inviteMember(organizationId, formData.get('email'), formData.get('role') ?? 'member'),
          )
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          {labels.email}
          <input
            name="email"
            type="email"
            required
            className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {labels.role}
          <select
            name="role"
            defaultValue="member"
            className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/15"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
            {/* No `owner`. `invite_member` refuses it, because the SPEC-001 owner-authority trigger
                refuses the membership it would create -- an existing owner promotes someone already
                inside, through the members list. Offering it here would be an affordance that
                always fails. */}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-60 dark:border-white/15"
        >
          {labels.invite}
        </button>
      </form>

      {link ? (
        <p className="rounded-lg border border-black/10 p-3 text-sm break-all dark:border-white/15">
          {labels.linkOnce} <code>{link}</code>
        </p>
      ) : null}

      {invitations.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">{labels.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitations.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
            >
              <span>
                {i.email} — {i.role} — {labels.expires}{' '}
                {new Date(i.expires_at).toISOString().slice(0, 10)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => revokeInvitation(i.id))}
                className="underline underline-offset-4 disabled:opacity-60"
              >
                {labels.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Rendered ALWAYS, empty when there is nothing to say -- the same shape as `members-list`.
          A live region has to exist before its content arrives; one created in the same commit as
          its message is frequently not announced at all, which turns a refusal into silence for
          exactly the people who most need to hear it. The first draft of this file rendered it
          conditionally. */}
      <p role="alert" className="min-h-5 text-sm text-red-700 dark:text-red-400">
        {refusal}
      </p>
    </section>
  );
}
