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
 * A backticked token is evidence only if it could be a file. A deferral marker, `hreflang` and
 * `npm run check` are all legitimately backticked and none of them is a path — demanding them as
 * files is how a gate teaches people to delete backticks, which silently disables the check for
 * that row. So path-likeness decides what is DEMANDED, and a `done` row that yields no path at all
 * fails separately. Removing the backticks cannot dodge that: it yields zero paths either way.
 */
const PATHLIKE = /\/|\.(md|tsx?|mts|mjs|jsx?|sql|json|ya?ml|toml|txt|sh)$/;

/** `| AC-1 | REQ-1 | test | evidence | done |` -> its cells, trimmed. */
const CELLS = /^\s*\|(.+)\|\s*$/;

/**
 * @typedef {{ac: string, paths: string[], status: string, cited: string}} Evidence
 * @typedef {{ id: string, status: string, contracts: string[], evidence: Evidence[] }} Spec
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
  //
  // Parsed as CELLS, not matched as a line. The previous regex captured the FIRST backticked token
  // and required the evidence cell to begin with one, which produced two silent holes: a criterion
  // citing two files had only its first checked, and a criterion whose evidence read as prose was
  // not parsed at all — so it was never checked, and nothing said so. The more the author wrote,
  // the less the gate looked at.
  const evidence = [];
  for (const line of text.split('\n')) {
    const row = CELLS.exec(line);
    if (!row) continue;
    const cells = row[1].split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    const ac = /^(AC-[\w.]+)$/.exec(cells[0])?.[1];
    if (!ac) continue;
    const cited = cells[3];
    evidence.push({
      ac,
      cited,
      status: cells[4].replace(/\*/g, '').trim(),
      paths: [...cited.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1].trim())
        .filter((t) => PATHLIKE.test(t)),
    });
  }
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
    // 1 · evidence for a criterion claiming `done` must exist — ALL of it. A `planned` criterion is
    //     a plan. A `done` one that names nothing openable is a claim wearing a record's clothes.
    for (const { ac, paths, status, cited } of spec.evidence) {
      if (status !== 'done') continue;
      if (!paths.length) {
        problems.push(
          `${spec.id} ${ac} is marked done and cites nothing checkable: "${cited}". ` +
            `Name the file that proves it — a criterion nobody can open is a claim, not a record.`,
        );
        continue;
      }
      for (const path of paths) {
        // A glob is a description, not a path — and cannot be verified, so it is refused outright.
        if (/[*?]/.test(path)) {
          problems.push(
            `${spec.id} ${ac} cites a glob \`${path}\` — name the file, or the claim cannot be checked`,
          );
        } else if (/^[/~]/.test(path) || path.split('/').includes('..')) {
          // F-58, and the same category error as the glob above: a path outside the repository is
          // a fact about a MACHINE, not about this repository, so `exists` is asking whoever runs
          // the gate rather than asking the evidence. SPEC-012 AC-6 shipped citing `/tmp/stranger`
          // and passed, because a rehearsal on that machine had created the directory ten minutes
          // earlier; CI, having no such directory, went red. Refused BEFORE the existence check,
          // so a path that happens to exist locally cannot buy a pass.
          //
          // `..` is refused for a second reason as well: it resolves against the gate's working
          // directory rather than against the spec file that wrote it, so the same citation means
          // two different things depending on who reads it.
          //
          // Swept before landing: 119 cited paths across every spec, none of them this shape.
          problems.push(
            `${spec.id} ${ac} cites \`${path}\`, which is outside the repository. Evidence is ` +
              `cited relative to the repository root — an absolute or escaping path is a fact ` +
              `about the machine running this gate, and it passes or fails depending on who runs it.`,
          );
        } else if (!exists(path)) {
          problems.push(
            `${spec.id} ${ac} is marked done and cites \`${path}\`, which does not exist. ` +
              `A criterion that names evidence nobody can open is a claim, not a record.`,
          );
        }
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
    // Padding-tolerant, and it has to be: prettier aligns the index table, so the real row reads
    // `| SPEC-004                               |`. Matching `| SPEC-004 |` with single spaces —
    // which this did — found NO row for ANY spec, and a not-found row was a silent `continue`. The
    // rule reported success for its whole life by looking at nothing, including in its own test
    // against the real file, which passed vacuously. `check-promises.mjs` asks the same question
    // one file away and gets it right; one question with two resolvers, and the wrong one here.
    const rowRe = new RegExp(`^\\|\\s*\\*{0,2}${spec.id}\\*{0,2}\\s*\\|`);
    const row = index.split('\n').find((l) => rowRe.test(l));
    // No longer a silent skip. An authored spec absent from the index is its own defect, and
    // treating it as "nothing to check" is what let the matcher bug hide.
    if (!row) {
      problems.push(
        `${spec.id} is authored but has no row in the spec index. A spec nobody can find from ` +
          `spec/README.md is invisible to every reader who starts where the workflow says to start.`,
      );
      continue;
    }
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
