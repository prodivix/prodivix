import { describe, expect, it } from 'vitest';
import { createRemoteExecutionHttpTransports } from './remoteExecutionHttpTransport';

const bytes = (value: string) => new TextEncoder().encode(value);

describe('Remote execution HTTP transports', () => {
  it('keeps bearer authority in the adapter and bounds envelope/content responses', async () => {
    const requests: unknown[] = [];
    const adapters = createRemoteExecutionHttpTransports({
      baseUrl: 'https://runner.example.test/',
      accessToken: 'client-token',
      http: {
        async request(input) {
          requests.push(input);
          return input.method === 'POST'
            ? {
                status: 200,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: bytes(
                  '{"protocol":"prodivix.remote-execution","version":1}'
                ),
              }
            : {
                status: 200,
                headers: { 'content-type': 'application/octet-stream' },
                body: new Uint8Array([1, 2, 3]),
              };
        },
      },
    });

    await adapters.transport.send({
      protocol: 'prodivix.remote-execution',
      version: 1,
      messageId: 'request-1',
      operation: 'negotiate',
      payload: { supportedVersions: [1] },
    });
    await expect(
      adapters.contentTransport.download({
        executionId: 'execution/1',
        artifactId: 'preview 1',
        maximumBytes: 10,
      })
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(requests).toMatchObject([
      {
        url: 'https://runner.example.test/v1/executions',
        headers: { authorization: 'Bearer client-token' },
      },
      {
        url: 'https://runner.example.test/v1/executions/execution%2F1/artifacts/preview%201/content',
        headers: { authorization: 'Bearer client-token' },
        maximumResponseBytes: 10,
      },
    ]);
  });

  it('rejects error, invalid content type, and oversized content responses', async () => {
    expect(() =>
      createRemoteExecutionHttpTransports({
        baseUrl: 'http://runner.example.test',
        accessToken: 'token',
        http: {
          request: async () => ({
            status: 200,
            headers: {},
            body: new Uint8Array(),
          }),
        },
      })
    ).toThrow('must use HTTPS');
    expect(() =>
      createRemoteExecutionHttpTransports({
        baseUrl: 'https://runner.example.test',
        accessToken: 'token',
        executionPath: '//authority-confusion',
        http: {
          request: async () => ({
            status: 200,
            headers: {},
            body: new Uint8Array(),
          }),
        },
      })
    ).toThrow('execution path is invalid');
    const failing = createRemoteExecutionHttpTransports({
      baseUrl: 'https://runner.example.test',
      accessToken: 'token',
      http: {
        async request() {
          return { status: 401, headers: {}, body: new Uint8Array() };
        },
      },
    });
    await expect(
      failing.contentTransport.download({
        executionId: 'execution-1',
        artifactId: 'artifact-1',
        maximumBytes: 10,
      })
    ).rejects.toMatchObject({ status: 401 });

    const oversized = createRemoteExecutionHttpTransports({
      baseUrl: 'https://runner.example.test',
      accessToken: 'token',
      http: {
        async request() {
          return {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
            body: new Uint8Array(11),
          };
        },
      },
    });
    await expect(
      oversized.contentTransport.download({
        executionId: 'execution-1',
        artifactId: 'artifact-1',
        maximumBytes: 10,
      })
    ).rejects.toThrow('exceeds');
  });
});
