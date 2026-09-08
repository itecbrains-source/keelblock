# Working in keel

For a coding agent or a developer who has not seen this repository before. **Read this once; it is
short on purpose.**

## What this is

A multi-tenant SaaS starter where **tenant isolation is enforced by the database, not by application
code, and proven on every commit.** Next.js 16 · React 19 · TypeScript · Supabase · Stripe.

## The one rule

**Never enforce tenant isolation in application code.** Not an `if`, not a filter, not a helper that
compares ids. Isolation is a row-level-security policy; application code carries the user's session
and lets the database refuse.

The pattern this replaces, which is what every competing kit does:

```ts
const row = await getById(id);                    // any tenant's row, by id alone
if (row.teamId !== teamId) throw new Error(403);  // and now it is in memory
```

Under RLS the row is never selected. There is no second step to forget.

## How you know you are right

```bash
npm run check          # 12 gates, all failures reported at once, ~30s
```

**You cannot make this pass by being persuasive.** Every gate has a mutation proof — a test that
restores the real defect and asserts the gate goes red — so a green run is evidence, not agreement.
What it catches:

| If you… | This says so |
|---|---|
| add a table and forget row-level security | `schema` |
| write `with check (true)` because it compiles | `schema` |
| reach for the service-role client to make a query work | `boundaries` (walks the import graph) |
| cache a tenant query | `boundaries` |
| invent a translation key, or leave one unused | `locale` |
| leave an unused export or dependency | `unused` |
| claim something nothing implements | `promises` |
| widen a permission | the `docs/ACCESS-MATRIX.md` diff |

If a gate fails, **read its message** — it names the file, the line, and the fix. If a gate seems
wrong, it has been wrong before: say so rather than working around it.

## Recipes

**Add a tenant-scoped table** — see [CONTRIBUTING.md](CONTRIBUTING.md). Three rules: `organization_id`
on the table, RLS enabled, and a `WITH CHECK` that constrains the organisation. `with check (true)`
is not a `WITH CHECK`.

**Add a mutation** — a Server Action that does validate → authorise → act, with its parameter typed
`unknown` and parsed. It is a network boundary wearing a function's clothes
([ADR-011](docs/adr/ADR-011-app-router-conventions.md)).

**Add user-facing text** — a key in `messages/en.json` and `t('key')`. Never a literal string.

**Not doing something** — a row in [`spec/DEFERRAL_REGISTRY.md`](spec/DEFERRAL_REGISTRY.md) with a
reason and a machine-evaluable trigger. **A defect is never a deferral**: if you broke it, you fix it
in the change that broke it.

## Where the answers are

| Question | File |
|---|---|
| What is keel for, and what is it deliberately not? | `docs/PRODUCT.md` |
| Why is it built this way? | `docs/adr/` — eleven decisions, each with the rejected options |
| What is true that we measured? | `docs/FINDINGS.md` — including our own mistakes |
| What is built, and what is next? | `spec/README.md` |
| What did we decide not to do yet? | `spec/DEFERRAL_REGISTRY.md` |

## Before you author a spec

**Research it from authoritative sources first, and write the memo.** A spec written from
recollection encodes whatever was true when its author last looked — and in a fast-moving area that
is worse than no spec, because it reads as settled.

Memos live in `research/`, cite primary sources where they exist, and **separate settled from
contested**, so the spec can ship the contested part honestly labelled rather than silently.

`research/05-SEO-2026.md` is the worked example. Written from memory it would have said "add FAQ
schema for rich results" — a recommendation that has been wrong since 7 May 2026, when those results
were removed. The memo also shows why the *opposite* conclusion is wrong: the markup still matters,
for a different reason than it used to.

## Two habits that matter here

**Measure, then claim.** Nothing in this repository asserts behaviour nobody reproduced. Several
findings exist because someone was about to ship a confident, wrong thing — a CSP that would have
blocked every page, a gate that could not fail. If you cannot reproduce it, write down what you
observed and what you could not confirm.

**Tests before implementation.** Write the failing test, watch it fail, then fix it. A test written
after the fix only proves the fix does what its author already believed.
