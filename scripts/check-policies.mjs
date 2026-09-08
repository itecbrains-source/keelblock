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

const DB =
  process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';
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
    coveredBy:
      'supabase/tests/intent/003-membership-invariants.test.sql (8 tests) + 001 (13 tests)',
  },
};

/**
 * `organization:DELETE` is reported UNRELIABLE by design: the policy compares
 * org_role_of(id) = 'owner' rather than delegating to a boolean, so mocking cannot isolate it. The
 * tool says so rather than guessing; the intent suite covers it directly.
 */
const UNRELIABLE = ['organization:DELETE'];

/**
 * Decide what gets probed. Exported pure so it can carry mutation proofs: a coverage transfer that
 * nobody checks becomes a coverage hole the moment someone edits the list.
 *
 * @param {string[]} tables
 * @param {Record<string, { why?: string, coveredBy?: string }>} [notProbeable]
 * @returns {{ probe: string[], skip: Array<{ table: string, why?: string, coveredBy?: string }> }}
 */
export function planProbes(tables, notProbeable = NOT_PROBEABLE) {
  const probe = [],
    skip = [];
  for (const table of tables) {
    const entry = notProbeable[table];
    if (!entry) {
      probe.push(table);
      continue;
    }
    // A skip MUST say where the coverage went. Without `coveredBy` this is not a transfer, it is a
    // silent hole, and the list would become the easiest place in the repo to hide one.
    if (!entry.coveredBy || !entry.why) {
      throw new Error(
        `check-policies: "${table}" is skipped without naming why and what covers it instead. ` +
          `A skip is a coverage TRANSFER; it must name the tests that carry the burden.`,
      );
    }
    skip.push({ table, ...entry });
  }
  return { probe, skip };
}

function main() {
  if (!existsSync(RLSA)) {
    console.error('rlsautotest is not installed. Run:');
    console.error('  python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt');
    process.exit(2);
  }

  // Derive the tenant-scoped tables from the catalog rather than a hand-kept list, so a new table is
  // probed automatically and cannot be forgotten.
  let tables;
  try {
    tables = execFileSync(
      'psql',
      [
        DB,
        '-tAc',
        `
      select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       order by 1;`,
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    console.error(
      'policy: could not read the catalog. Is the local stack running? `supabase start`',
    );
    process.exit(2);
  }

  rmSync('supabase/tests/rls', { recursive: true, force: true });

  const { probe, skip } = planProbes(tables);
  for (const s of skip) {
    console.log(`policy: ${s.table} — not probed. ${s.why}`);
    console.log(`policy: ${s.table} — covered by ${s.coveredBy}`);
  }

  const probed = [];
  for (const table of probe) {
    const r = spawnSync(
      RLSA,
      [
        '--db-url',
        DB,
        '--supabase',
        '--table',
        table,
        '--emit',
        '.',
        ...UNRELIABLE.flatMap((u) => ['--allow-unreliable', u]),
        '--no-fail',
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (r.status !== 0) {
      console.error(`policy: could not generate the suite for ${table}`);
      process.exit(2);
    }
    probed.push(table);
  }
  console.log(
    `policy: generated suites for ${probed.length}/${tables.length} RLS tables (${probed.join(', ')})`,
  );

  const run = spawnSync('supabase', ['test', 'db'], { stdio: 'inherit' });

  // Clean up after the test framework, because it changes what the NEXT gate sees.
  //
  // The generated suite opens with `create extension if not exists pgtap`, and whether that survives
  // the run depends on the CLI version: it does not on 2.109.0, it does on the `latest` a GitHub
  // runner installs. `check-generated` runs immediately after this gate and asks the database for
  // its types, so a resident pgTAP puts its own views -- pg_all_foreign_keys, tap_funky -- into the
  // application's `Database` type and the committed artifact reads STALE. Measured 2026-09-08: 149
  // lines of difference, and two CI failures whose message named the schema rather than the cause.
  //
  // Dropping it restores the state the run started in. That is cleanup, not mutation -- and a gate
  // that leaves residue for a later gate to trip over is worse than one that does nothing (F-29).
  try {
    execFileSync('psql', [DB, '-qc', 'drop extension if exists pgtap'], { stdio: 'pipe' });
  } catch {
    console.error(
      'policy: pgtap could not be removed after the run. If `generated` now reports stale types,',
    );
    console.error('  that is why, and the schema has not changed.');
  }
  process.exit(run.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
