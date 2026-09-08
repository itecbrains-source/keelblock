import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('notFound');
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">{t('body')}</p>
      <Link href="/" className="w-fit text-sm underline underline-offset-4">
        {t('back')}
      </Link>
    </main>
  );
}
