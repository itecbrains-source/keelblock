/**
 * External review records are **frozen dated claims about one commit each.** That is what makes them
 * worth anything — a score corrected after the fact is a score about nothing — and it is also
 * exactly how they rot: a reader opens `04-SCORECARD.md`, reads 36/100, and believes it, three
 * records and thirty-three points later.
 *
 * The repository already knows the answer to this shape of problem and states it in `status.mjs`:
 * **durable claims are written down; volatile state is computed.** Applied here:
 *
 *   · a record's own score, commit and date are DURABLE. They are written in the record, once, and
 *     never edited. Correcting one falsifies the only thing it was for.
 *   · WHICH record is current, and how far behind HEAD it is, is VOLATILE. It is computed here and
 *     printed by `npm run status`. Nothing writes it down, because a "current as of" line is the
 *     first sentence to go stale.
 *
 * Five rules. The first four keep the records honest about history; the fifth is the one that stops
 * a stale score escaping into a document someone reads as current.
 *
 *   1. every record carries a parseable header — commit, date, score;
 *   2. its commit exists in this repository's history, so a record cannot cite a sha nobody made;
 *   3. records are ordered by real ancestry, so the numbering means what it looks like it means --
 *      non-decreasing, not strictly increasing, because a review is several documents about ONE
 *      tree and requiring uniqueness here was a rule that described the re-scores and not the
 *      review that produced them;
 *   4. a record may omit its score; the CURRENT score is the newest record that carries one;
 *   5. **outside the records themselves, no document may state a review score that is not the
 *      current one.** Inside a record, any score may be discussed — they are dated and say so. In
 *      `README.md`, `PRODUCT.md` or anywhere else, a score is a live claim and must be live.
 *
 * Deliberately NOT a failure: the newest record being behind HEAD. Every commit after a review would
 * break the build, which would train people to stop reviewing. Currency is reported, not enforced —
 * `npm run status` says how far behind it is, and a reader can decide whether that matters.
 *
 * Not a twelfth gate, for the same reason `review-register.mjs` is not: SPEC-003 makes the gate count
 * a ceiling, and the external review's own position is that eleven already exceeds what the
 * application justifies. This runs inside `promises`.
 */

/** A record's header block: three durable facts, written once. */
const HEADER = /^```ya?ml\n([\s\S]*?)```/m;

/**
 * Parse one record file. Returns null when the file carries no header at all, so the caller can
 * say "this record has no header" rather than "this record has commit undefined".
 * @param {string} file @param {string} markdown
 * @returns {{file: string, commit?: string, date?: string, score?: number} | null}
 */
export function parseRecord(file, markdown) {
  const block = HEADER.exec(markdown);
  if (!block) return null;
  /** @type {Record<string, string>} */ const kv = {};
  for (const line of block[1].split('\n')) {
    const m = /^([a-z]+):\s*(.+?)\s*$/.exec(line);
    if (m) kv[m[1]] = m[2];
  }
  const score = Number(kv.score);
  return {
    file,
    commit: kv.commit,
    date: kv.date,
    score: Number.isFinite(score) ? score : undefined,
  };
}

/** Records are `docs/review/NN-*.md`; the index and the live register are not records. */
export const isRecordFile = (name) => /^\d\d-.+\.md$/.test(name);

/**
 * Rules 1-4. Pure: history questions arrive as predicates so each rule carries a mutation proof.
 * @param {Array<ReturnType<typeof parseRecord> & {file: string}>} records ordered by filename
 * @param {{commitExists: (sha: string) => boolean, isAncestor: (a: string, b: string) => boolean}} history
 * @returns {string[]}
 */
export function checkRecords(records, { commitExists, isAncestor }) {
  const problems = [];
  const seen = new Map();

  for (const r of records) {
    if (!r || !r.commit || !r.date) {
      problems.push(
        `${r?.file ?? 'a record'} has no header block naming its commit and date. ` +
          `A record that does not say which commit it describes cannot be told from a current one.`,
      );
      continue;
    }
    if (!commitExists(r.commit)) {
      problems.push(
        `${r.file} claims commit \`${r.commit}\`, which is not in this repository's history. ` +
          `A record citing a sha nobody made is a record about nothing.`,
      );
      continue;
    }
    seen.set(r.commit, r.file);
  }

  const dated = records.filter((r) => r?.commit && commitExists(r.commit));
  for (let i = 1; i < dated.length; i++) {
    const [prev, next] = [dated[i - 1], dated[i]];
    if (prev.commit !== next.commit && !isAncestor(prev.commit, next.commit)) {
      problems.push(
        `${next.file} claims \`${next.commit}\`, which is not a descendant of ${prev.file}'s ` +
          `\`${prev.commit}\`. The numbering says these records are sequential and history does not.`,
      );
    }
  }
  return problems;
}

/**
 * Rule 5 — the one that stops a stale score escaping.
 *
 * A score written as `N/100` or `N / 100` is a live claim wherever it appears outside the frozen
 * records. Inside them any score may be discussed: a record is dated, says so, and narrating
 * "36 → 45 → 61" is the point of having a series.
 *
 * @param {Record<string, string>} docs path -> contents, records already excluded
 * @param {number | null} current the newest record's score
 * @returns {string[]}
 */
export function checkScoreClaims(docs, current) {
  const problems = [];
  if (current === null || current === undefined) return problems;
  for (const [file, text] of Object.entries(docs)) {
    for (const m of text.matchAll(/(\d{1,3})\s*\/\s*100\b/g)) {
      if (Number(m[1]) !== current) {
        problems.push(
          `${file}: states a review score of "${m[1]}/100", and the current one is ${current}. ` +
            `Outside docs/review a score is a live claim — cite \`npm run status\`, or the newest ` +
            `record by name, rather than a number that was true once.`,
        );
      }
    }
  }
  return problems;
}

/**
 * The volatile half: which record is current, and how far behind HEAD. Computed, never stored.
 * @param {Array<{file: string, commit?: string, score?: number, date?: string}>} records
 * @param {{head?: string, distance?: number | null}} at
 */
export function summarizeRecords(records, { head, distance } = {}) {
  const present = records.filter(Boolean);
  const newest = present.at(-1) ?? null;
  // A record may be a verification or an audit and carry no score of its own. The live score is the
  // newest one that states a number, which is why omitting it is allowed and lying is not.
  const scored = present.filter((r) => r.score !== undefined).at(-1) ?? null;
  return {
    total: records.length,
    newest,
    scored,
    score: scored?.score ?? null,
    head,
    distance: distance ?? null,
    current: newest?.commit && head ? head.startsWith(newest.commit) : false,
  };
}
