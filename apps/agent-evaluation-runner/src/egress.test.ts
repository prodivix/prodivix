import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import {
  authorizeAgentEvaluationCapabilityProbeEgress,
  authorizeAgentEvaluationHostedRetrievalProviderResourceEgress,
  authorizeAgentEvaluationEgress,
  isPublicAgentEvaluationAddress,
} from './egress';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const authorize = (
  protocolFamily:
    'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
  endpoint = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily].endpoint,
  addresses: readonly string[] = ['8.8.8.8']
) =>
  authorizeAgentEvaluationEgress({
    protocolFamily,
    endpoint,
    requestBytes: 128,
    maximumResponseBytes: 4_096,
    timeoutMs: 1_000,
    resolveHost: async () => addresses,
  });

describe('agent evaluation egress admission', () => {
  it('admits only each exact first-party endpoint with public DNS results', async () => {
    for (const protocolFamily of [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
    ] as const) {
      await expect(authorize(protocolFamily)).resolves.toEqual({
        hostname: new URL(
          AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily].endpoint
        ).hostname,
        approvedAddresses: ['8.8.8.8'],
      });
    }
  });

  it.each([
    'https://generativelanguage.googleapis.com/v1/interactions',
    'https://generativelanguage.googleapis.com/v1/interactions?alt=json',
    'https://generativelanguage.googleapis.com/v1/interactions?alt=sse&key=secret',
    'https://generativelanguage.googleapis.com/v1/interactions?key=secret&alt=sse',
    'https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse',
    'https://attacker.example/v1/interactions?alt=sse',
    'http://generativelanguage.googleapis.com/v1/interactions?alt=sse',
  ])('denies Gemini endpoint or query drift: %s', async (endpoint) => {
    const resolveHost = vi.fn(async () => ['8.8.8.8']);
    await expect(
      authorizeAgentEvaluationEgress({
        protocolFamily: 'gemini-interactions',
        endpoint,
        requestBytes: 128,
        maximumResponseBytes: 4_096,
        timeoutMs: 1_000,
        resolveHost,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
    });
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.0.1',
    '::',
    '::1',
    '::0001',
    '0:0:0:0:0:0:0:1',
    '::127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])('classifies reserved address %s as denied', (address) => {
    expect(isPublicAgentEvaluationAddress(address)).toBe(false);
  });

  it('fails closed on private, duplicate, empty, or mixed DNS answers', async () => {
    for (const addresses of [
      [],
      ['8.8.8.8', '8.8.8.8'],
      ['8.8.8.8', '127.0.0.1'],
    ]) {
      await expect(
        authorize('openai-responses', undefined, addresses)
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
      });
    }
  });

  it.each(['alt=sse', 'alt=json'] as const)(
    'admits the exact Gemini probe POST response query %s on v1',
    async (responseQuery) => {
      const endpoint = `https://generativelanguage.googleapis.com/v1/interactions?${responseQuery}`;
      await expect(
        authorizeAgentEvaluationCapabilityProbeEgress({
          protocolFamily: 'gemini-interactions',
          method: 'POST',
          endpoint,
          requestBytes: 128,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost: async () => ['8.8.8.8'],
        })
      ).resolves.toEqual({
        hostname: new URL(endpoint).hostname,
        approvedAddresses: ['8.8.8.8'],
      });
    }
  );

  it.each([
    'https://generativelanguage.googleapis.com/v1/interactions',
    'https://generativelanguage.googleapis.com/v1/interactions?alt=xml',
    'https://generativelanguage.googleapis.com/v1/interactions?alt=json&key=secret',
    'https://generativelanguage.googleapis.com/v1beta/interactions?alt=json',
  ])(
    'denies Gemini probe POST path or response-query drift: %s',
    async (endpoint) => {
      const resolveHost = vi.fn(async () => ['8.8.8.8']);
      await expect(
        authorizeAgentEvaluationCapabilityProbeEgress({
          protocolFamily: 'gemini-interactions',
          method: 'POST',
          endpoint,
          requestBytes: 128,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost,
        })
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
      });
      expect(resolveHost).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['openai-responses', 'https://api.openai.com/v1/responses/resp_probe_1'],
    [
      'gemini-interactions',
      'https://generativelanguage.googleapis.com/v1/interactions/interaction_probe_1?alt=json',
    ],
  ] as const)(
    'admits one exact provider-created %s probe resource',
    async (protocolFamily, endpoint) => {
      await expect(
        authorizeAgentEvaluationCapabilityProbeEgress({
          protocolFamily,
          method: 'GET',
          endpoint,
          requestBytes: 1,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost: async () => ['8.8.8.8'],
        })
      ).resolves.toEqual({
        hostname: new URL(endpoint).hostname,
        approvedAddresses: ['8.8.8.8'],
      });
    }
  );

  it.each([
    [
      'anthropic-messages',
      'https://api.anthropic.com/v1/messages/message_probe_1',
    ],
    ['openai-responses', 'https://api.openai.com/v1/responses/a/b'],
    [
      'openai-responses',
      'https://api.openai.com/v1/responses/resp_probe_1?api_key=secret',
    ],
    [
      'gemini-interactions',
      'https://generativelanguage.googleapis.com/v1/interactions/interaction_probe_1?alt=sse',
    ],
    [
      'gemini-interactions',
      'https://generativelanguage.googleapis.com/v1beta/interactions/interaction_probe_1?alt=json',
    ],
  ] as const)(
    'denies drifted dynamic probe resource %s %s',
    async (protocolFamily, endpoint) => {
      const resolveHost = vi.fn(async () => ['8.8.8.8']);
      await expect(
        authorizeAgentEvaluationCapabilityProbeEgress({
          protocolFamily,
          method: 'GET',
          endpoint,
          requestBytes: 1,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost,
        })
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
      });
      expect(resolveHost).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['openai-responses', 'POST', 'https://api.openai.com/v1/files'],
    ['openai-responses', 'POST', 'https://api.openai.com/v1/vector_stores'],
    [
      'openai-responses',
      'GET',
      'https://api.openai.com/v1/vector_stores/vs_probe_1',
    ],
    ['openai-responses', 'GET', 'https://api.openai.com/v1/files/file_probe_1'],
    [
      'openai-responses',
      'DELETE',
      'https://api.openai.com/v1/vector_stores/vs_probe_1',
    ],
    [
      'openai-responses',
      'DELETE',
      'https://api.openai.com/v1/files/file_probe_1',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores?pageSize=20',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores?pageSize=20&pageToken=page_token%3D',
    ],
    [
      'gemini-interactions',
      'POST',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores/store-probe-1',
    ],
    [
      'gemini-interactions',
      'POST',
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore',
    ],
    [
      'gemini-interactions',
      'POST',
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore?upload_id=upload_1&upload_protocol=resumable',
    ],
    [
      'gemini-interactions',
      'DELETE',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores/store-probe-1?force=true',
    ],
  ] as const)(
    'admits exact %s provider-resource %s %s',
    async (protocolFamily, method, endpoint) => {
      await expect(
        authorizeAgentEvaluationHostedRetrievalProviderResourceEgress({
          protocolFamily,
          method,
          endpoint,
          requestBytes: method === 'GET' || method === 'DELETE' ? 0 : 128,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost: async () => ['8.8.8.8'],
        })
      ).resolves.toEqual({
        hostname: new URL(endpoint).hostname,
        approvedAddresses: ['8.8.8.8'],
      });
    }
  );

  it.each([
    ['anthropic-messages', 'POST', 'https://api.anthropic.com/v1/files'],
    [
      'openai-responses',
      'POST',
      'https://api.openai.com/v1/vector_stores?api_key=secret',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores?pageSize=100',
    ],
    [
      'gemini-interactions',
      'DELETE',
      'https://generativelanguage.googleapis.com/v1/fileSearchStores/store-probe-1?force=false',
    ],
    [
      'gemini-interactions',
      'POST',
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-probe-1:uploadToFileSearchStore?key=secret',
    ],
    [
      'gemini-interactions',
      'GET',
      'https://generativelanguage.googleapis.com/v1beta/fileSearchStores?pageSize=20',
    ],
  ] as const)(
    'denies drifted %s provider-resource %s %s before DNS',
    async (protocolFamily, method, endpoint) => {
      const resolveHost = vi.fn(async () => ['8.8.8.8']);
      await expect(
        authorizeAgentEvaluationHostedRetrievalProviderResourceEgress({
          protocolFamily,
          method,
          endpoint,
          requestBytes: method === 'GET' || method === 'DELETE' ? 0 : 128,
          maximumResponseBytes: 4_096,
          timeoutMs: 1_000,
          resolveHost,
        })
      ).rejects.toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied,
      });
      expect(resolveHost).not.toHaveBeenCalled();
    }
  );
});
