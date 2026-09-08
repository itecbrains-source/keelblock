'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { acceptInvitation } from '../../orgs/actions';

/** SPEC-006 REQ-5. One parameter — the token. Nothing about the role or the organization is the
 * caller's to send, so there is nothing here for them to tamper with. */
export function AcceptForm({
  token,
  labels,
}: {
  token: string;
  labels: { accept: string; working: string };
}) {
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState('');
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvitation(token);
            if (r.ok) router.push('/orgs');
            else setRefusal(r.message);
          })
        }
        className="rounded-lg border border-black/10 px-4 py-2 text-sm disabled:opacity-60 dark:border-white/15"
      >
        {pending ? labels.working : labels.accept}
      </button>
      {/* Always present, empty when nothing is wrong -- see `invitations-list` for why. */}
      <p role="alert" className="min-h-5 text-sm text-red-700 dark:text-red-400">
        {refusal}
      </p>
    </div>
  );
}
