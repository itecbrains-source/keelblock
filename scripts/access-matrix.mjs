#!/usr/bin/env node
/**
 * Generates docs/ACCESS-MATRIX.md — the artifact that makes keelblock's central claim checkable by a
 * stranger in thirty seconds, without trusting anyone (SPEC-002 REQ-4, bar B-2).
 *
 * `--check` re-renders and fails if the committed copy is stale, so a policy change that alters who
 * can reach what cannot merge without the matrix diff appearing in review. That diff is the point:
 * a reviewer who sees a new ✓ in the "different organization" column has caught a tenant leak in a
 * document, before it reaches a user.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'docs/ACCESS-MATRIX.md';
const CMDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

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

export function render(report, { generatedBy = 'npm run access-matrix' } = {}) {
  const tables = [...report.tables].sort((a, b) => a.table.localeCompare(b.table));
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

  let anomalies = 0;
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
        if (g.pass === false) {
          anomalies++;
          return `⚠ ${g.exp ? 'blocked but should be allowed' : '**REACHABLE**'}`;
        }
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
    for (const b of [...bypass].sort((a, b2) =>
      String(a.object).localeCompare(String(b2.object)),
    )) {
      const why = String(b.reason ?? b.detail ?? b.why ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      L.push(`| ${b.severity ?? '—'} | \`${b.object ?? '—'}\` | ${why} |`);
    }
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push(
    anomalies === 0
      ? '**No anomalies.** Every identity reached exactly what its policies intend, on every table and command.'
      : `**⚠ ${anomalies} anomal${anomalies === 1 ? 'y' : 'ies'}** — behavior differs from intent. Each is a defect until explained.`,
  );
  L.push('');
  return L.join('\n');
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

  const rendered = render(JSON.parse(readFileSync(tmp, 'utf8')));
  rmSync(tmp, { force: true });

  if (!check) {
    writeFileSync(OUT, rendered);
    console.log(`access-matrix: wrote ${OUT}`);
    return;
  }
  const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (committed === rendered) {
    console.log('access-matrix: up to date');
    return;
  }
  console.error(`access-matrix: ${OUT} is STALE.\n`);
  console.error(
    'The policies no longer match the committed matrix. Regenerate it and read the diff —',
  );
  console.error('a new ✓ in the "different organization" column is a tenant leak.\n');
  console.error('  npm run access-matrix');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
