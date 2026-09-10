import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripFences, stripHtmlComments } from './prose.mjs';
import { execFileSync } from 'node:child_process';
import {
  checkRecords,
  checkScoreClaims,
  isRecordFile,
  parseRecord,
  summarizeRecords,
} from './review-records.mjs';

const header = (commit: string, score: number, date = '2026-09-08') =>
  '```yaml\nrecord: 07\ncommit: ' +
  commit +
  '\ndate: ' +
  date +
  '\nscore: ' +
  score +
  '\n```\n\n# x';

/** History where every sha exists and each listed sha is an ancestor of the next. */
const linear = (order: string[]) => ({
  commitExists: (sha: string) => order.includes(sha),
  isAncestor: (a: string, b: string) => order.indexOf(a) < order.indexOf(b),
});

describe('review records — the header', () => {
  it('reads commit, date and score', () => {
    expect(parseRecord('07-x.md', header('abc1234', 69))).toEqual({
      file: '07-x.md',
      commit: 'abc1234',
      date: '2026-09-08',
      score: 69,
    });
  });

  it('returns null when there is no header at all', () => {
    expect(parseRecord('07-x.md', '# just prose')).toBeNull();
  });

  it('tells records from the index and the live register', () => {
    expect(isRecordFile('07-RESCORE-AUTH.md')).toBe(true);
    expect(isRecordFile('README.md')).toBe(false);
    expect(isRecordFile('DISPOSITIONS.md')).toBe(false);
  });
});

describe('review records — history', () => {
  const history = linear(['aaa', 'bbb', 'ccc']);

  it('passes a well-formed, ordered series', () => {
    const records = [
      parseRecord('06-a.md', header('aaa', 61)),
      parseRecord('07-b.md', header('bbb', 69)),
    ];
    expect(checkRecords(records as never, history)).toEqual([]);
  });

  it('MUTATION: a record with no header fails, and the message names it', () => {
    // parseRecord returns null, so the caller supplies the name — a message that cannot say WHICH
    // record is broken sends a reader to read all of them (SPEC-002 REQ-8).
    const records = [parseRecord('07-b.md', '# no header here') ?? { file: '07-b.md' }];
    const problems = checkRecords(records as never, history);
    expect(problems.join(' ')).toMatch(/no header block/);
    expect(problems.join(' ')).toContain('07-b.md');
  });

  it('MUTATION: a record citing a sha nobody made fails', () => {
    const records = [parseRecord('07-b.md', header('deadbee', 69))];
    expect(checkRecords(records as never, history).join(' ')).toMatch(/not in this repository/);
  });

  it('several records about ONE tree are fine — a review is many documents', () => {
    const records = [
      parseRecord('00-a.md', header('bbb', 36)),
      parseRecord('01-b.md', header('bbb', 36)),
    ];
    expect(checkRecords(records as never, history)).toEqual([]);
  });

  it('a record may carry no score; the live one is the newest that does', () => {
    const noScore = '```yaml\nrecord: 05\ncommit: bbb\ndate: 2026-09-08\n```\n\n# x';
    const records = [parseRecord('04-a.md', header('aaa', 36)), parseRecord('05-b.md', noScore)];
    expect(checkRecords(records as never, history)).toEqual([]);
    expect(summarizeRecords(records as never, { head: 'bbb' }).score).toBe(36);
  });

  it('MUTATION: a record whose commit precedes its predecessor fails', () => {
    const records = [
      parseRecord('06-a.md', header('ccc', 61)),
      parseRecord('07-b.md', header('aaa', 69)),
    ];
    expect(checkRecords(records as never, history).join(' ')).toMatch(/not a descendant/);
  });

  it('a record behind HEAD is reported, never a failure', () => {
    const records = [parseRecord('07-b.md', header('bbb', 69))];
    expect(checkRecords(records as never, history)).toEqual([]);
    const state = summarizeRecords(records as never, { head: 'ccc', distance: 4 });
    expect(state.current).toBe(false);
    expect(state.distance).toBe(4);
    expect(state.score).toBe(69);
  });
});

describe('review records — the score is a live claim outside them', () => {
  it('passes when a document cites the current score', () => {
    expect(checkScoreClaims({ 'README.md': 'scored 69/100 today' }, 69)).toEqual([]);
  });

  it('MUTATION: a document citing a superseded score fails', () => {
    const problems = checkScoreClaims({ 'README.md': 'we score 36/100' }, 69);
    expect(problems.join(' ')).toMatch(/current one is 69/);
  });

  it('MUTATION: spacing does not launder it', () => {
    expect(checkScoreClaims({ 'docs/PRODUCT.md': 'a solid 45 / 100' }, 69)).toHaveLength(1);
  });

  it('says nothing when there is no record to be current', () => {
    expect(checkScoreClaims({ 'README.md': '36/100' }, null)).toEqual([]);
  });
});

describe('shallow history', () => {
  const records = [
    { file: 'docs/review/00-VERDICT.md', record: '00', commit: 'abc1234', date: '2026-09-08' },
  ];

  it('MUTATION: a shallow clone reports the real cause, not a fabricated sha', () => {
    // CI run 34261942642 failed with "a record citing a sha nobody made" for all eight records.
    // Every sha was real; the checkout had fetched one commit. A misleading gate message sends the
    // reader hunting for a forged record, which is worse than the failure it is reporting.
    const p = checkRecords(records as never, {
      commitExists: () => false,
      isAncestor: () => true,
      shallow: true,
    });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/history is shallow/);
    expect(p[0]).toMatch(/fetch-depth: 0/);
    expect(p[0]).not.toMatch(/nobody made/);
  });

  it('still FAILS on a shallow clone — it does not skip', () => {
    // The tempting fix is to pass when history is unavailable. That turns the rule off precisely
    // where it runs unattended.
    expect(
      checkRecords(records as never, {
        commitExists: () => true,
        isAncestor: () => true,
        shallow: true,
      }),
    ).toHaveLength(1);
  });

  it('with full history, a genuinely absent commit still reads as fabricated', () => {
    const p = checkRecords(records as never, {
      commitExists: () => false,
      isAncestor: () => true,
      shallow: false,
    });
    expect(p[0]).toMatch(/not in this repository's history/);
  });
});

describe('the review folder does not claim independence it does not have', () => {
  /**
   * `docs/review/` was labelled an "external review". It is a session the owner ran, and DEF-020
   * already draws that line — "a session the author spawned is not one".
   *
   * The first version of this rule had three defects, all found by the lens seat rather than by it
   * misfiring, and all three are the rule's own subject matter:
   *
   *   · It exempted any line containing `2026-09-10`, and dating the folder is the most natural
   *     sentence anyone would write about it. Now a line naming `docs/review` is an offender
   *     REGARDLESS of the date, and the date only exempts lines that are talking about the later,
   *     genuinely external review.
   *   · It hand-listed five files. Ten markdown files mention `docs/review`; eight went unscanned.
   *     "The relabel missed a file" recurring inside the rule written to prevent it — so the file
   *     list is now derived from the repository instead of typed.
   *   · Its docblock claimed comments were stripped "per AGENTS.md" while calling two strippers
   *     that do not know what `<!-- -->` is. A claimed mitigation that does not apply is worse than
   *     an absent one. `stripHtmlComments` now exists, and this file uses it.
   */
  const OFFENCE = /\bexternal review\b/i;
  /** Lines that are legitimately about the 2026-09-10 review, or are correcting the label itself. */
  const EXEMPT = /not an external review|genuinely external|labelled "external"|2026-09-10/i;

  /** Every tracked markdown file. Derived, because typing the list is the defect being fixed. */
  const markdownFiles = (): string[] =>
    execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean);

  /**
   * A QUOTED phrase is a mention, not a use — the distinction this whole defect family is about.
   * `F-75 says the folder "was labelled an external review"` is reporting what a document said; it
   * is not the document saying it. Without this the rule fires on the finding that documents the
   * rule, which it did, on its first widened run — the sixth occurrence of the class and the first
   * one caught before it was committed.
   *
   * Applied to the WHOLE document, not per line, and position-preserving like the strippers it sits
   * beside. Markdown wraps: an inline code span opened on one line routinely closes on the next, and
   * a line-scoped version misses exactly those — which it did, on this file's own write-up, one run
   * after the use/mention rule was added to fix the previous miss.
   */
  const unquote = (text: string) =>
    text.replace(/"[^"]*"|`[^`]*`|“[^”]*”/g, (m) => m.replace(/[^\n]/g, ' '));

  /** Pure, so the rule carries proofs that do not need files on disk. Exported shape: offenders. */
  const scan = (file: string, text: string): string[] => {
    const rawLines = stripHtmlComments(stripFences(text)).split('\n');
    const scanLines = unquote(stripHtmlComments(stripFences(text))).split('\n');
    const out: string[] = [];
    scanLines.forEach((line: string, i: number) => {
      const raw = rawLines[i] ?? '';
      if (!OFFENCE.test(line)) return;
      // Naming the folder on the same line is decisive: no date rescues it.
      const namesFolder = /docs\/review/.test(raw);
      if (!namesFolder && EXEMPT.test(raw)) return;
      out.push(`${file}:${i + 1} — ${raw.trim().slice(0, 80)}`);
    });
    return out;
  };

  it('no markdown file in the repository calls docs/review an external review', () => {
    const offenders = markdownFiles().flatMap((f) => scan(f, readFileSync(f, 'utf8')));
    expect(
      offenders,
      `docs/review/ is an adversarial review by a session the owner ran, not an external one ` +
        `(DEF-020: "a session the author spawned is not one")`,
    ).toEqual([]);
  });

  it('scans every markdown file that mentions the folder, not a hand-written five', () => {
    const mentioning = markdownFiles().filter((f) =>
      readFileSync(f, 'utf8').includes('docs/review'),
    );
    // The list this replaced named five. The defect was that it named any.
    expect(mentioning.length).toBeGreaterThan(5);
  });

  // ── mutation proofs · B-4: every gate has a proof it can fail ───────────────

  it('MUTATION: the plain phrase is caught', () => {
    expect(scan('README.md', 'keel had an external review in September.')).toHaveLength(1);
  });

  it('MUTATION: a date does not rescue a line that names the folder', () => {
    // The blind spot the lens found. "docs/review is an external review, 2026-09-10" was exempt.
    const line = '`docs/review/` is an external review, dated 2026-09-10.';
    expect(scan('docs/review/HANDOVER.md', line)).toHaveLength(1);
  });

  it('MUTATION: a file outside the old hand-written list is caught', () => {
    expect(scan('CONTRIBUTING.md', 'See the external review for context.')).toHaveLength(1);
  });

  it('the 2026-10 review is genuinely external and may be called so', () => {
    expect(
      scan('docs/FINDINGS.md', '**2026-09-10 · reported by the external review · fixed**'),
    ).toEqual([]);
    expect(
      scan('docs/review/README.md', '> **Not an external review**, and the label is corrected.'),
    ).toEqual([]);
  });

  it('MUTATION: the phrase inside an HTML comment is not a use of it', () => {
    // The third defect: markdown comments were not stripped, and the docblock said they were.
    expect(scan('AGENTS.md', '<!-- never write external review here -->')).toEqual([]);
  });

  it('MUTATION: a quoted mention is not a use, but an unquoted one still is', () => {
    // The sixth occurrence, caught before commit: F-75's write-up quotes the old label to explain
    // what was wrong with it, and the widened rule reported all three lines.
    expect(scan('docs/FINDINGS.md', 'It was labelled an "external review" until today.')).toEqual(
      [],
    );
    expect(
      scan('docs/FINDINGS.md', 'It was labelled an external review until today.'),
    ).toHaveLength(1);
  });

  it('a fenced example is not a claim either', () => {
    expect(scan('README.md', '```\\nexternal review\\n```')).toEqual([]);
  });
});
