import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { redactExecutionConsoleText } from './executionConsole';
import type { ExecutionSecretLeakGuard } from './executionSecretLeakGuard';
import type { ExecutionProviderDescriptor } from './execution.types';
import type {
  ExecutionSessionSnapshot,
  ExecutionSessionStatus,
} from './executionSession';

export const EXECUTION_TERMINAL_CAPABILITIES = Object.freeze([
  'shell',
] as const);
export const EXECUTION_TERMINAL_SIGNALS = Object.freeze([
  'interrupt',
  'terminate',
] as const);
export const EXECUTION_TERMINAL_CLOSE_REASONS = Object.freeze([
  'client-closed',
  'provider-closed',
  'execution-ended',
  'lease-expired',
  'policy-revoked',
  'transport-lost',
] as const);
export const EXECUTION_TERMINAL_TRUNCATION_MARKER = '[TRUNCATED]' as const;

export const EXECUTION_TERMINAL_LIMITS = Object.freeze({
  minimumColumns: 2,
  maximumColumns: 500,
  minimumRows: 1,
  maximumRows: 200,
  maximumInputBytes: 16 * 1024,
  maximumOutputChunkBytes: 32 * 1024,
  maximumOutputRecords: 1_000,
  maximumRetainedOutputBytes: 512 * 1024,
  maximumInputFingerprints: 256,
  maximumReadRecords: 250,
  maximumCopyBytes: 128 * 1024,
});

export type ExecutionTerminalCapability =
  (typeof EXECUTION_TERMINAL_CAPABILITIES)[number];
export type ExecutionTerminalSignal =
  (typeof EXECUTION_TERMINAL_SIGNALS)[number];
export type ExecutionTerminalCloseReason =
  (typeof EXECUTION_TERMINAL_CLOSE_REASONS)[number];
export type ExecutionTerminalStatus = 'open' | 'closing' | 'closed';
export type ExecutionTerminalOutputStream = 'stdout' | 'stderr';
export type ExecutionTerminalPermissionStatus =
  'allowed' | 'denied' | 'unresolved';

export type ExecutionTerminalSize = Readonly<{
  columns: number;
  rows: number;
}>;

/**
 * Non-secret authorization metadata. A Remote adapter keeps its bearer token
 * private and projects only this exact execution/provider fence into Core.
 */
export type ExecutionTerminalGrant = Readonly<{
  grantId: string;
  executionId: string;
  jobId: string;
  providerId: string;
  expiresAt: number;
}>;

export type ExecutionTerminalSnapshot = Readonly<{
  terminalSessionId: string;
  executionId: string;
  jobId: string;
  providerId: string;
  providerVersion: string;
  capability: ExecutionTerminalCapability;
  status: ExecutionTerminalStatus;
  revision: number;
  size: ExecutionTerminalSize;
  openedAt: number;
  updatedAt: number;
  leaseExpiresAt: number;
  latestOutputCursor: number;
  earliestRetainedOutputCursor: number;
  retainedOutputBytes: number;
  droppedOutputRecords: number;
  droppedOutputBytes: number;
  latestClientSequence: number;
  closedAt?: number;
  closeReason?: ExecutionTerminalCloseReason;
  exitCode?: number;
}>;

export type ExecutionTerminalOutputRecord = Readonly<{
  terminalSessionId: string;
  executionId: string;
  jobId: string;
  cursor: number;
  emittedAt: number;
  stream: ExecutionTerminalOutputStream;
  data: string;
  byteLength: number;
  redacted: boolean;
  truncated: boolean;
}>;

export type ExecutionTerminalReadResult = Readonly<{
  terminalSessionId: string;
  executionId: string;
  jobId: string;
  status: ExecutionTerminalStatus;
  afterCursor: number;
  nextCursor: number;
  latestCursor: number;
  earliestAvailableCursor: number;
  gap: boolean;
  hasMore: boolean;
  records: readonly ExecutionTerminalOutputRecord[];
}>;

export type ExecutionTerminalWriteResult =
  | Readonly<{
      status: 'accepted' | 'duplicate';
      clientSequence: number;
    }>
  | Readonly<{
      status: 'out-of-order';
      clientSequence: number;
      expectedClientSequence: number;
    }>
  | Readonly<{
      status: 'stale' | 'conflict' | 'closed' | 'rejected';
      clientSequence: number;
    }>;

export type ExecutionTerminalResizeResult = Readonly<{
  status: 'accepted' | 'unchanged' | 'closed' | 'rejected';
  size: ExecutionTerminalSize;
}>;

export type ExecutionTerminalSignalResult = Readonly<{
  status: 'accepted' | 'closed' | 'rejected';
  signal: ExecutionTerminalSignal;
}>;

export type ExecutionTerminalCloseResult = Readonly<{
  status: 'closed' | 'already-closed' | 'rejected';
}>;

export type ExecutionTerminalListener = (
  snapshot: ExecutionTerminalSnapshot,
  output: ExecutionTerminalOutputRecord | undefined
) => void;

export type ExecutionTerminalSession = Readonly<{
  id: string;
  executionId: string;
  jobId: string;
  provider: ExecutionProviderDescriptor;
  getSnapshot(): ExecutionTerminalSnapshot;
  read(
    input: Readonly<{
      afterCursor: number;
      maximumRecords?: number;
    }>
  ): ExecutionTerminalReadResult;
  write(
    input: Readonly<{
      data: string;
      clientSequence: number;
    }>
  ): Promise<ExecutionTerminalWriteResult>;
  resize(size: ExecutionTerminalSize): Promise<ExecutionTerminalResizeResult>;
  signal(
    signal: ExecutionTerminalSignal
  ): Promise<ExecutionTerminalSignalResult>;
  close(): Promise<ExecutionTerminalCloseResult>;
  subscribe(listener: ExecutionTerminalListener): () => void;
}>;

export type ExecutionTerminalInputHandler = (
  input: Readonly<{
    data: string;
    clientSequence: number;
  }>
) => void | Promise<void>;

export type ExecutionTerminalResizeHandler = (
  size: ExecutionTerminalSize
) => void | Promise<void>;

export type ExecutionTerminalSignalHandler = (
  signal: ExecutionTerminalSignal
) => void | Promise<void>;

export type ExecutionTerminalCloseHandler = (
  reason: ExecutionTerminalCloseReason
) => void | Promise<void>;

export type CreateExecutionTerminalControllerInput = Readonly<{
  terminalSessionId: string;
  executionId: string;
  jobId: string;
  provider: ExecutionProviderDescriptor;
  capability: ExecutionTerminalCapability;
  grant: ExecutionTerminalGrant;
  size: ExecutionTerminalSize;
  requestInput: ExecutionTerminalInputHandler;
  requestResize: ExecutionTerminalResizeHandler;
  requestSignal: ExecutionTerminalSignalHandler;
  requestClose: ExecutionTerminalCloseHandler;
  secretLeakGuard?: ExecutionSecretLeakGuard;
  maximumOutputRecords?: number;
  maximumRetainedOutputBytes?: number;
  maximumInputFingerprints?: number;
  now?: () => number;
  onSubscriberError?: (error: unknown) => void;
}>;

export type ExecutionTerminalController = Readonly<{
  session: ExecutionTerminalSession;
  renewGrant(grant: ExecutionTerminalGrant): ExecutionTerminalSnapshot;
  emitOutput(
    output: Readonly<{
      stream: ExecutionTerminalOutputStream;
      data: string;
      redacted?: boolean;
      truncated?: boolean;
    }>
  ): ExecutionTerminalOutputRecord | undefined;
  close(
    reason?: ExecutionTerminalCloseReason,
    exitCode?: number
  ): ExecutionTerminalSnapshot;
}>;

export type ExecutionTerminalAvailability =
  | Readonly<{ status: 'unavailable'; reason: 'no-active-execution' }>
  | Readonly<{
      status: 'unsupported';
      reason: 'provider-capability';
      providerId: string;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: 'execution-not-running';
      providerId: string;
      executionStatus: ExecutionSessionStatus;
    }>
  | Readonly<{
      status: 'permission-required';
      reason: 'permission-unresolved';
      providerId: string;
    }>
  | Readonly<{
      status: 'denied';
      reason: 'permission-denied';
      providerId: string;
    }>
  | Readonly<{
      status: 'available';
      providerId: string;
      jobId: string;
    }>;

export type InputFingerprint = Readonly<{
  clientSequence: number;
  digest: string;
}>;

export const terminalCapabilities = new Set<ExecutionTerminalCapability>(
  EXECUTION_TERMINAL_CAPABILITIES
);
export const terminalSignals = new Set<ExecutionTerminalSignal>(
  EXECUTION_TERMINAL_SIGNALS
);
export const terminalCloseReasons = new Set<ExecutionTerminalCloseReason>(
  EXECUTION_TERMINAL_CLOSE_REASONS
);

export const normalizeIdentifier = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  if (normalized !== value)
    throw new TypeError(`${label} must already be normalized.`);
  return normalized;
};

export const normalizePositiveLimit = (
  value: number | undefined,
  fallback: number,
  label: string,
  maximum: number
): number => {
  const normalized = value ?? fallback;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized <= 0 ||
    normalized > maximum
  )
    throw new TypeError(`${label} must be a positive bounded safe integer.`);
  return normalized;
};

export const normalizeCursor = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value;
};

export const normalizeClientSequence = (value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(
      'Execution terminal clientSequence must be a positive safe integer.'
    );
  return value;
};

export const normalizeTimestamp = (value: number, label: string): number => {
  if (!Number.isFinite(value))
    throw new TypeError(`${label} must be a finite timestamp.`);
  return value;
};

export const normalizeSize = (
  size: ExecutionTerminalSize
): ExecutionTerminalSize => {
  if (
    !Number.isSafeInteger(size.columns) ||
    size.columns < EXECUTION_TERMINAL_LIMITS.minimumColumns ||
    size.columns > EXECUTION_TERMINAL_LIMITS.maximumColumns
  )
    throw new TypeError('Execution terminal columns are outside the budget.');
  if (
    !Number.isSafeInteger(size.rows) ||
    size.rows < EXECUTION_TERMINAL_LIMITS.minimumRows ||
    size.rows > EXECUTION_TERMINAL_LIMITS.maximumRows
  )
    throw new TypeError('Execution terminal rows are outside the budget.');
  return Object.freeze({ columns: size.columns, rows: size.rows });
};

export const truncateUtf8 = (
  value: string,
  maximumBytes: number
): Readonly<{ value: string; truncated: boolean }> => {
  if (utf8ToBytes(value).byteLength <= maximumBytes)
    return Object.freeze({ value, truncated: false });
  const marker = EXECUTION_TERMINAL_TRUNCATION_MARKER.slice(0, maximumBytes);
  const markerBytes = utf8ToBytes(marker).byteLength;
  const bodyBudget = Math.max(0, maximumBytes - markerBytes);
  let retained = '';
  let retainedBytes = 0;
  for (const character of value) {
    const characterBytes = utf8ToBytes(character).byteLength;
    if (retainedBytes + characterBytes > bodyBudget) break;
    retained += character;
    retainedBytes += characterBytes;
  }
  return Object.freeze({
    value: `${retained}${marker}`,
    truncated: true,
  });
};

export const createFingerprintSalt = (): string => {
  const bytes = new Uint8Array(32);
  const cryptoSource = (
    globalThis as unknown as {
      crypto?: { getRandomValues(value: Uint8Array): Uint8Array };
    }
  ).crypto;
  if (cryptoSource?.getRandomValues) cryptoSource.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
};

export const createInputFingerprint = (
  salt: string,
  clientSequence: number,
  data: string
): string =>
  bytesToHex(
    sha256(utf8ToBytes(`${salt}\0${clientSequence.toString(10)}\0${data}`))
  );

export const freezeSnapshot = (
  snapshot: ExecutionTerminalSnapshot
): ExecutionTerminalSnapshot =>
  Object.freeze({
    ...snapshot,
    size: Object.freeze({ ...snapshot.size }),
  });

const isOpenExecutionStatus = (status: ExecutionSessionStatus): boolean =>
  status === 'starting' || status === 'running';

/** Resolves capability and permission without probing a provider-private adapter. */
export const getExecutionTerminalAvailability = (
  input: Readonly<{
    session: ExecutionSessionSnapshot | undefined;
    permission?: ExecutionTerminalPermissionStatus;
  }>
): ExecutionTerminalAvailability => {
  const activeJob = input.session?.activeJob;
  if (!activeJob)
    return Object.freeze({
      status: 'unavailable',
      reason: 'no-active-execution',
    });
  if (!activeJob.capabilities.includes('terminal'))
    return Object.freeze({
      status: 'unsupported',
      reason: 'provider-capability',
      providerId: activeJob.providerId,
    });
  if (!isOpenExecutionStatus(input.session.status))
    return Object.freeze({
      status: 'unavailable',
      reason: 'execution-not-running',
      providerId: activeJob.providerId,
      executionStatus: input.session.status,
    });
  const permission = input.permission ?? 'unresolved';
  if (permission === 'unresolved')
    return Object.freeze({
      status: 'permission-required',
      reason: 'permission-unresolved',
      providerId: activeJob.providerId,
    });
  if (permission === 'denied')
    return Object.freeze({
      status: 'denied',
      reason: 'permission-denied',
      providerId: activeJob.providerId,
    });
  return Object.freeze({
    status: 'available',
    providerId: activeJob.providerId,
    jobId: activeJob.jobId,
  });
};

/** Produces a bounded, re-redacted projection instead of copying raw PTY state. */
export const createExecutionTerminalCopyText = (
  input: ExecutionTerminalReadResult,
  maximumBytes = EXECUTION_TERMINAL_LIMITS.maximumCopyBytes
): string => {
  const normalizedMaximumBytes = normalizePositiveLimit(
    maximumBytes,
    EXECUTION_TERMINAL_LIMITS.maximumCopyBytes,
    'Execution terminal copy byte budget',
    EXECUTION_TERMINAL_LIMITS.maximumCopyBytes
  );
  const redacted = redactExecutionConsoleText(
    `${input.gap ? `${EXECUTION_TERMINAL_TRUNCATION_MARKER}\n` : ''}${input.records
      .map((record) => record.data)
      .join('')}`
  );
  return truncateUtf8(redacted.value, normalizedMaximumBytes).value;
};
