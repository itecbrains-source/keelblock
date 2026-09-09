# SPEC-007: Billing

> Status: `draft` · Bars: — · Research: [`research/11-BILLING-ENTITLEMENTS.md`](../research/11-BILLING-ENTITLEMENTS.md) · ADRs: [006](../docs/adr/ADR-006-billing.md), [001](../docs/adr/ADR-001-tenancy-model.md)
> Contracts: SPEC-001, SPEC-005 ·

## Intent

An organization can subscribe, and what it may do is decided by a row in this schema rather than by a
value read back from Stripe or carried in a token. Stripe bills; the database entitles (ADR-006).
After this, "is this request inside its plan" is answered the same way "is this caller a member" is
answered — by a policy, on every request — so a cancellation takes effect on the next request rather
than at token expiry.

## Scope / non-scope

- **In scope:** an entitlement row per organization; Checkout to start a subscription; the webhook
  that keeps the row current; idempotency; scheduled reconciliation; the billing portal for changes
  and cancellation; the stated staleness window.
- **Out of scope, and named so it is a decision:**
  - **Metered/usage billing.** Nothing in keelblock meters anything yet, so a usage model would be built
    against an imagined product.
  - **Multiple payment providers.** Refused with a reason in `PRODUCT.md`, not deferred.
  - **Erasure of billing data.** SPEC-031 owns it. ADR-006's addendum already settles the part that
    constrains this spec: the rows here are not immortal, and a stored customer id points at data held
    by a processor this project does not control.
  - **Trials.** Whether a subscription may start with no payment method, and what `trialing`
    entitles. Stripe emits the status either way; the mapping is a commercial choice. Named here
    because REQ-1 turns a status into an entitlement, and a status nobody decided about is decided by
    whoever writes the first `switch` — which is the failure ADR-021 names, in the place where it
    costs money.
  - **Coupons and discounts.** Whether the entitlement layer reads them at all, or whether a discount
    is invisible to it because the plan is unchanged.
  - **Tax.** Stripe Tax on or off. Schema-adjacent rather than a setting: collecting it means holding
    a customer address, which is a tenant-scoped table and an erasure obligation (SPEC-031).
  - **Dunning policy.** What a failed payment does — grace period, downgrade, read-only — is a
    commercial decision. The mechanism is in scope; the choice is the owner's.

## Sources of truth

- `docs/adr/ADR-006-billing.md` — the split, and its erasure addendum
- `research/11-BILLING-ENTITLEMENTS.md` — Stripe's own guarantees, quoted
- `docs/PRODUCT.md` — the refusal of a provider menu
- `src/lib/orgs/dal.ts`, `supabase/migrations/20260907120000_tenancy_foundation.sql` — the shape an entitlement read must match

## Requirements

### REQ-1 — the entitlement is a row, read by a policy, per request

Not a JWT claim and not a cached lookup. MEASURED context: memo 08 established that an access token
lives up to an hour, so a claim-carried entitlement means a cancelled customer keeps a paid feature
until their token turns over, and an upgraded one is refused something they have paid for. The same
argument that kept membership out of the token keeps billing out of it, with money attached.

### REQ-2 — the entitlement is never read from Stripe on the request path

Every authorization decision would otherwise depend on a third party's availability, in a product
whose claim is that the database decides. Stripe's own guidance agrees: _"We recommend you persist
these entitlements internally for faster resolution."_

### REQ-3 — a webhook is a signal to re-read, never a delta to apply

MEASURED (memo 11): _"Stripe doesn't guarantee the delivery of events in the order that they're
generated."_ A handler that computes new state from the payload is wrong by construction — a
`deleted` arriving before the `updated` that preceded it leaves a cancelled customer entitled, and the
payload contains nothing that would let the handler notice. The handler records the event and then
reads the authoritative current state, so two events arriving backwards end at the same query.

### REQ-4 — the truncated summary is never treated as complete

MEASURED: the summary event's `entitlements.data` is capped at ten, with the rest behind its
`entitlements.url`. A handler that takes the array as the whole set silently revokes everything past
the tenth — in the expensive direction, on the largest customers, while appearing to work.

### REQ-5 — processed events are recorded, and recorded durably

Stripe says duplicates happen and to key on event ids, explicitly not on `created` — _"distinct events
can share a timestamp"_. The log is a table, so a redeployed instance still knows what it has seen.

### REQ-6 — reconciliation is scheduled

Three days of retries is also three days in which nothing may arrive. A periodic reconcile against
Stripe's list endpoint is the only thing that closes a missed event; without it the system is correct
only when the network was.

### REQ-7 — the staleness window is stated, and its direction is chosen

Between a payment event and the entitlement changing, the organization is on its previous entitlement,
bounded by our processing and by Stripe's three-day retry if the endpoint is down. The window cannot
be removed; which way it errs is a decision, and it is written down rather than emerging from the
order the handler happens to run in.

### REQ-8 — the webhook endpoint verifies before it acts, and returns before it works

Signature verification over the raw body, and a `2xx` returned before the processing — Stripe: _"you
must return a 200 response before updating a customer's invoice as paid"_. An endpoint that does the
work first is one timeout away from being retried for three days.

## Acceptance criteria

| AC   | Verifies | Method | Evidence                                                                                                                           | Status  |
| ---- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AC-1 | REQ-1    | test   | a pgTAP case: an organization's entitlement is readable by its members and by nobody else, and revoking it changes the next read   | planned |
| AC-2 | REQ-2    | test   | a parsed rule: no module on a request path imports the Stripe client — the same shape as the service-role boundary in `boundaries` | planned |
| AC-3 | REQ-3    | test   | the two subscription events delivered in reverse order leave the same entitlement as delivering them forwards                      | planned |
| AC-4 | REQ-4    | test   | a summary payload of eleven entitlements does not revoke the eleventh                                                              | planned |
| AC-5 | REQ-5    | test   | the same event id delivered twice changes the entitlement once                                                                     | planned |
| AC-6 | REQ-6    | test   | an entitlement that drifted from Stripe is corrected by the reconcile without any webhook arriving                                 | planned |
| AC-7 | REQ-8    | test   | an unsigned and a stale-timestamp request are both refused                                                                         | planned |
| AC-8 | REQ-1    | test   | a journey: an organization without an entitlement is refused a paid surface, and granted it after the row changes                  | planned |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [ ] A live round-trip against a real Stripe account, or a deferral saying why not. There is no
      Stripe account yet, and a spec that ships webhook handling verified only against fixtures has
      tested its own beliefs about the payload — R3's rule, and the one this project has been caught
      by before.
- [ ] The staleness window's direction (REQ-7) chosen by the owner rather than by the implementer.

## Deferrals

None filed yet. Two are expected at build time and are named here so they are not invented later as
though they were always planned: the live Stripe round-trip, and dunning policy.

**Three rows already carry the trigger `spec-done:SPEC-007` and fire when this spec closes** —
DEF-011 (mutation testing over application logic, which earns its keep the moment money math
exists), DEF-012 (property-based testing, which wants an invariant like "splitting a payment
conserves every cent"), and DEF-029 (organization ownership transfer, filed here because a transfer
moves a payment relationship once entitlement rows exist). This paragraph exists because SPEC-004
carries the same warning and this spec said "none filed yet", which reads as nothing waiting on it
(F-61). Read it as a warning rather than a formality: **marking this spec `done` fails the build
until three other pieces of work are picked up**, and each was filed that way because billing is the
moment it stops being reasonable to postpone them.
