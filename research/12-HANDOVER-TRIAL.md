# Measuring handover — a codebase is a user interface, and this is a usability test

_Researched 2026-09-08. B-11 asks whether someone who has never seen this repository can add a
tenant-scoped feature correctly and prove it themselves. That is not a documentation question; it is a
usability test with the codebase as the interface, which means the methodology already exists and has
known limits worth importing rather than rediscovering._

## What B-11 actually asks

> "Handover-ready: someone who has never seen this repository — a new developer or a coding agent —
> can add a tenant-scoped feature correctly on their first attempt, and **prove it themselves without
> a reviewer**." Evidence: "a scripted trial: a fresh agent session and an unfamiliar developer each
> given one feature task and only the repository; measured on whether the gates catch what they get
> wrong."

The measured property is deliberately not success. It is **whether being wrong was made obvious**,
which is the thing this repository actually claims and the only part a gate can carry.

## What the method says, and both findings constrain the spec

### One trial finds about a third of the problems

Nielsen and Landauer's model — problems found = `N(1 − (1 − L)^n)`, with L ≈ 31% —

> "A single user uncovers roughly one-third of all problems … by the fifth user, you are wasting your
> time by observing the same findings repeatedly."

**So a single trial cannot close B-11**, and a spec that treats one green run as proof of
handover-readiness would be overclaiming by roughly a factor of three. The honest shape is a first
trial that finds what it finds, with the bar naming how many have been run.

The same source argues against saving up for one large study:

> "Spend this budget on 3 studies with 5 users each!"

which maps onto this project better than it might look: trials are cheap here, the repository changes
weekly, and a trial run against a version nobody ships is worth less than a smaller one run against
the current tree.

### The facilitator is the largest threat to the result

The think-aloud literature is blunt about who ruins these:

> "Prompts and clarifying questions are usually necessary, but from an untrained facilitator, such
> interruptions can very easily change user behavior … the resulting behavior doesn't represent real
> use, so you can't base design decisions on the outcome."

And, reassuringly for a method being run by its own author:

> "Robust. Most people are poor facilitators … unless you blatantly bias users by putting words into
> their mouths, you'll still get reasonably good findings."

**The operational rule that follows: do not help.** Not a hint, not a nudge toward the gate that would
have caught it, and no correction mid-task. The trial's value is entirely in what the participant does
unaided, and a facilitator who intervenes is measuring themselves.

## The distinction this repository has to make, because two different trials are open

SPEC-002's Definition of Done carries a bar that reads similar and is not:

> "someone other than the author planted a policy defect and confirmed the harness caught it."

These target different things and only one of them an agent can satisfy.

- **B-11 asks whether the repository TEACHES.** Its participant must be ignorant of the codebase.
  A fresh agent session qualifies: it has no memory of the code and reads only what is there.
- **SPEC-002 asks whether the harness catches what a DIFFERENT MIND would try.** Its participant must
  be adversarially independent of the author's assumptions. **An agent the author spawns, with a task
  the author writes, is not that.** It is independent of the code and not of the person who chose
  what to attack, and the value of that bar lies precisely in someone who does not share the author's
  idea of where the weak points are.

Recording this rather than resolving it by convenience: **the agent trial can honestly satisfy B-11's
agent half and cannot satisfy SPEC-002's validation note.** DEF-020 stays open.

## Settled for the spec

1. **The measurement is "was being wrong made obvious", not "did it succeed."** A trial where the
   participant fails and the gates name the failure is a PASS for B-11; one where they succeed by
   luck while a gate stayed silent is not.
2. **A defect the gates MISS is the most valuable outcome available** and is written up as a finding
   rather than quietly fixed, because the miss is the measurement.
3. **Do not help.** The facilitator's only job is to record.
4. **One trial is a data point, not the bar.** The spec states the count.
5. **The human half needs a human**, and it is deferred with a trigger that can fire rather than a
   `decided:` nobody will ever type.

## Sources

**Primary** — read 2026-09-08:

- [NN/g — Why You Only Need to Test with 5 Users](https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/) · the `N(1 − (1 − L)^n)` model, one user ≈ 31%, and the argument for several small studies over one large one
- [NN/g — Thinking Aloud: The #1 Usability Tool](https://www.nngroup.com/articles/thinking-aloud-the-1-usability-tool/) · the facilitator-contamination warning, and the robustness of the method to imperfect facilitation
- `docs/PRODUCT.md` · B-11's own wording, quoted above
- `spec/SPEC-002-proof-harness.md` · the validation note this memo distinguishes B-11 from

**Secondary** — none. Both method claims are quoted from the originating source.
