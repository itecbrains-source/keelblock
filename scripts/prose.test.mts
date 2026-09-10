import { describe, expect, it } from 'vitest';
import { stripComments, stripFences } from './prose.mjs';

/**
 * The rule these helpers exist for: a gate must react to what a file INSTRUCTS, never to what it
 * DISPLAYS. Every mutation proof below is a real false positive that a gate produced, reproduced
 * against a realistic piece of documentation rather than a fixture invented to fail.
 */

describe('stripComments', () => {
  it('blanks comments and preserves every other position', () => {
    const src = `const a = 1; // trailing\n/* block */ const b = 2;`;
    const out = stripComments(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(2);
    expect(out).toContain('const a = 1;');
    expect(out).toContain('const b = 2;');
    expect(out).not.toContain('trailing');
    expect(out).not.toContain('block');
  });

  it('MUTATION: a comment quoting a t() call is not a call site', () => {
    // F-64's own docblock did this and check 2 reported a key that does not exist.
    expect(stripComments(`/** see t('ghost') */\nt('real')`)).not.toContain('ghost');
    expect(stripComments(`/** see t('ghost') */\nt('real')`)).toContain(`t('real')`);
  });

  it('MUTATION: line numbers survive a multi-line block comment', () => {
    // findRawLinkImports reports `file:line`. Collapsing a comment instead of blanking it would
    // keep the rule correct and make every position it prints wrong, which is worse than either.
    const src = `/*\n * three\n * lines\n */\nimport Link from 'next/link';`;
    const lines = stripComments(src).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe(`import Link from 'next/link';`);
  });

  it('MUTATION: a comment opener inside a string literal is not a comment', () => {
    // The reason this uses the compiler's scanner. The obvious regex treats the `/*` below as an
    // opening and blanks real code until the next `*/`, turning a loud false positive into a silent
    // false negative — the one direction a gate must never fail in.
    const src = `const glob = '/*'; const keep = 1;`;
    expect(stripComments(src)).toBe(src);
  });

  it('a comment marker inside a template literal or regex is left alone', () => {
    expect(stripComments('const r = /a\\/\\/b/; const t = `x // y`;')).toBe(
      'const r = /a\\/\\/b/; const t = `x // y`;',
    );
  });
});

describe('stripFences', () => {
  it('blanks fenced blocks and preserves line numbers', () => {
    const md = `intro\n\`\`\`\nfenced\n\`\`\`\noutro`;
    expect(stripFences(md).split('\n')).toEqual(['intro', '', '', '', 'outro']);
  });

  it('MUTATION: an example AC row inside a fence is not a criterion', () => {
    // check-contracts reported SPEC-004 for citing evidence nobody can open, from a block whose
    // whole purpose was to show what the table looks like.
    const md =
      'How the table reads:\n\n```\n| AC-99 | REQ-1 | test | `src/not-real.ts` | done |\n```\n';
    expect(stripFences(md)).not.toContain('AC-99');
  });

  it('MUTATION: an example bar row inside a fence is not a promise', () => {
    const md = '```\n| B-99 | an example claim | SPEC-999 |\n```';
    expect(stripFences(md)).not.toContain('B-99');
  });

  it('MUTATION: an example citation inside a fence is not a citation', () => {
    const md = '```\nCite like [this](docs/not-a-real-file.md).\n```';
    expect(stripFences(md)).not.toContain('not-a-real-file');
  });

  it('a real row outside a fence still survives — the direction that matters', () => {
    const md = '| B-1 | a real promise | SPEC-001 |';
    expect(stripFences(md)).toBe(md);
  });

  it('an inline code span is left alone, because gates read those as real citations', () => {
    const md = 'The evidence is `src/lib/auth/providers.ts`.';
    expect(stripFences(md)).toBe(md);
  });

  it('a longer fence contains a shorter one without ending early', () => {
    const md = '````\n```\ninner\n```\n````\nafter';
    const out = stripFences(md);
    expect(out).not.toContain('inner');
    expect(out.split('\n')).toHaveLength(6);
    expect(out.split('\n')[5]).toBe('after');
  });

  it('a tilde fence closes on tildes, not on backticks', () => {
    expect(stripFences('~~~\nhidden\n```\nstill hidden\n~~~\nout')).not.toContain('hidden');
  });
});
