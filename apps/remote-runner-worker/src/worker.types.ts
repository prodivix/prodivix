import type {
  ExecutionArtifactKind,
  ExecutionSourceTrace,
  ExecutableProjectSnapshot,
  ExecutionRequest,
  ExecutionJobStatus,
  ExecutionTerminalCloseReason,
  ExecutionTerminalSignal,
  ExecutionTerminalSize,
} from '@prodivix/runtime-core';
import type {
  RemoteExecutionClaimResult,
  RemoteExecutionLease,
  RemoteExecutionArtifactDescriptor,
  RemoteExecutionWorkerEvent,
  RemoteExecutionTerminalWorkerOutputResult,
  RemoteExecutionTerminalWorkerReadResult,
  RemoteExecutionSecretEnvelope,
} from '@prodivix/runtime-remote';
import type {
  IsolatedServerFunctionAuthority,
  IsolatedServerFunctionSecretMaterial,
} from '@prodivix/server-runtime';

export type RemoteWorkerControlPlaneClient = Readonly<{
  claim(
    input: Readonly<{
      workerId: string;
      providerId: string;
      leaseDurationMs: number;
    }>
  ): Promise<RemoteExecutionClaimResult | undefined>;
  renew(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      leaseDurationMs: number;
    }>
  ): Promise<
    | Readonly<{
        lease: RemoteExecutionLease;
        cancellationRequested: boolean;
      }>
    | undefined
  >;
  transition(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      status: ExecutionJobStatus;
      reason?: string;
    }>
  ): Promise<boolean>;
  snapshot(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
    }>
  ): Promise<ExecutableProjectSnapshot | undefined>;
  resolveServerFunctionSecrets?(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      recipientPublicKey: string;
    }>
  ): Promise<RemoteExecutionSecretEnvelope | undefined>;
  appendEvent(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      workerEventId: string;
      event: RemoteExecutionWorkerEvent;
    }>
  ): Promise<'stored' | 'existing' | 'budget-exceeded' | 'rejected'>;
  uploadArtifact(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      workerEventId: string;
      descriptor: RemoteExecutionArtifactDescriptor;
      contents: Uint8Array;
    }>
  ): Promise<'stored' | 'existing' | 'budget-exceeded' | 'rejected'>;
}>;

export type RemoteWorkerSandboxResult = Readonly<{
  status: 'succeeded' | 'failed' | 'timed-out' | 'cancelled';
  exitCode?: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  secretLeakDetected?: boolean;
  reason?: string;
  artifacts?: readonly RemoteWorkerSandboxArtifact[];
  networkTraces?: readonly RemoteWorkerSandboxNetworkTrace[];
}>;

export type RemoteWorkerSandboxNetworkTrace = Readonly<{
  requestId: string;
  method: string;
  sanitizedUrl: string;
  protocol: 'http' | 'https';
  startedAt: number;
  completedAt: number;
  outcome: 'allowed' | 'denied' | 'failed';
  status: number;
  requestBytes: number;
  responseBytes: number;
}>;

export type RemoteWorkerSandboxArtifact = Readonly<{
  artifactId: string;
  kind: ExecutionArtifactKind;
  label?: string;
  mediaType: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
  metadata?: Readonly<Record<string, string>>;
  contents: Uint8Array;
}>;

export type RemoteWorkerSandbox = Readonly<{
  execute(
    input: Readonly<{
      executionId: string;
      snapshot: ExecutableProjectSnapshot;
      profile: 'preview' | 'test' | 'build' | 'production';
      request?: ExecutionRequest;
      serverFunctionAuthority?: IsolatedServerFunctionAuthority;
      serverFunctionSecrets?: IsolatedServerFunctionSecretMaterial;
      timeoutMs: number;
      maximumOutputBytes: number;
      redactValues: readonly string[];
      signal: AbortSignal;
      terminal?: RemoteWorkerSandboxTerminalBinding;
    }>
  ): Promise<RemoteWorkerSandboxResult>;
}>;

export type RemoteWorkerTerminalControlPlaneClient = Readonly<{
  readTerminalCommands(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    acknowledgedCommandCursor: number;
    maximumCommands?: number;
  }): Promise<RemoteExecutionTerminalWorkerReadResult | undefined>;
  publishTerminalOutput(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    terminalSessionId: string;
    workerOutputId: string;
    stream: 'stdout' | 'stderr';
    data: string;
    redacted: boolean;
  }): Promise<RemoteExecutionTerminalWorkerOutputResult>;
  closeTerminal(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    terminalSessionId: string;
    reason: ExecutionTerminalCloseReason;
    exitCode?: number;
  }): Promise<boolean>;
}>;

export type RemoteWorkerTerminalProcess = Readonly<{
  open(input: {
    terminalSessionId: string;
    size: ExecutionTerminalSize;
    onOutput(output: { stream: 'stdout' | 'stderr'; data: string }): void;
    onExit(exitCode?: number): void;
  }): Promise<void>;
  write(data: string): Promise<void>;
  resize(size: ExecutionTerminalSize): Promise<void>;
  signal(signal: ExecutionTerminalSignal): Promise<void>;
  close(reason: ExecutionTerminalCloseReason): Promise<void>;
}>;

export type RemoteWorkerTerminalDisconnect = () => Promise<void>;

export type RemoteWorkerSandboxTerminalBinding = Readonly<{
  connect(
    process: RemoteWorkerTerminalProcess
  ): Promise<RemoteWorkerTerminalDisconnect>;
}>;

export type RemoteWorkerTerminalCoordinator = Readonly<{
  connect(input: {
    executionId: string;
    workerId: string;
    leaseToken: string;
    workerAttempt: number;
    process: RemoteWorkerTerminalProcess;
    signal: AbortSignal;
    redactValues: readonly string[];
  }): Promise<RemoteWorkerTerminalDisconnect>;
}>;
