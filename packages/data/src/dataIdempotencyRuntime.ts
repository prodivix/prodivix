import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { DataOperationInvocation } from './dataRuntime';

export const DATA_IDEMPOTENCY_KEY_PREFIX = 'prodivix-data-sha256-' as const;

const normalized = (value: string, label: string): string => {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 512 ||
    value.includes('\0')
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const stableJson = (value: unknown): string => {
  const sort = (candidate: unknown): unknown => {
    if (candidate === null || typeof candidate !== 'object') return candidate;
    if (Array.isArray(candidate)) return candidate.map(sort);
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sort(entry)])
    );
  };
  return JSON.stringify(sort(value));
};

/**
 * Derives an opaque key from attempt-invariant invocation fields. The key is
 * safe to expose to an upstream adapter and never contains author input,
 * environment identity, or Secret material.
 */
export const createDataOperationIdempotencyKey = (
  invocation: DataOperationInvocation
): string => {
  if (!Number.isSafeInteger(invocation.sequence) || invocation.sequence < 0)
    throw new TypeError('Data invocation sequence is invalid.');
  const payload = stableJson({
    format: 'prodivix.data-idempotency-key.v1',
    documentId: normalized(
      invocation.operation.documentId,
      'Data operation documentId'
    ),
    operationId: normalized(
      invocation.operation.operationId,
      'Data operation operationId'
    ),
    invocationId: normalized(invocation.invocationId, 'Data invocationId'),
    sequence: invocation.sequence,
    documentRevision: normalized(
      invocation.documentRevision,
      'Data document revision'
    ),
    runtimeZone: invocation.runtimeZone,
    mode: invocation.mode,
    input: invocation.input,
  });
  return `${DATA_IDEMPOTENCY_KEY_PREFIX}${bytesToHex(sha256(utf8ToBytes(payload)))}`;
};
