import { getTranslations } from 'next-intl/server';
import { SignInForm } from './sign-in-form';
import { enabledOAuthProviders } from '@/lib/auth/providers';

/**
 * The sign-in surface — SPEC-004 REQ-7.
 *
 * Static: nothing here reads cookies, so it prerenders. The form is a client component because it
 * needs pending state; the action it calls is a Server Action that parses its own input.
 */
export default async function Login({ searchParams }: PageProps<'/[locale]/login'>) {
  const t = await getTranslations('login');
  const params = await searchParams;
  const failed = params?.error === 'link';

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t('subtitle')}</p>
      </div>
      {failed ? (
        <p
          role="alert"
          className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
        >
          {t('linkFailed')}
        </p>
      ) : null}
      <SignInForm
        providers={enabledOAuthProviders(process.env.NEXT_PUBLIC_OAUTH_PROVIDERS)}
        labels={{
          email: t('email'),
          submit: t('submit'),
          sending: t('sending'),
          sent: t('sent'),
          continueWith: t('continueWith'),
          providerFailed: t('providerFailed'),
        }}
      />
    </main>
  );
}
