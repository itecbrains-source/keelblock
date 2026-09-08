import type { Page } from '@playwright/test';

/**
 * Page objects — SPEC-002 REQ-3b, settled before any test existed.
 *
 * Accessible locators only: `getByRole`, `getByLabel`, `getByText`. Never a CSS selector, never a
 * test id. Adopted from boxyhq/saas-starter-kit, whose suite does this throughout.
 */

export class OrgsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/orgs');
  }

  heading() {
    return this.page.getByRole('heading', { name: 'Organizations' });
  }

  /** The switcher, by its label rather than its markup. */
  switcher() {
    return this.page.getByLabel('Viewing');
  }

  membersHeading(orgName: string) {
    return this.page.getByRole('heading', { name: `Members of ${orgName}` });
  }

  /**
   * Whatever the page is currently saying went wrong. Empty when nothing did.
   *
   * Scoped to `main`, and that is not tidiness. Next injects
   * `<div role="alert" aria-live="assertive" id="__next-route-announcer__">` into the body for
   * screen-reader route announcements, so a bare `getByRole('alert')` matches two elements and
   * Playwright's strict mode fails the assertion. It mounts after hydration, so whether it exists
   * when the assertion runs is a RACE -- this passed locally every time and failed on the first CI
   * run, which is the only reason we know. The application's own alerts are inside `main`; the
   * announcer never is.
   *
   * And filtered to alerts that are SAYING something, which is what the sentence above claims this
   * returns. The forms keep a permanently-mounted empty live region -- a region created at the same
   * moment as its message is often not announced -- so `main` legitimately contains empty alerts,
   * and a locator that counted them would be ambiguous the moment a real one appeared.
   */
  refusal() {
    return this.page.getByRole('main').getByRole('alert').filter({ hasText: /\S/ });
  }

  /** The one-shot link the invite form prints. Located by its text, which is what a person reads. */
  invitationLink() {
    return this.page.getByText(/\/invite\/[0-9a-f]{64}/);
  }

  async invite(email: string, role: 'owner' | 'admin' | 'member') {
    await this.page.getByLabel('Invite by email').fill(email);
    await this.page.getByLabel('As').selectOption(role);
    await this.page.getByRole('button', { name: 'Invite' }).click();
  }

  async createOrganization(name: string, slug: string) {
    await this.page.getByLabel('Name').fill(name);
    await this.page.getByLabel('URL slug').fill(slug);
    await this.page.getByRole('button', { name: 'Create' }).click();
  }
}

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  emailField() {
    return this.page.getByLabel('Email address');
  }

  submit() {
    return this.page.getByRole('button', { name: 'Email me a link' });
  }
}

export class InvitePage {
  constructor(private readonly page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/invite/${token}`);
  }

  /** The offer, by what it says rather than where it sits. */
  offer(orgName: string, role: string) {
    return this.page.getByText(`${orgName} has invited you to join as ${role}.`);
  }

  accept() {
    return this.page.getByRole('button', { name: 'Accept invitation' });
  }

  /** REQ-4 · the single answer every unusable token gets. Scoped and filtered for the reasons given
   *  on `OrgsPage.refusal` -- Next's route announcer is also `role="alert"` and it races, and the
   *  forms keep an empty live region on purpose. */
  refusal() {
    return this.page.getByRole('main').getByRole('alert').filter({ hasText: /\S/ });
  }
}
