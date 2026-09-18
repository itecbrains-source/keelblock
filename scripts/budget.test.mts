import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  BUILD_DIR,
  CONFIG,
  LAB_DISCLAIMER,
  checkBudget,
  clientBundles,
  declaredBound,
  measure,
  summarise,
} from './budget.mjs';

/**
 * SPEC-015 AC-6 — the lab performance budget, and the sentence it has to keep saying.
 *
 * REQ-6's failure is not "the app got slow". It is a README quoting a lab score in the vocabulary of
 * a field measurement. So the disclaimer is asserted here rather than left to a docblock: a comment
 * nobody reads cannot stop a number being misdescribed six months later.
 */

const bound = { totalBytes: 100, largestChunkBytes: 60 };

describe('the budget says what kind of number it is', () => {
  it('names itself a lab measurement, and names what it is not', () => {
    expect(LAB_DISCLAIMER).toMatch(/LAB MEASUREMENT/);
    expect(LAB_DISCLAIMER, 'it must name the thing it is not').toMatch(/not Core Web Vitals/i);
    expect(LAB_DISCLAIMER, 'and why — the 75th percentile of real users over 28 days').toMatch(
      /75th percentile[^.]*28 days/i,
    );
    expect(LAB_DISCLAIMER, 'and point at the deferral for the half that waits').toMatch(/DEF-034/);
  });

  it('MUTATION: every failure message carries the disclaimer, not just the summary', () => {
    // The failure is the message somebody pastes into a ticket. If only the happy path says what
    // the number is, the number travels without its meaning — which is REQ-6's whole subject.
    const over = checkBudget(
      { files: 3, totalBytes: 500, largestChunkBytes: 400, largest: 'a.js' },
      bound,
    );
    expect(over).toHaveLength(2);
    for (const p of over) expect(p).toContain('LAB MEASUREMENT');
  });

  it('the summary line says it too', () => {
    expect(
      summarise({ files: 1, totalBytes: 10, largestChunkBytes: 10, largest: 'a.js' }, bound),
    ).toContain('LAB MEASUREMENT');
  });
});

describe('the bound is enforced, in both dimensions', () => {
  it('MUTATION: a total over the bound fails, and the message names the overshoot', () => {
    const p = checkBudget(
      { files: 2, totalBytes: 150, largestChunkBytes: 10, largest: 'a.js' },
      bound,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/over the declared bound/);
    expect(p[0], 'a failure that does not say by how much invites raising the number').toMatch(
      /by 0\.0 KiB|by \d/,
    );
  });

  it('MUTATION: one fat chunk fails even when the total is fine', () => {
    // The realistic regression: a dependency lands in one route's chunk and the total still looks
    // acceptable. A single-number budget would pass this.
    const p = checkBudget(
      { files: 2, totalBytes: 90, largestChunkBytes: 80, largest: 'fat.js' },
      bound,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/largest single chunk/);
    expect(p[0], 'it names the file, because a budget failure should be actionable').toContain(
      'fat.js',
    );
  });

  it('MUTATION: an EMPTY build directory fails rather than passing', () => {
    // F-13's class, and the one a budget is most likely to fall into: nothing measured looks
    // exactly like nothing shipped. An empty build is not a small bundle.
    const p = checkBudget({ files: 0, totalBytes: 0, largestChunkBytes: 0, largest: null }, bound);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/measured nothing is not a budget/);
  });

  it('a bundle inside both bounds passes', () => {
    expect(
      checkBudget({ files: 2, totalBytes: 90, largestChunkBytes: 50, largest: 'a.js' }, bound),
    ).toEqual([]);
  });
});

describe('the declared bound and the real build', () => {
  it('the bound lives in a declared file, with its reasoning attached', () => {
    // The precedent is keelblock.billing.json: a value with a comment saying what it means, read by
    // the thing that enforces it. A number hardcoded in a test and retyped in a doc is two numbers
    // that can disagree.
    const b = declaredBound();
    expect(b.totalBytes).toBeGreaterThan(0);
    expect(b.largestChunkBytes).toBeGreaterThan(0);
    expect(b.$bound, 'the file must say these are a tripwire, not a performance threshold').toMatch(
      /REGRESSION TRIPWIRE/,
    );
    expect(b.measuredOn, 'and when they were last set against a real build').toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('the real build is inside the bound — and there is a build to measure', () => {
    // Skipped rather than failed when there is no build: `npm run check` always builds before it
    // runs this, and CI does too, so the only way here is a developer running vitest alone. What is
    // NOT done is passing silently — an absent build is reported, because a budget that quietly
    // measures nothing is the defect this file exists to avoid.
    if (!existsSync(BUILD_DIR)) {
      console.warn(`budget: no ${BUILD_DIR} — run \`npm run build\` to measure the real bundle`);
      expect(existsSync(CONFIG), 'the declared bound must exist even with no build').toBe(true);
      return;
    }
    const m = measure(clientBundles());
    expect(
      m.files,
      'a build exists but emitted no client JS — that is not a small bundle',
    ).toBeGreaterThan(0);
    expect(checkBudget(m, declaredBound())).toEqual([]);
  });
});

// ── AC-3 / AC-4 · the declared position and the shipped one agree ───────────────────────────────
//
// SPEC-015 REQ-4 says the standard's version is a STATED POSITION with a trigger. DEF-033 records
// it, and until this existed nothing asserted that the ruleset actually shipped matched what the
// registry claims — two places that could drift, with a silent edit of either passing.
//
// F-59 is why this is a check rather than a note: a mis-keyed trigger and an unchecked claim fail
// the same way, quietly and at the worst moment.

describe('the shipped accessibility ruleset matches the declared position', () => {
  const SHIPPED = 'e2e/journeys/accessibility.spec.ts';

  it('MUTATION: the tag list in the suite is exactly WCAG 2.1 A and AA', () => {
    // Read from the source rather than imported: the suite pulls in Playwright fixtures that a unit
    // runner cannot load. What is asserted is the thing a reviewer would check by eye, which is
    // precisely the check that stops being done.
    const source = readFileSync(SHIPPED, 'utf8');
    const declared = source.match(/const WCAG_21_AA = \[([^\]]+)\]/);
    expect(declared, `${SHIPPED} no longer declares WCAG_21_AA`).not.toBeNull();
    const tags = [...declared![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(tags, 'WCAG 2.1 A and AA, and nothing else').toEqual([
      'wcag21a',
      'wcag21aa',
      'wcag2a',
      'wcag2aa',
    ]);
  });

  it('MUTATION: best-practice is excluded, and the exclusion carries its reason', () => {
    // An exclusion with no reason is an exemption nobody reviewed. Adding the tag would also change
    // what B-7 asserts, which is a decision rather than a tweak.
    const source = readFileSync(SHIPPED, 'utf8');
    expect(source, 'best-practice must not be in the shipped tag list').not.toMatch(
      /WCAG_21_AA = \[[^\]]*best-practice/,
    );
    expect(source, 'and the file must say why it is out').toMatch(
      /best-practice[^]{0,400}(opinionated|normative)/i,
    );
  });

  it('DEF-033 records the position, so a move to WCAG 2.2 is a decision rather than a drift', () => {
    // The registry row is the other half. If the tag list above ever moves to 2.2, this row is what
    // should have been closed first — and if the row is deleted while the tags stay, the position
    // has been abandoned silently.
    const registry = readFileSync('spec/DEFERRAL_REGISTRY.md', 'utf8');
    const row = registry.split('\n').find((l) => l.startsWith('| DEF-033'));
    expect(row, 'DEF-033 is the declared position on the standard version').toBeDefined();
    expect(row, 'it must name the standard it is waiting on').toMatch(/EN 301 549/);
    expect(row, 'and be triggered by the event, not a date').toMatch(/`decided:/);
  });
});
