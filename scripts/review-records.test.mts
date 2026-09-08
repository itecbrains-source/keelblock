import { describe, expect, it } from 'vitest';
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
