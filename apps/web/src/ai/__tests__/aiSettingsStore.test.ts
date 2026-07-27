import { beforeEach, describe, expect, it } from 'vitest';

const storageKey = 'prodivix-ai-settings';
const canary = 'sk-live-canary';
const storedValues = new Map<string, string>();
const storageStub: Storage = {
  clear: () => storedValues.clear(),
  getItem: (key) => storedValues.get(key) ?? null,
  key: (index) => [...storedValues.keys()][index] ?? null,
  get length() {
    return storedValues.size;
  },
  removeItem: (key) => storedValues.delete(key),
  setItem: (key, value) => storedValues.set(key, value),
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storageStub,
});

const { useAiCredentialStore } = await import('../aiCredentialStore');
const { useAiSettingsStore } = await import('../aiSettingsStore');

const readStoredSettings = () => storedValues.get(storageKey) ?? '';

describe('AI provider settings persistence', () => {
  beforeEach(() => {
    storedValues.clear();
    useAiCredentialStore.getState().clearApiKey();
    useAiSettingsStore.getState().resetSettings();
  });

  it('never writes the provider credential to browser storage', () => {
    useAiCredentialStore.getState().setApiKey(canary);
    useAiSettingsStore.getState().setSettings({
      enabled: true,
      provider: 'openai-compatible',
      baseURL: 'https://api.example.test/v1',
      model: 'gpt-test',
    });

    expect(readStoredSettings()).toContain('https://api.example.test/v1');
    expect(readStoredSettings()).not.toContain(canary);
    expect(useAiCredentialStore.getState().apiKey).toBe(canary);
  });

  it('drops a credential an earlier client already persisted', async () => {
    storedValues.set(
      storageKey,
      JSON.stringify({
        state: {
          settings: {
            enabled: true,
            provider: 'openai-compatible',
            baseURL: 'https://api.example.test/v1',
            apiKey: canary,
            model: 'gpt-test',
          },
        },
        version: 0,
      })
    );

    await useAiSettingsStore.persist.rehydrate();

    expect(
      JSON.stringify(useAiSettingsStore.getState().settings)
    ).not.toContain(canary);
    expect(readStoredSettings()).not.toContain(canary);
  });
});
