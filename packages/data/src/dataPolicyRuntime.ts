import type {
  DataJsonValue,
  DataOperation,
  DataPageSnapshot,
  DataPaginationPolicy,
  DataRetryPolicy,
} from './data.types';
import { cloneDataJsonValue } from './dataJsonRuntime';
import type { DataOperationAbortSignal } from './dataRuntime';

export type DataOperationScheduler = Readonly<{
  wait(delayMs: number, signal: DataOperationAbortSignal): Promise<void>;
}>;

export const DATA_RETRY_RUNTIME_ERROR_CODES = Object.freeze({
  mutationReplayDenied: 'DATA_MUTATION_RETRY_UNSUPPORTED',
  policyBudgetExceeded: 'DATA_RETRY_POLICY_BUDGET_EXCEEDED',
  schedulerFailed: 'DATA_RETRY_SCHEDULER_FAILED',
} as const);

export type DataRetryRuntimeErrorCode =
  (typeof DATA_RETRY_RUNTIME_ERROR_CODES)[keyof typeof DATA_RETRY_RUNTIME_ERROR_CODES];

export class DataRetryRuntimeError extends Error {
  readonly code: DataRetryRuntimeErrorCode;
  readonly retryable = false;

  constructor(code: DataRetryRuntimeErrorCode) {
    super('Data operation retry policy was rejected.');
    this.name = 'DataRetryRuntimeError';
    this.code = code;
  }
}

export const DATA_PAGINATION_RUNTIME_ERROR_CODES = Object.freeze({
  inputInvalid: 'DATA_PAGINATION_INPUT_INVALID',
  pageMissing: 'DATA_PAGINATION_PAGE_MISSING',
  pageMismatch: 'DATA_PAGINATION_PAGE_MISMATCH',
  pageUndeclared: 'DATA_PAGINATION_PAGE_UNDECLARED',
} as const);

export type DataPaginationRuntimeErrorCode =
  (typeof DATA_PAGINATION_RUNTIME_ERROR_CODES)[keyof typeof DATA_PAGINATION_RUNTIME_ERROR_CODES];

export class DataPaginationRuntimeError extends Error {
  readonly code: DataPaginationRuntimeErrorCode;
  readonly retryable = false;

  constructor(code: DataPaginationRuntimeErrorCode) {
    super('Data operation pagination policy was rejected.');
    this.name = 'DataPaginationRuntimeError';
    this.code = code;
  }
}

const MAX_DATA_RETRY_ATTEMPTS = 10;
const MAX_DATA_RETRY_DELAY_MS = 5 * 60_000;

export const defaultDataOperationScheduler: DataOperationScheduler =
  Object.freeze({
    wait(delayMs, signal) {
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise((resolve, reject) => {
        const timers = globalThis as unknown as {
          setTimeout(callback: () => void, delay: number): unknown;
          clearTimeout(handle: unknown): void;
        };
        const onAbort = () => {
          timers.clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(signal.reason);
        };
        const timer = timers.setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  });

const paginationInputObject = (
  value: DataJsonValue
): Readonly<Record<string, DataJsonValue>> => {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.inputInvalid
    );
  return value as Readonly<Record<string, DataJsonValue>>;
};

const paginationInteger = (
  value: DataJsonValue | undefined,
  fallback: number,
  minimum: number,
  maximum?: number
): number => {
  const candidate = value === undefined ? fallback : value;
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    (maximum !== undefined && candidate > maximum)
  )
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.inputInvalid
    );
  return candidate;
};

/** Applies pagination defaults to one invocation input without mutating canonical or caller-owned values. */
export const applyDataPaginationInput = (
  value: DataJsonValue,
  policy: DataPaginationPolicy | undefined
): DataJsonValue => {
  if (!policy) return value;
  const input = paginationInputObject(value);
  if (
    policy.limitInput ===
    (policy.kind === 'offset' ? policy.offsetInput : policy.cursorInput)
  )
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.inputInvalid
    );
  const limit = paginationInteger(
    input[policy.limitInput],
    policy.defaultLimit,
    1,
    policy.maxLimit
  );
  if (policy.kind === 'offset') {
    const offset = paginationInteger(input[policy.offsetInput], 0, 0);
    return cloneDataJsonValue({
      ...input,
      [policy.offsetInput]: offset,
      [policy.limitInput]: limit,
    });
  }
  const cursor = input[policy.cursorInput];
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim())
  )
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.inputInvalid
    );
  return cloneDataJsonValue({
    ...input,
    [policy.limitInput]: limit,
  });
};

/** Verifies that adapter page facts match the declared policy and effective request input. */
export const validateDataPaginationPage = (
  page: DataPageSnapshot | undefined,
  policy: DataPaginationPolicy | undefined,
  effectiveInput: DataJsonValue
): void => {
  if (!policy) {
    if (page)
      throw new DataPaginationRuntimeError(
        DATA_PAGINATION_RUNTIME_ERROR_CODES.pageUndeclared
      );
    return;
  }
  if (!page)
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.pageMissing
    );
  if (page.kind !== policy.kind)
    throw new DataPaginationRuntimeError(
      DATA_PAGINATION_RUNTIME_ERROR_CODES.pageMismatch
    );
  if (policy.kind === 'offset' && page.kind === 'offset') {
    if (
      !Number.isSafeInteger(page.offset) ||
      page.offset < 0 ||
      !Number.isSafeInteger(page.limit) ||
      page.limit < 1 ||
      (page.total !== undefined &&
        (!Number.isSafeInteger(page.total) || page.total < 0)) ||
      typeof page.hasMore !== 'boolean'
    )
      throw new DataPaginationRuntimeError(
        DATA_PAGINATION_RUNTIME_ERROR_CODES.pageMismatch
      );
    const input = paginationInputObject(effectiveInput);
    const offset = paginationInteger(input[policy.offsetInput], 0, 0);
    const limit = paginationInteger(
      input[policy.limitInput],
      policy.defaultLimit,
      1,
      policy.maxLimit
    );
    if (
      page.offset !== offset ||
      page.limit !== limit ||
      (page.total !== undefined &&
        page.hasMore !== page.offset + page.limit < page.total)
    )
      throw new DataPaginationRuntimeError(
        DATA_PAGINATION_RUNTIME_ERROR_CODES.pageMismatch
      );
  }
  if (policy.kind === 'cursor' && page.kind === 'cursor') {
    const cursors = [page.nextCursor, page.previousCursor].filter(
      (cursor): cursor is string => cursor !== undefined
    );
    if (
      typeof page.hasMore !== 'boolean' ||
      cursors.some((cursor) => !cursor || cursor !== cursor.trim()) ||
      (page.hasMore && !page.nextCursor)
    )
      throw new DataPaginationRuntimeError(
        DATA_PAGINATION_RUNTIME_ERROR_CODES.pageMismatch
      );
  }
};

export const resolveDataRetryPolicy = (
  operation: DataOperation,
  initialAttempt: number
): DataRetryPolicy | undefined => {
  const policy = operation.policies.retry;
  if (!policy) return undefined;
  if (
    operation.kind === 'mutation' &&
    policy.maxAttempts > 1 &&
    operation.policies.idempotency?.kind !== 'invocation-key'
  )
    throw new DataRetryRuntimeError(
      DATA_RETRY_RUNTIME_ERROR_CODES.mutationReplayDenied
    );
  const maximumDelay =
    policy.maxDelayMs ??
    (policy.backoff === 'exponential' && policy.maxAttempts > 1
      ? policy.initialDelayMs * 2 ** (policy.maxAttempts - 2)
      : policy.initialDelayMs);
  if (
    policy.maxAttempts > MAX_DATA_RETRY_ATTEMPTS ||
    initialAttempt > policy.maxAttempts ||
    policy.initialDelayMs > MAX_DATA_RETRY_DELAY_MS ||
    !Number.isSafeInteger(maximumDelay) ||
    maximumDelay > MAX_DATA_RETRY_DELAY_MS
  )
    throw new DataRetryRuntimeError(
      DATA_RETRY_RUNTIME_ERROR_CODES.policyBudgetExceeded
    );
  return policy;
};

export const calculateDataRetryDelay = (
  policy: DataRetryPolicy,
  failedAttempt: number
): number => {
  const delay =
    policy.backoff === 'fixed'
      ? policy.initialDelayMs
      : policy.initialDelayMs * 2 ** Math.max(0, failedAttempt - 1);
  return Math.min(policy.maxDelayMs ?? delay, delay);
};
