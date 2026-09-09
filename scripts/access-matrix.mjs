#!/usr/bin/env node
/**
 * Generates docs/ACCESS-MATRIX.md — the artifact that makes keelblock's central claim checkable by a
 * stranger in thirty seconds, without trusting anyone (SPEC-002 REQ-4, bar B-2).
 *
 * Two rules, and the second was missing until 2026-09-08 (F-26):
 *
 *   · **Freshness.** `--check` re-renders and fails if the committed copy is stale, so a policy change
 *     that alters who can reach what cannot merge without the matrix diff appearing in review. That
 *     diff is the point: a reviewer who sees a new ✓ in the "different organization" column has
 *     caught a tenant leak in a document, before it reaches a user.
 *
 *   · **Content.** An anomaly or a bypass surface that nobody has answered FAILS, in both modes. The
 *     count used to be computed inside `render()`, printed, and dropped on the floor — never returned,
 *     never thresholded — so a matrix reporting a cross-tenant leak passed the gate as long as the
 *     committed copy already contained it. Freshness without content is a check on the document, not
 *     on the database.
 *
 * An accepted concern is a WRITTEN decision: a row in `keelblock.access-allowances.json` carrying a
 * reason, published in the artifact itself so the person the matrix is for can read the reasoning
 * rather than take it on trust.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { runMemberProbe } from './member-probe.mjs';
import { classifyAuthority, readPolicyHelpers } from './check-policies.mjs';
import { join } from 'node:path';

const OUT = 'docs/ACCESS-MATRIX.md';
const ALLOWANCES = 'keelblock.access-allowances.json';
const CMDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/** Long enough that "ok" cannot retire a cross-tenant leak. */
const MIN_REASON = 24;

/** Ordered least-privileged first, so the eye lands on `anon` before `service_role`. */
const IDENTITIES = [
  ['anon', 'Unauthenticated', 'a visitor with only the publishable key'],
  [
    'other',
    'Authenticated · different organization',
    '**the row that matters** — a real user of another tenant',
  ],
  ['authorized', 'Authenticated · member', 'a member of the organization that owns the row'],
  ['service_role', 'Service role', 'bypasses RLS by design; server-only, never in a browser'],
];

/**
 * ONE predicate. `render()` and `evaluate()` must never disagree about what a ⚠ is — the recurring
 * defect in this repository is one question answered by two resolvers that quietly drift apart.
 * @param {{exp?: boolean, pass?: boolean} | undefined} cell
 */
const isAnomaly = (cell) => Boolean(cell) && cell.pass === false;

/**
 * F-54 · replace the member row with what a member can actually do.
 *
 * The generator's own preamble says this artifact "describes what the database does, not what anyone
 * believes it does". That was false for one row. `rlsautotest` mocks `is_org_member` and
 * `is_org_admin` to constants — the thing that makes it exhaustive — so its "Authenticated · member"
 * column reports what a MOCK admits. On four commands a real member is refused and the published
 * matrix said ✓: `organization` UPDATE, `organization` DELETE, `organization_invitation` SELECT and
 * `project` DELETE.
 *
 * That mattered beyond four wrong glyphs. F-26's whole argument for this artifact is that a policy
 * change altering who can reach what cannot merge without the diff appearing in review — and a
 * mocked member row is byte-identical whether a command asks for admin or for membership, which is
 * precisely the change the adversarial trial made (F-53).
 *
 * `exp` is now what the policy INTENDS for a member, read from the helpers it depends on; `pass` is
 * whether a real member measured the same. So a policy that says admin-only while a member gets
 * through is an anomaly here, which it could not previously be.
 *
 * @param {any} report @param {string} db
 */
export function correctMemberRow(report, db) {
  const policied = (report.tables ?? []).flatMap((t) =>
    (t.policied ?? []).map((c) => `${t.table}:${c}`),
  );
  applyMemberTruth(report, runMemberProbe(db, policied), classifyAuthority(readPolicyHelpers(db)));
}

/**
 * The decision half, pure so it can carry mutation proofs. `exp` is what the policy INTENDS for a
 * member, read from the helpers it depends on; `pass` is whether a real member measured the same.
 * A policy that says admin-only while a member gets through is therefore an anomaly here, which it
 * could not previously be.
 *
 * @param {any} report
 * @param {Map<string, 'allowed'|'refused'>} measured
 * @param {Map<string, {authority: string, policies: string[]}>} intent
 */
export function applyMemberTruth(report, measured, intent) {
  for (const t of report.tables ?? []) {
    for (const cmd of t.policied ?? []) {
      const key = `${t.table}:${cmd}`;
      const cell = t.idgrid?.[cmd]?.authorized;
      if (!cell) continue;
      const authority = intent.get(key)?.authority;
      // A command whose authority cannot be read is left exactly as the generator reported it, and
      // the policy gate fails on it separately. Quietly re-rendering it here would hide that.
      if (authority !== 'member' && authority !== 'above-member') continue;
      const meantToSucceed = authority === 'member';
      cell.exp = meantToSucceed;
      cell.pass = (measured.get(key) === 'allowed') === meantToSucceed;
    }
  }
}

const sortedTables = (report) =>
  [...(report.tables ?? [])].sort((a, b) => String(a.table).localeCompare(String(b.table)));
const sortedBypass = (report) =>
  [...(report.bypass_surfaces ?? [])].sort((a, b) =>
    String(a.object).localeCompare(String(b.object)),
  );

/**
 * Everything in this report that a human must answer for, as stable keys an allowance can name.
 * @typedef {{kind: 'anomaly'|'bypass', key: string, severity?: string, detail: string}} Concern
 * @param {any} report @returns {Concern[]}
 */
export function concernsOf(report) {
  /** @type {Concern[]} */
  const concerns = [];
  for (const t of sortedTables(report)) {
    for (const cmd of CMDS) {
      for (const [id] of IDENTITIES) {
        const cell = t.idgrid?.[cmd]?.[id];
        if (!isAnomaly(cell)) continue;
        concerns.push({
          kind: 'anomaly',
          key: `anomaly:${t.table}.${cmd}.${id}`,
          detail: cell.exp
            ? `\`${id}\` is blocked on ${cmd} on \`${t.table}\` and the policy intends to allow it`
            : `\`${id}\` reached \`${t.table}\` on ${cmd} and the policy intends to deny it`,
        });
      }
    }
  }
  for (const b of sortedBypass(report)) {
    const why = String(b.reason ?? b.detail ?? b.why ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    concerns.push({
      kind: 'bypass',
      key: `bypass:${b.object}`,
      severity: String(b.severity ?? '—'),
      detail: `\`${b.object}\` can sidestep RLS (${b.severity ?? '—'}): ${why}`,
    });
  }
  return concerns;
}

/**
 * Pure, and the reason the artifact can fail. Every concern must be absent or answered.
 * @param {any} report
 * @param {Array<{key: string, reason: string}>} allowances
 * @returns {{concerns: Concern[], adjudicated: Array<Concern & {reason: string}>, problems: string[]}}
 */
export function evaluate(report, allowances = []) {
  const concerns = concernsOf(report);
  const byKey = new Map(concerns.map((c) => [c.key, c]));
  const problems = [];
  const adjudicated = [];
  const answered = new Set();

  for (const a of allowances ?? []) {
    const key = String(a?.key ?? '');
    const reason = String(a?.reason ?? '').trim();
    const concern = byKey.get(key);
    if (!concern) {
      problems.push(
        `allowance \`${key}\` matches nothing in this report. A stale allowance is a check that has ` +
          `already been silenced for whatever reoccupies its key — remove it from ${ALLOWANCES}.`,
      );
      continue;
    }
    if (reason.length < MIN_REASON) {
      problems.push(
        `allowance \`${key}\` carries no reason of substance ("${reason}"). An accepted risk is a ` +
          `written decision someone can disagree with later, not a token that switches a check off.`,
      );
      continue;
    }
    answered.add(key);
    adjudicated.push({ ...concern, reason });
  }

  for (const c of concerns) {
    if (answered.has(c.key)) continue;
    problems.push(
      `${c.detail} — and nothing in the repository explains it. Fix it, or record it in ` +
        `${ALLOWANCES} with a reason.  [${c.key}]`,
    );
  }
  return { concerns, adjudicated, problems };
}

/**
 * @param {any} report
 * @param {{generatedBy?: string, allowances?: Array<{key: string, reason: string}>}} [opts]
 */
export function render(report, { generatedBy = 'npm run access-matrix', allowances = [] } = {}) {
  const { concerns, adjudicated } = evaluate(report, allowances);
  const answeredKeys = new Set(adjudicated.map((a) => a.key));
  const tables = sortedTables(report);
  const L = [];

  L.push('# Access matrix');
  L.push('');
  L.push('> **Generated — do not edit.** Regenerate with `' + generatedBy + '`.');
  L.push('> Derived from the live policy catalog by probing each table as each identity, so it');
  L.push('> describes what the database *does*, not what anyone believes it does.');
  L.push('');
  L.push("Legend: `✓` permitted · `·` denied · `⚠` **behavior differs from the policy's intent**");
  L.push('');
  for (const [, label, note] of IDENTITIES) L.push(`- **${label}** — ${note}`);
  L.push('');

  for (const t of tables) {
    L.push(`## \`${t.table}\``);
    L.push('');
    L.push(
      `Row-level security: **${t.rls_enabled ? 'enabled' : '⚠ DISABLED'}**` +
        (t.policied?.length
          ? ` · policies for ${[...t.policied].sort().join(', ')}`
          : ' · **no policies**'),
    );
    L.push('');
    L.push('| Identity | ' + CMDS.join(' | ') + ' |');
    L.push('|---|' + CMDS.map(() => '---').join('|') + '|');
    for (const [key, label] of IDENTITIES) {
      const cells = CMDS.map((c) => {
        const g = t.idgrid?.[c]?.[key];
        if (!g) return '–';
        if (isAnomaly(g)) return `⚠ ${g.exp ? 'blocked but should be allowed' : '**REACHABLE**'}`;
        return g.exp ? '✓' : '·';
      });
      L.push(`| ${label} | ${cells.join(' | ')} |`);
    }
    L.push('');
  }

  const bypass = report.bypass_surfaces ?? [];
  L.push('## Bypass surfaces');
  L.push('');
  L.push(
    'Objects and roles that can sidestep RLS **even when every policy above is correct.** Listed',
  );
  L.push('for review, not as failures — each is either sanctioned or a finding.');
  L.push('');
  if (!bypass.length) {
    L.push('_None._');
  } else {
    L.push('| Severity | Object | Why it is listed |');
    L.push('|---|---|---|');
    for (const b of sortedBypass(report)) {
      const why = String(b.reason ?? b.detail ?? b.why ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      L.push(`| ${b.severity ?? '—'} | \`${b.object ?? '—'}\` | ${why} |`);
    }
  }
  L.push('');
  if (adjudicated.length) {
    L.push('## Adjudicated');
    L.push('');
    L.push(
      'Concerns above that were **examined and accepted**, each with the reason and the date it',
    );
    L.push(
      'was decided. Anything not listed here is unexplained, and unexplained fails the build.',
    );
    L.push('');
    L.push('| Concern | Reason |');
    L.push('|---|---|');
    for (const a of adjudicated) L.push(`| \`${a.key}\` | ${a.reason} |`);
    L.push('');
  }
  L.push('---');
  L.push('');

  const anomalies = concerns.filter((c) => c.kind === 'anomaly');
  const openAnomalies = anomalies.filter((c) => !answeredKeys.has(c.key)).length;
  const openAll = concerns.filter((c) => !answeredKeys.has(c.key)).length;
  L.push(
    anomalies.length === 0
      ? '**No anomalies.** Every identity reached exactly what its policies intend, on every table and command.'
      : `**⚠ ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'}** — ` +
          `${anomalies.length - openAnomalies} adjudicated, ${openAnomalies} unexplained. ` +
          `Behavior differs from intent; each is a defect until explained.`,
  );
  if (openAll) {
    L.push('');
    L.push(
      `> **This matrix does not pass its own gate.** ${openAll} concern(s) are unanswered — see the ` +
        `failure from \`${generatedBy}\` for the list.`,
    );
  }
  L.push('');
  return L.join('\n');
}

/** @returns {Array<{key: string, reason: string}>} */
export function loadAllowances(read = readFileSync, path = ALLOWANCES) {
  try {
    const parsed = JSON.parse(read(path, 'utf8'));
    return Array.isArray(parsed?.allow) ? parsed.allow : [];
  } catch {
    return []; // no file is the honest default: nothing is accepted
  }
}

function main() {
  const check = process.argv.includes('--check');
  const dbUrl =
    process.env.KEELBLOCK_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';
  const tmp = join(process.cwd(), '.rls-report.json');

  try {
    // Not piped: a gate whose exit status is swallowed by a pipe is a check that cannot fail.
    execFileSync(
      './.venv/bin/rlsautotest',
      // `--report-json` only writes when `--report` is also passed; stdout is discarded.
      ['--db-url', dbUrl, '--supabase', '--report', '--report-json', tmp, '--no-fail'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (err) {
    console.error('access-matrix: could not probe the database.');
    console.error('  Is the local stack running? `supabase start`');
    console.error(
      String(err.stderr ?? err.message)
        .trim()
        .split('\n')
        .slice(-3)
        .join('\n'),
    );
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(tmp, 'utf8'));
  rmSync(tmp, { force: true });
  correctMemberRow(report, dbUrl);

  const allowances = loadAllowances();
  const { problems, adjudicated } = evaluate(report, allowances);
  const rendered = render(report, { allowances });

  // Generate mode still WRITES before failing: you cannot adjudicate a matrix you cannot read.
  let stale = false;
  if (!check) {
    writeFileSync(OUT, rendered);
    console.log(`access-matrix: wrote ${OUT}`);
  } else {
    const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    stale = committed !== rendered;
    if (!stale) console.log('access-matrix: up to date');
  }

  if (stale) {
    console.error(`access-matrix: ${OUT} is STALE.\n`);
    console.error(
      'The policies no longer match the committed matrix. Regenerate it and read the diff —',
    );
    console.error('a new ✓ in the "different organization" column is a tenant leak.\n');
    console.error('  npm run access-matrix');
  }

  // The content rule. Freshness alone only proves the document keeps up with the database; it says
  // nothing about whether what the database is doing is acceptable.
  if (problems.length) {
    console.error(`\naccess-matrix: ${problems.length} unanswered concern(s) in ${OUT}.\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      `\nEach must be fixed, or accepted deliberately with a reason in ${ALLOWANCES}:\n` +
        `  { "allow": [{ "key": "<the key above>", "reason": "why this is acceptable, and when it was decided" }] }`,
    );
  } else if (adjudicated.length) {
    console.log(
      `access-matrix: ${adjudicated.length} concern(s) accepted with a written reason, ${'0'} unexplained`,
    );
  }

  if (stale || problems.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
