import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseRegistry,
  validate,
  evaluateTrigger,
  findOrphanMarkers,
  findGaps,
  TRIGGER_KINDS,
  SELF_EXEMPT,
} from './check-deferrals.mjs';

const registry = readFileSync('spec/DEFERRAL_REGISTRY.md', 'utf8');
const entries = parseRegistry(registry);
const deps = {
  fileExists: () => false,
  envSet: () => false,
  specDone: () => false,
  today: '2026-09-07',
};

describe('deferral registry', () => {
  it('parses the real registry', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.id)).toContain('DEF-001');
  });

  it('every real entry is valid — reason and machine-evaluable trigger', () => {
    expect(validate(entries)).toEqual([]);
  });

  it('no trigger has fired today', () => {
    for (const e of entries) expect(evaluateTrigger(e.trigger, deps), `${e.id} fired`).toBe(false);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a fired trigger is detected — the whole anti-rot mechanism', () => {
    // DEF-001 fires the moment a deploy workflow appears. Without this the deferral would sit in a
    // file looking tracked while its moment came and went.
    const def001 = entries.find((e) => e.id === 'DEF-001')!;
    expect(
      evaluateTrigger(def001.trigger, {
        ...deps,
        fileExists: (p: string) => p === '.github/workflows/deploy.yml',
      }),
    ).toBe(true);
  });

  it('MUTATION: a lapsed date trigger fires', () => {
    expect(evaluateTrigger('date:2026-01-01', deps)).toBe(true);
    expect(evaluateTrigger('date:2030-01-01', deps)).toBe(false);
  });

  it('MUTATION: a spec reaching done fires its dependants', () => {
    // Reads a real `spec-done:` row rather than naming SPEC-004, whose dependants were restated
    // when it closed. Hardcoding an id made this proof fail because the mechanism WORKED.
    // `includes`, not `startsWith`: the parsed trigger keeps its backticks, which is exactly the
    // kind of near-miss a fixture hides and a real row does not.
    const row = entries.find((e) => e.trigger.includes('spec-done:'))!;
    const target = /spec-done:(SPEC-\d+)/.exec(row.trigger)![1];
    expect(evaluateTrigger(row.trigger, { ...deps, specDone: (id: string) => id === target })).toBe(
      true,
    );
  });

  it('MUTATION: a vague reason is refused — "not yet" is not a reason', () => {
    const p = validate([
      { id: 'DEF-900', title: 'x', reason: 'not yet', trigger: 'decided:later' },
    ]);
    expect(p.join()).toMatch(/not a reason/);
  });

  it('MUTATION: an unevaluable trigger is refused', () => {
    const p = validate([
      {
        id: 'DEF-900',
        title: 'x',
        reason: 'a genuinely long and specific reason here',
        trigger: 'when we feel ready',
      },
    ]);
    expect(p.join()).toMatch(/not machine-evaluable/);
  });

  it('MUTATION: an orphan marker in code is caught', () => {
    const orphans = findOrphanMarkers(
      ['a.ts'],
      new Set(['DEF-001']),
      () => '// TO' + 'DO: fix this later',
    );
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatch(/no DEF-\* id/);
  });

  it('MUTATION: a marker referencing an unknown DEF is caught', () => {
    const orphans = findOrphanMarkers(
      ['a.ts'],
      new Set(['DEF-001']),
      () => '// @' + 'defer DEF-999',
    );
    expect(orphans[0]).toMatch(/not in the registry/);
  });

  it('a marker naming a real deferral is allowed — debt is permitted, hidden debt is not', () => {
    expect(
      findOrphanMarkers(['a.ts'], new Set(['DEF-001']), () => '// @' + 'defer DEF-001'),
    ).toEqual([]);
  });

  it('`decided:` never fires on its own — the honest choice, and the one to watch', () => {
    expect(
      evaluateTrigger('decided:anything', { ...deps, fileExists: () => true, envSet: () => true }),
    ).toBe(false);
  });

  it('the self-exemption is exactly one file and may only shrink', () => {
    // The scanner cannot scan itself. That is a real blind spot, so it is pinned rather than trusted.
    expect(SELF_EXEMPT).toEqual(['scripts/check-deferrals.mjs']);
  });

  it('MUTATION: a deleted row leaves a gap, and the gap is caught', () => {
    // This happened. Repairing one malformed row spliced between two indices and removed everything
    // between them, taking DEF-006 and DEF-008 with it. The gate said "ok — 5 open" and was,
    // narrowly, telling the truth: nothing references a deferral by id, so a deleted one is
    // invisible. Recovered from git history rather than rewritten, because a rewrite would have
    // quietly changed what was deferred and why.
    const g = findGaps(['DEF-001', 'DEF-003']);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatch(/DEF-002 is missing/);
    expect(g[0]).toMatch(/recover it from git history/);
  });

  it('a contiguous sequence has no gaps', () => {
    expect(findGaps(['DEF-001', 'DEF-002', 'DEF-003'])).toEqual([]);
  });

  it('the real registry is contiguous across open AND closed — ids are never reused', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync('spec/DEFERRAL_REGISTRY.md', 'utf8');
    expect(findGaps([...new Set(text.match(/DEF-\d+/g) ?? [])])).toEqual([]);
  });

  it('the registry states Rule 0 — a defect is never a deferral', () => {
    expect(registry).toMatch(/defect is never a deferral/i);
  });

  it('every trigger kind the registry uses is a supported kind', () => {
    for (const e of entries) {
      expect(TRIGGER_KINDS).toContain(String(e.trigger).replace(/`/g, '').split(':')[0]);
    }
  });
});
