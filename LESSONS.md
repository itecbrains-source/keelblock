# Lessons carried into keel

Each line is a rule that cost real money or real time to learn elsewhere, paired with the
**mechanism** that enforces it here. A rule with no mechanism is a rule that rots — if an item
below never grows a gate, delete the item rather than pretend it is held.

## 1. The tenant boundary lives in the database

Row-level security is the boundary. An application-layer `requireMember()` helper is defence in
depth, never the boundary itself — one route that forgets it is a cross-tenant leak with nothing
behind it.

- **Mechanism:** every tenant-scoped table has RLS enabled and a pgTAP test proving a foreign
  tenant is denied read *and* write. A `cross-tenant-probe` enumerates every such table and
  attempts a read as the wrong tenant; it runs in CI and nightly. A new table without a policy
  fails the build.
- *An equivalent probe found a genuine hole on its first run elsewhere. Assume this one will too.*

## 2. Tests exist from commit 1

Retrofitting a harness onto a working app never happens. Three layers, each with a distinct job:
unit (pure logic), pgTAP (policies and constraints), Playwright (one authed round-trip).

- **Mechanism:** `npm run check` runs all three. The scaffold commit ships a passing example of each.

## 3. An I/O feature needs an I/O test

"Typecheck is clean" is not evidence that a flow works. A migration, an auth change, a webhook or
any integration is not done until a test drives the real path in a prod-like environment.

- **Mechanism:** a feature touching I/O merges with an integration test or an explicitly recorded,
  dated exception. Not a silent TODO.

## 4. A migration must be safe with the OLD code still running

Code and schema deploy by different mechanisms that fire on the same push, so for a window every
release runs new code against the old database — in whichever order they land.

- **Mechanism:** additive changes satisfy this by construction. A drop, rename, or tightened
  constraint ships in two deliberate steps — schema first, code after — never as one push.
  A nightly drift check compares every environment's migration set against the repo and fails in
  **either** direction; an environment that cannot be read is never counted as in sync.

## 5. Empty, zero, and failed-to-load are three different states

A failed fetch rendered as `$0.00` or an empty list is the most expensive UI bug there is, because
it looks like an answer. A swallowed load error reading "No history found" invites someone to redo
work that already happened.

- **Mechanism:** one `<StateView>` primitive with explicit `loading | empty | error | ready` states.
  A data surface rendering a bare zero on an error path fails review.

## 6. Never show a number the system did not compute

No placeholder figures, no hardcoded sample savings, no fabricated forecast standing in for an
unbuilt engine. When there is no basis for a number, say so and say why.

- **Mechanism:** a `no-fabricated-values` test over the surfaces. Thin data means an honest empty
  state, never an invented one.

## 7. Money is integer cents, computed in exactly one place

Floats and a second calculation path are the same bug wearing different clothes. When two surfaces
each derive a total, they will disagree, and the disagreement will be found by a customer.

- **Mechanism:** one money module, cent-exact, largest-remainder for splits so every cent is
  conserved. Displays and exports are **views** of the canonical figure, never re-computations.
  A golden-fixture test pins the canonical path.

## 8. Secrets are never a plaintext column

Anything sensitive goes to a vault reference or is one-way hashed. This is far cheaper on day 1
than as a migration after the fact.

- **Mechanism:** a `secrets-at-rest` gate scans for plaintext secret-shaped columns and fails the
  build. New secrets are registered in a catalog.

## 9. Half-built ships dark

A feature behind a preview flag, off by default, can be merged safely and incrementally. A feature
on a long-lived branch entangles and eventually cannot be merged at all.

- **Mechanism:** a preview-flag resolver, dark by default, with a test asserting **flag-off is
  byte-identical** to the previous behaviour. Branch off `main`, merge fast.

## 10. Deferred work is registered, never a silent TODO

But keep this thin. A deferral register that grows to hundreds of rows stops being read, and
sweeping it yields almost nothing.

- **Mechanism:** ONE register. An entry needs a reason and a machine-checkable trigger. A deferral
  is scope you chose not to *build* — **a defect is never a deferral.** If you broke it, you fix
  it in the same change.

## 11. Operator-facing text uses operator words

No table names, no internal acronyms, no spec ids in anything a user reads.

- **Mechanism:** a vocabulary gate that scans rendered text — including wrapped JSX and template
  literals — and the helpers that *compose* strings from identifiers, which no output scan can see.

## 12. Never delete a surface to make a check pass

If a control has no backend, wire it, build it, or register it. Deleting it makes the gate green
and the product worse, and hides the gap from whoever looks next.

---

## The guardrail on the guardrails

If this machinery ever grows larger than a feature, it has failed its own purpose — cut it back.
The point is to make drift and debt *visible and cheap to correct*, not impossible.
