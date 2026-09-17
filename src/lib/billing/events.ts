import type { Database } from '@/lib/db/database.types';

/**
 * What a Stripe webhook delivery is allowed to do — SPEC-007 REQ-3 and REQ-5.
 *
 * Every rule this spec has about webhooks is about NOT TRUSTING THE DELIVERY: not its payload, not
 * its order, not the fact that it has arrived only once. So the logic lives here, injectable, and
 * the route below it does transport. Nothing in this file imports Stripe, opens a socket or reads an
 * environment variable — which is what makes the three properties provable without an account, and
 * is also why it can be read in one sitting.
 */

export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];

/**
 * The only shape of event this handler acts on.
 *
 * `data.object` admits unknown keys because a real payload has dozens — including `status`, which
 * this handler deliberately never reads. Modelling it as "at least an id" rather than as a full
 * subscription is the type-level statement of REQ-3: anything else in there is not input.
 */
export type StripeEventLike = {
  id: string;
  type: string;
  data: { object: { id?: string; object?: string } & Record<string, unknown> };
};

/**
 * The world, injected. Each of these is one query in production and one fake in a test, and the
 * split is what lets the ORDERING property be asserted rather than argued about.
 */
export type EventDeps = {
  /**
   * Record the event id, and answer whether this delivery is the first.
   *
   * REQ-5, and it is a uniqueness constraint rather than a check: `insert ... on conflict do
   * nothing`, then report whether a row appeared. Stripe documents that duplicates happen and that
   * `created` must not be used to tell them apart, because "distinct events can share a timestamp".
   */
  claim: (id: string, type: string) => Promise<boolean>;

  /**
   * The authoritative CURRENT state of a subscription, read from Stripe.
   *
   * REQ-3's whole mechanism. The handler never reads a status out of the payload — it takes the
   * subscription's ID from the payload and asks what that subscription is NOW. Two events delivered
   * backwards therefore end at the same query and the same answer, which is the only way to be
   * correct when the sender says: "Stripe doesn't guarantee the delivery of events in the order that
   * they're generated."
   */
  readSubscription: (
    subscriptionId: string,
  ) => Promise<{ status: SubscriptionStatus; customerId: string } | null>;

  /** Which organization a Stripe customer belongs to, or null if nothing is linked yet. */
  findOrganizationByCustomer: (customerId: string) => Promise<string | null>;

  writeEntitlement: (input: {
    organizationId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }) => Promise<void>;

  markProcessed: (eventId: string) => Promise<void>;
};

/** What happened, so a caller can log it and a test can assert on it without inspecting mocks. */
export type EventOutcome =
  | { action: 'duplicate' }
  | { action: 'ignored'; reason: string }
  | { action: 'unlinked'; customerId: string }
  | { action: 'applied'; organizationId: string; status: SubscriptionStatus };

/**
 * Events that change what an organization may do. Anything else is recorded and ignored.
 *
 * Deliberately a list rather than a prefix match: `customer.subscription.*` would silently absorb
 * an event type Stripe adds later, and this spec's whole posture on unknown inputs (REQ-7, the
 * status map) is that a new thing from the payment processor is a decision somebody makes, not a
 * default somebody inherits.
 */
/**
 * **REQ-4 lives here, as an absence.** Stripe's entitlement summary event is deliberately not in
 * this set, and the reason is worth stating where somebody would otherwise add it.
 *
 * MEASURED (memo 11, quoting Stripe): _"The entitlement summary's `entitlements.data` array contains
 * a maximum of 10 entitlements. If a customer has more than 10 active entitlements, use the
 * `entitlements.url` field in the payload"_ to fetch the rest. A handler that treats that array as
 * the complete set silently revokes everything past the tenth — in the expensive direction, on the
 * largest customers, while appearing to work.
 *
 * keelblock cannot make that mistake, and not by being careful: REQ-7 decided that entitlement is a
 * function of the SUBSCRIPTION STATUS alone, so the summary is never consulted at all. A truncated
 * list cannot mislead a reader that does not read it. That is a stronger guarantee than pagination
 * would be, and it is the same argument REQ-3 makes about payload statuses.
 *
 * Adding the summary type to this set would therefore not be a small change — it would reintroduce
 * the trap REQ-4 is about. `events.test.mts` asserts this set's contents so that doing it turns a
 * test red rather than passing quietly.
 *
 * Exported for that test.
 */
export const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

/**
 * Handle one delivery.
 *
 * The order of the three steps is the design, not an implementation detail:
 *
 *   1. CLAIM first. A duplicate stops here having done nothing, so processing is idempotent even if
 *      every later step is not.
 *   2. RE-READ, never apply. The payload contributes exactly one thing — which subscription.
 *   3. MARK processed last, so a crash between 2 and 3 leaves a row the reconcile can find rather
 *      than an event that looks finished.
 */
export async function handleEvent(event: StripeEventLike, deps: EventDeps): Promise<EventOutcome> {
  const first = await deps.claim(event.id, event.type);
  if (!first) return { action: 'duplicate' };

  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    await deps.markProcessed(event.id);
    return { action: 'ignored', reason: `not a subscription event: ${event.type}` };
  }

  const subscriptionId = event.data.object.id;
  if (!subscriptionId) {
    await deps.markProcessed(event.id);
    return { action: 'ignored', reason: 'no subscription id in payload' };
  }

  // Note what is NOT read here: `event.data.object.status`. It exists in a real payload and it is
  // the obvious thing to use. Using it would make the handler order-dependent — a `deleted` arriving
  // before the `updated` that preceded it would leave a cancelled customer entitled, and nothing in
  // the payload would let the handler notice.
  const subscription = await deps.readSubscription(subscriptionId);
  if (!subscription) {
    await deps.markProcessed(event.id);
    return { action: 'ignored', reason: 'subscription no longer retrievable' };
  }

  const organizationId = await deps.findOrganizationByCustomer(subscription.customerId);
  if (!organizationId) {
    // Not an error. Until Checkout links a customer to an organization there is nothing to attribute
    // this to, and the event is recorded so the reconcile can see it was seen.
    await deps.markProcessed(event.id);
    return { action: 'unlinked', customerId: subscription.customerId };
  }

  await deps.writeEntitlement({
    organizationId,
    status: subscription.status,
    stripeCustomerId: subscription.customerId,
    stripeSubscriptionId: subscriptionId,
  });
  await deps.markProcessed(event.id);
  return { action: 'applied', organizationId, status: subscription.status };
}
