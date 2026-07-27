import { describe, expect, it } from 'vitest';
import { normalizeProdivixAiSettings } from './aiSettings';

describe('normalizeProdivixAiSettings', () => {
  it('drops a credential a client may have stored alongside provider preferences', () => {
    const stored = {
      enabled: true,
      provider: 'openai-compatible',
      baseURL: 'https://api.example.test/v1',
      apiKey: 'sk-live-canary',
      model: 'gpt-test',
    };

    const normalized = normalizeProdivixAiSettings(stored);

    expect(JSON.stringify(normalized)).not.toContain('sk-live-canary');
    expect(Object.keys(normalized)).not.toContain('apiKey');
    expect(normalized).toEqual({
      enabled: true,
      provider: 'openai-compatible',
      baseURL: 'https://api.example.test/v1',
      model: 'gpt-test',
    });
  });

  it('keeps declared preference fields and rejects unusable provider records', () => {
    expect(
      normalizeProdivixAiSettings({
        enabled: false,
        provider: 'openai-compatible',
        baseURL: 'https://api.example.test/v1',
        model: 'gpt-test',
        modelPreferences: { jsonMode: true, unknown: 'x' },
        budget: { temperature: 0.4, maxOutputTokens: 512 },
      })
    ).toEqual({
      enabled: false,
      provider: 'openai-compatible',
      baseURL: 'https://api.example.test/v1',
      model: 'gpt-test',
      modelPreferences: { jsonMode: true },
      budget: { temperature: 0.4, maxOutputTokens: 512 },
    });
    expect(
      normalizeProdivixAiSettings({ provider: 'openai-compatible' })
    ).toEqual({ enabled: true, provider: 'mock' });
    expect(normalizeProdivixAiSettings(undefined)).toEqual({
      enabled: true,
      provider: 'mock',
    });
  });
});
