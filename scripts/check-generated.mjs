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

/**
 * Pure: is the committed artifact current? Exported so the rule carries a mutation proof rather
 * than being trapped inside an I/O routine.
 * @param {string} committed @param {string} generated @param {string} path
 * @returns {string[]}
 */
export function compareGenerated(committed, generated, path = TYPES) {
  if (committed === generated) return [];
  return [
    `${path} is STALE — the schema has changed since it was generated.\n` +
      `    A stale type does not fail to compile; it compiles and is wrong at runtime.\n` +
      `    Regenerate and read the diff:  npm run generate`,
  ];
}

function main() {
  const check = process.argv.includes('--check');
  const problems = [];

  // ── 1 · database types ───────────────────────────────────────────────────────
  let generated;
  try {
    generated = execFileSync('supabase', ['gen', 'types', 'typescript', '--local'], {
      encoding: 'utf8',
    });
  } catch (err) {
    // Say what actually happened. `supabase gen types --local` runs postgres-meta in a container it
    // pulls on demand, and public.ecr.aws rate-limits that: two CI runs on 2026-09-08 died with
    // `toomanyrequests: Rate exceeded` and were reported here as "could not reach the database",
    // which sent the reader to check a stack that was running perfectly. A gate that names the wrong
    // cause costs more than one that says nothing (SPEC-002 REQ-8: a failing proof is legible).
    const detail = String(err?.stderr ?? err?.message ?? '').trim();
    if (/toomanyrequests|rate exceeded|pull access denied|manifest unknown/i.test(detail)) {
      console.error('generated: the container registry refused the image pull — this is not your');
      console.error('  database, and not your schema. Retry, or pre-pull the image.\n');
    } else {
      console.error(
        'generated: could not reach the database. Is the local stack running? `supabase start`\n',
      );
    }
    for (const line of detail.split('\n').slice(-4)) if (line) console.error(`  ${line}`);
    process.exit(2);
  }

  if (!check) {
    writeFileSync(TYPES, generated);
    console.log(`generated: wrote ${TYPES}`);
  } else {
    const committed = existsSync(TYPES) ? readFileSync(TYPES, 'utf8') : '';
    problems.push(...compareGenerated(committed, generated));
  }

  // ── 2 · access matrix ────────────────────────────────────────────────────────
  const matrix = spawnSync('node', ['scripts/access-matrix.mjs', ...(check ? ['--check'] : [])], {
    stdio: check ? ['ignore', 'ignore', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (matrix.status !== 0) {
    problems.push((matrix.stderr ?? 'docs/ACCESS-MATRIX.md is stale').trim());
  }

  // ── 3 · battlecard ───────────────────────────────────────────────────────────
  // The competitive document is derived from the specs it describes, so it cannot quietly describe
  // a product that has moved on. The argument in it is hand-written; the status, the criteria counts
  // and every evidence link are not.
  const battlecard = spawnSync('node', ['scripts/battlecard.mjs', ...(check ? ['--check'] : [])], {
    stdio: check ? ['ignore', 'ignore', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (battlecard.status !== 0) {
    problems.push((battlecard.stderr ?? 'docs/content/BATTLECARD.md is stale').trim());
  }

  if (!problems.length) {
    console.log(
      check
        ? 'generated: ok — types, access matrix and battlecard are all current'
        : 'generated: done',
    );
    process.exit(0);
  }
  console.error('generated: FAILED\n');
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
