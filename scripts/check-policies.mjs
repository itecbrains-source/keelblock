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
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';

const DB =
  process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';
const RLSA = './.venv/bin/rlsautotest';
// The run's coverage matrix, read by AC-11 and then thrown away. Not committed: it is a measurement
// of one run, and a stored copy is a claim about a run nobody is looking at.
const REPORT = '.rlsautotest-report.json';

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

/**
 * What the generator actually WROTE, reconciled against what was planned.
 *
 * Pure, and exported, because its absence is what hid the worst defect this gate has had: the
 * per-table loop deleted its own output (each run reconciles away files "no longer part of this
 * run"), so one suite existed while the gate reported three -- and nothing compared the claim to the
 * directory. A count taken from exit codes is not a measurement of coverage.
 *
 * @param {string[]} files basenames in supabase/tests/rls
 * @param {string[]} probe tables that must have a suite
 * @param {Array<{table: string}>} skip tables whose coverage was transferred elsewhere
 * @returns {{ suites: string[], remove: string[], missing: string[], unmatchedSkips: string[] }}
 */
export function reconcileEmitted(files, probe, skip) {
  // 1xx only. `010-rls-enabled_rlsautotest.sql` is the tool's RLS-on guard, not a table's suite, and
  // counting it as one made three probed tables report as four -- a number that happened to equal
  // the table count, so it read as complete.
  const byTable = new Map();
  for (const f of files) {
    const m = /^1\d\d-rls-(.+)_rlsautotest\.sql$/.exec(f);
    if (m) byTable.set(m[1], f);
  }
  // A transferred table's suite is deleted so the runner does not execute it -- but a skip entry
  // that matches NOTHING is a typo quietly widening into a coverage hole, which is the same failure
  // in different clothes, so it is reported rather than ignored.
  const remove = [],
    unmatchedSkips = [];
  for (const sk of skip) {
    const f = byTable.get(sk.table);
    if (!f) unmatchedSkips.push(sk.table);
    else {
      remove.push(f);
      byTable.delete(sk.table);
    }
  }
  return {
    suites: [...byTable.keys()].sort(),
    remove,
    missing: probe.filter((t) => !byTable.has(t)),
    unmatchedSkips,
  };
}

/**
 * AC-11 · every generated suite must prove somebody CAN act, not only that others cannot.
 *
 * The defect this exists for, in REQ-1b's own words: the toolkit's generated `002-org-isolation.sql`
 * "ships its seed block commented out — eight planned assertions against data nobody creates."
 * Every one of those assertions expects to see nothing, and against an empty table every one of them
 * passes. The suite is green and has tested nothing.
 *
 * Checking for seed STATEMENTS would be checking the attempt. This checks the produced result: for
 * each command a table actually has a policy for, at least one identity in the run's own report must
 * be EXPECTED to succeed. That cell is the positive control — it is the assertion an empty fixture
 * cannot pass, so its presence is what makes every neighbouring refusal mean something.
 *
 * A command with no policy is deliberately not asked for one. `organization_invitation` has a SELECT
 * policy and no write policy or grant at all; demanding a positive control for its UPDATE would be
 * demanding proof that a door welded shut can be opened.
 *
 * Exceptions are the lists this gate already keeps, not a second one beside them: a table whose
 * coverage was transferred (`NOT_PROBEABLE`) and a cell already reviewed as un-probeable
 * (`UNRELIABLE`). An entry that excuses nothing is reported, for the same reason a skip that matches
 * nothing is — it is a coverage hole waiting for the cell it named to be renamed.
 *
 * @param {{tables?: Array<{table: string, policied?: string[], idgrid?: Record<string, Record<string, {exp?: boolean}>>}>}} report
 * @param {Record<string, unknown>} notProbeable
 * @param {string[]} unreliable
 * @returns {{ problems: string[], checked: number }}
 */
export function checkPositiveControls(report, notProbeable, unreliable) {
  const problems = [];
  const usedCells = new Set();
  let checked = 0;

  for (const t of report.tables ?? []) {
    if (notProbeable[t.table]) continue;
    for (const cmd of t.policied ?? []) {
      const key = `${t.table}:${cmd}`;
      const identities = t.idgrid?.[cmd] ?? {};
      const positive = Object.entries(identities).filter(([, v]) => v?.exp);
      if (positive.length) {
        checked++;
        continue;
      }
      if (unreliable.includes(key)) {
        usedCells.add(key);
        continue;
      }
      problems.push(
        `${key}: a policy grants this command, and no identity is expected to succeed at it. ` +
          `Every assertion for it expects a refusal, which an empty fixture also produces — so a ` +
          `suite that seeded nothing would be just as green. Seed the row the policy admits, or ` +
          `record the cell in UNRELIABLE with the reason it cannot be probed.`,
      );
    }
  }

  for (const key of unreliable) {
    if (!usedCells.has(key)) {
      problems.push(
        `UNRELIABLE lists ${key}, which excused nothing in this run. Either the cell now has a ` +
          `positive control and the entry should go, or it no longer exists and the entry is a ` +
          `hole waiting to be reopened.`,
      );
    }
  }
  return { problems, checked };
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

  // ONE invocation for the whole schema, which is how the tool is meant to be driven ("omit
  // --table, with --emit, to do every RLS table in the schema").
  //
  // It used to be a loop, one call per table, and that loop silently destroyed its own output. Each
  // run ends with a reconciliation step -- `removed N stale generated file(s) no longer part of this
  // run` -- which is correct for a whole-schema run and lethal in a loop: generating `organization`
  // wrote its file, generating `organization_invitation` deleted it, and generating `project`
  // deleted that. One table survived, always the last one.
  //
  // Nothing failed, because `--no-fail` returns 0 and the loop counted an exit code rather than a
  // file. The gate then printed `generated suites for 3/4 RLS tables (organization,
  // organization_invitation, project)` while exactly one suite existed on disk. Measured
  // 2026-09-08, on the run that added `organization_invitation`: the exhaustive layer -- the one
  // this project points at when it says isolation is proven rather than asserted -- had been
  // proving a single table.
  const r = spawnSync(
    RLSA,
    [
      '--db-url',
      DB,
      '--supabase',
      '--emit',
      '.',
      ...UNRELIABLE.flatMap((u) => ['--allow-unreliable', u]),
      '--no-fail',
      // AC-11 needs the run's own coverage matrix, and `--report-json` writes nothing without
      // `--report` (measured: no file). `--report` runs the emitted suite, which costs about five
      // seconds on top of generating it -- the price of asking what was produced rather than what
      // was attempted.
      '--report',
      '--report-json',
      REPORT,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (r.status !== 0) {
    console.error('policy: the generated suite could not be produced');
    process.exit(2);
  }

  const { suites, remove, missing, unmatchedSkips } = reconcileEmitted(
    readdirSync('supabase/tests/rls'),
    probe,
    skip,
  );
  if (unmatchedSkips.length) {
    console.error(
      `policy: ${unmatchedSkips.join(', ')} listed as not-probeable, but the generator emitted ` +
        'nothing for them. Either the table is gone or the name is wrong, and an entry that ' +
        'matches nothing transfers no coverage.',
    );
    process.exit(2);
  }
  for (const f of remove) rmSync(`supabase/tests/rls/${f}`);
  if (missing.length) {
    console.error(`policy: no suite was generated for ${missing.join(', ')} -- refusing to report`);
    console.error('  coverage that does not exist on disk.');
    process.exit(2);
  }

  console.log(
    `policy: generated suites for ${suites.length}/${tables.length} RLS tables (${suites.join(', ')})`,
  );

  // AC-11 · a suite that only ever proves refusals is green against an empty fixture.
  if (!existsSync(REPORT)) {
    console.error('policy: the run produced no coverage report, so AC-11 could not be checked.');
    process.exit(2);
  }
  const { problems, checked } = checkPositiveControls(
    JSON.parse(readFileSync(REPORT, 'utf8')),
    NOT_PROBEABLE,
    UNRELIABLE,
  );
  if (problems.length) {
    console.error('policy: FAILED — a generated suite proves nothing it could not prove empty.\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('');
    process.exit(2);
  }
  console.log(`policy: ${checked} policied command(s) carry a positive control (AC-11)`);

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
