#!/usr/bin/env node
/**
 * The locale gate.
 *
 * i18n fails quietly: a missing key renders its own name, a stale key lingers forever, and a typo
 * ships. None of that breaks a build or a test, so it is found by a user in a language nobody on the
 * team reads. Four checks, all structural:
 *
 *   1. every locale carries exactly the default locale's keys — no missing, no extra
 *   2. every `t('key')` in the source resolves to a key that exists
 *   3. every key in the messages is actually used
 *   4. every message with ICU arguments is called with them
 *
 * Check 2 is the one that pays for the file: it turns a typo from a runtime surprise into a build
 * failure. Adapted from `boxyhq/saas-starter-kit`'s `check-locale`, which does (1).
 *
 * Check 4 exists because checks 1-3 all passed over F-64. `t('continueWith')` against
 * "Continue with {provider}" satisfies every one of them — the key exists, it is used, and there is
 * only one locale — and next-intl then refuses to format a message with an unfilled placeholder and
 * returns the key path, so a shipped button read `login.continueWith`. That is the same shape as
 * F-62: the gate checked that the link EXISTS, not that it WORKS. Whether a message's placeholders
 * are satisfied by its call site is decidable from the two inputs this file already parses.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { stripComments } from './prose.mjs';

const MESSAGES = 'messages';
const SRC = 'src';
const DEFAULT_LOCALE = 'en';

/** Flatten `{a:{b:1}}` to `['a.b']`. Exported for tests. */
export function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

/**
 * Extract `namespace.key` pairs from source. A file declares a namespace with
 * `useTranslations('ns')` / `getTranslations('ns')`, then calls `t('key')`.
 * Exported for tests.
 */
export function extractUsedKeys(raw) {
  const source = stripComments(raw);
  const namespaces = [...source.matchAll(/(?:use|get)Translations\(\s*['"]([\w.]+)['"]/g)].map(
    (m) => m[1],
  );
  const calls = [...source.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1]);
  // With no declared namespace, a t('a.b') call is already fully qualified.
  if (namespaces.length === 0) return calls;
  return calls.flatMap((key) => namespaces.map((ns) => `${ns}.${key}`));
}

/** Flatten to `[key, message]` pairs — check 4 needs the values, not just the names. */
export function flattenEntries(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flattenEntries(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v]],
  );
}

/**
 * The ICU arguments a message requires: `{provider}` and the leading name of `{count, plural, …}`.
 * Exported for tests.
 */
export function placeholderNames(message) {
  if (typeof message !== 'string') return [];
  return [...new Set([...message.matchAll(/\{\s*([a-zA-Z_$][\w$]*)\s*[,}]/g)].map((m) => m[1]))];
}

/**
 * Every `t('key', { … })` call with the argument names it passes.
 *
 * `args` is `null` when the call passes nothing, an array of names when it passes an object literal,
 * and `'dynamic'` when something is passed that cannot be read statically (a spread, a variable).
 * `'dynamic'` is not checked — a false build failure on a legitimate call would get this rule
 * deleted, which costs more than the calls it would catch.
 *
 * Only plain `t(` matches, so `t.raw('key')` is exempt by construction: it is next-intl's documented
 * opt-out of formatting and returns the message untouched. That is a real gap — "fix" F-64 with
 * `t.raw` plus `.replace()` and this rule goes quiet — and it is named here rather than closed,
 * because `.replace()` is the thing check 4 is arguing against, not the thing it can detect.
 *
 * Exported for tests.
 */
export function extractCalls(raw) {
  const source = stripComments(raw);
  const namespaces = [...source.matchAll(/(?:use|get)Translations\(\s*['"]([\w.]+)['"]/g)].map(
    (m) => m[1],
  );
  const calls = [];
  for (const m of source.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) {
    calls.push({ key: m[1], args: readArgs(source.slice(m.index + m[0].length)) });
  }
  // With no declared namespace, a t('a.b') call is already fully qualified.
  if (namespaces.length === 0) return calls;
  return calls.flatMap((c) => namespaces.map((ns) => ({ ...c, key: `${ns}.${c.key}` })));
}

/** The text immediately after a matched key, up to and including the argument object. */
function readArgs(rest) {
  const after = rest.match(/^\s*,\s*/);
  if (!after) return null;
  const body = balancedObject(rest.slice(after[0].length));
  if (body === null || body.includes('...')) return 'dynamic';
  // Nested objects collapse away so only the top level's names remain. A ternary inside a value can
  // contribute a spurious name, which is harmless: the check asks whether the REQUIRED names are
  // present, so an extra one can never manufacture a failure.
  let flat = body;
  while (/\{[^{}]*\}/.test(flat)) flat = flat.replace(/\{[^{}]*\}/g, '');
  return flat
    .split(',')
    .map((part) => {
      // `{ provider }` and `{ provider: p }` are the same argument. Missing the shorthand form was
      // the first thing this rule got wrong, against the very call site it was written for.
      const named = part.match(/^\s*([\w$]+)\s*:/);
      return named ? named[1] : (part.match(/^\s*([\w$]+)\s*$/)?.[1] ?? null);
    })
    .filter((n) => n !== null);
}

/** The contents of a brace-balanced object literal at the start of `s`, or null if there is none. */
function balancedObject(s) {
  if (s[0] !== '{') return null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return s.slice(1, i);
  }
  return null;
}

/**
 * Check 4. A message whose placeholders the call site does not supply does not render — next-intl
 * returns the key path. Pure. Exported so the rule carries a mutation proof.
 */
export function findUnfilledArguments({ messages, calls }) {
  const problems = [];
  for (const { key, args } of calls) {
    // A key that does not exist is check 2's finding; reporting it twice helps nobody.
    if (!(key in messages)) continue;
    if (args === 'dynamic') continue;
    const missing = placeholderNames(messages[key]).filter((n) => !(args ?? []).includes(n));
    if (missing.length) {
      problems.push(
        `t('${key}') is called without ${missing.map((n) => `{${n}}`).join(', ')} — ` +
          `next-intl will not format a message with an unfilled placeholder, so a user sees the ` +
          `literal text "${key}"`,
      );
    }
  }
  return problems;
}

/**
 * `Link` must come from `@/i18n/navigation`, never `next/link`.
 *
 * ADR-010 states this rule, and stating a rule with no gate is what this project forbids. The bug it
 * catches is invisible today and permanent later: with one locale a `next/link` href works fine, so
 * nothing surfaces — until a second locale exists and every such link silently drops the prefix.
 * By then they are everywhere. Exported for tests.
 *
 * Comments are stripped first, and this rule is the reason the helper is shared rather than local to
 * the two key extractors. It was left reading raw lines when they were fixed, and a docblock that
 * teaches ADR-010 by quoting the import it forbids — the most natural way anyone would write that
 * comment — was reported as a violation of it. The old test passed only because its example was
 * `// never import from 'next/link'`, where the `//` puts a non-whitespace character in front of
 * `import`; a block comment or an indented example defeats it, which is a test that agreed with the
 * code for a reason neither of them meant.
 *
 * @param {string[]} files
 * @param {(f: string) => string} read
 * @returns {string[]}
 */
export function findRawLinkImports(files, read) {
  const bad = [];
  for (const file of files) {
    stripComments(read(file))
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*import\s+.*\bfrom\s+['"]next\/link['"]/.test(line)) {
          bad.push(
            `${file}:${i + 1} — imports Link from 'next/link'; use '@/i18n/navigation' (ADR-010)`,
          );
        }
      });
  }
  return bad;
}

/** Pure. Exported so each rule carries a mutation proof. */
export function compare({ locales, usedKeys }) {
  const problems = [];
  const base = locales[DEFAULT_LOCALE];
  if (!base) return [`no ${DEFAULT_LOCALE}.json — the default locale must exist`];

  for (const [locale, keys] of Object.entries(locales)) {
    if (locale === DEFAULT_LOCALE) continue;
    for (const k of base.filter((k) => !keys.includes(k))) {
      problems.push(
        `${locale}: missing "${k}" — it will render as its own key name to a real user`,
      );
    }
    for (const k of keys.filter((k) => !base.includes(k))) {
      problems.push(
        `${locale}: has "${k}", which ${DEFAULT_LOCALE} does not — a rename left behind`,
      );
    }
  }

  // A used key that does not exist is a typo that ships silently.
  for (const k of usedKeys.filter((k) => !base.includes(k))) {
    problems.push(`source uses "${k}", which is not in ${DEFAULT_LOCALE}.json`);
  }
  // An unused key is dead weight that will be translated into every language forever.
  for (const k of base.filter((k) => !usedKeys.includes(k))) {
    problems.push(`"${k}" is defined but never used`);
  }
  return problems;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

function main() {
  const parsed = Object.fromEntries(
    readdirSync(MESSAGES)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(MESSAGES, f), 'utf8'))]),
  );
  const locales = Object.fromEntries(Object.entries(parsed).map(([l, m]) => [l, flatten(m)]));
  const messages = Object.fromEntries(flattenEntries(parsed[DEFAULT_LOCALE] ?? {}));
  const files = walk(SRC);
  const sources = files.map((f) => readFileSync(f, 'utf8'));
  const usedKeys = [...new Set(sources.flatMap(extractUsedKeys))];
  const calls = sources.flatMap(extractCalls);
  const problems = [
    ...compare({ locales, usedKeys }),
    ...findUnfilledArguments({ messages, calls }),
    ...findRawLinkImports(files, (f) => readFileSync(f, 'utf8')),
  ];

  if (!problems.length) {
    const withArgs = Object.values(messages).filter((m) => placeholderNames(m).length).length;
    console.log(
      `locale: ok — ${Object.keys(locales).length} locale(s), ${locales[DEFAULT_LOCALE].length} keys, all used and all present; ${withArgs} with ICU arguments, all supplied`,
    );
    return;
  }
  console.error('locale: FAILED\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
