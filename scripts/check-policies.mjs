#!/usr/bin/env node
/**
 * The policy layer of `npm run check`: regenerate the exhaustive suite from the live catalog, then
 * run it alongside the hand-written intent suite.
 *
 * The generated suite is **machinery, not evidence** — regenerated every run and gitignored, because
 * a committed copy goes stale against the schema and a stale generated test is a false failure that
 * teaches people to ignore the runner. The committed evidence is `docs/ACCESS-MATRIX.md`.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const DB = process.env.KEEL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';
const RLSA = './.venv/bin/rlsautotest';

/**
 * Tables the generated prober cannot probe, with the reason and where the coverage actually lives.
 * This list may only shrink. An entry here is a coverage *transfer*, never a coverage *hole* — each
 * names the intent tests that carry the burden instead.
 */
const NOT_PROBEABLE = {
  organization_member: {
    why:
      'carries domain-invariant triggers (owner authority, last-owner). The prober resets its ' +
      'fixture with `DELETE FROM organization_member`, and clears only `request.jwt.claims` — but ' +
      'auth.uid() is coalesce(request.jwt.claim.sub, …claims->>sub), so a stale identity survives ' +
      'and the triggers correctly fire. The resulting SQL exception aborts the whole file, which no ' +
      'flag can suppress.',
    coveredBy: 'supabase/tests/intent/003-membership-invariants.test.sql (8 tests) + 001 (13 tests)',
  },
};

/**
 * `organization:DELETE` is reported UNRELIABLE by design: the policy compares
 * org_role_of(id) = 'owner' rather than delegating to a boolean, so mocking cannot isolate it. The
 * tool says so rather than guessing; the intent suite covers it directly.
 */
const UNRELIABLE = ['organization:DELETE'];

if (!existsSync(RLSA)) {
  console.error('rlsautotest is not installed. Run:');
  console.error('  python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt');
  process.exit(2);
}

// Derive the tenant-scoped tables from the catalog rather than a hand-kept list, so a new table is
// probed automatically and cannot be forgotten.
let tables;
try {
  tables = execFileSync('psql', [DB, '-tAc', `
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     order by 1;`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch {
  console.error('policy: could not read the catalog. Is the local stack running? `supabase start`');
  process.exit(2);
}

rmSync('supabase/tests/rls', { recursive: true, force: true });

const probed = [];
for (const table of tables) {
  const skip = NOT_PROBEABLE[table];
  if (skip) {
    console.log(`policy: ${table} — not probed. ${skip.why}`);
    console.log(`policy: ${table} — covered by ${skip.coveredBy}`);
    continue;
  }
  const r = spawnSync(RLSA,
    [ '--db-url', DB, '--supabase', '--table', table, '--emit', '.',
      ...UNRELIABLE.flatMap((u) => ['--allow-unreliable', u]), '--no-fail' ],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) { console.error(`policy: could not generate the suite for ${table}`); process.exit(2); }
  probed.push(table);
}
console.log(`policy: generated suites for ${probed.length}/${tables.length} RLS tables (${probed.join(', ')})`);

const run = spawnSync('npx', ['--no-install', 'supabase', 'test', 'db'], { stdio: 'inherit' });
process.exit(run.status ?? 1);
