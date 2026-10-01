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
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export const API_REQUEST_TIMEOUT_MS = 30_000;

const withRequestDeadline = async <T>(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new TypeError('API timeout must be a positive safe integer.');
  const controller = new AbortController();
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(signal?.reason);
      reject(
        signal?.reason ?? new DOMException('Request aborted.', 'AbortError')
      );
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = globalThis.setTimeout(() => {
      const error = new TypeError('API request timed out.');
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    if (signal?.aborted) return await deadline;
    return await Promise.race([request(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
};

const unauthorizedListeners = new Set<() => void>();

export const subscribeApiUnauthorized = (
  listener: () => void
): (() => void) => {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
};

const publishApiUnauthorized = (): void => {
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Authentication observers cannot alter response decoding.
    }
  });
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

const readBoundedResponseBytes = async (
  response: Response,
  maximum: number
): Promise<Uint8Array> => {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new TypeError('API response budget must be a positive safe integer.');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        const contents = new Uint8Array(total);
        let offset = 0;
        for (const value of chunks) {
          contents.set(value, offset);
          offset += value.byteLength;
        }
        return contents;
      }
      total += chunk.value.byteLength;
      if (total > maximum)
        throw new TypeError('API response exceeds its byte budget.');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

const parseResponsePayload = async (
  response: Response,
  maximum?: number
): Promise<unknown> => {
  const contentType = response.headers.get('content-type') || '';
  const source =
    maximum === undefined
      ? await response.text()
      : new TextDecoder().decode(
          await readBoundedResponseBytes(response, maximum)
        );
  if (!source) return undefined;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(source) as unknown;
    } catch (caught) {
      if (!response.ok) return source;
      throw new TypeError('API response contains invalid JSON.', {
        cause: caught,
      });
    }
  }
  return source;
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
  const {
    headers,
    defaultHeaders,
    token,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
    maxResponseBytes,
    ...requestInit
  } = options;
  return withRequestDeadline(requestInit.signal, timeoutMs, async (signal) => {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...requestInit,
      signal,
      headers: createHeaders({ defaultHeaders, headers, token }),
    });
    if (response.status === 401 && token) publishApiUnauthorized();

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await parseResponsePayload(response, maxResponseBytes);
    if (!response.ok) {
      throw toApiError(payload, response);
    }

    return payload as T;
  });
};

export const apiBinaryRequest = async (
  path: string,
  options: ApiRequestOptions = {}
): Promise<Readonly<{ contents: Uint8Array; mediaType: string }>> => {
  const {
    headers,
    defaultHeaders,
    token,
    timeoutMs = API_REQUEST_TIMEOUT_MS,
    maxResponseBytes,
    ...requestInit
  } = options;
  return withRequestDeadline(requestInit.signal, timeoutMs, async (signal) => {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...requestInit,
      signal,
      headers: createHeaders({ defaultHeaders, headers, token }),
    });
    if (response.status === 401 && token) publishApiUnauthorized();
    if (!response.ok) {
      const payload = await parseResponsePayload(response, maxResponseBytes);
      throw toApiError(payload, response);
    }
    const contentType = response.headers.get('content-type');
    const mediaType = contentType?.split(';', 1)[0]?.trim();
    if (!mediaType) {
      throw new TypeError('Binary API response is missing its media type.');
    }
    return Object.freeze({
      contents:
        maxResponseBytes === undefined
          ? new Uint8Array(await response.arrayBuffer())
          : await readBoundedResponseBytes(response, maxResponseBytes),
      mediaType,
    });
  });
};

export const isAbortError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
