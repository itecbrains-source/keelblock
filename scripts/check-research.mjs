#!/usr/bin/env node
/**
 * The research freshness gate.
 *
 * keelblock has a gate for stale dependencies and, until now, nothing for stale **knowledge** — which
 * rots faster. `research/05-SEO-2026.md` opens with "a stale SEO memo is worse than none" and
 * shipped with nothing enforcing it.
 *
 * The failure this prevents is specific: a memo written from a correct reading of 2026 is quietly
 * wrong by 2027, and **a spec built on it inherits the error while looking rigorous**. That is worse
 * than no memo, because a citation reads as diligence.
 *
 * Three rules:
 *   1. every memo is verified within its volatility window
 *   2. every memo in the manifest exists, and every memo on disk is in the manifest
 *   3. a spec citing a lapsed memo cannot be `done`
 *   4. **every memo separates primary from secondary sources, and has at least one primary.**
 *      A gate cannot judge authority — but it can refuse a memo that never classified its sources,
 *      and that refusal is what forces the author to go and find the vendor's own documentation.
 *      This rule exists because of a measured failure: memo 05 asserted a specific deprecation date
 *      taken from an agency blog, and the primary source said something materially different
 *      (F-21). Nothing caught it, because nothing asked where the claim came from.
 *   5. **every authored spec is covered by a memo.** This is the rule that makes the requirement
 *      apply to every feature keelblock ships rather than the ones someone remembered. A spec authored
 *      from recollection encodes whatever its author last believed, and nothing downstream can tell
 *      the difference between that and a researched one.
 *
 * Volatility is per-subject on purpose. Postgres semantics and AI search do not decay at the same
 * rate, and one global window would either nag about SQL or let SEO rot for a year.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const MANIFEST = 'research/manifest.json';
const DAY_MS = 86_400_000;

/**
 * Pure. Exported so each rule carries a mutation proof.
 * @param {{ volatility: Record<string, {maxAgeDays: number}>, memos: Array<{file: string, area: string, volatility: string, verifiedOn: string, specs: string[]}> }} manifest
 * @param {{ today: string, onDisk: string[], specStatus: (id: string) => string | null, authoredSpecs?: string[], readSource?: (f: string) => string | null }} ctx
 * @returns {{ problems: string[], expiring: string[] }}
 */
export function checkResearch(
  manifest,
  { today, onDisk, specStatus, authoredSpecs = [], readSource = () => null },
) {
  /** @type {string[]} */ const problems = [];
  /** @type {string[]} */ const expiring = [];

  const listed = new Set(manifest.memos.map((m) => m.file));
  for (const file of onDisk) {
    if (!listed.has(file)) {
      problems.push(
        `${file} exists but is not in the manifest — an unlisted memo is never re-verified`,
      );
    }
  }

  for (const memo of manifest.memos) {
    if (!onDisk.includes(memo.file)) {
      problems.push(`${memo.file} is in the manifest but does not exist`);
      continue;
    }
    const window = manifest.volatility[memo.volatility];
    if (!window) {
      problems.push(
        `${memo.file}: unknown volatility "${memo.volatility}" — one of ${Object.keys(manifest.volatility).join(', ')}`,
      );
      continue;
    }
    const age = Math.floor((Date.parse(today) - Date.parse(memo.verifiedOn)) / DAY_MS);
    if (Number.isNaN(age)) {
      problems.push(`${memo.file}: unparseable verifiedOn "${memo.verifiedOn}"`);
      continue;
    }
    if (age > window.maxAgeDays) {
      problems.push(
        `${memo.file} (${memo.area}) was verified ${age}d ago; "${memo.volatility}" subjects expire at ` +
          `${window.maxAgeDays}d. Re-read the sources and move the date, or downgrade the volatility with a reason.`,
      );
      // A lapsed memo poisons every spec citing it, and a done spec is the dangerous case.
      for (const spec of memo.specs ?? []) {
        if (specStatus(spec) === 'done') {
          problems.push(
            `  └ ${spec} is marked done on this lapsed memo — its conclusions are unverified`,
          );
        }
      }
    } else if (age > window.maxAgeDays * 0.8) {
      expiring.push(`${memo.file} — ${window.maxAgeDays - age}d left`);
    }
  }
  // Rule 4 — evidence is classified.
  //
  // Two kinds, and conflating them is why this rule needed a second pass. A `sourced` memo cites
  // other people's work and must say whose. A `measured` memo IS the evidence — we ran it — and must
  // carry a reproduction instead, because a measurement nobody can repeat is an anecdote.
  for (const memo of manifest.memos) {
    if (!onDisk.includes(memo.file)) continue;
    const text = readSource(memo.file);
    if (text === null) continue;

    if (memo.kind === 'measured') {
      if (!/```/.test(text)) {
        problems.push(
          `${memo.file} is a measurement with no reproduction — that is an anecdote, not evidence`,
        );
      }
      continue;
    }
    if (memo.kind !== 'sourced') {
      problems.push(
        `${memo.file}: kind must be "sourced" or "measured", not "${memo.kind ?? 'unset'}"`,
      );
      continue;
    }
    if (!/^\*\*Primary\*\*/m.test(text)) {
      problems.push(
        `${memo.file} has no "**Primary**" sources section. A memo that never classified its sources ` +
          `has not been asked where its claims came from — which is how an agency blog's date ended up ` +
          `in a spec (F-21).`,
      );
      continue;
    }
    const primaryBlock = text.split(/^\*\*Primary\*\*/m)[1]?.split(/^\*\*Secondary/m)[0] ?? '';
    if (!/\]\(https?:\/\//.test(primaryBlock)) {
      problems.push(`${memo.file}: the Primary section cites no source`);
    }
  }

  // Rule 5 — no authored spec without research behind it.
  const covered = new Set(manifest.memos.flatMap((m) => m.specs ?? []));
  for (const spec of authoredSpecs) {
    if (!covered.has(spec)) {
      problems.push(
        `${spec} is authored but no research memo covers it. A spec written from recollection ` +
          `encodes what its author last believed, and nothing downstream can tell that apart from a ` +
          `researched one. Add a memo to research/ and list the spec in the manifest.`,
      );
    }
  }

  return { problems, expiring };
}

function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`research: ${MANIFEST} is missing`);
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const onDisk = readdirSync('research').filter((f) => f.endsWith('.md'));

  const specStatus = (id) => {
    const file = readdirSync('spec').find((f) => f.startsWith(id));
    if (!file) return null;
    const m = readFileSync(`spec/${file}`, 'utf8').match(/^> Status: `(\w+)`/m);
    return m ? m[1] : null;
  };

  // Every spec with a real status is authored; `planned` rows in the index have no file.
  const authoredSpecs = readdirSync('spec')
    .filter((f) => /^SPEC-\d+/.test(f))
    .map((f) => f.slice(0, 8));

  const { problems, expiring } = checkResearch(manifest, {
    today: new Date().toISOString().slice(0, 10),
    onDisk,
    specStatus,
    authoredSpecs,
    readSource: (f) => {
      try {
        return readFileSync(`research/${f}`, 'utf8');
      } catch {
        return null;
      }
    },
  });

  if (problems.length) {
    console.error('research: FAILED\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      '\nMoving a date is a claim that you re-read the sources. Do not move one without reading.',
    );
    process.exit(1);
  }
  console.log(`research: ok — ${manifest.memos.length} memo(s), all within their window`);
  for (const e of expiring) console.log(`  · expiring soon: ${e}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
