# SPEC-002: Proof harness

> Status: `draft` · Bars: **B-2**, **B-4** · ADRs: [005](../docs/adr/ADR-005-testing.md)

## Intent

Build the apparatus that turns keel's claim from an assertion into evidence: four test layers, a
published access matrix, and the rule that every gate must be shown capable of failing. This is a
separate spec from SPEC-001 on purpose — the thing being proven and the proof should not be authored
as one unit, or the proof degrades into a restatement of the implementation.

## Scope / non-scope

- **In scope:** the four layers and what each is for · adopting `rlsautotest` for the generated layer ·
  the hand-written intent layer · the published access matrix · the mutation-proof rule · CI and
  nightly wiring · the local developer loop.
- **Out of scope:** the policies themselves (SPEC-001) · the gates (SPEC-003, which *consumes* the
  mutation-proof rule this spec defines) · visual regression · load testing.

## Sources of truth

- `docs/adr/ADR-005-testing.md`
- `docs/PRODUCT.md`
- `research/02-STACK-FINDINGS.md`
- `spec/SPEC-001-tenancy-foundation.md`

## Requirements

### REQ-1 — four layers, each answering a distinct question
Unit (is this pure logic correct?) · generated policy (does the database enforce what the policies
*declare*?) · intent (are the policies *what we meant*?) · journey (does the real authed flow work?).
No layer substitutes for another, and the spec names what each cannot do.

### REQ-2 — adopt the generated layer, do not rebuild it
[`rlsautotest`](https://github.com/unitautogen/rlsautotest) (Apache-2.0) generates a pgTAP suite from
the policy catalog — per table, per command, per identity. It is pinned like any other dependency and
runs against a throwaway database only: it seeds rows and executes real queries before rolling back,
so pointing it at production is destructive.

### REQ-3 — the intent layer is hand-written, adversarial and small
The generated layer's own documentation states its limit: *"a wrong policy will be faithfully (and
greenly) confirmed."* The intent layer is where a human asserts what *should* be true — a member must
not read another organisation's invoices; an admin must not grant themselves owner; a removed member
loses access immediately, not at token expiry. It is small by design: exhaustiveness is the generated
layer's job, judgement is this one's.

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
Nightly matters independently: it catches the dependency that changed behaviour under a caret range,
and the drift no commit triggered. A template with no users has no other mechanism for noticing.

### REQ-7 — one command locally, and it is fast enough to be run
`npm run check` runs every layer against the local Supabase stack. If the full loop is slow enough to
be skipped, it will be — so the unit and intent layers run in seconds independently, and the expensive
layers are separately invocable.

### REQ-8 — a failing proof is legible
A cross-tenant failure reports the table, the command, the identity, and the row it should not have
reached. "Expected 0, got 1" is a true statement and a useless one at 2am.

## Acceptance criteria

| AC | Verifies | Method | Evidence | Status |
|----|----------|--------|----------|--------|
| AC-1 | REQ-1 | inspection | `docs/TESTING.md` — the four layers, what each proves, and what each cannot | planned |
| AC-2 | REQ-2 | test | `supabase/tests/generated/` present and green; the version is pinned and stamped | planned |
| AC-3 | REQ-3 | test | `supabase/tests/intent/*.test.sql` — at least one adversarial case per role transition | planned |
| AC-4 | REQ-3 | test | `supabase/tests/intent/wrong-policy.mutation.test.sql` — a deliberately over-permissive policy is caught by the intent layer *and confirmed green by the generated layer*, proving the two are not redundant | planned |
| AC-5 | REQ-4 | test | `docs/ACCESS-MATRIX.md` is regenerated in CI and a stale committed copy fails the build | planned |
| AC-6 | REQ-5 | test | `scripts/check-mutation-proofs.test.ts` — a gate without a paired mutation proof fails | planned |
| AC-7 | REQ-6 | inspection | `.github/workflows/check.yml` and `nightly.yml` | planned |
| AC-8 | REQ-7 | demonstration | Timed local run recorded in `docs/TESTING.md` | planned |
| AC-9 | REQ-8 | test | `supabase/tests/intent/failure-message.test.sql` — an induced leak's message names table, command, identity and row | planned |

**AC-4 is the load-bearing one.** It is the only test that proves the two policy layers are doing
different jobs. If it ever passes trivially — if the generated layer also catches the planted bad
policy — then the intent layer's justification has weakened and this spec should be re-argued rather
than quietly kept.

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [ ] `docs/ACCESS-MATRIX.md` committed, current, and readable by someone who has not seen the schema.
- [ ] AC-4 demonstrated end to end, with the generated layer's green run recorded alongside the intent
      layer's red one.
- [ ] **Validation note:** someone other than the author planted a policy defect and confirmed the
      harness caught it. A harness verified only by its own author is a harness verified against the
      same assumptions that would produce the bug.

## Deferrals

- Property-based generation of adversarial intent cases — trigger: `intent-layer exceeds 40 cases`,
  the point at which hand enumeration stops being reliable. Not filed yet; recorded here so it is not
  invented later as though it were always planned.
