import { getTranslations } from 'next-intl/server';
import { SignInForm } from './sign-in-form';
import { enabledOAuthProviders } from '@/lib/auth/providers';
import { safeNext } from '@/lib/auth/redirect';

/**
 * The sign-in surface — SPEC-004 REQ-7.
 *
 * The form is a client component because it needs pending state; the action it calls is a Server
 * Action that parses its own input.
 *
 * This route reads `searchParams` — request data — so it does NOT fully prerender. It builds as
 * `◐ Partial Prerender`: a static shell with the request-dependent part streamed in. The comment
 * that used to sit here said "Static: nothing here reads cookies, so it prerenders", which was
 * false against the line five below it: `cookies()` is not the only request state, and reading
 * `searchParams` outside a `<Suspense>` boundary is what `next dev` reports on every request to
 * this page. Recorded rather than quietly deleted, because the sentence was wrong on its own terms
 * and not merely imprecise about how Next classifies the route.
 *
 * Whether the `error=link` read belongs behind its own `<Suspense>` boundary is a live question and
 * is deliberately not answered here.
 */
export default async function Login({ searchParams }: PageProps<'/[locale]/login'>) {
  const t = await getTranslations('login');
  const params = await searchParams;
  const failed = params?.error === 'link';

  // Where to go AFTER signing in. `invite/[token]` links here as `/login?next=/invite/<token>`, and
  // this page never read it — so accepting an invitation as a signed-out user dead-ended on the home
  // page with the invitation abandoned (F-73). Both server actions were already wired for it:
  // `requestMagicLink` reads a `next` field and `startOAuth` takes a `next` argument. Only the UI
  // never spoke to them.
  //
  // Sanitised HERE as well as in the actions, and the duplication is deliberate: this value is
  // rendered into a hidden input, so it becomes part of the page's HTML. The action's check protects
  // the redirect; this one keeps attacker-controlled text out of the document in the first place.
  const next = safeNext(typeof params?.next === 'string' ? params.next : null);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </div>
      {failed ? (
        <p role="alert" className="border-border rounded-lg border p-3 text-sm">
          {t('linkFailed')}
        </p>
      ) : null}
      <SignInForm
        // Formatted here, once per provider, so the placeholder is filled by ICU rather than by a
        // `.replace()` in the client component (F-64).
        providers={enabledOAuthProviders(process.env.NEXT_PUBLIC_OAUTH_PROVIDERS).map(
          (provider) => ({ id: provider, label: t('continueWith', { provider }) }),
        )}
        next={next}
        labels={{
          email: t('email'),
          submit: t('submit'),
          sending: t('sending'),
          sent: t('sent'),
          tooSoon: t('tooSoon'),
          providerFailed: t('providerFailed'),
        }}
      />
    </main>
  );
}
