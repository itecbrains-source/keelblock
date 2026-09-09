# SPEC-024: Handover

> Status: `partial` · Bars: **B-11** · Research: [`research/12-HANDOVER-TRIAL.md`](../research/12-HANDOVER-TRIAL.md) · ADRs: [019](../docs/adr/ADR-019-documentation-timing.md)
> Contracts: SPEC-002, SPEC-003, SPEC-012 ·

## Intent

Establish, by trial rather than by belief, whether someone who has never seen this repository can add
a tenant-scoped feature and **find out for themselves that they got it wrong**. Every other bar here
is about what the code does; B-11 is about what the repository teaches, and it is the only one that
cannot be satisfied by writing more code.

## Scope / non-scope

- **In scope:** the trial protocol; the agent trial, run and recorded; what the gates caught and what
  they missed; a finding for each miss.
- **Out of scope, and named so it is a decision:**
  - **The human trial.** It needs a person who has not seen this repository, and there is no honest
    way to fake one. Deferred: **DEF-024**, with a date rather than a `decided:` nobody types.
  - **SPEC-002's validation note.** It reads similar and is not the same bar — see REQ-4. It stays
    open as DEF-020.
  - **Fixing what the trial finds, inside this spec.** A miss is recorded as a finding; whether it
    becomes a gate is the owning spec's decision, not this one's.

## Sources of truth

- `docs/PRODUCT.md` — B-11's wording and its stated evidence
- `research/12-HANDOVER-TRIAL.md` — the method, and the two limits it imposes
- `docs/TESTING.md` — where trial records live
- `spec/SPEC-002-proof-harness.md` — the validation note REQ-4 distinguishes this from

## Requirements

### REQ-1 — the measurement is whether being wrong was made obvious, not whether it succeeded

A trial where the participant fails and a gate names the failure is a **pass**: that is the property
this repository claims. One where they succeed while a gate stayed silent is not, and is worth more
than a clean run, because it locates something no test covers.

### REQ-2 — the facilitator does not help

MEASURED by others and imported rather than rediscovered: _"from an untrained facilitator, such
interruptions can very easily change user behavior … the resulting behavior doesn't represent real
use, so you can't base design decisions on the outcome."_ No hint, no nudge toward the gate that
would have caught it, no correction mid-task. The facilitator records.

### REQ-3 — one trial is a data point, and the record says how many have been run

MEASURED: with L ≈ 31%, _"a single user uncovers roughly one-third of all problems"_. A spec treating
one green trial as proof of handover-readiness would overclaim by about a factor of three. B-11 is
claimed against a stated count, and the count is in the record.

### REQ-4 — the agent trial does not satisfy SPEC-002's validation note, and the spec says so

SPEC-002 asks that _"someone other than the author planted a policy defect and confirmed the harness
caught it."_ B-11 asks whether the repository **teaches** — its participant must be ignorant of the
code, which a fresh agent session is. SPEC-002 asks whether the harness catches what a **different
mind** would try — its participant must be adversarially independent of the author's assumptions,
which an agent the author spawns, on a task the author wrote, is not. Resolving this by convenience
would retire a real bar with a technicality.

### REQ-5 — a defect the gates miss is written up, not quietly fixed

The miss **is** the measurement. Fixing it silently destroys the only evidence the trial produced.

## Acceptance criteria

| AC   | Verifies | Method        | Evidence                                                                                                                                                                                                                      | Status   |
| ---- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1    | demonstration | `docs/TESTING.md` — the trial record: the brief, ~34 minutes, the full `npm run check` green, and the four things nothing told it, chief among them that no gate runs `next build`                                            | **done** |
| AC-2 | REQ-2    | demonstration | `docs/TESTING.md` — states that no help was given, quotes the participant's own words rather than summarising them, and records the two facilitator interventions including the one that changed what the trial could measure | **done** |
| AC-3 | REQ-3    | inspection    | `docs/TESTING.md` — "One trial. With L ≈ 31%, that finds roughly a third of what is there"; B-11 claimed at one agent trial with the human half open                                                                          | **done** |
| AC-4 | REQ-4    | inspection    | this spec's REQ-4 and `research/12-HANDOVER-TRIAL.md` both state the agent trial cannot close SPEC-002's validation note; DEF-020 remains open in the registry                                                                | **done** |
| AC-5 | REQ-5    | test          | `docs/FINDINGS.md` F-49 (no gate runs `next build`) and F-50 (the F-47 fix introduced a contradiction a newcomer read as written)                                                                                             | **done** |

## Definition of Done

- [x] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [x] The agent trial run and recorded, including what it got wrong.
- [x] The human half deferred with a trigger that fires — DEF-024, `date:2026-12-08`.
- [x] **Validation note:** the record is written from the participant's own report rather than from
      the facilitator's impression of it. A trial summarised by the person whose work is being tested
      is the same failure mode as a gate written by the person whose code it checks.
