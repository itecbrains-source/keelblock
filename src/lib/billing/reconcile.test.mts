import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reconcile, type ReconcileDeps, type EntitlementRow } from './reconcile';
import type { SubscriptionStatus } from './events';

/**
 * SPEC-007 AC-6 (REQ-6) — an entitlement that drifted from Stripe is corrected by the reconcile
 * **without any webhook arriving**.
 *
 * The "without any webhook" half is structural rather than asserted: nothing in this file constructs
 * an event, and `reconcile` has no parameter that could carry one. A delivery cannot reach this path.
 */

/** A world where Stripe's answer and our stored answer can be set independently — which is the
 *  whole subject: reconciliation only means anything when the two disagree. */
function world(rows: EntitlementRow[], stripe: Record<string, SubscriptionStatus | null>) {
  const writes: { organizationId: string; status: SubscriptionStatus }[] = [];
  let reads = 0;
  const deps: ReconcileDeps = {
    listEntitlements: async () => rows,
    readSubscription: async (id) => {
      reads += 1;
      const status = stripe[id];
      return status ? { status, customerId: `cus_${id}` } : null;
    },
    writeEntitlement: async ({ organizationId, status }) => {
      writes.push({ organizationId, status });
    },
  };
  return { deps, writes, reads: () => reads };
}

const row = (
  organizationId: string,
  status: SubscriptionStatus,
  stripeSubscriptionId: string | null = `sub_${organizationId}`,
): EntitlementRow => ({
  organizationId,
  status,
  stripeCustomerId: `cus_${organizationId}`,
  stripeSubscriptionId,
});

describe('AC-6 · a drifted entitlement is corrected with no webhook', () => {
  it('MUTATION: a row that says active while Stripe says canceled is corrected', async () => {
    // The missed-event case: the `deleted` webhook never arrived, or arrived and its after() work
    // failed after the 2xx was already sent. Nothing will ever redeliver it.
    const w = world([row('orgA', 'active')], { sub_orgA: 'canceled' });

    const report = await reconcile(w.deps);

    expect(w.writes).toEqual([{ organizationId: 'orgA', status: 'canceled' }]);
    expect(report.corrected).toBe(1);
    expect(report.outcomes[0]).toEqual({
      organizationId: 'orgA',
      action: 'corrected',
      from: 'active',
      to: 'canceled',
    });
  });

  it('corrects in the GRANTING direction too — a paid customer wrongly locked out', async () => {
    // The expensive one, and the direction REQ-7 cares most about: an organization that has paid and
    // whose row still says otherwise is being refused something it bought.
    const w = world([row('orgB', 'canceled')], { sub_orgB: 'active' });
    const report = await reconcile(w.deps);
    expect(w.writes).toEqual([{ organizationId: 'orgB', status: 'active' }]);
    expect(report.corrected).toBe(1);
  });

  it('a row that AGREES is still written, so synced_at means "last confirmed"', async () => {
    // Not wasteful — load-bearing. REQ-7 says a stale row alerts rather than ageing quietly, and
    // that only works if an untouched row is distinguishable from an unchecked one. Writing only on
    // change makes them identical, which is the measurement AC-11's threshold has to make.
    const w = world([row('orgC', 'active')], { sub_orgC: 'active' });
    const report = await reconcile(w.deps);
    expect(w.writes).toEqual([{ organizationId: 'orgC', status: 'active' }]);
    expect(report.confirmed).toBe(1);
    expect(report.corrected).toBe(0);
  });

  it('MUTATION: a subscription Stripe will not return is REPORTED, never revoked', async () => {
    // The bulk-failure case. REQ-7 decided this system errs toward GRANTING; a Stripe outage
    // answering null for everything would otherwise revoke every customer at once — the exact
    // failure that decision exists to prevent, executed by the machinery meant to prevent drift.
    const w = world([row('orgD', 'active')], { sub_orgD: null });

    const report = await reconcile(w.deps);

    expect(w.writes, 'an unreadable subscription must not change anything').toEqual([]);
    expect(report.unreadable).toBe(1);
    expect(report.outcomes[0]).toMatchObject({ action: 'unreadable' });
  });

  it('a row with no subscription linked is skipped rather than read', async () => {
    const w = world([row('orgE', 'canceled', null)], {});
    const report = await reconcile(w.deps);
    expect(w.reads(), 'nothing to ask Stripe about').toBe(0);
    expect(report.outcomes[0]).toMatchObject({ action: 'skipped' });
  });

  it('every row is examined — one failure does not end the run', async () => {
    // A reconcile that stops at the first unreadable subscription leaves the rest unreconciled and
    // reports success, which is worse than not running.
    const w = world([row('org1', 'active'), row('org2', 'active'), row('org3', 'active')], {
      sub_org1: 'canceled',
      sub_org2: null,
      sub_org3: 'past_due',
    });

    const report = await reconcile(w.deps);

    expect(report.examined).toBe(3);
    expect(report.corrected).toBe(2);
    expect(report.unreadable).toBe(1);
    expect(w.writes.map((x) => x.organizationId)).toEqual(['org1', 'org3']);
  });

  it('no webhook can reach this path — it is structural, not a rule', () => {
    // `reconcile` takes exactly one argument and it is the world. There is no parameter an event
    // could arrive through, which is what makes "without any webhook arriving" a fact about the
    // signature rather than a claim about the test.
    expect(reconcile.length).toBe(1);
  });
});

describe('the reconcile is actually scheduled — REQ-6 says "scheduled", not "schedulable"', () => {
  it('vercel.json runs the reconcile route on a cron', () => {
    // Without this the endpoint is a URL nobody calls, and REQ-6's whole argument — that three days
    // of Stripe retries is also three days in which nothing may arrive — would be answered by a
    // mechanism that never runs. A route that exists is not a schedule.
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons?: { path: string; schedule: string }[];
    };
    const cron = config.crons?.find((c) => c.path === '/api/cron/reconcile');
    expect(cron, 'no cron entry points at the reconcile route').toBeDefined();
    expect(cron?.schedule, 'a cron expression has five fields').toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });
});
