import { test, expect } from '../fixtures/auth';
import { signIn } from '../fixtures/auth';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Locator } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * B-7's automated half — **axe-clean on every shipped surface**.
 *
 * B-7 reads: *"Accessible: keyboard-complete, axe-clean on every shipped surface"*, proven by *"an
 * automated axe pass in CI plus a manual keyboard walkthrough per surface"*. This is the first half.
 * The second is a person, like DEF-024, and no amount of building closes it.
 *
 * **It claims no acceptance criterion, deliberately.** B-7 is owned by SPEC-008 and SPEC-015, both
 * registered and not yet authored. ADR-019's own words are that "deciding another spec's scope from
 * an ADR is how a spec stops owning its own bar" — so the evidence is built and left unclaimed, for
 * whoever authors that spec to point at. Building it now is cheap and getting cheaper is not how this
 * goes: five surfaces is the fewest there will ever be (F-90).
 *
 * It runs inside the existing `journey` step rather than becoming a fifteenth gate. SPEC-003 makes
 * the gate count a ceiling, and this needs a browser and a session, both of which this harness
 * already has.
 */

/**
 * **What "axe-clean" means here, decided rather than assumed.**
 *
 * "axe-clean" is not one thing: `wcag2a`, `wcag2aa` and `best-practice` give different answers about
 * the same page, and a bar that does not say which it means is a bar that moves. This is WCAG 2.1 at
 * levels A and AA — the baseline procurement and accessibility legislation actually reference.
 *
 * `best-practice` is deliberately EXCLUDED. Its rules are opinionated rather than normative (the
 * landmark and region rules will fail a page that is correct under WCAG), and including them would
 * make B-7 assert something nobody chose. If it is wanted later that is a decision with a diff, which
 * is the point of listing the tags here instead of taking axe's default.
 *
 * Not a separate config file: `keelblock.billing.json` exists because two files had to agree with
 * each other. This list has exactly one consumer, and a constant with the reasoning attached is
 * reviewable in the same way.
 */
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * How to reach each rendered surface.
 *
 * **The keys are checked against the route tree below**, which is the part that matters. A
 * hand-listed set of URLs is the shape F-77 spent three commits removing: it is correct on the day it
 * is written and silently incomplete forever after. Here the list of surfaces is DERIVED from
 * `src/app`, and this map only says how to VISIT each one — so a new `page.tsx` fails this file until
 * somebody says how to get to it, rather than being quietly unscanned.
 *
 * Full derivation is not possible and pretending otherwise would be worse: `/orgs` and `/projects`
 * need a session, and `/invite/[token]` needs a token that only minting an invitation produces.
 */
type Visit = 'anonymous' | 'authenticated' | 'invitation';
const HOW_TO_VISIT: Record<string, Visit> = {
  '/': 'anonymous',
  '/login': 'anonymous',
  '/orgs': 'authenticated',
  '/projects': 'authenticated',
  '/invite/[token]': 'invitation',
};

/** Every rendered surface, from the route tree rather than from memory. */
function renderedRoutes(dir = 'src/app', prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Route groups `(x)` and the locale segment contribute no path segment.
      const segment = /^\(.*\)$/.test(name) || name === '[locale]' ? '' : `/${name}`;
      out.push(...renderedRoutes(full, prefix + segment));
    } else if (/^page\.tsx?$/.test(name)) {
      out.push(prefix === '' ? '/' : prefix);
    }
  }
  return out;
}

/**
 * Scan one surface, and prove the scan LOOKED at the surface rather than at its shell.
 *
 * A green axe result is produced just as readily by a page that failed to render, by a redirect to
 * somewhere else, and by a scan that evaluated no rules at all. That is F-13's class — a check that
 * passes because it inspected nothing.
 *
 * **The `settled` locator is the load-bearing argument, and it was paid for (F-91).** Every
 * session-dependent region in this application lives inside `<Suspense>` (ADR-004), so the shell —
 * heading and all — flushes BEFORE the content exists. The first version of this guard waited for a
 * heading, which is in the shell, so axe ran against an empty page and reported it clean. MEASURED:
 * an `<img>` with no alt planted on `/login` failed immediately; the identical defect planted on
 * `/projects` PASSED, because the form had not streamed yet. `settled` must therefore name something
 * INSIDE the boundary.
 *
 * That is F-38's shape — the prerendered shell flushing with a 200 while the real answer is still on
 * its way — arriving in the accessibility layer.
 */
async function scanSurface(page: Page, route: string, label: string, settled: Locator) {
  // Compared as the LOGICAL route, not the raw URL. Next strips the default locale prefix, so
  // `/en` is served at `/` — measured, and the first version of this guard failed the baseline on
  // exactly that. What the check is actually for is the redirect case: an unauthenticated visit to
  // /orgs lands on /login, and scanning that would report a clean /orgs that never rendered.
  const pathname = new URL(page.url()).pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  expect(pathname, `${label}: navigation left the surface under test`).toBe(route);

  await expect(
    settled,
    `${label}: the streamed content had not arrived, so the scan would see only the shell`,
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();

  expect(
    results.passes.length,
    `${label}: axe evaluated no rules — the scan is vacuous`,
  ).toBeGreaterThan(0);
  expect(
    results.violations.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} node(s)`),
    `${label} has WCAG 2.1 AA violations`,
  ).toEqual([]);
}

test.describe('B-7 · every rendered surface is axe-clean at WCAG 2.1 AA', () => {
  test('every surface in the route tree says how it is reached', () => {
    // The F-77 guard, and the reason this file does not simply list five URLs. A page added
    // tomorrow appears here, and this fails until someone decides how to visit it — which is a
    // question a person has to answer, not one a walker can.
    const routes = renderedRoutes();
    expect(routes.length, 'no pages found — has the route tree moved?').toBeGreaterThan(0);
    for (const route of routes) {
      expect(
        HOW_TO_VISIT[route],
        `${route} is a rendered surface with no entry in HOW_TO_VISIT. B-7 covers EVERY shipped ` +
          `surface, so a new page is unscanned until this says how to reach it.`,
      ).toBeDefined();
    }
    // And the reverse: an entry for a page that no longer exists is a check pointing at nothing.
    for (const declared of Object.keys(HOW_TO_VISIT)) {
      expect(routes, `HOW_TO_VISIT names ${declared}, which is not in the route tree`).toContain(
        declared,
      );
    }
  });

  test('the anonymous surfaces are clean', async ({ page }) => {
    // `settled` names something a reader would look for on each page, not a heading — the heading
    // is in the shell on every one of these.
    const settledBy: Record<string, Locator> = {
      '/': page.getByRole('link').first(),
      '/login': page.getByRole('button', { name: 'Email me a link' }),
    };
    for (const route of ['/', '/login']) {
      await page.goto(`/en${route === '/' ? '' : route}`);
      await scanSurface(page, route, route, settledBy[route]);
    }
  });

  test('the authenticated surfaces are clean', async ({ page, seed }) => {
    const owner = await seed.createUser('a11y');
    const org = await seed.createOrg(owner, 'Axeco');
    // Entitled, so /projects renders its list as well as its form — an empty state and a populated
    // one are different markup, and the populated one is the one nobody looks at again.
    await seed.entitle(org, 'active');
    await seed.createProject(owner, org, 'Accessibility review');
    await signIn(page.context(), owner.email);

    // Both of these render their whole session-dependent region inside one `<Suspense>`, so what is
    // waited for has to come from INSIDE it — the `<h1>` arrives with the shell and proves nothing.
    const settledBy: Record<string, Locator> = {
      '/orgs': page.getByRole('heading', { name: 'Members of Axeco' }),
      '/projects': page.getByRole('button', { name: 'Create project' }),
    };
    for (const route of ['/orgs', '/projects']) {
      await page.goto(`/en${route}`);
      // The URL check inside scanSurface is load-bearing here: an unauthenticated visit REDIRECTS
      // to /login, and scanning that instead would report a clean /orgs that was never rendered.
      await scanSurface(page, route, route, settledBy[route]);
    }
  });

  test('the invitation surface is clean — in BOTH of its states', async ({
    page,
    browser,
    seed,
  }) => {
    // Reached only by minting a real invitation, which is why it cannot be derived: the token is
    // returned once and never recoverable from the table, which holds only its hash (SPEC-006).
    //
    // **It renders two different pages.** With no session there is an offer and no Accept button —
    // "no identity yet, so nothing to bind to" — and with one there is a button. B-7 covers every
    // shipped surface, and a state that only appears for signed-in people is still shipped; scanning
    // just one of the two would leave whichever is scanned looking like the whole story.
    const admin = await seed.createUser('a11y-admin');
    const invitee = await seed.createUser('a11y-invitee');
    const org = await seed.createOrg(admin, 'Inviteco');
    const token = await seed.invite(admin, org, invitee, 'member', { accept: false });

    // 1 · the stranger's view, in a context carrying no session — what the person opening the email
    //     actually meets.
    const strangerContext = await browser.newContext();
    const stranger = await strangerContext.newPage();
    await stranger.goto(`/en/invite/${token}`);
    await expect(
      stranger.getByText('Inviteco has invited you to join as member.'),
      'the offer must render, or a clean scan means nothing',
    ).toBeVisible();
    await scanSurface(
      stranger,
      `/invite/${token}`,
      '/invite/[token] (no session)',
      stranger.getByText('Inviteco has invited you to join as member.'),
    );
    await strangerContext.close();

    // 2 · the same token with an identity to bind to, which is the state that has the button.
    await signIn(page.context(), invitee.email);
    await page.goto(`/en/invite/${token}`);
    await expect(
      page.getByRole('button', { name: 'Accept invitation' }),
      'a signed-in invitee must be offered the action',
    ).toBeVisible();
    await scanSurface(
      page,
      `/invite/${token}`,
      '/invite/[token] (signed in)',
      page.getByRole('button', { name: 'Accept invitation' }),
    );
  });
});
