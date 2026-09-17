import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { activeOrg } from '@/lib/orgs/dal';
import { listProjects } from '@/lib/orgs/projects';
import { CreateProjectForm } from './create-project-form';

/**
 * The first paid surface — SPEC-007 REQ-1, AC-8.
 *
 * The shape is SPEC-005's, for SPEC-005's reason: everything session-dependent lives inside one
 * `<Suspense>` boundary and the shell around it prerenders with no session at all (ADR-004). With
 * the auth check at the top level the shell still flushes with a 200 and the redirect arrives too
 * late to change the status — measured, and not visible in a unit test.
 *
 * Nothing on this page asks whether the organization is entitled. The list is not gated (the owner
 * chose INSERT-only, so a lapsed organization keeps what it has), and the create form is offered to
 * everyone because the database is what refuses it.
 */
export async function Projects() {
  const t = await getTranslations('projects');

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/projects');

  const [org, projects] = await Promise.all([activeOrg(), listProjects()]);

  if (!org) {
    return (
      <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        {t('noOrg')}
      </p>
    );
  }

  return (
    <>
      {projects.length === 0 ? (
        <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
          {t('none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15"
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
      <CreateProjectForm
        labels={{
          heading: t('create'),
          name: t('name'),
          submit: t('createSubmit'),
          unentitled: t('unentitled'),
          failed: t('failed'),
          invalid: t('invalid'),
          unauthorized: t('unauthorized'),
        }}
      />
    </>
  );
}

export default async function ProjectsPage() {
  const t = await getTranslations('projects');
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t('subtitle')}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50">…</p>}>
        <Projects />
      </Suspense>
    </main>
  );
}
