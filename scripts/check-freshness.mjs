#!/usr/bin/env node
/**
 * SPEC-003 REQ-1 — the anti-rot gate, and the mechanism behind bar B-3.
 *
 * A template rots differently from an application, for three reasons that compound: an application
 * has users who force upgrades and a template has nobody; a template is **copied**, so every stale
 * copy propagates into a new project and never receives the fix; and the rot is silent — it builds,
 * the tests pass, nothing complains, and you discover it during the week you lose after scaffolding.
 *
 * Renovate and Dependabot are necessary and insufficient. The worked example in this category was
 * actively maintained, CI green throughout, and three framework majors behind. **Automation
 * proposes; only a gate forces.**
 *
 * Three rules, ordered by how hard they are to dodge:
 *
 *   1. STAMP AGE — offline and deterministic, so it cannot be dodged by running without a network.
 *      This is the "nobody looked" detector and it is the load-bearing rule.
 *   2. MAJOR DRIFT — more than one major behind fails. One major of slack is a grace period, not a
 *      resting place.
 *   3. RUNTIME — the declared Node major must match what the stamp claims was verified.
 *
 * Offline degrades rule 2 only, and only while rule 1 is green.
 */
import { readFileSync } from 'node:fs';

const DAY_MS = 86_400_000;

/** Pure evaluator — all I/O is the caller's problem, so this is testable without a network. */
export function evaluateFreshness({ stamp, declared, latest, today, nodeMajor }) {
  const failures = [];
  const maxAge = stamp.maxAgeDays ?? 45;

  for (const [name, pin] of Object.entries(stamp.pins)) {
    const ageDays = Math.floor((Date.parse(today) - Date.parse(pin.verifiedOn)) / DAY_MS);
    if (Number.isNaN(ageDays)) {
      failures.push({ rule: 'stamp', name, msg: `unparseable verifiedOn "${pin.verifiedOn}"` });
    } else if (ageDays > maxAge) {
      failures.push({
        rule: 'stamp',
        name,
        msg: `last verified ${ageDays}d ago (limit ${maxAge}d) — check it against current, then move the date`,
      });
    }

    const declaredMajor = declared[name];
    if (declaredMajor === null || declaredMajor === undefined) {
      failures.push({
        rule: 'stamp',
        name,
        msg: 'pinned here but not a dependency — a stamp for something we do not ship',
      });
    } else if (declaredMajor !== pin.major) {
      failures.push({
        rule: 'stamp',
        name,
        msg: `package.json has major ${declaredMajor}, stamp claims ${pin.major} — the stamp describes a version you no longer ship`,
      });
    }

    const latestMajor = latest?.[name];
    if (latestMajor != null && latestMajor - pin.major > 1) {
      failures.push({
        rule: 'drift',
        name,
        msg: `pinned at ${pin.major}, current is ${latestMajor} — ${latestMajor - pin.major} majors behind (limit 1)`,
      });
    }
  }

  if (nodeMajor != null && stamp.runtime?.node != null && nodeMajor !== stamp.runtime.node) {
    failures.push({
      rule: 'runtime',
      name: 'node',
      msg: `running Node ${nodeMajor}, stamp verified against ${stamp.runtime.node}`,
    });
  }
  return { ok: failures.length === 0, failures };
}

export const majorOf = (range) => {
  const m = String(range ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

async function fetchLatestMajors(names) {
  const out = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) out[name] = majorOf((await res.json()).version);
      } catch {
        /* offline — rule 2 degrades, rule 1 still bites */
      }
    }),
  );
  return out;
}

async function main() {
  const stamp = JSON.parse(readFileSync('keel.freshness.json', 'utf8'));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  const declared = {};
  for (const name of Object.keys(stamp.pins)) declared[name] = majorOf(all[name]);

  const offline = process.argv.includes('--offline');
  const latest = offline ? {} : await fetchLatestMajors(Object.keys(stamp.pins));
  if (!offline && Object.keys(latest).length === 0) {
    console.warn(
      'freshness: registry unreachable — the drift rule is skipped, the stamp rule is not',
    );
  }

  const { ok, failures } = evaluateFreshness({
    stamp,
    declared,
    latest,
    today: new Date().toISOString().slice(0, 10),
    nodeMajor: Number(process.versions.node.split('.')[0]),
  });

  if (ok) {
    console.log(
      `freshness: ok — ${Object.keys(stamp.pins).length} pins verified within ${stamp.maxAgeDays}d`,
    );
    return;
  }
  console.error('freshness: FAILED\n');
  for (const f of failures) console.error(`  [${f.rule}] ${f.name}: ${f.msg}`);
  console.error(
    '\nThis is the gate that keeps keel from becoming another three-majors-behind starter.',
  );
  console.error('Moving a date is a claim that you looked. Do not move one without looking.');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
