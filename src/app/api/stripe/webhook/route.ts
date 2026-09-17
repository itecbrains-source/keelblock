import { after, NextResponse, type NextRequest } from 'next/server';
import { verifyDelivery } from '@/lib/billing/verify';

/**
 * The Stripe webhook — SPEC-007 REQ-8.
 *
 * ADR-011 draws the architecture down this line: Server Actions for the app, **Route Handlers for
 * the outside world**. This is the first route handler in the repository that receives
 * unauthenticated external traffic, and `check-boundaries` has walked `route.ts` since before it
 * existed, naming this file as the reason.
 *
 * Two rules, and both are about the order things happen in.
 *
 * **Verify before acting.** The signature is checked over the RAW body — `request.text()`, never
 * `request.json()`, because parsing and re-serialising changes the bytes the signature covers and
 * every verification would fail for a reason nobody could find. A stale timestamp is refused on the
 * same path, so a captured delivery replayed tomorrow is not a delivery.
 *
 * **Return before working.** Stripe: "you must return a 200 response before updating a customer's
 * invoice as paid". An endpoint that does the work first is one timeout away from being retried for
 * three days — and under REQ-7's decision to err toward granting, a retry storm during an outage is
 * the expensive direction. `after()` is what makes the 2xx honest rather than a promise: the
 * response is already committed when the handler runs.
 *
 * The cost of that is real and named rather than hidden: work that fails inside `after()` will not
 * be retried by Stripe, because Stripe has already been told the delivery succeeded. REQ-6's
 * scheduled reconcile is what closes it, and the event ledger's null `processed_at` is what it looks
 * for. This endpoint is therefore correct only as half of a pair, and the other half is not built.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Refuse rather than accept-and-drop. An endpoint that 200s while unable to verify anything is
    // indistinguishable from a working one, and Stripe would stop retrying on the strength of it.
    console.error(
      'stripe webhook: STRIPE_WEBHOOK_SECRET is not set; refusing to accept deliveries',
    );
    return new NextResponse('not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new NextResponse('missing signature', { status: 400 });

  const rawBody = await request.text();

  let event;
  try {
    event = verifyDelivery({ rawBody, signatureHeader: signature, webhookSecret: secret });
  } catch {
    // One answer for every failure, carrying no detail — the same posture as the auth callback. An
    // unsigned body, a forged signature and a stale timestamp are one thing to a caller who cannot
    // sign: rejected. Telling them which half they failed is an oracle for the half they did not.
    return new NextResponse('invalid signature', { status: 400 });
  }

  // Accepted. Everything past this line runs after the response is committed.
  after(async () => {
    // The handler and its dependencies are wired in the increment that adds the reconcile — the
    // logic is already written and proven in `src/lib/billing/events.ts` (AC-3, AC-5), but its deps
    // need the service-role client, which is imported by nothing today (DEF-004). Logging the
    // accepted id keeps the endpoint honest in the meantime: it says what it took responsibility for
    // rather than implying it did the work.
    console.info(`stripe webhook: accepted ${event.id} (${event.type})`);
  });

  return NextResponse.json({ received: true });
}
