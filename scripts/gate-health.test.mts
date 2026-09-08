import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gateImports, mutationProof, producedGates, externalTools } from './gate-health.mjs';

/**
 * The meta-gate: **every gate is well-behaved.**
 *
 * Individual gates each prove they can catch their own defect. Nothing until now proved the *suite*
 * is dependable — and a gate suite that is flaky, crashes on a missing file, or reports a failure
 * nobody can act on is worse than none, because it gets disabled and the discipline goes with it.
 *
 * Five properties, asserted for every gate:
 *   1. it has tests
 *   2. its tests include a mutation proof — it has been shown to fail
 *   3. it is deterministic — identical input, identical output
 *   4. it degrades rather than crashes when its input is missing
 *   5. its failure names a file or a fix, not just a verdict
 */
// Derived from what `npm run check` actually reaches, not from a filename prefix -- see
// `producedGates`. The prefix version exempted `access-matrix.mjs` and `battlecard.mjs`, both of
// which refuse the build, from ever having to prove they could (F-41's shape).
const GATES = producedGates();

describe('gate health (the suite is dependable)', () => {
  it('there are gates to check', () => expect(GATES.length).toBeGreaterThanOrEqual(8));

  it.each(GATES)('%s has a test file', (gate) => {
    const test = gate.replace('.mjs', '.test.mts');
    expect(
      existsSync(`scripts/${test}`),
      `scripts/${test} is missing — an untested gate is unproven`,
    ).toBe(true);
  });

  it.each(GATES)('%s has been shown to FAIL, not just to pass', (gate) => {
    // A gate that has only ever printed a tick has not been shown to be looking at anything.
    //
    // This used to be `/MUTATION/.test(fileContents)`, which any comment mentioning the word
    // satisfied — including one saying a proof still needed writing. It now asks the PARSED test
    // file whether a case NAMED as a mutation proof actually calls something the gate exports.
    const source = readFileSync(`scripts/${gate.replace('.mjs', '.test.mts')}`, 'utf8');
    const { ok, reason } = mutationProof(source, gate);
    expect(ok, `${gate}'s test file ${reason}`).toBe(true);
  });

  // ── proofs of THIS rule, because the meta-gate needs one more than anything else ──────────────

  it('MUTATION: a comment mentioning the word is not a proof', () => {
    const source = [
      "import { rule } from './check-x.mjs';",
      '// NOTE: add a MUTATION proof for the empty case',
      "it('catches the empty case', () => expect(rule([])).toHaveLength(1));",
    ].join('\n');
    expect(mutationProof(source, 'check-x.mjs').ok).toBe(false);
  });

  it('MUTATION: a case named as a proof that never calls the gate is not a proof', () => {
    // The realistic decay: the rule is renamed or inlined, the case keeps its name, and nothing
    // notices that it stopped exercising anything.
    const source = [
      "import { rule } from './check-x.mjs';",
      "it('MUTATION: a bad input is rejected', () => expect(true).toBe(true));",
    ].join('\n');
    const { ok, reason } = mutationProof(source, 'check-x.mjs');
    expect(ok).toBe(false);
    expect(reason).toContain('none calls anything exported');
  });

  it('MUTATION: a test file that imports nothing from its gate cannot prove anything about it', () => {
    const source = "it('MUTATION: something', () => expect(1).toBe(1));";
    expect(mutationProof(source, 'check-x.mjs').ok).toBe(false);
  });

  it('a real mutation case passes, including through it.each', () => {
    const direct = [
      "import { rule } from './check-x.mjs';",
      "it('MUTATION: a bad input is rejected', () => { expect(rule(['bad'])).toHaveLength(1); });",
    ].join('\n');
    expect(mutationProof(direct, 'check-x.mjs').ok).toBe(true);

    const each = [
      "import { rule } from './check-x.mjs';",
      "it.each(['a'])('MUTATION: %s is rejected', (x) => { expect(rule([x])).toHaveLength(1); });",
    ].join('\n');
    expect(mutationProof(each, 'check-x.mjs').ok).toBe(true);
  });

  it('the import reader sees named and default imports, and ignores other modules', () => {
    const source = [
      "import { a, b } from './check-x.mjs';",
      "import other from './check-y.mjs';",
    ].join('\n');
    expect([...gateImports(source, 'check-x.mjs')].sort()).toEqual(['a', 'b']);
    expect([...gateImports(source, 'check-y.mjs')]).toEqual(['other']);
  });

  it.each(GATES)('%s exports pure logic that can be tested without running it', (gate) => {
    const src = readFileSync(`scripts/${gate}`, 'utf8');
    expect(
      /^export (function|const)/m.test(src),
      `${gate} exports nothing — its rules cannot be tested in isolation`,
    ).toBe(true);
  });

  it.each(GATES)(
    '%s only runs main() when invoked directly, so importing it is side-effect free',
    (gate) => {
      // Without this guard, importing a gate in a test would execute it — and a test suite that
      // silently runs every gate as a side effect is neither fast nor debuggable.
      const src = readFileSync(`scripts/${gate}`, 'utf8');
      expect(src).toMatch(/import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/);
    },
  );

  /**
   * Two exclusion lists, both named with reasons rather than quietly skipped:
   *
   *   NETWORK  — reaches the registry, so a second run can legitimately differ.
   *   TIMED    — shells out to a test runner whose output contains wall-clock and CPU times. The
   *              VERDICT must still be deterministic; the timing in the log is not a defect, and
   *              asserting on it would make this test flaky, which is the exact thing it exists to
   *              prevent.
   */
  /**
   * Determinism is asserted over gates that read only the working tree.
   *
   * EXTERNAL gates touch the network or the database. Excluding them is not convenience — it is the
   * point: their output depends on state this test does not own, so asserting on it makes **this
   * test** the flaky one, and a flaky gate suite gets disabled, taking the discipline with it. That
   * happened once here before the exclusion existed.
   *
   * Their determinism is covered where it belongs: `check` runs them against the live database and
   * fails loudly if they disagree with reality.
   */
  const EXTERNAL = [
    'check-freshness.mjs',
    'check-policies.mjs',
    'check-generated.mjs',
    'check-schema-guard.mjs',
  ];

  it('every self-contained gate reaches the same verdict, and prints the same thing, twice', () => {
    const local = GATES.filter((g) => !EXTERNAL.includes(g));
    expect(
      local.length,
      'nothing left to check — the exclusion list has eaten the test',
    ).toBeGreaterThanOrEqual(5);
    for (const gate of local) {
      const run = () => spawnSync('node', [`scripts/${gate}`], { encoding: 'utf8' });
      const a = run(),
        b = run();
      expect(a.status, `${gate} gave different verdicts on identical input`).toBe(b.status);
      expect(a.stdout, `${gate} produced different output on identical input`).toBe(b.stdout);
      // stderr matters MORE than stdout here: every gate writes its failures there, so comparing
      // only stdout compares the channel that is empty exactly when the gate has something to say.
      expect(a.stderr, `${gate} reported different problems on identical input`).toBe(b.stderr);
    }
  }, 120_000);

  it('the exclusion list is FROZEN by value, not merely capped in length', () => {
    // An exclusion list is where a determinism guarantee goes to die. A length cap says "may only
    // shrink" and does not mean it: at exactly four entries it permits swapping any member for any
    // other, which is how a gate quietly leaves the determinism guarantee without the list growing.
    expect(EXTERNAL).toEqual([
      'check-freshness.mjs',
      'check-policies.mjs',
      'check-generated.mjs',
      'check-schema-guard.mjs',
    ]);
    for (const g of EXTERNAL) expect(GATES).toContain(g);
  });

  it('a gate that cannot run reports it, rather than crashing with a stack trace', () => {
    // Exit 2 means "could not run"; exit 1 means "found a problem". Conflating them sends a reader
    // to debug their code when the real problem is a missing dependency (F-19).
    const r = spawnSync('node', ['scripts/check-schema-guard.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, KEELBLOCK_DB_URL: 'postgresql://nobody@127.0.0.1:1/none' },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).not.toMatch(/at Object\.|at Module\./); // no raw stack trace
    expect(r.stderr.toLowerCase()).toMatch(/could not reach|is not running/);
  }, 30_000);
});

describe('the rule sees through a local helper (and still refuses an empty one)', () => {
  it('MUTATION: a proof that reaches the gate through a wrapper counts', () => {
    // battlecard.test.mts's real shape: `const build = (over) => render({ …, ...over })`, and every
    // mutation case calls `build`. Read literally, none of them calls `render`, so the rule reported
    // three named proofs and no exercise — a FALSE POSITIVE that nearly had working tests rewritten.
    const source = [
      "import { render } from './battlecard.mjs';",
      'const build = (over) => render({ ...base, ...over });',
      "it('MUTATION: evidence that does not resolve refuses to render', () =>",
      '  expect(() => build({ exists: () => false })).toThrow());',
    ].join('\n');
    expect(mutationProof(source, 'battlecard.mjs').ok).toBe(true);
  });

  it('MUTATION: a wrapper that reaches nothing is still not a proof', () => {
    const source = [
      "import { render } from './battlecard.mjs';",
      'const build = (over) => ({ ...over });',
      "it('MUTATION: something', () => expect(build({})).toBeTruthy());",
    ].join('\n');
    expect(mutationProof(source, 'battlecard.mjs').ok).toBe(false);
  });

  it('the real battlecard test file passes, and it did not before', () => {
    const source = readFileSync('scripts/battlecard.test.mts', 'utf8');
    expect(mutationProof(source, 'battlecard.mjs').ok).toBe(true);
  });
});

describe('the gate list is what `check` RUNS, not what is named like a gate (F-41)', () => {
  it('every script `npm run check` reaches is subject to the mutation-proof rule', () => {
    // The list used to be `readdirSync('scripts').filter(f => f.startsWith('check-'))` — a claim
    // about FILENAMES. `access-matrix.mjs` refuses the build on an unexplained concern and
    // `battlecard.mjs` refuses to render an unresolvable citation; both enforce rules, neither is
    // named like a gate, and so neither had to prove it could fail.
    const reached = producedGates();
    expect(reached).toContain('access-matrix.mjs');
    expect(reached).toContain('battlecard.mjs');
    expect(reached).toContain('check-policies.mjs');
    expect(reached).not.toContain('check.mjs');
  });

  it('MUTATION: a gate nothing spawns is not in the produced set', () => {
    const sources = {
      'check.mjs': "spawnSync('node', ['scripts/check-a.mjs']);",
      'check-a.mjs': 'export const a = 1;',
      'check-orphan.mjs': 'export const orphan = 1;',
    };
    const reached = producedGates(sources);
    expect(reached).toContain('check-a.mjs');
    expect(reached, 'named like a gate, run by nothing').not.toContain('check-orphan.mjs');
  });

  it('MUTATION: it follows a spawn through an intermediate gate, not just check.mjs', () => {
    const sources = {
      'check.mjs': "spawnSync('node', ['scripts/check-a.mjs']);",
      'check-a.mjs': "spawnSync('node', ['scripts/check-b.mjs']);",
      'check-b.mjs': 'export const b = 1;',
    };
    expect(producedGates(sources)).toContain('check-b.mjs');
  });
});

describe('nothing is exempt by being absent from the list', () => {
  it('every script under scripts/ is either RUN by check, or carries its own proof', () => {
    // The completeness half. `producedGates` follows spawns, so a module a gate IMPORTS rather than
    // spawns is not in it — `review-records.mjs` and `review-register.mjs` are libraries behind
    // `check-promises`, and the five run-properties (deterministic when run, degrades on missing
    // input, legible failure) do not apply to something nothing runs. That is a real boundary and
    // this asserts it is the only one: a module outside the list must still have been shown to fail.
    const run = new Set(producedGates());
    const exempt = new Set(['check.mjs', 'gate-health.mjs', 'verify.mjs']);
    const unproven: string[] = [];
    for (const file of readdirSync('scripts').filter((f) => f.endsWith('.mjs'))) {
      if (run.has(file) || exempt.has(file)) continue;
      const test = `scripts/${file.replace('.mjs', '.test.mts')}`;
      if (!existsSync(test)) {
        unproven.push(`${file} — no test file, and nothing runs it either`);
        continue;
      }
      const { ok, reason } = mutationProof(readFileSync(test, 'utf8'), file);
      if (!ok) unproven.push(`${file} — ${reason}`);
    }
    expect(unproven, 'a rule that is neither run nor proven is a rule nobody checks').toEqual([]);
  });
});

describe('AC-10 · the claim runs on nothing paid (ADR-009, mechanized)', () => {
  /**
   * ADR-009's anti-degradation rule: keelblock's full claim "must hold with **zero paid components
   * present**", and it says the rule is "mechanized, not promised".
   *
   * Asserting that no paid component is INSTALLED would be a check that cannot fail — this
   * repository has never contained one, so it would pass on the day someone wired the paid CLI into
   * a gate and every day after. The failable question is what the claim REACHES FOR: every external
   * executable the gates invoke, declared with its licence. Wire in `stt` — the paid toolkit's own
   * CLI, named in ADR-009 — and the build stops.
   *
   * Each entry says why it is free. The list may only shrink, or grow by a tool somebody argued for.
   */
  const DECLARED: Record<string, string> = {
    node: 'the runtime this repository already requires; MIT',
    git: 'GPL-2.0, and used read-only for repository facts (remote, shallow-ness, log)',
    psql: 'PostgreSQL licence, ships with Postgres, which the database gate needs anyway',
    supabase: 'Apache-2.0 CLI, the local stack itself',
    './.venv/bin/rlsautotest': 'rlsautotest 0.7.0, pinned in requirements.txt and free to install',
  };

  it('every tool the gates invoke is declared, and every declaration is used', () => {
    const found = externalTools();
    const undeclared = found.filter((t) => !(t in DECLARED));
    expect(undeclared, 'an undeclared external tool is a dependency nobody chose').toEqual([]);
    const unused = Object.keys(DECLARED).filter((t) => !found.includes(t));
    expect(unused, 'a declaration for a tool nothing invokes is a stale permission').toEqual([]);
  });

  it('MUTATION: a gate reaching for the PAID toolkit is caught', () => {
    // The exact regression ADR-009 exists to prevent: the free tier quietly starting to need the
    // thing it is meant to be complete without.
    const sources = {
      'check.mjs': "spawnSync('node', ['scripts/check-a.mjs']);",
      'check-a.mjs': "spawnSync('stt', ['evidence', 'export']);",
    };
    expect(externalTools(sources)).toContain('stt');
  });

  it('MUTATION: it resolves a tool held in a constant, not only a literal', () => {
    // `check-policies.mjs` spawns `RLSA`, not a string. A rule that read only literals would have
    // reported four tools and missed the one that is not on any developer's machine by default.
    const sources = {
      'check.mjs': "spawnSync('node', ['scripts/check-a.mjs']);",
      'check-a.mjs': "const TOOL = './vendor/paid-cli';\nspawnSync(TOOL, ['--run']);",
    };
    expect(externalTools(sources)).toContain('./vendor/paid-cli');
  });

  it('is not vacuous: the real gates do invoke tools', () => {
    expect(externalTools().length).toBeGreaterThanOrEqual(4);
  });
});
