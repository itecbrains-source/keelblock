import { describe, expect, it } from 'vitest';
import { expiredExemptions } from './check-unused.mjs';

/**
 * The rule this file defends: knip already answers "is this exemption still needed?" on every run,
 * under *Configuration hints*, and the gate exited 0 regardless — so five exemptions outlived the
 * expiry written in their own `knip.reasons.md` row without anything going red.
 */
describe('expired knip exemptions', () => {
  it('MUTATION: a "Remove from" hint is an expired exemption', () => {
    const out = [
      'Configuration hints (2)',
      '@supabase/ssr                knip.json  Remove from ignoreDependencies',
      '@testing-library/react       knip.json  Remove from ignoreDependencies',
    ].join('\n');
    const expired = expiredExemptions(out);
    expect(expired).toHaveLength(2);
    expect(expired[0]).toContain('@supabase/ssr');
  });

  it('a structural hint is not an expired exemption', () => {
    // Failing on this would be a gate nobody can satisfy: it is a fact about knip, not a stale row.
    const out = '.css    knip.json  Compiled extension excluded by project (imports not followed)';
    expect(expiredExemptions(out)).toEqual([]);
  });

  it('clean output reports nothing', () => {
    expect(expiredExemptions('')).toEqual([]);
  });
});
