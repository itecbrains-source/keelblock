# Commercial model

> Decided 2026-09-07 (**D-6**). Refines [ADR-009](adr/ADR-009-open-core-boundary.md); does not reverse it.

## The code is free, and stays free

MIT, permanently, including the isolation proof, the gate suite and the access matrix. That is not
generosity — it is the wedge. The field is $199–$1,499 and closed, and *"anyone starting Next.js +
TypeScript + React + Supabase should use this"* is only literally true if there is nothing to buy
first.

**Four tiers price support and evidence. None of them prices the repository.**

| | Solo | Startup | Agency | Enterprise |
|---|---|---|---|---|
| **For** | one developer shipping their first SaaS | a team with customers | a shop delivering client projects | a company facing an assessor |
| The kit, all of it | ✓ | ✓ | ✓ | ✓ |
| Community support | ✓ | ✓ | ✓ | ✓ |
| Priority support, response commitment | | ✓ | ✓ | ✓ |
| **SOC 2 evidence pack** — export, auditor pack, traceability | | ✓ | ✓ | ✓ |
| Multiple client projects, white-label docs | | | ✓ | ✓ |
| Private channel, direct access | | | ✓ | ✓ |
| Architecture review, upgrade assistance | | | | ✓ |
| Contractual SLA, security questionnaire support | | | | ✓ |
| **Price** | **free** | *research pending* | *research pending* | *contract* |

Plus two service lines, which need no product and are margin from day one: a **paid consulting call**
and **done-for-you delivery**.

## Why the boundary sits exactly here

**Developers do not pay for tests. Companies pay for what they hand an assessor.**

Every free tier gets the thing that makes keel different — isolation enforced by the database and
proven on every commit. What is paid is the *second* job that evidence can do: satisfying a third
party. A startup with three customers needs the proof; a company in a SOC 2 window needs the proof
**packaged, attributed, and exportable**, and that packaging is real work with real value.

The anti-degradation rule from ADR-009 is unchanged and is what keeps this honest:

> keel's full claim — isolation proven per table × command × identity, with a published access
> matrix — must hold with **zero paid components present**, and a gate asserts it.

So the free tier is never quietly hollowed to make room for a paid one. If that gate ever needs
weakening to ship a tier, the tier is wrong.

## Prices are not set here, deliberately

The tier *structure* is decided; the numbers are not, and copying a competitor's would be exactly the
recollection-over-research failure the project has a gate against. Pricing needs its own memo —
willingness to pay for compliance evidence, what SOC 2 tooling actually costs a startup, whether
annual or one-time fits a recurring obligation — before a number goes on a page.

Recorded as **DEF-009**, so it cannot be quietly guessed later.

## What is deliberately not sold

- **The code.** See above. This is the decision everything else rests on.
- **The enterprise surface** (SSO, SCIM). Registered as DEF-005 and it ships **free** when built — a
  security review asking for SSO is not the same customer as one buying audit evidence, and gating
  it would make keel's B2B claim conditional on payment.
- **Anything that weakens the free tier to create a paid one.** The rule above, restated because it
  is the one that gets broken quietly.
