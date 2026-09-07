# ADR-006: Billing — Stripe is the billing engine, the database is the entitlement authority

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect, owner

## Context

Billing is where a starter earns or destroys trust, because the failure modes are financial and
mostly silent. The patterns are well established; there is little to invent and a lot to get exactly
right. Research puts four failures ahead of the rest:

- Stripe delivers webhooks **at least once, not exactly once** — a non-idempotent handler produces
  duplicate subscriptions and double fulfilment.
- Treating Stripe as the access-control source of truth couples every permission check to a third-party
  API call that can be slow, rate-limited, or down.
- Mid-cycle plan changes without proration cause disputes.
- SaaS without dunning loses **10–20% of MRR** to involuntary churn — the largest single number in the
  whole research pass.

## Decision

**Chosen:**

1. **Stripe is the billing engine; the database defines entitlements.** Access checks read a local
   table, never Stripe. Webhooks reconcile Stripe → database, one direction.
2. **Idempotency by stored `event.id`** in a `processed_stripe_events` table, checked before any effect.
3. **Four events minimum**, each tested: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. **Customer portal**, not hand-built subscription management. Cancellation, card update and invoice
   history are Stripe's problem and it solves them better.
5. **Proration explicit** (`create_prorations`), previewed before confirmation.
6. **Money as integer cents** everywhere. No floats, one canonical path, displays are views of it.
7. **Dunning is v1, not a follow-up** — a failed payment raises a recoverable state with a card-update
   link. It is the highest-value ten lines in the billing module.

Per-seat and flat-rate both supported; usage-based metering is explicitly **out of v1** scope.

## Consequences

**Positive:** permission checks are a local indexed read; replayed webhooks are safe; the entitlement
table is the one place to look when a customer says they paid and can't access anything.

**Negative:** the local entitlement table can drift from Stripe if a webhook is missed. Mitigated by a
scheduled reconciliation job that re-reads subscriptions and reports differences — and by treating an
unreadable Stripe as *unknown*, never as *unentitled*, so an outage never locks paying customers out.
