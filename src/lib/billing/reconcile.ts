import type { SubscriptionStatus } from './events';
import { measureStaleness } from './staleness';

/**
 * Scheduled reconciliation — SPEC-007 REQ-6, AC-6.
 *
 * **Why this exists at all.** Stripe retries a failed delivery for three days, and three days of
 * retries is also three days in which nothing may arrive: an endpoint that was down, a deploy that
 * dropped a delivery, an event that was accepted and whose `after()` work then failed — REQ-8 returns
 * a 2xx before doing the work, so Stripe has already been told the delivery succeeded and will never
 * send it again. Without a reconcile the system is correct only when the network was.
 *
 * **It trusts nothing that arrived.** The webhook path re-reads the subscription rather than applying
 * a payload (REQ-3); this path has no payload at all. It takes the subscriptions we believe we have
 * and asks Stripe what each one IS. That is the same question from the other direction, which is why
 * a drifted row is corrected here with no webhook involved — the property AC-6 names.
 *
 * Pure and injected, for the reason `events.ts` is: the world is four functions, so "a drifted row is
 * corrected" can be asserted rather than argued about, and none of it needs a Stripe account.
 */

export type EntitlementRow = {
  organizationId: string;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** When this row was last CONFIRMED against Stripe — REQ-7's bound is measured on it (AC-11). */
  entitlementSyncedAt: string | null;
};

export type ReconcileDeps = {
  /** Every entitlement that names a subscription, oldest confirmation first. */
  listEntitlements: () => Promise<EntitlementRow[]>;
  /** The authoritative current state, from Stripe. `null` when the subscription is gone. */
  readSubscription: (
    subscriptionId: string,
  ) => Promise<{ status: SubscriptionStatus; customerId: string } | null>;
  writeEntitlement: (input: {
    organizationId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }) => Promise<void>;
  /**
   * REQ-7's stated bound in seconds, or null when it could not be derived from the declared
   * schedule. Part of the world rather than a second argument, so `reconcile` keeps exactly one
   * parameter — there is still no place an event could arrive through.
   */
  thresholdSeconds: number | null;
};

/** Not exported: it is reached through `ReconcileReport`, and an export nothing imports is dead
 *  code the `unused` gate correctly refuses. */
type RowOutcome =
  | {
      organizationId: string;
      action: 'corrected';
      from: SubscriptionStatus;
      to: SubscriptionStatus;
    }
  | { organizationId: string; action: 'confirmed'; status: SubscriptionStatus }
  | { organizationId: string; action: 'unreadable'; subscriptionId: string }
  | { organizationId: string; action: 'skipped'; reason: string };

export type ReconcileReport = {
  examined: number;
  corrected: number;
  confirmed: number;
  unreadable: number;
  /** AC-11 — rows past REQ-7's bound, measured BEFORE this pass wrote anything. */
  stale: number;
  oldestAgeSeconds: number | null;
  /** False when the bound could not be derived; `stale` is then 0 because nothing was measured. */
  measured: boolean;
  outcomes: RowOutcome[];
};

/**
 * Reconcile every entitlement we hold against Stripe.
 *
 * **A row that agrees is still written**, and that is deliberate rather than wasteful.
 * `entitlement_synced_at` answers "when did we last CONFIRM this against Stripe", not "when did this
 * last change" — REQ-7 leans on exactly that reading, because under a rule that errs toward granting
 * the dangerous state is a row nobody has checked in a long time, not a row that has not changed.
 * Writing only on change would make an untouched row indistinguishable from an unchecked one, which
 * is the measurement AC-11's threshold has to be able to make.
 *
 * **A subscription Stripe no longer returns is left alone.** It is reported and not acted on: REQ-7
 * decided this system errs toward GRANTING, and a Stripe outage that answers `null` for everything
 * would otherwise revoke every customer at once — the failure that decision exists to prevent,
 * executed in bulk by the machinery meant to protect against drift.
 */
export async function reconcile(deps: ReconcileDeps, now = Date.now()): Promise<ReconcileReport> {
  const rows = await deps.listEntitlements();

  // **Measured here, before the loop writes anything.** The rows arrive oldest-confirmed first and
  // this pass is about to refresh every one it can reach, so a count taken afterwards would be
  // nearly zero by construction — and whatever remained would be a row the pass could not read,
  // which `unreadable` already reports. Taken before, it answers how well the PREVIOUS runs did,
  // which is the signal REQ-7 asks for.
  const staleness = measureStaleness(rows, deps.thresholdSeconds, now);

  const outcomes: RowOutcome[] = [];

  for (const row of rows) {
    if (!row.stripeSubscriptionId) {
      outcomes.push({
        organizationId: row.organizationId,
        action: 'skipped',
        reason: 'no subscription linked',
      });
      continue;
    }

    const live = await deps.readSubscription(row.stripeSubscriptionId);
    if (!live) {
      outcomes.push({
        organizationId: row.organizationId,
        action: 'unreadable',
        subscriptionId: row.stripeSubscriptionId,
      });
      continue;
    }

    const drifted = live.status !== row.status;
    await deps.writeEntitlement({
      organizationId: row.organizationId,
      status: live.status,
      stripeCustomerId: live.customerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
    });

    outcomes.push(
      drifted
        ? {
            organizationId: row.organizationId,
            action: 'corrected',
            from: row.status,
            to: live.status,
          }
        : { organizationId: row.organizationId, action: 'confirmed', status: live.status },
    );
  }

  return {
    examined: rows.length,
    stale: staleness.stale,
    oldestAgeSeconds: staleness.oldestAgeSeconds,
    measured: staleness.measured,
    corrected: outcomes.filter((o) => o.action === 'corrected').length,
    confirmed: outcomes.filter((o) => o.action === 'confirmed').length,
    unreadable: outcomes.filter((o) => o.action === 'unreadable').length,
    outcomes,
  };
}
