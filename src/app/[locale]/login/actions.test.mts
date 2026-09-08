import { describe, expect, it, vi } from 'vitest';

const signOutSpy = vi.fn(async () => ({ error: null }));
const redirectSpy = vi.fn(() => {
  throw new Error('NEXT_REDIRECT');
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signOut: signOutSpy } }),
}));
vi.mock('@/lib/auth/dal', () => ({ getCurrentUser: async () => ({ sub: 'user-1' }) }));
vi.mock('next/navigation', () => ({ redirect: redirectSpy }));

const { signOut } = await import('./actions');

/**
 * SPEC-004 REQ-8. The property is that ending a session is a server decision — no client state is
 * involved, and nothing about the outcome depends on the UI having re-rendered.
 */
describe('signOut', () => {
  it('ends the session server-side, scoped to this session, and redirects', async () => {
    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT');
    expect(signOutSpy).toHaveBeenCalledOnce();
    expect(redirectSpy).toHaveBeenCalledWith('/');

    // Scope is `local` deliberately. "Sign out everywhere" is what a person means after losing a
    // laptop, and it is a different promise — bundling it silently here would make one control do
    // two jobs, one of them invisibly.
    expect(signOutSpy).toHaveBeenCalledWith({ scope: 'local' });
  });
});
