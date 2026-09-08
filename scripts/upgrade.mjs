#!/usr/bin/env node
/**
 * The documented upgrade path, as a script so the documentation and the CI job cannot drift apart.
 *
 * It does one thing and says what it did not do. There are deliberately **no codemods** — no breaking
 * product-API change has happened yet, so one written now would be written against an imagined change
 * — and deliberately **no conflict resolution**: this never edits a file the buyer owns, so there is
 * nothing to conflict.
 *
 * Measured behaviour it exists to encode (F-45): `supabase migration up` REFUSES a new upstream
 * migration whose version sorts before the buyer's last applied one, which is the ordinary case,
 * because the buyer kept working after they cloned. `--include-all` is required and is not a
 * workaround — it is the correct instruction for an append-only schema.
 */
import { execFileSync } from 'node:child_process';

/**
 * The ownership boundary from `research/10-UPGRADE-PATH.md`, as code rather than prose.
 *
 * UPSTREAM owns the security surface and the proof apparatus: a buyer has no product reason to edit
 * them, and a fix that lands there must be able to arrive wholesale.
 *
 * The buyer owns everything else, and an upgrade must never touch it. That is not politeness — it is
 * the only reason this path can be run unattended. The moment an upgrade edits `src/`, it inherits
 * every failure mode Supastarter documents: "with every change you make to your application, it will
 * become harder to update your code base."
 */
export const UPSTREAM_OWNED = [
  'supabase/migrations/',
  'supabase/tests/intent/',
  'scripts/',
  'spec/',
  'docs/adr/',
];

/**
 * Generated artifacts belong to NEITHER side, and this is the case the field's answers miss.
 *
 * `database.types.ts` and the access matrix are functions of the BUYER's schema. Measured after the
 * experiment's upgrade: upstream's committed types carry `organization_invitation` and not the
 * buyer's `customer_note`; the buyer's carry neither. Shipping upstream's copy would overwrite the
 * buyer's schema knowledge with a stranger's. They are regenerated locally, never delivered.
 */
export const REGENERATE_NEVER_SHIP = ['src/lib/db/database.types.ts', 'docs/ACCESS-MATRIX.md'];

/**
 * Which of a release's changed paths an upgrade may take, and which it must leave.
 *
 * Pure so it can carry a mutation proof: the rule that an upgrade never touches `src/` is the whole
 * safety property here, and a rule nobody can prove is a comment.
 *
 * @param {string[]} changedPaths paths changed between the buyer's tag and the release
 * @returns {{take: string[], leave: string[], regenerate: string[]}}
 */
export function planUpgrade(changedPaths) {
  const take = [],
    leave = [],
    regenerate = [];
  for (const path of changedPaths) {
    if (REGENERATE_NEVER_SHIP.includes(path)) regenerate.push(path);
    else if (UPSTREAM_OWNED.some((prefix) => path.startsWith(prefix))) take.push(path);
    else leave.push(path);
  }
  return { take, leave, regenerate };
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function main() {
  const [release = 'upstream/main', cwd = process.cwd()] = process.argv.slice(2);

  const changed = run('git', ['diff', '--name-only', 'HEAD', release], cwd)
    .trim()
    .split('\n')
    .filter(Boolean);
  const { take, leave, regenerate } = planUpgrade(changed);

  if (take.length) run('git', ['checkout', release, '--', ...take], cwd);

  console.log(`upgrade: took ${take.length} upstream-owned file(s) from ${release}`);
  console.log(
    'upgrade: applying migrations with --include-all (see F-45: out-of-order is expected)',
  );
  run('npx', ['supabase', 'migration', 'up', '--include-all'], cwd);

  // Said out loud, every time. An upgrade that reports only what it did reads like a complete one.
  if (leave.length) {
    console.log(`upgrade: LEFT ${leave.length} file(s) alone — they are yours:`);
    for (const p of leave.slice(0, 10)) console.log(`  ${p}`);
    if (leave.length > 10) console.log(`  … and ${leave.length - 10} more`);
    console.log('  If a release note says one of these changed, that change is yours to make.');
  }
  if (regenerate.length) {
    console.log('upgrade: REGENERATE these — they describe YOUR schema, not ours:');
    for (const p of regenerate) console.log(`  ${p}`);
    console.log('  npm run generate');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
