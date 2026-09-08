# Review dispositions

**This is the only live file in `docs/review/`.** Everything beside it is a dated record of what was
found on 2026-09-08 and is never edited — correcting a review's numbers falsifies the finding, which
is why the stale-count gate excludes this directory. The record is frozen; the answers are here.

**Every finding is implemented, refuted or deferred. There is no fourth state**, and a finding
without a row fails `npm run check`. The review is CLOSED when the table is complete — a fact that is
**computed, not asserted**, because a "CLOSED" banner is exactly the kind of sentence that goes stale.
Ask for it:

```bash
npm run status     # REVIEW  14 findings · 12 implemented · 0 refuted · 2 deferred — CLOSED
```

Enforced by `scripts/review-register.mjs`, which runs inside the `promises` gate. Four ways it
refuses to rot: a finding with no row fails; a row for a finding the audit does not raise fails;
`implemented` and `refuted` must cite files that still exist; and `deferred` must name an **open**
deferral, so the day that deferral closes, the finding must be answered again.

## Findings

| id   | disposition | evidence                                                                            | reasoning                                                                                                                                                                                                              |
| ---- | ----------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | implemented | `scripts/status.mjs`, `scripts/status.test.mts`                                     | The rule reads spelled-out numerals, which is the form this repository writes in. Eighteen stale claims, not the seven reported; fixed by removing counts rather than correcting them, per F-23.                       |
| R-2  | implemented | `.github/workflows/nightly.yml`, `scripts/check-contracts.mjs`                      | Nightly exists and is built to catch what REQ-6 says it is for, which `npm ci` structurally cannot. The evidence parser now reads every cited path, not the first.                                                     |
| R-3  | implemented | `scripts/check-contracts.mjs`, `scripts/check-contracts.test.mts`                   | A `done` criterion citing nothing checkable now fails instead of being silently skipped, and path-likeness decides what is demanded so the SPEC-028 `hreflang` trap cannot open.                                       |
| R-4  | implemented | `scripts/access-matrix.mjs`, `keelblock.access-allowances.json`                     | Every anomaly and bypass surface must be absent or answered with a written reason, published in the artifact itself. Adjudication rather than a threshold, because five of the eight concerns are legitimate.          |
| R-5  | implemented | `keelblock.access-allowances.json`, `docs/FINDINGS.md`                              | Determined against a live database, which the reviewer could not do. Both anomalies are false positives — denied at the privilege layer, reproduced — and every bypass row now carries its reasoning in public (F-27). |
| R-6  | implemented | `supabase/tests/intent/wrong-helper.mutation.test.sql`                              | The load-bearing criterion is built and mutation-proven: neutering the planted semantic defect turns the file red, so it cannot start passing trivially without saying so.                                             |
| R-7  | implemented | `scripts/gate-health.mjs`, `scripts/gate-health.test.mts`                           | The meta-gate asks the parsed test file whether a case named as a mutation proof calls something the gate exports. Every existing proof passed the stronger rule unchanged (F-30).                                     |
| R-8  | implemented | `scripts/check-boundaries.mjs`, `scripts/check-boundaries.test.mts`                 | Route handlers and standalone server actions are entry points now, while the answer is still "there are none". A legitimate future exception is a reviewed list entry, not a comment.                                  |
| R-9  | implemented | `scripts/check-boundaries.mjs`                                                      | The cache-key rule reads the AST, so it sees arrow functions, methods and a file-level directive — the last being the widest form of the defect and the one it could not see at all.                                   |
| R-10 | implemented | `scripts/check-boundaries.mjs`                                                      | The import graph is parsed, so re-export barrels, dynamic imports and `require` are followed. It failed open before, which for a service-role reachability walk is the wrong direction.                                |
| R-11 | implemented | `scripts/check-schema-guard.mjs`, `supabase/tests/intent/004-schema-guard.test.sql` | The rule is now "does this WITH CHECK mention the tenant", plus a refusal of the null-test shape the audit's own suggestion would have let through. Five spellings proven against a live database.                     |
| R-12 | implemented | `scripts/check.mjs`, `scripts/check-freshness.mjs`, `scripts/check.test.mts`        | A skipped rule renders as `~`, never `✓`, and fails under `--strict`, which CI uses. The fetch was also bounded and retried, so a degraded verdict means an outage rather than load.                                   |
| R-13 | deferred    | DEF-003                                                                             | Creating a remote is not a code change and not this session's to make. The deferral already existed and already says the right thing: an unrun workflow is a file, not a working gate.                                 |
| R-14 | deferred    | DEF-015                                                                             | Publishing the matrix at a URL is a delivery decision that belongs to the marketing shell, not a defect to patch. Deferred to the spec that owns the public surface rather than solved twice.                          |

## What this table does not cover, stated so the boundary is not mistaken for coverage

The gate enumerates `R-*` findings from `01-AUDIT.md`, because those carry stable ids. The
recommendations in `02-EXECUTION.md`, `03-POSITIONING.md` and `04-SCORECARD.md` do not, and are
tracked the way this repository tracks decisions rather than by this table:

- the **name collision** — the review's most expensive finding — is [ADR-015](../adr/ADR-015-the-name.md),
  with registration tracked as DEF-013 on a dated trigger;
- the **dual write path** the access matrix flags is DEF-014;
- **"ship the proof harness as an installable package"** is a strategy proposal, not a finding. It is
  deliberately not filed as debt: turning an idea into a registry row makes it look decided.
