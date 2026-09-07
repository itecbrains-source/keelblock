#!/usr/bin/env node
/**
 * Generated artifacts are current — one gate, one promise: **nothing committed and derived is stale.**
 *
 * Two artifacts, same failure mode. A stale access matrix means the published claim describes
 * permissions the database no longer has. Stale database types mean `row.name` compiles and is
 * `undefined` at runtime, in production, with no warning anywhere — the compiler was reading a
 * description of a schema that has moved.
 *
 * Both are regenerated here and compared. A difference is not fixed silently: it is shown, because
 * the diff is the reviewable event (a new permission, a dropped column) and swallowing it would make
 * this gate a formatter.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const TYPES = 'src/lib/db/database.types.ts';
const check = process.argv.includes('--check');
const problems = [];

// ── 1 · database types ───────────────────────────────────────────────────────
let generated;
try {
  generated = execFileSync('supabase', ['gen', 'types', 'typescript', '--local'], { encoding: 'utf8' });
} catch {
  console.error('generated: could not reach the database. Is the local stack running? `supabase start`');
  process.exit(2);
}

if (!check) {
  writeFileSync(TYPES, generated);
  console.log(`generated: wrote ${TYPES}`);
} else {
  const committed = existsSync(TYPES) ? readFileSync(TYPES, 'utf8') : '';
  if (committed !== generated) {
    problems.push(
      `${TYPES} is STALE — the schema has changed since it was generated.\n` +
      `    A stale type does not fail to compile; it compiles and is wrong at runtime.\n` +
      `    Regenerate and read the diff:  npm run generate`
    );
  }
}

// ── 2 · access matrix ────────────────────────────────────────────────────────
const matrix = spawnSync('node', ['scripts/access-matrix.mjs', ...(check ? ['--check'] : [])],
  { stdio: check ? ['ignore', 'ignore', 'pipe'] : 'inherit', encoding: 'utf8' });
if (matrix.status !== 0) {
  problems.push((matrix.stderr ?? 'docs/ACCESS-MATRIX.md is stale').trim());
}

if (!problems.length) {
  console.log(check ? 'generated: ok — types and access matrix are both current' : 'generated: done');
  process.exit(0);
}
console.error('generated: FAILED\n');
for (const p of problems) console.error(`  ${p}\n`);
process.exit(1);
