import {
  EXECUTION_DATA_STREAM_BRIDGE_LIMITS,
  readExecutionDataStreamBridgeMessage,
  type ExecutionDataStreamBridgeMessage,
  type ExecutionDataStreamInvocation,
} from '@prodivix/runtime-core';
import {
  isRemoteDataGatewaySafeErrorCode,
  RemoteDataGatewayError,
} from './remoteDataGatewayClient';

const maximumStreamBytes = 4 * 1024 * 1024;
const maximumFailureBytes = 64 * 1024;
const maximumReconnectAttempts = 4;
const maximumReconnectDelayMs = 30_000;
const maximumStreamRecords =
  EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxEvents +
  2 +
  maximumReconnectAttempts * 2;

export type RemoteDataStreamFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type RemoteDataStreamGatewaySession = Readonly<{
  network: Extract<
    ExecutionDataStreamBridgeMessage,
    { phase: 'open' }
  >['network'];
  next(): Promise<
    Extract<ExecutionDataStreamBridgeMessage, { phase: 'event' }> | undefined
  >;
  subscribeNetwork(
    listener: (
      network: Extract<
        ExecutionDataStreamBridgeMessage,
        { phase: 'open' }
      >['network']
    ) => void
  ): () => void;
  close(): void;
}>;

export type RemoteDataStreamGatewayClient = Readonly<{
  open(
    executionId: string,
    invocation: ExecutionDataStreamInvocation,
    signal?: AbortSignal
  ): Promise<RemoteDataStreamGatewaySession>;
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

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const readFailure = async (
  response: Response
): Promise<Readonly<{ code: string; retryable: boolean }> | undefined> => {
  if (
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return undefined;
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength &&
    (!/^\d+$/u.test(declaredLength) ||
      Number(declaredLength) > maximumFailureBytes)
  ) {
    await response.body?.cancel().catch(() => undefined);
    return undefined;
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const current = await reader.read();
      if (current.done) break;
      total += current.value.byteLength;
      if (total > maximumFailureBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(current.value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return undefined;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const decoded = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    ) as unknown;
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      return undefined;
    const error = (decoded as { error?: unknown }).error;
    if (!error || typeof error !== 'object' || Array.isArray(error))
      return undefined;
    const record = error as { code?: unknown; retryable?: unknown };
    return isRemoteDataGatewaySafeErrorCode(record.code) &&
      typeof record.retryable === 'boolean'
      ? Object.freeze({ code: record.code, retryable: record.retryable })
      : undefined;
  } catch {
    return undefined;
  }
};

const readNdjsonRecords = (
  response: Response,
  budget: { totalBytes: number; records: number }
): AsyncGenerator<unknown, void, undefined> => {
  const body = response.body;
  if (!body) throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffered = '';
  const parseLine = (line: string): unknown => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (
      !normalized ||
      byteLength(normalized) > EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxEventBytes
    )
      throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
    budget.records += 1;
    if (budget.records > maximumStreamRecords)
      throw new RemoteDataGatewayError('DATA_STREAM_CAPACITY');
    try {
      return JSON.parse(normalized) as unknown;
    } catch {
      throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
    }
  };
  return (async function* () {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        budget.totalBytes += result.value.byteLength;
        if (budget.totalBytes > maximumStreamBytes)
          throw new RemoteDataGatewayError('DATA_STREAM_CAPACITY');
        buffered += decoder.decode(result.value, { stream: true });
        let newline = buffered.indexOf('\n');
        while (newline >= 0) {
          const line = buffered.slice(0, newline);
          buffered = buffered.slice(newline + 1);
          if (line.length) yield parseLine(line);
          newline = buffered.indexOf('\n');
        }
        if (
          byteLength(buffered) >
          EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxEventBytes
        )
          throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
      }
      buffered += decoder.decode();
      if (buffered.length) yield parseLine(buffered);
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error instanceof RemoteDataGatewayError
        ? error
        : new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_UNAVAILABLE', true);
    } finally {
      reader.releaseLock();
    }
  })();
};

const retryableStreamCode = (code: string): boolean =>
  code === 'DATA_GRAPHQL_REQUEST_FAILED' ||
  code === 'DATA_ASYNCAPI_REQUEST_FAILED';

type RemoteDataStreamReconnectPolicy = Readonly<{
  resume: 'sse-last-event-id';
  maxReconnectAttempts: number;
  backoff: 'fixed' | 'exponential';
  initialDelayMs: number;
  maxDelayMs?: number;
}>;

type RemoteDataStreamResume = Readonly<{ cursor: number; token: string }>;

type RemoteDataStreamConnection = Readonly<{
  iterator: AsyncIterator<unknown>;
  network: RemoteDataStreamGatewaySession['network'];
  reconnect?: RemoteDataStreamReconnectPolicy;
}>;

const closeIterator = async (
  iterator: AsyncIterator<unknown>
): Promise<void> => {
  try {
    await iterator.return?.();
  } catch {
    // A transport teardown failure cannot replace the boundary result.
  }
};

const readReconnectPolicy = (
  value: unknown
): RemoteDataStreamReconnectPolicy | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'resume',
    'maxReconnectAttempts',
    'backoff',
    'initialDelayMs',
    'maxDelayMs',
  ]);
  if (
    !Object.keys(record).every((key) => allowed.has(key)) ||
    !['resume', 'maxReconnectAttempts', 'backoff', 'initialDelayMs'].every(
      (key) => Object.hasOwn(record, key)
    ) ||
    record.resume !== 'sse-last-event-id' ||
    (record.backoff !== 'fixed' && record.backoff !== 'exponential') ||
    !Number.isSafeInteger(record.maxReconnectAttempts) ||
    Number(record.maxReconnectAttempts) < 1 ||
    Number(record.maxReconnectAttempts) > maximumReconnectAttempts ||
    !Number.isSafeInteger(record.initialDelayMs) ||
    Number(record.initialDelayMs) < 0 ||
    Number(record.initialDelayMs) > maximumReconnectDelayMs ||
    (record.maxDelayMs !== undefined &&
      (!Number.isSafeInteger(record.maxDelayMs) ||
        Number(record.maxDelayMs) < Number(record.initialDelayMs) ||
        Number(record.maxDelayMs) > maximumReconnectDelayMs))
  )
    return undefined;
  return Object.freeze({
    resume: 'sse-last-event-id',
    maxReconnectAttempts: Number(record.maxReconnectAttempts),
    backoff: record.backoff,
    initialDelayMs: Number(record.initialDelayMs),
    ...(record.maxDelayMs === undefined
      ? {}
      : { maxDelayMs: Number(record.maxDelayMs) }),
  });
};

const readResume = (
  value: unknown,
  cursor: number
): RemoteDataStreamResume | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 &&
    Object.hasOwn(record, 'cursor') &&
    Object.hasOwn(record, 'token') &&
    record.cursor === cursor &&
    typeof record.token === 'string' &&
    record.token.length > 0 &&
    record.token.length <= 4_096 &&
    !record.token.includes('\0')
    ? Object.freeze({ cursor, token: record.token })
    : undefined;
};

const reconnectDelay = (
  policy: RemoteDataStreamReconnectPolicy,
  attempt: number
): number => {
  const multiplier =
    policy.backoff === 'exponential' ? 2 ** Math.max(0, attempt - 1) : 1;
  return Math.min(
    policy.initialDelayMs * multiplier,
    policy.maxDelayMs ?? maximumReconnectDelayMs
  );
};

const waitForReconnect = (
  durationMs: number,
  signal: AbortSignal
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(
        new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_UNAVAILABLE', true)
      );
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(
        new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_UNAVAILABLE', true)
      );
    };
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });

/** Opens and transparently resumes the Backend NDJSON stream while keeping checkpoints and credentials out of the iframe. */
export const createRemoteDataStreamGatewayClient = (options: {
  baseUrl: string;
  accessToken: string | (() => string | Promise<string>);
  fetcher?: RemoteDataStreamFetch;
  wait?: (durationMs: number, signal: AbortSignal) => Promise<void>;
}): RemoteDataStreamGatewayClient => {
  const baseUrl = new URL(options.baseUrl);
  const fetcher = options.fetcher ?? globalThis.fetch;
  const wait = options.wait ?? waitForReconnect;
  const staticAccessToken =
    typeof options.accessToken === 'string'
      ? options.accessToken.trim()
      : undefined;
  if (staticAccessToken !== undefined && !staticAccessToken)
    throw new TypeError('Remote Data stream gateway requires authentication.');
  if (
    (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  )
    throw new TypeError('Remote Data stream gateway base URL is unsafe.');
  const resolveAccessToken = async (): Promise<string> => {
    const value =
      staticAccessToken ??
      String(await (options.accessToken as () => string | Promise<string>)());
    const token = value.trim();
    if (!token || token.includes('\0'))
      throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_UNAVAILABLE', true);
    return token;
  };
  return Object.freeze({
    async open(executionId, invocation, signal) {
      const execution = identifier(executionId, 'Remote execution id');
      const abort = new AbortController();
      const forwardAbort = () => abort.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      if (signal?.aborted) {
        signal.removeEventListener('abort', forwardAbort);
        throw new RemoteDataGatewayError(
          'DATA_REMOTE_GATEWAY_UNAVAILABLE',
          true
        );
      }
      const path = `${baseUrl.pathname.replace(/\/$/u, '')}/remote-executions/${encodeURIComponent(execution)}/data-sources/${encodeURIComponent(invocation.documentId)}/operations/${encodeURIComponent(invocation.operationId)}/stream`;
      const budget = { totalBytes: 0, records: 0 };
      const openConnection = async (
        resume?: RemoteDataStreamResume
      ): Promise<RemoteDataStreamConnection> => {
        let response: Response;
        try {
          const accessToken = await resolveAccessToken();
          response = await fetcher(new URL(path, baseUrl.origin), {
            method: 'POST',
            headers: {
              accept: 'application/x-ndjson',
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              invocationId: invocation.invocationId,
              sequence: invocation.sequence,
              attempt: invocation.attempt,
              input: invocation.input,
              ...(resume ? { resume } : {}),
            }),
            signal: abort.signal,
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
          });
        } catch (error) {
          if (error instanceof RemoteDataGatewayError) throw error;
          throw new RemoteDataGatewayError(
            'DATA_REMOTE_GATEWAY_UNAVAILABLE',
            true
          );
        }
        if (response.status !== 200) {
          const failure = await readFailure(response);
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
          !response.headers
            .get('content-type')
            ?.toLowerCase()
            .startsWith('application/x-ndjson')
        ) {
          await response.body?.cancel().catch(() => undefined);
          throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
        }
        const declaredLength = response.headers.get('content-length');
        if (
          declaredLength &&
          (!/^\d+$/u.test(declaredLength) ||
            Number(declaredLength) > maximumStreamBytes)
        ) {
          await response.body?.cancel().catch(() => undefined);
          throw new RemoteDataGatewayError('DATA_STREAM_CAPACITY');
        }
        const iterator = readNdjsonRecords(response, budget)[
          Symbol.asyncIterator
        ]();
        let first: IteratorResult<unknown>;
        try {
          first = await iterator.next();
        } catch (error) {
          await closeIterator(iterator);
          throw error instanceof RemoteDataGatewayError
            ? error
            : new RemoteDataGatewayError(
                'DATA_REMOTE_GATEWAY_UNAVAILABLE',
                true
              );
        }
        if (
          first.done ||
          !first.value ||
          typeof first.value !== 'object' ||
          Array.isArray(first.value)
        ) {
          await closeIterator(iterator);
          throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
        }
        const raw = first.value as Record<string, unknown>;
        const keys = Object.keys(raw);
        if (
          !keys.every((key) =>
            ['type', 'phase', 'network', 'reconnect'].includes(key)
          ) ||
          !['type', 'phase', 'network'].every((key) => Object.hasOwn(raw, key))
        ) {
          await closeIterator(iterator);
          throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
        }
        const open = readExecutionDataStreamBridgeMessage(
          {
            type: raw.type,
            phase: raw.phase,
            network: raw.network,
            requestId: invocation.requestId,
          },
          invocation,
          0
        );
        const reconnect =
          raw.reconnect === undefined
            ? undefined
            : readReconnectPolicy(raw.reconnect);
        if (
          !open ||
          open.phase !== 'open' ||
          (raw.reconnect !== undefined && !reconnect)
        ) {
          await closeIterator(iterator);
          throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
        }
        return Object.freeze({
          iterator,
          network: open.network,
          ...(reconnect ? { reconnect } : {}),
        });
      };

      let connection: RemoteDataStreamConnection;
      try {
        connection = await openConnection();
      } catch (error) {
        signal?.removeEventListener('abort', forwardAbort);
        abort.abort();
        throw error;
      }
      const initialNetwork = connection.network;
      const reconnectPolicy = connection.reconnect;
      const networkListeners = new Set<
        (network: RemoteDataStreamGatewaySession['network']) => void
      >();
      let reconnectAttempts = 0;
      let checkpoint: RemoteDataStreamResume | undefined;
      let cursor = 0;
      let pending = false;
      let terminal = false;
      const closeConnection = async (): Promise<void> => {
        await closeIterator(connection.iterator);
      };
      const terminate = (): void => {
        if (terminal) return;
        terminal = true;
        abort.abort();
        signal?.removeEventListener('abort', forwardAbort);
        void closeConnection();
      };
      const reconnect = async (error: unknown): Promise<boolean> => {
        let failure =
          error instanceof RemoteDataGatewayError
            ? error
            : new RemoteDataGatewayError(
                'DATA_REMOTE_GATEWAY_UNAVAILABLE',
                true
              );
        while (
          !terminal &&
          !abort.signal.aborted &&
          failure.retryable &&
          reconnectPolicy &&
          checkpoint &&
          reconnectAttempts < reconnectPolicy.maxReconnectAttempts
        ) {
          reconnectAttempts += 1;
          await closeConnection();
          try {
            await wait(
              reconnectDelay(reconnectPolicy, reconnectAttempts),
              abort.signal
            );
            const next = await openConnection(checkpoint);
            if (
              JSON.stringify(next.reconnect) !== JSON.stringify(reconnectPolicy)
            ) {
              await closeIterator(next.iterator);
              throw new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
            }
            connection = next;
            networkListeners.forEach((listener) => {
              try {
                listener(next.network);
              } catch {
                // A product projection consumer cannot break stream recovery.
              }
            });
            return true;
          } catch (nextError) {
            failure =
              nextError instanceof RemoteDataGatewayError
                ? nextError
                : new RemoteDataGatewayError(
                    'DATA_REMOTE_GATEWAY_UNAVAILABLE',
                    true
                  );
          }
        }
        return false;
      };
      return Object.freeze({
        network: initialNetwork,
        subscribeNetwork(listener) {
          if (terminal) return () => undefined;
          networkListeners.add(listener);
          return () => networkListeners.delete(listener);
        },
        async next() {
          if (terminal) return undefined;
          if (pending) throw new RemoteDataGatewayError('DATA_STREAM_CONFLICT');
          pending = true;
          try {
            while (!terminal) {
              try {
                const result = await connection.iterator.next();
                if (result.done)
                  throw new RemoteDataGatewayError(
                    'DATA_REMOTE_GATEWAY_UNAVAILABLE',
                    true
                  );
                if (
                  !result.value ||
                  typeof result.value !== 'object' ||
                  Array.isArray(result.value)
                )
                  throw new RemoteDataGatewayError(
                    'DATA_REMOTE_GATEWAY_INVALID'
                  );
                const raw = result.value as Record<string, unknown>;
                if (raw.phase === 'event') {
                  const keys = Object.keys(raw);
                  if (
                    !keys.every((key) =>
                      ['type', 'phase', 'cursor', 'value', 'resume'].includes(
                        key
                      )
                    ) ||
                    !['type', 'phase', 'cursor', 'value'].every((key) =>
                      Object.hasOwn(raw, key)
                    )
                  )
                    throw new RemoteDataGatewayError(
                      'DATA_REMOTE_GATEWAY_INVALID'
                    );
                  const message = readExecutionDataStreamBridgeMessage(
                    {
                      type: raw.type,
                      requestId: invocation.requestId,
                      phase: raw.phase,
                      cursor: raw.cursor,
                      value: raw.value,
                    },
                    invocation,
                    cursor
                  );
                  const resume =
                    typeof raw.cursor === 'number'
                      ? readResume(raw.resume, raw.cursor)
                      : undefined;
                  if (
                    !message ||
                    message.phase !== 'event' ||
                    (reconnectPolicy ? !resume : raw.resume !== undefined)
                  )
                    throw new RemoteDataGatewayError(
                      'DATA_REMOTE_GATEWAY_INVALID'
                    );
                  cursor = message.cursor;
                  if (resume) checkpoint = resume;
                  return message;
                }
                const message = readExecutionDataStreamBridgeMessage(
                  {
                    ...raw,
                    requestId: invocation.requestId,
                    ...(raw.phase === 'error'
                      ? { retryable: retryableStreamCode(String(raw.code)) }
                      : {}),
                  },
                  invocation,
                  cursor
                );
                if (!message)
                  throw new RemoteDataGatewayError(
                    'DATA_REMOTE_GATEWAY_INVALID'
                  );
                if (message.phase === 'complete') {
                  terminate();
                  return undefined;
                }
                if (message.phase !== 'error')
                  throw new RemoteDataGatewayError(
                    'DATA_REMOTE_GATEWAY_INVALID'
                  );
                const failure = new RemoteDataGatewayError(
                  isRemoteDataGatewaySafeErrorCode(message.code)
                    ? message.code
                    : 'DATA_REMOTE_GATEWAY_INVALID',
                  message.retryable
                );
                throw failure;
              } catch (error) {
                if (await reconnect(error)) continue;
                throw error;
              }
            }
            return undefined;
          } catch (error) {
            terminate();
            throw error instanceof RemoteDataGatewayError
              ? error
              : new RemoteDataGatewayError('DATA_REMOTE_GATEWAY_INVALID');
          } finally {
            pending = false;
          }
        },
        close: terminate,
      });
    },
  });
};
