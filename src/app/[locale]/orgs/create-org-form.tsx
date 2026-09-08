'use client';

import { useActionState } from 'react';
import { createOrganization, type ActionResult } from './actions';

export function CreateOrgForm({
  labels,
}: {
  labels: { heading: string; name: string; slug: string; submit: string };
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => createOrganization(formData),
    null,
  );
  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-t border-black/10 pt-6 dark:border-white/15"
    >
      <h2 className="text-sm font-medium">{labels.heading}</h2>
      <label htmlFor="name" className="text-sm">
        {labels.name}
      </label>
      <input
        id="name"
        name="name"
        required
        className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
      />
      <label htmlFor="slug" className="text-sm">
        {labels.slug}
      </label>
      <input
        id="slug"
        name="slug"
        required
        className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20"
      >
        {labels.submit}
      </button>
      {/* A refusal is shown, never swallowed — a form that reports success on a rejected write is
          the failure this project is organized against. */}
      <p role="status" className="min-h-5 text-sm text-black/60 dark:text-white/60">
        {state && !state.ok ? state.message : ''}
      </p>
    </form>
  );
}
