# Two questions: documentation timing, and a SOC 2 emitter — 2026-09-08

```yaml
record: 11
commit: 34783fc
date: 2026-09-08
```

**No score.** This record answers two questions rather than measuring anything, so it carries no
number and the current score remains record `10`'s. `npm run status` reads the newest record that
states one — which is why omitting it is allowed and guessing is not.

**These are recommendations, not decisions.** Both questions end in an ADR, and an ADR written by the
reviewer is a recommendation wearing a decision's clothes. The analysis and the reasoning are here;
whether either becomes a decision, and in what form, belongs to the person who has to live with it.

---

# Part 1 — Should documentation be built as the project progresses?

## The decision is already made, and it is right

`docs/WEBSITE-AND-DOCS.md` settles both halves:

> **With each spec:** its documentation ships as a DoD item. A spec whose docs are missing is not
> done, because B-5 says a stranger must get there on the docs alone.

> **At v0.1:** build the site. Not before — a site for software that does not run yet is the
> comfortable way of not shipping.

Those are consistent, and the distinction between them is the entire answer. Documentation ships
continuously; the **site** waits. Conflating the two is what makes this feel like an open question
when it is not.

## But the rule lives where nothing reads it

That DoD sentence appears in one prose file. It is **not** in `spec/_TEMPLATE.spec.md`'s Definition
of Done. Six specs have shipped `done` since it was written, and none of them shipped a task guide.

This is the shape the repository keeps catching in itself — R-3, AC-3c, and the pre-F-41 coverage
count: **a rule stated in prose, with no mechanism, drifts silently while every check stays green.**

The template's Definition of Done is worth reading closely on this point, because it is not empty. It
carries a **"Written up"** box requiring a `differentiators` entry — the claim, what the field does
instead, the evidence, and a battlecard section — enforced by the `content` gate, which refuses a
`done` spec that has neither that nor a recorded reason.

So the template enforces **competitive copy** and does not enforce **documentation**. That is almost
certainly not a considered ordering of priorities; it is what happens when one rule got a gate and
the other got a paragraph.

## Three kinds of documentation, three different timing rules

Separating them dissolves most of the disagreement:

| Kind                | What it is                       | Examples here                                        | When it ships                                                  |
| ------------------- | -------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| **Decision record** | why it is built this way         | ADRs, `FINDINGS.md`, the specs                       | As it happens — the reasoning is perishable. Already done well |
| **Reference**       | what exists and how it behaves   | `TESTING.md`, `AUTHORIZATION.md`, `ACCESS-MATRIX.md` | With the spec that creates it. Mostly happening                |
| **Task guide**      | how a stranger performs the task | none exist                                           | With the spec — and this is the gap                            |

The flagship guide `WEBSITE-AND-DOCS.md` names by name — **"add a tenant-scoped table"** — does not
exist. It is the most common task, it is where people leak data, and the gate catching them when they
get it wrong is this product demonstrated in miniature. It is an afternoon now and an archaeology
project in month six.

## The rule worth adopting instead of "now versus later"

> **Documentation that can be executed ships with the spec. Prose about unbuilt features never ships
> at all.**

This is not a slogan; it is a mechanism, and it is available here in a way it is not available to
anyone else in the field.

Supastarter's setup documentation is good — CLI-first, commands over narrative, clear decision trees,
a manual path for when the scaffolder fails. It is also markdown that a human verified once. **Every
kit's install documentation rots**, because nothing runs it.

Extract the commands from a getting-started guide and execute them on a clean runner. Bar B-5's
stated proof is _"a scripted walkthrough run by someone with no prior context, timed and recorded"_ —
a promise about a future event. The executable version is a job that goes red the day the docs and
the code disagree. That is the same move as every other gate here, applied to the one artifact the
whole category leaves unverified.

## One ordering constraint

Supastarter's setup page opens with `npx supastarter new my-project`. keelblock's equivalent is a
clone at a tag, because SPEC-011 does not exist and the npm names are placeholders.

So the **setup page** depends on the scaffolder and its shape will change when that lands, while the
**task guides** do not. Write the guides now; write the setup page after SPEC-011. And note that
B-1's five-minute claim cannot be honestly documented until the scaffolder exists — a setup page
today would have to describe a slower path than the bar promises, which is fine to say and not fine
to omit.

## What this suggests, for someone else to decide

1. Move "documentation ships with the spec" out of `WEBSITE-AND-DOCS.md` and into the spec template's
   Definition of Done, where the `content` gate can refuse a `done` spec without it — the same
   treatment the `differentiators` entry already gets.
2. Write the tenant-scoped-table guide next. It is the highest-value page available and it is cheap
   today.
3. Make getting-started executable in CI when SPEC-011 lands, and let it own B-5.
4. Do not build the site. That decision is already correct and needs no revisiting.

---

# Part 2 — Should keelblock build a SOC 2 emitter kit?

## Short answer: not now, and the reason is not effort

**A starter kit cannot emit SOC 2 evidence, because SOC 2 is not about the kit.** A Type II report
audits an organization's controls over a period — typically three to twelve months of operating
effectiveness, on a production system, with real users and real data. What a starter can contribute
is evidence for **one control family** — CC6.1, logical access — for **the system somebody builds on
it**, and only once that system is in production. Anything broader is a claim about somebody else's
company.

Three further objections, in increasing order of how hard they are to engineer around.

**The buyer does not exist.** Zero users, no deployment, no customers. An evidence pack for a
repository nobody has run is evidence about nothing.

**Compliance is a trust market.** Selling audit evidence as a days-old project, with no production
system and no SOC 2 of its own, invites the first question a security buyer asks — _who are you_ —
and there is currently no answer. That is a reason the sequence matters here more than anywhere else
in the product, not a reason never to do it.

**The competitor set changes underneath you.** An evidence pack does not compete with MakerKit. It
competes with Vanta, Drata and Secureframe — funded, with auditor relationships, selling to a
security or compliance function rather than to a developer. That is a different company from the one
that writes `FINDINGS.md`.

## But the underlying observation is right, and stronger than it looks

keelblock already produces artifacts that most companies pay a compliance vendor to **manufacture**:

- an access matrix, per table × command × identity, regenerated and byte-compared on every push;
- a generated policy suite that now cannot pass against an empty fixture;
- an adversarial intent layer covering what the generated one structurally cannot;
- a mutation proof per gate;
- a public CI run standing behind every one of them.

For a logical-access control that is **better evidence than a dashboard screenshot**, because it is
derived from the database rather than attested by a human. The gap between what exists and what an
auditor wants is packaging and attribution — not capability.

## The two-layer answer, and only the first is worth building now

**Layer 1 — collect. Free, in-repo, roughly a day.**

Every proof run currently produces a verdict and discards it. Nothing keeps a dated record of _what
was proven, against which commit, when, and by which run_. A small run-history artifact — proof kind,
commit, timestamp, CI run URL, outcome — is squarely **proof rather than evidence**, so it does not
cross ADR-009's line, and it earns its keep three ways even if the paid tier never ships: it is a rot
detector, it is the raw material for "here is this project's isolation-proof history", and it makes
layer 2 a formatter rather than a build.

**Layer 2 — format. Paid, separate repository, when a buyer exists.**

Mapping those records into a control framework's language, with attribution and export, is the
auditor pack `COMMERCIAL.md` already prices. Building it before anyone has asked to buy it inverts
this project's own sequence: `DEF-009` says pricing needs research before a number reaches a page,
and building the product before the pricing research is the same mistake one step earlier.

## The trap worth naming loudly

**"SOC 2 emitter kit" invites the reading _buy this and you are compliant_.**

That is the single easiest place in this entire product to overclaim, and overclaiming is the one
thing keelblock cannot survive — every other differentiator rests on the property that nothing here
asserts what it has not measured. If this ships, the honest framing is narrow and has to stay narrow:
**continuously generated evidence for the tenant-isolation control.** Not compliance. Not readiness.
Not a kit that gets you through an audit.

A useful test for any wording that gets drafted: could an auditor read it and expect something this
repository does not produce? If yes, it is the wrong wording, however well it sells.

## One boundary question that belongs to ADR-009, not to this record

Tagging the access matrix with its control reference — CC6.1 — is nearly free and would seed layer 2.
Is a control tag **proof** or **evidence**?

An argument each way. It describes what the proof already proves, which makes it proof, and the
`saas-testing-toolkit` ADR-009 draws on already tags its org-isolation suite that way. Against: a
control reference exists to serve a third party, which is the exact job ADR-009 assigns to the paid
layer.

It is a small decision and it is the first place that line could blur without anyone noticing, which
is precisely what ADR-009 exists to prevent. Worth deciding deliberately rather than discovering
later that it was decided by a commit.

## Sequencing, against everything else open

B-10 upgradability first — it is the largest block of unearned ground, and it gets harder once
billing rows exist. Then SPEC-007. Layer 1 can ride alongside either, because it is a day and it
touches nothing. Layer 2 waits for a person who wants to buy it.

---

## What this record does not do

It does not decide either question, and nothing in the repository depends on it. If the analysis is
accepted, Part 1 is a change to the spec template plus a guide, and Part 2 is an ADR and a small
artifact. If it is rejected, the reasoning is on the record and can be argued with, which is the only
thing a review document is actually for.
