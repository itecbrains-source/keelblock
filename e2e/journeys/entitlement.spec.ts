import { test, expect } from '../fixtures/auth';
import { signIn } from '../fixtures/auth';
import { ProjectsPage } from '../pages';

/**
 * SPEC-007 AC-8 — an organization is refused a paid surface, then granted it.
 *
 * The evidence for REQ-1: *the entitlement is a row, read by a policy, per request.* Every other
 * assertion about that lives in pgTAP, where it is asserted against the catalog. This is the layer
 * that answers a different question — **does a person actually meet the refusal, and can they tell
 * what happened?** F-38 is why that is a separate layer: a unit test can confirm a component calls
 * the right function and cannot observe what was served.
 *
 * Two properties are walked here, and the second is the one that is easy to get wrong:
 *
 *   1. Unentitled, the create form is REFUSED — by the database, and the person is told why.
 *   2. The row changes, and **the very next request succeeds**. No new session, no sign-out, no
 *      token refresh. That is REQ-1's whole argument made visible: entitlement is read per request,
 *      so a change takes effect on the next one rather than at token expiry.
 */
test.describe('a paid surface, refused and then granted', () => {
  test('an unentitled organization is refused, and the same session succeeds once the row changes', async ({
    page,
    seed,
  }) => {
    const dana = await seed.createUser('dana');
    const org = await seed.createOrg(dana, 'Danaworks');
    // No `entitle` call. A new organization has NO entitlement row at all, which is the state a real
    // one is in before it ever reaches Checkout — and the case a test is most likely to skip.

    await signIn(page.context(), dana.email);
    const projects = new ProjectsPage(page);
    await projects.goto();
    await expect(projects.heading()).toBeVisible();

    // THE FORM IS OFFERED. It is not hidden behind an entitlement read, because hiding it would put
    // the access decision in application code — the one thing this project refuses to do. What
    // follows is the database declining, not the interface declining on its behalf.
    await projects.create('Refused plan');

    await expect(projects.outcome(), 'the refusal is shown, not swallowed').toContainText(
      'paid plan',
    );
    await expect(
      projects.project('Refused plan'),
      'and nothing was created behind the message',
    ).toHaveCount(0);

    // Stripe says they have paid. Nothing else changes: same browser, same cookies, same session.
    await seed.entitle(org, 'active');

    await projects.create('Granted plan');
    await expect(
      projects.project('Granted plan'),
      'the next request is entitled — not the next token',
    ).toBeVisible();
  });

  test('a lapse takes away creating, and leaves everything already made', async ({
    page,
    seed,
  }) => {
    // The owner's decision of 2026-09-17, walked: INSERT only. A subscription ending must not make
    // an organization's own work disappear — "keep what you have, you cannot add more".
    const evan = await seed.createUser('evan');
    const org = await seed.createOrg(evan, 'Evanco');
    await seed.entitle(org, 'active');
    await seed.createProject(evan, org, 'Made while paying');

    await signIn(page.context(), evan.email);
    const projects = new ProjectsPage(page);
    await projects.goto();
    await expect(projects.project('Made while paying')).toBeVisible();

    await seed.entitle(org, 'canceled');
    await page.reload();

    await expect(
      projects.project('Made while paying'),
      'a cancelled subscription does not hide work the organization already owns',
    ).toBeVisible();

    await projects.create('After the lapse');
    await expect(projects.outcome()).toContainText('paid plan');
    await expect(projects.project('After the lapse')).toHaveCount(0);
  });
});
