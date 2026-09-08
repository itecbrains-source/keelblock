import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { previewInvitation } from '@/lib/orgs/invitations';
import { AcceptForm } from './accept-form';

/**
 * The invitation landing page — SPEC-006 REQ-2, REQ-4, REQ-5.
 *
 * The only route in the application a person with no account and no membership can get anything
 * out of, and the whole design of this spec is about keeping that opening the size of two columns.
 *
 * The shape is forced by Cache Components the same way `/orgs` is (ADR-004): everything that
 * depends on the token or the session is inside `<Suspense>`, and the shell around it prerenders.
 *
 * REQ-4 is a rendering rule as much as a database one. An invented token, an expired one, a revoked
 * one and one that was already accepted all reach `previewInvitation` and all come back `null`, and
 * this page says the same sentence for all four. It would be easy, and friendlier, to say "that
 * invitation was already used" — and it would tell someone working through guesses that they had
 * found a real one.
 */
export async function Invitation({ token }: { token: string }) {
  const t = await getTranslations('invite');
  const [invitation, user] = await Promise.all([previewInvitation(token), getCurrentUser()]);

  if (!invitation) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15"
      >
        {t('unknown')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {t('offer', { org: invitation.organizationName, role: invitation.role })}
      </p>
      {user ? (
        <AcceptForm token={token} labels={{ accept: t('accept'), working: t('working') }} />
      ) : (
        // Signing in first is required, and the reason is worth stating on the page: acceptance
        // binds the membership to an identity, and there is no identity here yet.
        <p className="text-sm">
          {t('signInFirst')}{' '}
          <Link
            className="underline underline-offset-4"
            href={{ pathname: '/login', query: { next: `/invite/${token}` } }}
          >
            {t('signIn')}
          </Link>
        </p>
      )}
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const t = await getTranslations('invite');
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t('subtitle')}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50">…</p>}>
        <Invitation token={token} />
      </Suspense>
    </main>
  );
}
