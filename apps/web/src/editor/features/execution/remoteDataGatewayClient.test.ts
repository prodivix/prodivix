import { describe, expect, it, vi } from 'vitest';
import type { RemoteExecutionHttpRequest } from '@prodivix/runtime-remote';
import { createRemoteDataGatewayClient } from './remoteDataGatewayClient';

const invocation = {
  requestId: 'invocation-1:1',
  documentId: 'data/1',
  operationId: 'list:items',
  invocationId: 'invocation-1',
  sequence: 2,
  attempt: 1,
  input: { page: 1 },
} as const;

const result = {
  value: { items: [] },
  empty: false,
  network: {
    format: 'prodivix.execution-network-trace.v1',
    requestId: invocation.requestId,
    phase: 'runtime',
    runtimeZone: 'server',
    mode: 'live',
    adapter: 'core.http',
    method: 'GET',
    sanitizedUrl: 'https://api.example.test/',
    protocol: 'https',
    startedAt: 100,
    completedAt: 120,
    durationMs: 20,
    outcome: 'allowed',
    status: 200,
    correlation: {
      kind: 'data-operation',
      documentId: invocation.documentId,
      operationId: invocation.operationId,
      invocationId: invocation.invocationId,
      sequence: invocation.sequence,
      attempt: invocation.attempt,
    },
    redacted: true,
  },
};

describe('Remote Data gateway client', () => {
  it('calls the exact encoded execution operation with product authentication', async () => {
    let sentRequest: RemoteExecutionHttpRequest | undefined;
    const request = vi.fn(async (input: RemoteExecutionHttpRequest) => {
      sentRequest = input;
      return {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: new TextEncoder().encode(JSON.stringify(result)),
      };
    });
    const client = createRemoteDataGatewayClient({
      baseUrl: 'https://editor.example.test/api/',
      accessToken: 'user-session-token',
      http: { request },
    });
    await expect(client.invoke('execution/1', invocation)).resolves.toEqual(
      result
    );
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://editor.example.test/api/remote-executions/execution%2F1/data-sources/data%2F1/operations/list%3Aitems/invoke',
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer user-session-token',
        }),
      })
    );
    const sent = JSON.parse(new TextDecoder().decode(sentRequest?.body));
    expect(sent).toEqual({
      invocationId: invocation.invocationId,
      sequence: invocation.sequence,
      attempt: invocation.attempt,
      input: invocation.input,
    });
  });

  it('maps arbitrary Backend failure bodies to a canary-free error', async () => {
    const canary = 'secret-canary-backend-error-7af2';
    const client = createRemoteDataGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      http: {
        request: async () => ({
          status: 502,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              error: {
                code: 'SECRET_CANARY_BACKEND_ERROR',
                message: canary,
                retryable: false,
              },
            })
          ),
        }),
      },
    });
    await expect(
      client.invoke('execution-1', invocation)
    ).rejects.toMatchObject({
      code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
      retryable: true,
    });
    await client.invoke('execution-1', invocation).catch((error: unknown) => {
      expect(String(error)).not.toContain(canary);
    });
  });

  it('preserves only a stable Backend replay diagnostic', async () => {
    const client = createRemoteDataGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      http: {
        request: async () => ({
          status: 409,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              error: {
                code: 'DATA_MUTATION_REPLAY_UNSAFE',
                message: 'must not cross the client boundary',
                retryable: false,
              },
            })
          ),
        }),
      },
    });
    await expect(
      client.invoke('execution-1', invocation)
    ).rejects.toMatchObject({
      code: 'DATA_MUTATION_REPLAY_UNSAFE',
      retryable: false,
      message: 'DATA_MUTATION_REPLAY_UNSAFE',
    });
  });

  it('preserves the bounded retryable upstream failure contract', async () => {
    const client = createRemoteDataGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      http: {
        request: async () => ({
          status: 502,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              error: {
                code: 'DATA_HTTP_REQUEST_FAILED',
                message: 'Remote Data operation request failed.',
                retryable: true,
              },
            })
          ),
        }),
      },
    });

    await expect(
      client.invoke('execution-1', invocation)
    ).rejects.toMatchObject({
      code: 'DATA_HTTP_REQUEST_FAILED',
      retryable: true,
    });
  });

  it('rejects a successful response if Network metadata carries a Secret canary', async () => {
    const canary = 'secret-canary-network-field-0d43';
    const client = createRemoteDataGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      http: {
        request: async () => ({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              ...result,
              network: {
                ...result.network,
                authorization: canary,
              },
            })
          ),
        }),
      },
    });

    const failure = await client
      .invoke('execution-1', invocation)
      .then(() => undefined)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'DATA_REMOTE_GATEWAY_INVALID' });
    expect(String(failure)).not.toContain(canary);
  });
});
