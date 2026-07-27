import {
  normalizeExecutionSourceTraces,
  type ExecutionEnvironmentResolutionLease,
  type ExecutionNetworkTrace,
} from '@prodivix/runtime-core';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { DataJsonValue, DataSourceDocument } from './data.types';
import {
  resolveDataOperationEnvironment,
  type DataOperationEnvironmentResolution,
} from './dataEnvironmentRuntime';
import { cloneDataJsonValue } from './dataJsonRuntime';
import {
  createDataNetworkCorrelation,
  type DataOperationAbortSignal,
  type DataOperationAdapterRegistry,
  type DataOperationInvocation,
} from './dataRuntime';
import {
  defaultDataSchemaValidator,
  type DataSchemaValidator,
} from './dataSchemaValidator';

export const DATA_STREAM_LIMITS = Object.freeze({
  maxEvents: 256,
  maxRetainedEvents: 64,
  maxEventBytes: 256 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
  maxDurationMs: 5 * 60_000,
  idleTimeoutMs: 30_000,
} as const);

export const DATA_STREAM_ERROR_CODES = Object.freeze({
  operationRequired: 'DATA_STREAM_OPERATION_REQUIRED',
  adapterUnavailable: 'DATA_STREAM_ADAPTER_UNAVAILABLE',
  concurrentRead: 'DATA_STREAM_CONCURRENT_READ',
  aborted: 'DATA_STREAM_ABORTED',
  idleTimeout: 'DATA_STREAM_IDLE_TIMEOUT',
  durationExceeded: 'DATA_STREAM_DURATION_EXCEEDED',
  eventLimitExceeded: 'DATA_STREAM_EVENT_LIMIT_EXCEEDED',
  byteLimitExceeded: 'DATA_STREAM_BYTE_LIMIT_EXCEEDED',
  eventTooLarge: 'DATA_STREAM_EVENT_TOO_LARGE',
  inputInvalid: 'DATA_STREAM_INPUT_INVALID',
  outputInvalid: 'DATA_STREAM_OUTPUT_INVALID',
  networkTraceDrift: 'DATA_STREAM_NETWORK_TRACE_DRIFT',
} as const);

export type DataStreamErrorCode =
  (typeof DATA_STREAM_ERROR_CODES)[keyof typeof DATA_STREAM_ERROR_CODES];

export class DataStreamError extends Error {
  readonly code: DataStreamErrorCode;
  readonly retryable: boolean;

  constructor(code: DataStreamErrorCode, retryable = false) {
    super('Data stream session failed.');
    this.name = 'DataStreamError';
    this.code = code;
    this.retryable = retryable;
  }
}

export type DataStreamEvent = Readonly<{
  cursor: number;
  receivedAt: number;
  value: DataJsonValue;
  byteLength: number;
}>;

export type DataStreamTerminalReason =
  | 'upstream-complete'
  | 'consumer-closed'
  | 'aborted'
  | 'budget-exhausted'
  | 'failed';

export type DataStreamSessionSnapshot = Readonly<{
  sessionId: string;
  operation: DataOperationInvocation['operation'];
  status: 'opening' | 'open' | 'closed' | 'error';
  openedAt: number;
  cursor: number;
  eventCount: number;
  totalBytes: number;
  retainedEvents: readonly DataStreamEvent[];
  droppedEvents: number;
  terminalReason?: DataStreamTerminalReason;
  errorCode?: DataStreamErrorCode;
}>;

export type DataStreamSession = Readonly<{
  getSnapshot(): DataStreamSessionSnapshot;
  subscribe(listener: () => void): () => void;
  next(): Promise<DataStreamEvent | undefined>;
  close(reason?: 'consumer-closed' | 'aborted'): Promise<void>;
}>;

export type OpenDataOperationStreamInput = Readonly<{
  registry: DataOperationAdapterRegistry;
  invocation: DataOperationInvocation;
  document: DataSourceDocument;
  signal: DataOperationAbortSignal;
  environmentResolution?: DataOperationEnvironmentResolution;
  schemaValidator?: DataSchemaValidator;
  now?: () => number;
  setTimeout?(handler: () => void, timeoutMs: number): unknown;
  clearTimeout?(handle: unknown): void;
  publishNetworkTrace?(trace: ExecutionNetworkTrace): void;
}>;

const byteLength = (value: DataJsonValue): number =>
  utf8ToBytes(JSON.stringify(value)).byteLength;

const timerHost = globalThis as unknown as Readonly<{
  setTimeout(handler: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

/**
 * Opens one pull-driven, execution-local stream. The wrapper owns backpressure,
 * byte/event/duration budgets, schema validation, abort, and environment lease
 * revocation; protocol adapters only own transport semantics.
 */
export const openDataOperationStream = async (
  input: OpenDataOperationStreamInput
): Promise<DataStreamSession> => {
  const operation =
    input.document.operationsById[input.invocation.operation.operationId];
  if (!operation || operation.kind !== 'subscription')
    throw new DataStreamError(DATA_STREAM_ERROR_CODES.operationRequired);
  if (input.document.source.runtimeZone !== input.invocation.runtimeZone)
    throw new DataStreamError(DATA_STREAM_ERROR_CODES.operationRequired);
  const adapter = input.registry.resolve(
    input.document.source.adapterId,
    input.invocation,
    operation
  );
  if (
    !adapter.openStream ||
    !adapter.descriptor.capabilities.includes('stream')
  )
    throw new DataStreamError(DATA_STREAM_ERROR_CODES.adapterUnavailable);
  const validator = input.schemaValidator ?? defaultDataSchemaValidator;
  if (operation.inputSchemaId) {
    const schema = input.document.schemasById[operation.inputSchemaId];
    if (
      !schema ||
      !validator.validate(schema.schema, input.invocation.input).valid
    )
      throw new DataStreamError(DATA_STREAM_ERROR_CODES.inputInvalid);
  }
  const expectedCorrelation = createDataNetworkCorrelation(input.invocation);
  const expectedSourceTrace = normalizeExecutionSourceTraces(
    input.invocation.sourceTrace
  );
  const environment: ExecutionEnvironmentResolutionLease | undefined =
    await resolveDataOperationEnvironment({
      invocation: input.invocation,
      source: input.document.source,
      operation,
      resolution: input.environmentResolution,
    });
  let protocolStream: Awaited<
    ReturnType<NonNullable<typeof adapter.openStream>>
  >;
  let rejectedNetworkTrace: DataStreamError | undefined;
  try {
    protocolStream = await adapter.openStream({
      invocation: input.invocation,
      source: input.document.source,
      operation,
      ...(environment ? { environment } : {}),
      signal: input.signal,
      publishNetworkTrace(trace) {
        const correlation = trace.correlation;
        let sourceTraceMatches = false;
        try {
          sourceTraceMatches =
            JSON.stringify(
              normalizeExecutionSourceTraces(trace.sourceTrace) ?? []
            ) === JSON.stringify(expectedSourceTrace ?? []);
        } catch {
          sourceTraceMatches = false;
        }
        if (
          !correlation ||
          correlation.kind !== expectedCorrelation.kind ||
          correlation.documentId !== expectedCorrelation.documentId ||
          correlation.operationId !== expectedCorrelation.operationId ||
          correlation.invocationId !== expectedCorrelation.invocationId ||
          correlation.sequence !== expectedCorrelation.sequence ||
          correlation.attempt !== expectedCorrelation.attempt ||
          trace.runtimeZone !== input.invocation.runtimeZone ||
          trace.mode !== input.invocation.mode ||
          trace.phase !== 'runtime' ||
          trace.adapter !== input.document.source.adapterId ||
          !sourceTraceMatches
        ) {
          rejectedNetworkTrace ??= new DataStreamError(
            DATA_STREAM_ERROR_CODES.networkTraceDrift
          );
          return;
        }
        input.publishNetworkTrace?.(trace);
      },
    });
    if (rejectedNetworkTrace) {
      try {
        await protocolStream.close('failed');
      } catch {
        // A rejected trace still owns best-effort transport cleanup.
      }
      throw rejectedNetworkTrace;
    }
  } catch (error) {
    try {
      environment?.revoke();
    } catch {
      // Lease cleanup cannot replace the protocol or trace boundary error.
    }
    throw error;
  }
  const iterator = protocolStream.events[Symbol.asyncIterator]();
  const now = input.now ?? Date.now;
  const setTimer = input.setTimeout ?? timerHost.setTimeout.bind(timerHost);
  const clearTimer =
    input.clearTimeout ?? timerHost.clearTimeout.bind(timerHost);
  const openedAt = now();
  let snapshot: DataStreamSessionSnapshot = Object.freeze({
    sessionId: input.invocation.invocationId,
    operation: input.invocation.operation,
    status: 'open',
    openedAt,
    cursor: 0,
    eventCount: 0,
    totalBytes: 0,
    retainedEvents: Object.freeze([]),
    droppedEvents: 0,
  });
  const listeners = new Set<() => void>();
  let pending = false;
  let terminal = false;
  const publish = () => listeners.forEach((listener) => listener());
  const terminate = async (
    reason: DataStreamTerminalReason,
    errorCode?: DataStreamErrorCode
  ): Promise<void> => {
    if (terminal) return;
    terminal = true;
    input.signal.removeEventListener('abort', abort);
    snapshot = Object.freeze({
      ...snapshot,
      status: errorCode ? 'error' : 'closed',
      terminalReason: reason,
      ...(errorCode ? { errorCode } : {}),
    });
    publish();
    try {
      await protocolStream.close(reason);
    } catch {
      // Transport cleanup is best-effort after the terminal state is fenced.
    }
    try {
      await iterator.return?.();
    } catch {
      // Iterator cleanup is best-effort after the transport has been closed.
    }
    try {
      environment?.revoke();
    } catch {
      // Lease revocation failure cannot reopen a fenced stream session.
    }
  };
  const fail = async (
    code: DataStreamErrorCode,
    reason: DataStreamTerminalReason = 'failed'
  ): Promise<never> => {
    await terminate(reason, code);
    throw new DataStreamError(
      code,
      code === DATA_STREAM_ERROR_CODES.idleTimeout
    );
  };
  const abort = () =>
    void terminate('aborted', DATA_STREAM_ERROR_CODES.aborted);
  input.signal.addEventListener('abort', abort, { once: true });

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async next() {
      if (terminal) return undefined;
      if (input.signal.aborted)
        return fail(DATA_STREAM_ERROR_CODES.aborted, 'aborted');
      if (pending)
        throw new DataStreamError(DATA_STREAM_ERROR_CODES.concurrentRead);
      const remainingDuration =
        DATA_STREAM_LIMITS.maxDurationMs - (now() - openedAt);
      if (remainingDuration <= 0)
        return fail(
          DATA_STREAM_ERROR_CODES.durationExceeded,
          'budget-exhausted'
        );
      pending = true;
      let timeout: unknown;
      const timeoutCode =
        remainingDuration <= DATA_STREAM_LIMITS.idleTimeoutMs
          ? DATA_STREAM_ERROR_CODES.durationExceeded
          : DATA_STREAM_ERROR_CODES.idleTimeout;
      try {
        const result = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) => {
            timeout = setTimer(
              () =>
                reject(
                  new DataStreamError(
                    timeoutCode,
                    timeoutCode === DATA_STREAM_ERROR_CODES.idleTimeout
                  )
                ),
              Math.min(DATA_STREAM_LIMITS.idleTimeoutMs, remainingDuration)
            );
          }),
        ]);
        if (terminal) {
          if (snapshot.errorCode)
            throw new DataStreamError(
              snapshot.errorCode,
              snapshot.errorCode === DATA_STREAM_ERROR_CODES.idleTimeout
            );
          return undefined;
        }
        if (result.done) {
          await terminate('upstream-complete');
          return undefined;
        }
        if (snapshot.eventCount >= DATA_STREAM_LIMITS.maxEvents)
          return fail(
            DATA_STREAM_ERROR_CODES.eventLimitExceeded,
            'budget-exhausted'
          );
        const value = cloneDataJsonValue(result.value);
        const eventBytes = byteLength(value);
        if (eventBytes > DATA_STREAM_LIMITS.maxEventBytes)
          return fail(
            DATA_STREAM_ERROR_CODES.eventTooLarge,
            'budget-exhausted'
          );
        if (snapshot.totalBytes + eventBytes > DATA_STREAM_LIMITS.maxTotalBytes)
          return fail(
            DATA_STREAM_ERROR_CODES.byteLimitExceeded,
            'budget-exhausted'
          );
        const schema = input.document.schemasById[operation.outputSchemaId];
        if (!schema || !validator.validate(schema.schema, value).valid)
          return fail(DATA_STREAM_ERROR_CODES.outputInvalid);
        const event = Object.freeze({
          cursor: snapshot.cursor + 1,
          receivedAt: now(),
          value,
          byteLength: eventBytes,
        });
        const retainedEvents = [...snapshot.retainedEvents, event].slice(
          -DATA_STREAM_LIMITS.maxRetainedEvents
        );
        const eventCount = snapshot.eventCount + 1;
        snapshot = Object.freeze({
          ...snapshot,
          cursor: event.cursor,
          eventCount,
          totalBytes: snapshot.totalBytes + eventBytes,
          retainedEvents: Object.freeze(retainedEvents),
          droppedEvents: eventCount - retainedEvents.length,
        });
        publish();
        return event;
      } catch (error) {
        if (input.signal.aborted)
          return fail(DATA_STREAM_ERROR_CODES.aborted, 'aborted');
        if (error instanceof DataStreamError) {
          const reason: DataStreamTerminalReason =
            error.code === DATA_STREAM_ERROR_CODES.durationExceeded ||
            error.code === DATA_STREAM_ERROR_CODES.eventLimitExceeded ||
            error.code === DATA_STREAM_ERROR_CODES.byteLimitExceeded ||
            error.code === DATA_STREAM_ERROR_CODES.eventTooLarge
              ? 'budget-exhausted'
              : 'failed';
          return fail(error.code, reason);
        }
        await terminate('failed', DATA_STREAM_ERROR_CODES.adapterUnavailable);
        throw error;
      } finally {
        if (timeout !== undefined) clearTimer(timeout);
        pending = false;
      }
    },
    async close(reason = 'consumer-closed') {
      input.signal.removeEventListener('abort', abort);
      await terminate(reason);
    },
  });
};
