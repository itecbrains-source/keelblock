'use client';

import { useActionState, useState } from 'react';
import { requestMagicLink, startOAuth, type SignInState } from './actions';
import type { OAuthProvider } from '@/lib/auth/providers';

/**
 * Deliberately plain. keelblock is not a component library (a stated non-goal), so this is the
 * smallest accessible form that works: a real label, a live region for the result, and a disabled
 * state while the action runs.
 */
export function SignInForm({
  providers,
  labels,
}: {
  /**
   * Each provider arrives with its label already formatted. The label is NOT a template for this
   * component to fill in: `t('continueWith', { provider })` on the server is what lets ICU do the
   * work, and a second locale that orders the sentence differently — or picks a form based on the
   * name — keeps working without this file changing. Doing it here with `.replace()` was F-64, and
   * the failure was not cosmetic: next-intl refuses to format a message whose placeholder is
   * unfilled, so `t('continueWith')` returned the key path and the button read `login.continueWith`.
   */
  providers: { id: OAuthProvider; label: string }[];
  labels: {
    email: string;
    submit: string;
    sending: string;
    sent: string;
    tooSoon: string;
    providerFailed: string;
  };
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, {
    status: 'idle',
  });
  const [providerError, setProviderError] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          {labels.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20"
        >
          {pending ? labels.sending : labels.submit}
        </button>
        <p aria-live="polite" className="min-h-5 text-sm text-black/60 dark:text-white/60">
          {state.status === 'sent'
            ? labels.sent
            : state.message === 'too soon'
              ? labels.tooSoon
              : ''}
        </p>
      </form>

      {/* Nothing renders when no provider is configured — an OAuth button that cannot work is a
          worse affordance than none. */}
      {providers.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={async () => {
            setProviderError(false);
            const result = await startOAuth(id);
            if (result.status === 'ok') window.location.assign(result.url);
            else setProviderError(true);
          }}
          className="rounded-lg border border-black/15 px-3 py-2 text-sm dark:border-white/20"
        >
          {label}
        </button>
      ))}
      {providerError ? (
        <p role="alert" className="text-sm">
          {labels.providerFailed}
        </p>
      ) : null}
    </div>
  );
}
