import { describe, expect, it } from 'vitest';
import {
  EXECUTION_DATA_STREAM_BRIDGE_LIMITS,
  readExecutionDataStreamBridgeMessage,
  readExecutionDataStreamCancellation,
  readExecutionDataStreamOpenRequest,
  readExecutionDataStreamPull,
  toExecutionDataStreamEventMessage,
  toExecutionDataStreamOpenMessage,
  toExecutionDataStreamTerminalMessage,
} from '../executionDataStreamBridge';

const invocation = {
  requestId: 'stream-1:stream',
  documentId: 'data-events',
  operationId: 'watch',
  adapterId: 'core.graphql',
  invocationId: 'stream-1',
  sequence: 3,
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

describe('Execution Data stream bridge', () => {
  it('round-trips one exact open, cursor sequence, completion, and cancellation', () => {
    const request = readExecutionDataStreamOpenRequest({
      type: 'prodivix.execution-data-stream-open.v1',
      ...invocation,
    });
    expect(request).toEqual({
      type: 'prodivix.execution-data-stream-open.v1',
      ...invocation,
    });
    expect(toExecutionDataStreamOpenMessage(invocation, network)).toMatchObject(
      {
        phase: 'open',
        network,
      }
    );
    expect(
      toExecutionDataStreamEventMessage(invocation, 1, { id: 'p1' })
    ).toMatchObject({ phase: 'event', cursor: 1, value: { id: 'p1' } });
    expect(
      toExecutionDataStreamTerminalMessage(invocation, {
        phase: 'complete',
        cursor: 1,
      })
    ).toMatchObject({ phase: 'complete', cursor: 1 });
    expect(
      readExecutionDataStreamCancellation({
        type: 'prodivix.execution-data-stream-cancel.v1',
        requestId: invocation.requestId,
      })
    ).toEqual({
      type: 'prodivix.execution-data-stream-cancel.v1',
      requestId: invocation.requestId,
    });
    expect(
      readExecutionDataStreamPull({
        type: 'prodivix.execution-data-stream-pull.v1',
        requestId: invocation.requestId,
        cursor: 1,
      })
    ).toEqual({
      type: 'prodivix.execution-data-stream-pull.v1',
      requestId: invocation.requestId,
      cursor: 1,
    });
  });

  it('rejects adapter drift, cursor gaps, material fields, and oversized events', () => {
    expect(
      readExecutionDataStreamOpenRequest({
        type: 'prodivix.execution-data-stream-open.v1',
        ...invocation,
        adapterId: 'core.http',
      })
    ).toBeUndefined();
    expect(
      readExecutionDataStreamOpenRequest({
        type: 'prodivix.execution-data-stream-open.v1',
        ...invocation,
        authorization: 'secret-canary',
      })
    ).toBeUndefined();
    expect(
      readExecutionDataStreamBridgeMessage(
        {
          type: 'prodivix.execution-data-stream.v1',
          requestId: invocation.requestId,
          phase: 'event',
          cursor: 2,
          value: { id: 'p2' },
        },
        invocation,
        0
      )
    ).toBeUndefined();
    expect(
      readExecutionDataStreamBridgeMessage(
        {
          type: 'prodivix.execution-data-stream.v1',
          requestId: invocation.requestId,
          phase: 'open',
          network,
          reconnect: { resume: 'sse-last-event-id' },
        },
        invocation,
        0
      )
    ).toBeUndefined();
    expect(
      readExecutionDataStreamBridgeMessage(
        {
          type: 'prodivix.execution-data-stream.v1',
          requestId: invocation.requestId,
          phase: 'event',
          cursor: 1,
          value: { id: 'p1' },
          resume: { cursor: 1, token: 'private-checkpoint' },
        },
        invocation,
        0
      )
    ).toBeUndefined();
    expect(
      readExecutionDataStreamBridgeMessage(
        {
          type: 'prodivix.execution-data-stream.v1',
          requestId: invocation.requestId,
          phase: 'event',
          cursor: 1,
          value: 'x'.repeat(
            EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxEventBytes + 1
          ),
        },
        invocation,
        0
      )
    ).toBeUndefined();
  });
});
