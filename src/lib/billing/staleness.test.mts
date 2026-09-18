import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cronIntervalSeconds, stalenessThresholdSeconds, measureStaleness } from './staleness';
import { reconcile, type EntitlementRow, type ReconcileDeps } from './reconcile';
import type { SubscriptionStatus } from './events';

/**
 * SPEC-007 AC-11 (REQ-7) — a row whose `entitlement_synced_at` is older than the threshold raises an
 * alert, and one inside it does not.
 *
 * The owner decided the bound on 2026-09-17: **six MISSED RUNS**, expressed as a multiple of the
 * cron interval rather than as a number of hours. Since AC-6 the reconcile refreshes every row on
 * every pass, so a stale row means OUR job is down rather than that Stripe is — which retires the
 * 72-hour anchor that was tied to Stripe's retry window.
 */

const HOUR = 3600;
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

describe('the bound is a multiple of the schedule, not a number of hours', () => {
  it('reads the schedules vercel.json can hold', () => {
    expect(cronIntervalSeconds('0 * * * *')).toBe(HOUR);
    expect(cronIntervalSeconds('0 ' + '*/6' + ' * * *')).toBe(6 * HOUR);
    expect(cronIntervalSeconds('*/15 * * * *')).toBe(15 * 60);
  });

  it('refuses to guess at a schedule it cannot read', () => {
    // A threshold derived from an unparsed expression is a number with no meaning, and acting on it
    // is worse than not having it.
    expect(cronIntervalSeconds('@daily')).toBeNull();
    expect(cronIntervalSeconds('0 0 1 * *')).toBeNull();
    expect(cronIntervalSeconds('')).toBeNull();
    expect(stalenessThresholdSeconds('@daily', 6)).toBeNull();
  });

  it('MUTATION: changing the SCHEDULE moves the threshold — the reason it is not six hours', () => {
    // Hardcode "6 hours" and the day someone sets a six-hourly cron it silently becomes ONE missed
    // run. The threshold would change meaning through vercel.json, a file nobody thinks of as
    // billing — F-80's decay shape arriving through a different door.
    expect(stalenessThresholdSeconds('0 * * * *', 6)).toBe(6 * HOUR);
    expect(stalenessThresholdSeconds('0 ' + '*/6' + ' * * *', 6)).toBe(36 * HOUR);
  });

  it('the declared config and the declared schedule agree with each other', () => {
    // Both halves live in files that state them. This asserts the RELATIONSHIP rather than the
    // product, so neither file can drift into meaning something else on its own.
    const billing = JSON.parse(readFileSync('keelblock.billing.json', 'utf8'));
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const schedule = vercel.crons.find(
      (c: { path: string }) => c.path === '/api/cron/reconcile',
    )?.schedule;

    expect(schedule, 'the reconcile must actually be scheduled').toBeDefined();
    expect(billing.staleness.missedRuns, "the owner's decision, 2026-09-17").toBe(6);
    const threshold = stalenessThresholdSeconds(schedule, billing.staleness.missedRuns);
    expect(threshold).not.toBeNull();
    expect(threshold).toBe(6 * (cronIntervalSeconds(schedule) ?? 0));
  });
});

describe('staleness is measured on the oldest row', () => {
  it('MUTATION: a row past the bound is counted', () => {
    const m = measureStaleness([{ entitlementSyncedAt: ago(7 * HOUR) }], 6 * HOUR, Date.now());
    expect(m.stale).toBe(1);
    expect(m.measured).toBe(true);
    expect(m.oldestAgeSeconds).toBeGreaterThan(6 * HOUR);
  });

  it('a row INSIDE the bound is not — AC-11 needs both directions', () => {
    const m = measureStaleness([{ entitlementSyncedAt: ago(5 * HOUR) }], 6 * HOUR, Date.now());
    expect(m.stale).toBe(0);
    expect(m.measured).toBe(true);
  });

  it('reports that it could not measure rather than reporting zero', () => {
    // `stale: 0` and "I could not tell" are different facts, and collapsing them is how a silent
    // paywall happens in the other direction — an alert that never fires because nothing measured.
    const m = measureStaleness([{ entitlementSyncedAt: ago(99 * HOUR) }], null, Date.now());
    expect(m.measured).toBe(false);
    expect(m.stale).toBe(0);
    expect(
      m.oldestAgeSeconds,
      'the age is still reported, so the number is not lost',
    ).toBeGreaterThan(0);
  });

  it('an empty table is not stale, and has no oldest age', () => {
    expect(measureStaleness([], 6 * HOUR, Date.now())).toEqual({
      stale: 0,
      oldestAgeSeconds: null,
      measured: true,
    });
  });
});

// ── the whole pass, and the ordering property the design turns on ───────────────────────────────

describe('AC-11 · measured BEFORE the pass writes, not after', () => {
  const world = (rows: EntitlementRow[], threshold: number | null): ReconcileDeps => ({
    listEntitlements: async () => rows,
    readSubscription: async () => ({ status: 'active' as SubscriptionStatus, customerId: 'cus_x' }),
    writeEntitlement: async () => {},
    thresholdSeconds: threshold,
  });

  const stale = (id: string): EntitlementRow => ({
    organizationId: id,
    status: 'active',
    stripeCustomerId: `cus_${id}`,
    stripeSubscriptionId: `sub_${id}`,
    entitlementSyncedAt: ago(9 * HOUR),
  });

  it('MUTATION: a pass that refreshes every row still reports the rows that WERE stale', () => {
    // The design decision, as a test. This pass reads every row and rewrites every one of them, so a
    // count taken AFTER it would be zero by construction — and the check would never fire for the
    // case it exists to catch. Measured at read time, it answers how well the PREVIOUS runs did.
    return reconcile(world([stale('a'), stale('b')], 6 * HOUR)).then((report) => {
      expect(report.stale, 'both rows were past the bound when the pass began').toBe(2);
      expect(report.examined).toBe(2);
      expect(report.measured).toBe(true);
      expect(report.oldestAgeSeconds).toBeGreaterThan(6 * HOUR);
    });
  });

  it('a healthy table reports nothing stale', async () => {
    const fresh: EntitlementRow = { ...stale('c'), entitlementSyncedAt: ago(30 * 60) };
    const report = await reconcile(world([fresh], 6 * HOUR));
    expect(report.stale).toBe(0);
    expect(report.measured).toBe(true);
  });

  it('an underivable threshold reports measured:false rather than a false all-clear', async () => {
    const report = await reconcile(world([stale('d')], null));
    expect(report.measured).toBe(false);
    expect(report.stale).toBe(0);
  });
});
