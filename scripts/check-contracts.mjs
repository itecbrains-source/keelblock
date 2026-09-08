#!/usr/bin/env node
/**
 * Specs are contracts, not islands — SPEC-003 REQ-7's traceability half, plus the cross-seam rule.
 *
 * Two failures this prevents, both of which look fine locally:
 *
 *   · **A spec drifts from its build.** It claims an acceptance criterion is met by a file that was
 *     renamed, moved, or never written. The spec still reads as `done`, and nothing disagrees.
 *
 *   · **A change satisfies one spec and silently breaks another.** SPEC-028 derives `hreflang` from
 *     the locale list that SPEC-010's ADR defines; adding a locale without touching SEO is correct
 *     in isolation and wrong in the system. A dependency written in only one direction is invisible
 *     from the side that would break.
 *
 * So contracts are **declared and reciprocal**: if A contracts B, B names A. That reciprocity is the
 * whole mechanism — it means the person changing B can see who depends on it without going looking.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const SPEC_DIR = 'spec';

/**
 * @typedef {{ id: string, status: string, contracts: string[], evidence: Array<{ac: string, path: string, status: string}> }} Spec
 * @param {string} id @param {string} text @returns {Spec}
 */
export function parseSpec(id, text) {
  const status = (text.match(/^> Status: `(\w+)`/m) ?? [, 'unknown'])[1];
  const contractLine = (text.match(/^> Contracts: (.+)$/m) ?? [, ''])[1];
  const contracts = [...contractLine.matchAll(/SPEC-\d+/g)].map((m) => m[0]);
  // Evidence and its own status, per acceptance criterion. Checking per-AC rather than per-spec is
  // the difference between a useful rule and a nagging one: a `partial` spec legitimately has
  // `planned` criteria whose files do not exist yet, and demanding them would train people to
  // ignore the gate.
  const evidence = [
    ...text.matchAll(
      /^\|\s*(AC-[\w.]+)\s*\|[^|]*\|[^|]*\|\s*`([^`]+)`[^|]*\|\s*\*{0,2}([\w ]+?)\*{0,2}\s*\|/gm,
    ),
  ].map((m) => ({ ac: m[1], path: m[2], status: m[3].trim() }));
  return { id, status, contracts, evidence };
}

/**
 * Pure. Exported so each rule carries a mutation proof.
 * @param {Spec[]} specs
 * @param {(p: string) => boolean} exists
 * @returns {string[]}
 */
export function checkContracts(specs, exists) {
  const problems = [];
  const byId = new Map(specs.map((s) => [s.id, s]));

  for (const spec of specs) {
    // 1 · evidence for a criterion claiming `done` must exist. A `planned` criterion is a plan.
    for (const { ac, path, status } of spec.evidence) {
      if (status !== 'done') continue;
      // A glob is a description, not a path — and cannot be verified, so it is refused outright.
      if (/[*?]/.test(path)) {
        problems.push(
          `${spec.id} ${ac} cites a glob \`${path}\` — name the file, or the claim cannot be checked`,
        );
      } else if (!exists(path)) {
        problems.push(
          `${spec.id} ${ac} is marked done and cites \`${path}\`, which does not exist. ` +
            `A criterion that names evidence nobody can open is a claim, not a record.`,
        );
      }
    }
    // 2 · a spec claiming `done` must actually be closed
    //
    // The failure this catches is the one that makes documentation stale: work ships, the header is
    // updated, and the acceptance table is never reconciled. SPEC-001 read `done` with 2 of 14
    // criteria still `planned`, and SPEC-003 read `done` with 0 of 9 — for several commits, while
    // both were genuinely complete. A reader cannot tell that from a reader who is being misled.
    if (spec.status === 'done') {
      const open = spec.evidence.filter((e) => e.status !== 'done' && !/^deferred/i.test(e.status));
      if (open.length) {
        problems.push(
          `${spec.id} is marked done with ${open.length} criteri${open.length === 1 ? 'on' : 'a'} ` +
            `not closed (${open.map((o) => `${o.ac}: ${o.status}`).join(', ')}). ` +
            `Close them, defer them with a DEF, or the spec is not done.`,
        );
      }
    }

    // 3 · a contract must point at a real spec
    for (const other of spec.contracts) {
      const target = byId.get(other);
      if (!target) {
        problems.push(`${spec.id} contracts ${other}, which is not an authored spec`);
        continue;
      }
      // 4 · and it must be reciprocated
      if (!target.contracts.includes(spec.id)) {
        problems.push(
          `${spec.id} contracts ${other}, but ${other} does not name ${spec.id} back. ` +
            `A one-way dependency is invisible from the side that would break — add it to ${other}'s Contracts line.`,
        );
      }
    }
  }
  return problems;
}

/**
 * The spec file and the spec index must agree about status.
 *
 * This rule exists because they did not: SPEC-001 and SPEC-003 read `done` in the index and `draft`
 * in their own headers for several commits. Two records of the same fact, disagreeing, and the
 * evidence check silently passed because it only inspects shipped specs — so the drift hid the very
 * thing it should have surfaced.
 *
 * @param {Spec[]} specs @param {string} index @returns {string[]}
 */
export function checkStatusAgreement(specs, index) {
  const problems = [];
  for (const spec of specs) {
    const row = index.split('\n').find((l) => l.includes(`| ${spec.id} |`));
    if (!row) continue;
    const claimed = (row.match(/\*{0,2}(draft|partial|done|planned)\*{0,2}\s*(?:\(|\|)/) ?? [])[1];
    if (claimed && claimed !== spec.status) {
      problems.push(
        `${spec.id}: the index says "${claimed}", the spec file says "${spec.status}". ` +
          `Two records of one fact, disagreeing — and the one people read is not the one gates check.`,
      );
    }
  }
  return problems;
}

function main() {
  const files = readdirSync(SPEC_DIR).filter((f) => /^SPEC-\d+/.test(f));
  const specs = files.map((f) =>
    parseSpec(f.slice(0, 8), readFileSync(`${SPEC_DIR}/${f}`, 'utf8')),
  );
  const problems = [
    ...checkContracts(specs, (p) => existsSync(p)),
    ...checkStatusAgreement(specs, readFileSync(`${SPEC_DIR}/README.md`, 'utf8')),
  ];

  if (problems.length) {
    console.error('contracts: FAILED\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const pairs = specs.reduce((n, s) => n + s.contracts.length, 0);
  console.log(
    `contracts: ok — ${specs.length} spec(s), ${pairs} reciprocal contract(s), all evidence present`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
