import { describe, expect, it, vi } from 'vitest';
import { discoverOpenAICompatibleModels } from './discoverOpenAICompatibleModels';
import { OpenAICompatibleProvider } from './openAICompatibleProvider';
import { readOpenAICompatibleCredentialTransportIssue } from './credentialTransport';

const fetcher = vi.fn();

describe('OpenAI-compatible credential transport', () => {
  it.each([
    ['https://api.example.test/v1', undefined],
    ['http://localhost:11434/v1', undefined],
    ['http://127.0.0.1:8000/v1', undefined],
    ['http://[::1]:8000/v1', undefined],
    ['http://10.0.0.5:8000/v1', 'insecure-base-url'],
    ['http://api.example.test/v1', 'insecure-base-url'],
    ['api.example.test/v1', 'invalid-base-url'],
  ])('classifies %s with a credential as %s', (baseURL, expected) => {
    expect(
      readOpenAICompatibleCredentialTransportIssue(baseURL, 'sk-canary')
    ).toBe(expected);
  });

  it('leaves a credential-free base URL unconstrained', () => {
    expect(
      readOpenAICompatibleCredentialTransportIssue(
        'http://10.0.0.5:8000/v1',
        undefined
      )
    ).toBeUndefined();
  });

  it('refuses to construct a provider that would send a credential in the clear', () => {
    expect(
      () =>
        new OpenAICompatibleProvider({
          baseURL: 'http://10.0.0.5:8000/v1',
          apiKey: 'sk-canary',
          model: 'gpt-test',
          fetcher,
        })
    ).toThrow(/https base URL/u);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses model discovery that would send a credential in the clear', async () => {
    await expect(
      discoverOpenAICompatibleModels({
        baseURL: 'http://10.0.0.5:8000/v1',
        apiKey: 'sk-canary',
        fetcher,
      })
    ).rejects.toThrow(/https base URL/u);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
