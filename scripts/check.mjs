#!/usr/bin/env node
/**
 * `npm run check` — SPEC-003 REQ-8.
 *
 * Runs every gate and test layer, and **reports all failures rather than stopping at the first**.
 * A developer who has to run six commands runs four; a checker that stops at the first failure
 * makes you run it six times.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  // Next generates route types (LayoutProps, PageProps) into .next/types. Without this, typecheck
  // fails on a clean checkout -- a gate that cannot pass on a fresh clone is a broken gate.
  { id: 'typegen',   why: 'route types are generated',    cmd: 'npx', args: ['next', 'typegen'] },
  { id: 'typecheck', why: 'types are sound',              cmd: 'npx', args: ['tsc', '--noEmit'] },
  { id: 'lint',      why: 'no lint regressions',          cmd: 'npx', args: ['eslint', '.', '--max-warnings', '0'] },
  { id: 'unit',      why: 'pure logic is correct',        cmd: 'npx', args: ['vitest', 'run', '--passWithNoTests'] },
  { id: 'policy',    why: 'the database enforces isolation', cmd: 'node', args: ['scripts/check-policies.mjs'], needsDb: true },
  { id: 'matrix',    why: 'the published access matrix is current', cmd: 'node', args: ['scripts/access-matrix.mjs', '--check'], needsDb: true },
];

const dbUp = () => {
  const r = spawnSync('npx', ['--no-install', 'supabase', 'status'], { encoding: 'utf8' });
  return r.status === 0;
};

const dbAvailable = steps.some((s) => s.needsDb) ? dbUp() : true;
if (!dbAvailable) {
  console.error('\n  The local database is not running. Start it with:  supabase start');
  console.error('  Database-backed gates cannot be skipped silently — that would make `check` a');
  console.error('  check that cannot fail.\n');
  process.exit(2);
}

const results = [];
for (const step of steps) {
  process.stdout.write(`\n──── ${step.id} · ${step.why}\n`);
  const t0 = Date.now();
  const r = spawnSync(step.cmd, step.args, { stdio: 'inherit' });
  results.push({ ...step, ok: r.status === 0, ms: Date.now() - t0 });
}

const pad = Math.max(...results.map((r) => r.id.length));
console.log('\n════ summary ════');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(pad)}  ${(r.ms / 1000).toFixed(1)}s  ${r.why}`);
}
const failed = results.filter((r) => !r.ok);
if (failed.length === 0) {
  console.log(`\n  all ${results.length} green\n`);
  process.exit(0);
}
console.log(`\n  ${failed.length} failed: ${failed.map((f) => f.id).join(', ')}\n`);
process.exit(1);
