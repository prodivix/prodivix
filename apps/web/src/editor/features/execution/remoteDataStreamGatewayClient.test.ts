import { describe, expect, it, vi } from 'vitest';
import { createRemoteDataStreamGatewayClient } from './remoteDataStreamGatewayClient';

const invocation = {
  requestId: 'stream-1:stream',
  documentId: 'data/events',
  operationId: 'watch:products',
  adapterId: 'core.graphql',
  invocationId: 'stream-1',
  sequence: 2,
  attempt: 1,
  input: { category: 'chairs' },
} as const;

const network = {
  format: 'prodivix.execution-network-trace.v1',
  requestId: invocation.requestId,
  phase: 'runtime',
  runtimeZone: 'edge',
  mode: 'live',
  adapter: invocation.adapterId,
  method: 'POST',
  sanitizedUrl: 'https://api.example.test/',
  protocol: 'https',
  startedAt: 100,
  completedAt: 101,
  durationMs: 1,
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
} as const;

const streamResponse = (records: readonly unknown[]): Response =>
  new Response(
    records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    }
  );

describe('Remote Data stream gateway client', () => {
  it('streams strict cursor records without buffering or implicit credentials', async () => {
    const fetcher = vi.fn(async () =>
      streamResponse([
        { type: 'prodivix.execution-data-stream.v1', phase: 'open', network },
        {
          type: 'prodivix.execution-data-stream.v1',
          phase: 'event',
          cursor: 1,
          value: { id: 'p1' },
        },
        {
          type: 'prodivix.execution-data-stream.v1',
          phase: 'event',
          cursor: 2,
          value: { id: 'p2' },
        },
        {
          type: 'prodivix.execution-data-stream.v1',
          phase: 'complete',
          cursor: 2,
        },
      ])
    );
    const client = createRemoteDataStreamGatewayClient({
      baseUrl: 'https://editor.example.test/api/',
      accessToken: 'user-session-token',
      fetcher,
    });
    const session = await client.open('execution/1', invocation);
    await expect(session.next()).resolves.toMatchObject({
      cursor: 1,
      value: { id: 'p1' },
    });
    await expect(session.next()).resolves.toMatchObject({
      cursor: 2,
      value: { id: 'p2' },
    });
    await expect(session.next()).resolves.toBeUndefined();
    expect(session.network).toEqual(network);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        'https://editor.example.test/api/remote-executions/execution%2F1/data-sources/data%2Fevents/operations/watch%3Aproducts/stream'
      ),
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({
          authorization: 'Bearer user-session-token',
        }),
      })
    );
  });

  it('fails closed on cursor gaps and never exposes arbitrary Backend text', async () => {
    const canary = 'secret-canary-stream-error-3e90';
    const client = createRemoteDataStreamGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      fetcher: async () =>
        streamResponse([
          { type: 'prodivix.execution-data-stream.v1', phase: 'open', network },
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'event',
            cursor: 2,
            value: { canary },
          },
        ]),
    });
    const session = await client.open('execution-1', invocation);
    const failure = await session.next().catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'DATA_REMOTE_GATEWAY_INVALID' });
    expect(String(failure)).not.toContain(canary);
  });

  it('resumes from an opaque checkpoint with renewed auth and publishes only sanitized reconnect Network traces', async () => {
    const reconnect = {
      resume: 'sse-last-event-id',
      maxReconnectAttempts: 2,
      backoff: 'fixed',
      initialDelayMs: 25,
    } as const;
    const renewedNetwork = {
      ...network,
      requestId: `${invocation.requestId}:1`,
      startedAt: 125,
      completedAt: 126,
    } as const;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'open',
            network,
            reconnect,
          },
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'event',
            cursor: 1,
            value: { action: 'upsert', entity: { id: 'p1', name: 'Chair' } },
            resume: { cursor: 1, token: 'opaque-checkpoint-1' },
          },
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'error',
            code: 'DATA_GRAPHQL_REQUEST_FAILED',
          },
        ])
      )
      .mockResolvedValueOnce(
        streamResponse([
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'open',
            network: renewedNetwork,
            reconnect,
          },
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'event',
            cursor: 2,
            value: { action: 'delete', id: 'p1' },
            resume: { cursor: 2, token: 'opaque-checkpoint-2' },
          },
          {
            type: 'prodivix.execution-data-stream.v1',
            phase: 'complete',
            cursor: 2,
          },
        ])
      );
    const resolveAccessToken = vi
      .fn()
      .mockReturnValueOnce('session-token-1')
      .mockReturnValueOnce('session-token-2');
    const wait = vi.fn(async () => undefined);
    const client = createRemoteDataStreamGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: resolveAccessToken,
      fetcher,
      wait,
    });
    const session = await client.open('execution-1', invocation);
    const renewedNetworks: unknown[] = [];
    const unsubscribe = session.subscribeNetwork((value) =>
      renewedNetworks.push(value)
    );

    await expect(session.next()).resolves.toEqual({
      type: 'prodivix.execution-data-stream.v1',
      requestId: invocation.requestId,
      phase: 'event',
      cursor: 1,
      value: { action: 'upsert', entity: { id: 'p1', name: 'Chair' } },
    });
    await expect(session.next()).resolves.toEqual({
      type: 'prodivix.execution-data-stream.v1',
      requestId: invocation.requestId,
      phase: 'event',
      cursor: 2,
      value: { action: 'delete', id: 'p1' },
    });
    await expect(session.next()).resolves.toBeUndefined();
    unsubscribe();

    expect(resolveAccessToken).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(25, expect.any(AbortSignal));
    expect(renewedNetworks).toEqual([renewedNetwork]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: 'Bearer session-token-1',
      }),
    });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        authorization: 'Bearer session-token-2',
      }),
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      invocationId: invocation.invocationId,
      sequence: invocation.sequence,
      attempt: invocation.attempt,
      input: invocation.input,
      resume: { cursor: 1, token: 'opaque-checkpoint-1' },
    });
    expect(JSON.stringify(renewedNetworks)).not.toContain('checkpoint');
    expect(JSON.stringify(renewedNetworks)).not.toContain('session-token');
  });

  it('does not dispatch a pre-cancelled stream request', async () => {
    expect(() =>
      createRemoteDataStreamGatewayClient({
        baseUrl: 'https://user:password@editor.example.test/api?token=unsafe',
        accessToken: 'user-session-token',
      })
    ).toThrow(/base URL is unsafe/u);
    const fetcher = vi.fn();
    const client = createRemoteDataStreamGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      fetcher,
    });
    const abort = new AbortController();
    abort.abort();

    await expect(
      client.open('execution-1', invocation, abort.signal)
    ).rejects.toMatchObject({
      code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
      retryable: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('collapses a failing Backend error body to a safe code', async () => {
    const canary = 'secret-canary-error-body-7a41';
    const client = createRemoteDataStreamGatewayClient({
      baseUrl: 'https://editor.example.test/api',
      accessToken: 'user-session-token',
      fetcher: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(canary));
            },
          }),
          {
            status: 502,
            headers: { 'content-type': 'application/json' },
          }
        ),
    });

    const failure = await client
      .open('execution-1', invocation)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
      retryable: true,
    });
    expect(String(failure)).not.toContain(canary);
  });
});
