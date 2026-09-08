import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { evidenceLink, render, specState } from './battlecard.mjs';

const manifest = JSON.parse(readFileSync('docs/content/MANIFEST.json', 'utf8'));
const fragments = Object.fromEntries(
  readdirSync('docs/content/differentiators')
    .filter((f) => f.endsWith('.md'))
    .map((f) => [
      f.replace(/\.md$/, ''),
      readFileSync(`docs/content/differentiators/${f}`, 'utf8'),
    ]),
);
const specs = Object.fromEntries(
  readdirSync('spec')
    .filter((f) => /^SPEC-\d+/.test(f))
    .map((f) => [f.slice(0, 8), specState(readFileSync(`spec/${f}`, 'utf8'))]),
);
const yes = () => true;
const build = (over: Record<string, unknown> = {}) =>
  render({ manifest, specs, fragments, exists: yes, ...over } as never);

describe('battlecard generator', () => {
  it('the committed document is what the generator produces', () => {
    expect(readFileSync('docs/content/BATTLECARD.md', 'utf8')).toBe(
      render({ manifest, specs, fragments, exists: (p: string) => existsSync(p) } as never),
    );
  });

  it('MUTATION: a spec that moves makes the committed document stale', () => {
    // The reason this is generated rather than written. A hand-maintained status line is wrong
    // within a week and nothing notices; here the build stops and shows the diff.
    const moved = { ...specs, 'SPEC-002': { ...specs['SPEC-002'], status: 'done', done: 11 } };
    expect(build({ specs: moved })).not.toBe(readFileSync('docs/content/BATTLECARD.md', 'utf8'));
  });

  it('MUTATION: evidence that does not resolve refuses to render at all', () => {
    // Not a warning in the output — the document does not get produced. A competitive claim whose
    // citation 404s is worse than no claim, because it reads as diligence.
    expect(() => build({ exists: () => false })).toThrow(/does not resolve/);
  });

  it('MUTATION: a differentiator with no written argument refuses to render', () => {
    const missing = { ...fragments };
    delete (missing as Record<string, unknown>)['SPEC-004'];
    expect(() => build({ fragments: missing })).toThrow(/no argument fragment/);
  });

  it('derives the spec state rather than repeating a number someone typed', () => {
    const out = build();
    const s = specs['SPEC-001'];
    expect(out).toContain(`${s.done} of ${s.acs} criteria met`);
    expect(out).toContain('SPEC-001 is `done`');
  });

  it('renders deferred criteria as deferred, not as a shortfall', () => {
    // A criterion blocked on something external is not the same as one nobody did, and a
    // competitive document that conflates them is misrepresenting its own product.
    expect(build()).toMatch(/\d+ deferred with a reason/);
  });

  it('an evidence path that exists becomes a followable link; a finding becomes one too', () => {
    expect(evidenceLink('F-15', yes)).toBe('[F-15](../FINDINGS.md)');
    expect(evidenceLink('scripts/battlecard.mjs', yes)).toContain(
      '](../../scripts/battlecard.mjs)',
    );
    expect(evidenceLink('scripts/nope.mjs', () => false)).toBeNull();
  });

  it('specState reads a real spec, not a fixture', () => {
    const s = specState(readFileSync('spec/SPEC-004-auth.md', 'utf8'));
    // The SHAPE, not a value. Pinning `partial` here made this test fail the day SPEC-004 closed —
    // a test that breaks when the thing it reads works correctly is testing the fixture.
    expect(['draft', 'partial', 'done']).toContain(s.status);
    expect(s.reqs).toBeGreaterThan(5);
    expect(s.done + s.deferred).toBeLessThanOrEqual(s.acs);
  });
});
