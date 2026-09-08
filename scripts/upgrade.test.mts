import { describe, expect, it } from 'vitest';
import {
  planUpgrade,
  assertPlanDelivers,
  UPSTREAM_OWNED,
  REGENERATE_NEVER_SHIP,
} from './upgrade.mjs';

/**
 * The ownership boundary is the entire safety property of the upgrade path. If it is wrong in the
 * permissive direction, an unattended upgrade overwrites work somebody was paid to do.
 */
describe('planUpgrade — what an upgrade may take, and what it must never touch', () => {
  it('takes the security surface and the proof apparatus', () => {
    const { take } = planUpgrade([
      'supabase/migrations/20260908170000_null_safe_is_org_admin.sql',
      'supabase/tests/intent/003-membership-invariants.test.sql',
      'scripts/check-policies.mjs',
    ]);
    expect(take).toHaveLength(3);
  });

  it('MUTATION: it never takes a file the buyer owns', () => {
    // The failure that would matter. Every one of these is somewhere a buyer works, and an upgrade
    // that overwrote any of them would be the thing Supastarter's own documentation warns about.
    const buyers = [
      'src/app/[locale]/orgs/page.tsx',
      'src/lib/orgs/dal.ts',
      'messages/en.json',
      'e2e/journeys/invitation.spec.ts',
      'package.json',
      'next.config.ts',
    ];
    const { take, leave } = planUpgrade(buyers);
    expect(take, 'an upgrade must never overwrite the buyer').toEqual([]);
    expect(leave).toEqual(buyers);
  });

  it('MUTATION: a generated artifact is neither taken nor left silently — it is reported', () => {
    // Measured in the experiment: upstream's committed types describe upstream's schema, and the
    // buyer has a table upstream has never heard of. Delivering the file would delete that knowledge.
    const { take, leave, regenerate } = planUpgrade([
      'src/lib/db/database.types.ts',
      'docs/ACCESS-MATRIX.md',
    ]);
    expect(regenerate).toHaveLength(2);
    expect(take).toEqual([]);
    expect(leave).toEqual([]);
  });

  it('MUTATION: a src/ path that merely starts with an upstream-owned WORD is still the buyer’s', () => {
    // `scripts/` is upstream-owned; `src/scripts/` is not. A prefix test that matched anywhere in the
    // path rather than at its start would hand over a directory the buyer named.
    expect(planUpgrade(['src/scripts/seed.ts']).take).toEqual([]);
  });

  it('the boundary lists are non-empty and disjoint', () => {
    expect(UPSTREAM_OWNED.length).toBeGreaterThan(0);
    for (const generated of REGENERATE_NEVER_SHIP) {
      // A generated artifact must not also be claimed as upstream-owned, or it would be shipped.
      const claimed = UPSTREAM_OWNED.some((p) => generated.startsWith(p));
      expect(claimed, `${generated} is claimed by both rules`).toBe(false);
    }
  });
});

describe('assertPlanDelivers — the positive control the job was missing', () => {
  /**
   * The same shape as `checkPositiveControls` one layer up, and it was found the same way.
   *
   * An empty plan copies nothing, runs `supabase migration up --include-all` as a no-op, and exits
   * 0. Because `supabase/tests/intent/` is upstream-owned, today's suite only ARRIVES if the upgrade
   * took files — so an empty plan leaves the scaffold running the OLD tag's tests against the OLD
   * tag's schema, which is green. And "the buyer's own code survived" passes trivially, because
   * nothing moved. The job asserts "the upgraded project passes its own tests" where it means
   * "passes today's tests", and those coincide only when the upgrade actually happened.
   */
  const real = ['supabase/migrations/20260908170000_null_safe_is_org_admin.sql'];

  it('a plan that takes something is delivered', () => {
    expect(assertPlanDelivers({ take: real, leave: [], regenerate: [] })).toEqual([]);
  });

  it('MUTATION: the empty plan — a wrong ref, a rename, a shallow checkout — is refused', () => {
    const problems = assertPlanDelivers({ take: [], leave: [], regenerate: [] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/nothing|empty|delivered/i);
  });

  it('MUTATION: a plan that moves only files the buyer owns is not an upgrade', () => {
    // The subtler shape: the diff resolved, but every path in it was left alone. Nothing upstream
    // owns arrived, so today's suite is still the old one, and the job would still be green.
    const problems = assertPlanDelivers({
      take: [],
      leave: ['src/app/[locale]/orgs/page.tsx', 'README.md'],
      regenerate: [],
    });
    expect(problems).toHaveLength(1);
  });

  it('a regenerate-only plan is still refused — a generated artifact is never delivered', () => {
    expect(
      assertPlanDelivers({ take: [], leave: [], regenerate: ['src/lib/db/database.types.ts'] }),
    ).toHaveLength(1);
  });
});
