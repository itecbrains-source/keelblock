import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { constantTimeEquals } from '@/lib/billing/constant-time';

/**
 * SPEC-007 REQ-6 — the reconcile's authorization, and its schedule.
 *
 * The handler itself is proven in `src/lib/billing/reconcile.test.mts`, which is where the property
 * AC-6 names is asserted. What is left here is the part a route owns: who may call it, and whether
 * anything actually calls it.
 */

describe('the shared secret is compared in constant time', () => {
  it('accepts the exact value and rejects everything else', () => {
    expect(constantTimeEquals('s3cret', 's3cret')).toBe(true);
    expect(constantTimeEquals('s3cret', 's3crea')).toBe(false);
    expect(constantTimeEquals('s3cret', '')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });

  it('a different length is refused without comparing contents', () => {
    expect(constantTimeEquals('short', 'longer-value')).toBe(false);
    expect(constantTimeEquals('longer-value', 'short')).toBe(false);
  });

  it('MUTATION: it does not short-circuit on the first differing character', () => {
    // The defect this exists to prevent: `===` returns as soon as two bytes differ, so the time it
    // takes leaks HOW MUCH of a guess was right, and a secret can be recovered a character at a
    // time. Asserted by shape rather than by timing — a timing assertion in a unit suite is a flake
    // (F-72 is what that costs) — so this checks the loop visits every position.
    //
    // **What this cannot prove, stated plainly:** it does not measure time, so it is not evidence
    // that the comparison IS constant-time under a JIT that may optimise it. It is evidence that the
    // code has the shape that makes constant time possible — no exit from inside the loop — which is
    // the part a reviewer would otherwise have to remember to check.
    const source = readFileSync('src/lib/billing/constant-time.ts', 'utf8');
    const fn = source.slice(source.indexOf('export function constantTimeEquals'));
    const loopBody = fn.split('\n').find((l) => l.includes('for ('));

    expect(loopBody, 'no loop found — has the implementation changed shape?').toBeDefined();
    expect(loopBody, 'returning from inside the loop is the defect this prevents').not.toMatch(
      /\breturn\b/,
    );
    expect(loopBody, 'accumulate with XOR rather than compare-and-exit').toMatch(/\|=/);
  });
});
