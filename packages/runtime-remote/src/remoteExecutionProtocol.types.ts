import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  ExecutableProjectSnapshot,
  ExecutionArtifactKind,
  ExecutionCancellationResult,
  ExecutionJobEvent,
  ExecutionJobStatus,
  ExecutionProviderDescriptor,
  ExecutionRequest,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';

export const REMOTE_EXECUTION_PROTOCOL = 'prodivix.remote-execution' as const;
export const REMOTE_EXECUTION_PROTOCOL_VERSIONS = Object.freeze([1] as const);
export type RemoteExecutionProtocolVersion =
  (typeof REMOTE_EXECUTION_PROTOCOL_VERSIONS)[number];

export const REMOTE_EXECUTION_PROTOCOL_LIMITS = Object.freeze({
  maxIdentifierLength: 4_096,
  maxStringLength: 64 * 1024,
  maxRecordEntries: 256,
  maxArrayEntries: 1_000,
  maxValueNodes: 10_000,
  maxValueDepth: 24,
  maxSourceTraces: 256,
});

export const REMOTE_EXECUTION_OPERATIONS = Object.freeze([
  'negotiate',
  'create',
  'get',
  'cancel',
  'events.read',
  'artifact.resolve',
] as const);
export type RemoteExecutionOperation =
  (typeof REMOTE_EXECUTION_OPERATIONS)[number];

export const REMOTE_EXECUTION_ERROR_CODES = Object.freeze([
  'protocol-version-unsupported',
  'invalid-request',
  'identity-conflict',
  'not-found',
  'unauthorized',
  'forbidden',
  'quota-exceeded',
  'unavailable',
  'timeout',
  'internal',
] as const);
export type RemoteExecutionErrorCode =
  (typeof REMOTE_EXECUTION_ERROR_CODES)[number];

export type RemoteExecutionWireError = Readonly<{
  code: RemoteExecutionErrorCode;
  message: string;
  retryable: boolean;
}>;

export type RemoteExecutionRequestEnvelope = Readonly<{
  protocol: typeof REMOTE_EXECUTION_PROTOCOL;
  version: RemoteExecutionProtocolVersion;
  messageId: string;
  operation: RemoteExecutionOperation;
  payload: unknown;
}>;

export type RemoteExecutionSuccessEnvelope = Readonly<{
  protocol: typeof REMOTE_EXECUTION_PROTOCOL;
  version: RemoteExecutionProtocolVersion;
  messageId: string;
  operation: RemoteExecutionOperation;
  ok: true;
  payload: unknown;
}>;

export type RemoteExecutionFailureEnvelope = Readonly<{
  protocol: typeof REMOTE_EXECUTION_PROTOCOL;
  version: RemoteExecutionProtocolVersion;
  messageId: string;
  operation: RemoteExecutionOperation;
  ok: false;
  error: RemoteExecutionWireError;
}>;

export type RemoteExecutionResponseEnvelope =
  RemoteExecutionSuccessEnvelope | RemoteExecutionFailureEnvelope;

export type RemoteExecutableProjectFileContentsWire =
  | Readonly<{ encoding: 'utf8'; value: string }>
  | Readonly<{ encoding: 'bytes'; value: readonly number[] }>;

export type RemoteExecutableProjectSnapshotWire = Readonly<{
  format: ExecutableProjectSnapshot['format'];
  workspace: ExecutableProjectSnapshot['workspace'];
  target: ExecutableProjectSnapshot['target'];
  contentDigest: string;
  files: readonly Readonly<{
    path: string;
    contents: RemoteExecutableProjectFileContentsWire;
    sourceTrace?: readonly ExecutionSourceTrace[];
  }>[];
  dependencyPlan: Readonly<{
    manifestFilePath: string;
    lockFilePath?: string;
  }>;
  entrypoints: ExecutableProjectSnapshot['entrypoints'];
  capabilityRequirements: ExecutableProjectSnapshot['capabilityRequirements'];
  publicBuildConfiguration: ExecutableProjectSnapshot['publicBuildConfiguration'];
  resourceHints: ExecutableProjectSnapshot['resourceHints'];
  cacheHints: ExecutableProjectSnapshot['cacheHints'];
  dataMockProvision?: ExecutableProjectSnapshot['dataMockProvision'];
  serverRuntimeMockProvision?: ExecutableProjectSnapshot['serverRuntimeMockProvision'];
  installCommand: ExecutableProjectSnapshot['installCommand'];
  previewCommand: ExecutableProjectSnapshot['previewCommand'];
  buildCommand: ExecutableProjectSnapshot['buildCommand'];
  previewPlan: ExecutableProjectSnapshot['previewPlan'];
  buildPlan: ExecutableProjectSnapshot['buildPlan'];
  testPlan: ExecutableProjectSnapshot['testPlan'];
  serverFunctionPlan?: ExecutableProjectSnapshot['serverFunctionPlan'];
}>;

export type RemoteExecutionSnapshotSource =
  | Readonly<{
      kind: 'reference';
      snapshotId: string;
      contentDigest: string;
    }>
  | Readonly<{
      kind: 'upload';
      snapshot: ExecutableProjectSnapshot;
    }>;

export type RemoteExecutionSnapshotSourceWire =
  | Extract<RemoteExecutionSnapshotSource, { kind: 'reference' }>
  | Readonly<{
      kind: 'upload';
      snapshot: RemoteExecutableProjectSnapshotWire;
    }>;

export type RemoteExecutionRecord = Readonly<{
  executionId: string;
  requestId: string;
  snapshotDigest: string;
  provider: ExecutionProviderDescriptor;
  status: ExecutionJobStatus;
  latestCursor: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}>;

export type RemoteExecutionEventRecord = Readonly<{
  cursor: number;
  event: ExecutionJobEvent;
}>;

export type RemoteExecutionArtifactDescriptor = Readonly<{
  artifactId: string;
  kind: ExecutionArtifactKind;
  label?: string;
  mediaType: string;
  size: number;
  digest: string;
  expiresAt: number;
  authorizationScope: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
  metadata?: Readonly<Record<string, string>>;
}>;

export type RemoteExecutionCreateResult = Readonly<{
  execution: RemoteExecutionRecord;
}>;

export type RemoteExecutionEventsResult = Readonly<{
  executionId: string;
  providerId: string;
  afterCursor: number;
  latestCursor: number;
  hasMore: boolean;
  events: readonly RemoteExecutionEventRecord[];
}>;

export type RemoteExecutionArtifactResult = Readonly<{
  executionId: string;
  providerId: string;
  artifact: RemoteExecutionArtifactDescriptor;
}>;

export type RemoteExecutionCancelResult = Readonly<{
  executionId: string;
  cancellationId: string;
  result: ExecutionCancellationResult;
}>;

export type RemoteExecutionClientDiagnostic = ProdivixDiagnostic &
  Readonly<{
    domain: 'workspace';
    retryable: boolean;
  }>;

export type RemoteExecutionTransport = Readonly<{
  send(envelope: RemoteExecutionRequestEnvelope): Promise<unknown>;
}>;

export type RemoteExecutionClient = Readonly<{
  negotiate(): Promise<RemoteExecutionProtocolVersion>;
  create(
    input: Readonly<{
      request: ExecutionRequest;
      snapshot: RemoteExecutionSnapshotSource;
    }>
  ): Promise<RemoteExecutionCreateResult>;
  get(executionId: string): Promise<RemoteExecutionRecord>;
  cancel(
    input: Readonly<{
      executionId: string;
      cancellationId: string;
      reason?: string;
    }>
  ): Promise<RemoteExecutionCancelResult>;
  readEvents(
    input: Readonly<{
      executionId: string;
      afterCursor: number;
      limit?: number;
    }>
  ): Promise<RemoteExecutionEventsResult>;
  resolveArtifact(
    input: Readonly<{
      executionId: string;
      artifactId: string;
    }>
  ): Promise<RemoteExecutionArtifactResult>;
}>;
