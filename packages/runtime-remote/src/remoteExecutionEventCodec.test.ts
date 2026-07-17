import {
  createExecutionNetworkTrace,
  toExecutionNetworkTraceValue,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import { decodeRemoteExecutionJobEvent } from './remoteExecutionEventCodec';

const detail = toExecutionNetworkTraceValue(
  createExecutionNetworkTrace({
    requestId: 'request-1',
    phase: 'runtime',
    runtimeZone: 'client',
    mode: 'live',
    adapter: 'core.http',
    method: 'GET',
    sanitizedUrl: 'https://api.example.test/',
    protocol: 'https',
    startedAt: 100,
    completedAt: 125,
    outcome: 'allowed',
    status: 200,
    correlation: {
      kind: 'data-operation',
      documentId: 'data-products',
      operationId: 'list',
      invocationId: 'invocation-1',
      sequence: 1,
      attempt: 1,
    },
  })
);

const event = (networkDetail: unknown) => ({
  jobId: 'execution-1',
  sequence: 1,
  emittedAt: 125,
  kind: 'trace',
  trace: {
    traceId: 'network:execution-1',
    spanId: 'request-1',
    name: 'network.request',
    phase: 'event',
    detail: networkDetail,
  },
});

describe('Remote execution Network event codec', () => {
  it('preserves canonical correlation through durable transport', () => {
    expect(decodeRemoteExecutionJobEvent(event(detail))).toMatchObject({
      kind: 'trace',
      trace: {
        name: 'network.request',
        detail: {
          sanitizedUrl: 'https://api.example.test/',
          correlation: {
            operationId: 'list',
            invocationId: 'invocation-1',
          },
          redacted: true,
        },
      },
    });
  });

  it('rejects fields that could persist headers or bodies', () => {
    expect(() =>
      decodeRemoteExecutionJobEvent(
        event({
          ...(detail as unknown as Record<string, unknown>),
          headers: { authorization: 'secret' },
        })
      )
    ).toThrow(/canonical Network trace/u);
  });
});

describe('Remote execution structured log codec', () => {
  const logEvent = (log: unknown) => ({
    jobId: 'execution-1',
    sequence: 2,
    emittedAt: 130,
    kind: 'log',
    log,
  });

  it('preserves bounded Console category, arguments and truncation markers', () => {
    expect(
      decodeRemoteExecutionJobEvent(
        logEvent({
          stream: 'console',
          level: 'warning',
          category: 'application',
          message: 'partial result',
          arguments: [{ count: 3 }],
          redacted: true,
          truncated: true,
        })
      )
    ).toMatchObject({
      kind: 'log',
      log: {
        category: 'application',
        arguments: [{ count: 3 }],
        redacted: true,
        truncated: true,
      },
    });
  });

  it('rejects private or unbounded log fields', () => {
    expect(() =>
      decodeRemoteExecutionJobEvent(
        logEvent({
          stream: 'console',
          level: 'info',
          message: 'unsafe',
          authorization: 'secret',
        })
      )
    ).toThrow(/unsupported field/u);
  });
});
