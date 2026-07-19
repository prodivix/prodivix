import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  createServerFunctionInvocationTrace,
  decodeServerRuntimeTestInvocationTraces,
  encodeServerRuntimeTestInvocationTraces,
  readServerFunctionInvocationTraceValue,
  toExecutionServerFunctionBridgeFailure,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
} from '../index';

const request = Object.freeze({
  type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  requestId: 'trace-invocation:2',
  invocationId: 'trace-invocation',
  attempt: 2,
  functionRef: Object.freeze({
    artifactId: 'code-auth',
    exportName: 'loadPrincipal',
  }),
  input: Object.freeze({ bearer: 'input-credential-canary' }),
});

describe('Server Function invocation trace', () => {
  it('projects success metadata without input or output values', () => {
    const trace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
        kind: 'value',
        value: { token: 'output-credential-canary' },
      }),
      startedAt: 100,
      completedAt: 127,
    });
    expect(trace).toEqual({
      format: 'prodivix.server-function-invocation-trace.v1',
      requestId: request.requestId,
      invocationId: request.invocationId,
      attempt: 2,
      functionRef: request.functionRef,
      startedAt: 100,
      completedAt: 127,
      durationMs: 27,
      outcome: 'succeeded',
      resultKind: 'value',
      redacted: true,
    });
    const value = toServerFunctionInvocationTraceValue(trace);
    expect(readServerFunctionInvocationTraceValue(value)).toEqual(trace);
    expect(JSON.stringify(value)).not.toMatch(
      /input-credential-canary|output-credential-canary|bearer|token/iu
    );
  });

  it('distinguishes safe failure and cancellation metadata', () => {
    expect(
      createServerFunctionInvocationTrace({
        request,
        response: toExecutionServerFunctionBridgeFailure(
          request.requestId,
          'SVR-4004'
        ),
        startedAt: 10,
        completedAt: 11,
      })
    ).toMatchObject({
      outcome: 'failed',
      errorCode: 'SVR-4004',
      retryable: false,
    });
    expect(
      createServerFunctionInvocationTrace({
        request,
        response: toExecutionServerFunctionBridgeFailure(
          request.requestId,
          'SVR_CANCELLED'
        ),
        startedAt: 12,
        completedAt: 13,
      })
    ).toMatchObject({
      outcome: 'cancelled',
      errorCode: 'SVR_CANCELLED',
      retryable: false,
    });
  });

  it('rejects unknown credential fields, identity drift, and inconsistent outcomes', () => {
    const valid = toServerFunctionInvocationTraceValue(
      createServerFunctionInvocationTrace({
        request,
        response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
          kind: 'allow',
        }),
        startedAt: 20,
        completedAt: 24,
      })
    ) as Record<string, unknown>;
    expect(
      readServerFunctionInvocationTraceValue({
        ...valid,
        sessionId: 'session-credential-canary',
      })
    ).toBeUndefined();
    expect(
      readServerFunctionInvocationTraceValue({ ...valid, durationMs: 5 })
    ).toBeUndefined();
    expect(
      readServerFunctionInvocationTraceValue({
        ...valid,
        outcome: 'failed',
        errorCode: 'SVR-4004',
        retryable: false,
      })
    ).toBeUndefined();
    expect(
      readServerFunctionInvocationTraceValue({
        ...valid,
        requestId: 'different:2',
      })
    ).toBeUndefined();
  });

  it('round-trips a bounded deterministic Test JSONL file and rejects partial or widened records', () => {
    const trace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
        kind: 'value',
        value: { secret: 'never-projected' },
      }),
      startedAt: 30,
      completedAt: 31,
    });
    const encoded = encodeServerRuntimeTestInvocationTraces([trace]);
    expect(decodeServerRuntimeTestInvocationTraces(encoded)).toEqual([trace]);
    expect(new TextDecoder().decode(encoded)).not.toContain('never-projected');
    expect(() =>
      decodeServerRuntimeTestInvocationTraces(
        new TextDecoder().decode(encoded).trimEnd()
      )
    ).toThrow('incomplete');
    expect(() =>
      decodeServerRuntimeTestInvocationTraces(
        `${JSON.stringify({
          ...(toServerFunctionInvocationTraceValue(trace) as Record<
            string,
            unknown
          >),
          authorization: 'credential-canary',
        })}\n`
      )
    ).toThrow('invalid');
  });
});
