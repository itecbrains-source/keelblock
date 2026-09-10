import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  NOT_SHIPPED,
  PROVENANCE_FILE,
  UPSTREAM_REMOTE,
  filesToCopy,
  nextSteps,
  provenanceFor,
  rewriteManifest,
  cloneArgs,
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
    // 3 → 4 on 2026-09-10, and the raise is recorded rather than absorbed, because a shrink-only
    // ratchet that quietly moves is a counter. The first three exclusions are all one category:
    // records ABOUT keelblock that assert against keelblock's own history. `deploy.yml` is a second
    // category that did not exist until keelblock had a deployment of its own — it publishes
    // keelblock.dev to keelblock's Vercel project and is guarded on `github.repository`, so a
    // generated project would inherit a workflow that can never run and names another repository
    // in its condition. The alternative was shipping it inert, which is worse: a buyer reading
    // their own repository would find a deploy story that is not theirs.
    expect(NOT_SHIPPED).toHaveLength(4);
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

describe('the network path — F-74', () => {
  /**
   * The ~90 lines of `main()` that no test executed are where every scaffolder defect has lived.
   * This does not test `main()`; it tests the one line inside it that the DEFAULT invocation dies
   * on, extracted so it can be executed at all.
   *
   * `npx create-keelblock-app myapp` — B-1's headline command, with no `--ref` — built
   * `git clone --depth 1 --branch HEAD <url>`, and git answers
   * `fatal: Remote branch HEAD not found in upstream origin`. `--branch` takes a branch or a tag;
   * HEAD is neither.
   */
  it('MUTATION: no ref means no --branch, not --branch HEAD', () => {
    const args = cloneArgs(null, 'https://example.test/repo.git', '/tmp/x');
    expect(args).not.toContain('--branch');
    expect(args).not.toContain('HEAD');
    expect(args).toEqual(['clone', '--depth', '1', 'https://example.test/repo.git', '/tmp/x']);
  });

  it('a named ref is still passed through, because that is what --branch is for', () => {
    expect(cloneArgs('v0.2.0', 'https://example.test/repo.git', '/tmp/x')).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'v0.2.0',
      'https://example.test/repo.git',
      '/tmp/x',
    ]);
  });

  it('SAFETY: the argument vector is a list, so a ref cannot become a second argument', () => {
    // execFileSync, not a shell string. A ref containing a space or a semicolon is one argument.
    const args = cloneArgs('; rm -rf /', 'https://example.test/repo.git', '/tmp/x');
    expect(args.filter((a) => a === '; rm -rf /')).toHaveLength(1);
  });
});

describe('the default invocation actually runs — F-74', () => {
  /**
   * The combination nothing executed. CI scaffolds with `--from "$GITHUB_WORKSPACE" --ref
   * "$GITHUB_SHA"`, so `ref` is always a string there; the DEFAULT invocation has no `--ref` and
   * `ref` is null. Two separate git calls then received `null` — `clone --branch` and `ls-tree` —
   * and the second only surfaced after the first was fixed and the thing was run again.
   *
   * Local source, so this needs no network: the null-ref path is what is under test, not the clone.
   */
  it('scaffolds from a local checkout with no --ref', () => {
    const dest = mkdtempSync(join(tmpdir(), 'keelblock-t-'));
    rmSync(dest, { recursive: true, force: true }); // the scaffolder refuses an existing directory
    try {
      const r = spawnSync(
        'node',
        ['scripts/create-keelblock-app.mjs', dest, '--from', process.cwd()],
        { encoding: 'utf8' },
      );
      expect(r.status, `scaffolder exited ${r.status}\n${r.stderr}`).toBe(0);

      const provenance = JSON.parse(readFileSync(join(dest, PROVENANCE_FILE), 'utf8'));
      // A resolved commit, not the string "HEAD": a pointer in a provenance file means something
      // different tomorrow, and `upgrade.mjs` is given this value to upgrade FROM.
      expect(provenance.ref).toMatch(/^[0-9a-f]{40}$/);
      expect(provenance.commit).toBe(provenance.ref);
      expect(existsSync(join(dest, 'package.json'))).toBe(true);
      // The exclusion list is exercised here rather than only asserted as data.
      expect(existsSync(join(dest, '.github/workflows/deploy.yml'))).toBe(false);
      expect(existsSync(join(dest, 'docs/review'))).toBe(false);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  }, 120_000);
});
