import type {
  ExecutionTerminalCloseReason,
  ExecutionTerminalCloseResult,
  ExecutionTerminalReadResult,
  ExecutionTerminalResizeResult,
  ExecutionTerminalSignal,
  ExecutionTerminalSignalResult,
  ExecutionTerminalSize,
  ExecutionTerminalSnapshot,
  ExecutionTerminalWriteResult,
} from '@prodivix/runtime-core';
import type {
  RemoteExecutionLease,
  RemoteExecutionPrincipal,
  RemoteExecutionStoredRecord,
} from './remoteExecutionControlPlane.types';

export const REMOTE_EXECUTION_TERMINAL_PROTOCOL =
  'prodivix.remote-terminal' as const;
export const REMOTE_EXECUTION_TERMINAL_VERSION = 1 as const;
export const REMOTE_EXECUTION_TERMINAL_OPERATIONS = Object.freeze([
  'open',
  'resume',
  'read',
  'write',
  'resize',
  'signal',
  'close',
] as const);
export const REMOTE_EXECUTION_TERMINAL_LIMITS = Object.freeze({
  maximumAccessTokenLength: 8_192,
  maximumCommands: 256,
  maximumCommandBytes: 256 * 1024,
  maximumOutputFingerprints: 1_000,
  maximumWorkerReadCommands: 64,
  maximumSessions: 1_000,
  maximumSessionsPerExecution: 1,
  defaultAccessTokenTtlMs: 60_000,
});

export type RemoteExecutionTerminalOperation =
  (typeof REMOTE_EXECUTION_TERMINAL_OPERATIONS)[number];

export type RemoteExecutionTerminalAccess = Readonly<{
  token: string;
  expiresAt: number;
}>;

export type RemoteExecutionTerminalOpenResult = Readonly<{
  protocol: typeof REMOTE_EXECUTION_TERMINAL_PROTOCOL;
  version: typeof REMOTE_EXECUTION_TERMINAL_VERSION;
  snapshot: ExecutionTerminalSnapshot;
  access: RemoteExecutionTerminalAccess;
}>;

export type RemoteExecutionTerminalResumeResult =
  RemoteExecutionTerminalOpenResult;

export type RemoteExecutionTerminalCommand =
  | Readonly<{
      cursor: number;
      kind: 'open';
      terminalSessionId: string;
      size: ExecutionTerminalSize;
    }>
  | Readonly<{
      cursor: number;
      kind: 'input';
      terminalSessionId: string;
      clientSequence: number;
      data: string;
    }>
  | Readonly<{
      cursor: number;
      kind: 'resize';
      terminalSessionId: string;
      size: ExecutionTerminalSize;
    }>
  | Readonly<{
      cursor: number;
      kind: 'signal';
      terminalSessionId: string;
      signal: ExecutionTerminalSignal;
    }>
  | Readonly<{
      cursor: number;
      kind: 'close';
      terminalSessionId: string;
      reason: ExecutionTerminalCloseReason;
    }>;

export type RemoteExecutionTerminalWorkerReadResult = Readonly<{
  terminalSessionId: string;
  executionId: string;
  acknowledgedCommandCursor: number;
  latestCommandCursor: number;
  hasMore: boolean;
  commands: readonly RemoteExecutionTerminalCommand[];
}>;

export type RemoteExecutionTerminalWorkerOutputResult =
  | 'stored'
  | 'existing'
  | 'identity-conflict'
  | 'lease-rejected'
  | 'session-closed';

export type RemoteExecutionTerminalResolvedExecution = Readonly<{
  execution: RemoteExecutionStoredRecord;
  lease: RemoteExecutionLease;
}>;

export type RemoteExecutionTerminalBroker = Readonly<{
  open(input: {
    principal: RemoteExecutionPrincipal;
    executionId: string;
    size: ExecutionTerminalSize;
  }): Promise<RemoteExecutionTerminalOpenResult>;
  resume(input: {
    principal: RemoteExecutionPrincipal;
    executionId: string;
    terminalSessionId: string;
  }): Promise<RemoteExecutionTerminalResumeResult>;
  read(input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
    afterCursor: number;
    maximumRecords?: number;
  }): Promise<ExecutionTerminalReadResult>;
  write(input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
    data: string;
    clientSequence: number;
  }): Promise<ExecutionTerminalWriteResult>;
  resize(input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
    size: ExecutionTerminalSize;
  }): Promise<ExecutionTerminalResizeResult>;
  signal(input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
    signal: ExecutionTerminalSignal;
  }): Promise<ExecutionTerminalSignalResult>;
  close(input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
  }): Promise<ExecutionTerminalCloseResult>;
  readWorkerCommands(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    acknowledgedCommandCursor: number;
    maximumCommands?: number;
  }): Promise<RemoteExecutionTerminalWorkerReadResult | undefined>;
  publishWorkerOutput(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    terminalSessionId: string;
    workerOutputId: string;
    stream: 'stdout' | 'stderr';
    data: string;
    redacted: boolean;
  }): Promise<RemoteExecutionTerminalWorkerOutputResult>;
  closeFromWorker(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    terminalSessionId: string;
    reason: ExecutionTerminalCloseReason;
    exitCode?: number;
  }): Promise<boolean>;
  closeExecution(
    executionId: string,
    reason?: ExecutionTerminalCloseReason
  ): number;
  sweepExpired(): number;
}>;

export type RemoteExecutionTerminalTransportRequest = Readonly<{
  operation: RemoteExecutionTerminalOperation;
  executionId: string;
  terminalSessionId?: string;
  accessToken?: string;
  payload: unknown;
}>;

export type RemoteExecutionTerminalTransport = Readonly<{
  send(request: RemoteExecutionTerminalTransportRequest): Promise<unknown>;
}>;

export type RemoteExecutionTerminalClient = Readonly<{
  open(input: {
    executionId: string;
    size: ExecutionTerminalSize;
  }): Promise<RemoteExecutionTerminalOpenResult>;
  resume(input: {
    executionId: string;
    terminalSessionId: string;
  }): Promise<RemoteExecutionTerminalResumeResult>;
  read(input: {
    executionId: string;
    terminalSessionId: string;
    accessToken: string;
    afterCursor: number;
    maximumRecords?: number;
  }): Promise<ExecutionTerminalReadResult>;
  write(input: {
    executionId: string;
    terminalSessionId: string;
    accessToken: string;
    data: string;
    clientSequence: number;
  }): Promise<ExecutionTerminalWriteResult>;
  resize(input: {
    executionId: string;
    terminalSessionId: string;
    accessToken: string;
    size: ExecutionTerminalSize;
  }): Promise<ExecutionTerminalResizeResult>;
  signal(input: {
    executionId: string;
    terminalSessionId: string;
    accessToken: string;
    signal: ExecutionTerminalSignal;
  }): Promise<ExecutionTerminalSignalResult>;
  close(input: {
    executionId: string;
    terminalSessionId: string;
    accessToken: string;
  }): Promise<ExecutionTerminalCloseResult>;
}>;
