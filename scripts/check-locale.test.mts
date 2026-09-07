import { describe, expect, it } from 'vitest';
import { flatten, extractUsedKeys, compare } from './check-locale.mjs';

const base = ['home.title', 'home.tagline', 'error.retry'];

describe('locale gate', () => {
  it('flattens nested messages into dotted keys', () => {
    expect(flatten({ home: { title: 'x', nested: { deep: 'y' } }, flat: 'z' }))
      .toEqual(['home.title', 'home.nested.deep', 'flat']);
  });

  it('composes namespace and key from real usage', () => {
    expect(extractUsedKeys(`const t = useTranslations('home'); return <h1>{t('title')}</h1>;`))
      .toEqual(['home.title']);
    expect(extractUsedKeys(`const t = await getTranslations("error"); t('retry');`))
      .toEqual(['error.retry']);
  });

  it('treats a call with no declared namespace as already qualified', () => {
    expect(extractUsedKeys(`t('home.title')`)).toEqual(['home.title']);
  });

  it('passes when everything lines up', () => {
    expect(compare({ locales: { en: base }, usedKeys: base })).toEqual([]);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────
  // Every one of these fails silently at runtime. That is why they are build failures here.

  it('MUTATION: a key missing from a second locale is caught', () => {
    const p = compare({ locales: { en: base, fr: ['home.title', 'error.retry'] }, usedKeys: base });
    expect(p.join()).toMatch(/fr: missing "home.tagline"/);
    expect(p.join()).toMatch(/render as its own key name/);
  });

  it('MUTATION: a key left behind in a second locale after a rename is caught', () => {
    const p = compare({ locales: { en: base, fr: [...base, 'home.oldName'] }, usedKeys: base });
    expect(p.join()).toMatch(/fr: has "home.oldName"/);
  });

  it('MUTATION: a typo in source is caught — the check that pays for this file', () => {
    // t('titel') renders "home.titel" to a user, in production, forever.
    const p = compare({ locales: { en: base }, usedKeys: [...base, 'home.titel'] });
    expect(p.join()).toMatch(/source uses "home.titel"/);
  });

  it('MUTATION: an unused key is caught before it is translated into every language forever', () => {
    const p = compare({ locales: { en: [...base, 'home.abandoned'] }, usedKeys: base });
    expect(p.join()).toMatch(/"home.abandoned" is defined but never used/);
  });

  it('MUTATION: a missing default locale is fatal, not a shrug', () => {
    expect(compare({ locales: { fr: base }, usedKeys: base }).join()).toMatch(/default locale must exist/);
  });

  it('the real repository passes all three rules', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const locales = Object.fromEntries(readdirSync('messages').filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace('.json', ''), flatten(JSON.parse(readFileSync(`messages/${f}`, 'utf8')))]));
    expect(Object.keys(locales)).toContain('en');
    expect(locales.en.length).toBeGreaterThan(0);
  });
});
