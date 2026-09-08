# ADR-009: Open-core boundary — proof is free, evidence is paid

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner

## Context

`saas-testing-toolkit` (v1.1.0, March 2026) already implements a large part of what SPEC-002 and
SPEC-003 describe, in keelblock's exact stack: org-isolation pgTAP tagged SOC2 CC6.1, role-boundary and
auth-required suites, a query-performance suite, Stryker mutation testing, axe/Lighthouse/ZAP wiring,
an `stt` CLI, and a compliance layer (SOC2 evidence export, `AUDITOR.md`, `TRACEABILITY.md`,
`INCIDENT-RESPONSE.md`) that exceeds anything the paid starter field ships.

Its own `GTM_PLAN.md` prices it at **$149–299 one-time** and plans a public/private split. keelblock is
MIT and free (D-1). Folding one into the other gives a priced product away.

But the two have **inverse problems**. The toolkit's is distribution — nobody shops for a testing
toolkit until after they have been burned. keelblock's is justification — it needs a reason to be chosen
over four funded competitors, and that reason is proof. Each is the other's answer.

## Decision Drivers

- keelblock's central claim must remain **completely true with nothing paid installed**, or the claim is
  advertising for an upsell and the project is worse than the kits it criticises.
- Open core fails, and is resented, when the free tier is _deliberately degraded_ to manufacture a
  paid one.
- The line must follow something real, not a feature-count negotiation.

## Decision

**Chosen: split along proof versus evidence.**

|          | Free, MIT, in keelblock                                                                                                    | Paid, separate                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Job**  | _Prove the system is correct — to you_                                                                                     | _Produce evidence — for a third party_                                                                    |
| Contents | org-isolation, role boundaries, auth-required, query-perf, the intent layer, mutation proofs, the access matrix, the gates | SOC2 evidence export, auditor pack, traceability matrix, incident-response runbooks, compliance reporting |
| Buyer    | every developer                                                                                                            | a company facing an assessor                                                                              |

The line is real because the market already draws it: **developers do not pay for tests; companies
pay for evidence they can hand to an auditor.** The paid tier is not a better version of the free
one — it does a **different job**, for a different person, at a moment (an audit) that the free tier's
user may never reach.

**The anti-degradation rule, and it is mechanized, not promised:**

> keelblock's full claim — B-2, isolation proven per table × command × identity, with a published access
> matrix — must hold with **zero paid components present**. A gate asserts this: the proof suite runs
> green, and the access matrix generates, from a clean checkout containing nothing but keelblock.

The paid layer therefore **reads keelblock's outputs and never patches keelblock's internals**. It consumes the
access matrix, the pgTAP results and the run history; it does not fork the harness or require a hook
inside it. If it ever needs to reach in, the boundary was drawn in the wrong place and this ADR is
wrong, not the code.

## Consequences

**Positive:** keelblock gets a proof layer that already exists and works rather than months of rebuilding;
the toolkit gets the distribution it lacks; and the free tier is complete for its own purpose, which
is what keeps open core honest. The paid tier's value also _grows_ with keelblock's adoption instead of
competing with it.

**Negative — three, named:**

1. **The toolkit is React 18 / Node ≥20 vintage.** keelblock is React 19 / Next 16 / Node 26, and Cache
   Components changed how every authenticated page is written (ADR-004 amendment). Adoption is a
   modernization, not a copy.
2. **Its generated tests are not self-proving.** `002-org-isolation.sql` ships its seed block
   commented out with _"TODO: uncomment and adapt"_ — eight planned assertions against data nobody
   created. In keelblock the schema is known, so this gets strictly better; but adopting it as-is would
   ship a suite that passes without testing anything, which is the exact defect B-4 exists to catch.
3. **Two repositories to keep from rotting**, and only one of them has the freshness gate. The paid
   repo must adopt it too, or it becomes the stale half of a product whose pitch is that it does not go
   stale.
