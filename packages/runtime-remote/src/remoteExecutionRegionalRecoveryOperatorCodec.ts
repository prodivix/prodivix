import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  type RemoteExecutionRegionalRecoveryOperatorRequest,
} from './remoteExecutionRegionalRecoveryOperator.types';

const maximumRequestBytes = 64 * 1_024;
const canonicalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
};

const record = (
  value: unknown
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean =>
  JSON.stringify(Object.keys(value).sort()) ===
  JSON.stringify([...keys].sort());

const integer = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) && (value as number) >= minimum;

export const readRemoteExecutionRegionalRecoveryOperatorRequest = (
  value: unknown
): RemoteExecutionRegionalRecoveryOperatorRequest => {
  const request = record(value);
  const commonKeys = [
    'format',
    'version',
    'operationId',
    'mode',
    'executionIds',
    'expectedTrafficEpoch',
    'initiatedAt',
    'cutoverAt',
  ];
  if (
    !request ||
    (request.mode !== 'planned' && request.mode !== 'source-unavailable') ||
    !exactKeys(
      request,
      request.mode === 'planned'
        ? commonKeys
        : [...commonKeys, 'maximumAcceptedRpoMs']
    ) ||
    request.format !== REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT ||
    request.version !== REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION ||
    typeof request.operationId !== 'string' ||
    !canonicalIdentifierPattern.test(request.operationId) ||
    !Array.isArray(request.executionIds) ||
    request.executionIds.length < 1 ||
    request.executionIds.length >
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize ||
    request.executionIds.some(
      (executionId) =>
        typeof executionId !== 'string' ||
        !canonicalIdentifierPattern.test(executionId)
    ) ||
    new Set(request.executionIds).size !== request.executionIds.length ||
    !integer(request.expectedTrafficEpoch, 1) ||
    !integer(request.initiatedAt) ||
    !integer(request.cutoverAt) ||
    (request.initiatedAt as number) > (request.cutoverAt as number) ||
    (request.mode === 'source-unavailable' &&
      !integer(request.maximumAcceptedRpoMs))
  )
    throw new TypeError('Remote regional recovery request is invalid.');
  return Object.freeze({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    operationId: request.operationId,
    mode: request.mode,
    executionIds: Object.freeze([...(request.executionIds as string[])]),
    expectedTrafficEpoch: request.expectedTrafficEpoch,
    initiatedAt: request.initiatedAt,
    cutoverAt: request.cutoverAt,
    ...(request.mode === 'source-unavailable'
      ? { maximumAcceptedRpoMs: request.maximumAcceptedRpoMs as number }
      : {}),
  });
};

export const decodeRemoteExecutionRegionalRecoveryOperatorRequest = (
  serialized: string
): RemoteExecutionRegionalRecoveryOperatorRequest => {
  if (
    typeof serialized !== 'string' ||
    serialized.length < 2 ||
    utf8ToBytes(serialized).byteLength > maximumRequestBytes
  )
    throw new TypeError('Remote regional recovery request is invalid.');
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError('Remote regional recovery request is invalid.');
  }
  return readRemoteExecutionRegionalRecoveryOperatorRequest(value);
};

export const encodeRemoteExecutionRegionalRecoveryOperatorRequest = (
  request: RemoteExecutionRegionalRecoveryOperatorRequest
): string =>
  `${stableJson(readRemoteExecutionRegionalRecoveryOperatorRequest(request))}\n`;
