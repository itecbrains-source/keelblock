import { test, expect } from './fixtures/auth';
import { signIn } from './fixtures/auth';
import { ProjectsPage } from './pages';
import { mkdirSync } from 'node:fs';

/**
 * The README's screenshots, captured from the running product — not mocked, not drawn.
 *
 * **Skipped unless `KEELBLOCK_CAPTURE=1`.** It writes files into the repository, and a suite that
 * edits the repository as a side effect of running is the exact defect F-86 records: the unit suite
 * regenerated a committed artifact, which made one gate unable to fail and produced a `unit` failure
 * that repaired itself. This is the same hazard wearing a friendlier hat, so the write is opt-in and
 * never happens during `npm run journey` or in CI.
 *
 * Regenerate with:
 *
 *   eval "$(npx supabase status -o env | sed 's/^/export /')"
 *   KEELBLOCK_CAPTURE=1 NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
 *     SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" npm run journey -- e2e/capture.spec.ts
 *
 * It asserts what it photographs. A screenshot proves nothing by itself — anyone can crop one — so
 * every shot here is taken immediately after the assertion that the state in it is real.
 */
const CAPTURE = process.env.KEELBLOCK_CAPTURE === '1';
const OUT = 'docs/media';
/** Cropped to the content column: a README image full of empty page reads as a mistake. */
const SHOT = { x: 160, y: 40, width: 700, height: 440 };

test.describe('README screenshots', () => {
  test.skip(!CAPTURE, 'set KEELBLOCK_CAPTURE=1 to rewrite docs/media — it edits the repository');

  test('the paid surface, refused and then granted', async ({ page, seed }) => {
    mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 1000, height: 760 });

    const user = await seed.createUser('shot');
    const org = await seed.createOrg(user, 'Harbourline');

    await signIn(page.context(), user.email);
    const projects = new ProjectsPage(page);
    await projects.goto();
    await expect(projects.heading()).toBeVisible();

    // REFUSED. The form is offered to everyone — the database is what declines it.
    await projects.create('Q4 migration');
    await expect(projects.outcome()).toContainText('paid plan');
    await expect(projects.project('Q4 migration')).toHaveCount(0);
    await page.screenshot({ path: `${OUT}/entitlement-refused.png`, clip: SHOT });

    // GRANTED. Same session, same cookies — only the row changed.
    await seed.entitle(org, 'active');
    await projects.create('Q4 migration');
    await expect(projects.project('Q4 migration')).toBeVisible();
    await page.screenshot({ path: `${OUT}/entitlement-granted.png`, clip: SHOT });
  });
});
