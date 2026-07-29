import type { VerificationCheckReportCandidate } from './verificationCheckReport.types';
import type {
  VerificationAdapterDescriptor,
  VerificationAdapterIdentity,
  VerificationAdapterPreflight,
  VerificationAdapterRegistrySnapshot,
  VerificationAdapterToolIdentity,
  VerificationArtifactKind,
  VerificationInputKind,
  VerificationPlanCell,
} from './verification.types';

export type VerificationAbortSignal = Readonly<{
  readonly aborted: boolean;
  reason?: string;
  subscribe(listener: (reason?: string) => void): () => void;
}>;

export type VerificationAbortController = Readonly<{
  signal: VerificationAbortSignal;
  abort(reason?: string): void;
}>;

export type VerificationAdapterInputRef = Readonly<{
  id: string;
  kind: VerificationInputKind;
  digest: string;
  size: number;
  mediaType?: string;
}>;

export type VerificationAdapterInputResolver = Readonly<{
  read(
    input: VerificationAdapterInputRef,
    signal: VerificationAbortSignal
  ): Promise<Uint8Array>;
}>;

export type VerificationAdapterArtifactStagingResult =
  | Readonly<{
      status: 'staged';
      stagingArtifactId: string;
      digest: string;
      size: number;
      mediaType: string;
    }>
  | Readonly<{
      status: 'rejected';
      reasonCode: string;
      message: string;
    }>;

export type VerificationAdapterArtifactCandidate = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  mediaType: string;
  bytes: Uint8Array;
}>;

export type VerificationAdapterStagedArtifactRef = Readonly<{
  id: string;
  stagingArtifactId: string;
  kind: VerificationArtifactKind;
  digest: string;
  size: number;
  mediaType: string;
}>;

export type VerificationAdapterArtifactAttemptCoordinates = Readonly<{
  planDigest: string;
  cellId: string;
  attemptId: string;
  generation: number;
}>;

export type VerificationAdapterArtifactStagingRequest =
  VerificationAdapterArtifactAttemptCoordinates &
    Readonly<{
      artifact: VerificationAdapterArtifactCandidate;
    }>;

export type VerificationAdapterArtifactRetirementResult =
  | Readonly<{
      status: 'retired';
      planDigest: string;
      cellId: string;
      attemptId: string;
      generation: number;
    }>
  | Readonly<{
      status: 'failed';
      reasonCode: string;
    }>;

export type VerificationAdapterArtifactStagingPort = Readonly<{
  stage(
    artifact: VerificationAdapterArtifactCandidate,
    signal: VerificationAbortSignal
  ): Promise<VerificationAdapterArtifactStagingResult>;
}>;

/**
 * Core-owned persistence transport. Implementations must atomically reject a
 * stage whose attempt generation has already been retired.
 */
export type VerificationAdapterArtifactStagingTransportPort = Readonly<{
  stage(
    input: VerificationAdapterArtifactStagingRequest,
    signal: VerificationAbortSignal
  ): Promise<VerificationAdapterArtifactStagingResult>;
}>;

/**
 * Atomically closes one attempt generation against future stages and removes
 * every object already written for it, including objects unknown to the
 * caller because their stage receipt arrived late.
 */
export type VerificationAdapterArtifactRetirementPort = Readonly<{
  retireAttempt(
    input: VerificationAdapterArtifactAttemptCoordinates,
    signal: VerificationAbortSignal
  ): Promise<VerificationAdapterArtifactRetirementResult>;
}>;

export type VerificationAdapterLifecycleContext = Readonly<{
  registrySnapshotDigest: string;
  adapter: VerificationAdapterIdentity;
  runtimeZone: string;
  runtimeEnvironmentDigest: string;
  inputDigest: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest?: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigest?: string;
  controlCapabilityIds: readonly string[];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  inputRefs: readonly VerificationAdapterInputRef[];
  inputResolver: VerificationAdapterInputResolver;
  artifactStaging: VerificationAdapterArtifactStagingTransportPort;
  abortSignal: VerificationAbortSignal;
}>;

export type VerificationAdapterContext = Omit<
  VerificationAdapterLifecycleContext,
  'artifactStaging' | 'inputResolver' | 'abortSignal'
> &
  Readonly<{
    resolvedInputSetDigest: string;
    inputResolver: VerificationAdapterInputResolver;
    artifactStaging: VerificationAdapterArtifactStagingPort;
    abortSignal: VerificationAbortSignal;
  }>;

export type VerificationAdapterPrepareInput = Readonly<{
  planDigest: string;
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  providerKind: 'browser' | 'remote' | 'export' | 'ci' | 'local';
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  context: VerificationAdapterContext;
}>;

export type PreparedVerificationInvocation = Readonly<{
  invocationId: string;
  planDigest: string;
  cellId: string;
  adapterId: string;
  attemptId: string;
  generation: number;
  providerKind: VerificationAdapterPrepareInput['providerKind'];
  executionId?: string;
  sessionId?: string;
  jobId?: string;
  inputDigest: string;
  resolvedInputSetDigest: string;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  confirmedCursor: number;
  state: 'preparing' | 'running' | 'collecting';
}>;

export type VerificationAdapterPreparedInvocationCandidate = Omit<
  PreparedVerificationInvocation,
  'resolvedInputSetDigest'
>;

export type VerificationAdapterEventCandidate =
  | Readonly<{
      kind: 'progress';
      eventId: string;
      messageKey: string;
      completed: number;
      total: number;
    }>
  | Readonly<{
      kind: 'diagnostic';
      eventId: string;
      code: string;
      sourceTraceDigest?: string;
    }>
  | Readonly<{
      kind: 'artifact';
      eventId: string;
      artifactId: string;
      digest: string;
    }>;

export type VerificationAdapterEventEnvelope = Readonly<{
  sequence: number;
  planDigest: string;
  cellId: string;
  attemptId: string;
  generation: number;
  event: VerificationAdapterEventCandidate;
  eventDigest: string;
}>;

export type VerificationAdapterEventReceipt =
  | Readonly<{ status: 'accepted'; sequence: number }>
  | Readonly<{
      status: 'rejected';
      reason: 'budget-exceeded' | 'duplicate-drift' | 'malformed' | 'terminal';
    }>;

export type VerificationEventSink = Readonly<{
  emit(
    event: VerificationAdapterEventCandidate
  ): VerificationAdapterEventReceipt;
}>;

export type VerificationAdapterCleanupCause =
  | 'success'
  | 'preflight-failed'
  | 'prepare-failed'
  | 'execute-failed'
  | 'cancelled'
  | 'timed-out';

export type VerificationAdapterCleanupInput = Readonly<{
  planDigest: string;
  cellId: string;
  attemptId: string;
  generation: number;
  cause: VerificationAdapterCleanupCause;
  invocation?: PreparedVerificationInvocation;
  abortSignal: VerificationAbortSignal;
}>;

export type VerificationAdapterCleanupResult = Readonly<{
  /**
   * `clean` is the trusted registered adapter's terminal acknowledgement that
   * it has quiesced all attempt-owned work. Core permanently fences every
   * adapter-facing port before accepting that acknowledgement.
   */
  status: 'clean' | 'residual' | 'failed';
  residualCanaryIds: readonly string[];
  diagnosticCodes: readonly string[];
}>;

export type VerificationAdapterFactoryContext = Readonly<{
  descriptor: VerificationAdapterDescriptor;
  identity: VerificationAdapterIdentity;
  tool: VerificationAdapterToolIdentity;
  runtimeZone: string;
  registrySnapshotDigest: string;
}>;

export type VerificationAdapterFactory = (
  context: VerificationAdapterFactoryContext
) => VerificationAdapter;

export type VerificationAdapter = Readonly<{
  preflight(
    cell: VerificationPlanCell,
    context: VerificationAdapterContext
  ): Promise<VerificationAdapterPreflight>;
  prepare(
    input: VerificationAdapterPrepareInput
  ): Promise<VerificationAdapterPreparedInvocationCandidate>;
  execute(
    invocation: PreparedVerificationInvocation,
    sink: VerificationEventSink
  ): Promise<VerificationCheckReportCandidate>;
  cleanup(
    input: VerificationAdapterCleanupInput
  ): Promise<VerificationAdapterCleanupResult>;
}>;

/**
 * The caller must hold the authoritative AttemptGrant for the exact
 * workspace/plan/cell/attempt tuple before entering this boundary. Core
 * single-flights concurrent calls in one process and generation-fences
 * runtime/staging writes; sequential and cross-process exactly-once ownership
 * remains with AttemptGrant issuance and promotion claim authority.
 */
export type ExecuteVerificationAdapterLifecycleInput = Readonly<{
  factory: VerificationAdapterFactory;
  registrySnapshot: VerificationAdapterRegistrySnapshot;
  planDigest: string;
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  providerKind: VerificationAdapterPrepareInput['providerKind'];
  context: VerificationAdapterLifecycleContext;
  artifactRetirement: VerificationAdapterArtifactRetirementPort;
}>;

export type VerificationAdapterLifecycleResult =
  | Readonly<{
      status: 'reported';
      report: VerificationCheckReportCandidate;
      invocation: PreparedVerificationInvocation;
      events: readonly VerificationAdapterEventEnvelope[];
      stagedArtifacts: readonly VerificationAdapterStagedArtifactRef[];
      resolvedInputSetDigest: string;
      cleanup: VerificationAdapterCleanupResult;
    }>
  | Readonly<{
      status: 'unsupported' | 'blocked' | 'failed' | 'cancelled' | 'timed-out';
      reasonCode: string;
      failureClass:
        | 'unsupported-capability'
        | 'fixture-control'
        | 'environment'
        | 'adapter-infrastructure'
        | 'contract-mismatch'
        | 'security-denial'
        | 'cancelled'
        | 'timeout';
      invocation?: PreparedVerificationInvocation;
      events: readonly VerificationAdapterEventEnvelope[];
      resolvedInputSetDigest: string;
      cleanup: VerificationAdapterCleanupResult;
    }>;
