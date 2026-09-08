#!/usr/bin/env node
/**
 * The locale gate.
 *
 * i18n fails quietly: a missing key renders its own name, a stale key lingers forever, and a typo
 * ships. None of that breaks a build or a test, so it is found by a user in a language nobody on the
 * team reads. Three checks, all structural:
 *
 *   1. every locale carries exactly the default locale's keys — no missing, no extra
 *   2. every `t('key')` in the source resolves to a key that exists
 *   3. every key in the messages is actually used
 *
 * Check 2 is the one that pays for the file: it turns a typo from a runtime surprise into a build
 * failure. Adapted from `boxyhq/saas-starter-kit`'s `check-locale`, which does (1).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

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
export function extractUsedKeys(source) {
  const namespaces = [...source.matchAll(/(?:use|get)Translations\(\s*['"]([\w.]+)['"]/g)].map(
    (m) => m[1],
  );
  const calls = [...source.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)].map((m) => m[1]);
  // With no declared namespace, a t('a.b') call is already fully qualified.
  if (namespaces.length === 0) return calls;
  return calls.flatMap((key) => namespaces.map((ns) => `${ns}.${key}`));
}

/**
 * `Link` must come from `@/i18n/navigation`, never `next/link`.
 *
 * ADR-010 states this rule, and stating a rule with no gate is what this project forbids. The bug it
 * catches is invisible today and permanent later: with one locale a `next/link` href works fine, so
 * nothing surfaces — until a second locale exists and every such link silently drops the prefix.
 * By then they are everywhere. Exported for tests.
 *
 * @param {string[]} files
 * @param {(f: string) => string} read
 * @returns {string[]}
 */
export function findRawLinkImports(files, read) {
  const bad = [];
  for (const file of files) {
    read(file)
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
  const locales = Object.fromEntries(
    readdirSync(MESSAGES)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [
        f.replace('.json', ''),
        flatten(JSON.parse(readFileSync(join(MESSAGES, f), 'utf8'))),
      ]),
  );
  const files = walk(SRC);
  const usedKeys = [...new Set(files.flatMap((f) => extractUsedKeys(readFileSync(f, 'utf8'))))];
  const problems = [
    ...compare({ locales, usedKeys }),
    ...findRawLinkImports(files, (f) => readFileSync(f, 'utf8')),
  ];

  if (!problems.length) {
    console.log(
      `locale: ok — ${Object.keys(locales).length} locale(s), ${locales[DEFAULT_LOCALE].length} keys, all used and all present`,
    );
    return;
  }
  console.error('locale: FAILED\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
