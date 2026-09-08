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

  /** Whatever the page is currently saying went wrong. Empty when nothing did. */
  refusal() {
    return this.page.getByRole('alert');
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

  /** REQ-4 · the single answer every unusable token gets. */
  refusal() {
    return this.page.getByRole('alert');
  }
}
