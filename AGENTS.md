# Working in keelblock

For a coding agent or a developer who has not seen this repository before. **Read this once; it is
short on purpose.**

## What this is

A multi-tenant SaaS starter where **tenant isolation is enforced by the database, not by application
code, and proven on every push.** Next.js 16 · React 19 · TypeScript · Supabase · Stripe.

## The one rule

**Never enforce tenant isolation in application code.** Not an `if`, not a filter, not a helper that
compares ids. Isolation is a row-level-security policy; application code carries the user's session
and lets the database refuse.

The pattern this replaces, which is what every competing kit does:

```ts
const row = await getById(id); // any tenant's row, by id alone
if (row.teamId !== teamId) throw new Error(403); // and now it is in memory
```

Under RLS the row is never selected. There is no second step to forget.

## How you know you are right

```bash
npm run status         # what is built, what is open — computed, never written down
npm run check          # every gate, all failures reported at once
```

**Start with `npm run status`.** It reads the repository rather than a summary someone maintained,
so it cannot tell you a feature is unbuilt three weeks after it shipped. If a document ever disagrees
with it, the document is wrong.

**You cannot make this pass by being persuasive.** Every gate has a mutation proof — a test that
restores the real defect and asserts the gate goes red — so a green run is evidence, not agreement.
What it catches:

| If you…                                                | This says so                          |
| ------------------------------------------------------ | ------------------------------------- |
| add a table and forget row-level security              | `schema`                              |
| write `with check (true)` or `using (true)`            | `schema`                              |
| reach for the service-role client to make a query work | `boundaries` (walks the import graph) |
| cache a tenant query                                   | `boundaries`                          |
| invent a translation key, or leave one unused          | `locale`                              |
| leave an unused export or dependency                   | `unused`                              |
| claim something nothing implements                     | `promises`                            |
| widen a permission                                     | the `docs/ACCESS-MATRIX.md` diff      |

If a gate fails, **read its message** — it names the file, the line, and the fix. If a gate seems
wrong, it has been wrong before: say so rather than working around it.

## Recipes

**Add a tenant-scoped table** — see [CONTRIBUTING.md](CONTRIBUTING.md). Three rules: `organization_id`
on the table, RLS enabled, and both clauses constraining the organization — a `WITH CHECK` on writes,
a `USING` on reads and deletes. `(true)` is not a constraint in either.

**Add a mutation** — a Server Action that does validate → authorize → act, with its parameter typed
`unknown` and parsed. It is a network boundary wearing a function's clothes
([ADR-011](docs/adr/ADR-011-app-router-conventions.md)).

**Add user-facing text** — a key in `messages/en.json` and `t('key')`. Never a literal string.

**Not doing something** — a row in [`spec/DEFERRAL_REGISTRY.md`](spec/DEFERRAL_REGISTRY.md) with a
reason and a machine-evaluable trigger. **A defect is never a deferral**: if you broke it, you fix it
in the change that broke it.

## Where the answers are

| Question                                                | File                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| What is keelblock for, and what is it deliberately not? | `docs/PRODUCT.md`                                          |
| Why is it built this way?                               | `docs/adr/` — every decision, with the options it rejected |
| What is true that we measured?                          | `docs/FINDINGS.md` — including our own mistakes            |
| What is built, and what is next?                        | `spec/README.md`                                           |
| What did we decide not to do yet?                       | `spec/DEFERRAL_REGISTRY.md`                                |

## Before you author a spec

**Research it from authoritative sources first, and write the memo.** A spec written from
recollection encodes whatever was true when its author last looked — and in a fast-moving area that
is worse than no spec, because it reads as settled.

Memos live in `research/`, cite primary sources where they exist, and **separate settled from
contested**, so the spec can ship the contested part honestly labeled rather than silently.

`research/05-SEO-2026.md` is the worked example. Written from memory it would have said "add FAQ
schema for rich results" — a recommendation that has been wrong since 7 May 2026, when those results
were removed. The memo also shows why the _opposite_ conclusion is wrong: the markup still matters,
for a different reason than it used to.

## Two habits that matter here

**Measure, then claim.** Nothing in this repository asserts behavior nobody reproduced. Several
findings exist because someone was about to ship a confident, wrong thing — a CSP that would have
blocked every page, a gate that could not fail. If you cannot reproduce it, write down what you
observed and what you could not confirm.

**Tests before implementation.** Write the failing test, watch it fail, then fix it. A test written
after the fix only proves the fix does what its author already believed.

## Three rules this project paid for, so you do not have to

**A rule that matches source text needs a comment stripper on the day it is written.** Not after it
misfires — on the day. Four separate rules here have reported a violation against the comment written
to explain them: the locale gate against its own docblock (F-64), four more gates and a markdown
fence (F-66), a CSS rule against the stylesheet comment defending it (F-67), and a font-scope check
against the comment saying where the fonts moved (F-70). Whoever documents a rule is the first person
to break it, every time. `scripts/prose.mjs` exports `stripComments` (TypeScript, via the compiler's
scanner), `stripCssComments` and `stripFences` (markdown). Use one. If your medium is not there, add
it there rather than working around it locally.

**Verify by running the thing, not by reading it.** Two independent reviewers diagnosed a broken font
by reading CSS and both prescribed a one-line fix that would have left every page in Times New Roman;
the actual defect was a variable defined on `<body>` and consumed at `<html>`, and it only surfaced
when someone opened a browser (F-70). A gate can tell you a claim is true. It cannot tell you the
product works.

**A count in prose goes stale the moment reality moves.** The `status` gate enforces this and it will
catch you. Do not reach for backticks to silence it — `claimsIn` exempts inline code spans, and using
that exemption to keep a number is steering your prose around a gate instead of answering it. Rewrite
the sentence so it does not assert a count.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
