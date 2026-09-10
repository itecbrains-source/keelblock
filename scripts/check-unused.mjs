#!/usr/bin/env node
/**
 * The `unused` gate — knip, plus the half of knip that nobody was reading.
 *
 * knip exits 0 when the only thing left is a *Configuration hint*. One kind of hint is
 * `Remove from ignoreDependencies`: knip saying **this exemption is no longer needed**. That is the
 * answer to "is this exemption still justified?", computed on every run, printed on every run, and
 * acted on by nothing — because the gate was green and green output does not get read.
 *
 * Five exemptions were found past the expiry written in their own `knip.reasons.md` row on
 * 2026-09-10: SPEC-004 had shipped and wired the Supabase clients, `.dom.test.tsx` files existed,
 * and knip had been saying so for weeks. The shrink-only ratchet did not catch it because a ceiling
 * on the COUNT is not a check on whether any individual exemption still earns its place.
 *
 * So: a `Remove from …` hint is now a failure. The structural hints are not — `.css` reporting that
 * compiled extensions are excluded is a fact about knip, not a stale exemption, and failing on it
 * would be a gate nobody can satisfy.
 */
import { spawnSync } from 'node:child_process';

/**
 * The exemptions knip says are no longer needed. Pure, so the rule carries a mutation proof.
 * @param {string} output knip's stdout
 * @returns {string[]}
 */
export function expiredExemptions(output) {
  return output
    .split('\n')
    .filter((line) => /\bRemove from\b/.test(line))
    .map((line) => line.trim().replace(/\s{2,}/g, ' '));
}

function main() {
  const run = spawnSync('npx', ['knip'], { encoding: 'utf8' });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

  // knip's own exit code still decides the dead-code question; this only adds the hints.
  if (run.status !== 0) {
    process.stdout.write(output);
    console.error('\nunused: FAILED — knip reports dead code or unused dependencies');
    process.exit(1);
  }

  const expired = expiredExemptions(output);
  if (expired.length) {
    console.error('unused: FAILED\n');
    for (const e of expired) console.error(`  ${e}`);
    console.error(
      `\n  knip says ${expired.length} exemption(s) are no longer needed. Each is a claim in ` +
        `knip.reasons.md that something is not dead YET — knip has now measured that the claim ` +
        `has expired. Remove the entry from knip.json and its row from knip.reasons.md, and ` +
        `tighten the ratchet in scripts/check.test.mts to the new count.`,
    );
    process.exit(1);
  }

  console.log('unused: ok — no dead code, and every knip exemption is still one knip asks for');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
