import { after, NextResponse, type NextRequest } from 'next/server';
import { verifyDelivery } from '@/lib/billing/verify';
import { handleEvent } from '@/lib/billing/events';
import { eventDeps } from '@/lib/billing/server-only/deps';

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
 * for. **Both halves of that pair now exist** — the other is `src/app/api/cron/reconcile/route.ts`.
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
    // Wired as of the reconcile increment. The logic is `src/lib/billing/events.ts` — claim, re-read,
    // write, mark — and it is proven there without a Stripe account (AC-3, AC-5). This supplies the
    // real world: the service-role client and the Stripe API client, the only place both are held.
    try {
      // **The payload is narrowed here, and the narrowing is REQ-3 expressed as a type.** Stripe's
      // `Event` carries the whole object — including `status`, which this handler must never read,
      // because a `deleted` arriving before the `updated` that preceded it would leave a cancelled
      // customer entitled. Passing the raw event would make that mistake merely discouraged; copying
      // out the three fields the handler is allowed to see makes it unavailable. Anything else in
      // there is not input, and now it cannot be.
      const object = event.data.object as { id?: string; object?: string };
      const outcome = await handleEvent(
        {
          id: event.id,
          type: event.type,
          data: { object: { id: object.id, object: object.object } },
        },
        eventDeps(),
      );
      console.info(`stripe webhook: ${event.id} (${event.type}) → ${outcome.action}`);
    } catch (error) {
      // Swallowed on purpose, and this is the cost REQ-8 named rather than an oversight. The 2xx is
      // already sent, so throwing here cannot make Stripe retry — it would only crash the task. The
      // event's `processed_at` stays null, which is exactly what REQ-6's reconcile looks for, so the
      // failure is recoverable rather than lost. Logged loudly because a silent one is not.
      console.error(
        `stripe webhook: ${event.id} (${event.type}) FAILED after the 2xx — left unprocessed for ` +
          `the reconcile: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return NextResponse.json({ received: true });
}
