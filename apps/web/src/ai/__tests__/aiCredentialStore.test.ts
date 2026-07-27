import { beforeEach, describe, expect, it, vi } from 'vitest';

// `useAuthStore` resolves its persist storage once, at module evaluation, so
// the stub must exist before the store modules load — hence the dynamic
// imports below rather than static ones.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
});

const { useAuthStore } = await import('@/auth/useAuthStore');
const { useAiCredentialStore } = await import('@/ai/aiCredentialStore');

describe('useAiCredentialStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'session-token',
      user: { id: 'user-1' } as never,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    useAiCredentialStore.getState().setApiKey('sk-live-credential');
  });

  it('drops the provider key when the session ends', () => {
    // A shared machine is the scenario: sign out must not leave the previous
    // user's provider key live for whoever uses the tab next.
    useAuthStore.setState({ token: null, user: null, expiresAt: null });
    expect(useAiCredentialStore.getState().apiKey).toBe('');
  });

  it('keeps the key across unrelated auth updates within one session', () => {
    useAuthStore.setState({
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    expect(useAiCredentialStore.getState().apiKey).toBe('sk-live-credential');
  });
});
