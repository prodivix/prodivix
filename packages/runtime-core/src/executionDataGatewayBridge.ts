import type { ExecutionValue } from './execution.types';
import { cloneExecutionValue } from './executionRequest';
import {
  readExecutionNetworkTraceValue,
  type ExecutionNetworkTrace,
} from './executionNetworkTrace';

export const EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE =
  'prodivix.execution-data-gateway-request.v1' as const;
export const EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE =
  'prodivix.execution-data-gateway-response.v1' as const;

const maximumBridgeValueBytes = 1024 * 1024;

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index)!;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
    if (codePoint > 0xffff) index += 1;
  }
  return bytes;
};

export type ExecutionDataGatewayInvocation = Readonly<{
  requestId: string;
  documentId: string;
  operationId: string;
  invocationId: string;
  sequence: number;
  attempt: number;
  input: ExecutionValue;
}>;

export type ExecutionDataGatewayBridgeRequest = ExecutionDataGatewayInvocation &
  Readonly<{
    type: typeof EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE;
  }>;

export type ExecutionDataGatewayResult = Readonly<{
  value: ExecutionValue;
  empty: boolean;
  network: ExecutionNetworkTrace;
}>;

export type ExecutionDataGatewayBridgeResponse =
  | Readonly<{
      type: typeof EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE;
      requestId: string;
      ok: true;
      result: ExecutionDataGatewayResult;
    }>
  | Readonly<{
      type: typeof EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE;
      requestId: string;
      ok: false;
      error: Readonly<{ code: string; retryable: boolean }>;
    }>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
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

const integer = (value: unknown, minimum: number): number | undefined =>
  Number.isSafeInteger(value) && (value as number) >= minimum
    ? (value as number)
    : undefined;

const bridgeValue = (value: unknown): ExecutionValue | undefined => {
  try {
    const cloned = cloneExecutionValue(value as ExecutionValue);
    return utf8ByteLength(JSON.stringify(cloned)) <= maximumBridgeValueBytes
      ? cloned
      : undefined;
  } catch {
    return undefined;
  }
};

const correlationMatches = (
  trace: ExecutionNetworkTrace,
  invocation: ExecutionDataGatewayInvocation
): boolean =>
  trace.runtimeZone !== 'client' &&
  trace.runtimeZone !== 'worker' &&
  trace.runtimeZone !== 'build' &&
  trace.mode === 'live' &&
  trace.adapter === 'core.http' &&
  trace.correlation?.kind === 'data-operation' &&
  trace.correlation.documentId === invocation.documentId &&
  trace.correlation.operationId === invocation.operationId &&
  trace.correlation.invocationId === invocation.invocationId &&
  trace.correlation.sequence === invocation.sequence &&
  trace.correlation.attempt === invocation.attempt;

/** Strictly reads a value-only Data invocation from an untrusted preview frame. */
export const readExecutionDataGatewayBridgeRequest = (
  value: unknown
): ExecutionDataGatewayBridgeRequest | undefined => {
  const record = exactRecord(value, [
    'type',
    'requestId',
    'documentId',
    'operationId',
    'invocationId',
    'sequence',
    'attempt',
    'input',
  ]);
  if (!record || record.type !== EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE)
    return undefined;
  const requestId = identifier(record.requestId);
  const documentId = identifier(record.documentId);
  const operationId = identifier(record.operationId);
  const invocationId = identifier(record.invocationId);
  const sequence = integer(record.sequence, 0);
  const attempt = integer(record.attempt, 1);
  const input = bridgeValue(record.input);
  if (
    !requestId ||
    !documentId ||
    !operationId ||
    !invocationId ||
    sequence === undefined ||
    attempt === undefined ||
    input === undefined ||
    requestId !== `${invocationId}:${attempt}`
  )
    return undefined;
  return Object.freeze({
    type: EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE,
    requestId,
    documentId,
    operationId,
    invocationId,
    sequence,
    attempt,
    input,
  });
};

/** Strictly reads Backend gateway output and cross-checks its sanitized Network correlation. */
export const readExecutionDataGatewayResult = (
  value: unknown,
  invocation: ExecutionDataGatewayInvocation
): ExecutionDataGatewayResult | undefined => {
  const record = exactRecord(value, ['value', 'empty', 'network']);
  if (!record || typeof record.empty !== 'boolean') return undefined;
  const resultValue = bridgeValue(record.value);
  const network = readExecutionNetworkTraceValue(record.network);
  if (
    resultValue === undefined ||
    !network ||
    !correlationMatches(network, invocation)
  )
    return undefined;
  return Object.freeze({ value: resultValue, empty: record.empty, network });
};

export const toExecutionDataGatewayBridgeSuccess = (
  request: ExecutionDataGatewayInvocation,
  result: ExecutionDataGatewayResult
): ExecutionDataGatewayBridgeResponse => {
  const normalized = readExecutionDataGatewayResult(result, request);
  if (!normalized)
    throw new TypeError('Execution Data gateway result is invalid.');
  return Object.freeze({
    type: EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE,
    requestId: request.requestId,
    ok: true,
    result: normalized,
  });
};

export const toExecutionDataGatewayBridgeFailure = (
  requestId: string,
  code: string,
  retryable = false
): ExecutionDataGatewayBridgeResponse => {
  const normalizedRequestId = identifier(requestId);
  const normalizedCode = identifier(code);
  if (
    !normalizedRequestId ||
    !normalizedCode ||
    !/^[A-Z][A-Z0-9_-]*$/u.test(normalizedCode)
  )
    throw new TypeError('Execution Data gateway failure is invalid.');
  return Object.freeze({
    type: EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE,
    requestId: normalizedRequestId,
    ok: false,
    error: Object.freeze({ code: normalizedCode, retryable }),
  });
};

/** Strictly reads the parent response received by a generated preview runtime. */
export const readExecutionDataGatewayBridgeResponse = (
  value: unknown,
  invocation: ExecutionDataGatewayInvocation
): ExecutionDataGatewayBridgeResponse | undefined => {
  const base = exactRecord(
    value,
    ['type', 'requestId', 'ok'],
    ['result', 'error']
  );
  if (
    !base ||
    base.type !== EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE ||
    base.requestId !== invocation.requestId
  )
    return undefined;
  if (base.ok === true) {
    if (Object.hasOwn(base, 'error')) return undefined;
    const result = readExecutionDataGatewayResult(base.result, invocation);
    return result
      ? Object.freeze({
          type: EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE,
          requestId: invocation.requestId,
          ok: true,
          result,
        })
      : undefined;
  }
  if (base.ok !== false || Object.hasOwn(base, 'result')) return undefined;
  const error = exactRecord(base.error, ['code', 'retryable']);
  const code = identifier(error?.code);
  if (
    !error ||
    !code ||
    !/^[A-Z][A-Z0-9_-]*$/u.test(code) ||
    typeof error.retryable !== 'boolean'
  )
    return undefined;
  return Object.freeze({
    type: EXECUTION_DATA_GATEWAY_BRIDGE_RESPONSE_TYPE,
    requestId: invocation.requestId,
    ok: false,
    error: Object.freeze({ code, retryable: error.retryable }),
  });
};
