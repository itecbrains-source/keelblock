# ADR-024: keelblock.dev deploys to Vercel — and Vercel is a target, not a dependency

**Status:** Accepted · **Date:** 2026-09-10 · **Deciders:** owner (the target) · architect (the portability rule, the reasoning order, and the list of things this ADR must not claim)

## Context

DEF-001 refused to record a deployment topology while there was none:

> keelblock has no environments of its own … a topology ADR written now would be recording a choice
> nobody has made. When keelblock gains a real deployment (a demo, or its own site), that decision
> becomes an ADR: which environments exist, how migrations reach each one, and what "released" means.

That row was right and its trigger — `file-exists:.github/workflows/deploy.yml` — is what this ADR
answers. `keelblock.dev` has been registered and held since 2026-09-08 (DEF-013, verified by RDAP
with a positive control) and has served nothing.

## Decision

**keelblock.dev deploys to Vercel.** The owner's decision. Reasons in ascending force:

1. **It is what keelblock tells buyers.** Recommending a platform the project does not use itself is
   a document disagreeing with reality — the class of defect this week was spent eliminating
   (F-64, F-66, F-67 are all one document disagreeing with one fact).
2. **One platform, not two.** C2's live demo must run keelblock itself, a Next.js app the docs point
   at Vercel. Hosting C1 elsewhere means two platforms, two workflows, two provenance stories, and a
   topology ADR that has to explain both. C1 on Vercel makes C2 **additive rather than a migration**.
3. **The site will not stay static.** The proof page regenerates per CI run, the blog needs the
   content pipeline `WEBSITE-AND-DOCS.md` leaves unspecified, and docs want search. Static-export
   hosting forecloses all three before anyone knows which are needed.
4. Zero-config on the free tier.

## The argument against, and the answer

MakerKit markets **"Real Deployment Options"** (Cloudflare, Docker) as a comparison row aimed
squarely at Vercel-only kits. Putting keelblock.dev on Vercel hands that critique a data point, and
pretending otherwise would be the thing this repository exists to not do.

The answer is not to host elsewhere. It is to **prove portability rather than claim it**:

> `scripts/check-portability.test.mts` fails the build on any `@vercel/*` import in `src/`, any
> `@vercel/*` package in the manifest, and any read of a `VERCEL_*` environment variable.

Measured at `deded68` before the rule was written: zero of each. **It passes on the day it lands**,
which is the standard ADR-023 set when it deferred the consistency gate — a gate that cannot pass
when it arrives is a gate that gets exempted. All three rules carry mutation proofs.

That converts a marketing critique into a sentence keelblock can actually defend:

> keelblock targets Vercel in v1. It uses no Vercel-specific API, and a gate fails the build if one
> appears. A second target is not proven and we do not claim one.

Stronger than shipping a Dockerfile nobody tests, and honest in the way ADR-022 was honest about AI:
**name the thing that is not proven instead of implying it is.**

**Not a twelfth gate.** SPEC-003 makes the gate count a ceiling and asks a new gate for "a promise
nothing else holds and a defect that actually happened". The promise is held by the file ADR-012
already gave portability; the defect has not happened. Spending the ceiling on a rule that has never
caught anything is how a ceiling stops meaning anything. It runs under `unit`.

One hit survives a grep for "vercel": `_vercel` in the proxy matcher, a path prefix excluded exactly
as `_next` is. That is not an API, not an import, and not a behaviour this app relies on — excluding
a path that only exists on one host costs nothing on any other. It has its own test so the next
person to run that grep finds the answer instead of re-deriving it.

## What this ADR answers, and what it deliberately does not

DEF-001 asked three questions. For C1 the honest answers are small, and keeping them small is the
point — ADR-017 refused invented abstraction, and a staging tier for a static marketing site is
exactly that.

| DEF-001 asked                 | C1's answer                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| Which environments exist      | **Production only.** A static marketing site does not need a staging tier. |
| How migrations reach each one | **They do not. C1 has no database.**                                       |
| What "released" means         | **The deploy workflow ran and the proof page's timestamp moved.**          |

The migrations question is not answered here because C1 cannot answer it honestly — answering it now
would record a choice nobody has made, which is DEF-001's own objection to being answered early. It
travels to **DEF-032** (the live demo), which is the first thing that will have a database to
migrate, and is keyed on `deploy-app.yml` rather than on this workflow.

**This ADR claims nothing about portability that the gate does not enforce**, and nothing about
environments that do not exist.

## Consequences

- DEF-001 closes. Its trigger fired exactly as written, on the file it named, and the row's refusal
  to decide early is vindicated rather than overridden: the answers above are small because the
  decision is finally real, and they would have been invented three weeks ago.
- **DEF-006 was re-keyed before this landed**, and that matters here: it shared this trigger, written
  when "keelblock has a deployment" and "strangers can reach this login" were the same event. C1
  splits them. Without the re-key, creating this file would have fired a row about hardening a login
  that C1 does not deploy — F-59's defect, caught in advance for the first time.
- **Not yet true, and named so it is not mistaken for done:** the Vercel project is not linked, and
  no secret exists. The workflow is guarded on `VERCEL_TOKEN` and does nothing until the owner adds
  it. The topology decision is what this ADR records; the account wiring is an owner action.
- `keelblock.dev` still serves nothing until that wiring happens. The domain is held, the decision is
  recorded, and the gap between them is one secret rather than one choice.
