# SPEC-NNN: <title>

> Status: `draft` · Bars: **B-n** · Research: [`research/NN-AREA.md`](../research/NN-AREA.md) · ADRs: [00N](../docs/adr/ADR-00N-....md)
> Contracts: SPEC-NNN, SPEC-NNN ·

<!--
  Copy this file to `spec/SPEC-NNN-slug.md` and delete these comments as you go.

  Read `spec/README.md` first. This template is the SHAPE; that file is the workflow, and it is
  the one that says a spec is governed by `docs/PRODUCT.md` and the ADRs.

  Three things the gates will refuse, so they are worth knowing before you write rather than after:

    · `npm run check` → research — **an authored spec with no memo covering it fails the build.**
      Research the area from authoritative sources, write the memo, list this spec in
      `research/manifest.json`. Not a formality: the memo is expected to CORRECT the spec, which
      it cannot do if it is written afterwards to match what you already built.

    · `npm run check` → contracts — every `SPEC-NNN` on the Contracts line must name this spec
      back. A one-way dependency is invisible from the side that would break.

    · `npm run check` → contracts — the header status and the row in `spec/README.md` must agree,
      and a spec claiming `done` with an open acceptance criterion is refused.

  Header notes: `Status` is one of `draft` · `partial` · `done` (`planned` rows live only in the
  index and have no file). Both `> Status:` and `> Contracts:` are parsed, so keep them on their
  own lines and keep the backticks around the status word. Bars and Research are omitted if the
  spec owns no acceptance bar or the memo is not written yet — but see above, it has to be.
-->

## Intent

<!--
  One paragraph. What is true after this ships that is not true now, and why that matters to the
  claim in `docs/PRODUCT.md`. Not a feature list — the acceptance criteria are the feature list.
-->

## Scope / non-scope

- **In scope:** <!-- the things this spec is accountable for -->
- **Out of scope, and named so it is a decision:** <!--
    Name what a reader would reasonably expect here and will not find, and say which spec owns it
    instead. "Out of scope by decision" and "deferred" are different: a deferral is work someone
    chose not to do YET and it goes in the registry with a trigger; out-of-scope is work that
    belongs elsewhere, and filing it as debt would be filing a deferral for something nobody
    chose to build.
  -->

## Sources of truth

<!--
  Real paths, in this repository. The contracts gate opens what a `done` criterion cites, and a
  reader will open these. A source that does not exist reads as diligence and is the opposite.
-->

- `docs/PRODUCT.md`
- `docs/adr/ADR-00N-....md`
- `research/NN-AREA.md`

## Requirements

<!--
  One `### REQ-n — <the requirement as a sentence>` per requirement. State the property, then say
  what goes wrong without it — the failure is what makes a requirement reviewable, and the ones in
  this repository that earned their keep all name a specific way something breaks.

  Where a requirement exists because of something MEASURED, say so and cite it. `research/03` and
  `research/04` corrected SPEC-001 in four places; those corrections are the most valuable
  sentences in it, and they read as authoritative because they are reproducible.

  Prefer a property that a test can attack over a description of an implementation. "Every write
  policy has a WITH CHECK that constrains the organization" is checkable; "policies are correct"
  is not.
-->

### REQ-1 — <the requirement>

<!-- What breaks without it. -->

### REQ-2 — <the requirement>

## Acceptance criteria

<!--
  Every REQ needs at least one. The table is PARSED — five columns, in this order, and the fourth
  is what a reader opens. A criterion marked `done` whose evidence cell names no openable file is
  refused by the gate, and so is a glob: name the file.

  `Method` is `test` · `analysis` · `inspection`. Prefer `test`. An `inspection` that nobody
  repeats is a memory of a Tuesday.

  Status is `planned` while the spec is `draft`. That is honest and the gate expects it — evidence
  is only demanded of criteria claiming to be done.

  The load-bearing question for each row: **would this fail if the requirement were violated?**
  A check that cannot fail is this project's most expensive recurring defect (F-30), and it has
  always looked exactly like a check that passes.
-->

| AC   | Verifies | Method | Evidence                                                    | Status  |
| ---- | -------- | ------ | ----------------------------------------------------------- | ------- |
| AC-1 | REQ-1    | test   | `path/to/the.test.mts` — what it asserts, in a few words    | planned |
| AC-2 | REQ-2    | test   | `path/to/other.test.sql` — and the mutation it is proven by | planned |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] Cheap gates green: `npm run check`.
- [ ] The research memo re-verified on the date of build, and its date moved only by someone who re-read the sources.
- [ ] **Written up.** A `differentiators` entry in `docs/content/MANIFEST.json` — the claim, what the
      field does instead, evidence that resolves, and a battlecard section — or an entry in
      `$noDifferentiator` saying why this ships nothing worth claiming. The `content` gate refuses a
      `done` or `partial` spec that has neither.
- [ ] **Validation note:** <the spec-specific bar — see below>

<!--
  The last box is the spec-specific one, and the most useful ones are adversarial. SPEC-001
  requires a second pair of eyes to read the policy SQL *as SQL* — not the TypeScript that calls
  it, and not a passing test — because a green suite is compatible with a wrong policy.

  Ask what would still be broken with every box above ticked, and write that here.

  (Keep a multi-line comment OUT of a list item. Prettier re-indents one on every pass and never
  converges, so `format` fails no matter how many times you run it — measured writing this file.)
-->

## Deferrals

<!--
  Rows in `spec/DEFERRAL_REGISTRY.md`, referenced by id, each with a reason and a trigger.

  **Rule 0 — a defect is never a deferral.** If you broke it, you fix it in the change that broke
  it. And if nothing was deferred, say "None" and say why the absence is real, rather than leaving
  the heading to imply someone thought about it.
-->

None.
