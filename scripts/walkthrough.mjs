#!/usr/bin/env node
/**
 * Run the getting-started page — SPEC-012, bar B-5.
 *
 * B-5's proof is "a scripted walkthrough run by someone with no prior context, timed and recorded",
 * which is a promise about a future event: the shape B-1 was in until it became a job with a budget.
 * This is the half of that promise a machine can keep. `research/14-EXECUTABLE-DOCS.md` settles the
 * other half and where the line falls, and the line matters — a machine will happily execute a
 * perfectly incomprehensible page. **Green here is evidence the instructions WORK, and none at all
 * that they TEACH.** That is B-11, measured by the handover trial, with its human leg at DEF-024.
 *
 * The page is the source. Adopted from rustdoc, whose documentation tests exist so that "examples
 * within your documentation are up to date and working": every shell block runs unless it says
 * otherwise, so forgetting is loud rather than silent.
 *
 * NOT adopted: Go's output matching. It is the right instinct in the wrong currency for a shell —
 * pinning stdout would pin version banners, ports and timings, and would be edited into uselessness
 * within a month. What survives is the principle this repository already holds: exit zero is not
 * evidence, something must be PRESENT.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const PAGE = 'docs/GETTING-STARTED.md';

/**
 * What CI runs in place of what the page says, each with a reason, and the list may only SHRINK.
 *
 * This is rustdoc's hidden-setup-line idea with the honesty inverted: visible in the runner rather
 * than hidden in the page, carrying its reason, and countable — so a walkthrough quietly diverging
 * from the page it claims to execute is a failure rather than a habit.
 */
export const SUBSTITUTIONS = [
  {
    find: 'npx create-keelblock-app my-app',
    replace:
      'node "$KEELBLOCK_REPO/scripts/create-keelblock-app.mjs" my-app --from "$KEELBLOCK_REPO" --ref "$KEELBLOCK_REF" --upstream "$KEELBLOCK_REPO"',
    why:
      'the published package is a placeholder that says "not yet functional" until DEF-027 closes, ' +
      'so `npx` would fetch a stub. CI scaffolds from the checkout instead, which is the same code ' +
      'by a shorter route. When DEF-027 closes this entry goes, and the page needs no edit.',
  },
];

/**
 * Pure: the shell blocks of a markdown page, in order.
 *
 * A fenced block is a line-oriented construct with an opening fence, an info string and a closing
 * fence — this reads that structure rather than pattern-matching prose, for the same reason the
 * TAP reader in `check-policies` does. No markdown parser is installed, and pulling one in to find
 * three backticks would be the heavier mistake.
 *
 * @param {string} md
 * @returns {Array<{lang: string, info: string, code: string, line: number}>}
 */
export function fencedBlocks(md) {
  const out = [];
  const lines = md.split('\n');
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```(.*)$/);
    if (!fence) {
      if (open) open.body.push(lines[i]);
      continue;
    }
    if (open) {
      out.push({ lang: open.lang, info: open.info, code: open.body.join('\n'), line: open.line });
      open = null;
    } else {
      const info = fence[1].trim();
      open = { lang: info.split(/\s+/)[0] ?? '', info, body: [], line: i + 1 };
    }
  }
  return out;
}

/**
 * Pure: what the runner will execute, and what it refuses to.
 *
 * Default is RUN. A block opts out with `ignore` **and a reason** — an unexplained skip is how a
 * walkthrough becomes a subset of itself one block at a time.
 *
 * @param {Array<{lang: string, info: string, code: string, line: number}>} blocks
 * @returns {{run: Array<{code: string, line: number}>, skipped: Array<{line: number, why: string}>, problems: string[]}}
 */
export function planWalkthrough(blocks) {
  const run = [];
  const skipped = [];
  const problems = [];
  for (const b of blocks) {
    if (b.lang !== 'bash' && b.lang !== 'sh') continue;
    const rest = b.info.slice(b.lang.length).trim();
    if (!rest) {
      run.push({ code: b.code, line: b.line });
      continue;
    }
    const m = rest.match(/^ignore\s+(.+)$/);
    if (!m) {
      problems.push(
        `${PAGE}:${b.line} — shell block tagged "${rest}", which is not a marker this runner knows. ` +
          `Use \`bash\` to run it, or \`bash ignore <reason>\` to say why it cannot be.`,
      );
      continue;
    }
    if (m[1].trim().length < 12) {
      problems.push(
        `${PAGE}:${b.line} — skipped with the reason "${m[1].trim()}". An unexplained skip is how a ` +
          `walkthrough becomes a subset of itself one block at a time.`,
      );
      continue;
    }
    skipped.push({ line: b.line, why: m[1].trim() });
  }
  return { run, skipped, problems };
}

/** Pure: apply the declared substitutions, and report which were used. */
export function applySubstitutions(code, subs = SUBSTITUTIONS) {
  const used = [];
  let out = code;
  for (const s of subs) {
    if (out.includes(s.find)) {
      out = out.split(s.find).join(s.replace);
      used.push(s.find);
    }
  }
  return { code: out, used };
}

function main() {
  if (!existsSync(PAGE)) {
    console.error(`walkthrough: ${PAGE} does not exist — there is nothing to run.`);
    process.exit(2);
  }
  const { run, skipped, problems } = planWalkthrough(fencedBlocks(readFileSync(PAGE, 'utf8')));
  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    process.exit(2);
  }
  // A page with no runnable block would pass every assertion below by doing nothing. F-41 and F-48
  // are that exact defect, twice.
  if (!run.length) {
    console.error(
      `walkthrough: ${PAGE} has no runnable shell block. A walkthrough of nothing is green.`,
    );
    process.exit(2);
  }

  // ONE shell, not one per block. A person following this page types into a single terminal, and
  // `cd my-app` in the second block is load-bearing for every block after it — running each in its
  // own `bash -c` would quietly execute the rest in the wrong directory and still pass. Echo markers
  // carry the page's line numbers into the log, so a failure names the block it came from.
  const script = [
    'set -eo pipefail',
    ...run.flatMap((block, i) => {
      const { code, used } = applySubstitutions(block.code);
      return [
        `echo ""`,
        `echo "── ${PAGE}:${block.line} (block ${i + 1}/${run.length})"`,
        ...used.map((u) => `echo "   substituted: ${u.replace(/"/g, '\\"')}"`),
        code,
      ];
    }),
  ].join('\n');

  const started = Date.now();
  execFileSync('bash', ['-c', script], {
    stdio: 'inherit',
    cwd: process.env.WALKTHROUGH_CWD ?? process.cwd(),
  });
  const seconds = Math.round((Date.now() - started) / 1000);

  for (const s of skipped) console.log(`\n   not run — ${PAGE}:${s.line}: ${s.why}`);
  console.log(`\nwalkthrough: ${run.length} block(s) from ${PAGE}, ${seconds}s`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
