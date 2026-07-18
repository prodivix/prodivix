import {
  readExecutionServerFunctionBridgeResponse,
  type ExecutionServerFunctionBridgeRequest,
  type ExecutionServerFunctionBridgeResponse,
} from '@prodivix/server-runtime';
import type { RemoteExecutionHttpPort } from '@prodivix/runtime-remote';

const maximumResponseBytes = 1024 * 1024 + 64 * 1024;

export const REMOTE_SERVER_FUNCTION_SAFE_ERROR_CODES = Object.freeze([
  'SVR-1001',
  'SVR-2001',
  'SVR-3001',
  'SVR-3002',
  'SVR-3003',
  'SVR-4004',
  'SVR-5001',
  'SVR-5002',
  'SVR_CANCELLED',
] as const);

const safeErrorCodes = new Set<string>(REMOTE_SERVER_FUNCTION_SAFE_ERROR_CODES);

export const isRemoteServerFunctionSafeErrorCode = (
  value: unknown
): value is (typeof REMOTE_SERVER_FUNCTION_SAFE_ERROR_CODES)[number] =>
  typeof value === 'string' && safeErrorCodes.has(value);

export class RemoteServerFunctionGatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = 'RemoteServerFunctionGatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type RemoteServerFunctionGatewayClient = Readonly<{
  invoke(
    executionId: string,
    request: ExecutionServerFunctionBridgeRequest,
    signal?: AbortSignal
  ): Promise<ExecutionServerFunctionBridgeResponse>;
}>;

const identifier = (value: string, label: string): string => {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 512 ||
    value.includes('\0')
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
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
  ) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(response.body)
    ) as { error?: unknown };
    const error = decoded?.error;
    if (!error || typeof error !== 'object' || Array.isArray(error)) {
      return undefined;
    }
    const candidate = error as { code?: unknown; retryable?: unknown };
    return isRemoteServerFunctionSafeErrorCode(candidate.code) &&
      typeof candidate.retryable === 'boolean'
      ? Object.freeze({
          code: candidate.code,
          retryable: candidate.retryable,
        })
      : undefined;
  } catch {
    return undefined;
  }
};

/** Calls the product-authenticated gateway; the preview frame never receives this token. */
export const createRemoteServerFunctionGatewayClient = (options: {
  baseUrl: string;
  accessToken: string;
  http: RemoteExecutionHttpPort;
}): RemoteServerFunctionGatewayClient => {
  const baseUrl = new URL(options.baseUrl);
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new TypeError(
      'Remote Server Function gateway requires authentication.'
    );
  }
  return Object.freeze({
    async invoke(executionId, request, signal) {
      const execution = identifier(executionId, 'Remote execution id');
      const artifactId = identifier(
        request.functionRef.artifactId,
        'Server Function artifact id'
      );
      const exportName = identifier(
        request.functionRef.exportName,
        'Server Function export name'
      );
      if (
        artifactId.length > 256 ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(artifactId) ||
        exportName.length > 256 ||
        !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)
      ) {
        throw new TypeError('Server Function reference is invalid.');
      }
      const path = `${baseUrl.pathname.replace(/\/$/u, '')}/remote-executions/${encodeURIComponent(execution)}/server-functions/${encodeURIComponent(artifactId)}/${encodeURIComponent(exportName)}/invoke`;
      const response = await options.http.request({
        url: new URL(path, baseUrl.origin).toString(),
        method: 'POST',
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-prodivix-server-function-intent': 'mutation-v1',
        }),
        body: new TextEncoder().encode(JSON.stringify(request)),
        maximumResponseBytes,
        ...(signal ? { signal } : {}),
      });
      if (response.status !== 200) {
        const failure = readSafeFailure(response);
        if (failure) {
          throw new RemoteServerFunctionGatewayError(
            failure.code,
            failure.retryable
          );
        }
        throw new RemoteServerFunctionGatewayError(
          response.status >= 500 ? 'SVR-5001' : 'SVR-4004',
          response.status >= 500
        );
      }
      if (
        !String(response.headers['content-type'] ?? '')
          .toLowerCase()
          .startsWith('application/json')
      ) {
        throw new RemoteServerFunctionGatewayError('SVR-5002');
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(response.body)
        );
      } catch {
        throw new RemoteServerFunctionGatewayError('SVR-5002');
      }
      const result = readExecutionServerFunctionBridgeResponse(
        decoded,
        request
      );
      if (!result || !result.ok) {
        throw new RemoteServerFunctionGatewayError('SVR-5002');
      }
      return result;
    },
  });
};
