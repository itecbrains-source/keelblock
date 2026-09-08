#!/usr/bin/env node
/**
 * The content gate — material is routed as it is produced, not mined later.
 *
 * keel generates unusually good raw material: measured findings with reproductions, decisions with
 * their rejected options, a pinned source corpus. **None of it is useful if nobody can find it when
 * the website needs writing**, and mining it six months later means reconstructing reasoning that
 * was obvious the day it was discovered.
 *
 * So every finding is routed to a destination the day it lands, or explicitly marked internal with a
 * reason. Three rules:
 *
 *   1. every finding in FINDINGS.md appears in the manifest, and vice versa
 *   2. every destination is one of the declared kinds
 *   3. every FAQ answer cites something that exists — an answer resting on an assertion is the
 *      defect this whole project is organised against, and it is easiest to commit in a FAQ
 */
import { readFileSync, existsSync } from 'node:fs';

const MANIFEST = 'docs/content/MANIFEST.json';
const FINDINGS = 'docs/FINDINGS.md';
const FAQ = 'docs/FAQ.md';

/** @param {string} md @returns {string[]} */
export const findingIds = (md) => [...md.matchAll(/^## (F-\d+)\b/gm)].map((m) => m[1]);

/** @param {string} md @returns {Array<{q: string, cites: string[]}>} */
export function parseFaq(md) {
  return md.split(/^### /m).slice(1).map((block) => {
    const [q, ...rest] = block.split('\n');
    const body = rest.join('\n');
    return {
      q: q.trim(),
      // A citation is a link into the repository — not an outbound URL, which proves nothing here.
      cites: [...body.matchAll(/\]\((?!https?:)([^)#]+)/g)].map((m) => m[1].trim()),
    };
  });
}

/**
 * Pure. Exported so each rule carries a mutation proof.
 * @param {{material: Array<{id: string, to: string[], angle?: string}>, $destinations: Record<string, string>}} manifest
 * @param {string[]} findings
 * @param {Array<{q: string, cites: string[]}>} faq
 * @param {(p: string) => boolean} exists
 * @returns {string[]}
 */
export function checkContent(manifest, findings, faq, exists) {
  const problems = [];
  const kinds = Object.keys(manifest.$destinations);
  const routed = new Map(manifest.material.map((m) => [m.id, m]));

  for (const id of findings) {
    if (!routed.has(id)) {
      problems.push(
        `${id} is in FINDINGS.md but routed nowhere. Decide now where it belongs — blog, landing, ` +
        `faq, docs, or internal with a reason. The reasoning is never fresher than today.`
      );
    }
  }
  for (const m of manifest.material) {
    if (!findings.includes(m.id)) problems.push(`${m.id} is routed but no longer exists in FINDINGS.md`);
    for (const d of m.to) {
      if (!kinds.includes(d)) problems.push(`${m.id} routes to "${d}", which is not a declared destination`);
    }
    if (m.to.includes('internal') && !m.angle) {
      problems.push(`${m.id} is marked internal with no reason — that is how material gets quietly buried`);
    }
    if (m.to.length === 0) problems.push(`${m.id} has no destination`);
  }

  for (const { q, cites } of faq) {
    if (cites.length === 0) {
      problems.push(`FAQ "${q.slice(0, 50)}…" cites nothing. An answer resting on an assertion is the defect this project exists to avoid.`);
    }
    for (const c of cites) {
      const resolved = c.startsWith('../') ? c.replace('../', '') : `docs/${c}`;
      if (!exists(resolved)) problems.push(`FAQ "${q.slice(0, 40)}…" cites ${c}, which does not exist`);
    }
  }
  return problems;
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const findings = findingIds(readFileSync(FINDINGS, 'utf8'));
  const faq = existsSync(FAQ) ? parseFaq(readFileSync(FAQ, 'utf8')) : [];
  const problems = checkContent(manifest, findings, faq, (p) => existsSync(p));

  if (problems.length) {
    console.error('content: FAILED\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const counts = {};
  for (const m of manifest.material) for (const d of m.to) counts[d] = (counts[d] ?? 0) + 1;
  const summary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ');
  console.log(`content: ok — ${findings.length} findings routed (${summary}), ${faq.length} FAQ answers all cited`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
