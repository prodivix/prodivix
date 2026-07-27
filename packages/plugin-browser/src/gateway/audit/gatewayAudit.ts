import type { CapabilityIdentity, PluginOwnerRef } from '@prodivix/plugin-host';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  GatewayAuditMetadata,
  GatewayAuditMetadataValue,
} from '#browser/gateway/gatewayContract';

export type GatewayAuditPhase = 'preflight' | 'outcome';

export type GatewayAuditOutcome =
  'attempted' | 'success' | 'denied' | 'failed' | 'canceled';

export type GatewayAuditRecord = Readonly<{
  eventId: string;
  occurredAt: number;
  owner: PluginOwnerRef;
  pluginVersion: string;
  operationId: string;
  method: string;
  contractVersion: string;
  permissionRevision: number;
  capability?: CapabilityIdentity;
  phase: GatewayAuditPhase;
  outcome: GatewayAuditOutcome;
  requestBytes: number;
  responseBytes?: number;
  durationMs?: number;
  diagnosticCodes?: readonly string[];
  metadata: GatewayAuditMetadata;
}>;

export type GatewayAuditStore = Readonly<{
  append(record: GatewayAuditRecord): Promise<void>;
  readRecent(limit?: number): Promise<readonly GatewayAuditRecord[]>;
  dispose(): void | Promise<void>;
}>;

export type GatewayAuditRetentionPolicy = Readonly<{
  maxRecords: number;
  maxBytes: number;
}>;

export const DEFAULT_GATEWAY_AUDIT_RETENTION_POLICY: GatewayAuditRetentionPolicy =
  Object.freeze({
    maxRecords: 5_000,
    maxBytes: 8 * 1024 * 1024,
  });

const SENSITIVE_METADATA_KEY =
  /(?:authorization|cookie|credential|password|secret|token|body|content|patch|payload)/i;
const SENSITIVE_METADATA_VALUE =
  /(?:\bbearer\s+\S+|\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+|[?&](?:auth|key|secret|token)=)/i;
const MAX_METADATA_KEYS = 32;
const MAX_METADATA_KEY_LENGTH = 96;
const MAX_METADATA_STRING_LENGTH = 256;

const normalizePositiveInteger = (
  value: number | undefined,
  fallback: number
): number =>
  Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;

export const normalizeGatewayAuditRetentionPolicy = (
  input: Partial<GatewayAuditRetentionPolicy> = {}
): GatewayAuditRetentionPolicy =>
  Object.freeze({
    maxRecords: normalizePositiveInteger(
      input.maxRecords,
      DEFAULT_GATEWAY_AUDIT_RETENTION_POLICY.maxRecords
    ),
    maxBytes: normalizePositiveInteger(
      input.maxBytes,
      DEFAULT_GATEWAY_AUDIT_RETENTION_POLICY.maxBytes
    ),
  });

const normalizeMetadataValue = (
  value: GatewayAuditMetadataValue
): GatewayAuditMetadataValue =>
  typeof value === 'string'
    ? SENSITIVE_METADATA_VALUE.test(value)
      ? '[REDACTED]'
      : value.slice(0, MAX_METADATA_STRING_LENGTH)
    : value;

export const redactGatewayAuditMetadata = (
  metadata: GatewayAuditMetadata = {}
): GatewayAuditMetadata => {
  const redacted: Record<string, GatewayAuditMetadataValue> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata)
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .slice(0, MAX_METADATA_KEYS)) {
    const key = rawKey.slice(0, MAX_METADATA_KEY_LENGTH);
    if (!key) continue;
    redacted[key] = SENSITIVE_METADATA_KEY.test(key)
      ? '[REDACTED]'
      : normalizeMetadataValue(rawValue);
  }
  return Object.freeze(redacted);
};

export const normalizeGatewayAuditRecord = (
  record: GatewayAuditRecord
): GatewayAuditRecord =>
  Object.freeze({
    ...record,
    owner: Object.freeze({ ...record.owner }),
    ...(record.capability
      ? { capability: Object.freeze({ ...record.capability }) }
      : {}),
    ...(record.diagnosticCodes
      ? { diagnosticCodes: Object.freeze([...record.diagnosticCodes]) }
      : {}),
    metadata: redactGatewayAuditMetadata(record.metadata),
  });

export const gatewayAuditRecordByteLength = (
  record: GatewayAuditRecord
): number => new TextEncoder().encode(JSON.stringify(record)).byteLength;

export type InMemoryGatewayAuditStore = GatewayAuditStore &
  Readonly<{
    snapshot(): readonly GatewayAuditRecord[];
  }>;

export const createInMemoryGatewayAuditStore = (
  policyInput: Partial<GatewayAuditRetentionPolicy> = {}
): InMemoryGatewayAuditStore => {
  const policy = normalizeGatewayAuditRetentionPolicy(policyInput);
  const records: Array<
    Readonly<{ record: GatewayAuditRecord; bytes: number }>
  > = [];
  let totalBytes = 0;
  let disposed = false;

  const snapshot = () => Object.freeze(records.map(({ record }) => record));

  return Object.freeze({
    append: async (input) => {
      if (disposed) throw new Error('Gateway audit store is disposed.');
      const record = normalizeGatewayAuditRecord(input);
      const bytes = gatewayAuditRecordByteLength(record);
      if (bytes > policy.maxBytes) {
        throw new Error(
          'Gateway audit record exceeds the retention byte limit.'
        );
      }
      records.push(Object.freeze({ record, bytes }));
      totalBytes += bytes;
      while (
        records.length > policy.maxRecords ||
        totalBytes > policy.maxBytes
      ) {
        const removed = records.shift();
        if (removed) totalBytes -= removed.bytes;
      }
    },
    readRecent: async (limit = 100) =>
      Object.freeze(
        snapshot().slice(-normalizePositiveInteger(limit, 100)).reverse()
      ),
    snapshot,
    dispose: () => {
      disposed = true;
      records.length = 0;
      totalBytes = 0;
    },
  });
};
