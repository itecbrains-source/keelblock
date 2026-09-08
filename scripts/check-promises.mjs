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
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checkRegister, parseDispositions, parseFindings, summarize } from './review-register.mjs';
import {
  checkRecords,
  checkScoreClaims,
  isRecordFile,
  parseRecord,
  summarizeRecords,
} from './review-records.mjs';

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

/**
 * Every markdown document in the repository. Rule 5 needs all of them: a superseded score is most
 * dangerous exactly where nobody is looking for it.
 */
function allDocs() {
  const out = {};
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (p.includes('node_modules') || p.includes('.venv') || p.includes('.next')) continue;
      if (statSync(p).isDirectory()) visit(p);
      else if (p.endsWith('.md')) out[p] = readFileSync(p, 'utf8');
    }
  };
  for (const d of ['docs', 'spec', 'research']) if (existsSync(d)) visit(d);
  for (const f of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md'])
    if (existsSync(f)) out[f] = readFileSync(f, 'utf8');
  return out;
}

function main() {
  const bars = parseBars(readFileSync('docs/PRODUCT.md', 'utf8'));
  const coverage = parseCoverage(readFileSync('spec/README.md', 'utf8'));
  const index = readFileSync('spec/README.md', 'utf8');
  const specFiles = readdirSync('spec');
  const { problems, pending } = checkBarCoverage(bars, coverage, {
    // A row of the SPEC INDEX table, not "appears anywhere in the file".
    //
    // The previous version asked whether `| SPEC-nnn |` occurred in spec/README.md at all — and the
    // COVERAGE row doing the naming satisfies that, so the check was circular. Measured: pointing
    // B-3 at SPEC-999, which has never existed, produced
    // `B-3 → SPEC-999 (registered, not yet authored)` and a green gate. The rule's own comment says
    // a dangling reference "is worse than no reference, because it reads as coverage", and that is
    // precisely what it could not detect.
    //
    // Index rows carry id · title · bars · ADRs · status; coverage rows carry bar · owners. Counting
    // the cells tells them apart, and reads the structure rather than the text.
    isRegistered: (id) =>
      index.split('\n').some((line) => {
        const cells = line.split('|').map((c) => c.replace(/\*/g, '').trim());
        return cells.length >= 6 && cells[1] === id;
      }),
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

    // Review records are frozen dated claims. What keeps them from rotting is not editing them --
    // it is that the CURRENT one is computed, and that a superseded score cannot be quoted as live.
    const REVIEW_DIR = 'docs/review';
    const records = readdirSync(REVIEW_DIR)
      .filter(isRecordFile)
      .sort()
      .map(
        (f) =>
          // A record with no header still has a NAME, and the message is useless without it.
          parseRecord(`${REVIEW_DIR}/${f}`, readFileSync(`${REVIEW_DIR}/${f}`, 'utf8')) ?? {
            file: `${REVIEW_DIR}/${f}`,
          },
      );

    const git = (args) => spawnSync('git', args, { encoding: 'utf8' });
    const recordProblems = checkRecords(records, {
      commitExists: (sha) => git(['cat-file', '-e', `${sha}^{commit}`]).status === 0,
      isAncestor: (a, b) => git(['merge-base', '--is-ancestor', a, b]).status === 0,
      // CI's checkout fetches one commit, so every older sha is absent and the rule would report
      // eight fabricated records — which is what it did on run 34261942642. The distinction is the
      // whole point: a truncated history and an invented sha look identical to `cat-file`.
      shallow: git(['rev-parse', '--is-shallow-repository']).stdout?.trim() === 'true',
    });

    // Rule 5 scans every document EXCEPT the records themselves: inside a dated record any score may
    // be discussed, because the record says which commit it is about. Everywhere else it is live.
    const current = summarizeRecords(records, {}).score;
    const elsewhere = {};
    for (const [path, text] of Object.entries(allDocs())) {
      if (path.startsWith(`${REVIEW_DIR}/`) && isRecordFile(path.slice(REVIEW_DIR.length + 1)))
        continue;
      elsewhere[path] = text;
    }
    recordProblems.push(...checkScoreClaims(elsewhere, current));

    if (recordProblems.length) {
      console.error('promises: FAILED\n');
      for (const p of recordProblems) console.error(`  [review] ${p}`);
      process.exit(1);
    }
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
