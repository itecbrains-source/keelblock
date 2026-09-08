import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { findViolations } from './check-schema-guard.mjs';

/**
 * The guard's substance is its SQL, and SQL is tested as SQL: the detection query is proven against
 * planted misconfigurations in `supabase/tests/intent/004-schema-guard.test.sql`, which creates a
 * table with RLS off, a policy with a trivially-true WITH CHECK, and disables RLS on the root table
 * — each inside a transaction that rolls back.
 *
 * These cover the surrounding parsing, and assert that the pgTAP proof exists rather than assuming it.
 */
describe('schema guard', () => {
  it('the SQL rules are proven by a pgTAP suite that exists', () => {
    const path = 'supabase/tests/intent/004-schema-guard.test.sql';
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');
    for (const violation of ['rls-disabled', 'no-policy', 'trivial-with-check']) {
      expect(sql, `${violation} has no planted case`).toContain(violation);
    }
    expect(sql, 'the root table case is missing').toContain("organization: rls-disabled");
  });

  it('parses a violation row into table and reason', () => {
    expect(findViolations(['project\trow-level security is DISABLED']))
      .toEqual([{ table: 'project', violation: 'row-level security is DISABLED' }]);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: multiple violations are all reported, not collapsed to the first', () => {
    const v = findViolations(['a\tno policy at all', 'b\trls disabled', 'c\ttrivially TRUE WITH CHECK']);
    expect(v).toHaveLength(3);
  });

  it('MUTATION: an empty result is no violations, not a silent pass on malformed input', () => {
    expect(findViolations([''])).toEqual([]);
  });
});
