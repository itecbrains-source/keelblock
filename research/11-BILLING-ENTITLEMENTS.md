# Stripe bills, the database entitles — what has to be true in between

_Researched 2026-09-08. The question is not how to call Stripe. It is: **what decides whether a
request is inside its plan**, and what is true in the window between a webhook arriving and that
decision changing._

## Why this is not a integration question

ADR-006 already chose the split: Stripe bills, the database entitles. That sentence is only worth
anything if the second half is a row this schema owns and a policy reads — because the alternative,
an entitlement carried in a token, is memo 08's staleness problem **with money attached**. Memo 08
established that an access token lives up to an hour and that a revoked admin keeps their role until
it turns over. The same shape applied to billing means a cancelled customer keeps a paid feature for
the life of their token, and an upgraded one is refused something they have paid for.

So the design question is where the authoritative answer lives, and what the webhook is _for_.

## What Stripe guarantees, in its own words

Three facts from Stripe's own documentation, and all three constrain the design rather than the code.

**Order is not guaranteed.**

> "Stripe doesn't guarantee the delivery of events in the order that they're generated. … Make sure
> that your event destination isn't dependent on receiving events in a specific order. Snapshot events
> record `created` in seconds, so distinct events can share a timestamp. **Don't use `created` to
> determine event order** or whether you've already processed an event."

This is the single most important sentence for this spec, and it settles the architecture on its own:
**a handler that applies events as deltas is wrong by construction.** A `customer.subscription.deleted`
arriving before the `customer.subscription.updated` that preceded it leaves the customer entitled to
something they cancelled — and no amount of care in the handler fixes it, because the information
needed to detect the inversion is not in the payload.

**Duplicates happen.**

> "Webhook endpoints might occasionally receive the same event more than once. You can guard against
> duplicated event receipts by logging the event IDs you've processed."

**Retries run for three days.**

> "Stripe attempts to deliver events to your destination for up to three days with an exponential back
> off in live mode."

That is the honest upper bound on the window this memo exists to describe. If the endpoint is down,
the entitlement is stale for as long as the outage lasts, up to three days — and the customer is on
the old plan for all of it. No design removes that; a design can only decide **which way** it is
wrong while it lasts.

## Stripe's own answer to "where should the entitlement live"

Stripe now ships an Entitlements API — features attached to products, an
`entitlements.active_entitlement_summary.updated` event, and a List Active Entitlements endpoint. It
is worth knowing because it is the obvious thing to reach for, and because Stripe's own guidance about
it is the conclusion this memo was going to reach anyway:

> "**We recommend you persist these entitlements internally for faster resolution.**"

And the reconciliation path is named explicitly:

> "If your application needs to check a customer's current entitlements at any time without waiting for
> a webhook, you can retrieve them directly … Use this on application startup, for authorization
> checks, or **to reconcile state after a webhook delivery failure**."

So the vendor agrees: the entitlement is read from your own store, and Stripe is where you reconcile
it _from_, not where you ask on every request. Reading Stripe on the hot path would also make every
authorization decision depend on a third party's availability — for a product whose central claim is
that the database decides.

**One trap worth writing down before somebody meets it.** The summary payload is truncated:

> "The entitlement summary's `entitlements.data` array contains a maximum of 10 entitlements. If a
> customer has more than 10 active entitlements, use the `entitlements.url` field in the payload to
> fetch the complete, paginated list."

A handler that treats `entitlements.data` as the complete set silently **revokes** everything past the
tenth. It fails in the expensive direction, on the largest customers, and it looks like it works.

## Settled

**1 · The entitlement is a row in this schema, read per request by a policy.** Same shape as
membership (ADR-001, memo 08), for the same reason: the decision is made where the data is, on every
request, so revoking it takes effect on the next one rather than at token expiry. Not a JWT claim, not
a cached lookup in the application, and not a call to Stripe.

**2 · A webhook is a signal to RE-READ, never a delta to apply.** Because ordering is not guaranteed,
the handler must not compute the new state from the event payload. It records the event, then reads
the authoritative current state — from the summary's `url`, or the List Active Entitlements endpoint —
and writes _that_. Re-reading makes order irrelevant: two events arriving backwards both end with the
same query, so the last write is the current truth rather than the last message.

**3 · Idempotency is by event id, and it is a stored row, not a memory of one.** Stripe says to log
processed event ids; that log is a table, so a redeployed instance still knows.

**4 · Reconciliation is scheduled, not hoped for.** Three days of retries is also three days in which
nothing may arrive at all. A periodic reconcile against Stripe is the only thing that closes a missed
event, and Stripe names it as the intended use of the list endpoint.

**5 · The window is stated, not hidden.** Between a payment event and the entitlement changing, the
buyer is on their previous entitlement. The direction of that error is a product decision — favouring
the customer on an upgrade and the vendor on a downgrade is the usual answer — and it belongs in the
spec as a stated behaviour rather than an accident of handler order.

**6 · Billing rows are subject to erasure.** ADR-006's 2026-09-08 addendum already settled this and it
is repeated here because it is easy to design around and hard to retrofit: a stored customer id points
at data held by a processor this project does not control, deleting the local row does not delete
Stripe's copy, and SPEC-031 owns the boundary.

## Not settled here

- **Which events to subscribe to.** A list belongs in the spec against real product decisions
  (trials? seats? metered usage?), not in a memo written before them.
- **Dunning.** What happens on a failed payment — grace period, immediate downgrade, read-only — is a
  commercial decision, not a research finding.

## Sources

**Primary** — Stripe's own documentation, read 2026-09-08:

- [Stripe — Receive Stripe events in your webhook endpoint](https://docs.stripe.com/webhooks) · ordering, duplicates, three-day retries, signature verification, return-2xx-first
- [Stripe — Entitlements](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api) · the Active Entitlement model, the summary event, the list endpoint, the persist-internally recommendation, and the 10-entitlement truncation

**Secondary** — none. Both claims above are quoted from the vendor's own pages; nothing in this memo
rests on a write-up about Stripe.
