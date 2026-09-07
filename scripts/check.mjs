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
  { id: 'typegen',   why: 'route types are generated',              cmd: 'npx',  args: ['next', 'typegen'] },
  { id: 'typecheck', why: 'types are sound',                        cmd: 'npx',  args: ['tsc', '--noEmit'] },
  { id: 'lint',      why: 'no lint regressions',                    cmd: 'npx',  args: ['eslint', '.', '--max-warnings', '0'] },
  // No --passWithNoTests: a suite that passes with zero tests is a check that cannot fail (F-13).
  { id: 'unit',      why: 'pure logic is correct',                  cmd: 'npx',  args: ['vitest', 'run'] },
  { id: 'locale',    why: 'translations are complete and all used',  cmd: 'node', args: ['scripts/check-locale.mjs'] },
  { id: 'unused',    why: 'no dead code or unused dependencies',   cmd: 'npx', args: ['knip'] },
  { id: 'deferrals', why: 'debt is logged and no trigger has fired', cmd: 'node', args: ['scripts/check-deferrals.mjs'] },
  { id: 'policy',    why: 'the database enforces isolation',        cmd: 'node', args: ['scripts/check-policies.mjs'], needsDb: true },
  { id: 'matrix',    why: 'the published access matrix is current', cmd: 'node', args: ['scripts/access-matrix.mjs', '--check'], needsDb: true },
];

/** Exit codes are a contract: 0 all green · 1 a gate failed · 2 the run could not be performed. */
export const EXIT = { OK: 0, FAILED: 1, CANNOT_RUN: 2 };

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
export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  const pad = Math.max(0, ...results.map((r) => r.id.length));
  return {
    ok: failed.length === 0,
    failed: failed.map((f) => f.id),
    exit: failed.length === 0 ? EXIT.OK : EXIT.FAILED,
    lines: results.map((r) => `  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(pad)}  ${(r.ms / 1000).toFixed(1)}s  ${r.why}`),
  };
}

/**
 * System tools the gates shell out to. They are not npm packages, so nothing else declares them, and
 * their absence otherwise surfaces as an ENOENT stack trace three layers down.
 */
export const REQUIRED_BINARIES = [
  { bin: 'psql', why: 'the gates query the database directly', install: 'brew install libpq && brew link --force libpq' },
  { bin: 'supabase', why: 'runs the local stack and the pgTAP suite', install: 'brew install supabase/tap/supabase' },
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
function databaseReachable(url = process.env.KEEL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres') {
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
    results.push({ ...step, ok: r.status === 0, ms: Date.now() - t0 });
  }

  const { ok, failed, exit, lines } = summarize(results);
  console.log('\n════ summary ════');
  for (const line of lines) console.log(line);
  console.log(ok ? `\n  all ${results.length} green\n` : `\n  ${failed.length} failed: ${failed.join(', ')}\n`);
  process.exit(exit);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
