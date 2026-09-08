import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * ADR-012: the gates must stay framework-agnostic, or a future port loses the half of keel that
 * took longest to build. This is cheap to keep true and impossible to notice going wrong.
 */
const gates = readdirSync('scripts').filter((f) => f.endsWith('.mjs'));

describe('portability (ADR-012)', () => {
  it('every gate exists', () => expect(gates.length).toBeGreaterThanOrEqual(8));

  it('no gate imports a framework — they read files, the database, or package.json', () => {
    for (const g of gates) {
      const src = readFileSync(`scripts/${g}`, 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(/^next|^react|^@next/.test(spec), `${g} imports ${spec} — the gate suite must survive a port`)
          .toBe(false);
      }
    }
  });

  it('the portable half is substantial — otherwise the seam is a slogan', () => {
    // If a port has to rewrite the policies and the proof harness, it is a rebuild, not a port.
    const portable = ['supabase/migrations', 'supabase/tests/intent', 'scripts', 'spec', 'docs/adr', 'messages'];
    for (const dir of portable) expect(readdirSync(dir).length, `${dir} is empty`).toBeGreaterThan(0);
  });
});
