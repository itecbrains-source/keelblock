import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  NOT_SHIPPED,
  PROVENANCE_FILE,
  UPSTREAM_REMOTE,
  filesToCopy,
  nextSteps,
  provenanceFor,
  rewriteManifest,
} from './create-keelblock-app.mjs';

describe('what a generated project is given', () => {
  it('MUTATION: the review records do not travel, and neither do their tests', () => {
    // Measured, not assumed (research/13-SCAFFOLDING.md): a scaffold that kept `docs/review/`
    // failed `promises` with "claims commit e4e840e, which is not in this repository's history" —
    // six times, once per record. The records cite keelblock's history and cannot mean anything
    // anywhere else.
    const tracked = [
      'src/app/page.tsx',
      'docs/review/01-AUDIT.md',
      'docs/review/DISPOSITIONS.md',
      'scripts/review-register.test.mts',
      'scripts/review-register.mjs',
    ];
    expect(filesToCopy(tracked)).toEqual([
      'src/app/page.tsx',
      // the READER ships; only the records and their tests are held back
      'scripts/review-register.mjs',
    ]);
  });

  it('every exclusion carries a reason, and the list may only shrink', () => {
    for (const e of NOT_SHIPPED)
      expect(e.why.length, `${e.path} has no reason`).toBeGreaterThan(40);
    expect(NOT_SHIPPED).toHaveLength(3);
  });

  it('is not vacuous: an ordinary file list comes back whole', () => {
    const tracked = ['src/a.ts', 'spec/SPEC-001.md', 'docs/adr/ADR-001.md'];
    expect(filesToCopy(tracked)).toEqual(tracked);
  });
});

describe('provenance — what upgrade.mjs will read', () => {
  const p = provenanceFor({
    name: 'acme',
    ref: 'v0.1.0',
    commit: 'abc123',
    at: '2026-01-01T00:00:00Z',
  });

  it('records the ref AND the commit, because a tag moves and an upgrade cannot be ambiguous', () => {
    expect(p.ref).toBe('v0.1.0');
    expect(p.commit).toBe('abc123');
  });

  it('MUTATION: it declares the project GENERATED, which is what exempts it from the review rule', () => {
    // check-promises decides applicability on something PRESENT. Drop this field and a generated
    // project is indistinguishable from a keelblock with its review deleted — which is the state
    // that rule now fails on, deliberately.
    expect(p.generated).toBe('create-keelblock-app');
  });

  it('carries the upgrade command, because it is the one thing nobody can guess', () => {
    expect(p.upgrade).toContain(`git fetch ${UPSTREAM_REMOTE} --tags`);
    expect(p.upgrade).toContain('scripts/upgrade.mjs');
  });

  it('the marker file is the one the gate looks for', () => {
    const gate = readFileSync('scripts/check-promises.mjs', 'utf8');
    expect(gate).toContain(PROVENANCE_FILE);
  });
});

describe('the generated project is its own', () => {
  it("takes the buyer's name, resets the version, and cannot be published by accident", () => {
    const out = rewriteManifest(
      {
        name: 'keelblock',
        version: '9.9.9',
        publishConfig: { access: 'public' },
        scripts: { check: 'x' },
      },
      'acme',
    );
    expect(out).toMatchObject({ name: 'acme', version: '0.1.0', private: true });
    expect(out.publishConfig).toBeUndefined();
    expect(out.scripts).toEqual({ check: 'x' });
  });

  it('the closing instructions include the proof toolchain, which is not an npm dependency', () => {
    const steps = nextSteps('acme', 'v0.1.0').join('\n');
    expect(steps).toContain('requirements.txt');
    expect(steps).toContain('supabase start');
    expect(steps).toContain('npm run check');
  });
});

describe('--upstream, and why it is not a testing hook', () => {
  it('the provenance records whichever origin the project was given', () => {
    const forked = provenanceFor({
      name: 'acme',
      ref: 'v1',
      commit: 'abc',
      upstream: 'https://example.invalid/fork.git',
      at: '2026-01-01T00:00:00Z',
    });
    expect(forked.upstream).toBe('https://example.invalid/fork.git');
  });

  it('and defaults to the real repository, which is what a person gets', () => {
    expect(provenanceFor({ name: 'a', ref: 'v1', commit: 'b', at: 'x' }).upstream).toContain(
      'github.com',
    );
  });
});
