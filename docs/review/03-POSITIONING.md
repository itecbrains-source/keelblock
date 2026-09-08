# Positioning

```yaml
record: 03
commit: 9c0721c
date: 2026-09-08
```

_Market, name, moat and commercial model — every external claim below was read on 2026-09-08 and is
sourced at the end. Re-verify before acting on it; that is this repository's own rule and it applies
to its reviewers._

## Start here: the name is taken twice, and one of them is funded

This is the most expensive finding in the review and it is entirely mechanical to check.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/keel              # 200
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/create-keel-app   # 200
```

| Name               | Status                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `keel`             | **Taken and active.** "Your production-grade backend from one file" — 300 published versions, latest `0.478.0`, last published 2026-09-07 |
| `create-keel-app`  | **Taken.** "Scaffold a new Keel project with all conventions pre-wired" — published 2026-06-26                                            |
| Keel (the company) | **Keel (keel.so)**, a funded developer-tools company — raised $6M in October 2024 — selling backends and internal tools                   |

Consequences, in order of severity:

1. **Bar B-1's headline command scaffolds somebody else's project.** `npx create-keel-app` is the
   single sentence in `PRODUCT.md`'s acceptance table that a user is most likely to type, and today
   it installs an unrelated tool. SPEC-011 cannot be built as specified.
2. **The collision is inside the same category.** Not a coffee shop with the same name — a developer
   backend platform, publishing to npm, in Next.js/TypeScript territory, actively marketing. Every
   search, every "have you seen keel?", every AI answer about "keel" resolves to them.
3. **The SEO position is unwinnable.** `WEBSITE-AND-DOCS.md` plans thirteen blog posts and a docs
   site. They will compete for a brand term already held by a company with funding, a blog and four
   years of domain authority.

**Recommendation: rename now, while the cost is a find-and-replace.** In ninety days it is a
find-and-replace plus a published package, a domain, backlinks, and whatever attention has
accumulated. The naming criteria that matter here are narrow: the npm scope and `create-*` package
must both be free, it must not collide inside developer tooling, and it should survive the product
becoming _more_ than a starter kit — see the next section, which argues it should.

Note the metaphor is also worth keeping if a variant is free: a keel is the structural member that
keeps a hull from capsizing, which is an unusually good fit for the thesis. The name is right and it
is not available.

## Choosing the replacement, and how to check a candidate

Recorded here so the decision is made once against evidence, rather than re-litigated from
recollection in three weeks — which is this repository's own rule about research, applied to its own
name.

### The method

Domain availability is the part people get wrong, because the tools that look authoritative are not.
Use **RDAP**, and find the right endpoint rather than guessing it:

```bash
# 1 · the authoritative endpoint for a TLD comes from IANA's bootstrap file, never from memory
curl -s https://data.iana.org/rdap/dns.json | jq -r '.services[] | select(.[0][]=="dev") | .[1][0]'
#   https://pubapi.registry.google/rdap/

# 2 · then query it. 404 = unregistered, 200 = registered
curl -s -o /dev/null -w "%{http_code}\n" https://pubapi.registry.google/rdap/domain/<name>.dev
curl -s -o /dev/null -w "%{http_code}\n" https://rdap.verisign.com/com/v1/domain/<name>.com

# 3 · npm, both names, because the scaffolder name is the one a user types
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/create-<name>-app
```

**Always run a positive control before believing a negative.** A first attempt at this used
`www.registry.google/rdap/` — a plausible-looking endpoint that returns 404 for every query,
including `web.dev`. Without the control it would have reported a dozen registered domains as
available, in a document recommending a rename. That is F-21's failure — an unverifiable specific
reaching a recommendation — and it was caught only because a known-registered domain was checked
first.

### What the search found

Checked 2026-09-08. The finding is not about any one name:

| Candidate       | npm | `create-*-app` | `.dev`                         |
| --------------- | --- | -------------- | ------------------------------ |
| **strake**      | ✓   | ✓              | taken — Namecheap, 2026-02-26  |
| **cupel**       | ✓   | ✓              | taken — Cloudflare, 2026-03-07 |
| **thole**       | ✓   | ✓              | taken — Namecheap, 2026-03-21  |
| **hawse**       | ✓   | ✓              | taken — Porkbun, 2026-04-04    |
| **scantling**   | ✓   | ✓              | taken — Cloudflare, 2026-04-26 |
| **garboard**    | ✓   | ✓              | taken — Name.com, 2026-06-15   |
| **orlop**       | ✓   | ✓              | taken — Cloudflare, 2026-06-26 |
| **coaming**     | ✓   | ✓              | taken — Cloudflare, 2026-08-06 |
| **skeg**        | ✓   | ✓              | **free**                       |
| **keelblock**   | ✓   | ✓              | **free**                       |
| **sternpost**   | ✓   | ✓              | **free**                       |
| **sheerstrake** | ✓   | ✓              | **free**                       |
| **deadrise**    | ✓   | ✓              | **free**                       |
| **gunwale**     | ✓   | ✓              | **free**                       |

Every short, pronounceable nautical word was registered during 2026, in one-year terms, at the
registrars speculators use. That is **systematic dictionary sweeping of `.dev`**, not eight
coincidences — so a single evocative English word on that TLD is a closed market, and hunting one
lookup at a time is a losing search rather than bad luck.

Bare-word `.com` is worse and irrelevant: `garboard.com` (2018), `coaming.com` (2011), `cupel.com`
(2000), `scantling.com` (2019), `keelson.com` (1997) are all parked. Modern developer tools do not
use bare-word `.com`; do not optimize for it.

### Traps found while looking

- **`carvel` looks perfect and is not.** Carvel-built means planks laid flush so the hull is
  watertight _by construction_ rather than by patching — an unusually exact statement of this
  project's thesis. But `carvel.dev` is the Kubernetes Carvel project (`ytt`, `kapp`, `kbld`). Same
  collision as keel, in the same category. Rejected.
- **npm-taken-but-scaffolder-free is a trap, not an opening.** `bulwark`, `plimsoll`, `keelson`,
  `hallmark`, `proofmark`, `watertight`, `touchstone`, `assay`, `bulkhead`, `transom` all have
  `create-<name>-app` free while the bare package name is taken. Given the strategy above — the
  harness ships first, as an installable package — the bare name is the one that matters. A scoped
  package is a workaround, and it reads as a workaround.

### The recommendation

**Stop hunting single dictionary words.** Two shapes still work:

1. **A compound or coined name**, where the whole namespace is free at once — npm, scaffolder,
   `.dev`, and an unclaimed search term. This is what most infrastructure tools launched in the last
   few years actually did, and it is the cheapest path to owning a brand term outright.
2. **A name you actually want, on `.sh` or `.io`.** Nobody holds a non-`.dev` TLD against an
   infrastructure tool, and the npm names are the constraint that genuinely bites.

If a single word is non-negotiable, **`skeg`** is the only short one left clean — a fin extending the
keel that holds a hull on course and shields the rudder — and **`keelblock`** keeps the lineage with
an apt meaning: the blocks a hull rests on in dry dock, which is to say the thing that holds it up
while it is being inspected.

Whichever is chosen, register the pair **before** it appears in one more document. The cost of this
decision rises the day something is published.

## The market read, updated

`research/01-FIELD-SCAN.md` is a good memo. It was researched on 2026-09-07 and its own header says
_"re-verify before acting on it, because this field moves and a stale competitive read is worse than
none."_ It has moved.

### BoxyHQ has been acquired by Ory

The GitHub organization now states it plainly: **"BoxyHQ has been acquired by Ory and is now
officially part of the Ory suite of products as Ory Polis."** The repository remains
Apache-2.0 and shows activity, but its future is now an Ory product decision.

This matters more than a footnote, because BoxyHQ is load-bearing in three of keel's documents:

- It is the closest free competitor in the field scan.
- Its `getApiKeyById` is **F-15**, the finding the README calls the clearest illustration of why keel
  exists, and it is routed to the blog and the landing page in `docs/content/MANIFEST.json`.
- `PRODUCT.md` reads its feature list as a bar to match, with the caveat that the kit is a funnel for
  Jackson, BoxyHQ's own SSO product.

The funnel argument is now _stronger_ — Jackson is Ory Polis, and the kit is an acquired vendor's
lead-generation asset. But two things need care. First, an acquired open-source starter is a
maintenance risk, and keel's whole thesis is about maintenance risk — that is an opportunity worth
naming, not just a fact. Second, **building a public argument on a named competitor's specific code
is fragile**: if Ory rewrites that guard, keel's flagship illustration evaporates. F-15 should be
restated as a _pattern_ — fetch-by-id then compare, which is what essentially every application-layer
kit does — with BoxyHQ as one dated, citable instance rather than as the argument itself.

### MakerKit already ships Supabase RLS, and already ranks for it

MakerKit's pricing page describes a "Supabase-native Stack (Auth, Storage, Database, RLS)", role-based
access control, and Playwright E2E tests, at **$349 (Pro) / $649 (Teams)**, lifetime. It also
publishes _"Supabase RLS Best Practices: Production Patterns for Secure Multi-Tenant Apps"_, which is
the top organic result for that query.

This does not break keel's thesis, but it sharpens where the thesis has to sit:

> **"We use RLS" is not a differentiator. "We publish the proof, per table × command × identity, and
> it fails our build when it changes" is.**

`PRODUCT.md` already gets this right — the axis table says "Nobody publishes any [proof]" — but the
README's framing drifts toward the mechanism ("enforced by the database, not by application code"),
which a funded competitor can and does claim. Every public sentence should lead with the _artifact_,
not the _technique_.

The content implication is sharper still: **do not write RLS explainers.** That ground is held.
Write the things only keel can write — the findings register.

### What has not changed

The free end of the field is still weak and still exactly as the memo describes it. The paid field is
still $199–$1,499. Nobody publishes an isolation proof. The gap is real.

## Where the moat actually is

Three candidates. Only one is durable.

| Candidate                                                     | Durable?                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Free vs a paid field**                                      | **No.** It is a wedge, not a moat. Price is the easiest thing for a funded competitor to match temporarily and the hardest thing for keel to defend                      |
| **Feature completeness**                                      | **No**, and `PRODUCT.md` already refuses to compete here, correctly                                                                                                      |
| **Published, failing-build proof plus the findings register** | **Yes.** It compounds, it cannot be copied without redoing the measurement, and admitting your own defects is a credibility position a vendor structurally cannot occupy |

The third is worth stating as sharply as possible, because it is the whole business:

> **keel's asset is not the starter. It is the evidence.** `FINDINGS.md` — `anon` holding TRUNCATE on
> a default Supabase project, the generated RLS suite reporting a leaking table green, the
> CSP/prerender/hydration trilemma, `NEXT_PUBLIC_` on a credential — is a document no competitor can
> write, because writing it requires having done the measurement and being willing to publish the
> half where you were wrong.

`WEBSITE-AND-DOCS.md` already reaches this conclusion for the landing page. The strategic version of
it is the next section.

## The move this project is one step from making

**The proof harness works on any Supabase project. The starter kit only works on new ones.**

Everything that makes keel special — the schema guard, the policy prober, the intent-layer pattern,
the access matrix, the bypass-surface inventory — is framework-agnostic. ADR-012 already says so, for
a different reason (portability to Nuxt or TanStack Start). It is equally true in a more valuable
direction: **none of it requires the project to have been scaffolded from keel.**

Consider the two audiences:

| Audience                                       | Size                       | What they need                                                      | What keel offers today   |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------- | ------------------------ |
| Developers starting a new B2B SaaS this month  | small, and episodic        | a starter kit                                                       | the whole product        |
| Teams with a **live** Supabase app and tenants | very large, and continuous | "is my isolation actually correct, and will I know when it breaks?" | nothing they can install |

The second group has budget, urgency, an existing security review to survive, and no way to answer
the question today. They are also the people who make `FINDINGS.md` go around — an engineer who runs
one command and discovers `anon` can TRUNCATE their tables will tell everyone they know.

The recommendation:

> **Ship the proof harness as an installable package that runs against an existing Supabase project
> and prints an access matrix. Make the starter kit the second product, not the first.**

Why this is the right shape:

- **It is nearly built.** The migrations are keel-specific; the prober, the matrix renderer, the
  schema guard and the bypass inventory are not.
- **It converts the audit's worst finding into the product.** R-14 says the proof takes five tools to
  check. A package that runs against the database someone already has removes that objection entirely.
- **It fixes distribution.** A starter kit is discovered once, by someone starting something. A
  correctness tool is discovered continuously, by people with a problem — and it lands as _"run this
  against your production schema"_, which is a far better first line than _"clone this instead of the
  thing you already built"_.
- **It makes ADR-009's commercial boundary real earlier.** The paid tier is evidence for a third
  party. Evidence about an existing production system is worth considerably more than evidence about
  a repository nobody has deployed.
- **It de-risks the roadmap.** If the starter takes a year to reach feature parity — and it will —
  the harness is shipping value the whole time.

The cost is honest and should be stated: it is a **second product to maintain**, and ADR-009 already
flags exactly this hazard ("two repositories to keep from rotting, and only one of them has the
freshness gate"). The answer is that it is not a second product so much as the extraction of the part
that was already the differentiator.

## The commercial model

`docs/COMMERCIAL.md` proposes four tiers, and its central instinct is right and well-argued:
developers do not pay for tests; companies pay for what they hand an assessor. The anti-degradation
rule — the full claim must hold with nothing paid installed, and a gate asserts it — is the correct
way to keep open core honest, and most projects that try this do not think of it.

Three problems, in order.

**1 · The tier structure is premature, and `DEF-009` only defers half of it.** The deferral covers the
numbers. The structure is equally unvalidated: four tiers, a private channel, an architecture review
and a contractual SLA, designed before one user existed. Four tiers is a decision that becomes true
by being sold, not by being reasoned. Defer the structure with the prices.

**2 · The SOC 2 evidence pack is the hardest thing on the list to sell and the easiest to underestimate.**
That market is occupied by well-funded compliance-automation vendors with sales teams, and the buyer
is a security or compliance function, not a developer. Selling into it is a different company from
the one that writes `FINDINGS.md`. It may still be right eventually — but as the _first_ revenue
line, it inverts the sequence: it needs enterprise buyers before it has any users.

**3 · The two lines most likely to work get one sentence.** From `COMMERCIAL.md`:

> _Plus two service lines, which need no product and are margin from day one: a paid consulting call
> and done-for-you delivery._

That is the correct answer, understated. Reframed for what this repository actually is:

> **A tenant-isolation audit for an existing Supabase application.** Run the harness against their
> schema, hand them their access matrix and their bypass inventory, write up what it found.

It requires no product, no tiers and no pricing research. It is credible on the strength of
`FINDINGS.md` alone. It generates the findings that feed the content pipeline that feeds the
distribution. And it funds the maintenance obligation that
[`02-EXECUTION.md`](02-EXECUTION.md) identifies as the promise most likely to break.

The sequence an expert team would run: **free harness → paid audits → hosted continuous verification
→ evidence pack for auditors → the starter kit as the on-ramp**. Roughly the reverse of what is
written down today.

## Distribution

The project has no remote. Nothing is public. Zero people know it exists.

Everything below is therefore blocked on one act, which is also `DEF-003`'s trigger.

**What to do, in order:**

1. **Push.** Public repository, real CI, green run.
2. **Publish the evidence page** before the marketing site. One URL: the live access matrix, the
   bypass inventory, the link to the run that produced it. This is R-14's fix and it is the artifact
   that does the convincing.
3. **Publish the findings, one at a time, where the affected people are.** F-1 is the strongest — it
   affects _every_ project on default Supabase ACLs, not just users of keel. It is a genuine public
   service, it is verifiable in thirty seconds, and it is the ideal first post.
4. **Report upstream.** F-1, F-3 and F-11 are findings about Supabase and its tooling, not about
   keel. Filing them where the maintainers are is both the right thing and the fastest route to
   credibility with the exact audience keel needs.
5. **Only then** the site, the docs and the thirteen routed posts.

Two rules from `WEBSITE-AND-DOCS.md` are worth restating because they are unusually good and easy to
abandon under pressure: no fabricated social proof, and the changelog publishes the mistakes. **The
second is the marketing strategy**, not a concession — F-8, F-13 and F-25 are the reason anyone will
believe F-1.

## Sources

Read 2026-09-08. Primary sources are the vendor's or project's own material.

**Primary**

- [npm registry — `keel`](https://registry.npmjs.org/keel) · package metadata, version count, publish dates
- [npm registry — `create-keel-app`](https://registry.npmjs.org/create-keel-app) · package metadata
- [github.com/boxyhq](https://github.com/boxyhq) · the acquisition notice, in BoxyHQ's own words
- [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) · stars, forks, license, activity
- [makerkit.dev/pricing](https://makerkit.dev/pricing) · tiers, prices, stack and testing claims
- [keel.so](https://keel.so/product) · the colliding product
- [IANA RDAP bootstrap](https://data.iana.org/rdap/dns.json) · the authoritative RDAP endpoint per TLD
- [pubapi.registry.google/rdap](https://pubapi.registry.google/rdap/domain/web.dev) · `.dev` registration status, positive-controlled against a known-registered domain
- [rdap.verisign.com](https://rdap.verisign.com/com/v1/domain/keelson.com) · `.com` registration status

**Secondary** — used to locate candidates, never to establish a fact.

- [Tech.eu — Keel raises $6M](https://tech.eu/2024/10/23/keel-raises-6m-to-bridge-the-gap-between-no-code-and-erp-solutions/)
- [MakerKit — Supabase RLS best practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) _(vendor-authored; read for its ranking position)_
- [buildmvpfast — best SaaS boilerplate 2026](https://www.buildmvpfast.com/blog/best-saas-boilerplate-starter-kit-2026-nextjs)
