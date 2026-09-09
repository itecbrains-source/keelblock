#!/usr/bin/env node
/**
 * SPEC-003 REQ-2 — the new-table guard.
 *
 * **This is the gate that keeps bar B-2 true as the schema grows**, which is when isolation claims
 * usually decay. Everything else proves the policies that exist; this proves none is missing.
 *
 * A table carrying `organization_id` is tenant-scoped by definition (ADR-001 REQ-2 puts the column
 * on the table precisely so this is derivable rather than a hand-kept list). Four ways it can be
 * wrong, all measured on real schemas:
 *
 *   · RLS disabled — the table is readable by anyone with the publishable key
 *   · no policy at all — usually unintended rather than a deliberate deny-all
 *   · a write policy with no `WITH CHECK` — reads correctly while letting a member write into
 *     another tenant, and the smuggled row is invisible to them (F-4)
 *   · a write policy whose `WITH CHECK` is trivially `true` — the same hole with a clause that looks
 *     like a check. `polwithcheck IS NULL` does not catch it; this does (F-8)
 */
import { execFileSync } from 'node:child_process';

const DB =
  process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';

const QUERY = `
-- Tenant-scoped means: carries organization_id, OR IS the organization table, whose own id column
-- is the tenant key. The root was invisible to the first version of this query -- the single most
-- important table in the schema, missed because it does not reference itself.
with scoped as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (
      c.relname = 'organization'
      or exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped
      )
    )
)
select s.relname || E'\\t' || f.violation from scoped s
cross join lateral (
  select 'row-level security is DISABLED' as violation where not s.relrowsecurity
  union all
  -- ENABLE is not enough. The table owner on Supabase (postgres) is not a superuser but carries
  -- rolbypassrls, so without FORCE the owner reads and writes every tenant's rows -- and anything
  -- running as the owner, which includes every SECURITY DEFINER function in this schema, does too.
  -- Added after organization_invitation shipped ENABLE-only while the other three tables had
  -- carried FORCE since the foundation migration. The guard whose stated job is "every tenant table
  -- is protected" reported ok; the access-matrix gate is what found it.
  select 'row-level security is not FORCED -- the owner bypasses it'
    where s.relrowsecurity and not s.relforcerowsecurity
  union all
  select 'no policy at all' where not exists (select 1 from pg_policy p where p.polrelid = s.oid)
  union all
  select 'write policy "' || p.polname || '" has no WITH CHECK'
    from pg_policy p where p.polrelid = s.oid and p.polcmd in ('a','w','*') and p.polwithcheck is null
  union all
  -- The STRONG form of the rule. Asking "is this expression the literal true" is a string
  -- comparison, and it catches exactly one spelling. It does not catch \`with check (1=1)\`, and more
  -- to the point it does not catch the two a developer actually writes when a policy will not
  -- compile and they want to move on: \`with check (auth.uid() is not null)\` and
  -- \`with check (organization_id is not null)\`. Both look like constraints. Neither constrains
  -- anything about WHICH tenant.
  --
  -- F-8 established that the presence of a WITH CHECK is not enough, because the real defect has
  -- one. This extends that one step further: the property the schema actually wants is that the
  -- expression MENTIONS THE TENANT KEY -- organization_id, or \`id\` on the organization table
  -- itself, whose own id is the tenant key.
  select 'write policy "' || p.polname || '" has a WITH CHECK that never mentions the tenant: '
         || pg_get_expr(p.polwithcheck, p.polrelid)
    from pg_policy p where p.polrelid = s.oid and p.polcmd in ('a','w','*')
      and p.polwithcheck is not null
      and pg_get_expr(p.polwithcheck, p.polrelid) !~ (
        case when s.relname = 'organization'
             then '(^|[^a-z_])(organization_id|id)([^a-z_]|$)'
             else '(^|[^a-z_])organization_id([^a-z_]|$)' end
      )
  union all
  -- The residual case the "mentions the key" rule lets through, named rather than left implicit:
  -- an expression whose ONLY use of the key is a null test. It mentions organization_id and
  -- constrains nothing about which organization, which is precisely the shape of the defect.
  select 'write policy "' || p.polname || '" constrains only that the tenant key is present, not '
         || 'which tenant it is: ' || pg_get_expr(p.polwithcheck, p.polrelid)
    from pg_policy p where p.polrelid = s.oid and p.polcmd in ('a','w','*')
      and p.polwithcheck is not null
      and pg_get_expr(p.polwithcheck, p.polrelid) ~* '^\\(?\\s*organization_id\\s+is\\s+not\\s+null\\s*\\)?$'
  union all
  -- The same two rules, applied to USING. Until DEF-020's adversarial trial (F-53) this gate read
  -- polwithcheck and nothing else, so the ENTIRE read and delete decision was unexamined: a SELECT
  -- policy of \`using (true)\` on a tenant table passed a gate whose stated job is "every tenant
  -- table is protected". WITH CHECK governs what you may WRITE; USING governs what you may SEE and
  -- DELETE, and only one of them was being read.
  --
  -- Honest about the limit: this does NOT catch the defect that trial actually landed, which swapped
  -- is_org_admin for is_org_member on a DELETE. That expression mentions the tenant key and IS a
  -- correct tenant scope -- it is the wrong AUTHORITY, a question this catalog-shaped rule cannot
  -- ask. The intent layer answers that one, in 001-tenant-isolation.
  select 'policy "' || p.polname || '" has a USING that never mentions the tenant: '
         || pg_get_expr(p.polqual, p.polrelid)
    from pg_policy p where p.polrelid = s.oid and p.polcmd in ('r','w','d','*')
      and p.polqual is not null
      and pg_get_expr(p.polqual, p.polrelid) !~ (
        case when s.relname = 'organization'
             then '(^|[^a-z_])(organization_id|id)([^a-z_]|$)'
             else '(^|[^a-z_])organization_id([^a-z_]|$)' end
      )
  union all
  select 'policy "' || p.polname || '" has a USING that constrains only that the tenant key is '
         || 'present, not which tenant it is: ' || pg_get_expr(p.polqual, p.polrelid)
    from pg_policy p where p.polrelid = s.oid and p.polcmd in ('r','w','d','*')
      and p.polqual is not null
      and pg_get_expr(p.polqual, p.polrelid) ~* '^\\(?\\s*organization_id\\s+is\\s+not\\s+null\\s*\\)?$'
) f
order by 1;`;

/** Pure: turn rows into problems. Exported so the gate's rules carry mutation proofs. */
export function findViolations(rows) {
  return rows.filter(Boolean).map((line) => {
    const [table, violation] = line.split('\t');
    return { table, violation };
  });
}

function main() {
  let out;
  try {
    out = execFileSync('psql', [DB, '-tA', '-c', QUERY], { encoding: 'utf8' });
  } catch (err) {
    // Report what actually failed. An earlier version printed "could not reach the database" for a
    // SQL syntax error, sending the reader to check Docker for twenty minutes. A gate that
    // misreports its own failure is worse than one that says nothing (SPEC-002 REQ-8).
    const stderr = String(err.stderr ?? '').trim();
    if (/could not connect|connection refused|does not exist/i.test(stderr) || !stderr) {
      console.error(
        'schema-guard: could not reach the database. Is the local stack running? `supabase start`',
      );
    } else {
      console.error(
        'schema-guard: the query failed — this is a bug in the gate, not in your schema:\n',
      );
      console.error(
        stderr
          .split('\n')
          .slice(0, 5)
          .map((l) => `  ${l}`)
          .join('\n'),
      );
    }
    process.exit(2);
  }

  const violations = findViolations(out.trim().split('\n'));
  const scoped = execFileSync(
    'psql',
    [
      DB,
      '-tAc',
      `
    select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (c.relname = 'organization' or exists (
         select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id'
           and a.attnum > 0 and not a.attisdropped));`,
    ],
    { encoding: 'utf8' },
  ).trim();

  if (!violations.length) {
    console.log(`schema-guard: ok — ${scoped} tenant-scoped table(s), every one protected`);
    return;
  }
  console.error('schema-guard: FAILED\n');
  for (const v of violations) console.error(`  ${v.table}: ${v.violation}`);
  console.error(
    '\nA table carrying organization_id is tenant data. Every one needs RLS enabled and a',
  );
  console.error('WITH CHECK that constrains the organization — see CONTRIBUTING.md.');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
