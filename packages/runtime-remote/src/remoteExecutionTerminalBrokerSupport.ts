import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type {
  ExecutionSecretTextStreamRedactor,
  ExecutionTerminalController,
  ExecutionTerminalOutputStream,
} from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalCommand } from './remoteExecutionTerminal.types';
import type {
  RemoteExecutionPrincipal,
  RemoteExecutionStoredRecord,
} from './remoteExecutionControlPlane.types';

export const REMOTE_EXECUTION_TERMINAL_ERROR_CODES = Object.freeze([
  'invalid-request',
  'not-found',
  'forbidden',
  'unavailable',
  'quota-exceeded',
  'access-expired',
  'identity-conflict',
] as const);

export type RemoteExecutionTerminalErrorCode =
  (typeof REMOTE_EXECUTION_TERMINAL_ERROR_CODES)[number];

export class RemoteExecutionTerminalBrokerError extends Error {
  readonly code: RemoteExecutionTerminalErrorCode;

  constructor(code: RemoteExecutionTerminalErrorCode, message: string) {
    super(message);
    this.name = 'RemoteExecutionTerminalBrokerError';
    this.code = code;
  }
}

export type CreateRemoteExecutionTerminalBrokerOptions = Readonly<{
  resolveExecution(
    executionId: string
  ): Promise<RemoteExecutionStoredRecord | undefined>;
  createTerminalSessionId(): string;
  createAccessToken(): string;
  secretValues?: readonly string[];
  accessTokenTtlMs?: number;
  maximumSessions?: number;
  maximumCommands?: number;
  maximumCommandBytes?: number;
  now?: () => number;
}>;

export type StoredRemoteExecutionTerminal = {
  readonly principalSubjectId: string;
  readonly executionId: string;
  readonly terminalSessionId: string;
  readonly workerId: string;
  readonly workerLeaseTokenDigest: string;
  readonly workerAttempt: number;
  readonly controller: ExecutionTerminalController;
  readonly outputRedactors: Readonly<
    Record<ExecutionTerminalOutputStream, ExecutionSecretTextStreamRedactor>
  >;
  readonly workerOutputFingerprints: Map<string, string>;
  accessTokenDigest: string;
  accessTokenExpiresAt: number;
  commandCursor: number;
  acknowledgedCommandCursor: number;
  commandBytes: number;
  commands: RemoteExecutionTerminalCommand[];
};

export type RemoteExecutionTerminalCommandInput =
  RemoteExecutionTerminalCommand extends infer Command
    ? Command extends { cursor: number }
      ? Omit<Command, 'cursor'>
      : never
    : never;

export const remoteExecutionTerminalActiveStatuses = new Set([
  'starting',
  'running',
]);

export const normalizeRemoteExecutionTerminalIdentifier = (
  value: string,
  label: string
): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > 4_096
  )
    throw new RemoteExecutionTerminalBrokerError(
      'invalid-request',
      `${label} is invalid.`
    );
  return value;
};

export const normalizeRemoteExecutionTerminalPositiveInteger = (
  value: number,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER
): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError(`${label} must be a bounded positive integer.`);
  return value;
};

export const createRemoteExecutionTerminalTokenDigest = (
  value: string
): string => bytesToHex(sha256(utf8ToBytes(value)));

export const hasRemoteExecutionTerminalScope = (
  principal: RemoteExecutionPrincipal
): boolean =>
  principal.scopes.includes('remote-execution:*') ||
  principal.scopes.includes('remote-execution:terminal');

export const getRemoteExecutionTerminalCommandSize = (
  command: RemoteExecutionTerminalCommand
): number => utf8ToBytes(JSON.stringify(command)).byteLength;
