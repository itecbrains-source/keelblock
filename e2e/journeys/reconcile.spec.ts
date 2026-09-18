import { test, expect } from '../fixtures/auth';
import { readFileSync } from 'node:fs';

/**
 * The scheduled reconcile, over HTTP — SPEC-007 REQ-6 and **AC-11's claim, executed**.
 *
 * **Why this file exists.** AC-11's logic was proven in `src/lib/billing/staleness.test.mts` and the
 * route that turns `report.stale` into a status code was not executed by anything: no journey, no CI
 * step, no `CRON_SECRET` outside `.env.example`. The only two states anyone had ever observed were
 * `500 "not configured"` with and without a token — the handler short-circuits before the auth check
 * when the secret is unset, so **no-auth and wrong-auth were indistinguishable**, and the
 * constant-time comparison had never run in a request.
 *
 * That is F-74's shape — "every defect in this file lives in the lines of main() that no test
 * executes" — and F-76's: a correct component behind a composition nobody runs. A proven measurement
 * and an unexecuted status code are not the same claim.
 *
 * **On the dummy Stripe key.** The journey step sets `STRIPE_SECRET_KEY` to a value that cannot
 * authenticate, so every subscription comes back unreadable. That is deliberate and it does not
 * weaken what is asserted here: staleness is measured BEFORE the pass writes anything, so the status
 * code under test is reached whether or not Stripe answers — and an unreadable subscription is never
 * revoked (REQ-7's direction), so the row stays exactly as seeded and the assertions are
 * deterministic. What this file does NOT prove is a correction round-trip; that needs an account and
 * is the Definition of Done's open item.
 */

const RECONCILE = '/api/cron/reconcile';

/** The bound, derived the way the route derives it — from the two files that declare its halves. */
function boundSeconds() {
  const billing = JSON.parse(readFileSync('keelblock.billing.json', 'utf8'));
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const schedule: string = vercel.crons.find(
    (c: { path: string }) => c.path === RECONCILE,
  )?.schedule;
  const hourly = /^\d+\s\*\s\*\s\*\s\*$/.test(schedule);
  expect(hourly, `this test assumes an hourly schedule; vercel.json says "${schedule}"`).toBe(true);
  return 3600 * billing.staleness.missedRuns;
}

test.describe('the reconcile endpoint, as the scheduler reaches it', () => {
  test('refuses an unauthenticated caller, and a wrong token, distinguishably', async ({
    request,
  }) => {
    // Both were 500 before CRON_SECRET was set anywhere, which made them the same event to anyone
    // reading logs. With the secret present they separate, and the constant-time comparison in
    // src/lib/billing/constant-time.ts runs in a request for the first time.
    const noHeader = await request.get(RECONCILE);
    expect(noHeader.status(), 'no Authorization header').toBe(401);

    const wrongToken = await request.get(RECONCILE, {
      headers: { Authorization: 'Bearer not-the-secret-value' },
    });
    expect(wrongToken.status(), 'a wrong bearer token').toBe(401);
  });

  test('a row past the staleness bound makes the run report non-200 — AC-11, over HTTP', async ({
    request,
    seed,
  }) => {
    const owner = await seed.createUser('recon-stale');
    const org = await seed.createOrg(owner, 'Staleco');

    // Older than the bound, and naming a subscription — `entitlements_to_reconcile` returns only
    // rows that name one, so a row without it is invisible to the measurement.
    await seed.entitle(org, 'active', {
      subscriptionId: 'sub_e2e_stale',
      confirmedSecondsAgo: boundSeconds() + 3600,
    });

    const response = await request.get(RECONCILE, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    expect(response.status(), 'a stale entitlement must not answer 200').not.toBe(200);
    const body = await response.json();
    // Asserted on the COUNT, not only the status: a bare status assertion is green for a bad deploy
    // or a Stripe timeout too, so it would pass for defects this test exists to exclude.
    expect(body.measured, 'the bound must be derivable, or nothing was measured').toBe(true);
    expect(body.stale).toBeGreaterThanOrEqual(1);
    expect(body.oldestAgeSeconds).toBeGreaterThan(boundSeconds());
  });

  test('a freshly confirmed row answers 200 with nothing stale — the other direction', async ({
    request,
    seed,
  }) => {
    // AC-11 is two claims: past the bound raises it, inside it does not. A test that only asserted
    // the alarm would be satisfied by a route that always alarms.
    const owner = await seed.createUser('recon-fresh');
    const org = await seed.createOrg(owner, 'Freshco');

    await seed.entitle(org, 'active', {
      subscriptionId: 'sub_e2e_fresh',
      confirmedSecondsAgo: 60,
    });

    const response = await request.get(RECONCILE, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.measured).toBe(true);
    expect(body.stale).toBe(0);
    expect(
      body.examined,
      'the row was seen, so a zero is an answer rather than an empty table',
    ).toBeGreaterThanOrEqual(1);
  });
});
