import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import {
  findingIds,
  parseFaq,
  checkContent,
  checkDifferentiators,
  checkDocumentation,
  checkCommandBlocks,
} from './check-content.mjs';

const manifest = JSON.parse(readFileSync('docs/content/MANIFEST.json', 'utf8'));
const findings = findingIds(readFileSync('docs/FINDINGS.md', 'utf8'));
const faq = parseFaq(readFileSync('docs/FAQ.md', 'utf8'));
const yes = () => true;
const tiny = { $destinations: { blog: '', internal: '' }, material: [{ id: 'F-1', to: ['blog'] }] };

describe('content gate', () => {
  it('the real repository routes every finding and cites every answer', () => {
    expect(checkContent(manifest, findings, faq, (p: string) => existsSync(p))).toEqual([]);
  });

  it('finds every finding in FINDINGS.md', () => {
    expect(findings.length).toBeGreaterThanOrEqual(22);
    expect(findings).toContain('F-1');
  });

  it('reads FAQ questions and their in-repo citations', () => {
    expect(faq.length).toBeGreaterThanOrEqual(10);
    expect(faq.every((f) => f.q.length > 0)).toBe(true);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a new finding routed nowhere is caught the day it lands', () => {
    // The whole mechanism: route it now, while the reasoning is fresh, or mine it later and lose it.
    const p = checkContent(tiny, ['F-1', 'F-99'], [], yes);
    expect(p[0]).toMatch(/routed nowhere/);
    expect(p[0]).toMatch(/never fresher than today/);
  });

  it('MUTATION: a routed finding that has been deleted is caught', () => {
    expect(checkContent(tiny, [], [], yes)[0]).toMatch(/no longer exists/);
  });

  it('MUTATION: an invented destination is caught', () => {
    const m = { ...tiny, material: [{ id: 'F-1', to: ['newsletter'] }] };
    expect(checkContent(m, ['F-1'], [], yes)[0]).toMatch(/not a declared destination/);
  });

  it('MUTATION: internal without a reason is caught — that is how material gets buried', () => {
    const m = { ...tiny, material: [{ id: 'F-1', to: ['internal'] }] };
    expect(checkContent(m, ['F-1'], [], yes)[0]).toMatch(/quietly buried/);
  });

  it('internal WITH a reason is a legitimate decision', () => {
    const m = {
      ...tiny,
      material: [{ id: 'F-1', to: ['internal'], angle: 'too tool-specific to generalize' }],
    };
    expect(checkContent(m, ['F-1'], [], yes)).toEqual([]);
  });

  it('MUTATION: an uncited FAQ answer is caught', () => {
    const p = checkContent(tiny, ['F-1'], [{ q: 'Is it secure?', cites: [] }], yes);
    expect(p[0]).toMatch(/cites nothing/);
  });

  it('MUTATION: an FAQ citing a file that does not exist is caught', () => {
    const p = checkContent(tiny, ['F-1'], [{ q: 'Q', cites: ['GONE.md'] }], () => false);
    expect(p[0]).toMatch(/does not exist/);
  });

  it('an outbound URL is not a citation here — only something in this repository is', () => {
    // Linking to someone else's page proves nothing about keelblock.
    expect(
      parseFaq('### Q\n\nSee [docs](https://example.com/x) and [real](FINDINGS.md).')[0].cites,
    ).toEqual(['FINDINGS.md']);
  });
});

describe('differentiators are written up as they ship', () => {
  const battlecard = readFileSync('docs/content/BATTLECARD.md', 'utf8');
  const specs = [
    { id: 'SPEC-001', status: 'done' },
    { id: 'SPEC-004', status: 'partial' },
    { id: 'SPEC-016', status: 'draft' },
  ];
  const good = {
    differentiators: [
      {
        spec: 'SPEC-001',
        claim: 'Isolation is enforced by the database rather than remembered by the app.',
        rivals: 'The field compares ids in application code after fetching the row.',
        evidence: ['F-15'],
        battlecard: 'Isolation is a database property, not an application convention',
      },
      {
        spec: 'SPEC-004',
        claim: 'Every exported Server Action reaches an authorization call or is declared public.',
        rivals: 'Nothing in the category checks this, and Next documents the exposure itself.',
        evidence: ['F-15'],
        battlecard: 'Every Server Action authorizes, and the build refuses one that does not',
      },
    ],
  };
  const run = (m: unknown, sp = specs) =>
    checkDifferentiators(m as never, sp, battlecard, ['F-15'], yes);

  it('the real manifest passes', () => {
    expect(
      checkDifferentiators(manifest, specs, battlecard, findings, (p: string) => existsSync(p)),
    ).toEqual([]);
  });

  it('MUTATION: a shipped spec with no differentiator fails', () => {
    // The gap that made this rule necessary: SPEC-004 shipped the strongest competitive artifact in
    // the repository and routed nowhere, because the material pipeline keys on F-* ids and a
    // capability produces none by itself.
    const p = run({ differentiators: [good.differentiators[0]] });
    expect(p[0]).toMatch(/SPEC-004 is partial and declares no differentiator/);
  });

  it('a draft spec is not asked for one — it has shipped nothing to claim', () => {
    expect(run(good, [{ id: 'SPEC-016', status: 'draft' }])).toEqual([]);
  });

  it('MUTATION: a claim with no comparison fails — that is a feature, not a differentiator', () => {
    const d = { ...good.differentiators[1], rivals: '' };
    const p = run({ differentiators: [good.differentiators[0], d] });
    expect(p[0]).toMatch(/no statement of what the field does instead/);
  });

  it('MUTATION: evidence that does not resolve fails', () => {
    const d = { ...good.differentiators[1], evidence: ['F-999'] };
    const p = run({ differentiators: [good.differentiators[0], d] });
    expect(p[0]).toMatch(/evidence `F-999` does not resolve/);
  });

  it('MUTATION: naming a battlecard section that was never written fails', () => {
    // Routing is a promise; the gate checks the artifact. This is the difference between the old
    // pipeline and this one.
    const d = { ...good.differentiators[1], battlecard: 'A section nobody wrote' };
    const p = run({ differentiators: [good.differentiators[0], d] });
    expect(p[0]).toMatch(/battlecard section "A section nobody wrote" is not in/);
  });

  it('MUTATION: an artifact named but absent fails', () => {
    const d = { ...good.differentiators[1], artifacts: ['docs/content/blog/nope.md'] };
    const p = checkDifferentiators(
      { differentiators: [good.differentiators[0], d] } as never,
      specs,
      battlecard,
      ['F-15'],
      (path: string) => existsSync(path),
    );
    expect(p[0]).toMatch(/artifact `docs\/content\/blog\/nope\.md` does not exist/);
  });

  it('an excused spec passes, and cannot be excused and declared at once', () => {
    expect(
      run({ differentiators: [good.differentiators[1]], $noDifferentiator: { 'SPEC-001': 'why' } }),
    ).toEqual([]);
    const both = run({
      differentiators: good.differentiators,
      $noDifferentiator: { 'SPEC-001': 'why' },
    });
    expect(both[0]).toMatch(/both declared and excused/);
  });

  it('MUTATION: a duplicate finding id fails — membership was checked, uniqueness was not', () => {
    // Introduced for real while writing this: a second `## F-33` was appended, and the gate reported
    // every finding routed, because it asked whether each id was in the manifest and never whether
    // it appeared twice.
    const p = checkContent(manifest, [...findings, findings[0]], [], yes);
    expect(p.some((x: string) => /appears twice in FINDINGS.md/.test(x))).toBe(true);
  });
});

describe('checkDocumentation — ADR-019, the rule that had a paragraph while its sibling had a gate', () => {
  const done = [{ id: 'SPEC-001', status: 'done' }];
  const yes = () => true;

  it('a spec naming documentation that exists is fine', () => {
    const m = { documentation: { 'SPEC-001': 'CONTRIBUTING.md' } };
    expect(checkDocumentation(m, done, yes)).toEqual([]);
  });

  it('MUTATION: a done spec with neither an entry nor an excuse is caught', () => {
    // The whole of the finding: six specs shipped `done`, the flagship guide was wrong for all of
    // it, and nothing failed. The differentiator rule beside this one would have caught the same
    // omission in competitive copy on the first push.
    const problems = checkDocumentation({}, done, yes);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('SPEC-001');
    expect(problems[0]).toMatch(/documentation/i);
  });

  it('MUTATION: naming a page that does not exist is caught, not taken on trust', () => {
    const m = { documentation: { 'SPEC-001': 'docs/guides/imaginary.md' } };
    expect(checkDocumentation(m, done, () => false)[0]).toMatch(/does not resolve|imaginary/);
  });

  it('an excuse works, and being both declared and excused does not', () => {
    const realReason = 'documented at the point of failure rather than on a page of its own';
    expect(checkDocumentation({ $noDocumentation: { 'SPEC-001': realReason } }, done, yes)).toEqual(
      [],
    );
    const both = checkDocumentation(
      {
        documentation: { 'SPEC-001': 'CONTRIBUTING.md' },
        $noDocumentation: { 'SPEC-001': 'a reason long enough to pass the length rule' },
      },
      done,
      yes,
    );
    expect(both[0]).toMatch(/both/);
  });

  it('MUTATION: an excuse too short to be a reason is refused', () => {
    // `$noDifferentiator` has the same weakness and accepts it; this at least refuses a shrug.
    expect(checkDocumentation({ $noDocumentation: { 'SPEC-001': 'n/a' } }, done, yes)[0]).toMatch(
      /reason/,
    );
  });

  it('a draft spec is not asked for documentation yet', () => {
    expect(checkDocumentation({}, [{ id: 'SPEC-007', status: 'draft' }], yes)).toEqual([]);
  });

  it('is not vacuous: the real manifest and the real spec set agree', () => {
    // Reads the repository, so this fails the day a spec ships `done` without its page.
    const manifest = JSON.parse(readFileSync('docs/content/MANIFEST.json', 'utf8'));
    const specs = readdirSync('spec')
      .filter((f) => /^SPEC-\d+/.test(f))
      .map((f) => ({
        id: f.slice(0, 8),
        status: (readFileSync(`spec/${f}`, 'utf8').match(/^> Status: `(\w+)`/m) ?? [, '?'])[1],
      }));
    expect(checkDocumentation(manifest, specs, (p: string) => existsSync(p))).toEqual([]);
  });
});

// ── every command block in the README declares how it was verified ──────────────────────────────
//
// The README's headline instruction was `npx create-keelblock-app my-app` while the published
// package was a name placeholder — its own registry description reads "Not yet functional". A
// reader's first action failed, silently, and no gate could see it: the staleness rule polices
// numbers and a broken command has none. `docs/GETTING-STARTED.md` has this solved (CI executes the
// page); the README had no mechanism at all.

describe('README command blocks declare their verification', () => {
  const scripts = { status: 'node scripts/status.mjs', check: 'node scripts/check.mjs' };
  const block = (decl: string, body: string) => `${decl}\n\n\`\`\`bash\n${body}\n\`\`\`\n`;

  it('MUTATION: an undeclared command block is caught', () => {
    const problems = checkCommandBlocks('```bash\nnpm run status\n```\n', '', scripts);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no `<!-- verified: … -->` declaration/);
  });

  it('MUTATION: a label outside the closed vocabulary is caught', () => {
    // An open vocabulary is a label anybody can invent, which is not a check.
    const problems = checkCommandBlocks(block('<!-- verified: probably -->', 'ls'), '', scripts);
    expect(problems[0]).toMatch(/not one of/);
  });

  it('MUTATION: `package-script` is refused when the script does not exist', () => {
    const problems = checkCommandBlocks(
      block('<!-- verified: package-script -->', 'npm run invented'),
      '',
      scripts,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/not a script in package\.json/);
  });

  it('`package-script` passes for a real script', () => {
    expect(
      checkCommandBlocks(block('<!-- verified: package-script -->', 'npm run status'), '', scripts),
    ).toEqual([]);
  });

  it('MUTATION: `getting-started` is refused when the block is not on the executed page', () => {
    // The claim only means anything because CI follows that page in an empty directory. A block
    // that says so while not appearing there is borrowing credibility it has not got.
    const problems = checkCommandBlocks(
      block('<!-- verified: getting-started -->', 'npm install'),
      'a page that does not contain it',
      scripts,
    );
    expect(problems[0]).toMatch(/does not appear\s+verbatim/);
  });

  it('`getting-started` passes when the block really is on that page', () => {
    expect(
      checkCommandBlocks(
        block('<!-- verified: getting-started -->', 'npm install'),
        'follow along:\n\n```bash\nnpm install\n```\n',
        scripts,
      ),
    ).toEqual([]);
  });

  it('MUTATION: `none` with no real reason is refused', () => {
    // Declaring a command unverified is allowed. Doing it without saying why, in the file the
    // reader is holding, is how the npx line survived.
    const problems = checkCommandBlocks(
      block('<!-- verified: none — meh -->', 'npx thing'),
      '',
      scripts,
    );
    expect(problems[0]).toMatch(/no real reason/);
  });

  it('`none` passes with a substantial reason', () => {
    expect(
      checkCommandBlocks(
        block(
          '<!-- verified: none — the published package is a placeholder and does not scaffold yet -->',
          'npx create-keelblock-app my-app',
        ),
        '',
        scripts,
      ),
    ).toEqual([]);
  });

  it('`package-script` is not truncated at its hyphen', () => {
    // The first version of this rule matched the kind with `[^\s—-]+`, which cut `package-script`
    // to `package` and reported every correct label as unknown — a gate that fails on correct usage
    // is one somebody switches off (F-62).
    expect(
      checkCommandBlocks(block('<!-- verified: package-script -->', 'echo hi'), '', scripts),
    ).toEqual([]);
  });

  it('an output transcript in a plain fence is not a command block', () => {
    expect(checkCommandBlocks('```\n✓ all green\n```\n', '', scripts)).toEqual([]);
  });

  it('the real README passes, and it has blocks for the rule to have looked at', () => {
    const readme = readFileSync('README.md', 'utf8');
    const gettingStarted = readFileSync('docs/GETTING-STARTED.md', 'utf8');
    const real = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(checkCommandBlocks(readme, gettingStarted, real)).toEqual([]);
    // Non-vacuous: a rule that inspected nothing would also report nothing.
    expect((readme.match(/^```bash$/gm) ?? []).length).toBeGreaterThan(0);
  });
});
