# What v1 promises, and what exists — 2026-09-09

```yaml
record: 13
commit: 848a7e0
date: 2026-09-09
score: 81
```

**Eighth dated record**, covering the eight commits since record `12` was written at `e7f5494`.

It does three things. It verifies those commits and records the score they moved. It names a
**second recurring defect family**, distinct from the one records `05`–`10` kept finding. And it takes
a measurement record `12` assumed but never made: **how much of keelblock's own declared v1 surface
actually exists.** That last one is the reason this record is long, and it is the only part likely to
change a decision.

Reproductions were run against a working tree identical to `848a7e0` on 2026-09-09. Where a check
could not be run, this record says so rather than guessing — see Part 8.

```bash
git rev-list --count e7f5494..848a7e0     # 8
```

---

# Part 0 — the score

| #   | Dimension          | Rung | Weight | Contributes |
| --- | ------------------ | ---- | ------ | ----------- |
| D1  | Isolation, proven  | 5    | 20     | **20.0**    |
| D2  | Stranger can check | 5    | 15     | **15.0**    |
| D3  | Self-honesty       | 5    | 10     | **10.0**    |
| D4  | Product surface    | 2    | 15     | 6.0         |
| D5  | Rot resistance     | 5    | 10     | **10.0**    |
| D6  | Upgradability      | 4    | 10     | 8.0         |
| D7  | Removability       | 2    | 5      | 2.0         |
| D8  | Handover           | 4    | 5      | 4.0         |
| D9  | Adoption           | 2    | 5      | 2.0         |
| D10 | Maintainability    | 4    | 5      | 4.0         |
|     |                    |      |        | **81.0**    |

`contribution = rung ÷ 5 × weight`.

**79 → 81.** Two movements, both of one rung, and neither of them large:

- **D7 Removability, 1 → 2.** `34c6dd1` (F-56) removed SPEC-006 from a scratch clone and measured
  what happened: typecheck, build and 500 tests stayed green, and `locale`, `unused`, `lint` and
  `promises` each named exactly one leftover until it was gone. That is evidence the property is
  partly enforced already, which rung 1 — "asserted, never measured" — no longer describes. It is
  not rung 3, because SPEC-014 is still `planned` and one measurement of one module is not a test
  per optional module.
- **D9 Adoption, 1 → 2.** `cf59580` and `03503ee` shipped `create-keelblock-app`, and the `scaffold`
  job scaffolds, installs and runs `npm run check` against a five-minute budget. A scaffolder that
  provably works is more than rung 1. It is not rung 3, because **nothing is published** — DEF-027 —
  so nobody outside this repository can run it.

**D4 did not move and is the largest single hole in the score at nine points.** Part 3 is about why.

---

# Part 1 — the eight commits, verified

## 1.1 The reviewer's fifth error

Record `12` recommended settling B-1's relationship to B-10 by running `upgrade.mjs` against
`/tmp/app` in the `scaffold` job. **That recommendation was wrong**, and the correction came from the
implementer:

> running `upgrade.mjs` against `/tmp/app` would not have settled it — that project is scaffolded at
> `$GITHUB_SHA`, so upgrading it to `$GITHUB_SHA` delivers nothing and the positive control correctly
> refuses.

That is right. The proposed test could only ever have passed vacuously or failed for the wrong
reason. It is the fifth reviewer error recorded in this series, and like the first four it was
found by someone running something the reviewer had not.

**The fix that landed is better than the one recommended.** Record `12` wanted a third CI job to join
the two bars. `1acedc4` joined them **by construction** instead: the `scaffold` job now asserts, on
the generated project itself, that `git remote get-url upstream` resolves and that
`keelblock.provenance.json` carries `commit`, `ref` and `generated`.

```bash
sed -n '/the generated project can reach its origin/,/provenance ok/p' .github/workflows/check.yml
```

The seam is now a property of the artifact both bars stand on, rather than a job that can rot
independently of them. Fewer moving parts, and it cannot go green while the seam is broken.

A prediction is also settled and it went the other way: this reviewer predicted the seam would
break. It held. The implementer's framing is the correct one — the cheaper outcome, and the ten
minutes still bought the answer.

## 1.2 B-5, refused

`d4279ad` made the getting-started page executable: its shell blocks are extracted and run in an
empty directory on every push, and the assertion is that a **real project exists afterwards** —
`my-app/`, its provenance file, its `.env.local`, and `generated === 'create-keelblock-app'` — not
that a script exited zero. That is F-41 and F-48's lesson applied without being prompted.

Every incentive pointed at claiming bar B-5. The commit declined it:

> a green walkthrough is evidence the instructions work and none at all that they teach

`spec/README.md` records SPEC-012 as **partial** with B-5 UNCLAIMED, and
`docs/content/differentiators/SPEC-012.md` repeats it where a reader meets it rather than only where
a maintainer does. **This is the single best judgement in the window** and it is why D3 stays at
ceiling. A kit that ships a docs-executing CI job and does not claim the docs bar is doing something
the rest of this market does not do.

## 1.3 F-58 and F-59, both taken

`848a7e0` closed both findings this reviewer raised after `7a1661a`, and improved one of them.

**F-58** — the contracts gate accepted any backticked path that happened to exist on the machine
running it. `7a1661a` had patched SPEC-012's AC-6 by hand; the hole stayed open. The fix refuses
`^[/~]` **before** the existence check, so a path that exists locally cannot buy a pass — and it
extends to `..`, which this reviewer raised only as an open question:

```bash
git show 848a7e0 -- scripts/check-contracts.mjs
```

> `..` is refused for a second reason as well: it resolves against the gate's working directory
> rather than against the spec file that wrote it, so the same citation means two different things
> depending on who reads it.

**119 cited paths were swept before landing**, and the mutation proof restores the real pre-`7a1661a`
AC-6 text. That is the standard this repository sets and it was met without being asked.

**F-59** — DEF-027's body said the blocker was publishing, an owner act, while its trigger was
`spec-done:SPEC-016`, a spec still in `draft`. The registry gap would have reported unblocked whether
or not anything was ever published — the same defect DEF-026 was split out of DEF-018 to fix a day
earlier. The trigger is now `decided:scaffolder_published`.

```bash
grep -o 'decided:scaffolder_published' spec/DEFERRAL_REGISTRY.md
```

## 1.4 ADR-022

`848a7e0` also records the refusal of an AI surface in v1, in response to an open question about the
Vercel AI SDK. The reasoning is in the ADR; what matters for this record is that **the absence is now
a decision on file rather than a gap someone rediscovers**, which is the same treatment ADR-021 gave
passwords. Three of this repository's better documents exist because somebody asked why something was
missing and the answer turned out not to be written down anywhere.

---

# Part 2 — a second defect family

Records `05` through `10` kept finding one shape, and record `10` named it:

> **Family A — components proven, composition unrun.** Every part has a test; the assembly does not.
> Its detector is running the composition.

The eight commits in this window produced enough instances of a **different** shape to name it.

> **Family B — green that depends on undeclared local state.** The check is correct. The pass is an
> artefact of the machine that ran it. Its detector is running somewhere you do not control.

Three instances, in order of discovery:

| Instance                       | The undeclared state                                        | How it surfaced                           |
| ------------------------------ | ----------------------------------------------------------- | ----------------------------------------- |
| F-31                           | ACLs baked into the local Postgres image                    | found by reading, not by running          |
| the dev-database contamination | rows left by an earlier manual session                      | a suite that passed only after a real run |
| SPEC-012 AC-6                  | `/tmp/stranger`, created by a rehearsal ten minutes earlier | **CI, from the other side**               |

The implementer's own words on the third are the right entry for the family:

> the gate was right and my local green was an artefact of my working machine

The two families are not the same failure and do not have the same detector. Family A is caught by
assembling the parts; family B is caught only by running the same thing on a machine that owes you
nothing. **Both detectors now exist in this repository** — the composition tests for A, CI for B —
and the third instance was caught by the second detector rather than by review, which is the outcome
the mechanism was built for.

F-58's fix is stronger than a patch because it attacks family B at the class level: the gate now
refuses to ask a question whose answer depends on the machine.

---

# Part 3 — the measurement: three of nineteen

`docs/PRODUCT.md` declares nineteen numbered product areas for v1, plus an adoption layer. This
record's contribution is to count how many exist.

```bash
find src/app \( -name page.tsx -o -name route.ts \) | wc -l          # 5
grep -ho 'create table[^(]*' supabase/migrations/*.sql \
  | sed 's/create table //;s/if not exists //' | sort -u | wc -l     # 4
```

Five route files — `page`, `login`, `orgs`, `invite/[token]`, `auth/callback`. Four tables —
`organization`, `organization_member`, `organization_invitation`, `project`.

Spec statuses, counted from `spec/README.md`:

| Status  | Count |
| ------- | ----: |
| done    |     8 |
| partial |     2 |
| draft   |     3 |
| planned |    18 |

Mapped onto PRODUCT.md's own nineteen areas:

| Layer                                                                                    | Built | Declared |
| ---------------------------------------------------------------------------------------- | ----: | -------: |
| **Product areas**                                                                        | **3** |       19 |
| **Differentiator layer** — proof harness, gates, access matrix, scaffolder, upgrade path | **5** |        5 |

The three built areas are **Auth**, **Organizations**, and **Team & invitations**. Marketing shell,
Account, Billing, Custom domains, Ops & health, Transactional email, File storage, Background jobs,
Notifications, Admin & impersonation, Audit log, API keys, Outbound webhooks, Product analytics and
Local development are not built. SEO is `draft`.

**This is the finding, and it is not a criticism.** It is the arithmetic consequence of two decisions
this repository made deliberately and defends well: D-5 (one framework, so feature-completeness is
affordable) and the 1.75× tenancy multiplier that PRODUCT.md itself computes. Depth was bought first
on purpose.

But it means the honest description of keelblock at `848a7e0` is **a proof harness with an
auth-and-organizations demo attached**, not yet a SaaS starter kit. Both halves of that sentence
matter. The differentiator layer is complete and nothing else in the market has it. The product
surface is three-nineteenths of what this repository has promised in its own governing document.

**That gap is the whole of D4's nine missing points**, and no amount of further proof work moves it.

---

# Part 4 — the field, from first-party sources only

Read on 2026-09-09 from each vendor's own documentation and README. Third-party comparison sites and
roundups were deliberately not used: record `03`'s battlecard row about SSO had to be reversed for
exactly that reason, when a verified fact about one vendor's schema was widened into an unverified
claim about their test directory. Every cell below traces to the vendor describing themselves.

| Dimension                               | keelblock at `848a7e0`      | MakerKit                                               | Supastarter                           | BoxyHQ              |
| --------------------------------------- | --------------------------- | ------------------------------------------------------ | ------------------------------------- | ------------------- |
| Magic link / OAuth                      | **shipped**                 | yes                                                    | yes                                   | yes                 |
| Password                                | **refused** (ADR-021)       | yes                                                    | yes                                   | yes                 |
| Passkeys                                | _declared, unowned_         | —                                                      | yes                                   | —                   |
| MFA / 2FA                               | DEF-017                     | TOTP                                                   | yes                                   | —                   |
| SAML SSO / SCIM                         | DEF-005 / DEF-025           | —                                                      | —                                     | **yes**             |
| Organizations, roles, invitations       | **shipped**                 | yes                                                    | yes                                   | yes                 |
| Personal + team accounts                | refused (ADR-016)           | **hybrid**                                             | configurable                          | teams only          |
| Billing                                 | **SPEC-007 `draft`**        | Stripe + Lemon Squeezy; flat, tiered, per-seat; portal | four providers; seat, usage, one-time | **"Coming Soon"**   |
| Admin panel + impersonation             | SPEC-021 planned            | yes, plus ban, MFA-gated                               | yes                                   | —                   |
| Transactional email                     | SPEC-017 planned            | yes                                                    | yes                                   | yes                 |
| In-app notification centre              | SPEC-020 planned            | —                                                      | **yes**, with preferences             | —                   |
| File storage                            | SPEC-018 planned            | —                                                      | S3, presigned uploads                 | avatar only         |
| Audit log                               | SPEC-025 planned            | —                                                      | —                                     | **yes**             |
| API keys / outbound webhooks            | SPEC-026 / SPEC-027 planned | —                                                      | OpenAPI spec + UI                     | **yes**             |
| Blog + documentation site               | **refused**                 | yes                                                    | yes, full-text search                 | —                   |
| Onboarding flow                         | SPEC-022 planned            | —                                                      | **yes**, multi-step                   | —                   |
| Feature flags                           | **refused, with reasons**   | yes                                                    | —                                     | —                   |
| i18n                                    | **shipped**, one locale     | next-intl                                              | yes, including mail templates         | yes                 |
| Docker / non-Vercel deployment          | **absent and unrecorded**   | **marketed as a differentiator**                       | —                                     | compose file        |
| Tenant isolation proven by the database | **shipped**                 | RLS, unproven                                          | —                                     | **no RLS anywhere** |

## 4.1 Two findings from the field that change the picture

**BoxyHQ ships no billing.** Their README lists "Billing & subscriptions" under **Coming Soon**.
4,928 stars, Apache-2.0, SAML SSO and SCIM and audit logs and webhooks all shipped, and no payments
at all. PRODUCT.md treats BoxyHQ as the enterprise-surface benchmark, which is correct, but the
benchmark is **incomplete in the one area every SaaS needs on day one.** Nobody in this field is
complete. That is worth knowing before their feature list is read as a bar.

**MakerKit markets deployment portability as a weapon.** Their comparison page lists _"Cloudflare
deployment support"_ and _"Ready-to-use Docker files + docs"_ as rows, under the heading _"Real
Deployment Options"_. keelblock's single-target decision is defensible and this record does not argue
against it — but the field attacks Vercel-only by name, and keelblock has no written answer.

---

# Part 5 — four gaps that are registered nowhere

PRODUCT.md's _"Refused deliberately, with reasons"_ table already disposes of most of what a review
would flag: provider menus, feature flags, CMS, ORM on the query path, an example AI assistant. That
table is more rigorous than most companies' strategy documents and this record found nothing wrong
with it. Four things survived the filter.

## G-1 · Passkeys are promised and owned by nothing

`docs/PRODUCT.md` line 188 declares area 2 as _"Auth (magic link, OAuth, passkeys, 2FA — **no
password**, ADR-021)"_.

```bash
grep -rl passkey spec/     # no matches
```

2FA is registered as DEF-017. **Passkeys are owned by no SPEC and registered by no deferral.** They
appear only in `PRODUCT.md` and `ADR-021`, both times as an assumption that they are in scope.

This is a claim in the governing document with nothing tracking it — the precise class the gate suite
exists to catch, in the one document the gates treat as authoritative. It is the only instance found
in a full sweep, which is a good result and does not make it less of a defect.

**It is a two-line fix either way**: a SPEC that owns them, or a deferral that says they are not v1.
What it must not stay is a sentence in the product definition that no mechanism believes.

## G-2 · Ownership transfer does not exist anywhere

```bash
grep -ril 'transfer.*owner\|ownership transfer' spec/ docs/ src/    # no matches outside docs/review
```

Zero mentions repository-wide. What happens when the sole owner of an organization leaves, is
removed, or deletes their account? Every competitor's account model answers this because every
customer eventually asks it.

It matters more here than elsewhere for a specific reason: it is a **policy-predicate question that
lands in the schema**, and ADR-001's argument is that every policy has the same readable shape.
Answering it while four tables exist is cheap. Answering it after SPEC-007's entitlement tables land
is a migration with a billing relationship attached. SPEC-031 (erasure) already depends on SPEC-007
and does not name it.

## G-3 · Billing's edge surface, decided while SPEC-007 is still a draft

SPEC-007 is `draft` and **three specs depend on it — SPEC-003, SPEC-011 and SPEC-031** — which makes
it the most load-bearing unfinished document in the repository.

ADR-006 already settles proration explicitly (`create_prorations`, previewed before confirmation),
which is the hardest of these and the one most kits get wrong. Three neighbours are settled nowhere:

```bash
grep -ril 'coupon\|trial period\|tax' spec/ docs/adr/    # ADR-006 covers proration only
```

- **Trials** — whether a subscription can start without a payment method, and what entitlement a
  trialing organization has
- **Coupons and discounts** — whether the entitlement layer reads them at all
- **Tax** — whether Stripe Tax is on, which is a schema-adjacent question in the EU

Each is free to decide while the document is a draft and expensive after the entitlement schema
lands. This record takes no position on the answers; it observes that a draft is the correct and
only cheap moment to have them.

## G-4 · The single-deployment-target position is unwritten

```bash
find . -name 'Dockerfile*' -not -path './node_modules/*'    # no matches
```

This is **not a request to build Docker support.** It is the observation that ADR-022 works — the AI
refusal is durable because someone wrote down why — and this decision has had no equivalent. The
field markets against it by name (Part 4.1), so the question will be asked by buyers, not only
internally, and the answer currently has to be re-derived each time.

---

# Part 6 — depth on what is already shipped

Three questions were asked of the built areas. **Two of them the repository had already answered
better than the question deserved, and this record says so rather than quietly dropping them** — a
review that reports only its hits is measuring the reviewer, not the repository.

## 6.1 Answered — the Content-Security-Policy is report-only, and that is the right call

`src/lib/security-headers.test.mts` asserts `Content-Security-Policy-Report-Only` is defined and
`Content-Security-Policy` is undefined, while bar B-9 says _"Secure by default: CSP, security
headers…"_. On the surface that reads as a bar ahead of its implementation.

It is not. `src/lib/security-headers.ts` carries the measurement:

> A production Next build serves **13 inline `<script>` tags** … you can have any two of
> {strict CSP, static prerendering, working hydration}

and enumerates the three exits — `'unsafe-inline'`, a per-request nonce that forfeits prerendering,
or report-only. keelblock **enforces the other six headers unconditionally** and reports the one that
cannot be enforced without breaking the application.

> enforce everything that can be enforced without breaking the app, and report the one that cannot,
> rather than shipping `'unsafe-inline'` and calling it protection

This is a stronger position than the field's, it is measured rather than asserted, and it is further
evidence for D3 at ceiling.

## 6.2 Answered — session handling is in `src/proxy.ts`

There is no `src/middleware.ts`, which on Next 15 conventions would be a real question about session
refresh. Next 16 renames the file to `proxy.ts`, and `src/proxy.ts` is where the security headers are
applied. Non-finding, recorded so the next reviewer does not spend the same ten minutes.

## 6.3 Real — Account is unbuilt while Auth is `done`

SPEC-004 is `done`. SPEC-008 — account and organization settings surfaces — is `planned`, and the
route listing in Part 3 confirms there is no account surface of any kind.

A signed-in user therefore **cannot change their display name, cannot change their email address, and
cannot delete their account.** Against a buyer's first hour this is shallower than every kit in
Part 4's table, and it sits directly behind the area marked `done`.

Nothing is mis-stated: SPEC-008 says it is planned. The observation is about **ordering**, not
honesty. Of the sixteen unbuilt areas, this is the one whose absence a stranger meets first, because
signing in is the first thing they do and looking for their own settings is the second.

---

# Part 7 — the recommendation: the list, or the date

The nineteen areas in `PRODUCT.md` are not a wishlist. That document is **governing** — its own
header says a SPEC that contradicts it is wrong — so nineteen areas is the v1 promise, and sixteen
of them do not exist.

The arithmetic does not close. Sixteen areas × the 1.75× multiplier PRODUCT.md computes for itself,
against the ~3× budget advantage that same section claims from single-framework focus, leaves a
remainder that no schedule anyone would call soon absorbs.

So the choice is not depth against breadth. **It is that the list must shrink or the date must move,
and holding both is how a project ships nothing.** This is not an argument for lowering the bar. The
bar is the eleven acceptance criteria and they are not what is at risk; the area count is.

If this reviewer were choosing, the v1 cut would be the seven areas a B2B buyer meets in their first
week, in this order:

| #   | Spec                                        | Why it is inside the line                                                                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **SPEC-007 Billing**                        | Three specs depend on it, and a SaaS starter without payments is not one. BoxyHQ's "Coming Soon" is the cautionary case, not the precedent |
| 2   | **SPEC-008 Account**                        | Part 6.3 — the first absence a stranger meets                                                                                              |
| 3   | **SPEC-017 Transactional email**            | Invitations ship today by surfacing the link to the inviter, which SPEC-006 correctly calls honest and no buyer will call finished         |
| 4   | **SPEC-030 Local development**              | The offline loop and the mail catcher; it is what makes 3 demonstrable                                                                     |
| 5   | **SPEC-009 Marketing shell + ops**          | The scaffolder produces a project with no front door                                                                                       |
| 6   | **SPEC-022 Onboarding**                     | The first-run path, and the only place organization creation is currently explained                                                        |
| 7   | **SPEC-023 Legal pages + error monitoring** | Cheap, and their absence is conspicuous in a security review                                                                               |

SPEC-028 (SEO) is already `draft` and rides along with 5.

Everything else — custom domains, file storage, background jobs, notifications, admin and
impersonation, audit log, API keys, outbound webhooks, product analytics — moves to a **published,
dated v1.1**, named the way the deferral registry already names things, so that the absence is a
commitment rather than a silence.

**One argument against this reviewer's own ordering, recorded because it is a good one:** the
**audit log (SPEC-025)** may deserve promotion above its queue position. It is the cheapest
enterprise feature keelblock owns, because the access matrix already enumerates every table × command
× identity and an audit log is that enumeration turned into rows. BoxyHQ ships it while shipping no
billing. It is also the enterprise feature most directly downstream of the one claim — an isolation
proof and an audit trail answer the same buyer's question. That case was not strong enough to move
it inside the seven, and it is strong enough to be argued.

---

# Part 8 — what could not be verified

Stated because a review that hides its own gaps is doing the thing it criticizes.

- **Nothing in this record was executed against a running application.** No Supabase stack, no
  `npm run check`, no Playwright run. Every claim about the repository comes from reading files at
  `848a7e0` and from the commands quoted inline, which are all `git`, `grep`, `find` and `sed`.
- **CI results are taken from the implementer's report**, not observed. The claim that `848a7e0` is
  green rests on their statement and on the workflow file's contents, not on a run this reviewer
  watched.
- **The competitor table in Part 4 is documentation, not use.** No competitor kit was installed,
  scaffolded or run. Each cell traces to a vendor describing their own product on a page read on
  2026-09-09, and vendor claims about _rivals_ were excluded entirely. Where a vendor is silent about
  a feature the cell is `—`, which means _not found in their own documentation_, not _absent_.
- **The seven-area cut line in Part 7 is a recommendation, not a measurement.** It rests on a
  judgement about what a buyer meets first, which no command produces.
- **Star counts and licence** for BoxyHQ (4,928 stars, Apache-2.0) were read from their repository
  page and are a snapshot of that day.

## Sources read on 2026-09-09

- MakerKit — Next.js Supabase Turbo documentation, installation introduction
- MakerKit — SaaS starter kit comparison page
- Supastarter — Next.js multi-tenancy template feature page
- BoxyHQ — `saas-starter-kit` repository README
