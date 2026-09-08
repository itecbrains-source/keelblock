import { test, expect, signInThroughTheForm, recentSignInEmails } from '../fixtures/auth';
import { OrgsPage } from '../pages';

/**
 * Sign-in, as a person does it — the one test that spends an email.
 *
 * Every other test takes the fast path, because Supabase caps auth email at **two per hour**,
 * project-wide, and says it "can only be changed with your own custom SMTP setup" (DEF-019). This
 * one exists so the path a real user takes is still exercised: the form, the message, the inbox, the
 * link, the callback.
 *
 * Accessible locators throughout (SPEC-002 REQ-3b). If the email field loses its label or the button
 * its name, this fails — which is the payoff: the suite is an accessibility regression test for the
 * controls it touches, and bar B-7 is partly held by a test written for another reason.
 */
test('a person signs in with an emailed link and reaches their organizations', async ({
  page,
  seed,
}) => {
  // The quota is a property of the environment, not of the code, and a failure caused by it is a
  // false negative — the fastest way to teach a team to ignore a suite. CI starts a fresh stack so
  // this never skips there; locally it skips after a couple of manual sign-ins and says why.
  const spent = await recentSignInEmails();
  test.skip(
    spent >= 2,
    `the auth email quota is spent (${spent} sign-in emails in the last hour; the cap is 2 — DEF-019). ` +
      'This is the environment, not the code. It resets within the hour, and CI is unaffected.',
  );

  const user = await seed.createUser('signin');
  await seed.createOrg(user, 'Lighthouse');

  await signInThroughTheForm(page, user.email);

  const orgs = new OrgsPage(page);
  await orgs.goto();
  await expect(orgs.heading()).toBeVisible();
  await expect(orgs.membersHeading('Lighthouse')).toBeVisible();
  await expect(orgs.switcher()).toBeVisible();
});
