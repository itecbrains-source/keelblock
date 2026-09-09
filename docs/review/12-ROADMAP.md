# The road to competitive parity — 2026-09-09

```yaml
record: 12
commit: e7f5494
date: 2026-09-09
score: 79
```

**Seventh dated record**, and it does two things because one of them is overdue.

Its subject is a **roadmap**: which absences would lose deals, which absences are the positioning, and
what order the unbuilt specs should be built in. Its header also carries the **current score**,
because record `10`'s 72 has been superseded twice in conversation and never written down — which is
the exact drift the record series exists to prevent, produced by the person who built the mechanism.

---

# Part 0 — the score, reconciled

`10` scored 72 at `34783fc`. Two movements since, both already argued in conversation and neither
recorded until now.

| #   | Dimension          | Rung | Weight | Contributes |
| --- | ------------------ | ---- | ------ | ----------- |
| D1  | Isolation, proven  | 5    | 20     | **20.0**    |
| D2  | Stranger can check | 5    | 15     | **15.0**    |
| D3  | Self-honesty       | 5    | 10     | **10.0**    |
| D4  | Product surface    | 2    | 15     | 6.0         |
| D5  | Rot resistance     | 5    | 10     | **10.0**    |
| D6  | Upgradability      | 4    | 10     | 8.0         |
| D7  | Removability       | 1    | 5      | 1.0         |
| D8  | Handover           | 4    | 5      | 4.0         |
| D9  | Adoption           | 1    | 5      | 1.0         |
| D10 | Maintainability    | 4    | 5      | 4.0         |
|     |                    |      |        | **79.0**    |

`contribution = rung ÷ 5 × weight`. The column is restored deliberately: records `07` through `09`
printed rung and weight side by side in different units with the product omitted, which invites
reading a full-marks 5 as five out of twenty. That was a presentation defect of the same class this
review keeps raising — a table that looks complete and asks the reader to derive the number that
matters.

**What moved since `10`:** D6 1 → 4 when SPEC-013 landed and its job got a positive control; D8 3 → 4
when B-11's agent half closed with published findings; D1 5 → 4 → 5.

**That D1 round trip is the important one.** The adversarial trial (F-53) planted a one-word helper
swap and every step stayed green over a live privilege-escalation path. D1 dropped to 4, because a
proof with three coinciding blind spots is not a 5. It returned to 5 when the class was closed — a
member-refused control required per authority-gated command, read from `pg_depend` rather than
expression text and from the intent run's TAP rather than its source files, which **named seven
commands and found four real gaps on its first run.** A new rule that finds nothing on its first run
is the suspicious kind.

## The standing caveat, which belongs in the permanent record

Six errors have now been found in this review's own output. Four were D1 over-scores — generous about
keelblock's proof, each corrected by someone running something this reviewer could not. Two were
claims about competitors: dark mode, diagnosed by searching documentation when the evidence was in a
stylesheet, and a battlecard row asserting the field "proves none", which was a verified fact about
BoxyHQ's _schema_ widened into an unverified claim about their _test directory_.

**Every one of the six flatters keelblock.** That is a systematic bias, not six accidents, and it is
the strongest caveat on every number in this series. Two rules follow, and the second is new:

- a score produced without running the thing it scores is a reading of published evidence, not an
  audit;
- **a claim may only be as broad as the artifact actually read.** "No `create policy` statements" was
  checked. "Proves none" was a different sentence about a directory nobody opened.

---

# Part 1 — which absences lose deals

Parity was refused **for the first version**, which is not the same as refused. A starter kit with no
route to the field's feature set is a research project, and the distinction that matters is not
breadth versus focus — it is which specific absences a buyer notices before they pay.

| Absent today                                                                                                              | Verdict                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Billing · transactional email · admin and impersonation · audit log · API keys · outbound webhooks · scaffolder · docs    | **Loses deals.** Every one is checked before purchase                        |
| SSO · SCIM                                                                                                                | Loses **enterprise** deals. Correctly deferred — on verifiability, not taste |
| Multiple frameworks · five payment providers · CMS and blog engine · feature-flag store · plugin marketplace · design kit | **Positioning.** Their absence is the argument                               |

Row one belongs on a roadmap. Row three does not, and `PRODUCT.md`'s refusals table should not be
softened to shorten it — those refusals are why the rest of the page is credible.

Read against MakerKit's own feature page on 2026-09-09, keelblock ships roughly three of about
fifteen areas fully, five partly, on one stack of six. That gap is real. It is also the gap the
strategy chose, and the useful number is a different one: **a B2B SaaS starter becomes usable when a
customer can sign up, create an organisation, invite a team, and pay.** Three of those four exist and
are journey-tested. Billing is the fourth.

**Parity is a long road. Usable is one feature away.**

---

# Part 2 — three forces that should reorder the phases

`spec/README.md` already carries phases, sequenced by architecture: the claim, identity, money,
surface, the rest of a real SaaS, adoption. That ordering was right for building the foundation. It
is not the ordering that gets to a competitive product, for three reasons.

## 1 · Isolation surfaces come earlier than their competitive weight

File storage, audit log, API keys and outbound webhooks are all B-2 surfaces, and they are the only
features where **shipping them grows the differentiator.** Each adds rows to the published access
matrix in the direction that sells the product.

Every competitor has an audit log. None can show you who can read one. Building these late spends the
1.75× tenancy multiplier without collecting the thing the multiplier buys.

## 2 · Schema-shaped work comes before presentation work

Anything that adds tables or touches the tenancy model gets more expensive with every table already
there. Erasure and portability (SPEC-031) is the clearest case: it collides with the last-owner
invariant, and that collision is cheaper to resolve before billing rows exist than after. ADR-016 and
ADR-006's addendum were both written on this reasoning; it applies to the build order too.

## 3 · Transactional email is a dependency, not a feature

ADR-021 made email the single point of failure for **all** sign-in, and billing needs it for dunning.
SPEC-017 sits in a later phase than two things that require it.

---

# Part 3 — the proposed shape

Ordered, not dated. A date this review invents is a date nobody agreed to.

## v1 — usable · a customer can run a business on it

**SPEC-007** billing · **SPEC-017** transactional email · **SPEC-008** account and organisation
settings · **SPEC-009** marketing shell, ops and health.

Email moves up to sit beside billing rather than after it, per force 3. This is the set that closes
the core loop.

## v1.1 — evaluable · somebody can assess it without asking

**SPEC-011** `create-keelblock-app` · **SPEC-012** docs and the stranger walkthrough · **SPEC-022**
onboarding · **SPEC-015** accessibility and performance budgets · **SPEC-028** SEO.

Nobody assesses a starter they cannot start. Bar B-1's five-minute claim **cannot currently be tested
at all**, because the scaffolder does not exist — so it is neither met nor falsifiable, which is the
worse of the two.

## v2 — competitive · the bulk of what the field lists

Isolation surfaces first, per force 1: **SPEC-018** file storage · **SPEC-025** audit log ·
**SPEC-026** API keys · **SPEC-027** outbound webhooks · **SPEC-031** erasure and portability.

Then the rest: **SPEC-021** admin and audited impersonation · **SPEC-019** background jobs ·
**SPEC-020** notifications · **SPEC-029** analytics · **SPEC-023** legal pages and error monitoring ·
**SPEC-010** custom domains.

## v2+ — conditional, on a trigger rather than a mood

SSO when a mock identity provider exists · SCIM, which the DEF-005 split correctly moved to the
isolation side of the line · MFA · **SPEC-014** removability, which is four points of D7 and has never
been touched.

## Refused, and not on any road

Multiple frameworks (ADR-012) · multiple payment providers · a CMS or blog engine · a feature-flag
store · a plugin marketplace · a design kit. Each has a written reason. **Reopening one is an ADR,
not a roadmap decision** — which is the point of having refused them in writing.

---

# Part 4 — the change worth making first, and it is not a feature

**Publish the roadmap.**

Today, what is unbuilt is visible only by running `npm run status` on a clone. That is honest and it
is invisible to anyone evaluating. A visitor sees a short feature list and no plan, so **the honesty
reads as absence rather than as sequence.**

MakerKit and Supastarter effectively publish theirs as a feature grid. A published keelblock roadmap
would be a better artifact than either, because it can carry three columns none of them can:

| Column                 | What it means                                                                |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Built and proven**   | with a link to the check anybody can run                                     |
| **Specced, not built** | with the spec, so the plan is readable rather than promised                  |
| **Refused**            | with the reason — the column no competitor can publish without losing a sale |

That third column is the one that converts. Everyone claims a roadmap; nobody publishes what they
have decided not to do and why.

It is also mostly assembly rather than authoring: the specs, the deferral registry and `PRODUCT.md`'s
refusals table already exist. And it doubles as a differentiator pipeline, since the spec Definition
of Done already requires a battlecard entry per shipped spec — the roadmap is literally the list of
future rows.

**D9 has been 1 of 5 in every record in this series.** It is the only dimension nobody has touched,
and a published roadmap is the cheapest thing that moves it.

---

## What this record does not do

It does not amend `spec/README.md`. The phases are a decision, and re-ordering them belongs to the
person who has to build in that order — this is the argument for a re-ordering, offered so it can be
disagreed with. If it is accepted, the change is small: move SPEC-017 up beside SPEC-007, and move the
four isolation surfaces ahead of the presentation work in Phase 4b.

Two things remain with the owner and neither is engineering: **REQ-7's staleness direction**, which
blocks the whole of v1, and **ten minutes registering an OAuth application**, which closes DEF-018.
Both have been the critical path for several working sessions.
