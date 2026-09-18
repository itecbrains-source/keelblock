#!/usr/bin/env node
/**
 * SPEC-015 REQ-6 / AC-6 — the LAB half of B-8's performance budget.
 *
 * **What this is, said where it cannot be missed.** These are bytes of client JavaScript, read from
 * `.next/static` after a build. They are **not Core Web Vitals**. CWV are assessed at the 75th
 * percentile of real user data from CrUX over a 28-day rolling window (memo 17), and this project has
 * no users (DEF-001), no deployed instance carrying traffic, and therefore no such data. A number
 * here PREDICTS field performance; it does not measure it. The field half waits on an event rather
 * than a date — DEF-034.
 *
 * REQ-6's failure is the ordinary one: a README quoting a lab score in the vocabulary of a field
 * measurement. So the disclaimer is not a docblock courtesy — it is carried in the output, because
 * the output is what survives into somebody's release notes six months from now.
 *
 * **Why bytes rather than a timing.** A lab timing on a shared runner moves run to run, and a budget
 * that flakes gets raised until it measures nothing (F-80's decay shape). MEASURED 2026-09-18: a
 * clean build and two incremental builds of an unchanged tree produced byte-identical output. Bytes
 * are deterministic, so the bound needs headroom for growth rather than for noise.
 *
 * **Why no per-route list.** A hand-listed set of routes is what F-77 spent three commits removing
 * and what F-90 recorded growing past its evidence. One ceiling applied to everything the build
 * emits covers a page added tomorrow without anybody remembering to add it.
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUILD_DIR = '.next/static';
export const CONFIG = 'keelblock.budget.json';

/**
 * The sentence the output must carry. Exported so a test can assert it is actually said, rather than
 * trusting that somebody remembered to say it.
 */
export const LAB_DISCLAIMER =
  'LAB MEASUREMENT — bundle bytes from a build, not Core Web Vitals. CWV are the 75th percentile ' +
  'of real user data over 28 days, which this project has none of (DEF-034).';

/**
 * Every client JavaScript file the build emitted, with its size.
 *
 * Walks rather than reading a manifest on purpose: `app-build-manifest.json` does not exist under
 * Turbopack, and manifest shapes change between bundlers and majors. What does not change is that
 * the browser downloads the files on disk.
 *
 * @param {string} dir @returns {{path: string, bytes: number}[]}
 */
export function clientBundles(dir = BUILD_DIR) {
  /** @type {{path: string, bytes: number}[]} */ const out = [];
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (p.endsWith('.js')) out.push({ path: p, bytes: s.size });
    }
  };
  walk(dir);
  return out.sort((a, b) => b.bytes - a.bytes);
}

/**
 * @param {{path: string, bytes: number}[]} files
 * @returns {{files: number, totalBytes: number, largestChunkBytes: number, largest: string | null}}
 */
export function measure(files) {
  return {
    files: files.length,
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    largestChunkBytes: files.length ? files[0].bytes : 0,
    largest: files[0]?.path ?? null,
  };
}

/**
 * Compare a measurement to the declared bound.
 *
 * Returns problems, each naming the number, the bound, the overshoot and what it is a measurement OF
 * — because a budget failure that says only "too big" invites raising the number, and one that says
 * what crossed it invites looking at the diff.
 *
 * @param {ReturnType<typeof measure>} m
 * @param {{totalBytes: number, largestChunkBytes: number}} bound
 * @returns {string[]}
 */
export function checkBudget(m, bound) {
  const problems = [];
  const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;

  if (m.files === 0) {
    // A budget that passes because it measured nothing is this project's most expensive recurring
    // defect (F-13). An empty build directory is not a small bundle.
    problems.push(
      `no client JavaScript found under ${BUILD_DIR}. A budget that measured nothing is not a ` +
        `budget — run \`npm run build\` first. (${LAB_DISCLAIMER})`,
    );
    return problems;
  }
  if (m.totalBytes > bound.totalBytes) {
    problems.push(
      `client JS total is ${kib(m.totalBytes)}, over the declared bound of ` +
        `${kib(bound.totalBytes)} by ${kib(m.totalBytes - bound.totalBytes)}. ` +
        `${LAB_DISCLAIMER} Raise the bound in ${CONFIG} with a reason, or find the weight.`,
    );
  }
  if (m.largestChunkBytes > bound.largestChunkBytes) {
    problems.push(
      `the largest single chunk is ${kib(m.largestChunkBytes)} (${m.largest}), over the declared ` +
        `bound of ${kib(bound.largestChunkBytes)}. One fat dependency is the usual cause. ` +
        `${LAB_DISCLAIMER}`,
    );
  }
  return problems;
}

/** The declared bound, and the file that declares it. */
export function declaredBound(file = CONFIG) {
  return JSON.parse(readFileSync(file, 'utf8')).bundle;
}

/** One line for a human, naming what was measured and what it is not. */
export function summarise(m, bound) {
  const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
  return (
    `budget: ${kib(m.totalBytes)} of client JS across ${m.files} file(s), largest ` +
    `${kib(m.largestChunkBytes)} — bounds ${kib(bound.totalBytes)} / ` +
    `${kib(bound.largestChunkBytes)}. ${LAB_DISCLAIMER}`
  );
}

function main() {
  const bound = declaredBound();
  const m = measure(clientBundles());
  const problems = checkBudget(m, bound);
  if (problems.length) {
    console.error('budget: FAILED\n');
    for (const p of problems) console.error(`  ${p}\n`);
    process.exit(1);
  }
  console.log(summarise(m, bound));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
