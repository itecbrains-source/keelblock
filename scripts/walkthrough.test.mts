import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PAGE,
  SUBSTITUTIONS,
  applySubstitutions,
  fencedBlocks,
  planWalkthrough,
} from './walkthrough.mjs';

const page = () => readFileSync(PAGE, 'utf8');

describe('reading the page', () => {
  it('finds fenced blocks with their language, info string and line', () => {
    const md = ['prose', '```bash', 'echo hi', '```', 'more'].join('\n');
    expect(fencedBlocks(md)).toEqual([{ lang: 'bash', info: 'bash', code: 'echo hi', line: 2 }]);
  });

  it('leaves non-shell blocks alone — a SQL example is not a setup step', () => {
    const md = ['```sql', 'select 1;', '```'].join('\n');
    expect(planWalkthrough(fencedBlocks(md)).run).toEqual([]);
  });
});

describe('what runs, and what is allowed not to', () => {
  it('the default is RUN, so forgetting to mark a block is loud rather than silent', () => {
    const { run } = planWalkthrough(fencedBlocks('```bash\nnpm install\n```'));
    expect(run).toHaveLength(1);
  });

  it('MUTATION: a skip with no real reason is refused', () => {
    // An unexplained skip is how a walkthrough becomes a subset of itself one block at a time —
    // the same defect as a gate exempting a file with no recorded reason.
    const { problems, skipped } = planWalkthrough(
      fencedBlocks('```bash ignore later\nnpm run dev\n```'),
    );
    expect(skipped).toEqual([]);
    expect(problems.join(' ')).toContain('one block at a time');
  });

  it('a skip WITH a reason is honoured and reported', () => {
    const md = '```bash ignore starts a server the runner cannot exit\nnpm run dev\n```';
    const { run, skipped, problems } = planWalkthrough(fencedBlocks(md));
    expect(problems).toEqual([]);
    expect(run).toEqual([]);
    expect(skipped[0].why).toContain('cannot exit');
  });

  it('an unknown marker is an error, not a silent skip', () => {
    const { problems } = planWalkthrough(fencedBlocks('```bash maybe\nnpm install\n```'));
    expect(problems.join(' ')).toContain('not a marker this runner knows');
  });
});

describe('substitutions are declared, reasoned, and few', () => {
  it('every substitution carries a reason, and the list may only shrink', () => {
    for (const s of SUBSTITUTIONS)
      expect(s.why.length, `${s.find} has no reason`).toBeGreaterThan(40);
    expect(SUBSTITUTIONS).toHaveLength(1);
  });

  it('the one that exists names the deferral that will retire it', () => {
    expect(SUBSTITUTIONS[0].why).toContain('DEF-027');
  });

  it('reports what it replaced, so a page and its runner cannot drift in silence', () => {
    const { code, used } = applySubstitutions('npx create-keelblock-app my-app\ncd my-app');
    expect(used).toEqual(['npx create-keelblock-app my-app']);
    expect(code).toContain('create-keelblock-app.mjs');
    expect(code).toContain('cd my-app');
  });

  it('leaves a block it does not recognise exactly as written', () => {
    expect(applySubstitutions('npm install').code).toBe('npm install');
  });
});

describe('the real page', () => {
  it('parses, runs something, and every skip explains itself', () => {
    // Not vacuous: a page whose every block were skipped would satisfy an "it parses" test while
    // executing nothing at all.
    const { run, skipped, problems } = planWalkthrough(fencedBlocks(page()));
    expect(problems).toEqual([]);
    expect(run.length).toBeGreaterThan(3);
    for (const s of skipped) expect(s.why.length).toBeGreaterThan(11);
  });

  it('every substitution the runner declares still matches the page it claims to run', () => {
    // A substitution that matches nothing is a rule that has silently stopped applying — the same
    // shape as a stale allowance, and the reason the access matrix reports those.
    const src = page();
    for (const s of SUBSTITUTIONS)
      expect(src, `substitution "${s.find}" matches nothing in ${PAGE}`).toContain(s.find);
  });

  it('says out loud that a green run is not evidence the page teaches anything', () => {
    // The boundary from research/14-EXECUTABLE-DOCS.md. If this sentence goes, B-11's handover trial
    // has been quietly absorbed into a CI badge.
    expect(page()).toMatch(/handover trial|B-11/);
  });
});
