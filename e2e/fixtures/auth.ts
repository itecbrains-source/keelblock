import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { seeder, type Seeded } from './database';

/**
 * Getting a session — SPEC-002 REQ-3b.
 *
 * **Two paths, and the split is forced by a real constraint rather than convenience.** Supabase caps
 * auth email at two per hour, project-wide, and says it "can only be changed with your own custom
 * SMTP setup" (DEF-019). Measured here: a suite that signs in by email exhausts that on its third
 * test and then fails with a timeout that looks like flakiness and is not.
 *
 * So `signInThroughTheForm` drives the real thing — form, email, link — and exactly one test uses
 * it, because sign-in is that test's subject. Every other test uses `signIn`, which mints a link
 * with the admin API and navigates to it: no email is sent, no quota is spent, and the PKCE callback
 * is still exercised because it is the same link the email would have contained.
 *
 * A test whose subject is organizations should not re-prove sign-in, and should not fail because
 * something unrelated used up a quota.
 */

const MAILPIT = process.env.KEELBLOCK_MAILPIT_URL ?? 'http://127.0.0.1:54724';

/** How many sign-in emails the catcher has seen recently — the observable form of the quota. */
export async function recentSignInEmails(): Promise<number> {
  const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return (list.messages ?? []).filter(
    (m: { Created: string; Subject?: string }) =>
      Date.parse(m.Created) > hourAgo && /sign-in link/i.test(m.Subject ?? ''),
  ).length;
}

async function linkFromMailbox(email: string): Promise<string> {
  // Polled, not slept. A fixed wait is either flaky or slow, and usually both on a loaded machine.
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then((r) => r.json());
    const message = (list.messages ?? []).find((m: { To?: { Address: string }[] }) =>
      m.To?.some((t) => t.Address === email),
    );
    if (message) {
      const body = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then((r) => r.json());
      const link = (body.Text || body.HTML || '')
        .match(/https?:\/\/[^\s"'<>]+/g)
        ?.find((u: string) => u.includes('/auth/'));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No sign-in link arrived for ${email} within 15s. If other tests signed in by email, this is ` +
      'the two-per-hour auth email cap (DEF-019), not a flake — only one test may use this path.',
  );
}

/** The real journey: fill the form, receive the email, follow the link. */
export async function signInThroughTheForm(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await page.getByText(/a sign-in link is on its way/i).waitFor();
  await page.goto(await linkFromMailbox(email));
}

/**
 * A session, without spending an email — and without a code exchange.
 *
 * The obvious shortcut does not work, and the reason is worth keeping: an admin-generated link goes
 * through `/auth/v1/verify`, which redirects to our callback with a `code`. **PKCE requires the code
 * verifier from the browser that STARTED sign-in**, and a link minted by the admin API has none, so
 * the exchange fails and the page redirects to sign-in. Measured, after it looked like a session
 * that silently did not stick.
 *
 * So the session is established server-side with `verifyOtp`, and the cookies are produced by
 * `@supabase/ssr` itself — the same library that reads them in the application. Hand-writing the
 * cookie would couple this fixture to an internal encoding that is free to change; letting the
 * library write them means the format can only drift in one place.
 */
export async function signIn(context: BrowserContext, email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;

  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) jar.push({ name: c.name, value: c.value });
      },
    },
  });
  const { error } = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'email',
  });
  if (error) throw error;
  if (jar.length === 0) throw new Error('verifyOtp produced no session cookies');

  const base = new URL(process.env.KEELBLOCK_E2E_URL ?? 'http://127.0.0.1:3000');
  await context.addCookies(
    jar.map((c) => ({ name: c.name, value: c.value, domain: base.hostname, path: '/' })),
  );
}

export const test = base.extend<{ seed: Seeded }>({
  seed: async ({}, use) => {
    const s = seeder();
    await use(s);
    // Runs whether the test passed, failed or threw. A suite that only cleans up on success leaves
    // its worst runs behind.
    await s.cleanup();
  },
});

export { expect } from '@playwright/test';
