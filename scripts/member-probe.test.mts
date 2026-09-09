import { describe, expect, it } from 'vitest';
import { buildProbeSql, missingStatements, parseProbeOutput } from './member-probe.mjs';

describe('member probe — the attempts must not contaminate each other', () => {
  it('every attempt is wrapped so its effect is undone before the next one runs', () => {
    // Measured, and it is why this rule exists: the attempts share one transaction and run in
    // alphabetical order, so a project DELETE that SUCCEEDS destroys the row the later SELECT and
    // UPDATE measure. Weakening one policy moved three cells, two of them to an anomaly the
    // database never produced.
    const sql = buildProbeSql(['project:DELETE', 'project:SELECT']);
    expect(sql).toContain('raise exception');
    expect(sql).toMatch(/exception\s+when sqlstate 'P0001'/);
    expect(sql.indexOf("'project:DELETE'")).toBeLessThan(sql.indexOf("'project:SELECT'"));
  });

  it('MUTATION: a policied command with no attempt is named, never quietly skipped', () => {
    expect(missingStatements(['project:SELECT', 'ghost:UPDATE'])).toEqual(['ghost:UPDATE']);
  });

  it('reads only the block after the marker, so psql noise is not an outcome', () => {
    const out = ['NOTICE: whatever', '--probe--', 'project:DELETE|refused'].join('\n');
    expect([...parseProbeOutput(out)]).toEqual([['project:DELETE', 'refused']]);
  });

  it('is not vacuous: nothing after the marker yields nothing', () => {
    expect(parseProbeOutput('no marker here|allowed').size).toBe(0);
  });
});
