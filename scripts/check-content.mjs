#!/usr/bin/env node
/**
 * The content gate — material is routed as it is produced, not mined later.
 *
 * keelblock generates unusually good raw material: measured findings with reproductions, decisions with
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
 *      defect this whole project is organized against, and it is easiest to commit in a FAQ
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { stripFences } from './prose.mjs';
import { isGeneratedProject } from './check-promises.mjs';

const MANIFEST = 'docs/content/MANIFEST.json';
const FINDINGS = 'docs/FINDINGS.md';
const FAQ = 'docs/FAQ.md';
const BATTLECARD = 'docs/content/BATTLECARD.md';
const SPEC_DIR = 'spec';

/** @param {string} md @returns {string[]} */
export const findingIds = (md) => [...md.matchAll(/^## (F-\d+)\b/gm)].map((m) => m[1]);

/** @param {string} md @returns {Array<{q: string, cites: string[]}>} */
export function parseFaq(md) {
  // A fenced block showing HOW to cite an answer is not itself a citation.
  return stripFences(md)
    .split(/^### /m)
    .slice(1)
    .map((block) => {
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

  const seen = new Set();
  for (const id of findings) {
    if (seen.has(id)) {
      problems.push(
        `${id} appears twice in FINDINGS.md. Two findings with one id means one of them is ` +
          `unroutable and invisible to this gate — membership was checked, uniqueness was not.`,
      );
    }
    seen.add(id);
    if (!routed.has(id)) {
      problems.push(
        `${id} is in FINDINGS.md but routed nowhere. Decide now where it belongs — blog, landing, ` +
          `faq, docs, or internal with a reason. The reasoning is never fresher than today.`,
      );
    }
  }
  for (const m of manifest.material) {
    if (!findings.includes(m.id))
      problems.push(`${m.id} is routed but no longer exists in FINDINGS.md`);
    for (const d of m.to) {
      if (!kinds.includes(d))
        problems.push(`${m.id} routes to "${d}", which is not a declared destination`);
    }
    if (m.to.includes('internal') && !m.angle) {
      problems.push(
        `${m.id} is marked internal with no reason — that is how material gets quietly buried`,
      );
    }
    if (m.to.length === 0) problems.push(`${m.id} has no destination`);
  }

  for (const { q, cites } of faq) {
    if (cites.length === 0) {
      problems.push(
        `FAQ "${q.slice(0, 50)}…" cites nothing. An answer resting on an assertion is the defect this project exists to avoid.`,
      );
    }
    for (const c of cites) {
      const resolved = c.startsWith('../') ? c.replace('../', '') : `docs/${c}`;
      if (!exists(resolved))
        problems.push(`FAQ "${q.slice(0, 40)}…" cites ${c}, which does not exist`);
    }
  }
  return problems;
}

/**
 * ADR-019 · every shipped spec names where its documentation lives.
 *
 * The sibling rule above refuses a `done` spec with no competitive copy. Nothing refused one with no
 * documentation, and the difference was not theoretical: six specs shipped `done` while the flagship
 * "add a tenant-scoped table" guide taught `enable row level security` without `force` — the exact
 * defect a gate had learned to catch the same day (F-47). A gate catching a defect is not the same as
 * the defect being unlearned, and documentation is where it gets unlearned.
 *
 * Most specs satisfy this immediately, which is the point: the rule is not asking for new writing, it
 * is asking for the link between a spec and the page a stranger reads, so that when one moves the
 * other is visibly stale.
 *
 * @param {{documentation?: Record<string,string>, $noDocumentation?: Record<string,string>}} manifest
 * @param {Array<{id: string, status: string}>} specs
 * @param {(p: string) => boolean} exists
 * @returns {string[]}
 */
export function checkDocumentation(manifest, specs, exists) {
  const problems = [];
  const declared = manifest.documentation ?? {};
  const excused = manifest.$noDocumentation ?? {};

  for (const spec of specs) {
    if (spec.status !== 'done' && spec.status !== 'partial') continue;
    const page = declared[spec.id];
    const excuse = excused[spec.id];

    if (page && excuse) {
      problems.push(`${spec.id} is both declared and excused — decide which`);
      continue;
    }
    if (page) {
      if (!exists(page)) {
        problems.push(
          `${spec.id}: documentation \`${page}\` does not resolve. Naming a page is a promise; ` +
            `the gate opens it.`,
        );
      }
      continue;
    }
    if (excuse) {
      // The same weakness `$noDifferentiator` carries, accepted for the same reason — but a shrug
      // is not a reason, and "n/a" is a shrug.
      if (excuse.length < 20) {
        problems.push(
          `${spec.id}: "${excuse}" is too short to be a reason for shipping no documentation.`,
        );
      }
      continue;
    }
    problems.push(
      `${spec.id} is ${spec.status} and names no documentation. Say where a stranger reads how to ` +
        `use it (an existing page is fine) in \`documentation\`, or say in \`$noDocumentation\` why ` +
        `this spec ships nothing a reader needs. B-5 is that a stranger gets there on the docs alone.`,
    );
  }
  return problems;
}

/**
 * Every shipped differentiator is written up — the rule that stops "we built it, nobody can tell".
 *
 * The material pipeline routed FINDINGS from day one, and that half worked. It keys on `F-*`, and a
 * spec that ships a competitive capability produces none by itself: SPEC-004's Server-Action
 * authorization rule — the strongest artifact in the repository against the field's actual
 * architecture — routed nowhere and nothing noticed. **That is the gap someone had to keep noticing
 * out loud**, which is the definition of a missing gate.
 *
 * So: a spec that is `done` or `partial` either declares what it lets keelblock claim, with a
 * battlecard section and evidence that resolves — or it is listed in `$noDifferentiator` with a
 * reason. Deny-by-default, and the reason is visible in a diff.
 *
 * Evidence is a finding id or a repository path, never a sentence. A comparative claim about a named
 * competitor that rests on an assertion is the one place this project could most easily become the
 * thing it criticises.
 *
 * @param {{differentiators?: Array<{spec: string, claim: string, rivals: string, evidence: string[], battlecard: string, artifacts?: string[]}>, $noDifferentiator?: Record<string,string>}} manifest
 * @param {Array<{id: string, status: string}>} specs
 * @param {string} battlecard the battlecard document's text
 * @param {string[]} findings
 * @param {(p: string) => boolean} exists
 * @returns {string[]}
 */
export function checkDifferentiators(manifest, specs, battlecard, findings, exists) {
  const problems = [];
  const declared = new Map((manifest.differentiators ?? []).map((d) => [d.spec, d]));
  const excused = manifest.$noDifferentiator ?? {};

  for (const spec of specs) {
    if (spec.status !== 'done' && spec.status !== 'partial') continue;
    const d = declared.get(spec.id);
    if (!d) {
      if (!excused[spec.id]) {
        problems.push(
          `${spec.id} is ${spec.status} and declares no differentiator. Say what it lets keelblock ` +
            `claim that the field cannot, with a battlecard section and evidence — or list it in ` +
            `$noDifferentiator with a reason. Shipping a capability nobody can describe is how it ` +
            `stops being a differentiator.`,
        );
      }
      continue;
    }
    if (excused[spec.id]) {
      problems.push(`${spec.id} is both declared and excused — decide which`);
    }
    if (!d.claim || d.claim.length < 20) {
      problems.push(`${spec.id}: the claim is missing or too short to be a claim`);
    }
    if (!d.rivals || d.rivals.length < 20) {
      problems.push(
        `${spec.id}: no statement of what the field does instead. A differentiator with no ` +
          `comparison is a feature.`,
      );
    }
    if (!d.evidence?.length) {
      problems.push(
        `${spec.id}: the claim cites no evidence. A comparative claim resting on an assertion is ` +
          `exactly what this project criticises in everyone else.`,
      );
    }
    for (const e of d.evidence ?? []) {
      const ok = /^F-\d+$/.test(e) ? findings.includes(e) : exists(e);
      if (!ok) problems.push(`${spec.id}: evidence \`${e}\` does not resolve`);
    }
    // The battlecard row must actually be written, not merely named.
    if (!d.battlecard) {
      problems.push(`${spec.id}: names no battlecard section`);
    } else if (!battlecard.includes(d.battlecard)) {
      problems.push(
        `${spec.id}: battlecard section "${d.battlecard}" is not in ${BATTLECARD}. Naming a ` +
          `destination is a promise; the gate checks the artifact.`,
      );
    }
    for (const a of d.artifacts ?? []) {
      if (!exists(a)) problems.push(`${spec.id}: artifact \`${a}\` does not exist`);
    }
  }
  return problems;
}

function main() {
  // Same reason as `research`: routing keelblock's 56 findings to keelblock's blog is keelblock's
  // editorial problem. A buyer inherits the corpus as the reasoning behind their code (DEF-010).
  if (isGeneratedProject()) {
    console.log('content: not applicable — generated project');
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const findings = findingIds(readFileSync(FINDINGS, 'utf8'));
  const faq = existsSync(FAQ) ? parseFaq(readFileSync(FAQ, 'utf8')) : [];
  const specs = readdirSync(SPEC_DIR)
    .filter((f) => /^SPEC-\d+/.test(f))
    .map((f) => ({
      id: f.slice(0, 8),
      status: (readFileSync(`${SPEC_DIR}/${f}`, 'utf8').match(/^> Status: `(\w+)`/m) ?? [, '?'])[1],
    }));
  const battlecard = existsSync(BATTLECARD) ? readFileSync(BATTLECARD, 'utf8') : '';

  const problems = [
    ...checkContent(manifest, findings, faq, (p) => existsSync(p)),
    ...checkDifferentiators(manifest, specs, battlecard, findings, (p) => existsSync(p)),
    ...checkDocumentation(manifest, specs, (p) => existsSync(p)),
  ];

  if (problems.length) {
    console.error('content: FAILED\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const counts = {};
  for (const m of manifest.material) for (const d of m.to) counts[d] = (counts[d] ?? 0) + 1;
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');
  console.log(
    `content: ok — ${findings.length} findings routed (${summary}), ${faq.length} FAQ answers all cited, ` +
      `${(manifest.differentiators ?? []).length} differentiator(s) written up`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
