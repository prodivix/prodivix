import { describe, expect, it } from 'vitest';
import {
  readExecutionDataGatewayBridgeRequest,
  readExecutionDataGatewayBridgeResponse,
  readExecutionDataGatewayResult,
  toExecutionDataGatewayBridgeFailure,
  toExecutionDataGatewayBridgeSuccess,
} from '../executionDataGatewayBridge';

const invocation = {
  requestId: 'invocation-1:1',
  documentId: 'data-1',
  operationId: 'list',
  invocationId: 'invocation-1',
  sequence: 3,
  attempt: 1,
  input: { page: 1 },
} as const;

const network = {
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
  responseBytes: 12,
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

describe('Execution Data gateway bridge', () => {
  it('round-trips an exact value-only invocation and sanitized result', () => {
    const request = readExecutionDataGatewayBridgeRequest({
      type: 'prodivix.execution-data-gateway-request.v1',
      ...invocation,
    });
    expect(request).toEqual({
      type: 'prodivix.execution-data-gateway-request.v1',
      ...invocation,
    });
    const result = readExecutionDataGatewayResult(
      { value: { items: [] }, empty: false, network },
      invocation
    );
    expect(result?.network.sanitizedUrl).toBe('https://api.example.test/');
    const response = toExecutionDataGatewayBridgeSuccess(invocation, result!);
    expect(
      readExecutionDataGatewayBridgeResponse(response, invocation)
    ).toEqual(response);
  });

  it('rejects material fields, correlation drift, and oversized input', () => {
    expect(
      readExecutionDataGatewayBridgeRequest({
        type: 'prodivix.execution-data-gateway-request.v1',
        ...invocation,
        authorization: 'secret-canary',
      })
    ).toBeUndefined();
    expect(
      readExecutionDataGatewayResult(
        {
          value: null,
          empty: false,
          network: {
            ...network,
            correlation: { ...network.correlation, operationId: 'other' },
          },
        },
        invocation
      )
    ).toBeUndefined();
    expect(
      readExecutionDataGatewayBridgeRequest({
        type: 'prodivix.execution-data-gateway-request.v1',
        ...invocation,
        input: 'x'.repeat(1024 * 1024 + 1),
      })
    ).toBeUndefined();
  });

  it('uses a bounded failure shape with no message or material channel', () => {
    const response = toExecutionDataGatewayBridgeFailure(
      invocation.requestId,
      'DATA_REMOTE_GATEWAY_UNAVAILABLE',
      true
    );
    expect(
      readExecutionDataGatewayBridgeResponse(response, invocation)
    ).toEqual(response);
    expect(JSON.stringify(response)).not.toContain('message');
  });
});
