import 'server-only';
import { createAdminClient } from '@/lib/supabase/server-only/admin';
import { createStripeClient, customerIdOf, narrowStatus } from './stripe';
import type { EventDeps, SubscriptionStatus } from '../events';
import type { ReconcileDeps, EntitlementRow } from '../reconcile';

/**
 * The world, wired — SPEC-007 REQ-5, REQ-6.
 *
 * `events.ts` and `reconcile.ts` are pure and take their world as an argument, which is what makes
 * their properties assertable without a Stripe account. This is the one place that world is real,
 * and it is deliberately the only file in the repository that holds both the service-role client and
 * the Stripe API client at once.
 *
 * **Every database write goes through a `SECURITY DEFINER` function, not through a table.**
 * `service_role` holds no privilege on any tenant table and this is why it can still stay that way:
 * `20260917140000` records the measurement that a table grant of any width makes `service_role` a
 * probed identity on every tenant table and turns five suites `UNRELIABLE` (F-81). EXECUTE on four
 * named functions costs nothing and permits strictly less.
 */

/**
 * Unwrap a Supabase RPC result, or throw with the function's name in the message.
 *
 * Every call below is typed against the GENERATED `Database` types, which name these five functions
 * because the `generated` gate regenerates that file from the live schema. Nothing here is cast: if a
 * migration renames an argument, this stops compiling rather than failing at runtime in a background
 * task nobody is watching.
 */
async function unwrap<T>(
  fn: string,
  call: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}

/** REQ-5 / REQ-3 — what one webhook delivery is allowed to do. */
export function eventDeps(): EventDeps {
  const db = createAdminClient();
  const stripe = createStripeClient();

  return {
    claim: async (id, type) =>
      (await unwrap(
        'claim_stripe_event',
        db.rpc('claim_stripe_event', { event_id: id, event_type: type }),
      )) === true,

    readSubscription: async (subscriptionId) => {
      // REQ-3's mechanism: the payload contributed the id and nothing else, and this asks what that
      // subscription IS. Two events delivered backwards therefore end at the same answer.
      const s = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null);
      if (!s) return null;
      const customerId = customerIdOf(s.customer as string | { id: string } | null);
      if (!customerId) return null;
      return { status: narrowStatus(s.status) as SubscriptionStatus, customerId };
    },

    findOrganizationByCustomer: async (customerId) =>
      (await unwrap(
        'organization_for_stripe_customer',
        db.rpc('organization_for_stripe_customer', { customer: customerId }),
      )) ?? null,

    writeEntitlement: async ({
      organizationId,
      status,
      stripeCustomerId,
      stripeSubscriptionId,
    }) => {
      await unwrap(
        'write_entitlement',
        db.rpc('write_entitlement', {
          org: organizationId,
          new_status: status,
          customer: stripeCustomerId,
          subscription: stripeSubscriptionId,
        }),
      );
    },

    markProcessed: async (eventId) => {
      await unwrap(
        'mark_stripe_event_processed',
        db.rpc('mark_stripe_event_processed', { event_id: eventId }),
      );
    },
  };
}

/** REQ-6 — what the scheduled reconcile is allowed to do. No claim, no ledger: it has no delivery. */
export function reconcileDeps(): ReconcileDeps {
  const db = createAdminClient();
  // The Stripe reads are the SAME operation the webhook performs — ask what a subscription IS — so
  // they are shared rather than re-implemented. A second copy is a second place for REQ-3's rule to
  // be got wrong, and the reconcile is the path nobody watches.
  const events = eventDeps();

  return {
    listEntitlements: async () => {
      const rows = await unwrap('entitlements_to_reconcile', db.rpc('entitlements_to_reconcile'));
      return (rows ?? []).map((r): EntitlementRow => ({
        organizationId: r.organization_id,
        status: r.status,
        stripeCustomerId: r.stripe_customer_id,
        stripeSubscriptionId: r.stripe_subscription_id,
      }));
    },
    readSubscription: events.readSubscription,
    writeEntitlement: events.writeEntitlement,
  };
}
