import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluateFreshness, majorOf } from './check-freshness.mjs';

const stamp = { maxAgeDays: 45, runtime: { node: 26 }, pins: { next: { major: 16, verifiedOn: '2026-09-01' } } };
const base = { stamp, declared: { next: 16 }, latest: { next: 16 }, today: '2026-09-07', nodeMajor: 26 };
const rules = (r: ReturnType<typeof evaluateFreshness>) => r.failures.map((f) => f.rule);

describe('freshness gate', () => {
  it('passes when every pin was verified inside the window', () => {
    expect(evaluateFreshness(base).ok).toBe(true);
  });

  it('the real stamp covers the real dependencies and is current', () => {
    const s = JSON.parse(readFileSync('keel.freshness.json', 'utf8'));
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(s.pins)) {
      expect(all[name], `${name} is stamped but not a dependency`).toBeDefined();
      expect(majorOf(all[name]), `${name} stamp disagrees with package.json`).toBe(s.pins[name].major);
    }
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: an expired stamp fails — the "nobody looked" detector', () => {
    const r = evaluateFreshness({ ...base, today: '2026-11-01' });
    expect(r.ok).toBe(false);
    expect(rules(r)).toContain('stamp');
  });

  it('MUTATION: two majors behind fails — the state this whole gate exists to prevent', () => {
    // Measured on this repository's second day: create-next-app pinned typescript ^5 while 7 was
    // current, and nothing anywhere would have said so.
    const r = evaluateFreshness({ ...base, latest: { next: 18 } });
    expect(rules(r)).toContain('drift');
  });

  it('exactly one major of slack is allowed — a grace period, not a resting place', () => {
    expect(evaluateFreshness({ ...base, latest: { next: 17 } }).ok).toBe(true);
  });

  it('MUTATION: a stamp describing a version we no longer ship fails', () => {
    expect(evaluateFreshness({ ...base, declared: { next: 15 } }).failures[0].msg).toMatch(/no longer ship/);
  });

  it('MUTATION: a stamp for something that is not a dependency fails', () => {
    expect(evaluateFreshness({ ...base, declared: {} }).failures[0].msg).toMatch(/not a dependency/);
  });

  it('MUTATION: a runtime mismatch fails — it invalidates every other result silently', () => {
    expect(rules(evaluateFreshness({ ...base, nodeMajor: 24 }))).toContain('runtime');
  });

  it('MUTATION: an unparseable date fails rather than counting as fresh', () => {
    const bad = { ...stamp, pins: { next: { major: 16, verifiedOn: 'soon' } } };
    expect(evaluateFreshness({ ...base, stamp: bad }).ok).toBe(false);
  });

  it('MUTATION: offline cannot dodge the gate — drift is skipped, the stamp still bites', () => {
    expect(evaluateFreshness({ ...base, latest: {} }).ok).toBe(true);
    const stale = evaluateFreshness({ ...base, latest: {}, today: '2026-11-01' });
    expect(stale.ok).toBe(false);
    expect(rules(stale)).toContain('stamp');
  });

  it('reads a major out of any range syntax', () => {
    expect([majorOf('^16.3.4'), majorOf('~4'), majorOf('19.2.8'), majorOf(undefined)]).toEqual([16, 4, 19, null]);
  });
});
