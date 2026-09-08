import { describe, expect, it } from 'vitest';
import { enabledOAuthProviders } from './providers';

describe('enabledOAuthProviders', () => {
  it('is empty by default — no button for a provider that is not configured', () => {
    expect(enabledOAuthProviders(undefined)).toEqual([]);
    expect(enabledOAuthProviders('')).toEqual([]);
  });

  it('reads a configured list, trimming and lowercasing', () => {
    expect(enabledOAuthProviders(' GitHub , google ')).toEqual(['github', 'google']);
  });

  it('drops an unrecognised name rather than passing it through', () => {
    // A typo should produce no button, not an opaque provider error at the far end.
    expect(enabledOAuthProviders('githbu,google')).toEqual(['google']);
  });
});
