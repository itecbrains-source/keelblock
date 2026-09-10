#!/usr/bin/env node
/**
 * `npm run check` — SPEC-003 REQ-8.
 *
 * Runs every gate and test layer and **reports all failures rather than stopping at the first**.
 * A developer who has to run six commands runs four; a checker that stops at the first failure makes
 * you run it six times.
 *
 * The decision logic is exported as pure functions so it can carry mutation proofs
 * (`scripts/check.test.mts`). A runner that has only ever printed a tick has not been shown to be
 * looking at anything.
 */
import { spawnSync } from 'node:child_process';

export const STEPS = [
  // Next generates route types (LayoutProps, PageProps) into .next/types. Without this, typecheck
  // fails on a clean checkout — a gate that cannot pass on a fresh clone is a broken gate.
  { id: 'typegen', why: 'route types are generated', cmd: 'npx', args: ['next', 'typegen'] },
  { id: 'typecheck', why: 'types are sound', cmd: 'npx', args: ['tsc', '--noEmit'] },
  // The production build. It is here because it is the only step that RENDERS a page: `tsc --noEmit`
  // exits 0 on a component that throws, and this exits 1 naming the page and the line (F-51).
  //
  // It is NOT here for route types. `next typegen` above emits a byte-identical
  // `.next/types/validator.ts`, so typecheck already performs every route-type check the default
  // build performs — which corrects the premise F-49 recorded. The webpack build checks more (it
  // emits an exhaustive per-route `Diff`, and rejects the named exports two pages carry for their
  // tests); the default Turbopack build does not, and the default is what `npm run build` runs.
  //
  // Cost: 11-16s cold across five runs, which is less than `unit` already costs. Loop TOTAL is not
  // quoted on purpose — three consecutive cold runs of the same tree spanned 51-120s, so machine
  // noise dwarfs this step and any precise projection would be fiction (F-52, docs/TESTING.md).
  // Not a gate — SPEC-003's ceiling counts `scripts/check-*.mjs` rules (status.mjs), and this is a
  // build step, as typecheck is.
  {
    id: 'build',
    why: 'the application renders in production',
    cmd: 'npx',
    args: ['next', 'build'],
  },
  {
    id: 'format',
    why: 'one style, so review is about content',
    cmd: 'npx',
    args: ['prettier', '--check', '.'],
  },
  {
    id: 'lint',
    why: 'no lint regressions',
    cmd: 'npx',
    args: ['eslint', '.', '--max-warnings', '0'],
  },
  // No --passWithNoTests: a suite that passes with zero tests is a check that cannot fail (F-13).
  { id: 'unit', why: 'pure logic is correct', cmd: 'npx', args: ['vitest', 'run'] },
  {
    id: 'locale',
    why: 'translations are complete and all used',
    cmd: 'node',
    args: ['scripts/check-locale.mjs'],
  },
  {
    id: 'unused',
    why: 'no dead code or unused dependencies',
    cmd: 'node',
    // Wraps knip rather than calling it directly: knip exits 0 on a `Remove from …` configuration
    // hint, which is knip saying an exemption has expired. That is a finding, not a footnote.
    args: ['scripts/check-unused.mjs'],
  },
  {
    id: 'freshness',
    why: 'nothing has quietly gone stale',
    cmd: 'node',
    args: ['scripts/check-freshness.mjs'],
  },
  {
    id: 'promises',
    why: 'every claim is owned, researched, tracked',
    cmd: 'node',
    args: ['scripts/check-promises.mjs'],
  },
  {
    id: 'boundaries',
    why: 'the app cannot route around RLS',
    cmd: 'node',
    args: ['scripts/check-boundaries.mjs'],
  },
  {
    id: 'schema',
    why: 'every tenant table is protected',
    cmd: 'node',
    args: ['scripts/check-schema-guard.mjs'],
    needsDb: true,
  },
  {
    id: 'policy',
    why: 'the database enforces isolation',
    cmd: 'node',
    args: ['scripts/check-policies.mjs'],
    needsDb: true,
  },
  // One gate for every committed-and-derived artifact: the access matrix and the database types.
  // Kept as one because it is one promise -- nothing derived is stale -- and SPEC-003 sets nine gates
  // as a ceiling, not a floor.
  {
    id: 'generated',
    why: 'no committed generated artifact is stale',
    cmd: 'node',
    args: ['scripts/check-generated.mjs', '--check'],
    needsDb: true,
  },
];

/** Exit codes are a contract: 0 all green · 1 a gate failed · 2 the run could not be performed. */
export const EXIT = { OK: 0, FAILED: 1, CANNOT_RUN: 2, DEGRADED: 3 };

/**
 * A database-backed gate is never skipped when the database is absent — it aborts the whole run.
 * Skipping would turn `check` into a command that reports green while proving nothing, which is the
 * exact defect F-13 was.
 */
export function decideRun(steps, { dbAvailable }) {
  const needsDb = steps.some((s) => s.needsDb);
  if (needsDb && !dbAvailable) {
    return { proceed: false, exit: EXIT.CANNOT_RUN, reason: 'database-unavailable' };
  }
  return { proceed: true, steps };
}

/** Every step runs; failures are collected, never short-circuited. */
/**
 * A step that exits 3 RAN, and skipped a rule while doing it. Rendering that as `✓` is how a
 * guarantee quietly becomes optional: the warning goes to stderr inside a thirteen-step run and the
 * summary — the only line most people read — says everything is fine.
 *
 * @param {Array<{id: string, why: string, ms: number, status: number}>} results
 * @param {{strict?: boolean}} [opts] CI passes strict, because CI has a network.
 */
export function summarize(results, { strict = false } = {}) {
  const failed = results.filter((r) => r.status !== EXIT.OK && r.status !== EXIT.DEGRADED);
  const degraded = results.filter((r) => r.status === EXIT.DEGRADED);
  const pad = Math.max(0, ...results.map((r) => r.id.length));
  const mark = (r) => (r.status === EXIT.OK ? '✓' : r.status === EXIT.DEGRADED ? '~' : '✗');
  // `ok` means nothing failed AND nothing was skipped, so the summary cannot say "all green" over a
  // rule that did not run. `exit` is the process contract, and it stays 0 for a degradation unless
  // --strict: a laptop on a hotel network must still be able to run the suite.
  return {
    ok: failed.length === 0 && degraded.length === 0,
    failed: failed.map((f) => f.id),
    degraded: degraded.map((d) => d.id),
    exit: failed.length > 0 || (strict && degraded.length > 0) ? EXIT.FAILED : EXIT.OK,
    lines: results.map(
      (r) => `  ${mark(r)} ${r.id.padEnd(pad)}  ${(r.ms / 1000).toFixed(1)}s  ${r.why}`,
    ),
  };
}

/**
 * System tools the gates shell out to. They are not npm packages, so nothing else declares them, and
 * their absence otherwise surfaces as an ENOENT stack trace three layers down.
 */
export const REQUIRED_BINARIES = [
  {
    bin: 'psql',
    why: 'the gates query the database directly',
    install: 'brew install libpq && brew link --force libpq',
  },
  {
    bin: 'supabase',
    why: 'runs the local stack and the pgTAP suite',
    install: 'brew install supabase/tap/supabase',
  },
];

/** Pure. Exported so "we name a missing prerequisite" is a tested claim, not a README promise. */
export function missingBinaries(required, has) {
  return required.filter((r) => !has(r.bin));
}

/**
 * Ask the database directly rather than asking the CLI whether the database is up.
 * `supabase status` reports on the whole stack and was observed returning non-zero while the
 * database was in fact reachable — a false negative on the most important command in the repo.
 * A connection either opens or it does not, and that is the only thing these gates need.
 */
function databaseReachable(
  url = process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres',
) {
  return spawnSync('psql', [url, '-tAc', 'select 1'], { encoding: 'utf8' }).status === 0;
}

function main() {
  /**
   * Probe by running the binary, not by asking a shell. `spawnSync(..., { shell: true })` concatenates
   * arguments into a command string unescaped — Node warns about it, and it is a real injection seam
   * even when today's inputs are constants.
   */
  const has = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).error?.code !== 'ENOENT';
  const missing = missingBinaries(REQUIRED_BINARIES, has);
  if (missing.length) {
    console.error('\n  Missing prerequisites:\n');
    for (const m of missing) console.error(`    ${m.bin}  — ${m.why}\n      ${m.install}\n`);
    process.exit(EXIT.CANNOT_RUN);
  }

  const dbAvailable = databaseReachable();
  const decision = decideRun(STEPS, { dbAvailable });

  if (!decision.proceed) {
    console.error('\n  The local database is not running. Start it with:  supabase start');
    console.error('  Database-backed gates are not skipped when it is absent — that would make');
    console.error('  `check` a command that reports green while proving nothing.\n');
    process.exit(decision.exit);
  }

  const results = [];
  for (const step of decision.steps) {
    process.stdout.write(`\n──── ${step.id} · ${step.why}\n`);
    const t0 = Date.now();
    const r = spawnSync(step.cmd, step.args, { stdio: 'inherit' });
    results.push({
      ...step,
      status: r.status ?? EXIT.FAILED,
      ok: r.status === 0,
      ms: Date.now() - t0,
    });
  }

  const { ok, failed, degraded, exit, lines } = summarize(results, {
    strict: process.argv.includes('--strict'),
  });
  console.log('\n════ summary ════');
  for (const line of lines) console.log(line);
  const note = degraded.length
    ? `  ${degraded.length} degraded: ${degraded.join(', ')} — a rule did not run. ` +
      `Re-run with --strict to treat that as failure.\n`
    : '';
  console.log(
    failed.length
      ? `\n  ${failed.length} failed: ${failed.join(', ')}\n${note}`
      : ok
        ? `\n  all ${results.length} green\n`
        : `\n${note}`,
  );
  process.exit(exit);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
