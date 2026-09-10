'use client';

import { useActionState, useState } from 'react';
import { requestMagicLink, startOAuth, type SignInState } from './actions';
import type { OAuthProvider } from '@/lib/auth/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The non-goal is unchanged and is the reason this file got SHORTER. keelblock does not BUILD a
 * component library; it uses one whose source it owns (ADR-023). Focus rings, disabled semantics
 * and the label association are Base UI's problem now, proven upstream, which is how B-7 —
 * keyboard-complete and axe-clean on every surface — stops being re-proven per component here.
 *
 * MakerKit's rule applies: adjust through `className`, never by editing `components/ui/*`, so the
 * primitives stay upstream-equivalent and CLI-replaceable.
 *
 * Colours come from tokens, so the `dark:` variants are gone rather than doubled: `text-muted-
 * foreground` is already correct in both schemes because ADR-018 keys the palette on the operating
 * system. Anything hard-coded here would be reintroducing the thing the tokens exist to remove.
 */
export function SignInForm({
  providers,
  next,
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
  /**
   * Where to land after signing in, already sanitised by the page. Carried through BOTH paths —
   * the hidden field for the email link, the argument for the provider button — because a journey
   * that survives one and not the other is a journey that fails half the time (F-73).
   */
  next: string;
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
        {/* Hidden rather than a closure variable: `requestMagicLink` is a Server Action reachable
            by a direct POST, so it parses its own input and reads this from the FormData. */}
        <input type="hidden" name="next" value={next} />
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <Button type="submit" disabled={pending}>
          {pending ? labels.sending : labels.submit}
        </Button>
        <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
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
        <Button
          key={id}
          type="button"
          variant="outline"
          onClick={async () => {
            setProviderError(false);
            const result = await startOAuth(id, next);
            if (result.status === 'ok') window.location.assign(result.url);
            else setProviderError(true);
          }}
        >
          {label}
        </Button>
      ))}
      {providerError ? (
        <p role="alert" className="text-destructive text-sm">
          {labels.providerFailed}
        </p>
      ) : null}
    </div>
  );
}
