import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, replaceBlock, titleOf } from './readme-state.mjs';

/**
 * The README's state block is generated — SPEC-003's promise that nothing derived is stale, applied
 * to the file people actually land on.
 *
 * It exists because that paragraph has been wrong in BOTH directions: F-82 found it calling shipped
 * work unbuilt for nine days, and a later audit found it listing passkeys, 2FA and email
 * verification — none of which appear anywhere in `src/` — under a heading that reads as shipped.
 */

const catalog = {
  specs: [
    { id: 'SPEC-001', status: 'done', acs: ['done', 'done'] },
    { id: 'SPEC-007', status: 'partial', acs: ['done', 'done', 'planned'] },
    { id: 'SPEC-016', status: 'draft', acs: ['planned'] },
  ],
};
const files = ['SPEC-001-tenancy-foundation.md', 'SPEC-007-billing.md', 'SPEC-016-release.md'];
const read = (p: string) =>
  ({
    'spec/SPEC-001-tenancy-foundation.md': '# SPEC-001: Tenancy foundation\n',
    'spec/SPEC-007-billing.md': '# SPEC-007: Billing\n',
    'spec/SPEC-016-release.md': '# SPEC-016: Release preflight\n',
  })[p] ?? '';

describe('the README state block is computed, not typed', () => {
  it('splits the catalog into built, partly built, and not built', () => {
    const block = render(catalog, files, read);
    expect(block).toContain('Tenancy foundation (`SPEC-001`)');
    expect(block).toContain('Billing (`SPEC-007`, 2 of 3)');
    expect(block).toContain('Release preflight (`SPEC-016`)');
  });

  it('MUTATION: a spec that flips status moves group, so the block cannot stay behind', () => {
    // The F-82 defect, mechanically: a spec ships and the README keeps saying it has not.
    const before = render(catalog, files, read);
    const after = render(
      { specs: catalog.specs.map((s) => (s.id === 'SPEC-016' ? { ...s, status: 'done' } : s)) },
      files,
      read,
    );
    expect(before).not.toEqual(after);
    expect(after).toMatch(/Built[^]*Release preflight/);
  });

  it('MUTATION: one more criterion met changes the block', () => {
    const after = render(
      {
        specs: catalog.specs.map((s) =>
          s.id === 'SPEC-007' ? { ...s, acs: ['done', 'done', 'done'] } : s,
        ),
      },
      files,
      read,
    );
    expect(after).toContain('Billing (`SPEC-007`, 3 of 3)');
  });

  it('a title comes from the spec file, and backticks are stripped', () => {
    expect(
      titleOf('SPEC-011', () => '# SPEC-011: `create-keelblock-app`\n', ['SPEC-011-x.md']),
    ).toBe('create-keelblock-app');
  });

  it('every group is labelled even when empty — silence would read as "none exist"', () => {
    const empty = render({ specs: [] }, [], read);
    expect(empty).toContain('_none yet_');
    expect(empty).toContain('_none_');
  });
});

describe('the markers own the region', () => {
  const block = 'BLOCK';
  const doc = (inner: string) =>
    `before\n<!-- BEGIN:generated:state -->${inner}<!-- END:generated:state -->\nafter`;

  it('replaces only what is between them', () => {
    const out = replaceBlock(
      doc('\nold\n'),
      '<!-- BEGIN:generated:state -->new<!-- END:generated:state -->',
    );
    expect(out).toContain('before');
    expect(out).toContain('after');
    expect(out).not.toContain('old');
  });

  it('MUTATION: deleting the markers is refused, not silently ignored', () => {
    // Otherwise the escape hatch is to remove two comments, and the file quietly returns to
    // hand-maintained claims — which is the defect, not a workaround for it.
    expect(() => replaceBlock('a README with no markers', block)).toThrow(/missing the/);
  });

  it('MUTATION: crossed markers are refused rather than producing nonsense', () => {
    expect(() =>
      replaceBlock('<!-- END:generated:state --> x <!-- BEGIN:generated:state -->', block),
    ).toThrow(/wrong order/);
  });

  it('the real README carries the markers', () => {
    // Non-vacuous: if someone removes them the generator throws, but this says so in one line at the
    // point a reader of the test suite is looking.
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('<!-- BEGIN:generated:state -->');
    expect(readme).toContain('<!-- END:generated:state -->');
  });
});
