import { defineConfig, devices } from '@playwright/test';

/**
 * The journey layer — SPEC-002 REQ-3, DEF-002.
 *
 * The layer that exists because the other three cannot see what it sees. F-38 is the case that
 * earned it: a unit test asserted the protected page calls `getCurrentUser` and redirects, passed
 * correctly, and could not observe that the HTTP status was 200 and the page chrome was served.
 *
 * **One browser, deliberately.** keelblock ships one framework for the reason ADR-012 gives, and the
 * same argument applies here: a matrix of browsers is a maintenance surface, and every failure this
 * layer is meant to catch — a redirect that does not happen, a row that should not be readable, a
 * control that lost its accessible name — is engine-independent.
 */
export default defineConfig({
  testDir: './e2e',
  // A failing journey test is usually a real defect, not a flake. Retrying by default would hide
  // the intermittent ones, which are the expensive kind.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    // Port 3000 because that is `site_url` in supabase/config.toml. Supabase redirects a verified
    // magic link to the configured site, so a suite on any other port receives a link pointing at a
    // server that is not there — measured, as ERR_CONNECTION_REFUSED. Running where the project says
    // it lives is more honest than adding a port to the allowlist so the test can be different.
    baseURL: process.env.KEELBLOCK_E2E_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The BUILT application, not the dev server. F-38 is a property of the production render — the
    // prerendered shell does not exist in dev, so a dev-server suite would not have seen it.
    command: 'npm run build && npx next start -p 3000',
    url: 'http://127.0.0.1:3000/en',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
