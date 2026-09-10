#!/usr/bin/env node
/**
 * `create-keelblock-app` — SPEC-011, bar B-1.
 *
 * Scaffolding and upgrading are one decision seen twice (`research/13-SCAFFOLDING.md`). What this
 * writes into the generated project is exactly what `scripts/upgrade.mjs` later reads, and the memo
 * measured what happens when that is got wrong: a plain tarball copy dies on `upgrade.mjs`'s first
 * command with `fatal: bad object`, while the same copy with an `upstream` remote upgrades cleanly.
 *
 * So the generated project starts its OWN history and keeps a fetchable pointer home.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

/** The provenance record, and the marker that this project was generated rather than cloned. */
export const PROVENANCE_FILE = 'keelblock.provenance.json';

/** The public origin a generated project points at. */
export const UPSTREAM_REMOTE = 'upstream';
export const UPSTREAM_URL = 'https://github.com/itecbrains-source/keelblock.git';

/**
 * What keelblock keeps to itself, with the reason, MEASURED rather than guessed.
 *
 * A scaffold was built and `npm run check` run inside it (`research/13-SCAFFOLDING.md`). Everything
 * else in the repository passed — the specs, the ADRs, the research memos and the findings are all
 * part of what a buyer inherits, and the gates need them. Only this failed, and it failed for a
 * structural reason rather than a fixable one.
 *
 * This list may only SHRINK. An entry is a claim that something cannot travel.
 */
export const NOT_SHIPPED = [
  {
    path: 'docs/review/',
    why:
      "a review OF keelblock. Every record cites a commit in keelblock's history, so in any other " +
      'repository the review-records rule reports "claims commit X, which is not in this ' +
      'repository\'s history" — correctly. The records are not portable, by construction.',
  },
  {
    path: '.github/workflows/deploy.yml',
    why:
      "deploys keelblock.dev — keelblock's own marketing site — to keelblock's own Vercel project " +
      '(ADR-024). It is guarded on `github.repository`, so a generated project would inherit a ' +
      "workflow that can never run and names somebody else's repository in its condition. Not " +
      "portable by construction, the same way the review records are not. A buyer's own deploy " +
      'story is theirs to write, and SPEC-016 preflight already takes a named target rather than ' +
      'inventing one for them.',
  },
  {
    path: 'scripts/review-register.test.mts',
    why:
      'asserts against the REAL register — "the real register answers every real finding, and the ' +
      'review is CLOSED". True of keelblock, meaningless elsewhere. Measured: it is the only test ' +
      'in the suite that fails in a generated project.',
  },
  {
    path: 'scripts/review-records.test.mts',
    why: 'the same shape for the records reader: it asserts that the real record series is numbered\n      consecutively and cites real commits. A generated project has no record series, so the test\n      is not failing about the project — it is asking a question the project cannot be asked.',
  },
];

/**
 * The READERS ship. `scripts/review-register.mjs` and `review-records.mjs` are generic code, and
 * both of their consumers already tolerate having nothing to read — `status.mjs`'s `reviewState()`
 * returns null on a missing audit, and `check-promises` skips the rule when the project declares
 * itself generated. Excluding them was tried first and was worse: `status.mjs` imports them
 * statically, so the generated project lost `npm run status` to get rid of two unused files.
 */

/**
 * Pure: which of the template's tracked files a generated project gets.
 *
 * @param {string[]} tracked every path `git ls-files` reports in the template
 * @param {Array<{path: string}>} [excluded]
 * @returns {string[]}
 */
export function filesToCopy(tracked, excluded = NOT_SHIPPED) {
  return tracked.filter(
    (p) => !excluded.some((e) => (e.path.endsWith('/') ? p.startsWith(e.path) : p === e.path)),
  );
}

/**
 * Remove directories left empty by the dropped files, deepest first, stopping at the project root.
 *
 * Deepest-first matters: `docs/review/` only becomes empty after `docs/review/records/` has gone, so
 * a shallow-first pass would leave the parent behind. `rmdirSync` on a non-empty directory throws,
 * which is the check — a directory that still holds something a buyer wants is never removed.
 *
 * @param {string} root the generated project directory
 * @param {string[]} dropped repo-relative paths that were removed
 */
export function pruneEmptyDirs(root, dropped) {
  const dirs = new Set();
  for (const rel of dropped) {
    let dir = dirname(rel);
    while (dir && dir !== '.' && dir !== '/') {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }
  for (const dir of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    try {
      rmdirSync(join(root, dir));
    } catch {
      // Not empty, or already gone. Both mean leave it alone.
    }
  }
}

/**
 * Pure: the `git clone` arguments for a shallow copy of the template. Exported for tests, because
 * this is the line the default path dies on and nothing executed it.
 *
 * **`--branch HEAD` is not a thing.** `git clone --branch` takes a branch or a tag name; `HEAD` is
 * neither, and git answers `fatal: Remote branch HEAD not found in upstream origin`. The default
 * invocation — `npx create-keelblock-app myapp`, with no `--ref`, which is B-1's headline command —
 * built exactly that and crashed before copying a file (F-74).
 *
 * Omitting `--branch` is not a fallback, it is the correct instruction: a clone with no branch takes
 * the remote's own default HEAD, which is what "no ref given" means.
 *
 * @param {string|null} ref a tag or branch, or null for the remote's default
 * @param {string} url
 * @param {string} dest
 * @returns {string[]}
 */
export function cloneArgs(ref, url, dest) {
  return ref === null
    ? ['clone', '--depth', '1', url, dest]
    : ['clone', '--depth', '1', '--branch', ref, url, dest];
}

/**
 * Pure: what the generated project records about where it came from.
 *
 * `ref` is what `upgrade.mjs` is given to upgrade FROM, and `commit` is what makes it unambiguous
 * after a tag moves. `generated` is the field the gates read to know they are not in keelblock.
 *
 * @param {{name: string, ref: string, commit: string, upstream?: string, at?: string}} input
 */
export function provenanceFor({ name, ref, commit, upstream = UPSTREAM_URL, at }) {
  return {
    generated: 'create-keelblock-app',
    name,
    ref,
    commit,
    upstream,
    generatedAt: at ?? new Date().toISOString(),
    upgrade: `git fetch ${UPSTREAM_REMOTE} --tags && node scripts/upgrade.mjs <newer-ref>`,
  };
}

/**
 * Pure: the generated project's own identity, not keelblock's.
 *
 * `private: true` because a scaffolded application is not a package somebody publishes, and leaving
 * keelblock's publish metadata in place is how a buyer accidentally publishes their SaaS to npm.
 *
 * @param {Record<string, unknown>} pkg the template's package.json, parsed
 * @param {string} name
 * @returns {Record<string, unknown>}
 */
export function rewriteManifest(pkg, name) {
  const out = { ...pkg, name, version: '0.1.0', private: true };
  delete out.publishConfig;
  delete out.repository;
  delete out.homepage;
  delete out.bugs;
  return out;
}

/** Pure: what to tell the person at the end, including the upgrade they cannot guess. */
export function nextSteps(dir, ref) {
  return [
    `cd ${dir}`,
    'npm install',
    'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # the proof toolchain',
    'supabase start',
    'npm run check',
    '',
    `Scaffolded from ${ref}. To take a later release:`,
    `  git fetch ${UPSTREAM_REMOTE} --tags && node scripts/upgrade.mjs <newer-ref>`,
  ];
}

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function main() {
  const argv = process.argv.slice(2);
  const name = argv.find((a) => !a.startsWith('--'));
  const fromArg = argv.indexOf('--from');
  const refArg = argv.indexOf('--ref');
  // `--upstream` exists for two real cases and is not a testing hook: a fork, and CI. On a pull
  // request `$GITHUB_SHA` is a merge commit that exists in the checkout and NOT on the remote, so a
  // job proving the generated project can be upgraded has to point it at the checkout or prove
  // nothing. The default is the public repository, which is what a person gets.
  const upArg = argv.indexOf('--upstream');
  const upstream = upArg === -1 ? UPSTREAM_URL : argv[upArg + 1];
  if (!name) {
    console.error(
      'usage: create-keelblock-app <directory> [--from <path>] [--ref <tag>] [--upstream <url>]',
    );
    process.exit(2);
  }
  if (existsSync(name)) {
    console.error(`${name} already exists. Refusing to write into it.`);
    process.exit(2);
  }

  // A local checkout when given one — which is what CI times — otherwise a shallow clone of the
  // public repository. Either way the template is a git repo, so the ref and commit are its own
  // answer rather than something this script invents.
  let source = fromArg === -1 ? null : argv[fromArg + 1];
  let temp = null;
  // `null` means "whatever the remote calls its default", which is a different thing from the
  // string 'HEAD' — and conflating them is what broke the default path.
  const ref = refArg === -1 ? null : argv[refArg + 1];
  if (!source) {
    temp = mkdtempSync(join(tmpdir(), 'keelblock-'));
    run('git', cloneArgs(ref, UPSTREAM_URL, temp), process.cwd());
    source = temp;
  }

  // `rev-parse` is the opposite case: HEAD is exactly what it understands for "the current commit".
  const commit = run('git', ['rev-parse', ref ?? 'HEAD'], source).trim();
  // What the generated project records it came FROM. A resolved commit when no ref was named,
  // because "HEAD" in a provenance file is a pointer that means something different tomorrow.
  const provenanceRef = ref ?? commit;

  // ONE snapshot. The first version listed paths with `git ls-files` and copied their contents out
  // of the working tree, which is two different states: a file staged but not committed was listed
  // and copied, a file present but untracked was copied without being listed. `git archive` takes
  // the ref and nothing else, so what lands is exactly one commit's worth of repository.
  // The RESOLVED COMMIT, not the ref. With no `--ref` the ref is null, and `git ls-tree … null`
  // answers `fatal: Not a valid object name null` — the second half of F-74, which surfaced only by
  // running the thing after the first half was fixed. Using the commit also makes the sentence above
  // literally true rather than true by coincidence: the listing and the archive below are now
  // guaranteed to be the same commit, where a ref could in principle move between the two calls.
  const tracked = run('git', ['ls-tree', '-r', '--name-only', commit], source)
    .trim()
    .split('\n')
    .filter(Boolean);
  const keep = filesToCopy(tracked);
  const drop = tracked.filter((p) => !keep.includes(p));

  mkdirSync(name, { recursive: true });
  execFileSync(
    'sh',
    [
      '-c',
      `git -C ${JSON.stringify(source)} archive --format=tar ${commit} | tar -x -C ${JSON.stringify(name)}`,
    ],
    { stdio: 'inherit' },
  );
  for (const rel of drop) rmSync(join(name, rel), { recursive: true, force: true });
  // …and the directories they leave behind. `tar -x` creates a directory for every archived file,
  // so removing all of `docs/review/`'s files left the buyer an empty `docs/review/` — a folder that
  // says something used to be here, in a generated project whose whole point is that it is theirs
  // from the first commit. Found by asserting it rather than by looking (F-74).
  pruneEmptyDirs(name, drop);

  const pkg = JSON.parse(readFileSync(join(name, 'package.json'), 'utf8'));
  writeFileSync(
    join(name, 'package.json'),
    JSON.stringify(rewriteManifest(pkg, name), null, 2) + '\n',
  );
  writeFileSync(
    join(name, PROVENANCE_FILE),
    JSON.stringify(provenanceFor({ name, ref: provenanceRef, commit, upstream }), null, 2) + '\n',
  );

  // The buyer's history starts here. Not a clone: 200 commits of a product they did not write is
  // not their project's past, and it is the whole reason scaffolders download tarballs.
  run('git', ['init', '-q'], name);
  run('git', ['remote', 'add', UPSTREAM_REMOTE, upstream], name);
  run('git', ['add', '-A'], name);
  run(
    'git',
    [
      '-c',
      'user.email=you@example.com',
      '-c',
      'user.name=you',
      'commit',
      '-qm',
      `keelblock ${provenanceRef}`,
    ],
    name,
  );

  if (temp) rmSync(temp, { recursive: true, force: true });
  console.log(`\nScaffolded ${keep.length} files into ${name}/\n`);
  for (const line of nextSteps(name, provenanceRef)) console.log(line ? `  ${line}` : '');
}

/**
 * A scaffolder that fails must say what a person can do about it.
 *
 * `main()` had no handler, so the default path's crash — `git clone --branch HEAD`, which git
 * refuses — surfaced as an `execFileSync` stack trace with a spawn error in it. The first thing a
 * new user runs, failing in the least legible way available (F-74). A temp directory was also left
 * behind on every failure after it was created.
 *
 * The stack still goes to stderr under `--debug`: swallowing it entirely would trade one unhelpful
 * failure for another.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`\ncreate-keelblock-app failed.\n\n  ${detail.split('\n')[0]}\n`);
    console.error('  If this was a network clone, check that the ref exists:');
    console.error(`    git ls-remote --heads --tags ${UPSTREAM_URL}\n`);
    console.error('  A local checkout skips the network entirely:');
    console.error('    node scripts/create-keelblock-app.mjs <dir> --from /path/to/keelblock\n');
    if (process.argv.includes('--debug') && error instanceof Error) console.error(error.stack);
    process.exit(1);
  }
}
