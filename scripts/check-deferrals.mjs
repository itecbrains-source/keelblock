#!/usr/bin/env node
/**
 * The deferral gate — SPEC-003 REQ-7 and REQ-9.
 *
 * Debt is allowed. *Unlogged* debt is not, and neither is debt whose moment has arrived and which
 * nobody noticed. Three rules:
 *
 *   1. Every `TODO` / `FIXME` / `@defer` marker in code names a `DEF-*` that exists here.
 *   2. Every registry entry carries a reason and a valid, machine-evaluable trigger.
 *   3. **A fired trigger FAILS the build.** This is the anti-rot mechanism. A deferral whose
 *      condition has come true cannot sit quietly in a file — it must be built, closed, or its
 *      trigger deliberately restated. Without this rule the registry is a place debt goes to be
 *      forgotten while looking tracked, which is worse than no registry at all.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const REGISTRY = 'spec/DEFERRAL_REGISTRY.md';
const SCANNED = ['.ts', '.tsx', '.mjs', '.mts', '.sql', '.yml', '.yaml'];
const IGNORED = new Set(['node_modules', '.next', '.git', '.venv', 'supabase/tests/rls']);

/**
 * This scanner cannot scan itself: the marker words appear in it as the *definition* of what it
 * looks for, not as markers. Standard for a linter's own rule file — but it is a real blind spot,
 * so it is named here, pinned to exactly one entry by test, and may only shrink.
 */
export const SELF_EXEMPT = ['scripts/check-deferrals.mjs'];

/**
 * Parse the `## Open` table. Exported for tests.
 * @typedef {{ id: string, title: string, reason: string, trigger: string }} Deferral
 * @param {string} markdown
 * @returns {Deferral[]}
 */
export function parseRegistry(markdown) {
  const open = markdown.split(/^## /m).find((s) => s.startsWith('Open')) ?? '';
  return open
    .split('\n')
    .filter((l) => /^\|\s*DEF-\d+/.test(l))
    .map((line) => {
      const [, id, title, reason, trigger] = line.split('|').map((c) => c.trim());
      return { id, title, reason, trigger };
    });
}

export const TRIGGER_KINDS = ['file-exists', 'env-set', 'spec-done', 'date', 'decided'];

/**
 * Pure. Exported so the gate's own rules carry mutation proofs.
 * @param {Deferral[]} entries
 * @returns {string[]}
 */
export function validate(entries) {
  const problems = [];
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.id)) problems.push(`${e.id}: duplicate id`);
    seen.add(e.id);
    if (!e.reason || e.reason.length < 20) {
      problems.push(`${e.id}: no real reason. "Not yet" is not a reason — say what is genuinely blocking it.`);
    }
    const kind = String(e.trigger ?? '').split(':')[0].replace(/`/g, '');
    const arg = String(e.trigger ?? '').split(':').slice(1).join(':').replace(/`/g, '').trim();
    if (!TRIGGER_KINDS.includes(kind)) {
      problems.push(`${e.id}: trigger "${e.trigger}" is not machine-evaluable. One of: ${TRIGGER_KINDS.join(', ')}`);
    } else if (!arg) {
      problems.push(`${e.id}: trigger "${kind}" has no argument`);
    }
  }
  return problems;
}

/**
 * Pure. `deps` is injected so a fired trigger can be proven without touching the filesystem.
 * @param {string} trigger
 * @param {{ fileExists: (p: string) => boolean, envSet: (n: string) => boolean, specDone: (id: string) => boolean, today: string }} deps
 * @returns {boolean}
 */
export function evaluateTrigger(trigger, deps) {
  const raw = String(trigger ?? '').replace(/`/g, '');
  const kind = raw.split(':')[0];
  const arg = raw.split(':').slice(1).join(':').trim();
  switch (kind) {
    case 'file-exists': return deps.fileExists(arg);
    case 'env-set':     return deps.envSet(arg);
    case 'spec-done':   return deps.specDone(arg);
    case 'date':        return deps.today >= arg;
    case 'decided':     return false;   // never fires on its own, by design
    default:            return false;
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (IGNORED.has(name) || [...IGNORED].some((i) => p.includes(i))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SCANNED.includes(extname(p))) out.push(p);
  }
  return out;
}

/**
 * Pure: every marker must name a known DEF.
 * @param {string[]} files
 * @param {Set<string>} knownIds
 * @param {(f: string) => string} read
 * @returns {string[]}
 */
export function findOrphanMarkers(files, knownIds, read) {
  const orphans = [];
  for (const file of files) {
    read(file).split('\n').forEach((line, i) => {
      // NOT /\b(TODO|FIXME|@defer)\b/ — a leading \b can never match before `@`, because a space
      // and an `@` are both non-word characters. That version silently ignored every @defer marker,
      // which is the one marker form this project's own conventions recommend. Found by the mutation
      // proof below, not by review.
      if (!/(\bTODO\b|\bFIXME\b|@defer\b)/.test(line)) return;
      const ref = line.match(/DEF-\d+/);
      if (!ref) orphans.push(`${file}:${i + 1} — marker with no DEF-* id`);
      else if (!knownIds.has(ref[0])) orphans.push(`${file}:${i + 1} — references ${ref[0]}, which is not in the registry`);
    });
  }
  return orphans;
}

function main() {
  if (!existsSync(REGISTRY)) { console.error(`deferrals: ${REGISTRY} is missing`); process.exit(2); }
  const entries = parseRegistry(readFileSync(REGISTRY, 'utf8'));
  const problems = validate(entries);

  const files = walk('.').filter((f) => !SELF_EXEMPT.some((e) => f.endsWith(e)));
  const orphans = findOrphanMarkers(files, new Set(entries.map((e) => e.id)), (f) => readFileSync(f, 'utf8'));

  const deps = {
    fileExists: (p) => existsSync(p),
    envSet: (n) => Boolean(process.env[n]),
    specDone: (id) => {
      const f = readdirSync('spec').find((n) => n.startsWith(id));
      return Boolean(f) && /^> Status: `done`/m.test(readFileSync(join('spec', f), 'utf8'));
    },
    today: new Date().toISOString().slice(0, 10),
  };
  const fired = entries.filter((e) => evaluateTrigger(e.trigger, deps));

  if (!problems.length && !orphans.length && !fired.length) {
    console.log(`deferrals: ok — ${entries.length} open, no trigger fired, no orphan markers`);
    return;
  }
  console.error('deferrals: FAILED\n');
  for (const p of problems) console.error(`  [invalid]  ${p}`);
  for (const o of orphans) console.error(`  [orphan]   ${o}`);
  for (const f of fired) {
    console.error(`  [FIRED]    ${f.id} — ${f.title}`);
    console.error(`             its trigger (${f.trigger}) has come true. Build it, close it, or`);
    console.error(`             restate the trigger deliberately. It cannot stay as it is.`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
