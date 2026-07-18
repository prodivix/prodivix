import { describe, expect, it, vi } from 'vitest';
import type { RemoteExecutionHttpRequest } from '@prodivix/runtime-remote';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  toExecutionServerFunctionBridgeSuccess,
} from '@prodivix/server-runtime';
import { createRemoteServerFunctionGatewayClient } from './remoteServerFunctionGatewayClient';

const invocation = {
  type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  requestId: 'invocation-1:1',
  invocationId: 'invocation-1',
  attempt: 1,
  functionRef: {
    artifactId: 'code-auth',
    exportName: 'loadPrincipal',
  },
  input: { routeId: 'route-home' },
} as const;

describe('Remote Server Function gateway client', () => {
  it('sends the exact value-only request with product authentication', async () => {
    let sent: RemoteExecutionHttpRequest | undefined;
    const response = toExecutionServerFunctionBridgeSuccess(
      invocation.requestId,
      {
        kind: 'value',
        value: {
          providerId: 'prodivix-product-session',
          principalId: 'user-1',
        },
      }
    );
    const request = vi.fn(async (input: RemoteExecutionHttpRequest) => {
      sent = input;
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode(JSON.stringify(response)),
      };
    });
    const client = createRemoteServerFunctionGatewayClient({
      baseUrl: 'https://editor.example.test/api/',
      accessToken: 'product-session-token',
      http: { request },
    });
    const cancellation = new AbortController();

    await expect(
      client.invoke('execution-1', invocation, cancellation.signal)
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://editor.example.test/api/remote-executions/execution-1/server-functions/code-auth/loadPrincipal/invoke',
        headers: expect.objectContaining({
          authorization: 'Bearer product-session-token',
          'x-prodivix-server-function-intent': 'mutation-v1',
        }),
        signal: cancellation.signal,
      })
    );
    expect(JSON.parse(new TextDecoder().decode(sent?.body))).toEqual(
      invocation
    );
  });

  it('returns only a safe error code when Backend includes a canary', async () => {
    const canary = 'session-secret-canary-2fca';
    const client = createRemoteServerFunctionGatewayClient({
      baseUrl: 'https://editor.example.test/api/',
      accessToken: 'product-session-token',
      http: {
        request: async () => ({
          status: 503,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              error: {
                code: 'UNSAFE_BACKEND_CODE',
                message: canary,
                retryable: false,
              },
            })
          ),
        }),
      },
    });
    const error = await client
      .invoke('execution-1', invocation)
      .then(() => undefined)
      .catch((candidate: unknown) => candidate);
    expect(error).toMatchObject({ code: 'SVR-5001', retryable: true });
    expect(String(error)).not.toContain(canary);
  });

  it('rejects a non-canonical function reference before the HTTP effect', async () => {
    const request = vi.fn();
    const client = createRemoteServerFunctionGatewayClient({
      baseUrl: 'https://editor.example.test/api/',
      accessToken: 'product-session-token',
      http: { request },
    });
    await expect(
      client.invoke('execution-1', {
        ...invocation,
        functionRef: {
          artifactId: '../code-auth',
          exportName: 'loadPrincipal',
        },
      })
    ).rejects.toThrow('Server Function reference is invalid.');
    expect(request).not.toHaveBeenCalled();
  });
});
