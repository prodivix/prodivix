import { describe, expect, it } from 'vitest';
import type { RemoteExecutionHttpPort } from '@prodivix/runtime-remote';
import { createRemotePreviewOriginClient } from './remotePreviewOriginClient';

const artifact = Object.freeze({
  artifactId: 'preview:artifact/1',
  kind: 'bundle' as const,
  mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
  size: 123,
  digest: `sha256-${'a'.repeat(64)}`,
});

describe('Remote Preview origin client', () => {
  it('materializes an artifact through the authenticated Backend route', async () => {
    let requestUrl = '';
    let authorization = '';
    const http: RemoteExecutionHttpPort = {
      request: async (input) => {
        requestUrl = input.url;
        authorization = input.headers.authorization ?? '';
        return {
          status: 201,
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: new TextEncoder().encode(
            JSON.stringify({
              previewUrl: `https://${'b'.repeat(64)}.preview.example.test/`,
              expiresAt: 2_000,
            })
          ),
        };
      },
    };
    const client = createRemotePreviewOriginClient({
      baseUrl: 'https://api.example.test/api',
      accessToken: 'user-session-token',
      http,
      now: () => 1_000,
    });
    const result = await client.materialize({
      executionId: 'execution/1',
      artifact,
    });
    expect(requestUrl).toBe(
      'https://api.example.test/api/remote-executions/execution%2F1/artifacts/preview%3Aartifact%2F1/preview-sessions'
    );
    expect(authorization).toBe('Bearer user-session-token');
    expect(result).toEqual({
      ...artifact,
      uri: `https://${'b'.repeat(64)}.preview.example.test/`,
    });
  });

  it('rejects expired and non-capability origins', async () => {
    const response = (previewUrl: string, expiresAt: number) =>
      ({
        request: async () => ({
          status: 201,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({ previewUrl, expiresAt })
          ),
        }),
      }) satisfies RemoteExecutionHttpPort;
    await expect(
      createRemotePreviewOriginClient({
        baseUrl: 'https://api.example.test/api',
        accessToken: 'token',
        http: response('https://preview.example.test/', 2_000),
        now: () => 1_000,
      }).materialize({ executionId: 'execution-1', artifact })
    ).rejects.toThrow('origin URL');
    await expect(
      createRemotePreviewOriginClient({
        baseUrl: 'https://api.example.test/api',
        accessToken: 'token',
        http: response(`https://${'b'.repeat(64)}.preview.example.test/`, 999),
        now: () => 1_000,
      }).materialize({ executionId: 'execution-1', artifact })
    ).rejects.toThrow('expired');
  });
});
