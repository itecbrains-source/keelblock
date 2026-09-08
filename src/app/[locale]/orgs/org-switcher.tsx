'use client';

import { useTransition } from 'react';
import { setActiveOrganization } from './actions';
import type { Membership } from '@/lib/orgs/active-org';

/** SPEC-005 REQ-4. Changes which organization you are LOOKING AT; it cannot change what you may see. */
export function OrgSwitcher({
  memberships,
  activeId,
  label,
}: {
  memberships: Membership[];
  activeId: string | null;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="org" className="text-sm font-medium">
        {label}
      </label>
      <select
        id="org"
        defaultValue={activeId ?? ''}
        disabled={pending}
        onChange={(e) => start(() => void setActiveOrganization(e.target.value))}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
      >
        {memberships.map((m) => (
          <option key={m.organization_id} value={m.organization_id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
