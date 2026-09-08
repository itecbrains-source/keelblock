# Website & documentation plan

**Baseline: [supastarter.dev](https://supastarter.dev)** — matched on quality and completeness,
**simplified in structure, and deliberately reordered.** Docs are a deliverable (bar B-5), not
marketing that happens afterwards.

## Why the argument order differs from the baseline

Supastarter's landing leads with 1,484 testimonials, eight feature sections and a fifteen-item
feature grid, then pricing. That is the right order **for them**: social proof and breadth are their
strongest assets and they genuinely have both.

keel has neither yet. Copying that order would lead with our weakest cards and bury the only one that
is actually differentiated — **evidence a stranger can check without trusting us.** So the structure
inverts: proof first, features after the argument rather than as the argument.

The bar to match is their *finish*: clear writing, a real demo, honest changelog, working search,
no dead links.

## Landing page — seven sections, not ten

| # | Section | Content |
|---|---|---|
| 1 | **Hero** | The claim and how to check it. *Tenant isolation enforced by the database and proven on every commit.* One command to try it. |
| 2 | **The proof** | The live access matrix, rendered. The "different organisation" column is the whole pitch. Link to the CI run that produced it. |
| 3 | **What we found** | `FINDINGS.md`, with repros — `anon` could truncate your tables; the leading generated RLS suite confirms a leaking table green. **Nobody else can write this page**, because nobody else did the measurement. |
| 4 | **Get started** | Install → running app with auth and an organisation, under five minutes (B-1). |
| 5 | **It won't rot** | The freshness gate, the weekly clean build, the upgrade path. Aimed squarely at anyone who has cloned a starter and found it three majors behind. |
| 6 | **What's in it** | The feature surface. *After* the argument, stated plainly, no grid of fifteen icons. |
| 7 | **Free, MIT** | Against a $199–1,499 field. One line on the paid compliance tier (ADR-009), no upsell pressure. |

Testimonials and a showcase go in when they are real. **An empty testimonial section is worse than
none**, and inventing one would break the honesty rule keel is built on.

## Documentation — five sections

Supastarter needs per-framework docs (Next / Nuxt / SvelteKit / TanStack). keel has one framework, so
it is simpler by construction — use that.

```
Start        install · first run · your first feature          ← the B-5 path, timed and tested
Concepts     tenancy model · the four proof layers · honest states · upgrading
Guides       add a tenant-scoped table · auth · billing · deploy
Reference    access matrix · gates · CLI · environment
Evidence     findings · verify the claim yourself · the access matrix explained
```

Two deliberate choices:

- **"Add a tenant-scoped table" is the flagship guide.** It is the most common task and the one where
  people leak data. Getting it right, with the gate catching them when they don't, is keel's promise
  in miniature.
- **"Evidence" is a top-level section**, not a blog category. It is the differentiator, so it is
  navigable.

## The material pipeline

The site is an assembly job, not an archaeology dig — **provided material is routed the day it is
produced.** `docs/content/MANIFEST.json` maps every finding to where it will be used, and a gate
(`npm run check` → `promises`) fails when a new one is routed nowhere. The reasoning behind a finding
is never fresher than the day it is discovered; six months later it has to be reconstructed, and
usually is not.

Current inventory, all routed:

| Destination | Count | Status |
|---|---|---|
| **blog** | 13 posts | Each is a measured finding with a reproduction. **No competitor can publish these**, because none of them did the measuring. |
| **docs** | 17 pages | The technical documentation writes itself from the same material. |
| **landing** | 5 sections | F-1, F-13, F-15, F-18 and the access matrix carry sections 2 and 3 of the seven. |
| **faq** | 5 | Already written — [`docs/FAQ.md`](FAQ.md), 11 questions, **every answer citing something you can open**. |
| **internal** | 1 | Deliberately unpublished, with a reason. |

Three of the thirteen blog posts are **our own defects** (F-8, F-9/F-10, F-13). Publishing those is
what makes the other ten believable, and a project claiming rigour that publishes only its wins is
doing marketing.

## Sequencing

1. **Now, as we build:** `FINDINGS.md` grows with each measured discovery. It is perishable — the
   reasoning fades in weeks — and it is the raw material for sections 2, 3 and Evidence.
2. **With each spec:** its documentation ships as a DoD item. A spec whose docs are missing is not
   done, because B-5 says a stranger must get there on the docs alone.
3. **At v0.1:** build the site. Not before — a site for software that does not run yet is the
   comfortable way of not shipping.

## Rules

- **Never claim what is not measured.** Every number on the site links to the run that produced it.
- **No fabricated social proof.** No stock avatars, no invented counts, no "trusted by".
- **The demo is the real app**, not a video of it.
- **The changelog is honest**, including the things we got wrong — F-8 (our own unconstrained INSERT
  policy) belongs on the site as much as F-1 does. A project claiming rigour that only publishes its
  wins is doing marketing, not rigour.
