import 'server-only';
import Stripe from 'stripe';

/**
 * The Stripe API client — SPEC-007, and the file `verify.ts` promised would arrive separately.
 *
 * It is not in `verify.ts` on purpose. That module verifies a signature over bytes, holds no
 * credential of its own, and must be unit-testable; this one carries the **secret key** and makes
 * network calls. Keeping them apart is what keeps AC-2's rule down to the entry points whose job is
 * genuinely Stripe, rather than dragging the signature verifier into the same allowance.
 *
 * `server-only` makes importing it from a client component a build error. It is the cheapest
 * boundary available and it is not optional for a module holding a secret key.
 *
 * **Nothing on a user's request path may reach this** (REQ-2): an entitlement is a row this database
 * answers, never a value read back from Stripe, so no authorization decision waits on a third party
 * being reachable. `check-boundaries` enforces that by walking the import graph, and the only entry
 * points allowed to arrive here are the webhook and the reconcile — both of which exist to talk to
 * Stripe and neither of which authorizes anybody.
 */
export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Refuse rather than construct a client that fails on first use with a vaguer message.
    throw new Error(
      'STRIPE_SECRET_KEY is not set. The webhook handler and the reconcile both read the ' +
        'authoritative subscription from Stripe (REQ-3), and neither can run without it.',
    );
  }
  return new Stripe(key);
}

/**
 * Stripe's subscription status, narrowed to the enum this database stores.
 *
 * **It throws on anything unrecognised rather than defaulting**, which is the same decision
 * `status_entitles` makes in SQL and for the same reason: REQ-7 maps every documented status
 * explicitly, so a status added later is a decision about money and access rather than a default
 * somebody inherits. A silent fallback to `canceled` would revoke a paying customer; one to `active`
 * would give the product away. Both silent directions are wrong.
 */
const KNOWN = new Set([
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export function narrowStatus(status: string): string {
  if (!KNOWN.has(status)) {
    throw new Error(
      `Unmapped Stripe subscription status: ${status}. SPEC-007 REQ-7 maps every documented ` +
        `status explicitly; a new one is a decision about money and access, so it fails here.`,
    );
  }
  return status;
}

/** The customer id, whichever shape Stripe expanded it into. */
export function customerIdOf(customer: string | { id: string } | null): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}
