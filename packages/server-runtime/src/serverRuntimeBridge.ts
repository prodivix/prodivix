import {
  cloneExecutionValue,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import type {
  ServerFunctionOutcome,
  ServerFunctionReference,
} from './serverRuntime.types';
import { SERVER_FUNCTION_MAX_ATTEMPTS } from './serverRuntime.types';

export const EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE =
  'prodivix.execution-server-function-gateway-request.v1' as const;
export const EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE =
  'prodivix.execution-server-function-gateway-response.v1' as const;
export const EXECUTION_SERVER_FUNCTION_BRIDGE_CANCEL_TYPE =
  'prodivix.execution-server-function-gateway-cancel.v1' as const;
export const SERVER_FUNCTION_BRIDGE_MAX_VALUE_BYTES = 1024 * 1024;
export const SERVER_FUNCTION_BRIDGE_MAX_VALUE_DEPTH = 64;
export const SERVER_FUNCTION_BRIDGE_MAX_VALUE_NODES = 65_536;

export type ExecutionServerFunctionBridgeRequest = Readonly<{
  type: typeof EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE;
  requestId: string;
  invocationId: string;
  attempt: number;
  functionRef: ServerFunctionReference;
  input: ExecutionValue;
}>;

export type ExecutionServerFunctionBridgeResponse =
  | Readonly<{
      type: typeof EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE;
      requestId: string;
      ok: true;
      result: ServerFunctionOutcome;
    }>
  | Readonly<{
      type: typeof EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE;
      requestId: string;
      ok: false;
      error: Readonly<{ code: string; retryable: boolean }>;
    }>;

export type ExecutionServerFunctionBridgeCancellation = Readonly<{
  type: typeof EXECUTION_SERVER_FUNCTION_BRIDGE_CANCEL_TYPE;
  requestId: string;
  invocationId: string;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
    ? record
    : undefined;
};

const identifier = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\0')
    ? value
    : undefined;

const redirectLocation = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2_048 &&
  value === value.trim() &&
  !value.includes('\0') &&
  value.startsWith('/') &&
  !value.startsWith('//')
    ? value
    : undefined;

const valueBytes = (value: ExecutionValue): number => {
  const json = JSON.stringify(value);
  let bytes = 0;
  for (let index = 0; index < json.length; index += 1) {
    const point = json.codePointAt(index)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (point > 0xffff) index += 1;
  }
  return bytes;
};

const bridgeValueWithinBudget = (
  value: ExecutionValue,
  depth: number,
  budget: { nodes: number }
): boolean => {
  if (depth > SERVER_FUNCTION_BRIDGE_MAX_VALUE_DEPTH) return false;
  budget.nodes += 1;
  if (budget.nodes > SERVER_FUNCTION_BRIDGE_MAX_VALUE_NODES) return false;
  if (Array.isArray(value)) {
    return value.every((entry) =>
      bridgeValueWithinBudget(entry, depth + 1, budget)
    );
  }
  if (value && typeof value === 'object') {
    return Object.values(value).every((entry) =>
      bridgeValueWithinBudget(entry, depth + 1, budget)
    );
  }
  return true;
};

const bridgeValue = (value: unknown): ExecutionValue | undefined => {
  try {
    const cloned = cloneExecutionValue(value as ExecutionValue);
    return valueBytes(cloned) <= SERVER_FUNCTION_BRIDGE_MAX_VALUE_BYTES &&
      bridgeValueWithinBudget(cloned, 0, { nodes: 0 })
      ? cloned
      : undefined;
  } catch {
    return undefined;
  }
};

const readFunctionRef = (
  value: unknown
): ServerFunctionReference | undefined => {
  const record = exactRecord(value, ['artifactId', 'exportName']);
  const artifactId = identifier(record?.artifactId);
  const exportName = identifier(record?.exportName);
  return record &&
    artifactId &&
    exportName &&
    artifactId.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(artifactId) &&
    exportName.length <= 256 &&
    /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)
    ? Object.freeze({ artifactId, exportName })
    : undefined;
};

const readOutcome = (value: unknown): ServerFunctionOutcome | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'value') {
    const record = exactRecord(value, ['kind', 'value']);
    const output = bridgeValue(record?.value);
    return record && output !== undefined
      ? Object.freeze({ kind: 'value' as const, value: output })
      : undefined;
  }
  if (kind === 'allow') {
    return exactRecord(value, ['kind'])
      ? Object.freeze({ kind: 'allow' as const })
      : undefined;
  }
  if (kind === 'deny') {
    const record = exactRecord(value, ['kind', 'code']);
    const code = identifier(record?.code);
    return record && code && /^[A-Z][A-Z0-9_-]{0,127}$/u.test(code)
      ? Object.freeze({ kind: 'deny' as const, code })
      : undefined;
  }
  if (kind === 'redirect') {
    const record = exactRecord(value, ['kind', 'location', 'status']);
    const location = redirectLocation(record?.location);
    const status = record?.status;
    return record &&
      location &&
      (status === 302 || status === 303 || status === 307 || status === 308)
      ? Object.freeze({ kind: 'redirect' as const, location, status })
      : undefined;
  }
  return undefined;
};

/** Strictly reads value-only invocation input from an untrusted preview frame. */
export const readExecutionServerFunctionBridgeRequest = (
  value: unknown
): ExecutionServerFunctionBridgeRequest | undefined => {
  const record = exactRecord(value, [
    'type',
    'requestId',
    'invocationId',
    'attempt',
    'functionRef',
    'input',
  ]);
  if (
    !record ||
    record.type !== EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE
  ) {
    return undefined;
  }
  const requestId = identifier(record.requestId);
  const invocationId = identifier(record.invocationId);
  const functionRef = readFunctionRef(record.functionRef);
  const input = bridgeValue(record.input);
  if (
    !requestId ||
    !invocationId ||
    !Number.isSafeInteger(record.attempt) ||
    (record.attempt as number) < 1 ||
    (record.attempt as number) > SERVER_FUNCTION_MAX_ATTEMPTS ||
    requestId !== `${invocationId}:${record.attempt as number}` ||
    !functionRef ||
    input === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
    requestId,
    invocationId,
    attempt: record.attempt as number,
    functionRef,
    input,
  });
};

/** Strictly reads cancellation for one already accepted bridge request. */
export const readExecutionServerFunctionBridgeCancellation = (
  value: unknown
): ExecutionServerFunctionBridgeCancellation | undefined => {
  const record = exactRecord(value, ['type', 'requestId', 'invocationId']);
  const requestId = identifier(record?.requestId);
  const invocationId = identifier(record?.invocationId);
  if (
    !record ||
    record.type !== EXECUTION_SERVER_FUNCTION_BRIDGE_CANCEL_TYPE ||
    !requestId ||
    !invocationId ||
    !requestId.startsWith(`${invocationId}:`)
  ) {
    return undefined;
  }
  const attempt = Number(requestId.slice(invocationId.length + 1));
  return Number.isSafeInteger(attempt) &&
    attempt >= 1 &&
    attempt <= SERVER_FUNCTION_MAX_ATTEMPTS &&
    requestId === `${invocationId}:${attempt}`
    ? Object.freeze({
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_CANCEL_TYPE,
        requestId,
        invocationId,
      })
    : undefined;
};

export const toExecutionServerFunctionBridgeSuccess = (
  requestId: string,
  result: ServerFunctionOutcome
): ExecutionServerFunctionBridgeResponse => {
  const normalizedRequestId = identifier(requestId);
  const normalizedResult = readOutcome(result);
  if (!normalizedRequestId || !normalizedResult) {
    throw new TypeError('Execution Server Function result is invalid.');
  }
  return Object.freeze({
    type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
    requestId: normalizedRequestId,
    ok: true,
    result: normalizedResult,
  });
};

export const toExecutionServerFunctionBridgeFailure = (
  requestId: string,
  code: string,
  retryable = false
): ExecutionServerFunctionBridgeResponse => {
  const normalizedRequestId = identifier(requestId);
  const normalizedCode = identifier(code);
  if (
    !normalizedRequestId ||
    !normalizedCode ||
    !/^[A-Z][A-Z0-9_-]{0,127}$/u.test(normalizedCode)
  ) {
    throw new TypeError('Execution Server Function failure is invalid.');
  }
  return Object.freeze({
    type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
    requestId: normalizedRequestId,
    ok: false,
    error: Object.freeze({ code: normalizedCode, retryable }),
  });
};

/** Strictly reads a parent response for the exact invocation request. */
export const readExecutionServerFunctionBridgeResponse = (
  value: unknown,
  request: Pick<ExecutionServerFunctionBridgeRequest, 'requestId'>
): ExecutionServerFunctionBridgeResponse | undefined => {
  const record = exactRecord(
    value,
    ['type', 'requestId', 'ok'],
    ['result', 'error']
  );
  if (
    !record ||
    record.type !== EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE ||
    record.requestId !== request.requestId
  ) {
    return undefined;
  }
  if (record.ok === true) {
    if (Object.hasOwn(record, 'error')) return undefined;
    const result = readOutcome(record.result);
    return result
      ? Object.freeze({
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
          requestId: request.requestId,
          ok: true,
          result,
        })
      : undefined;
  }
  if (record.ok !== false || Object.hasOwn(record, 'result')) return undefined;
  const error = exactRecord(record.error, ['code', 'retryable']);
  const code = identifier(error?.code);
  return error &&
    code &&
    /^[A-Z][A-Z0-9_-]{0,127}$/u.test(code) &&
    typeof error.retryable === 'boolean'
    ? Object.freeze({
        type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
        requestId: request.requestId,
        ok: false,
        error: Object.freeze({ code, retryable: error.retryable }),
      })
    : undefined;
};
