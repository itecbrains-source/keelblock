/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * SPEC-004 REQ-7, the provider half.
 *
 * This file exists because of DEF-018. The provider button was built, typed and reviewed, and then
 * never rendered by anyone: `NEXT_PUBLIC_OAUTH_PROVIDERS` is empty by default — deliberately, since
 * a button that cannot work is worse than no button — so `providers.map()` produced nothing, in
 * development and in every test. The first person to set that variable found two defects on a spec
 * marked `done`.
 *
 * The right default is not the problem and should not change. The problem was that the surface had
 * nowhere to render except a correctly-configured deployment. Here it renders with a provider, in
 * eleven lines, for free.
 */

const startOAuth = vi.fn();
vi.mock('./actions', () => ({
  requestMagicLink: vi.fn(async () => ({ status: 'idle' as const })),
  startOAuth: (...args: unknown[]) => startOAuth(...args),
}));

import { SignInForm } from './sign-in-form';

const labels = {
  email: 'Email',
  submit: 'Email me a link',
  sending: 'Sending…',
  sent: 'Check your email',
  tooSoon: 'Wait a moment',
  providerFailed: 'That provider could not be reached.',
};

/** What `login/page.tsx` passes: the label formatted by ICU on the server, not a template. */
const github = { id: 'github' as const, label: 'Continue with github' };

describe('SignInForm', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it('renders no provider button when none is configured', () => {
    render(<SignInForm providers={[]} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Email me a link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with/i })).not.toBeInTheDocument();
  });

  it('renders the provider label it was given', () => {
    render(<SignInForm providers={[github]} labels={labels} />);
    expect(screen.getByRole('button', { name: 'Continue with github' })).toBeInTheDocument();
  });

  it('MUTATION: F-64 — no button may render a translation key path', () => {
    // What shipped: `t('continueWith')` returned `login.continueWith`, because next-intl will not
    // format a message with an unfilled placeholder, and the `.replace('{provider}', …)` that was
    // meant to fill it ran against a string with no placeholder left in it. Asserted on the accessible
    // name of every button, so this catches the next one too, whatever key it comes from.
    render(<SignInForm providers={[github]} labels={labels} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
      expect(button.textContent).not.toMatch(/^[a-z][\w]*(\.[\w]+)+$/);
      expect(button.textContent).not.toMatch(/[{}]/);
    }
  });

  it('the provider button starts OAuth for its own provider', async () => {
    // F-65 was reported as this button not responding. The wiring is asserted here; whether the
    // browser gets as far as running it is a hydration question this environment cannot answer.
    startOAuth.mockResolvedValue({ status: 'error' });
    render(<SignInForm providers={[github]} labels={labels} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with github' }));

    expect(startOAuth).toHaveBeenCalledWith('github');
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.providerFailed);
  });
});
