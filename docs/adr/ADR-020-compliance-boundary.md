# ADR-020: No compliance evidence in the free tier, and a control tag is evidence

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner

## Context

`docs/COMMERCIAL.md` prices the paid tier as compliance evidence for a third party, and ADR-009 drew
the line: **proof is free, evidence is paid** — the free tier proves the system correct to you, the
paid tier produces artifacts for an assessor. This ADR answers two questions that line left open, one
of which was put to it explicitly.

The pull is real. This repository already produces artifacts most companies pay a vendor to
manufacture: a published access matrix per table × command × identity, a generated suite that can no
longer pass against an empty fixture (AC-11), a hand-written intent layer, a mutation proof per gate,
and a public CI run behind each. The distance from that to something an auditor would accept is
packaging.

## Decision Drivers

- **A starter kit cannot emit SOC 2 evidence, and saying otherwise is the most damaging thing this
  project could say.** A Type II report audits an organization's controls over an observation period,
  on a production system with real users. keelblock has no users, no deployment (DEF-001) and no SOC 2 of
  its own; an evidence pack today would be evidence about nothing.
- The competitor set for that product is Vanta and Drata, not MakerKit.
- **"SOC 2 kit" invites the reading "buy this and you are compliant."** That is the easiest place in
  this whole product to overclaim, and overclaiming is the one failure this project cannot survive,
  because every other claim it makes is checkable.

## Decision

**1 · No compliance evidence ships in the free tier, and none is built anywhere until a buyer exists.**
What a kit can honestly contribute is evidence for **one control family — logical access — for the
system somebody builds on it, once that system is in production.** That is a narrow and true claim,
and it is the only one available.

**2 · A control tag is EVIDENCE, and it stays out of the free tier.** This was the open boundary
question, and it is genuinely close: tagging the access matrix `CC6.1` describes what the proof
already proves, which argues proof; and it exists to let a third party map that proof to a framework,
which is the job ADR-009 assigns to the paid layer.

It is evidence, for two reasons. The first is definitional: the tag adds nothing a reader of the
matrix does not already have. Its entire function is legibility **to an assessor** — a person the free
tier does not serve — so it is not a better proof, it is a proof addressed to somebody else. The
second decides it: a `CC6.1` label sitting in a free MIT starter is the seed of exactly the overclaim
named above. It costs nothing to add later — ADR-009 says the paid layer **reads keelblock's outputs and
never patches its internals**, and a tag applied by reading the matrix is that pattern working — and
it is expensive to remove once somebody has repeated it back to us in a sales conversation.

**3 · The proof-run record ("layer 1") is deferred, not built.** The observation behind it is correct
and was verified: every gate run produces a verdict and discards it, and no dated record exists of what
was proven, against which commit, when. But its two stated benefits are already served — rot is caught
by the `freshness` gate, and run history is public on GitHub and linkable per commit. What is genuinely
missing is **retention past GitHub's window**, and that becomes real when there is a history worth
keeping. Building an evidence-collection artifact that nothing reads is the unexercised seam ADR-002
refuses in another context, and this project's own standard is that a mechanism must name the specific
failure it prevents. Filed as **DEF-023** with a trigger rather than as an intention.

## Consequences

**Positive:** the free tier keeps making claims it can defend, and the paid tier keeps a job worth
paying for that does not require degrading the free one. Nothing in this repository can be read as
"buy this and you are compliant", because there is nothing in it addressed to an assessor.

**Negative — named:** the artifacts genuinely are close to auditor-ready, and this decision declines to
close a gap that is mostly formatting. If a buyer appears with a live SOC 2 process, the paid layer
starts from a standing start rather than from a year of collected runs — that cost is real, it is what
DEF-023 exists to reconsider, and it is preferred to shipping evidence about nothing.

**The test for any wording that is ever drafted**, in the paid tier or the marketing: _could an auditor
read this and expect something this repository does not produce?_ If yes, it is wrong however
technically defensible the sentence is. The framing that survives that test is narrow —
**continuously generated evidence for the tenant-isolation control** — and it is not compliance, and
it is not readiness.
