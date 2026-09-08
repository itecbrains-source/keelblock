-- The buyer's own work, months after they scaffolded. An ordinary tenant table.
create table public.customer_note (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index customer_note_org_idx on public.customer_note (organization_id);
alter table public.customer_note enable row level security;
alter table public.customer_note force row level security;
create policy customer_note_select on public.customer_note
  for select to authenticated using (public.is_org_member(organization_id));
create policy customer_note_insert on public.customer_note
  for insert to authenticated with check (public.is_org_member(organization_id));
grant select, insert on public.customer_note to authenticated;
