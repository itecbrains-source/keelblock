# Contributing

## The three rules that matter

**1 · Tests before implementation.** Write the failing test, watch it fail, then fix it. Both
security defects in [F-9 and F-10](docs/FINDINGS.md) were found this way and their tests were
committed red before the fix existed. A test written after the fix only proves the fix does what its
author already believed.

**2 · A gate needs a proof it can fail.** Every gate ships a mutation test that restores the real
defect and asserts the gate goes red. A gate that has only ever printed a tick has not been shown to
be looking at anything. See `scripts/access-matrix.test.mts` for the shape.

**3 · Measure, then claim.** Nothing in the docs asserts behavior that has not been reproduced. If
you cannot reproduce it, write down what you observed and what you could not confirm.

## House style

**US English**, in prose and in identifiers — `organization`, `behavior`, `authorize`, `license`,
`center`, `analyze`. The database has always spelled it `organization`, and prose that spells it
`organisation` puts two spellings of the central noun in one repository.

**Deliberately not gated.** A spelling check means a word list to maintain and false positives to
exempt — `promise`, `enterprise`, `exercise` and `compromise` are correct in both dialects and a
careless rule mangles all four. The failure mode here is cosmetic, and the marginal value of another
mechanism in this repository is currently zero (`docs/review/06-RESCORE-CI.md`). So this is a
convention a reviewer enforces, and it is written down rather than assumed, which is the difference
that matters.

## Adding a tenant-scoped table

The most common change, and the one where data leaks. In one migration:

```sql
create table public.thing (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  ...
);
create index thing_org_idx on public.thing (organization_id);
alter table public.thing enable row level security;
alter table public.thing force row level security;

create policy thing_select on public.thing
  for select to authenticated using (public.is_org_member(organization_id));
create policy thing_insert on public.thing
  for insert to authenticated with check (public.is_org_member(organization_id));

grant select, insert on public.thing to authenticated;
```

Then `npm run check`. The gates will tell you if you missed something, and the access matrix diff
will show exactly who gained access.

Three rules the gates enforce, each because of a measured defect:

- **`organization_id` directly on the table**, never resolved through a join. It is what makes the
  scoped-table set derivable, which is what makes the gates possible at all.
- **Every write policy needs a `WITH CHECK` that constrains the organization.** `USING` alone lets a
  member write into another tenant, and the smuggled row is invisible to them ([F-4](docs/FINDINGS.md)).
  A `WITH CHECK (true)` is not a `WITH CHECK`.
- **`(select auth.uid())`, not `auth.uid()`** — the subquery form is evaluated once rather than per
  row. It is also _illegal_ in a trigger `WHEN` clause, where the plain form belongs.

Two of the lines above were **added** on 2026-09-08 after being measured missing, and they are called
out because copying an older version of this recipe from anywhere else will omit them
([F-47](docs/FINDINGS.md)):

- **`force row level security`, not just `enable`.** On Supabase the table owner is `postgres`, which
  is not a superuser but carries `rolbypassrls` — so `ENABLE` alone leaves the owner reading every
  tenant's rows, and with it every `SECURITY DEFINER` function, since those run as the owner. Measured
  on a table built from the recipe **as it stood before that date**: `RLS forced? false`. This is the defect
  `organization_invitation` shipped with, and the guard now catches it.
- **The grant.** Default privileges were deliberately stripped here (`20260908140000`), so a table
  created without one is unreachable: measured `authenticated SELECT grant: false`. It fails closed,
  which is the safe direction, and it meant the earlier recipe produced a table nobody could read.

## Testing a policy

Two layers, deliberately:

- **Generated** (`rlsautotest`) is exhaustive and cannot judge. It mocks opaque policy functions, so
  everything _inside_ a helper is unverified by it.
- **Intent** (`supabase/tests/intent/`) judges and cannot be exhaustive. It is where you assert what
  _should_ be true.

Assert a write rejection **as the writer**, never by reading afterwards — and remember that a failing
`USING` on `UPDATE` is a silent no-op (`UPDATE 0`, no error), so those cases assert on the data.

## Authoring a spec

Research first, from authoritative sources, and commit the memo alongside it. Cite primary sources
where they exist, and mark clearly what is **settled** versus **contested** — a spec that presents a
contested practice as established is the same defect as an unbacked claim, and harder to spot.

## Deferring work

Debt is allowed; **unlogged debt is not**, and neither is debt whose moment has arrived and nobody
noticed. Add a row to [`spec/DEFERRAL_REGISTRY.md`](spec/DEFERRAL_REGISTRY.md) with a real reason and
a **machine-evaluable trigger**. When the trigger fires, `npm run check` fails until the deferral is
built, closed, or its trigger deliberately restated — that failure is the entire mechanism.

A marker in code (`@defer DEF-001`) must name a registry entry, or the gate rejects it.

**Rule 0: a deferral is scope you chose not to build. A defect is never a deferral.** If you broke
it, you fix it in the change that broke it.

## Closing work

A spec claiming `done` must have **every acceptance criterion** closed — done, or deferred to a
`DEF-*`. The build fails otherwise, because the alternative is what happened here before the rule
existed: SPEC-001 read `done` with 2 of 14 criteria still `planned`, and a reader could not tell that
apart from being misled ([F-23](docs/FINDINGS.md)).

**Do not write a count into a document.** Numbers of findings, gates, specs, bars — all of them go
stale the moment reality moves, and a gate now checks them against the real thing. Cite
`npm run status` instead.

## Before you open a PR

```bash
npm run check      # every gate
npm run verify     # run the CI workflow locally (see the README for what it can and cannot cover)
```

Green is necessary, not sufficient. If you changed a policy, read the `docs/ACCESS-MATRIX.md` diff
and say in the PR what changed and why.
