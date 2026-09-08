# Re-score after sign-in — 2026-09-08

```yaml
record: 07
commit: e4e840e
date: 2026-09-08
score: 69
```

**Third dated record.** `04-SCORECARD.md` scored `9c0721c`, `05-VERIFICATION.md` re-checked at
`de36d49`, `06-RESCORE-CI.md` scored `2ca6ef3`. None is edited. This scores `e4e840e`, eleven commits
later.

**Verdict: upgrade. 61 → 69.** Two of those commits carry it: the INSERT discrepancy is settled, and
the database finally has a caller.

## The discrepancy, closed — and closed better than prescribed

`06-RESCORE-CI.md` narrowed it to two branches and observed that nothing in the repository could tell
them apart. The answer is branch one:

```sql
select has_table_privilege('authenticated','public.organization','INSERT');  -- false
```

The grant is gone, `create_organization()` is the only writer, and the tool's sentence is a template
that names INSERT/UPDATE/DELETE whether or not they are held.

The prescribed fix was to amend the allowance to name the template. **The implementation refused that
as insufficient, and it was right to.** From the commit: amending the wording alone _"would leave the
claim exactly as unfalsifiable as the one it replaces."_ The real defect was the verification, and it
is now F-33: `20260908130000` cited a `throws_ok(…, '42501', null, …)` as its evidence, and `42501`
is returned by both `permission denied for table` and `new row violates row-level security policy`,
so the assertion passed under either branch. The migration's comment presented that breadth as what
made the change safe; it is what made the check blind.

`002` now asserts `has_table_privilege` directly, pins the refusal **message** rather than the code,
and carries a policy refusal beside it as a contrast — same SQLSTATE, different layer, different
message — so the assertion discriminates rather than merely being specific. Mutation-proven by
restoring the grant.

**That is a better fix than the review specified**, and the reasoning generalizes: a check whose pass
condition is satisfied by both branches of the question it is asked is not a weak check, it is not a
check. Worth carrying into every future assertion on an error code.

## Sign-in exists

The largest change in the project's history, and the one that ends a structural oddity: every policy
`SPEC-001` wrote keys off `auth.uid()`, which was null until now. The proof apparatus was, in the
implementation's own words, _"proving a claim about an empty building."_

Verified end to end against the local stack rather than asserted — request a link, read it from the
mail catcher, exchange it through the callback, land signed in — with the redirect's
`private, no-cache, no-store` and two auth cookies observed on a real response.

Two findings came out of it. **F-34 is the serious one**: `setAll` was declared with one parameter,
so the cache headers `@supabase/ssr` supplies were not ignored — they were never received. The
failure mode, in its own types' words, is one user's session token served to a different user. The
obvious fix would have broken sign-in, and only measuring showed why, so the exemption carries the
measurement as its reason rather than an assurance.

The second is subtler and is the better lesson: the authorization rule was written **per file**, and
a legitimate `signOut` landing beside two unauthenticated sign-in actions made all three look
authorized. It was caught within the hour by one assertion inside the rule's own test — empty the
allowlist and it must still complain, or it has stopped looking. **A rule that can be satisfied by
its neighbors is a rule that will be**, and the test that caught it is the shape worth copying:
every allowlist should carry an assertion that it cannot be emptied into silence.

Both new rules landed inside `boundaries` rather than as a twelfth gate. That respects SPEC-003's
ceiling and the review's position that eleven already exceeds what the application justifies. **The
right call, and worth recording as one**, because the pressure at this stage is always to add a gate.

## Verified independently

Planted against a clean clone at `e4e840e`, in a temporary directory:

| Defect planted                                             | Result                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| an exported Server Action that never reaches authorization | **red** — _"an exported action is a public POST endpoint whether or not any UI calls it, and a page-level check does not extend to it"_ |

Read rather than executed: `findDroppedCacheHeaders` checks that `setAll`'s second parameter is
**used**, not merely declared — the defect wearing a correct signature. That is the right depth for
this rule.

Not executed at all: anything needing a database. The pgTAP suite, the matrix and the end-to-end
sign-in flow rest on the implementation's evidence and on CI, not on this reviewer's observation.

## One thing to correct

`PRODUCT.md` says isolation is _"proven by tests that run on every commit."_ CI shows seventeen
passing runs, and run #17 is HEAD — but there is no run for `ce01626`, the auth commit itself. Three
commits were pushed as a batch, so GitHub built only the tip.

Nothing is untested: the tree containing them is green. But **the claim is now "every push", not
"every commit"**, and the two differ exactly when a batch contains a commit that would have failed
alone. This is a one-word correction to the governing document, or a `push` protocol that pushes
commits singly. It is small, and it is precisely the class of overstatement this repository gates
against everywhere else.

## The re-score

`04-SCORECARD.md`'s rubric and weights, unchanged.

| #   | Dimension          | Weight | Was | Now   | Why                                                                                                                                                                                    |
| --- | ------------------ | ------ | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Isolation, proven  | 20     | 4   | 4     | Held deliberately. Automated and published — but proven over three tables and a `project` example. The path to 5 is SPEC-005/006 growing the matrix, not more automation               |
| D2  | Stranger can check | 15     | 4   | **5** | DEF-015 closed: the README now states that the `generated` gate regenerates the matrix and byte-compares it, so a green badge asserts the published file is what the database produced |
| D3  | Self-honesty       | 10     | 5   | 5     | Held. F-32 and the README status rewrite show it is live rather than a one-time cleanup                                                                                                |
| D4  | Product surface    | 15     | 1   | **2** | One real journey exists and runs. No organizations, no invitations, no billing; the journey layer is still deferred                                                                    |
| D5  | Rot resistance     | 10     | 4   | **5** | A **scheduled** nightly has now fired, not only a manual dispatch, and both workflows are badged publicly                                                                              |
| D6  | Upgradability      | 10     | 1   | 1     | Unchanged                                                                                                                                                                              |
| D7  | Removability       | 5      | 1   | 1     | Unchanged                                                                                                                                                                              |
| D8  | Handover           | 5      | 3   | 3     | Unchanged. Still no trial with a non-author                                                                                                                                            |
| D9  | Adoption           | 5      | 3   | 3     | Both npm names are held with honest "not yet functional" placeholders, and the domain is registered. That is risk removal, not adoption — no package, no users, no stars               |
| D10 | Maintainability    | 5      | 3   | 3     | Two rules folded into an existing gate rather than a new one; application code finally growing against the machinery                                                                   |

**Total: 69 / 100.** From 36 → 45 → 61 → 69.

**Name the two soft fives**, because an inflated score is worth less than a low one. D2 rests on a
README sentence a reader must follow, not on a page that shows the matrix and its run together; a
single static page would make it robust rather than dependent on attention. D5's scheduled run has
fired once — one firing is evidence, a habit is not yet established.

## Where the remaining points are

Thirty-one points outstanding. Twenty-four of them sit in three dimensions — product surface (13),
upgradability (8), removability (4) — and **none moves without building the product.** The other
seven are D1's ceiling, which also needs features, and D8's non-author trial.

There is no longer a cheap move on this board. That is the healthiest thing this record has to say.

### The order

1. **SPEC-005, then SPEC-006.** Four of SPEC-004's open criteria name their blocker in their own
   evidence column — _"needs a protected route (SPEC-005)"_. The auth work is already waiting on the
   next spec, which is the cleanest sequencing signal available, and organizations are where the
   access matrix grows rows that mean something. D1's ceiling and D4's floor are both here.
2. **The journey layer.** `DEF-002` unblocks the moment there is a flow to drive, and SPEC-002
   REQ-3b already settled accessible locators — so bar B-7 gets partly held by tests written for
   another reason. It is also the layer that catches F-34-shaped defects, where every unit assertion
   passes and the response header is wrong.
3. **Publish something.** Thirty-four findings, zero stars. F-31 and F-34 both travel: a security
   property that held only because of which Postgres image you happened to pull, and a session token
   served to the wrong user. The asset is idle.
4. **The non-author trial.** SPEC-002's validation note — someone who is not the author planting a
   defect in the **policies** — is the last item on the board that is not feature work, and the only
   one money can buy directly.

## About this record series

These records are frozen. Editing one to correct a number destroys the only thing it was for — a
score is a claim about a commit, and a corrected claim is a claim about nothing.

Frozen is not the same as harmless. A reader who opens `04-SCORECARD.md` and takes 36 as current is
misled by a document that is doing exactly what it was designed to do. So the series now carries the
repository's own answer to that problem — **durable claims written down, volatile state computed**:

- every record states its commit, date and (where it has one) score in a header block, and
  `scripts/review-records.mjs` checks that the commit exists in history and that the numbering
  matches real ancestry;
- **which record is current is computed**, not written. `npm run status` prints it, including how far
  behind HEAD it is;
- **outside the records, a score is a live claim.** Any document stating a score that is not the
  current one fails the build. Inside a record, any score may be discussed, because a record says
  which commit it is about.

Being behind HEAD is reported and never fails. Every commit after a review would otherwise break the
build, and a review that punishes committing does not get done a second time.

Headers were added to `00`–`06` in the same change. That is a metadata addition stating what each
record already claimed in its own prose, not a correction of any finding or score — recorded here so
the edit is visible rather than discovered.
