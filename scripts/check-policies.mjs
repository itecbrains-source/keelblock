#!/usr/bin/env node
/**
 * The policy layer of `npm run check`: regenerate the exhaustive suite from the live catalog, then
 * run it alongside the hand-written intent suite.
 *
 * The generated suite is **machinery, not evidence** — it is regenerated every run and gitignored,
 * because a committed copy goes stale against the schema and a stale generated test is a false
 * failure that teaches people to ignore the runner. The committed evidence is
 * `docs/ACCESS-MATRIX.md`, which is human-readable and whose diff is the reviewable event.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DB = process.env.KEEL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54722/postgres';

if (!existsSync('./.venv/bin/rlsautotest')) {
  console.error('rlsautotest is not installed. Run:  python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt');
  process.exit(2);
}

// `organization:DELETE` is reported UNRELIABLE by design: the policy compares
// org_role_of(id) = 'owner' rather than delegating to a boolean, so mocking cannot isolate it. The
// tool says so instead of guessing, and the intent suite covers it directly
// (002-organization-creation.test.sql). This allowance is a pointer to that test, not a silencer.
const gen = spawnSync('./.venv/bin/rlsautotest',
  ['--db-url', DB, '--supabase', '--emit', '.', '--allow-unreliable', 'organization:DELETE', '--no-fail'],
  { stdio: ['ignore', 'ignore', 'inherit'] });
if (gen.status !== 0) { console.error('policy: could not regenerate the suite'); process.exit(2); }

const run = spawnSync('npx', ['--no-install', 'supabase', 'test', 'db'], { stdio: 'inherit' });
process.exit(run.status ?? 1);
