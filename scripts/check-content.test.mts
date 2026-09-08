import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { findingIds, parseFaq, checkContent } from './check-content.mjs';

const manifest = JSON.parse(readFileSync('docs/content/MANIFEST.json', 'utf8'));
const findings = findingIds(readFileSync('docs/FINDINGS.md', 'utf8'));
const faq = parseFaq(readFileSync('docs/FAQ.md', 'utf8'));
const yes = () => true;
const tiny = { $destinations: { blog: '', internal: '' }, material: [{ id: 'F-1', to: ['blog'] }] };

describe('content gate', () => {
  it('the real repository routes every finding and cites every answer', () => {
    expect(checkContent(manifest, findings, faq, (p: string) => existsSync(p))).toEqual([]);
  });

  it('finds every finding in FINDINGS.md', () => {
    expect(findings.length).toBeGreaterThanOrEqual(22);
    expect(findings).toContain('F-1');
  });

  it('reads FAQ questions and their in-repo citations', () => {
    expect(faq.length).toBeGreaterThanOrEqual(10);
    expect(faq.every((f) => f.q.length > 0)).toBe(true);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a new finding routed nowhere is caught the day it lands', () => {
    // The whole mechanism: route it now, while the reasoning is fresh, or mine it later and lose it.
    const p = checkContent(tiny, ['F-1', 'F-99'], [], yes);
    expect(p[0]).toMatch(/routed nowhere/);
    expect(p[0]).toMatch(/never fresher than today/);
  });

  it('MUTATION: a routed finding that has been deleted is caught', () => {
    expect(checkContent(tiny, [], [], yes)[0]).toMatch(/no longer exists/);
  });

  it('MUTATION: an invented destination is caught', () => {
    const m = { ...tiny, material: [{ id: 'F-1', to: ['newsletter'] }] };
    expect(checkContent(m, ['F-1'], [], yes)[0]).toMatch(/not a declared destination/);
  });

  it('MUTATION: internal without a reason is caught — that is how material gets buried', () => {
    const m = { ...tiny, material: [{ id: 'F-1', to: ['internal'] }] };
    expect(checkContent(m, ['F-1'], [], yes)[0]).toMatch(/quietly buried/);
  });

  it('internal WITH a reason is a legitimate decision', () => {
    const m = {
      ...tiny,
      material: [{ id: 'F-1', to: ['internal'], angle: 'too tool-specific to generalise' }],
    };
    expect(checkContent(m, ['F-1'], [], yes)).toEqual([]);
  });

  it('MUTATION: an uncited FAQ answer is caught', () => {
    const p = checkContent(tiny, ['F-1'], [{ q: 'Is it secure?', cites: [] }], yes);
    expect(p[0]).toMatch(/cites nothing/);
  });

  it('MUTATION: an FAQ citing a file that does not exist is caught', () => {
    const p = checkContent(tiny, ['F-1'], [{ q: 'Q', cites: ['GONE.md'] }], () => false);
    expect(p[0]).toMatch(/does not exist/);
  });

  it('an outbound URL is not a citation here — only something in this repository is', () => {
    // Linking to someone else's page proves nothing about keel.
    expect(
      parseFaq('### Q\n\nSee [docs](https://example.com/x) and [real](FINDINGS.md).')[0].cites,
    ).toEqual(['FINDINGS.md']);
  });
});
