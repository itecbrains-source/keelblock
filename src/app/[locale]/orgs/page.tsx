import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { activeOrg, listMemberships, listMembers } from '@/lib/orgs/dal';
import { OrgSwitcher } from './org-switcher';
import { CreateOrgForm } from './create-org-form';
import { MembersList } from './members-list';

/**
 * The first authenticated route — SPEC-005 REQ-7.
 *
 * It refuses in its OWN data path. Not in the proxy: a matcher change or a Server Function moved to
 * another route removes that coverage silently, and GHSA-f82v-jwr5-mffw is what that costs when it
 * is the only check.
 *
 * **The shape is forced by Cache Components (ADR-004), and getting it wrong is not visible in a unit
 * test.** Everything session-dependent lives inside `<Suspense>`; the shell around it is prerendered
 * with no session at all. MEASURED: with the auth check at the top level the shell still flushed
 * with a 200, both branches' labels rendered at once, and the redirect arrived too late to change
 * the status — no data, but not a refusal either. The whole session-dependent region is one
 * component so there is exactly one place that can be got wrong.
 */
/**
 * Exported for the test, which drives the refusal directly. The default export wraps this in
 * `<Suspense>`, so calling it never awaits this component and cannot observe the redirect.
 */
export async function Organizations() {
  const t = await getTranslations('orgs');

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/orgs');

  const [memberships, current, members] = await Promise.all([
    listMemberships(),
    activeOrg(),
    listMembers(),
  ]);

  return (
    <>
      {memberships.length === 0 ? (
        <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
          {t('none')}
        </p>
      ) : (
        <>
          <OrgSwitcher
            memberships={memberships}
            activeId={current?.organization_id ?? null}
            label={t('switch')}
          />
          <MembersList
            organizationId={current?.organization_id ?? ''}
            members={members}
            viewerId={user.sub}
            viewerRole={current?.role ?? 'member'}
            labels={{
              heading: t('members', { org: current?.name ?? '' }),
              you: t('you'),
              remove: t('remove'),
              makeAdmin: t('makeAdmin'),
              makeMember: t('makeMember'),
            }}
          />
        </>
      )}
      <CreateOrgForm
        labels={{
          heading: t('create'),
          name: t('name'),
          slug: t('slug'),
          submit: t('createSubmit'),
        }}
      />
    </>
  );
}

export default async function Orgs() {
  const t = await getTranslations('orgs');
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t('subtitle')}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50">…</p>}>
        <Organizations />
      </Suspense>
    </main>
  );
}
