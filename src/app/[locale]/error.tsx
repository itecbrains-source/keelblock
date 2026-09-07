'use client';

import { useTranslations } from 'next-intl';

/**
 * Honest states (PRODUCT.md): a failure says it failed. It never renders as an empty list or a zero,
 * which is the most expensive UI bug there is, because it looks like an answer.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('error');
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">{t('body')}</p>
      {error.digest && (
        <p className="text-xs text-black/40 dark:text-white/40">{t('reference', { digest: error.digest })}</p>
      )}
      <button onClick={reset} className="w-fit rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
        {t('retry')}
      </button>
    </main>
  );
}
