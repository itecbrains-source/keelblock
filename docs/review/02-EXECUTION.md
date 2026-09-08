# Execution

```yaml
record: 02
commit: 9c0721c
date: 2026-09-08
```

_How a team of experts would build this, what they would do differently, and what they would stop
doing today._

## The team

keel is currently one person and an unusually disciplined process. The process is doing the work of
about four specialists, well, and the places it is thin are exactly the places those specialists
would have pushed back on day one.

| Role                      | What they own here                                           | What is missing without them today                                                                                             |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Postgres/RLS engineer** | policies, invariants, the prober, the bypass inventory       | Nobody has adjudicated the CRITICAL rows in the access matrix (R-4/R-5), and the `WITH CHECK` rule stops one step short (R-11) |
| **Release engineer**      | CI, supply chain, the upgrade path, `preflight`              | There is no remote, so nothing has run (R-13). B-10 — the deepest differentiator — has no experiment yet                       |
| **Product/DX engineer**   | the scaffold, the first-run experience, the docs walkthrough | The claim needs five tools installed before anyone can check it (R-14). One page exists                                        |
| **Adversary**             | attacks what has been shipped and called green               | Partly present already — F-9 through F-14 are exactly this — but the auditor and the author are the same person                |
| **Distribution**          | the site, the writing, the launch, the community             | The material is routed and unpublished. Nothing exists in public                                                               |

**The adversary role is the one to hire or borrow first**, and the repository already proves why.
SPEC-002's Definition of Done says it outright:

> _someone other than the author planted a policy defect and confirmed the harness caught it. A
> harness verified only by its own author is a harness verified against the same assumptions that
> would produce the bug._

That validation note is unchecked, and this review is a partial and inadequate substitute for it —
inadequate because a reviewer who cannot run the database cannot plant the defect. **It is worth a
paid day of a Postgres specialist's time**, and it is the cheapest credibility keel can buy.

## What an expert team would have done differently on day one

Not criticism of the output — forty commits and a coherent architecture in eight hours is
exceptional. These are the three decisions where more experience would have changed the shape.

### 1 · Build one vertical slice before generalizing the harness

The apparatus was designed against a schema with one example table and no application. That is why
the boundaries gate does not know about Route Handlers (R-8), why the cache-key rule matches one of
three syntaxes (R-9), and why the trivial-`WITH CHECK` rule stops at the literal string (R-11). Each
gate encodes the author's model of the code rather than the code.

An expert team builds **auth plus one real tenant-scoped feature end to end first** — with a Server
Action, a Route Handler, a cached read and a real write path — and then writes the gates against what
that produced. The gates come out sharper because they are written against evidence, which is the
project's own stated epistemology applied to its own tooling.

The counter-argument is in `spec/README.md` and it is a good one: a harness retrofitted onto working
code confirms what that code already does. **Both are right, and the synthesis is standard practice:
one thin slice, then the harness, then the rest of the surface.** Not fifteen specs of harness before
the first login form, and not fifteen features before the first gate.

### 2 · Treat the gate suite as a product with users, not as scaffolding

Eleven gate scripts and their mutation proofs are ~3,900 lines — nearly eight times the application.
They are written to a high standard and they will be a maintenance surface forever. Two consequences
nobody has priced:

- **Every gate is a false-positive generator for a future contributor.** `DEF-010` already sees this
  ("which gates ship to a buyer, and which stay keel's own governance") and defers the decision to
  SPEC-011. That is the right question deferred to roughly the right place, but the answer shapes
  what gets built between now and then, so it should be answered sooner.
- **A regex-based gate that fires wrongly is worse than no gate**, because the fix a contributor
  reaches for is to work around it. F-20 documented this happening three times to the author. It will
  happen faster to strangers.

### 3 · Get something in public before deciding what to write about it

`docs/content/MANIFEST.json` routes every finding to a blog post, a landing section, a FAQ entry or
docs. It is a good instinct — the reasoning behind a finding is never fresher than the day it is
found. But the content pipeline, the website plan, the commercial model and the four-tier pricing
structure were all authored before a single person outside the project had seen any of it.

That is planning the distribution of a product whose distribution assumptions are untested. The
market read in `research/01-FIELD-SCAN.md` was diligent and it is already out of date — see
[`03-POSITIONING.md`](03-POSITIONING.md).

## The ratio, and the rule that fixes it

Today: **8:1 prose-and-machinery to application code.** For one day's work that is a defensible bet
on foundations. As a steady state it is the project.

The failure it produces is specific and it is visible in the audit: **gates written against imagined
code have holes exactly where the real code will land.** Seven of the nine gate defects in
[`01-AUDIT.md`](01-AUDIT.md) are of that kind.

The rule an expert team would adopt, and enforce the way keel enforces everything else:

> **No new gate without a defect it has caught in this repository, or a specific line of code it
> refuses.**

That is the strong form of the rule keel already has (every gate ships a mutation proof), tightened
from _can it fail on a synthetic input_ to _has it failed on a real one_. Under it, the schema guard,
boundaries, freshness and locale gates all qualify — each caught something real. The content
manifest, spec contracts, bar coverage and research gates would have to wait until they catch
something, which is precisely the set `DEF-010` suspects is keel's own governance rather than the
product's.

A companion rule, from the audit's summary: **no gate decides from a regular expression over source
text where a parser exists.**

## Ninety days

Sequenced by dependency and by what unblocks the most. Each phase ends with something checkable by
someone who is not the author.

### Weeks 1–2 · Make the current claims true

The whole of [`01-AUDIT.md`](01-AUDIT.md)'s CRITICAL and HIGH set, and nothing else.

- Fix the seven stale counts; make the status gate catch spelled-out numerals (R-1).
- Capture every path in an evidence cell; fail on a `done` criterion with nothing checkable (R-2, R-3).
- Build `nightly.yml`, or change the claim to weekly (R-2).
- Make anomalies and CRITICAL bypass rows fail the build, with a named-reason escape (R-4).
- Adjudicate the five bypass rows; write up whatever turns out to be real as a finding (R-5).
- **Create the remote and push** (R-13). Watch the workflow run. Fix what it finds — there will be
  something, because nothing has ever executed.
- Settle the name (see [`03-POSITIONING.md`](03-POSITIONING.md)).

**Exit criterion:** a green CI run on a real remote, whose artifact is an access matrix with no
unexplained warnings, and no document that disagrees with `npm run status`.

### Weeks 3–6 · The vertical slice

SPEC-004 (auth), then SPEC-005 (organizations and roles), then SPEC-006 (invitations). In that order,
because each is the next one's fixture.

This phase closes four deferrals mechanically — `DEF-002` (journey layer), `DEF-004` (orphaned
Supabase clients), `DEF-006` (auth hardening), and the Playwright and axe bindings in ADR-013 — and
it is the phase where the gates finally meet real code. Expect the boundaries gate, the cache rule
and the schema guard to all need work; that is the point of doing it now.

Do AC-4 here (R-6), because the intent suite finally has a helper worth mutating in anger.

**Exit criterion:** a person can sign up, create an organization, invite a colleague, and the journey
suite drives it with accessible locators. The access matrix grows rows and none of them is a
surprise.

### Weeks 7–10 · Billing, and the first honest artifact

SPEC-007. Money is where the mutation and property testing deferrals (`DEF-011`, `DEF-012`) become
real, and both triggers are already written against `spec-done:SPEC-007`.

Run in parallel, because it needs no code: **publish the evidence**. A hosted page carrying the live
access matrix and a link to the CI run that produced it (R-14). This is the single artifact that
converts a stranger, and it does not need the product to be finished.

**Exit criterion:** a subscription can be bought and entitlements are enforced by the database, not
by an `if`. A URL exists that shows the isolation proof to someone who has installed nothing.

### Weeks 11–13 · The upgrade path, early

SPEC-013 and bar **B-10**. `PRODUCT.md` is right that this is the deepest structural failure in the
whole category and the hardest thing for a funded competitor to answer.

It is scheduled here, well before it feels due, for one reason: **the upgrade path constrains how
every feature is written**, and retrofitting it after twelve features is how it becomes a wish. The
experiment is small — tag a release, scaffold from it, land a security fix upstream, prove the
scaffolded project can take it. Doing that once, badly, in week eleven is worth more than a perfect
`keel upgrade` in month nine.

**Exit criterion:** a CI job scaffolds at the previous tag, applies the upgrade, and the current suite
passes.

### What is deliberately not in ninety days

SSO/SCIM (`DEF-005` — correctly deferred, and correct that they cannot be verified without an
identity provider), custom domains, notifications, the admin surface, the SOC 2 evidence pack, and
the website beyond the single evidence page. None of them is on the path to a first user.

## What to stop doing today

- **Authoring specs ahead of contact.** SPEC-016 and SPEC-028 are drafts against unbuilt surfaces,
  and `spec/README.md` already states the rule they violate — _"specification authored far ahead of
  contact rots"_. SPEC-028 in particular carries a nine-criterion table against an application with
  one page.
- **Adding gates.** Eleven is already more than the code justifies. Every hour available for gate
  work should go to fixing the nine in the audit, not to a twelfth.
- **Pricing.** `DEF-009` is right that the numbers need research. The stronger position is that the
  tier _structure_ is also premature — see [`03-POSITIONING.md`](03-POSITIONING.md).
- **Growing `PRODUCT.md`.** It is now 258 lines of governing document for 501 lines of application.
  It has absorbed a commercial model, a competitive analysis, a refusals table and a scope list that
  contradicts its own heading. Split the competitive material into `research/` and let the product
  definition be a product definition.

## The maintenance problem, named

keel's differentiator is that it will not rot. The mechanism is the freshness gate: stamps that
expire after forty-five days, so somebody must look.

**That is a recurring obligation on one person, forever, and it is the promise most likely to break.**
A stamp is a claim that a human checked a pin against current. There is no second human. The gate
converts neglect into a red build rather than into silent rot, which is a genuine improvement over
every competitor — but a red build nobody is paid to fix is how a project dies visibly instead of
quietly.

Three answers, in increasing order of ambition:

1. **Make the obligation smaller.** Renovate is configured and can propose the bump; the human act
   should be reviewing a diff, not researching a version. Automate stamp-date advancement behind a
   passing upgrade test, so the human decision is only needed where the automated one fails.
2. **Make it shared.** The clean-clone build, the upgrade job and the nightly suite are the
   maintenance. Whoever runs those is co-maintainer whether or not they write features. That is the
   contributor role to advertise, and it is unusually attractive to exactly the kind of engineer keel
   wants — the pitch is "help maintain the only starter that proves it isn't rotting", not "please
   write our features".
3. **Make it fundable.** The one thing in `docs/COMMERCIAL.md` that is credible on day one is the
   consulting line, and it is the one given a single sentence. A tenant-isolation audit for an
   existing Supabase application is a service the findings register already qualifies keel to sell,
   it needs no product, and it funds the maintenance the free tier promises. See
   [`03-POSITIONING.md`](03-POSITIONING.md).

## Definition of v0.1

`PRODUCT.md`'s definition of done is for v1 and it is far away. There is no definition of the release
that would let anyone use this, and without one the project has no way to stop.

Proposed, deliberately narrow:

- [ ] Sign up, create an organization, invite a member, switch organization, delete an organization.
- [ ] Every one of those paths appears in the access matrix, and the "different organization" column
      is uniformly denied.
- [ ] CI green on a real remote, including the pgTAP suites and the matrix artifact.
- [ ] A published URL showing the matrix and the run that produced it.
- [ ] `README.md` describes exactly what exists, verified by a gate that catches spelled-out numbers.
- [ ] One person who is not the author has cloned it, run `npm run check`, and written down what
      confused them.

That last line is bar B-5 in miniature and it is the only one that cannot be faked. Everything else
in this review is a means to being able to do it without embarrassment.
