# Re-score after invitations — 2026-09-08

```yaml
record: 09
commit: 2c3e9c7
date: 2026-09-08
score: 80
```

**Fifth dated record.** The series scored `9c0721c`, `de36d49`, `2ca6ef3`, `e4e840e` and `dc7a89d`.
None is edited. This scores `2c3e9c7`, two commits later.

**Verdict: upgrade. 76 → 80**, entirely from work this time — D4 and D10, no reinterpretation. But
the most important thing in this record is not the four points. It is that **record 08's D1 was
awarded on evidence that had not been checked**, and the project itself found out.

## What landed

SPEC-006 — invitations, with invite, accept, decline, revoke and role change — plus a fix to a
journey locator that was racing the framework and hiding a silent refusal.

## Verified independently

Checked at `2c3e9c7`, by planting defects and by running rules directly:

| What                                                  | How, and result                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working tree clean, `HEAD == origin/main`             | confirmed                                                                                                                                                                                                                                                                     |
| Runnable gates                                        | green                                                                                                                                                                                                                                                                         |
| **The accessible-locator rule — record 08's finding** | vitest cannot run on the review machine, so the rule was transpiled and its exported function called directly. `getByTestId`, CSS selectors, XPath and descendant combinators all **caught**; `locator('..')` and `getByRole` **pass**; baseline clean against the real suite |
| The invitation write surface                          | read: no write policies, no write grant, every write through a definer function                                                                                                                                                                                               |
| The matrix's new table                                | `organization_invitation` shows SELECT only, member `✓`, different-organization `·`, unauthenticated `·`                                                                                                                                                                      |

**Not executed:** anything needing a database — the pgTAP suites, the matrix generation, the journey
run. Those rest on CI and on the implementation's evidence. That limitation is now load-bearing
enough to have its own section below.

## The invitation design solves the part that was going to be hard

`08`'s prompt named the difficulty in advance: an invitation row must be readable by someone who is
**not yet a member**, and every policy in this schema until now denied exactly that. It is the first
row that has to cross the tenant boundary by design, and how it crosses decides whether the isolation
claim survives its first real exception.

It was solved the right way, and the migration argues for itself:

- the token is stored as a **sha256 hash**; the plaintext exists only in the emailed link, so a
  leaked table is not a set of working invitations;
- there are **no write policies and no write grant** — every write runs through a `SECURITY DEFINER`
  function with a pinned `search_path` and `EXECUTE` revoked from `public` and `anon`;
- the non-member path is a definer function returning a **narrow result type**, not a policy admitting
  `anon` with an application-side token filter — which the migration names as F-15's shape and refuses
  for that reason;
- **spent, revoked, expired and invented tokens all return zero rows.** "Already accepted" would be
  an oracle, and it is not offered;
- an invitation cannot become a route from admin to owner, closing by construction the escalation the
  ownership trigger exists to prevent.

The refusal in the middle of that list is the one worth carrying: the easy version — let `anon` read
the row, filter by token in the application — is the exact pattern this project was founded to
replace, and it was recognised and rejected in the one place where it would have been most tempting.

## F-41, and what it means for the record before this one

**The finding.** The generated policy layer — the one this project points at when it says isolation
is _proven_ rather than asserted — printed `generated suites for 3/4 RLS tables` while exactly one
suite existed on disk. Each per-table invocation ended with a reconciliation step that deleted the
previous one's file; the loop counted exit codes rather than files; and `--no-fail` meant the exit
codes were always zero.

The sentence to keep is the project's own: **"A count taken from exit codes is not a measurement of
coverage."**

**What it costs this review.** Record 08 scored D1 at 5, and its stated reason was that all four
layers ADR-005 names now run in CI. At `dc7a89d` — the commit 08 was scoring — one of those four was
covering a quarter of what it reported. **That 5 was not earned.** It is earned now: the gate runs
once for the schema, reconciles what was _written_ against what was planned, fails on a planned table
with no suite on disk, and fails on a `NOT_PROBEABLE` entry matching no emitted file, as a pure
function with five mutation proofs — one of which replays the exact one-file directory the defect
produced.

Records are frozen, so `08` stands as written. This is the correction, in the place corrections go.

The same run found `organization_invitation` had shipped with RLS `ENABLE`d but not `FORCE`d, so its
owner and every definer function running as that owner bypassed it — three sibling tables had carried
`FORCE` since the foundation migration. The new-table guard, whose stated job is that every tenant
table is protected, was not looking for it. It is now, with a planted `ENABLE`-without-`FORCE` table
proving the rule fires.

## The third instrument correction, and the pattern behind them

This series has now corrected its own scoring three times:

1. **`07`** capped D1 at 4 on "breadth of surface" — a criterion the rubric does not contain.
2. **`08`** re-based D1 to 5 and disclosed that four of its seven points came from that correction
   rather than from work.
3. **`09`** — this record — finds that the 5 in `08` rested on a layer that was overstating its
   coverage, which nobody had checked.

The three share a cause, and it is worth naming rather than filing as bad luck: **this reviewer
cannot run the database, and therefore over-trusts an automated green.** Every one of these errors is
in the same direction — generous — and every one is in D1, the dimension that most depends on
evidence only a live stack produces.

Two things follow. **The rubric needs its criteria written down where they can be argued with**, not
recalled at scoring time; D4's criterion is stated explicitly in this record's table for that reason.
And **the standing limitation should be read as a cap on this instrument's authority**, not as a
caveat at the end. A score produced without running the thing it scores is a reading of the evidence
the project publishes about itself. That is worth something, because the project publishes unusually
good evidence — F-41 is the project catching its own overstatement — but it is not an audit.

## The re-score

`04-SCORECARD.md`'s rubric and weights, unchanged.

| #   | Dimension          | Weight | Was | Now   | Why                                                                                                                                                                                                                                |
| --- | ------------------ | ------ | --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Isolation, proven  | 20     | 5   | 5     | Held — and earned for the first time. The generated layer now covers what it claims, the fourth table's boundary exception is proven, and `FORCE` is guarded                                                                       |
| D2  | Stranger can check | 15     | 5   | 5     | Held. The published matrix now carries the interesting table — the one that deliberately admits a non-member                                                                                                                       |
| D3  | Self-honesty       | 10     | 5   | 5     | Held, and this is the strongest evidence in the series: F-41 is the project publishing that its flagship proof layer had been overstating itself                                                                                   |
| D4  | Product surface    | 15     | 3   | **4** | **Criterion, stated so it can be argued with:** the core B2B loop is sign up → create an organization → invite a team → pay. Three of the four exist and are journey-verified in CI. Billing is the missing quarter                |
| D5  | Rot resistance     | 10     | 5   | 5     | Held                                                                                                                                                                                                                               |
| D6  | Upgradability      | 10     | 1   | 1     | Unchanged across five records                                                                                                                                                                                                      |
| D7  | Removability       | 5      | 1   | 1     | Unchanged                                                                                                                                                                                                                          |
| D8  | Handover           | 5      | 3   | 3     | Unchanged. B-11's trial with a non-author is still the thing nobody has done                                                                                                                                                       |
| D9  | Adoption           | 5      | 3   | 3     | Unchanged. Names held, no package published, no users                                                                                                                                                                              |
| D10 | Maintainability    | 5      | 3   | **4** | The prober rewrite is the argument: exit-code counting replaced by reconciling produced against planned, as a pure function with five mutation proofs. The machinery caught its own lie. A bus factor of one is what holds it at 4 |

**Total: 80 / 100.** From 36 → 45 → 61 → 69 → 76 → 80.

**+3 from D4, +1 from D10. Nothing from reinterpretation this round.**

## Where the last twenty points are

| Dimension            | Points available |
| -------------------- | ---------------- |
| D6 upgradability     | **8**            |
| D7 removability      | 4                |
| D4 remaining surface | 3                |
| D8 non-author trial  | 2                |
| D9 adoption          | 2                |

D2, D3 and D5 are at maximum and can now only fall.

**D6 is forty per cent of everything left, and it has not moved since the first record.** That is the
whole of the argument for doing the crude version before billing rather than after: tag a release,
scaffold from the tag, land a security fix upstream, prove the scaffolded project can take it, and
write down what broke. Money math and webhook schemas are the hardest things to retrofit an upgrade
path around, and both deferred testing tools fire on `spec-done:SPEC-007`, so billing arrives
carrying obligations that work would then compete with.

If the experiment shows the path is not viable yet, that is a legitimate outcome and a finding. What
would not be legitimate is a thin `upgrade` command shipped to clear a bar — which is the shape this
project refuses everywhere else and would be least able to afford here, since B-10 is the claim
`PRODUCT.md` says no competitor can answer.

## Caveats on this score

- **No database was run by this reviewer**, and after F-41 that limitation has been shown to have
  cost a point of accuracy in the previous record. Treat D1 as the reading most dependent on the
  project's own reporting.
- **The journey layer is young.** Seven journeys passing is evidence; a suite that stays green
  without going flaky is a habit, and F-42 — a locator racing the framework — is exactly the failure
  that starts one. The `gate-health` determinism exclusions are where to watch.
- **B-11 remains open.** Defects have now been planted in the gates by this reviewer, in the policies
  by a Postgres image change, and in the application by the journey layer's own first run. None of
  those is a person who did not write the code, trying to break it on purpose. It is still the last
  item on the board that is not feature work, and it is now the cheapest two points available.
