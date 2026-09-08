# SPEC-003: Gates

> Status: `done` (all nine gates built and mutation-proven) ·
> Contracts: SPEC-001, SPEC-002, SPEC-016, SPEC-028 · Bars: **B-3**, **B-4**, **B-9** · ADRs: [004](../docs/adr/ADR-004-rendering-and-cache.md), [007](../docs/adr/ADR-007-supply-chain-and-freshness.md)

## Intent

Every promise keelblock makes gets a mechanism that fails the build when the promise is broken. A promise
held by discipline is held until the day someone is in a hurry; a promise held by a gate is held on
that day too. This spec defines the gate set, the rules every gate obeys, and the one command that
runs them.

## Scope / non-scope

- **In scope:** the eight gates below · the rules common to all of them · `npm run check` · CI and
  pre-commit wiring · the supply-chain baseline.
- **Out of scope:** the policy tests (SPEC-002) · accessibility and performance budgets (SPEC-015,
  which will add gates obeying the rules defined here) · anything that belongs to an existing tool
  (see _Not reinvented_ below).

## Sources of truth

- `docs/adr/ADR-004-rendering-and-cache.md`
- `docs/adr/ADR-007-supply-chain-and-freshness.md`
- `docs/PRODUCT.md`
- `spec/SPEC-001-tenancy-foundation.md`
- `spec/SPEC-002-proof-harness.md`

## Rules every gate obeys

1. **It has a mutation proof** (SPEC-002 REQ-5) — a test restoring the real defect, asserting red.
2. **Its exemption list carries a reason per entry and may only shrink.** A growing allowlist is a
   gate being negotiated with.
3. **It fails with the fix, not the finding** — file, line, what is wrong, and what to do.
4. **It is cheap.** The whole set runs in seconds. A gate suite slow enough to be skipped will be.
5. **It parses, it does not grep.** A text match over a workflow or a source file is satisfied by a
   mention in a comment. Gates that reason about structure reason about the AST or the parsed file.
6. **Its exit status is not masked.** A gate piped into `tail` reports the pipe's status, not its own —
   observed in the spike, where a tool that had exited 1 appeared to exit 0. Check `PIPESTATUS`, or do
   not pipe. A CI gate whose failure cannot reach CI is a check that cannot fail.
7. **Its remediation advice is tested, not repeated.** `rlsautotest` prints "add `FORCE ROW LEVEL
SECURITY`" for owner-bypass; the spike measured that this does _not_ work on Supabase, where the
   owner bypasses via `BYPASSRLS` (F-2). Advice keelblock passes on is advice keelblock has run.

## Requirements

### REQ-1 — freshness gate

The anti-rot mechanism (ADR-007). Dated verification stamps that expire (45 days); a dependency more
than one major behind fails; the declared Node major must match the stamp. **The stamp rule is offline
and deterministic**, so no-network cannot become the standing excuse; offline degrades only the drift
rule, and only while the stamp rule is green.

### REQ-2 — new-table guard

A tenant-scoped table (carrying `organization_id`, per SPEC-001 REQ-8) with RLS disabled, no policy, or
a write policy lacking `WITH CHECK` fails the build. This is the gate that keeps B-2 true as the schema
grows, which is when isolation claims usually decay.

### REQ-3 — service-role boundary gate

The service-role client is importable only from named server-only modules and never from anything
reachable by a rendered page (SPEC-001 REQ-9). Resolved through the import graph, not a filename
convention — a rule that can be defeated by moving a file is not a boundary.

### REQ-4 — tenant-scoped cache gate

A `use cache` in a tenant-scoped module whose cache key or tag omits the organization fails
(ADR-004). This is the one cross-tenant leak RLS cannot prevent — the response is served from cache
and never reaches the database — so the whole SPEC-002 apparatus would confirm it green.

### REQ-5 — supply-chain baseline

`npm ci --ignore-scripts` in CI · **gitleaks** pre-commit _and over full history_ · Renovate proposing
bumps · a **weekly clean-clone build** that installs from scratch on a current runtime and runs the
full check. That weekly job is the substitute for having users: a template nobody exercises rots in
ways no dependency check can see.

### REQ-6 — bar coverage gate

Every acceptance bar in `PRODUCT.md` maps to an owning spec, and every spec's REQs map to ACs with
evidence paths that exist. A bar with no owner is an unkept promise, and the promise most likely to be
quietly dropped is the one nothing checks.

### REQ-7 — traceability and deferral lint

Adopted from the playbook's `check-traceability.mjs` and `check-deferrals.mjs`: no REQ without an AC,
no AC verifying a non-existent REQ, no source-of-truth path that does not exist, no `TODO`/`FIXME`/
`@defer` without a registry entry, no registry entry without a machine-evaluable trigger.

### REQ-8 — one command

`npm run check` runs every gate plus the cheap test layers, in a deterministic order, and reports all
failures rather than stopping at the first. A developer who must run six commands runs four.

### REQ-9 — a deferral is scope, never a defect

The registry accepts work deliberately not built, with a reason and a trigger. **It does not accept a
defect.** If you broke it, you fix it in the change that broke it — filing your own breakage as debt
and merging as done is the single behavior this rule exists to stop. The gate refuses a new entry
whose title reports breakage or whose blocker is not genuinely external.

## Not reinvented

Named so the set stays small and nobody rebuilds a solved thing: **secret scanning** → gitleaks ·
**dependency proposals** → Renovate · **SAST** → CodeQL · **policy enumeration** → `rlsautotest`
(SPEC-002). Keelblock writes a gate only where the promise is keelblock's own.

## Acceptance criteria

| AC   | Verifies | Method        | Evidence                                                                                                                                                                                                                                                                     | Status   |
| ---- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1    | test          | `scripts/check-freshness.test.mts` — incl. proofs that an expired stamp, a two-major drift, and an offline run with a stale stamp all fail                                                                                                                                   | **done** |
| AC-2 | REQ-2    | test          | `supabase/tests/intent/004-schema-guard.test.sql` — adding a scoped table with no policy, and a write policy without `WITH CHECK`, each fail                                                                                                                                 | **done** |
| AC-3 | REQ-3    | test          | `scripts/check-boundaries.test.mts` — an import chain from a page to the service-role client fails                                                                                                                                                                           | **done** |
| AC-4 | REQ-4    | test          | `scripts/check-boundaries.test.mts` — a tenant-scoped `use cache` without the organization in its key fails                                                                                                                                                                  | **done** |
| AC-5 | REQ-5    | inspection    | `.github/workflows/check.yml` — `--ignore-scripts`, gitleaks over full history, weekly clean-clone build                                                                                                                                                                     | **done** |
| AC-6 | REQ-6    | test          | `scripts/check-promises.test.mts` — removing a spec's ownership of a bar fails                                                                                                                                                                                               | **done** |
| AC-7 | REQ-7    | test          | Playbook gates wired, with a proof for each: an orphan `@defer` and a trigger-less entry in `scripts/check-deferrals.test.mts`, a criterion citing a path that does not exist in `scripts/check-contracts.test.mts`, a dead source path in `scripts/check-research.test.mts` | **done** |
| AC-8 | REQ-8    | demonstration | Timed `npm run check` recorded in `scripts/check.test.mts`; all failures reported in one pass                                                                                                                                                                                | **done** |
| AC-9 | REQ-9    | test          | `scripts/check-deferrals.test.mts` — an entry whose blocker is not external, and one whose title reports breakage, are both refused                                                                                                                                          | **done** |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [ ] **Every gate has a passing mutation proof.** A gate without one does not count as done, however
      green it runs.
- [ ] Every exemption list has a reason per entry and a shrink-only test.
- [ ] `npm run check` runs the full set in under 60 seconds on a clean checkout.
- [ ] **Validation note:** each gate was run against a repository state that genuinely violates it —
      not a synthetic fixture — and reported the real file and line.

## Deferrals

None. The gates are the mechanism that makes deferrals honest; deferring one would be the first thing
this spec exists to prevent.

---

## The guardrail on the guardrails

Adopted verbatim from the playbook, because it is the failure mode this spec is most likely to cause:

> If this machinery ever grows larger than a feature, it has failed its own purpose — cut it back. The
> point is to make drift and debt **visible and cheap to correct**, not impossible.

Nine gates is the ceiling, not a floor. A tenth needs a promise nothing else holds and a defect that
actually happened.
