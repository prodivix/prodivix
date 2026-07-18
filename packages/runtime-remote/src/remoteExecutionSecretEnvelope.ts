import type { ServerFunctionReference } from '@prodivix/server-runtime';

export const REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT =
  'prodivix.remote-execution-secret-envelope.v1' as const;
export const REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM =
  'X25519-HKDF-SHA256-AES-256-GCM' as const;

export const REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS = Object.freeze({
  maximumCiphertextBytes: 512 * 1024,
  maximumIdentityBytes: 4_096,
  maximumInvocationIdBytes: 512,
  publicKeyBytes: 32,
  nonceBytes: 12,
} as const);

export type RemoteExecutionSecretEnvelopeIdentity = Readonly<{
  executionId: string;
  workerId: string;
  workerAttempt: number;
  workspaceId: string;
  snapshotId: string;
  functionRef: ServerFunctionReference;
  invocationId: string;
  recipientPublicKey: string;
}>;

/**
 * Ciphertext-only Control Plane projection. Secret material is sealed directly
 * to the active Worker's ephemeral X25519 key by the trusted Backend broker.
 */
export type RemoteExecutionSecretEnvelope =
  RemoteExecutionSecretEnvelopeIdentity &
    Readonly<{
      format: typeof REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT;
      algorithm: typeof REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM;
      ephemeralPublicKey: string;
      nonce: string;
      ciphertext: string;
      expiresAt: number;
    }>;

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key))
    ? record
    : undefined;
};

const identity = (value: unknown, maximumBytes: number): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumBytes &&
  value === value.trim() &&
  !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : undefined;

const canonicalId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    ? value
    : undefined;

const exportName = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length <= 256 &&
  /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
    ? value
    : undefined;

const base64UrlBytes = (
  value: unknown,
  expectedBytes?: number,
  maximumBytes?: number
): string | undefined => {
  if (
    typeof value !== 'string' ||
    !value.length ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  )
    return undefined;
  const remainder = value.length % 4;
  if (remainder === 1) return undefined;
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastValue = alphabet.indexOf(value.at(-1)!);
  if (
    lastValue < 0 ||
    (remainder === 2 && (lastValue & 0x0f) !== 0) ||
    (remainder === 3 && (lastValue & 0x03) !== 0)
  )
    return undefined;
  const decodedBytes = Math.floor((value.length * 6) / 8);
  if (
    (expectedBytes !== undefined && decodedBytes !== expectedBytes) ||
    (maximumBytes !== undefined && decodedBytes > maximumBytes)
  )
    return undefined;
  return value;
};

export const readRemoteExecutionSecretEnvelope = (
  value: unknown
): RemoteExecutionSecretEnvelope | undefined => {
  const record = exactRecord(value, [
    'format',
    'algorithm',
    'executionId',
    'workerId',
    'workerAttempt',
    'workspaceId',
    'snapshotId',
    'functionRef',
    'invocationId',
    'recipientPublicKey',
    'ephemeralPublicKey',
    'nonce',
    'ciphertext',
    'expiresAt',
  ]);
  const reference = exactRecord(record?.functionRef, [
    'artifactId',
    'exportName',
  ]);
  const executionId = identity(
    record?.executionId,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.maximumIdentityBytes
  );
  const workerId = canonicalId(record?.workerId);
  const workerAttempt =
    Number.isSafeInteger(record?.workerAttempt) &&
    (record?.workerAttempt as number) > 0
      ? (record?.workerAttempt as number)
      : undefined;
  const workspaceId = identity(
    record?.workspaceId,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.maximumIdentityBytes
  );
  const snapshotId = identity(
    record?.snapshotId,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.maximumIdentityBytes
  );
  const artifactId = canonicalId(reference?.artifactId);
  const decodedExportName = exportName(reference?.exportName);
  const invocationId = identity(
    record?.invocationId,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.maximumInvocationIdBytes
  );
  const recipientPublicKey = base64UrlBytes(
    record?.recipientPublicKey,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.publicKeyBytes
  );
  const ephemeralPublicKey = base64UrlBytes(
    record?.ephemeralPublicKey,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.publicKeyBytes
  );
  const nonce = base64UrlBytes(
    record?.nonce,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.nonceBytes
  );
  const ciphertext = base64UrlBytes(
    record?.ciphertext,
    undefined,
    REMOTE_EXECUTION_SECRET_ENVELOPE_LIMITS.maximumCiphertextBytes
  );
  const expiresAt =
    Number.isSafeInteger(record?.expiresAt) && (record?.expiresAt as number) > 0
      ? (record?.expiresAt as number)
      : undefined;
  return record?.format === REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT &&
    record.algorithm === REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM &&
    executionId &&
    workerId &&
    workerAttempt &&
    workspaceId &&
    snapshotId &&
    artifactId &&
    decodedExportName &&
    invocationId &&
    recipientPublicKey &&
    ephemeralPublicKey &&
    nonce &&
    ciphertext &&
    expiresAt
    ? Object.freeze({
        format: REMOTE_EXECUTION_SECRET_ENVELOPE_FORMAT,
        algorithm: REMOTE_EXECUTION_SECRET_ENVELOPE_ALGORITHM,
        executionId,
        workerId,
        workerAttempt,
        workspaceId,
        snapshotId,
        functionRef: Object.freeze({
          artifactId,
          exportName: decodedExportName,
        }),
        invocationId,
        recipientPublicKey,
        ephemeralPublicKey,
        nonce,
        ciphertext,
        expiresAt,
      })
    : undefined;
};

/** Exact cross-language AES-GCM associated data; every field is newline-free. */
export const remoteExecutionSecretEnvelopeAssociatedData = (
  envelope: Pick<
    RemoteExecutionSecretEnvelope,
    | 'format'
    | 'algorithm'
    | 'executionId'
    | 'workerId'
    | 'workerAttempt'
    | 'workspaceId'
    | 'snapshotId'
    | 'functionRef'
    | 'invocationId'
    | 'recipientPublicKey'
    | 'ephemeralPublicKey'
    | 'expiresAt'
  >
): string =>
  [
    envelope.format,
    envelope.algorithm,
    envelope.executionId,
    envelope.workerId,
    String(envelope.workerAttempt),
    envelope.workspaceId,
    envelope.snapshotId,
    envelope.functionRef.artifactId,
    envelope.functionRef.exportName,
    envelope.invocationId,
    envelope.recipientPublicKey,
    envelope.ephemeralPublicKey,
    String(envelope.expiresAt),
  ].join('\n');
