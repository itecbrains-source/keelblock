import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { signOut } from './login/actions';

/**
 * ADR-004: with Cache Components enabled, any component reading cookies must sit inside a
 * <Suspense> boundary or the production build fails. So the shell is static and anything
 * session-dependent streams into it. This is the shape every authenticated page takes.
 */
async function Status() {
  const t = await getTranslations('home');
  const user = await getCurrentUser();

  if (!user) {
    return (
      <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <Link href="/login" className="underline underline-offset-4">
          {t('signIn')}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
      <span>{t('signedInAs', { email: user.email ?? user.sub })}</span>
      <form action={signOut}>
        <button type="submit" className="underline underline-offset-4">
          {t('signOut')}
        </button>
      </form>
    </div>
  );
}

export default async function Home() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t('tagline')}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50">…</p>}>
        <Status />
      </Suspense>
    </main>
  );
}
