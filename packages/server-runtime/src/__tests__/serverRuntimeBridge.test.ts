import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  readExecutionServerFunctionBridgeRequest,
  readExecutionServerFunctionBridgeResponse,
  toExecutionServerFunctionBridgeSuccess,
} from '../index';

const request = {
  type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  requestId: 'invocation-1:1',
  invocationId: 'invocation-1',
  attempt: 1,
  functionRef: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
  input: { routeId: 'route-home' },
} as const;

describe('Server Function bridge', () => {
  it('round-trips value-only requests and correlated responses', () => {
    const decoded = readExecutionServerFunctionBridgeRequest(request);
    expect(decoded).toEqual(request);
    const response = toExecutionServerFunctionBridgeSuccess(request.requestId, {
      kind: 'value',
      value: { providerId: 'product-session', principalId: 'user-1' },
    });
    expect(
      readExecutionServerFunctionBridgeResponse(response, request)
    ).toEqual(response);
  });

  it.each([
    { ...request, accessToken: 'secret' },
    { ...request, sessionId: 'session-1' },
    { ...request, requestId: 'another-invocation:1' },
    { ...request, attempt: 0 },
    {
      ...request,
      functionRef: { artifactId: '../code-auth', exportName: 'loadPrincipal' },
    },
    {
      ...request,
      functionRef: {
        ...request.functionRef,
        source: 'not allowed',
      },
    },
  ])('rejects authority or malformed fields from the frame', (candidate) => {
    expect(readExecutionServerFunctionBridgeRequest(candidate)).toBeUndefined();
  });

  it('rejects a response for another invocation', () => {
    const response = toExecutionServerFunctionBridgeSuccess(request.requestId, {
      kind: 'allow',
    });
    expect(
      readExecutionServerFunctionBridgeResponse(response, {
        requestId: 'invocation-2:1',
      })
    ).toBeUndefined();
  });

  it('rejects a value beyond the shared bridge depth budget', () => {
    let input: unknown = null;
    for (let depth = 0; depth < 66; depth += 1) input = { value: input };
    expect(
      readExecutionServerFunctionBridgeRequest({ ...request, input })
    ).toBeUndefined();
  });
});
