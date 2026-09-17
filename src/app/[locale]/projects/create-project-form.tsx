'use client';

import { useActionState } from 'react';
import { createProject, type CreateResult } from './actions';

/**
 * The create form — SPEC-007 AC-8.
 *
 * **It always renders, including for an organization that is not entitled.** Hiding it behind an
 * entitlement read would move the access decision into application code, which is the one thing this
 * project refuses to do. The form is offered, the database refuses, and the refusal is what produces
 * the upsell. That also means the paywall cannot drift out of step with the policy: there is only
 * one decision, and it is not made here.
 */
export function CreateProjectForm({
  labels,
}: {
  labels: {
    heading: string;
    name: string;
    submit: string;
    unentitled: string;
    failed: string;
    invalid: string;
    unauthorized: string;
  };
}) {
  const [state, action, pending] = useActionState<CreateResult | null, FormData>(
    (_prev, formData) => createProject(formData),
    null,
  );

  const message = state && !state.ok ? labels[state.reason] : '';

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
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20"
      >
        {labels.submit}
      </button>
      {/* The refusal is shown, never swallowed. A paywall the person cannot see is indistinguishable
          from a bug to whoever hits it — and "both silent directions are wrong" is a rule this
          project has already paid for once, in `status_entitles`. */}
      <p role="status" className="min-h-5 text-sm text-black/60 dark:text-white/60">
        {message}
      </p>
    </form>
  );
}
