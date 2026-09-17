import Stripe from 'stripe';

/**
 * Verify a webhook delivery and return the event, or throw — SPEC-007 REQ-8, AC-7.
 *
 * **Stripe's own verifier, not a hand-rolled HMAC.** This is the one place where being clever is
 * indistinguishable from being wrong: their implementation is the reference for the scheme their
 * sender uses, and it checks both halves — the signature over the raw body, and a timestamp
 * tolerance that makes a captured delivery replayed later stale.
 *
 * `constructEvent` throws `StripeSignatureVerificationError` for a forged signature and for an
 * out-of-tolerance timestamp alike, which is why the route treats every failure identically. A
 * caller who cannot produce a valid signature learns nothing about which half they failed.
 *
 * **No `server-only` here, deliberately, and the reason is a measurement.** That package throws when
 * imported outside a React Server context — confirmed under vitest — so a verifier behind it would
 * be a rule about unauthenticated external traffic that no unit test could execute. The secret it
 * handles is passed in rather than read from the environment, so the module holds no credential of
 * its own and there is nothing here for `server-only` to protect.
 *
 * The API client that READS subscriptions is a different thing and is not in this file. It carries
 * the secret key, it belongs behind `server-only`, and it arrives with the increment that needs it —
 * which keeps AC-2's future rule ("no module on a request path imports the Stripe client") down to
 * one allowed file rather than two.
 */
export function verifyDelivery(input: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
  toleranceSeconds?: number;
}): Stripe.Event {
  const stripe = new Stripe(input.webhookSecret);
  return stripe.webhooks.constructEvent(
    input.rawBody,
    input.signatureHeader,
    input.webhookSecret,
    input.toleranceSeconds,
  );
}

/** Build a signed header, for tests and for a local `stripe trigger` harness. */
export function signForTest(input: {
  rawBody: string;
  webhookSecret: string;
  timestampSeconds?: number;
}): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload: input.rawBody,
    secret: input.webhookSecret,
    timestamp: input.timestampSeconds,
  });
}
