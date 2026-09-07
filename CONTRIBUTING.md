# Contributing

## The three rules that matter

**1 · Tests before implementation.** Write the failing test, watch it fail, then fix it. Both
security defects in [F-9 and F-10](docs/FINDINGS.md) were found this way and their tests were
committed red before the fix existed. A test written after the fix only proves the fix does what its
author already believed.

**2 · A gate needs a proof it can fail.** Every gate ships a mutation test that restores the real
defect and asserts the gate goes red. A gate that has only ever printed a tick has not been shown to
be looking at anything. See `scripts/access-matrix.test.mts` for the shape.

**3 · Measure, then claim.** Nothing in the docs asserts behaviour that has not been reproduced. If
you cannot reproduce it, write down what you observed and what you could not confirm.

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

create policy thing_select on public.thing
  for select to authenticated using (public.is_org_member(organization_id));
create policy thing_insert on public.thing
  for insert to authenticated with check (public.is_org_member(organization_id));
```

Then `npm run check`. The gates will tell you if you missed something, and the access matrix diff
will show exactly who gained access.

Three rules the gates enforce, each because of a measured defect:

- **`organization_id` directly on the table**, never resolved through a join. It is what makes the
  scoped-table set derivable, which is what makes the gates possible at all.
- **Every write policy needs a `WITH CHECK` that constrains the organisation.** `USING` alone lets a
  member write into another tenant, and the smuggled row is invisible to them ([F-4](docs/FINDINGS.md)).
  A `WITH CHECK (true)` is not a `WITH CHECK`.
- **`(select auth.uid())`, not `auth.uid()`** — the subquery form is evaluated once rather than per
  row. It is also *illegal* in a trigger `WHEN` clause, where the plain form belongs.

## Testing a policy

Two layers, deliberately:

- **Generated** (`rlsautotest`) is exhaustive and cannot judge. It mocks opaque policy functions, so
  everything *inside* a helper is unverified by it.
- **Intent** (`supabase/tests/intent/`) judges and cannot be exhaustive. It is where you assert what
  *should* be true.

Assert a write rejection **as the writer**, never by reading afterwards — and remember that a failing
`USING` on `UPDATE` is a silent no-op (`UPDATE 0`, no error), so those cases assert on the data.

## Before you open a PR

```bash
npm run check      # all six gates
npm run verify     # run the CI workflow locally (see the README for what it can and cannot cover)
```

Green is necessary, not sufficient. If you changed a policy, read the `docs/ACCESS-MATRIX.md` diff
and say in the PR what changed and why.
