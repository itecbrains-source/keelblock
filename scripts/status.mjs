#!/usr/bin/env node
/**
 * `npm run status` — the project's current state, **computed, never written down.**
 *
 * The failure this exists to prevent is the most expensive one in a long-running project: a session
 * reads a status document, believes it, and rebuilds something that shipped three weeks ago — or
 * re-derives a decision that was already made and recorded. Every hand-maintained status page
 * becomes that document, because nothing updates it when reality moves.
 *
 * So the rule is: **durable claims are written down; volatile state is computed.** A decision, a
 * measurement, a rejected option — those are durable, and they belong in a file. A count, a status,
 * a "what's left" — those are volatile, and asking a file for them is how a project starts lying to
 * itself.
 *
 * `checkCountClaims` is the enforcement half: any document asserting a countable fact is checked
 * against the real count, so prose cannot drift from the repository.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseDispositions,
  parseFindings,
  summarize as summarizeReview,
} from './review-register.mjs';

/** Everything countable, computed from the repository. Exported for tests. */
export function census(fs = { readFileSync, readdirSync, existsSync }) {
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  const specFiles = fs.readdirSync('spec').filter((f) => /^SPEC-\d+/.test(f));
  const specs = specFiles.map((f) => {
    const t = fs.readFileSync(`spec/${f}`, 'utf8');
    return {
      id: f.slice(0, 8),
      status: (t.match(/^> Status: `(\w+)`/m) ?? [, '?'])[1],
      reqs: (t.match(/^### REQ-/gm) ?? []).length,
      acs: [
        ...t.matchAll(/^\|\s*AC-[\w.]+\s*\|[^|]*\|[^|]*\|[^|]*\|\s*\*{0,2}([\w ]+?)\*{0,2}\s*\|/gm),
      ].map((m) => m[1].trim()),
    };
  });
  const registry = read('spec/DEFERRAL_REGISTRY.md');
  const openDefs = (registry.split(/^## Closed/m)[0].match(/^\| DEF-\d+/gm) ?? []).length;
  const closedDefs = ((registry.split(/^## Closed/m)[1] ?? '').match(/^\| DEF-\d+/gm) ?? []).length;

  return {
    findings: (read('docs/FINDINGS.md').match(/^## F-\d+/gm) ?? []).length,
    gates: fs.readdirSync('scripts').filter((f) => f.startsWith('check-') && f.endsWith('.mjs'))
      .length,
    specs,
    adrs: fs.readdirSync('docs/adr').filter((f) => f.endsWith('.md')).length,
    memos: fs.readdirSync('research').filter((f) => f.endsWith('.md')).length,
    sources: JSON.parse(read('research/corpus.json') || '{"sources":[]}').sources.length,
    // The scope list is written inline as "1. … · 2. … · 19. …", so the markers are the count.
    scopeAreas: (
      (read('docs/PRODUCT.md').split(/^## Scope/m)[1] ?? '')
        .split(/^## /m)[0]
        .match(/(?:^|·\s*)(\d+)\.\s/gm) ?? []
    ).length,
    bars: (read('docs/PRODUCT.md').match(/^\| B-\d+/gm) ?? []).length,
    review: reviewState(),
    openDefs,
    closedDefs,
  };
}

/**
 * The external review's state, computed. Nothing writes it down, because a "CLOSED" banner is the
 * kind of sentence this command exists to stop people writing.
 */
function reviewState() {
  const audit = 'docs/review/01-AUDIT.md';
  const register = 'docs/review/DISPOSITIONS.md';
  if (!existsSync(audit) || !existsSync(register)) return null;
  return summarizeReview(
    parseFindings(readFileSync(audit, 'utf8')),
    parseDispositions(readFileSync(register, 'utf8')),
  );
}

/** The nouns whose counts appear in prose, and how each is measured. Exported for tests. */
export const COUNTABLE = {
  findings: (c) => c.findings,
  gates: (c) => c.gates,
  ADRs: (c) => c.adrs,
  decisions: (c) => c.adrs,
  areas: (c) => c.scopeAreas,
  'acceptance bars': (c) => c.bars,
  'research memos': (c) => c.memos,
  'primary sources': (c) => c.sources,
};

/**
 * Spelled-out numerals, because this repository spells them.
 *
 * The rule used to be digits-only, and said so: "a spelled-out number is almost always prose about
 * the concept, not a claim about the count." That is an empirical claim about how humans write, and
 * in THIS repository it was false — every stale count in it was spelled out, including the one in
 * AGENTS.md that told a coding agent the decision record held eleven ADRs when it held fourteen.
 * A gate whose justification is an assumption about the text should be tested against the text.
 */
const NUMERALS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};

/** @param {string} token @returns {number} */
export const numberOf = (token) =>
  /^\d+$/.test(token) ? Number(token) : NUMERALS[token.toLowerCase()];

/**
 * Verify every count asserted in prose against the real one.
 * @param {Record<string, string>} docs @param {ReturnType<typeof census>} c @returns {string[]}
 */
/**
 * An inline code span is a QUOTATION or a literal, not a claim the document is making — which is
 * what lets a finding about a stale count quote the stale count. Fenced blocks are deliberately NOT
 * exempt: the worst instance of this defect was a fenced transcript in README.md showing the output
 * of `npm run check`, and a reader acts on a transcript exactly as on a sentence.
 * @param {string} text
 */
export const claimsIn = (text) =>
  text
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/`[^`\n]*`/g, ' ')))
    .join('');

export function checkCountClaims(docs, c) {
  const problems = [];
  for (const [file, raw] of Object.entries(docs)) {
    const text = claimsIn(raw);
    for (const [noun, measure] of Object.entries(COUNTABLE)) {
      const actual = measure(c);
      // Digits or words, bold or not. Fenced code blocks are scanned too, deliberately: the worst
      // instance of this defect was a fenced transcript in README.md showing the output of
      // `npm run check` with six ticks in it, which is a claim a reader will act on.
      const NUMBER = `(\\d+|${Object.keys(NUMERALS).join('|')})`;
      const re = new RegExp(`\\*{0,2}\\b${NUMBER}\\b\\*{0,2}\\s+\\*{0,2}${noun}\\b`, 'gi');
      for (const m of text.matchAll(re)) {
        if (numberOf(m[1]) !== actual) {
          problems.push(
            `${file}: says "${m[1]} ${noun}", but there are ${actual}. ` +
              `A count in prose goes stale the moment reality moves — cite \`npm run status\` instead, ` +
              `or fix the number.`,
          );
        }
      }
    }
  }
  return problems;
}

function walkDocs() {
  /** @type {Record<string, string>} */ const out = {};
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      // docs/review is an external review, dated and quoted. Its counts are a record of what was
      // true on the day it was written — "fixing" them would falsify the finding, which is the
      // opposite of what this gate is for. This checks claims the project makes about ITSELF.
      // docs/review is an external review, dated and quoted. research/ memos report their OWN
      // results ("Seven findings; four change the specs") and carry a re-verify header. Both are
      // records of what was true on a date; "fixing" their numbers would falsify them. This gate
      // checks the claims the project makes about ITSELF, now.
      if (p.includes('node_modules') || p.includes('.venv')) continue;
      if (p.includes('docs/review') || p.startsWith('research')) continue;
      if (statSync(p).isDirectory()) visit(p);
      else if (extname(p) === '.md') out[p] = readFileSync(p, 'utf8');
    }
  };
  for (const d of ['docs', 'spec', 'research']) if (existsSync(d)) visit(d);
  for (const f of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md'])
    if (existsSync(f)) out[f] = readFileSync(f, 'utf8');
  return out;
}

function main() {
  const c = census();
  if (process.argv.includes('--check')) {
    const problems = checkCountClaims(walkDocs(), c);
    if (problems.length) {
      console.error('status: STALE DOCUMENTATION\n');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log('status: ok — no document asserts a count that has gone stale');
    return;
  }

  const shipped = c.specs.filter((s) => s.status === 'done');
  const openAcs = c.specs.flatMap((s) => s.acs.filter((a) => a !== 'done'));
  let head = '';
  try {
    head = execFileSync('git', ['log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim();
  } catch {
    /* not a repo */
  }

  console.log(`
  keelblock — computed ${new Date().toISOString().slice(0, 10)}, not written down
  ${head ? `at ${head}` : ''}

  SPECS      ${c.specs.length} authored · ${shipped.length} done · ${c.specs.filter((s) => s.status === 'partial').length} partial · ${c.specs.filter((s) => s.status === 'draft').length} draft`);
  for (const s of c.specs) {
    const done = s.acs.filter((a) => a === 'done').length;
    console.log(
      `             ${s.id}  ${s.status.padEnd(8)} ${s.reqs} REQ · ${done}/${s.acs.length} AC done`,
    );
  }
  console.log(`
  DEFERRALS  ${c.openDefs} open · ${c.closedDefs} closed
  GATES      ${c.gates} · run \`npm run check\`
  EVIDENCE   ${c.findings} findings · ${c.adrs} ADRs · ${c.memos} memos · ${c.sources} pinned sources${
    c.review
      ? `
  REVIEW     ${c.review.total} findings · ${c.review.implemented} implemented · ${c.review.refuted} refuted · ${c.review.deferred} deferred — ${
    c.review.closed ? 'CLOSED' : `OPEN (${c.review.open.join(', ')})`
  }`
      : ''
  }
  BARS       ${c.bars} acceptance bars — coverage checked by the promises gate
  OPEN WORK  ${openAcs.length} acceptance criteria not yet done

  Nothing above is stored. If it disagrees with a document, the document is wrong.
`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
