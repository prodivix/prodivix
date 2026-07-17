import {
  readExecutionDataGatewayResult,
  type ExecutionDataGatewayInvocation,
  type ExecutionDataGatewayResult,
} from '@prodivix/runtime-core';
import type { RemoteExecutionHttpPort } from '@prodivix/runtime-remote';

const maximumResponseBytes = 9 * 1024 * 1024;

export const REMOTE_DATA_GATEWAY_SAFE_ERROR_CODES = Object.freeze([
  'DATA_REMOTE_GATEWAY_UNAVAILABLE',
  'DATA_REMOTE_GATEWAY_DENIED',
  'DATA_REMOTE_GATEWAY_INVALID',
  'DATA_HTTP_REQUEST_FAILED',
  'DATA_MUTATION_REPLAY_CONFLICT',
  'DATA_MUTATION_REPLAY_UNSAFE',
  'DATA_MUTATION_REPLAY_CAPACITY',
] as const);

const safeErrorCodes = new Set<string>(REMOTE_DATA_GATEWAY_SAFE_ERROR_CODES);

export const isRemoteDataGatewaySafeErrorCode = (
  value: unknown
): value is (typeof REMOTE_DATA_GATEWAY_SAFE_ERROR_CODES)[number] =>
  typeof value === 'string' && safeErrorCodes.has(value);

export class RemoteDataGatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = 'RemoteDataGatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type RemoteDataGatewayClient = Readonly<{
  invoke(
    executionId: string,
    invocation: ExecutionDataGatewayInvocation
  ): Promise<ExecutionDataGatewayResult>;
}>;

const identifier = (value: string, label: string): string => {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 512 ||
    value.includes('\0')
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const readSafeFailure = (
  response: Readonly<{
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
  }>
): Readonly<{ code: string; retryable: boolean }> | undefined => {
  if (
    !String(response.headers['content-type'] ?? '')
      .toLowerCase()
      .startsWith('application/json')
  )
    return undefined;
  try {
    const decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(response.body)
    ) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      return undefined;
    const error = (decoded as { error?: unknown }).error;
    if (!error || typeof error !== 'object' || Array.isArray(error))
      return undefined;
    const { code, retryable } = error as {
      code?: unknown;
      retryable?: unknown;
    };
    return isRemoteDataGatewaySafeErrorCode(code) &&
      typeof retryable === 'boolean'
      ? Object.freeze({ code, retryable })
      : undefined;
  } catch {
    return undefined;
  }
};

/** Calls the authenticated Backend gateway without exposing the user token to the preview frame. */
export const createRemoteDataGatewayClient = (options: {
  baseUrl: string;
  accessToken: string;
  http: RemoteExecutionHttpPort;
}): RemoteDataGatewayClient => {
  const baseUrl = new URL(options.baseUrl);
  const accessToken = options.accessToken.trim();
  if (!accessToken)
    throw new TypeError('Remote Data gateway requires authentication.');
  return Object.freeze({
    async invoke(executionId, invocation) {
      const execution = identifier(executionId, 'Remote execution id');
      const body = new TextEncoder().encode(
        JSON.stringify({
          invocationId: invocation.invocationId,
          sequence: invocation.sequence,
          attempt: invocation.attempt,
          input: invocation.input,
        })
      );
      const path = `${baseUrl.pathname.replace(/\/$/u, '')}/remote-executions/${encodeURIComponent(execution)}/data-sources/${encodeURIComponent(invocation.documentId)}/operations/${encodeURIComponent(invocation.operationId)}/invoke`;
      const response = await options.http.request({
        url: new URL(path, baseUrl.origin).toString(),
        method: 'POST',
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        }),
        body,
        maximumResponseBytes,
      });
      if (response.status !== 200) {
        const failure = readSafeFailure(response);
        if (failure)
          throw new RemoteDataGatewayError(failure.code, failure.retryable);
        throw new RemoteDataGatewayError(
          response.status >= 500
            ? 'DATA_REMOTE_GATEWAY_UNAVAILABLE'
            : 'DATA_REMOTE_GATEWAY_DENIED',
          response.status >= 500
        );
      }
      if (
        !String(response.headers['content-type'] ?? '')
          .toLowerCase()
          .startsWith('application/json')
      )
        throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
      let decoded: unknown;
      try {
        decoded = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(response.body)
        );
      } catch {
        throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
      }
      const result = readExecutionDataGatewayResult(decoded, invocation);
      if (!result)
        throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
      return result;
    },
  });
};
