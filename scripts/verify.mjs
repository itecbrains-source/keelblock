#!/usr/bin/env node
/**
 * `npm run verify` — run CI locally, before there is a remote.
 *
 * The workflow is PARSED and its steps executed, rather than a second list of commands maintained
 * beside it. A hand-written local mimic drifts from the workflow the first time either changes, and
 * then proves the wrong thing confidently.
 *
 * It is deliberately honest about fidelity. Every step lands in one of four states, and the summary
 * says which — because "CI passed locally" is worth nothing if a third of it was quietly skipped:
 *
 *   ran        executed exactly as CI will run it
 *   local      a `uses:` action with a real local equivalent (gitleaks actually scans)
 *   asserted   a `uses:` action whose *effect* is checked (setup-node → the Node major matches)
 *   skipped    heavy or unavailable — named, with the reason, never silently
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

const FULL = process.argv.includes('--full');
/**
 * Probe by running the binary, not by asking a shell. `spawnSync(..., { shell: true })` concatenates
 * arguments into a command string unescaped — Node warns about it, and it is a real injection seam
 * even when today's inputs are constants.
 */
const has = (bin) => spawnSync(bin, ['--version'], { stdio: 'ignore' }).error?.code !== 'ENOENT';

/** Steps that are slow or destructive locally. Run them with --full. */
const HEAVY = [{ match: /^npm ci/, why: 'removes and reinstalls node_modules (~500MB)' }];

/**
 * `uses:` actions mapped to what can honestly be done on a laptop.
 * @type {Record<string, (step: any) => { state: string, detail: string, cmd?: string[] }>}
 */
export const ACTION_HANDLERS = {
  'actions/checkout': () => ({ state: 'asserted', detail: 'working tree is the checkout' }),
  'actions/setup-node': (step) => {
    const want = String(step.with?.['node-version'] ?? '');
    const have = process.versions.node.split('.')[0];
    return want === have
      ? { state: 'asserted', detail: `local Node ${have} matches the pinned ${want}` }
      : {
          state: 'failed',
          detail: `CI pins Node ${want}; this machine runs ${have}. Results will not match.`,
        };
  },
  'actions/setup-python': () =>
    has('python3')
      ? { state: 'asserted', detail: 'python3 present' }
      : { state: 'failed', detail: 'python3 missing — the policy prober cannot install' },
  'supabase/setup-cli': () =>
    has('supabase')
      ? { state: 'asserted', detail: 'supabase CLI present' }
      : { state: 'failed', detail: 'supabase CLI missing' },
  // CodeQL needs the GitHub-hosted analysis runner; there is no laptop equivalent, so it reports
  // NOT verified rather than being quietly skipped. That distinction is the whole point of this
  // tool — a fidelity number that counts unrunnable steps as passing is a lie.
  'github/codeql-action/init': () => ({
    state: 'skipped',
    detail: 'runs only on GitHub — NOT verified locally',
  }),
  'github/codeql-action/analyze': () => ({
    state: 'skipped',
    detail: 'runs only on GitHub — NOT verified locally',
  }),
  'gitleaks/gitleaks-action': () =>
    has('gitleaks')
      ? // The real thing, over full history, exactly as CI does it.
        {
          state: 'local',
          detail: 'scanning full history',
          cmd: ['gitleaks', 'detect', '--no-banner', '--redact'],
        }
      : { state: 'skipped', detail: 'gitleaks not installed — `brew install gitleaks`' },
  'actions/upload-artifact': (step) => {
    const path = String(step.with?.path ?? '').trim();
    return existsSync(path)
      ? { state: 'asserted', detail: `${path} exists and would be uploaded` }
      : { state: 'failed', detail: `${path} does not exist — CI would upload nothing` };
  },
};

/** Pure: decide what to do with one step. Exported so it can carry mutation proofs. */
export function planStep(step, { full = false, handlers = ACTION_HANDLERS } = {}) {
  if (typeof step.run === 'string') {
    const heavy = HEAVY.find((h) => h.match.test(step.run.trim()));
    if (heavy && !full)
      return {
        kind: 'run',
        state: 'skipped',
        label: step.run,
        detail: `${heavy.why} — use --full`,
      };
    return { kind: 'run', state: 'ran', label: step.run, cmd: ['bash', '-lc', step.run] };
  }
  const uses = String(step.uses ?? '');
  const key = uses.split('@')[0];
  const handler = handlers[key];
  if (!handler) {
    // Never silently ignored: an unknown action is reported so the fidelity claim stays true.
    return {
      kind: 'uses',
      state: 'skipped',
      label: uses,
      detail: 'no local equivalent — NOT verified',
    };
  }
  return { kind: 'uses', label: uses, ...handler(step) };
}

/** Pure: a run is honest only if nothing failed; skips are reported, never fatal. */
export function summarize(results) {
  const by = (s) => results.filter((r) => r.state === s);
  const failed = by('failed');
  return {
    ok: failed.length === 0,
    counts: {
      ran: by('ran').length,
      local: by('local').length,
      asserted: by('asserted').length,
      skipped: by('skipped').length,
    },
    failed: failed.map((f) => f.label),
    // The fidelity claim: what fraction of CI was genuinely executed rather than inferred.
    fidelity: results.length ? (by('ran').length + by('local').length) / results.length : 0,
  };
}

function main() {
  const wf = parse(readFileSync('.github/workflows/check.yml', 'utf8'));
  const results = [];

  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    console.log(`\n════ job: ${jobName} ════`);
    for (const step of job.steps ?? []) {
      const plan = planStep(step, { full: FULL });
      const label = plan.label.split('\n')[0].slice(0, 70);

      if (plan.cmd) {
        console.log(`\n── ${label}`);
        const r = spawnSync(plan.cmd[0], plan.cmd.slice(1), { stdio: 'inherit' });
        results.push({ ...plan, state: r.status === 0 ? plan.state : 'failed' });
      } else {
        const mark = { asserted: '·', skipped: '⊘', failed: '✗' }[plan.state] ?? '·';
        console.log(`  ${mark} ${label} — ${plan.detail}`);
        results.push(plan);
      }
    }
  }

  const { ok, counts, failed, fidelity } = summarize(results);
  console.log('\n════ verify summary ════');
  console.log(`  ran      ${counts.ran}   executed exactly as CI will`);
  console.log(`  local    ${counts.local}   real local equivalent`);
  console.log(`  asserted ${counts.asserted}   effect checked, action not run`);
  console.log(`  skipped  ${counts.skipped}   NOT verified`);
  console.log(`\n  fidelity: ${Math.round(fidelity * 100)}% of steps genuinely executed`);
  if (counts.skipped) {
    console.log('\n  not verified here:');
    for (const r of results.filter((x) => x.state === 'skipped'))
      console.log(`    ⊘ ${r.label.split('\n')[0]} — ${r.detail}`);
  }
  console.log(
    ok
      ? '\n  no failures\n'
      : `\n  ${failed.length} failed: ${failed.map((f) => f.split('\n')[0]).join(', ')}\n`,
  );
  if (!FULL) console.log('  `npm run verify -- --full` also runs the heavy steps.\n');
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
