#!/usr/bin/env node
/**
 * SPEC-003 REQ-6 + REQ-7 + REQ-9 — the paper trail is honest.
 *
 * One promise: **every commitment in this repository is tracked, and none has quietly expired.**
 *
 *   · every acceptance bar in PRODUCT.md has an owning spec, and that spec exists
 *   · every deferral has a real reason and a machine-evaluable trigger, and none has fired
 *   · every code marker names a deferral that exists
 *
 * The bar rule exists because of a measured failure. Bar B-3 promised "nothing more than one major
 * behind, and staleness fails the build" while no freshness gate existed at all — an unbacked claim
 * sitting in the product definition for a week, and nothing in the repository noticed. **This is the
 * gate that would have.**
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Pull `B-n` ids out of the PRODUCT.md acceptance-bar table. Exported for tests.
 * @param {string} markdown
 * @returns {Array<{ id: string, claim: string }>}
 */
export function parseBars(markdown) {
  return [...markdown.matchAll(/^\|\s*(B-\d+)\s*\|\s*(.+?)\s*\|/gm)]
    .map(([, id, claim]) => ({ id, claim: claim.replace(/\*/g, '').trim() }));
}

/**
 * Pull the `B-n → SPEC-nnn` mapping out of the spec index's coverage TABLE.
 *
 * It is a table on purpose: the first version of this parsed a prose sentence, and it broke on a
 * line wrap and on bare spec numbers. A gate that reads prose reports defects that are its own.
 * Exported for tests.
 *
 * @param {string} markdown
 * @returns {Record<string, string[]>}
 */
export function parseCoverage(markdown) {
  /** @type {Record<string, string[]>} */
  const map = {};
  for (const m of markdown.matchAll(/^\|\s*(B-\d+)\s*\|\s*([^|]+?)\s*\|/gm)) {
    map[m[1]] = m[2].split(',').map((s) => s.trim()).filter((s) => /^SPEC-\d+$/.test(s));
  }
  return map;
}

/**
 * Pure. Three distinct states, and conflating them is what makes this kind of gate useless:
 *
 *   · **no owner** → FAIL. An unbacked promise, which is precisely what B-3 was.
 *   · owner **registered but unwritten** → fine, and counted. Honest planning: the index lists it
 *     as `planned`, so the commitment is tracked even though the spec is not authored.
 *   · owner **not in the index at all** → FAIL. A dangling reference is worse than no reference,
 *     because it reads as coverage.
 *
 * @returns {{ problems: string[], pending: string[] }}
 */
export function checkBarCoverage(bars, coverage, { isRegistered, isAuthored }) {
  /** @type {string[]} */ const problems = [];
  /** @type {string[]} */ const pending = [];
  for (const bar of bars) {
    const owners = coverage[bar.id];
    if (!owners || owners.length === 0) {
      problems.push(
        `${bar.id} has no owning spec — "${bar.claim.slice(0, 60)}…" is a promise in PRODUCT.md ` +
        `with nothing accountable for it. This is exactly how B-3 became an unbacked claim.`
      );
      continue;
    }
    for (const owner of owners) {
      if (!isRegistered(owner)) {
        problems.push(`${bar.id} names ${owner}, which is not in the spec index — a dangling reference reads as coverage`);
      } else if (!isAuthored(owner)) {
        pending.push(`${bar.id} → ${owner} (registered, not yet authored)`);
      }
    }
  }
  return { problems, pending };
}

function main() {
  const bars = parseBars(readFileSync('docs/PRODUCT.md', 'utf8'));
  const coverage = parseCoverage(readFileSync('spec/README.md', 'utf8'));
  const index = readFileSync('spec/README.md', 'utf8');
  const specFiles = readdirSync('spec');
  const { problems, pending } = checkBarCoverage(bars, coverage, {
    isRegistered: (id) => new RegExp(`\\|\\s*\\*{0,2}${id}\\*{0,2}\\s*\\|`).test(index),
    isAuthored: (id) => specFiles.some((f) => f.startsWith(id)),
  });

  if (bars.length === 0) problems.push('no acceptance bars found in PRODUCT.md — the table moved or broke');

  if (problems.length) {
    console.error('promises: FAILED\n');
    for (const p of problems) console.error(`  [bar]  ${p}`);
    process.exit(1);
  }
  console.log(`promises: ${bars.length} bars, all owned` +
    (pending.length ? ` (${pending.length} resting on specs not yet authored)` : ''));
  for (const p of pending) console.log(`  · ${p}`);

  // The deferral rules are a separate script with its own tests; run it as the second half.
  const def = spawnSync('node', ['scripts/check-deferrals.mjs'], { stdio: 'inherit' });
  process.exit(def.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
