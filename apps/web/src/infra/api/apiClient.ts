import { API_ROOT } from './apiConfig';
import {
  ApiError,
  type ApiErrorDiagnosticPayload,
  type ApiErrorPayload,
} from './apiError';
import {
  createDiagnostic,
  isDiagnosticDomain,
  type ProdivixDiagnosticDomain,
} from '@prodivix/diagnostics';

type ApiRequestOptions = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
  defaultHeaders?: HeadersInit;
  token?: string;
};

const createHeaders = ({
  defaultHeaders,
  headers,
  token,
}: Pick<ApiRequestOptions, 'defaultHeaders' | 'headers' | 'token'>) => {
  const mergedHeaders = new Headers(defaultHeaders);
  const requestHeaders = new Headers(headers);
  requestHeaders.forEach((value, key) => {
    mergedHeaders.set(key, value);
  });
  if (token && !mergedHeaders.has('Authorization')) {
    mergedHeaders.set('Authorization', `Bearer ${token}`);
  }
  return mergedHeaders;
};

const parseResponsePayload = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

const normalizeDomain = (
  domain: string | undefined
): ProdivixDiagnosticDomain =>
  domain && isDiagnosticDomain(domain) ? domain : 'backend';

const normalizeDiagnostic = (diagnostic: ApiErrorDiagnosticPayload) =>
  createDiagnostic({
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity ?? 'error',
    domain: normalizeDomain(diagnostic.domain),
    docsUrl: diagnostic.docsUrl,
    retryable: diagnostic.retryable,
    meta: {
      path: diagnostic.path,
      targetRef: diagnostic.targetRef,
      details: diagnostic.details,
    },
  });

const toApiError = (payload: unknown, response: Response) => {
  const apiPayload =
    typeof payload === 'object' && payload
      ? (payload as ApiErrorPayload)
      : undefined;
  const errorPayload =
    apiPayload?.error &&
    typeof apiPayload.error === 'object' &&
    typeof apiPayload.error.code === 'string' &&
    typeof apiPayload.error.message === 'string'
      ? apiPayload.error
      : undefined;

  const message =
    errorPayload?.message || response.statusText || 'Request failed.';
  const code = errorPayload?.code ?? 'API-9001';
  const diagnostics =
    errorPayload?.diagnostics?.map(normalizeDiagnostic) ??
    (errorPayload
      ? [
          normalizeDiagnostic({
            code: errorPayload.code,
            message: errorPayload.message,
            severity: errorPayload.severity,
            domain: errorPayload.domain,
            retryable: errorPayload.retryable,
            docsUrl: errorPayload.docsUrl,
            details: errorPayload.details,
          }),
        ]
      : []);

  return new ApiError(message, response.status, code, errorPayload?.details, {
    requestId: errorPayload?.requestId,
    retryable: errorPayload?.retryable,
    diagnostics,
    payload: apiPayload,
  });
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> => {
  const { headers, defaultHeaders, token, ...requestInit } = options;
  const response = await fetch(`${API_ROOT}${path}`, {
    ...requestInit,
    headers: createHeaders({ defaultHeaders, headers, token }),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    throw toApiError(payload, response);
  }

  return payload as T;
};

export const isAbortError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
