import { test, expect } from '../fixtures/auth';

/**
 * F-38, pinned — the finding this whole layer exists for.
 *
 * A unit test asserts the protected page calls `getCurrentUser` and redirects. It passes, and it is
 * correct. It cannot see that the HTTP status is 200 and the page chrome is served, because under
 * Cache Components the shell is prerendered and flushed before any session-dependent code runs.
 *
 * So this asserts what was MEASURED rather than what was assumed. **If a future Next release makes
 * the route refuse properly, these fail** — deliberately. That is a change worth being told about
 * rather than discovering later, and the spec's wording depends on it.
 */
test.describe('an unauthenticated caller at a protected route', () => {
  test('receives 200 and page chrome, not a redirect (F-38)', async ({ page }) => {
    const response = await page.goto('/orgs');

    // The measured status. Not what the requirement originally implied.
    expect(
      response?.status(),
      'F-38: the shell flushes before the session check can redirect',
    ).toBe(200);
    // Asserted on the RESPONSE BODY, not the rendered DOM: the client-side redirect to sign in wins
    // any race against a DOM query, which is what made the first version of this test fail while
    // the behaviour it describes was correct.
    expect(await response!.text(), 'the prerendered shell is served').toContain('Organizations');
  });

  test('receives NO tenant data — the property that actually matters', async ({ page, seed }) => {
    // Real rows exist while this runs, so an empty page is evidence rather than a coincidence.
    const owner = await seed.createUser('secret-owner');
    const orgId = await seed.createOrg(owner, 'Cartographers');
    await seed.createProject(owner, orgId, 'Undersea cable route');

    // The RESPONSE to /orgs, not the DOM afterwards.
    //
    // This read `await page.content()` and went red on CI with "Unable to retrieve content because
    // the page is navigating and changing the content" — the route answers 200 with a shell and then
    // client-side redirects to /login (F-38), so reading the live DOM races that navigation. Locally
    // it won the race every time; the runner lost it, which is F-42's shape a second time.
    //
    // Reading the response body is not a workaround, it is the better assertion: the property under
    // test is that the protected route's response carries no tenant data, and a response body is a
    // fixed artifact where the DOM is a moving one.
    const response = await page.goto('/orgs');
    const body = (await response!.text()).toLowerCase();

    expect(body, 'no organization name').not.toContain('cartographers');
    expect(body, 'no project name').not.toContain('undersea cable route');
    expect(body, 'no member identifier').not.toContain(owner.id);
    expect(body, 'no email').not.toContain(owner.email);
    // Nothing that even looks like an identifier.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  test('is navigated to sign in', async ({ page }) => {
    await page.goto('/orgs');
    // Client-side, because the status was already sent. Asserted on the destination rather than on
    // the mechanism, so this keeps passing if the mechanism improves.
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible();
  });

  test('a forged x-middleware-subrequest header changes nothing (GHSA-f82v-jwr5-mffw)', async ({
    page,
    seed,
  }) => {
    // The header that walked past middleware-based authorization in every Next.js app before
    // 15.2.3. keelblock's refusal is not in the proxy, so it has nothing to walk past.
    const owner = await seed.createUser('forge-target');
    const orgId = await seed.createOrg(owner, 'Ironmongers');
    await seed.createProject(owner, orgId, 'Forge schedule');

    await page.setExtraHTTPHeaders({ 'x-middleware-subrequest': 'proxy' });
    await page.goto('/orgs');

    const body = (await page.content()).toLowerCase();
    expect(body).not.toContain('ironmongers');
    expect(body).not.toContain('forge schedule');
  });
});
