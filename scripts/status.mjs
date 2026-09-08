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
      acs: [...t.matchAll(/^\|\s*AC-[\w.]+\s*\|[^|]*\|[^|]*\|[^|]*\|\s*\*{0,2}([\w ]+?)\*{0,2}\s*\|/gm)].map((m) => m[1].trim()),
    };
  });
  const registry = read('spec/DEFERRAL_REGISTRY.md');
  const openDefs = (registry.split(/^## Closed/m)[0].match(/^\| DEF-\d+/gm) ?? []).length;
  const closedDefs = ((registry.split(/^## Closed/m)[1] ?? '').match(/^\| DEF-\d+/gm) ?? []).length;

  return {
    findings: (read('docs/FINDINGS.md').match(/^## F-\d+/gm) ?? []).length,
    gates: fs.readdirSync('scripts').filter((f) => f.startsWith('check-') && f.endsWith('.mjs')).length,
    specs,
    adrs: fs.readdirSync('docs/adr').filter((f) => f.endsWith('.md')).length,
    memos: fs.readdirSync('research').filter((f) => f.endsWith('.md')).length,
    sources: JSON.parse(read('research/corpus.json') || '{"sources":[]}').sources.length,
    bars: (read('docs/PRODUCT.md').match(/^\| B-\d+/gm) ?? []).length,
    openDefs, closedDefs,
  };
}

/** The nouns whose counts appear in prose, and how each is measured. Exported for tests. */
export const COUNTABLE = {
  findings: (c) => c.findings,
  gates: (c) => c.gates,
  ADRs: (c) => c.adrs,
  'acceptance bars': (c) => c.bars,
  'research memos': (c) => c.memos,
  'primary sources': (c) => c.sources,
};

/**
 * Verify every count asserted in prose against the real one.
 * @param {Record<string, string>} docs @param {ReturnType<typeof census>} c @returns {string[]}
 */
export function checkCountClaims(docs, c) {
  const problems = [];
  for (const [file, text] of Object.entries(docs)) {
    for (const [noun, measure] of Object.entries(COUNTABLE)) {
      const actual = measure(c);
      // "22 findings", "**12** gates", "twelve ADRs" is not matched — digits only, deliberately:
      // a spelled-out number is almost always prose about the concept, not a claim about the count.
      for (const m of text.matchAll(new RegExp(`(\\d+)\\s+\\*{0,2}${noun}\\b`, 'gi'))) {
        if (Number(m[1]) !== actual) {
          problems.push(
            `${file}: says "${m[1]} ${noun}", but there are ${actual}. ` +
            `A count in prose goes stale the moment reality moves — cite \`npm run status\` instead, ` +
            `or fix the number.`
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
      if (p.includes('node_modules') || p.includes('.venv')) continue;
      if (statSync(p).isDirectory()) visit(p);
      else if (extname(p) === '.md') out[p] = readFileSync(p, 'utf8');
    }
  };
  for (const d of ['docs', 'spec', 'research']) if (existsSync(d)) visit(d);
  for (const f of ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'CHANGELOG.md']) if (existsSync(f)) out[f] = readFileSync(f, 'utf8');
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
  try { head = execFileSync('git', ['log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim(); } catch { /* not a repo */ }

  console.log(`
  keel — computed ${new Date().toISOString().slice(0, 10)}, not written down
  ${head ? `at ${head}` : ''}

  SPECS      ${c.specs.length} authored · ${shipped.length} done · ${c.specs.filter((s) => s.status === 'partial').length} partial · ${c.specs.filter((s) => s.status === 'draft').length} draft`);
  for (const s of c.specs) {
    const done = s.acs.filter((a) => a === 'done').length;
    console.log(`             ${s.id}  ${s.status.padEnd(8)} ${s.reqs} REQ · ${done}/${s.acs.length} AC done`);
  }
  console.log(`
  DEFERRALS  ${c.openDefs} open · ${c.closedDefs} closed
  GATES      ${c.gates} · run \`npm run check\`
  EVIDENCE   ${c.findings} findings · ${c.adrs} ADRs · ${c.memos} memos · ${c.sources} pinned sources
  BARS       ${c.bars} acceptance bars — coverage checked by the promises gate
  OPEN WORK  ${openAcs.length} acceptance criteria not yet done

  Nothing above is stored. If it disagrees with a document, the document is wrong.
`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
