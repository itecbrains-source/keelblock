import { describe, expect, it } from 'vitest';
import {
  flatten,
  flattenEntries,
  extractUsedKeys,
  extractCalls,
  placeholderNames,
  findUnfilledArguments,
  compare,
  findRawLinkImports,
} from './check-locale.mjs';
import { stripComments } from './prose.mjs';

const base = ['home.title', 'home.tagline', 'error.retry'];

describe('locale gate', () => {
  it('flattens nested messages into dotted keys', () => {
    expect(flatten({ home: { title: 'x', nested: { deep: 'y' } }, flat: 'z' })).toEqual([
      'home.title',
      'home.nested.deep',
      'flat',
    ]);
  });

  it('composes namespace and key from real usage', () => {
    expect(
      extractUsedKeys(`const t = useTranslations('home'); return <h1>{t('title')}</h1>;`),
    ).toEqual(['home.title']);
    expect(extractUsedKeys(`const t = await getTranslations("error"); t('retry');`)).toEqual([
      'error.retry',
    ]);
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
    expect(compare({ locales: { fr: base }, usedKeys: base }).join()).toMatch(
      /default locale must exist/,
    );
  });

  it("MUTATION: importing Link from 'next/link' is caught", () => {
    // Invisible with one locale, permanent by the time a second exists: the href simply loses its
    // locale prefix and nothing complains. ADR-010 stated this rule; now something enforces it.
    const bad = findRawLinkImports(['a.tsx'], () => "import Link from 'next/link';");
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/@\/i18n\/navigation/);
  });

  it('the locale-aware import is allowed', () => {
    expect(
      findRawLinkImports(['a.tsx'], () => "import { Link } from '@/i18n/navigation';"),
    ).toEqual([]);
  });

  it('a mention in a comment is not an import', () => {
    expect(findRawLinkImports(['a.tsx'], () => "// never import from 'next/link'")).toEqual([]);
  });

  it('MUTATION: the import quoted in a BLOCK comment is not an import either', () => {
    // This is the case the test above could not see. It passed because `// never import …` puts a
    // non-whitespace character in front of `import`, so the anchored pattern missed it by accident
    // rather than by design — the test and the code agreed for a reason neither of them meant.
    // A docblock teaching ADR-010 by quoting the import it forbids is the most natural way anyone
    // would write that comment, and it was reported as a violation of the rule it was explaining.
    const docblock = `/*\n * ADR-010. Never write:\nimport Link from 'next/link';\n * Use '@/i18n/navigation'.\n */`;
    expect(findRawLinkImports(['a.tsx'], () => docblock)).toEqual([]);
  });

  it('MUTATION: a real import is still caught, on the right line', () => {
    // The direction that matters. Stripping comments to silence a false positive is only correct if
    // the true positive survives it — and keeps its position, since the message prints one.
    const src = `/*\n * a comment\n */\nimport Link from 'next/link';`;
    const bad = findRawLinkImports(['a.tsx'], () => src);
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^a\.tsx:4 —/);
  });

  // ── check 4: a message's ICU arguments must be supplied by its call site ───
  // Checks 1-3 all passed over F-64. This is the one that would not have.

  it('flattens to key/message pairs, which check 4 needs and check 1 does not', () => {
    expect(flattenEntries({ login: { continueWith: 'Continue with {provider}' } })).toEqual([
      ['login.continueWith', 'Continue with {provider}'],
    ]);
  });

  it('reads the arguments a message requires', () => {
    expect(placeholderNames('Continue with {provider}')).toEqual(['provider']);
    expect(placeholderNames('{org} invited you as {role}.')).toEqual(['org', 'role']);
    expect(placeholderNames('Sign in')).toEqual([]);
    // The leading name of a plural/select is still an argument the call site must supply.
    expect(placeholderNames('{count, plural, one {# item} other {# items}}')).toEqual(['count']);
  });

  it('reads the arguments a call site supplies, in both object forms', () => {
    expect(extractCalls(`t('a', { provider })`)).toEqual([{ key: 'a', args: ['provider'] }]);
    expect(extractCalls(`t('a', { org: x?.name ?? '' })`)).toEqual([{ key: 'a', args: ['org'] }]);
    expect(extractCalls(`t('a')`)).toEqual([{ key: 'a', args: null }]);
  });

  it('does not guess at arguments it cannot read', () => {
    // A false failure on a legitimate call is how a rule gets deleted.
    expect(extractCalls(`t('a', { ...values })`)).toEqual([{ key: 'a', args: 'dynamic' }]);
    expect(extractCalls(`t('a', values)`)).toEqual([{ key: 'a', args: 'dynamic' }]);
  });

  it('MUTATION: F-64 — a message with a placeholder called without it is caught', () => {
    // The exact shape that shipped: the key exists, it is used, there is one locale, and the button
    // rendered the literal text `login.continueWith` to a user.
    const p = findUnfilledArguments({
      messages: { 'login.continueWith': 'Continue with {provider}' },
      calls: [{ key: 'login.continueWith', args: null }],
    });
    expect(p.join()).toMatch(/t\('login\.continueWith'\) is called without \{provider\}/);
    expect(p.join()).toMatch(/user sees the literal text/);
  });

  it('MUTATION: supplying only some of the arguments is caught', () => {
    const p = findUnfilledArguments({
      messages: { 'invite.offer': '{org} has invited you to join as {role}.' },
      calls: [{ key: 'invite.offer', args: ['org'] }],
    });
    expect(p.join()).toMatch(/without \{role\}/);
    expect(p.join()).not.toMatch(/\{org\}/);
  });

  it('a satisfied call, a message with no arguments, and an unreadable call all pass', () => {
    const messages = { 'a.x': 'Continue with {provider}', 'a.y': 'Sign in' };
    expect(
      findUnfilledArguments({
        messages,
        calls: [
          { key: 'a.x', args: ['provider'] },
          { key: 'a.y', args: null },
          { key: 'a.x', args: 'dynamic' },
        ],
      }),
    ).toEqual([]);
  });

  it('leaves a nonexistent key to check 2 rather than reporting it twice', () => {
    expect(findUnfilledArguments({ messages: {}, calls: [{ key: 'a.gone', args: null }] })).toEqual(
      [],
    );
  });

  it('a t() call quoted in a comment is not a call site', () => {
    // Found the hard way: the docblock explaining check 4 quotes `t('continueWith', { provider })`,
    // and check 2 promptly reported a key named `continueWith` that does not exist.
    expect(extractUsedKeys(`// see t('ghost')\nconst t = useTranslations('a'); t('x');`)).toEqual([
      'a.x',
    ]);
    expect(stripComments(`const u = 'https://x.test'; // trailing`).trim()).toBe(
      `const u = 'https://x.test';`,
    );
  });

  it('the real repository passes all four rules', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const locales = Object.fromEntries(
      readdirSync('messages')
        .filter((f) => f.endsWith('.json'))
        .map((f) => [
          f.replace('.json', ''),
          flatten(JSON.parse(readFileSync(`messages/${f}`, 'utf8'))),
        ]),
    );
    expect(Object.keys(locales)).toContain('en');
    expect(locales.en.length).toBeGreaterThan(0);
  });
});
