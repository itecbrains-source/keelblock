# SPEC-002: Proof harness

> Status: `done` (spike-validated 2026-09-07 — see `research/03-SPIKE-RESULTS.md`) · Bars: **B-2**, **B-4** · ADRs: [005](../docs/adr/ADR-005-testing.md)
> Contracts: SPEC-001, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-013, SPEC-024, SPEC-032 ·

## Intent

Build the apparatus that turns keelblock's claim from an assertion into evidence: four test layers, a
published access matrix, and the rule that every gate must be shown capable of failing. This is a
separate spec from SPEC-001 on purpose — the thing being proven and the proof should not be authored
as one unit, or the proof degrades into a restatement of the implementation.

## Scope / non-scope

- **In scope:** the four layers and what each is for · adopting `rlsautotest` for the generated layer ·
  the hand-written intent layer · the published access matrix · the mutation-proof rule · CI and
  nightly wiring · the local developer loop.
- **Out of scope:** the policies themselves (SPEC-001) · the gates (SPEC-003, which _consumes_ the
  mutation-proof rule this spec defines) · visual regression · load testing.

## Sources of truth

- `docs/adr/ADR-005-testing.md`
- `docs/PRODUCT.md`
- `research/02-STACK-FINDINGS.md`
- `spec/SPEC-001-tenancy-foundation.md`
- `docs/adr/ADR-009-open-core-boundary.md`
- `research/04-SMOKE-RESULTS.md`

## Requirements

### REQ-1 — four layers, each answering a distinct question

Unit (is this pure logic correct?) · generated policy (does the database enforce what the policies
_declare_?) · intent (are the policies _what we meant_?) · journey (does the real authed flow work?).
No layer substitutes for another, and the spec names what each cannot do.

### REQ-1b — adopt the toolkit's proof layer, modernized

`saas-testing-toolkit` v1.1.0 already implements much of this spec in this stack: org-isolation
(SOC2 CC6.1), role boundaries, auth-required, query-perf (which covers SPEC-001 REQ-5 by _test_, not
the _analysis_ this spec assumed), Stryker mutation testing, and axe/Lighthouse/ZAP wiring. Adoption
is governed by [ADR-009](../docs/adr/ADR-009-open-core-boundary.md) and is a **modernization, not a
copy**: it targets React 18 / Node ≥20, and its generated `002-org-isolation.sql` ships its seed block
commented out — eight planned assertions against data nobody creates. **Adopting that as-is would ship
a suite that passes without testing anything**, which is precisely the defect REQ-5 exists to catch.
In keelblock the schema is known, so the seed is concrete rather than a TODO.

### REQ-2 — adopt the generated layer, do not rebuild it

[`rlsautotest`](https://github.com/unitautogen/rlsautotest) (Apache-2.0) generates a pgTAP suite from
the policy catalog — per table, per command, per identity. It is pinned like any other dependency and
runs against a throwaway database only: it seeds rows and executes real queries before rolling back,
so pointing it at production is destructive.

### REQ-3 — the intent layer is hand-written, adversarial and small

The generated layer's limit is not theoretical — it was measured (`research/03-SPIKE-RESULTS.md` F-1).
A helper that dropped its `user_id` check produced a **total cross-tenant read leak**, and the
generated suite reported the affected table as clean. The mechanism is the tool's own:

> _"opaque policy function(s) were MOCKED to prove the policy delegates correctly (wiring) — the
> function's own logic is NOT verified here"_

So the boundary is precise: **the generated layer verifies that a policy delegates to its helper; every
line inside that helper is unverified by it.** Keelblock puts the membership predicate in exactly such a
helper, which makes the intent layer the only thing testing the predicate at all. The intent layer is where a human asserts what _should_ be true — a member must
not read another organization's invoices; an admin must not grant themselves owner; a removed member
loses access immediately, not at token expiry. It is small by design: exhaustiveness is the generated
layer's job, judgment is this one's.

### REQ-3b — the journey layer uses accessible locators only

Every Playwright locator resolves by role, label, or accessible name — `getByRole`, `getByLabel`,
`getByPlaceholder` — and never by CSS selector or test id.

Adopted from `boxyhq/saas-starter-kit`, whose e2e suite does this throughout, and it is the best idea
in their repository. The payoff is that the journey suite **doubles as an accessibility regression
test**: a control that loses its accessible name breaks the test, so bar B-7 is partly held by tests
that exist for another reason entirely. It also makes the tests survive markup changes, which is why
most suites reach for test ids and then quietly stop asserting anything about the real interface.

Recorded now, before any journey test exists, because retrofitting locators across a written suite
never happens.

**And enforced, which it was not at first.** The criterion originally cited the page objects — files
that complied. Appending `getByTestId('members').locator('.row')` to them left `tsc`, `lint`, `unit`
and `boundaries` green, so the property bar B-7 partly rests on was checked by nobody. A criterion
whose evidence is code that currently complies is not a criterion.

### REQ-4 — the access matrix is generated and published

A committed, human-readable artifact: for every tenant-scoped table, which role may SELECT, INSERT,
UPDATE and DELETE which rows. It is regenerated on every run and a diff to it is a reviewable event.
This is the single artifact no competing kit can currently produce, and it is what makes B-2 a claim
a stranger can check rather than take on trust.

### REQ-5 — every gate ships a mutation proof

A gate is not accepted until a test restores the real defect it exists to catch and asserts the gate
goes red. A gate that has only ever printed a tick has not been shown to be looking at anything. This
rule is defined here and enforced by SPEC-003.

### REQ-6 — the suite runs in CI on every commit and nightly on a schedule

Nightly matters independently: it catches the dependency that changed behavior under a caret range,
and the drift no commit triggered. A template with no users has no other mechanism for noticing.

### REQ-7 — one command locally, and it is fast enough to be run

`npm run check` runs every layer against the local Supabase stack. If the full loop is slow enough to
be skipped, it will be — so the unit and intent layers run in seconds independently, and the expensive
layers are separately invocable.

### REQ-8 — a failing proof is legible

A cross-tenant failure reports the table, the command, the identity, and the row it should not have
reached. "Expected 0, got 1" is a true statement and a useless one at 2am.

## Acceptance criteria

| AC    | Verifies | Method        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                    | Status   |
| ----- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1  | REQ-1    | inspection    | `docs/TESTING.md` — the four layers, what each proves, and what each cannot; the generated/intent boundary quoted from the tool's own words                                                                                                                                                                                                                                                                 | **done** |
| AC-2  | REQ-2    | test          | `supabase/tests/intent/004-schema-guard.test.sql` present and green; the version is pinned and stamped                                                                                                                                                                                                                                                                                                      | **done** |
| AC-3  | REQ-3    | test          | `supabase/tests/intent/001-tenant-isolation.test.sql` — at least one adversarial case per role transition                                                                                                                                                                                                                                                                                                   | **done** |
| AC-4  | REQ-3    | test          | `supabase/tests/intent/wrong-helper.mutation.test.sql` — a **semantic** defect (the membership helper drops its `user_id` check) is caught by the intent layer _and confirmed green by the generated layer_, proving the two are not redundant. Reproduced in the spike.                                                                                                                                    | **done** |
| AC-5  | REQ-4    | test          | `scripts/access-matrix.test.mts` is regenerated in CI and a stale committed copy fails the build                                                                                                                                                                                                                                                                                                            | **done** |
| AC-6  | REQ-5    | test          | `scripts/gate-health.test.mts` — a gate without a paired mutation proof fails                                                                                                                                                                                                                                                                                                                               | **done** |
| AC-7  | REQ-6    | inspection    | `.github/workflows/check.yml` (per commit) and `.github/workflows/nightly.yml` (scheduled)                                                                                                                                                                                                                                                                                                                  | **done** |
| AC-8  | REQ-7    | demonstration | `docs/TESTING.md` — a timed local run of both suites, recorded with the machine and the conditions                                                                                                                                                                                                                                                                                                          | **done** |
| AC-9  | REQ-8    | test          | `supabase/tests/intent/failure-message.test.sql` — a table with a genuinely leaking policy is read by somebody who should not see it, and the message names all four. Adopted in `supabase/tests/intent/001-tenant-isolation.test.sql`, and demonstrated by breaking `project_select` on the live stack: `LEAK public.project SELECT — identity 1111… reached row 5c66d4f0 belonging to organization bbbb…` | **done** |
| AC-10 | REQ-1b   | test          | `scripts/gate-health.test.mts` — every external executable the claim reaches for is declared and free, resolved through constants; wiring in `stt`, the paid toolkit's own CLI, fails. Asserting no paid component is _installed_ was rejected: this repository has never held one, so that rule could not fail                                                                                             | **done** |
| AC-3c | REQ-3b   | test          | `scripts/accessible-locators.test.mts` — a parsed rule over the journey suite: a test id or a CSS/XPath selector fails, proven by appending one to the real page objects. Parsed rather than searched, because the forbidden names appear in the prose explaining them                                                                                                                                      | **done** |
| AC-11 | REQ-1b   | test          | `scripts/check-policies.mjs` `checkPositiveControls`, proven in `scripts/check-policies.test.mts` — every command a table has a policy for must have one identity EXPECTED to succeed, read from the run's own coverage report. Removing the `organization:DELETE` exception makes the real gate fail                                                                                                       | **done** |

**Three evidence paths moved, and the reason is the same in each case: the rule went inside a gate
that already existed rather than becoming a new one.**

AC-11 was written as `supabase/tests/generated/seed-is-real.test.sql`. The generated directory is
regenerated and gitignored every run, so a committed test inside it would be deleted before it ran;
and the property is about the suite the run PRODUCED, which is a thing the policy gate holds and a
SQL file cannot see. It is now a pure function over the run's own coverage report, which is also what
makes it checkable at all: it asks whether each policied command has an identity expected to
_succeed_, because a suite that only ever proves refusals is exactly as green against a fixture
nobody seeded. That is REQ-1b's own example — the toolkit's `002-org-isolation.sql` and its
commented-out seed — stated generally.

AC-10 was written as `scripts/check-free-tier-complete.test.ts`, asserting the suite runs with no
paid component present. That rule cannot fail: this repository has never contained one, so it would
pass on the day a gate started shelling out to the paid CLI and every day after. What can fail is the
reach, so the assertion is over the executables the gates actually invoke.

AC-9 kept its path and gained a second half: the diagnostic is used by the real isolation suite, not
only demonstrated in a file of its own.

**AC-4 is the load-bearing one**, and the spike corrected it. The defect must be **semantic** — a
helper whose logic is wrong — not **syntactic**: `with check (true)` _is_ caught by the generated
layer as a footgun, so a syntactic defect would have made AC-4 pass for the wrong reason and quietly
retire the intent layer's justification.

If AC-4 ever starts passing trivially, the boundary has moved and this spec should be re-argued rather
than kept out of habit.

## Definition of Done

- [x] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [x] `docs/ACCESS-MATRIX.md` committed, current, and readable by someone who has not seen the schema.
- [x] AC-4 demonstrated end to end, with the generated layer's green run recorded alongside the intent
      layer's red one.
- [ ] **Validation note:** someone other than the author planted a policy defect and confirmed the
      harness caught it. A harness verified only by its own author is a harness verified against the
      same assumptions that would produce the bug. **Still open, and now tracked as DEF-020 rather
      than as an unticked box** — it needs a second person, which is not something more tests can
      supply. `docs/review/05-VERIFICATION.md` planted defects in the gates; nobody but the author has
      planted one in the policies.

## Deferrals

- Property-based generation of adversarial intent cases — trigger: `intent-layer exceeds 40 cases`,
  the point at which hand enumeration stops being reliable. Not filed yet; recorded here so it is not
  invented later as though it were always planned.
