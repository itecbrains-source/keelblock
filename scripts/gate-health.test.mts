import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gateImports, mutationProof } from './gate-health.mjs';

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
const GATES = readdirSync('scripts').filter((f) => f.startsWith('check-') && f.endsWith('.mjs'));

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
