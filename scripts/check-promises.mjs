#!/usr/bin/env node
/**
 * SPEC-003 REQ-6 + REQ-7 + REQ-9 — the paper trail is honest.
 *
 * One promise: **every commitment in this repository is tracked, and none has quietly expired.**
 *
 *   · every acceptance bar in PRODUCT.md has an owning spec, and that spec exists
 *   · every deferral has a real reason and a machine-evaluable trigger, and none has fired
 *   · every code marker names a deferral that exists
 *   · every finding of the external review is implemented, refuted or deferred
 *
 * The review rule lives here rather than in a twelfth gate on purpose. SPEC-003 makes the gate count
 * a ceiling, the review's own advice was not to add one, and an accepted external finding is a
 * commitment — which is precisely what this gate already exists to keep honest.
 *
 * The bar rule exists because of a measured failure. Bar B-3 promised "nothing more than one major
 * behind, and staleness fails the build" while no freshness gate existed at all — an unbacked claim
 * sitting in the product definition for a week, and nothing in the repository noticed. **This is the
 * gate that would have.**
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkRegister, parseDispositions, parseFindings, summarize } from './review-register.mjs';

/**
 * Pull `B-n` ids out of the PRODUCT.md acceptance-bar table. Exported for tests.
 * @param {string} markdown
 * @returns {Array<{ id: string, claim: string }>}
 */
export function parseBars(markdown) {
  return [...markdown.matchAll(/^\|\s*(B-\d+)\s*\|\s*(.+?)\s*\|/gm)].map(([, id, claim]) => ({
    id,
    claim: claim.replace(/\*/g, '').trim(),
  }));
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
    map[m[1]] = m[2]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^SPEC-\d+$/.test(s));
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
          `with nothing accountable for it. This is exactly how B-3 became an unbacked claim.`,
      );
      continue;
    }
    for (const owner of owners) {
      if (!isRegistered(owner)) {
        problems.push(
          `${bar.id} names ${owner}, which is not in the spec index — a dangling reference reads as coverage`,
        );
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

  if (bars.length === 0)
    problems.push('no acceptance bars found in PRODUCT.md — the table moved or broke');

  if (problems.length) {
    console.error('promises: FAILED\n');
    for (const p of problems) console.error(`  [bar]  ${p}`);
    process.exit(1);
  }
  console.log(
    `promises: ${bars.length} bars, all owned` +
      (pending.length ? ` (${pending.length} resting on specs not yet authored)` : ''),
  );
  for (const p of pending) console.log(`  · ${p}`);

  // An accepted external finding is a commitment like any other.
  const AUDIT = 'docs/review/01-AUDIT.md';
  const REGISTER = 'docs/review/DISPOSITIONS.md';
  if (existsSync(AUDIT)) {
    if (!existsSync(REGISTER)) {
      console.error(`promises: FAILED\n\n  [review] ${AUDIT} exists and ${REGISTER} does not.`);
      console.error('  A review nobody answered is a review nobody finished reading.');
      process.exit(1);
    }
    const findings = parseFindings(readFileSync(AUDIT, 'utf8'));
    const rows = parseDispositions(readFileSync(REGISTER, 'utf8'));
    const registry = readFileSync('spec/DEFERRAL_REGISTRY.md', 'utf8');
    const reviewProblems = checkRegister(findings, rows, {
      exists: (p) => existsSync(p),
      openDefs: registry.split(/^## Closed/m)[0].match(/DEF-\d+/g) ?? [],
      allDefs: registry.match(/DEF-\d+/g) ?? [],
    });
    if (reviewProblems.length) {
      console.error('promises: FAILED\n');
      for (const p of reviewProblems) console.error(`  [review] ${p}`);
      process.exit(1);
    }
    const r = summarize(findings, rows);
    console.log(
      `  · review: ${r.implemented} implemented, ${r.refuted} refuted, ${r.deferred} deferred ` +
        `of ${r.total} — ${r.closed ? 'CLOSED' : `OPEN (${r.open.join(', ')})`}`,
    );
  }

  // The other two halves of the same promise, each with its own tests.
  for (const script of [
    'scripts/check-deferrals.mjs',
    'scripts/check-research.mjs',
    'scripts/check-contracts.mjs',
    'scripts/check-content.mjs',
    'scripts/status.mjs',
  ]) {
    const r = spawnSync('node', [script, ...(script.endsWith('status.mjs') ? ['--check'] : [])], {
      stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
