import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';
import type { ExecutionEnvironmentSnapshotRef } from './executionEnvironment';

export const EXECUTION_PROFILES = Object.freeze([
  'preview',
  'test',
  'build',
  'production',
] as const);

export type ExecutionProfile = (typeof EXECUTION_PROFILES)[number];

export const RUNTIME_ZONES = Object.freeze([
  'client',
  'worker',
  'server',
  'edge',
  'build',
  'test',
] as const);

export type RuntimeZone = (typeof RUNTIME_ZONES)[number];

export const EXECUTION_INVOCATION_KINDS = Object.freeze([
  'workspace',
  'route',
  'code',
  'nodegraph',
  'animation',
  'test',
  'build',
] as const);

export type ExecutionInvocationKind =
  (typeof EXECUTION_INVOCATION_KINDS)[number];

export const EXECUTION_PROVIDER_CAPABILITIES = Object.freeze([
  'cancellation',
  'timeout',
  'streaming-logs',
  'diagnostics',
  'artifacts',
  'source-trace',
  'filesystem',
  'dependency-install',
  'hmr',
  'console',
  'network',
  'environment-binding',
  'terminal',
  'test',
  'build',
] as const);

export type ExecutionProviderCapability =
  (typeof EXECUTION_PROVIDER_CAPABILITIES)[number];

export type ExecutionValue =
  | null
  | boolean
  | number
  | string
  | readonly ExecutionValue[]
  | Readonly<{ [key: string]: ExecutionValue }>;

export type ExecutionWorkspaceSnapshotRef = Readonly<{
  workspaceId: string;
  snapshotId: string;
  partitionRevisions?: Readonly<Record<string, string>>;
}>;

export type ExecutionInvocation = Readonly<{
  kind: ExecutionInvocationKind;
  targetRef: DiagnosticTargetRef;
  entrypoint?: string;
  input?: ExecutionValue;
}>;

export type ExecutionRequest = Readonly<{
  requestId: string;
  profile: ExecutionProfile;
  runtimeZone: RuntimeZone;
  workspace: ExecutionWorkspaceSnapshotRef;
  environment?: ExecutionEnvironmentSnapshotRef;
  invocation: ExecutionInvocation;
  requiredCapabilities: readonly ExecutionProviderCapability[];
  timeoutMs?: number;
  metadata?: Readonly<Record<string, string>>;
}>;

export type ExecutionRequestInput = Omit<
  ExecutionRequest,
  | 'requiredCapabilities'
  | 'workspace'
  | 'environment'
  | 'invocation'
  | 'metadata'
> &
  Readonly<{
    workspace: ExecutionWorkspaceSnapshotRef;
    environment?: ExecutionEnvironmentSnapshotRef;
    invocation: ExecutionInvocation;
    requiredCapabilities?: readonly ExecutionProviderCapability[];
    metadata?: Readonly<Record<string, string>>;
  }>;

export const EXECUTION_PROVIDER_ISOLATIONS = Object.freeze([
  'same-context',
  'worker',
  'sandboxed',
  'remote-isolated',
] as const);

export type ExecutionProviderIsolation =
  (typeof EXECUTION_PROVIDER_ISOLATIONS)[number];

export type ExecutionProviderDescriptor = Readonly<{
  id: string;
  version: string;
  displayName?: string;
  isolation: ExecutionProviderIsolation;
  profiles: readonly ExecutionProfile[];
  runtimeZones: readonly RuntimeZone[];
  invocationKinds: readonly ExecutionInvocationKind[];
  capabilities: readonly ExecutionProviderCapability[];
}>;

export type ExecutionProviderDescriptorInput = Omit<
  ExecutionProviderDescriptor,
  'profiles' | 'runtimeZones' | 'invocationKinds' | 'capabilities'
> &
  Readonly<{
    profiles: readonly ExecutionProfile[];
    runtimeZones: readonly RuntimeZone[];
    invocationKinds: readonly ExecutionInvocationKind[];
    capabilities?: readonly ExecutionProviderCapability[];
  }>;

export type ExecutionProviderIncompatibility =
  | Readonly<{ kind: 'profile'; profile: ExecutionProfile }>
  | Readonly<{ kind: 'runtime-zone'; runtimeZone: RuntimeZone }>
  | Readonly<{
      kind: 'invocation';
      invocationKind: ExecutionInvocationKind;
    }>
  | Readonly<{
      kind: 'capability';
      capability: ExecutionProviderCapability;
    }>;

export type ExecutionProviderCompatibility =
  | Readonly<{ compatible: true }>
  | Readonly<{
      compatible: false;
      reasons: readonly ExecutionProviderIncompatibility[];
    }>;

export type ExecutionSourceTrace = Readonly<{
  sourceRef: DiagnosticTargetRef;
  sourceSpan?: SourceSpan;
  label?: string;
}>;

export type ExecutionLogStream = 'stdout' | 'stderr' | 'console';

export type ExecutionLogLevel =
  'trace' | 'debug' | 'info' | 'warning' | 'error';

export const EXECUTION_LOG_CATEGORIES = Object.freeze([
  'application',
  'runtime',
  'process',
  'system',
] as const);

export type ExecutionLogCategory = (typeof EXECUTION_LOG_CATEGORIES)[number];

export type ExecutionLogRecord = Readonly<{
  stream: ExecutionLogStream;
  level: ExecutionLogLevel;
  category?: ExecutionLogCategory;
  message: string;
  arguments?: readonly ExecutionValue[];
  data?: ExecutionValue;
  redacted?: boolean;
  truncated?: boolean;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionArtifactKind =
  'file' | 'bundle' | 'report' | 'coverage' | 'screenshot' | 'trace' | 'custom';

export type ExecutionArtifact = Readonly<{
  artifactId: string;
  kind: ExecutionArtifactKind;
  label?: string;
  mediaType?: string;
  uri?: string;
  size?: number;
  digest?: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
  metadata?: Readonly<Record<string, string>>;
}>;

export type ExecutionTracePhase = 'start' | 'event' | 'end';

export type ExecutionTraceRecord = Readonly<{
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  phase: ExecutionTracePhase;
  detail?: ExecutionValue;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionFailure = Readonly<{
  code: string;
  message: string;
  retryable?: boolean;
  details?: Readonly<Record<string, ExecutionValue>>;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionJobStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed-out';

export type ExecutionJobSnapshot = Readonly<{
  jobId: string;
  requestId: string;
  providerId: string;
  status: ExecutionJobStatus;
  latestEventSequence: number;
  createdAt: number;
  startedAt?: number;
  cancellationRequestedAt?: number;
  completedAt?: number;
}>;

type ExecutionJobEventBase = Readonly<{
  jobId: string;
  sequence: number;
  emittedAt: number;
}>;

export type ExecutionJobStateEvent = ExecutionJobEventBase &
  Readonly<{
    kind: 'state';
    previousStatus?: ExecutionJobStatus;
    snapshot: ExecutionJobSnapshot;
    reason?: string;
  }>;

export type ExecutionJobLogEvent = ExecutionJobEventBase &
  Readonly<{
    kind: 'log';
    log: ExecutionLogRecord;
  }>;

export type ExecutionJobDiagnosticEvent = ExecutionJobEventBase &
  Readonly<{
    kind: 'diagnostic';
    diagnostic: ProdivixDiagnostic;
  }>;

export type ExecutionJobArtifactEvent = ExecutionJobEventBase &
  Readonly<{
    kind: 'artifact';
    artifact: ExecutionArtifact;
  }>;

export type ExecutionJobTraceEvent = ExecutionJobEventBase &
  Readonly<{
    kind: 'trace';
    trace: ExecutionTraceRecord;
  }>;

export type ExecutionJobEvent =
  | ExecutionJobStateEvent
  | ExecutionJobLogEvent
  | ExecutionJobDiagnosticEvent
  | ExecutionJobArtifactEvent
  | ExecutionJobTraceEvent;

export type ExecutionJobResultBase = Readonly<{
  jobId: string;
  requestId: string;
  providerId: string;
  createdAt: number;
  startedAt?: number;
  completedAt: number;
  diagnostics: readonly ProdivixDiagnostic[];
  artifacts: readonly ExecutionArtifact[];
}>;

export type ExecutionJobSucceededResult = ExecutionJobResultBase &
  Readonly<{
    status: 'succeeded';
    output?: ExecutionValue;
    exitCode?: number;
  }>;

export type ExecutionJobFailedResult = ExecutionJobResultBase &
  Readonly<{
    status: 'failed';
    failure: ExecutionFailure;
    exitCode?: number;
  }>;

export type ExecutionJobCancelledResult = ExecutionJobResultBase &
  Readonly<{
    status: 'cancelled';
    reason?: string;
  }>;

export type ExecutionJobTimedOutResult = ExecutionJobResultBase &
  Readonly<{
    status: 'timed-out';
    timeoutMs?: number;
  }>;

export type ExecutionJobResult =
  | ExecutionJobSucceededResult
  | ExecutionJobFailedResult
  | ExecutionJobCancelledResult
  | ExecutionJobTimedOutResult;

export type ExecutionCancellationRequest = Readonly<{
  reason?: string;
}>;

export type ExecutionCancellationResult = Readonly<{
  status:
    | 'accepted'
    | 'already-requested'
    | 'already-terminal'
    | 'unsupported'
    | 'rejected';
  reason?: string;
}>;

export type ExecutionJobEventListener = (event: ExecutionJobEvent) => void;

export type ExecutionJob = Readonly<{
  id: string;
  request: ExecutionRequest;
  provider: ExecutionProviderDescriptor;
  getSnapshot(): ExecutionJobSnapshot;
  subscribe(
    listener: ExecutionJobEventListener,
    options?: Readonly<{ afterSequence?: number }>
  ): () => void;
  completion: Promise<ExecutionJobResult>;
  cancel(
    request?: ExecutionCancellationRequest
  ): Promise<ExecutionCancellationResult>;
}>;

export type ExecutionProvider = Readonly<{
  descriptor: ExecutionProviderDescriptor;
  start(request: ExecutionRequest): Promise<ExecutionJob>;
}>;
