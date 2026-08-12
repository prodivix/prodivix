import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  createVerificationAdapterRegistration,
  digestVerificationValue,
  normalizeVerificationAdapterDescriptor,
  type PreparedVerificationInvocation,
  type VerificationAbortSignal,
  type VerificationAdapter,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactRetirementResult,
  type VerificationAdapterArtifactStagingRequest,
  type VerificationAdapterArtifactStagingResult,
  type VerificationAdapterCleanupResult,
  type VerificationAdapterFactory,
  type VerificationAdapterIdentity,
  type VerificationAdapterPrepareInput,
  type VerificationAdapterRegistration,
  type VerificationAdapterStagedArtifactRef,
  type VerificationAdapterToolIdentity,
  type VerificationCheckReportCandidate,
  type VerificationEvidenceCandidateProvenance,
  type VerificationEvidenceSourceTrace,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  decodeExecutableProjectSnapshotArtifact,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentEvaluationControlledWorkspaceG3CellCompletion } from './controlledWorkspaceRuntimeProduction';
import type { AgentEvaluationVerificationAttemptGrantRunIdentity } from './verificationAttemptGrantClient';

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_ID =
  'adapter:g4-evaluation-sandbox' as const;
export const AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_FORMAT =
  'prodivix.agent-evaluation-g3-replay-record' as const;
export const AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_VERSION = 1 as const;
export const AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE =
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE;
export const AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST =
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST;
export const AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE =
  'application/vnd.prodivix.verification-replay-record+json' as const;

const maximumSnapshotBytes = 8_388_608;
const maximumReplayBytes = 16_777_216;
const maximumAssertions = 4_096;
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR = Object.freeze({
  id: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_ID,
  implementation: Object.freeze({
    packageName: '@prodivix/agent-evaluation-runner',
    packageVersion: '0.0.1',
    buildDigest: digestAgentCanonicalValue('g4-evaluation-adapter-build-v1'),
    toolchainDigest: digestAgentCanonicalValue(
      'g4-evaluation-adapter-toolchain-v1'
    ),
    schemaDigest: digestAgentCanonicalValue('g4-evaluation-adapter-schema-v1'),
  }),
  checkKinds: Object.freeze(['integration'] as const),
  surfaces: Object.freeze(['preview'] as const),
  targets: Object.freeze(['react-vite', 'vue-vite']),
  browserEngines: Object.freeze(['chromium'] as const),
  controlCapabilities: Object.freeze([
    'agent-evaluation.controlled-workspace-runtime',
  ]),
  inputKinds: Object.freeze(['executable-snapshot'] as const),
  artifactKinds: Object.freeze(['replay-record'] as const),
  budgets: Object.freeze({
    maximumDurationMs: 120_000,
    maximumArtifactBytes: maximumReplayBytes,
    maximumEvents: maximumAssertions,
  }),
  trustInputs: Object.freeze(['remote-attested'] as const),
});

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_TOOL = Object.freeze({
  name: '@prodivix/agent-evaluation-runner',
  version: '0.0.1',
  schemaVersion: 1,
  schemaDigest:
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR.implementation.schemaDigest,
}) satisfies VerificationAdapterToolIdentity;

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION: VerificationAdapterRegistration =
  createVerificationAdapterRegistration(
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR,
    {
      tool: AGENT_EVALUATION_G3_SANDBOX_ADAPTER_TOOL,
      runtimeZones: Object.freeze(['sandbox']),
    }
  );

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY =
  AGENT_EVALUATION_G3_SANDBOX_ADAPTER_REGISTRATION.identity;

export const AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    packageName: '@prodivix/agent-evaluation-runner',
    owner: 'production-g4-evaluation-sandbox-adapter',
    version: 1,
    descriptorDigest:
      AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.descriptorDigest,
    toolchainDigest:
      AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.toolchainDigest,
    capabilityDigest:
      AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.capabilityDigest,
  });

export type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource =
  () => readonly string[];

export type AgentEvaluationControlledWorkspaceG3SandboxBindInput = Readonly<{
  authorityInputDigest: CanonicalDigest;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  caseId: string;
  attemptId: string;
  generation: number;
  planDigest: CanonicalDigest;
  registrySnapshotDigest: CanonicalDigest;
  cell: VerificationPlanCell;
  adapter: VerificationAdapterIdentity;
  finalSnapshotRef: string;
  finalSnapshotDigest: CanonicalDigest;
  finalRevision: number;
}>;

export type AgentEvaluationControlledWorkspaceG3SandboxBinding = Readonly<{
  format: 'prodivix.agent-evaluation-g3-sandbox-binding';
  version: 1;
  bindingId: string;
  authorityInputDigest: CanonicalDigest;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  caseId: string;
  attemptId: string;
  generation: number;
  planDigest: CanonicalDigest;
  registrySnapshotDigest: CanonicalDigest;
  cellId: string;
  scenarioId?: string;
  adapter: VerificationAdapterIdentity;
  tool: VerificationAdapterToolIdentity;
  runtimeAuthorityId: string;
  runtimeImplementationDigest: CanonicalDigest;
  artifactSourceAuthorityDigest: CanonicalDigest;
  attestationAuthorityDigest: CanonicalDigest;
  providerKind: 'remote';
  runtimeEnvironmentDigest: CanonicalDigest;
  scenarioProgramDigest?: CanonicalDigest;
  controlCapabilitySnapshotDigest: CanonicalDigest;
  appliedControlDigest: CanonicalDigest;
  finalWorkspaceSnapshotDigest: CanonicalDigest;
  compilerProjectionReceiptDigest: CanonicalDigest;
  executableSnapshot: Readonly<{
    id: string;
    sourceRef: string;
    artifactDigest: CanonicalDigest;
    semanticSnapshotDigest: CanonicalDigest;
    size: number;
    mediaType: typeof AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE;
    codecSchemaDigest: typeof AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST;
  }>;
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  bindingDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceG3SandboxLease = Readonly<{
  format: 'prodivix.agent-evaluation-g3-sandbox-lease';
  version: 1;
  leaseId: string;
  bindingDigest: CanonicalDigest;
  invocationId: string;
  attemptId: string;
  generation: number;
  resolvedInputSetDigest: CanonicalDigest;
  executionId?: string;
  sessionId?: string;
  jobId?: string;
  confirmedCursor: number;
  leaseReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceG3ReplayAssertion = Readonly<{
  assertionId: string;
  status: 'passed' | 'failed';
  diagnosticCodes: readonly string[];
}>;

export type AgentEvaluationControlledWorkspaceG3ReplayRecord = Readonly<{
  format: typeof AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_FORMAT;
  version: typeof AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_VERSION;
  bindingDigest: CanonicalDigest;
  leaseReceiptDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  cellId: string;
  attemptId: string;
  generation: number;
  resolvedInputSetDigest: CanonicalDigest;
  executableSnapshotArtifactDigest: CanonicalDigest;
  executableSnapshotSemanticDigest: CanonicalDigest;
  executableSnapshotMediaType: typeof AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE;
  executableSnapshotCodecSchemaDigest: typeof AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST;
  runtimeEnvironmentDigest: CanonicalDigest;
  controlCapabilitySnapshotDigest: CanonicalDigest;
  appliedControlDigest: CanonicalDigest;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  assertions: readonly AgentEvaluationControlledWorkspaceG3ReplayAssertion[];
  runtimeReceiptDigests: readonly CanonicalDigest[];
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceG3SandboxCompletion =
  AgentEvaluationControlledWorkspaceG3CellCompletion;

export interface AgentEvaluationControlledWorkspaceG3SandboxPort {
  bind(
    input: AgentEvaluationControlledWorkspaceG3SandboxBindInput
  ): Promise<AgentEvaluationControlledWorkspaceG3SandboxBinding>;
  readExecutableSnapshot(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      signal: VerificationAbortSignal;
    }>
  ): Promise<Uint8Array>;
  prepare(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      planDigest: CanonicalDigest;
      cell: VerificationPlanCell;
      attemptId: string;
      generation: number;
      resolvedInputSetDigest: CanonicalDigest;
      signal: VerificationAbortSignal;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceG3SandboxLease>;
  execute(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      lease: AgentEvaluationControlledWorkspaceG3SandboxLease;
      signal: VerificationAbortSignal;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceG3ReplayRecord>;
  cleanup(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      lease?: AgentEvaluationControlledWorkspaceG3SandboxLease;
      cause:
        | 'success'
        | 'preflight-failed'
        | 'prepare-failed'
        | 'execute-failed'
        | 'cancelled'
        | 'timed-out';
      signal: VerificationAbortSignal;
    }>
  ): Promise<VerificationAdapterCleanupResult>;
  stageArtifact(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      request: VerificationAdapterArtifactStagingRequest;
      signal: VerificationAbortSignal;
    }>
  ): Promise<VerificationAdapterArtifactStagingResult>;
  retireArtifacts(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      attempt: VerificationAdapterArtifactAttemptCoordinates;
      signal: VerificationAbortSignal;
    }>
  ): Promise<VerificationAdapterArtifactRetirementResult>;
  readArtifact(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      artifact: VerificationAdapterStagedArtifactRef;
    }>
  ): Promise<Uint8Array>;
  complete(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      replayArtifactDigest: CanonicalDigest;
      lifecycleDigest: CanonicalDigest;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceG3SandboxCompletion>;
  signAttestation(
    input: Readonly<{
      binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
      authorityDigest: CanonicalDigest;
      verificationAttemptGrantReceiptDigest: CanonicalDigest;
      candidateDigest: CanonicalDigest;
      attestationNonce: string;
      attestationStatement: AgentJsonValue;
      attestationStatementDigest: CanonicalDigest;
    }>
  ): Promise<AgentJsonValue>;
}

type InvocationState = {
  phase: 'preparing' | 'ready' | 'executing' | 'collecting' | 'cleaned';
  input: VerificationAdapterPrepareInput;
  lease?: AgentEvaluationControlledWorkspaceG3SandboxLease;
  prepared?: Omit<PreparedVerificationInvocation, 'resolvedInputSetDigest'>;
  invocation?: PreparedVerificationInvocation;
  replay?: AgentEvaluationControlledWorkspaceG3ReplayRecord;
  canaryId: string;
};

const fail = (message: string): never => {
  throw new TypeError(`G4_CONTROLLED_WORKSPACE_G3_SANDBOX_INVALID: ${message}`);
};

const canonicalInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const canonicalIdentity = (value: unknown): value is string =>
  typeof value === 'string' && identityPattern.test(value);

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const sameStringSet = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  const canonicalLeft = [...left].sort(compareUnicodeCodePoints);
  const canonicalRight = [...right].sort(compareUnicodeCodePoints);
  return (
    canonicalLeft.length === canonicalRight.length &&
    canonicalLeft.every((value, index) => value === canonicalRight[index])
  );
};

const bindingBase = (
  binding: Omit<
    AgentEvaluationControlledWorkspaceG3SandboxBinding,
    'bindingDigest'
  >
) => binding;

export const createAgentEvaluationControlledWorkspaceG3SandboxBinding = (
  input: Omit<
    AgentEvaluationControlledWorkspaceG3SandboxBinding,
    'format' | 'version' | 'bindingDigest'
  >
): AgentEvaluationControlledWorkspaceG3SandboxBinding => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-g3-sandbox-binding' as const,
    version: 1 as const,
    ...input,
  });
  return Object.freeze({
    ...base,
    bindingDigest: digestAgentCanonicalValue(base),
  });
};

const isExactBinding = (
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  expected: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): boolean => {
  const { bindingDigest: _bindingDigest, ...base } = binding;
  return (
    exactRecord(
      binding,
      [
        'format',
        'version',
        'bindingId',
        'authorityInputDigest',
        'evaluationPlanDigest',
        'repositoryCommit',
        'projectId',
        'caseId',
        'attemptId',
        'generation',
        'planDigest',
        'registrySnapshotDigest',
        'cellId',
        'adapter',
        'tool',
        'runtimeAuthorityId',
        'runtimeImplementationDigest',
        'artifactSourceAuthorityDigest',
        'attestationAuthorityDigest',
        'providerKind',
        'runtimeEnvironmentDigest',
        'controlCapabilitySnapshotDigest',
        'appliedControlDigest',
        'finalWorkspaceSnapshotDigest',
        'compilerProjectionReceiptDigest',
        'executableSnapshot',
        'run',
        'bindingDigest',
      ],
      ['scenarioId', 'scenarioProgramDigest']
    ) &&
    binding.format === 'prodivix.agent-evaluation-g3-sandbox-binding' &&
    binding.version === 1 &&
    canonicalIdentity(binding.bindingId) &&
    binding.authorityInputDigest === expected.authorityInputDigest &&
    binding.evaluationPlanDigest === expected.evaluationPlanDigest &&
    binding.repositoryCommit === expected.repositoryCommit &&
    binding.projectId === expected.projectId &&
    binding.caseId === expected.caseId &&
    binding.attemptId === expected.attemptId &&
    binding.generation === expected.generation &&
    binding.planDigest === expected.planDigest &&
    binding.registrySnapshotDigest === expected.registrySnapshotDigest &&
    binding.cellId === expected.cell.id &&
    binding.scenarioId === expected.cell.scenarioId &&
    sameCanonicalJson(binding.adapter, expected.adapter) &&
    sameCanonicalJson(
      binding.adapter,
      AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY
    ) &&
    sameCanonicalJson(binding.tool, AGENT_EVALUATION_G3_SANDBOX_ADAPTER_TOOL) &&
    canonicalIdentity(binding.runtimeAuthorityId) &&
    isAgentCanonicalDigest(binding.runtimeImplementationDigest) &&
    isAgentCanonicalDigest(binding.artifactSourceAuthorityDigest) &&
    isAgentCanonicalDigest(binding.attestationAuthorityDigest) &&
    binding.providerKind === 'remote' &&
    isAgentCanonicalDigest(binding.runtimeEnvironmentDigest) &&
    (expected.cell.scenarioId === undefined
      ? binding.scenarioProgramDigest === undefined
      : isAgentCanonicalDigest(binding.scenarioProgramDigest)) &&
    isAgentCanonicalDigest(binding.controlCapabilitySnapshotDigest) &&
    isAgentCanonicalDigest(binding.appliedControlDigest) &&
    binding.finalWorkspaceSnapshotDigest === expected.finalSnapshotDigest &&
    isAgentCanonicalDigest(binding.compilerProjectionReceiptDigest) &&
    exactRecord(binding.executableSnapshot, [
      'id',
      'sourceRef',
      'artifactDigest',
      'semanticSnapshotDigest',
      'size',
      'mediaType',
      'codecSchemaDigest',
    ]) &&
    canonicalIdentity(binding.executableSnapshot.id) &&
    canonicalIdentity(binding.executableSnapshot.sourceRef) &&
    isAgentCanonicalDigest(binding.executableSnapshot.artifactDigest) &&
    isAgentCanonicalDigest(binding.executableSnapshot.semanticSnapshotDigest) &&
    binding.executableSnapshot.artifactDigest !==
      binding.executableSnapshot.semanticSnapshotDigest &&
    Number.isSafeInteger(binding.executableSnapshot.size) &&
    binding.executableSnapshot.size >= 1 &&
    binding.executableSnapshot.size <= maximumSnapshotBytes &&
    binding.executableSnapshot.mediaType ===
      AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_MEDIA_TYPE &&
    binding.executableSnapshot.codecSchemaDigest ===
      AGENT_EVALUATION_G3_SANDBOX_EXECUTABLE_CODEC_SCHEMA_DIGEST &&
    isAgentControlIdentity(binding.run.runId) &&
    isAgentControlIdentity(binding.run.providerId) &&
    binding.run.parentAttemptId === expected.attemptId &&
    binding.run.surface === expected.cell.surface &&
    binding.run.frameworkTarget === expected.cell.frameworkTarget &&
    binding.run.runtimeZone === 'sandbox' &&
    binding.run.browserEngine === expected.cell.browserEngine &&
    sameCanonicalJson(binding.run.viewport, expected.cell.viewport) &&
    binding.run.colorScheme === expected.cell.colorScheme &&
    binding.run.motion === expected.cell.motion &&
    binding.run.locale === expected.cell.locale &&
    binding.bindingDigest === digestAgentCanonicalValue(bindingBase(base))
  );
};

const leaseBase = (
  lease: Omit<
    AgentEvaluationControlledWorkspaceG3SandboxLease,
    'leaseReceiptDigest'
  >
) => lease;

export const createAgentEvaluationControlledWorkspaceG3SandboxLease = (
  input: Omit<
    AgentEvaluationControlledWorkspaceG3SandboxLease,
    'format' | 'version' | 'leaseReceiptDigest'
  >
): AgentEvaluationControlledWorkspaceG3SandboxLease => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-g3-sandbox-lease' as const,
    version: 1 as const,
    ...input,
  });
  return Object.freeze({
    ...base,
    leaseReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const isExactLease = (
  lease: AgentEvaluationControlledWorkspaceG3SandboxLease,
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  input: VerificationAdapterPrepareInput
): boolean => {
  const { leaseReceiptDigest: _leaseReceiptDigest, ...base } = lease;
  return (
    exactRecord(
      lease,
      [
        'format',
        'version',
        'leaseId',
        'bindingDigest',
        'invocationId',
        'attemptId',
        'generation',
        'resolvedInputSetDigest',
        'confirmedCursor',
        'leaseReceiptDigest',
      ],
      ['executionId', 'sessionId', 'jobId']
    ) &&
    lease.format === 'prodivix.agent-evaluation-g3-sandbox-lease' &&
    lease.version === 1 &&
    canonicalIdentity(lease.leaseId) &&
    lease.bindingDigest === binding.bindingDigest &&
    canonicalIdentity(lease.invocationId) &&
    lease.attemptId === input.attemptId &&
    lease.generation === input.generation &&
    lease.resolvedInputSetDigest === input.context.resolvedInputSetDigest &&
    (lease.executionId === undefined || canonicalIdentity(lease.executionId)) &&
    (lease.sessionId === undefined || canonicalIdentity(lease.sessionId)) &&
    (lease.jobId === undefined || canonicalIdentity(lease.jobId)) &&
    Number.isSafeInteger(lease.confirmedCursor) &&
    lease.confirmedCursor >= 0 &&
    lease.leaseReceiptDigest === digestAgentCanonicalValue(leaseBase(base))
  );
};

const replayBase = (
  replay: Omit<AgentEvaluationControlledWorkspaceG3ReplayRecord, 'recordDigest'>
) => replay;

export const createAgentEvaluationControlledWorkspaceG3ReplayRecord = (
  input: Omit<
    AgentEvaluationControlledWorkspaceG3ReplayRecord,
    'format' | 'version' | 'recordDigest'
  >
): AgentEvaluationControlledWorkspaceG3ReplayRecord => {
  const assertions = Object.freeze(
    [...input.assertions].sort((left, right) =>
      compareUnicodeCodePoints(left.assertionId, right.assertionId)
    )
  );
  const runtimeReceiptDigests = Object.freeze(
    [...input.runtimeReceiptDigests].sort(compareUnicodeCodePoints)
  );
  const base = Object.freeze({
    format: AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_FORMAT,
    version: AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_VERSION,
    ...input,
    assertions,
    runtimeReceiptDigests,
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const isExactReplay = (
  replay: AgentEvaluationControlledWorkspaceG3ReplayRecord,
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  lease: AgentEvaluationControlledWorkspaceG3SandboxLease,
  invocation: PreparedVerificationInvocation
): boolean => {
  const { recordDigest: _recordDigest, ...base } = replay;
  const assertionIds = replay.assertions.map(({ assertionId }) => assertionId);
  return (
    exactRecord(replay, [
      'format',
      'version',
      'bindingDigest',
      'leaseReceiptDigest',
      'planDigest',
      'cellId',
      'attemptId',
      'generation',
      'resolvedInputSetDigest',
      'executableSnapshotArtifactDigest',
      'executableSnapshotSemanticDigest',
      'executableSnapshotMediaType',
      'executableSnapshotCodecSchemaDigest',
      'runtimeEnvironmentDigest',
      'controlCapabilitySnapshotDigest',
      'appliedControlDigest',
      'startedAt',
      'completedAt',
      'durationMs',
      'assertions',
      'runtimeReceiptDigests',
      'recordDigest',
    ]) &&
    replay.format === AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_FORMAT &&
    replay.version === AGENT_EVALUATION_G3_SANDBOX_REPLAY_RECORD_VERSION &&
    replay.bindingDigest === binding.bindingDigest &&
    replay.leaseReceiptDigest === lease.leaseReceiptDigest &&
    replay.planDigest === invocation.planDigest &&
    replay.cellId === invocation.cellId &&
    replay.attemptId === invocation.attemptId &&
    replay.generation === invocation.generation &&
    replay.resolvedInputSetDigest === invocation.resolvedInputSetDigest &&
    replay.executableSnapshotArtifactDigest ===
      binding.executableSnapshot.artifactDigest &&
    replay.executableSnapshotSemanticDigest ===
      binding.executableSnapshot.semanticSnapshotDigest &&
    replay.executableSnapshotMediaType ===
      binding.executableSnapshot.mediaType &&
    replay.executableSnapshotCodecSchemaDigest ===
      binding.executableSnapshot.codecSchemaDigest &&
    replay.runtimeEnvironmentDigest === binding.runtimeEnvironmentDigest &&
    replay.controlCapabilitySnapshotDigest ===
      binding.controlCapabilitySnapshotDigest &&
    replay.appliedControlDigest === binding.appliedControlDigest &&
    canonicalInstant(replay.startedAt) &&
    canonicalInstant(replay.completedAt) &&
    replay.durationMs ===
      Date.parse(replay.completedAt) - Date.parse(replay.startedAt) &&
    replay.durationMs >= 0 &&
    replay.durationMs <=
      AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR.budgets
        .maximumDurationMs &&
    Array.isArray(replay.assertions) &&
    replay.assertions.length >= 1 &&
    replay.assertions.length <= maximumAssertions &&
    assertionIds.length === new Set(assertionIds).size &&
    sameCanonicalJson(
      assertionIds,
      [...assertionIds].sort(compareUnicodeCodePoints)
    ) &&
    replay.assertions.every(
      (assertion) =>
        exactRecord(assertion, ['assertionId', 'status', 'diagnosticCodes']) &&
        canonicalIdentity(assertion.assertionId) &&
        (assertion.status === 'passed' || assertion.status === 'failed') &&
        Array.isArray(assertion.diagnosticCodes) &&
        assertion.diagnosticCodes.length <= 256 &&
        assertion.diagnosticCodes.every(canonicalIdentity) &&
        new Set(assertion.diagnosticCodes).size ===
          assertion.diagnosticCodes.length &&
        sameCanonicalJson(
          assertion.diagnosticCodes,
          [...assertion.diagnosticCodes].sort(compareUnicodeCodePoints)
        )
    ) &&
    Array.isArray(replay.runtimeReceiptDigests) &&
    replay.runtimeReceiptDigests.length >= 1 &&
    replay.runtimeReceiptDigests.length <= 256 &&
    replay.runtimeReceiptDigests.every(isAgentCanonicalDigest) &&
    new Set(replay.runtimeReceiptDigests).size ===
      replay.runtimeReceiptDigests.length &&
    sameCanonicalJson(
      replay.runtimeReceiptDigests,
      [...replay.runtimeReceiptDigests].sort(compareUnicodeCodePoints)
    ) &&
    replay.recordDigest === digestAgentCanonicalValue(replayBase(base))
  );
};

const canarySignatures = (canaries: readonly string[]): readonly string[] => {
  const values: string[] = [];
  for (const canary of canaries) {
    if (
      typeof canary !== 'string' ||
      canary.length < 8 ||
      canary.length > 4_096
    ) {
      return fail('Forbidden canary configuration is invalid.');
    }
    const bytes = new TextEncoder().encode(canary);
    const base64 = Buffer.from(bytes).toString('base64');
    const base64Url = base64.replaceAll('+', '-').replaceAll('/', '_');
    values.push(
      canary,
      JSON.stringify(canary).slice(1, -1),
      encodeURIComponent(canary),
      [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      base64,
      base64Url,
      base64Url.replace(/=+$/u, '')
    );
    bytes.fill(0);
  }
  return Object.freeze([...new Set(values.filter(Boolean))]);
};

const assertCanaryClean = (
  value: string | Uint8Array | unknown,
  source: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource
): void => {
  const signatures = canarySignatures(source());
  let text: string;
  try {
    if (typeof value === 'string') text = value;
    else if (value instanceof Uint8Array) {
      text = new TextDecoder('utf-8', { fatal: false }).decode(value);
    } else text = canonicalJsonText(value);
  } catch {
    return fail('Sandbox output is not canonical or decodable.');
  }
  if (signatures.some((signature) => text.includes(signature))) {
    return fail(
      'Sandbox output contains a forbidden Secret or holdout canary.'
    );
  }
};

export const assertProductionAgentEvaluationG3SandboxCanaryClean = (
  value: string | Uint8Array | unknown,
  source: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource = () =>
    Object.freeze([])
): void => assertCanaryClean(value, source);

const assertSnapshot = (
  bytes: Uint8Array,
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  canaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource
): Uint8Array => {
  if (!(bytes instanceof Uint8Array)) {
    return fail('Executable Workspace snapshot bytes drifted.');
  }
  let decoded: ReturnType<typeof decodeExecutableProjectSnapshotArtifact>;
  try {
    decoded = decodeExecutableProjectSnapshotArtifact(bytes);
  } catch {
    return fail('Executable Workspace snapshot codec validation failed.');
  }
  if (
    decoded.size !== binding.executableSnapshot.size ||
    decoded.artifactDigest !== binding.executableSnapshot.artifactDigest ||
    decoded.snapshot.contentDigest !==
      binding.executableSnapshot.semanticSnapshotDigest ||
    decoded.mediaType !== binding.executableSnapshot.mediaType ||
    decoded.schemaDigest !== binding.executableSnapshot.codecSchemaDigest
  ) {
    return fail('Executable Workspace snapshot identity drifted.');
  }
  assertCanaryClean(bytes, canaries);
  return new Uint8Array(bytes);
};

const exactCellContext = (
  cell: VerificationPlanCell,
  context: Parameters<VerificationAdapter['preflight']>[1],
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  registrySnapshotDigest: string
): boolean =>
  sameCanonicalJson(
    cell.adapter,
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY
  ) &&
  sameCanonicalJson(context.adapter, cell.adapter) &&
  context.registrySnapshotDigest === registrySnapshotDigest &&
  context.registrySnapshotDigest === binding.registrySnapshotDigest &&
  context.runtimeZone === 'sandbox' &&
  context.runtimeEnvironmentDigest === binding.runtimeEnvironmentDigest &&
  context.inputDigest === cell.inputDigest &&
  context.executableSnapshotDigest ===
    binding.executableSnapshot.semanticSnapshotDigest &&
  context.scenarioProgramDigest === binding.scenarioProgramDigest &&
  context.controlProfileDigest === cell.controlProfileRef.digest &&
  sameStringSet(
    context.fixtureSetDigests,
    cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
  ) &&
  context.baselineSetDigest === cell.baselineSetRef?.digest &&
  sameStringSet(
    context.controlCapabilityIds,
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR.controlCapabilities
  ) &&
  context.controlCapabilitySnapshotDigest ===
    binding.controlCapabilitySnapshotDigest &&
  context.appliedControlDigest === binding.appliedControlDigest &&
  context.inputRefs.length === 1 &&
  context.inputRefs[0]?.id === binding.executableSnapshot.id &&
  context.inputRefs[0]?.kind === 'executable-snapshot' &&
  context.inputRefs[0]?.digest === binding.executableSnapshot.artifactDigest &&
  context.inputRefs[0]?.size === binding.executableSnapshot.size &&
  context.inputRefs[0]?.mediaType === binding.executableSnapshot.mediaType;

const invocationMatches = (
  state: InvocationState,
  invocation: PreparedVerificationInvocation
): boolean => {
  if (!state.prepared || !state.lease) return false;
  const { resolvedInputSetDigest: _coreOwned, ...candidate } = invocation;
  return (
    sameCanonicalJson(candidate, state.prepared) &&
    invocation.resolvedInputSetDigest ===
      state.input.context.resolvedInputSetDigest
  );
};

const cleanupCoordinatesMatch = (
  state: InvocationState,
  input: Parameters<VerificationAdapter['cleanup']>[0]
): boolean =>
  state.input.planDigest === input.planDigest &&
  state.input.cell.id === input.cellId &&
  state.input.attemptId === input.attemptId &&
  state.input.generation === input.generation;

const replayArtifactId = (
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding
): string =>
  `artifact:g4-replay-${binding.bindingDigest.slice('sha256-'.length)}`;

const reportForReplay = (
  replay: AgentEvaluationControlledWorkspaceG3ReplayRecord,
  invocation: PreparedVerificationInvocation,
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  staged: Extract<
    VerificationAdapterArtifactStagingResult,
    { status: 'staged' }
  >
): VerificationCheckReportCandidate => {
  const failed = replay.assertions.some(({ status }) => status === 'failed');
  const diagnosticCodes = Object.freeze(
    [
      ...new Set(
        replay.assertions.flatMap(({ diagnosticCodes: values }) => values)
      ),
    ].sort(compareUnicodeCodePoints)
  );
  return Object.freeze({
    format: 'prodivix.verification-check-report-candidate',
    version: 1,
    cellId: invocation.cellId,
    attemptId: invocation.attemptId,
    checkKind: 'integration',
    inputDigest: invocation.inputDigest,
    adapter: binding.adapter,
    tool: binding.tool,
    terminal: Object.freeze({
      status: 'completed' as const,
      complete: true as const,
      exitCode: failed ? 1 : 0,
    }),
    payload: Object.freeze({
      kind: 'integration' as const,
      suites: Object.freeze([
        Object.freeze({
          suiteId: `suite:g4-sandbox-${binding.cellId}`,
          status: failed ? ('failed' as const) : ('passed' as const),
          cases: Object.freeze(
            replay.assertions.map((assertion) =>
              Object.freeze({
                caseId: assertion.assertionId,
                status: assertion.status,
                diagnosticCodes: assertion.diagnosticCodes,
              })
            )
          ),
        }),
      ]),
    }),
    artifacts: Object.freeze([
      Object.freeze({
        id: replayArtifactId(binding),
        kind: 'replay-record' as const,
        digest: staged.digest,
        size: staged.size,
        mediaType: staged.mediaType,
      }),
    ]),
    diagnosticCodes,
  });
};

export type CreateProductionAgentEvaluationSandboxAdapterFactoryInput =
  Readonly<{
    binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
    port: AgentEvaluationControlledWorkspaceG3SandboxPort;
    forbiddenCanaries?: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>;

/**
 * Production adapter for the corpus-frozen G4 sandbox descriptor. The sidecar
 * owns Browser/Workspace execution; this owner enforces exact identity,
 * bounded replay projection, Core staging, cancellation, and cleanup.
 */
export const createProductionAgentEvaluationSandboxAdapterFactory = (
  options: CreateProductionAgentEvaluationSandboxAdapterFactoryInput
): VerificationAdapterFactory => {
  const canaries = options.forbiddenCanaries ?? (() => Object.freeze([]));
  const expectedDescriptor = normalizeVerificationAdapterDescriptor(
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_DESCRIPTOR
  );
  return (factoryContext): VerificationAdapter => {
    if (
      !sameCanonicalJson(factoryContext.descriptor, expectedDescriptor) ||
      !sameCanonicalJson(
        factoryContext.identity,
        AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY
      ) ||
      !sameCanonicalJson(
        factoryContext.tool,
        AGENT_EVALUATION_G3_SANDBOX_ADAPTER_TOOL
      ) ||
      factoryContext.runtimeZone !== 'sandbox' ||
      factoryContext.registrySnapshotDigest !==
        options.binding.registrySnapshotDigest
    ) {
      return fail('Frozen adapter descriptor, toolchain, or registry drifted.');
    }
    const states = new Map<string, InvocationState>();
    return Object.freeze({
      preflight: async (cell, context) =>
        exactCellContext(
          cell,
          context,
          options.binding,
          factoryContext.registrySnapshotDigest
        )
          ? Object.freeze({ status: 'supported' as const })
          : Object.freeze({
              status: 'blocked' as const,
              reasonCode: 'VER-4001',
              message:
                'G4 sandbox Plan cell, executable snapshot, controls, or adapter identity drifted.',
            }),

      prepare: async (input) => {
        if (
          input.providerKind !== 'remote' ||
          input.planDigest !== options.binding.planDigest ||
          input.cell.id !== options.binding.cellId ||
          input.attemptId !== options.binding.attemptId ||
          input.generation !== options.binding.generation ||
          input.controlCapabilitySnapshotDigest !==
            options.binding.controlCapabilitySnapshotDigest ||
          input.appliedControlDigest !== options.binding.appliedControlDigest ||
          !exactCellContext(
            input.cell,
            input.context,
            options.binding,
            factoryContext.registrySnapshotDigest
          ) ||
          input.context.abortSignal.aborted
        ) {
          return fail('Sandbox prepare coordinates or controls drifted.');
        }
        const provisionalId = `invocation:${digestVerificationValue({
          bindingDigest: options.binding.bindingDigest,
          planDigest: input.planDigest,
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          resolvedInputSetDigest: input.context.resolvedInputSetDigest,
        }).slice('sha256-'.length)}`;
        if (states.has(provisionalId)) {
          return fail('Sandbox invocation is already active.');
        }
        const state: InvocationState = {
          phase: 'preparing',
          input,
          canaryId: `canary:${provisionalId.slice('invocation:'.length)}`,
        };
        states.set(provisionalId, state);
        try {
          const snapshot = assertSnapshot(
            await input.context.inputResolver.read(
              input.context.inputRefs[0]!,
              input.context.abortSignal
            ),
            options.binding,
            canaries
          );
          snapshot.fill(0);
          const lease = await options.port.prepare({
            binding: options.binding,
            planDigest: input.planDigest as CanonicalDigest,
            cell: input.cell,
            attemptId: input.attemptId,
            generation: input.generation,
            resolvedInputSetDigest: input.context
              .resolvedInputSetDigest as CanonicalDigest,
            signal: input.context.abortSignal,
          });
          assertCanaryClean(lease, canaries);
          if (!isExactLease(lease, options.binding, input)) {
            return fail('Sandbox execution lease drifted.');
          }
          const prepared = Object.freeze({
            invocationId: lease.invocationId,
            planDigest: input.planDigest,
            cellId: input.cell.id,
            adapterId: factoryContext.identity.adapterId,
            attemptId: input.attemptId,
            generation: input.generation,
            providerKind: input.providerKind,
            ...(lease.executionId ? { executionId: lease.executionId } : {}),
            ...(lease.sessionId ? { sessionId: lease.sessionId } : {}),
            ...(lease.jobId ? { jobId: lease.jobId } : {}),
            inputDigest: input.context.inputDigest,
            controlCapabilitySnapshotDigest:
              input.controlCapabilitySnapshotDigest,
            appliedControlDigest: input.appliedControlDigest,
            confirmedCursor: lease.confirmedCursor,
            state: 'running' as const,
          });
          states.delete(provisionalId);
          if (states.has(lease.invocationId)) {
            return fail('Sandbox lease replay conflicts with an active call.');
          }
          state.lease = lease;
          state.prepared = prepared;
          state.phase = 'ready';
          states.set(lease.invocationId, state);
          return prepared;
        } catch (error) {
          states.delete(provisionalId);
          throw error;
        }
      },

      execute: async (invocation, sink) => {
        const state = states.get(invocation.invocationId);
        if (
          !state ||
          state.phase !== 'ready' ||
          !state.lease ||
          !invocationMatches(state, invocation)
        ) {
          return fail('Sandbox invocation is stale, unknown, or drifted.');
        }
        state.invocation = invocation;
        state.phase = 'executing';
        try {
          const started = sink.emit({
            kind: 'progress',
            eventId: `event:${digestVerificationValue({
              invocationId: invocation.invocationId,
              phase: 'started',
            }).slice('sha256-'.length)}`,
            messageKey: 'verification.g4-sandbox.started',
            completed: 0,
            total: 1,
          });
          if (started.status !== 'accepted') {
            return fail('Core rejected the sandbox start event.');
          }
          const replay = await options.port.execute({
            binding: options.binding,
            lease: state.lease,
            signal: state.input.context.abortSignal,
          });
          assertCanaryClean(replay, canaries);
          if (
            !isExactReplay(replay, options.binding, state.lease, invocation)
          ) {
            return fail('Sandbox replay record identity or bounds drifted.');
          }
          const replayBytes = new TextEncoder().encode(
            canonicalJsonText(replay)
          );
          if (replayBytes.byteLength > maximumReplayBytes) {
            replayBytes.fill(0);
            return fail('Sandbox replay record exceeds the artifact budget.');
          }
          assertCanaryClean(replayBytes, canaries);
          const staged = await state.input.context.artifactStaging.stage(
            {
              id: replayArtifactId(options.binding),
              kind: 'replay-record',
              mediaType: AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE,
              bytes: replayBytes,
            },
            state.input.context.abortSignal
          );
          const expectedDigest =
            computeVerificationArtifactContentDigest(replayBytes);
          replayBytes.fill(0);
          if (
            staged.status !== 'staged' ||
            staged.digest !== expectedDigest ||
            staged.mediaType !== AGENT_EVALUATION_G3_SANDBOX_REPLAY_MEDIA_TYPE
          ) {
            return fail('Sandbox replay artifact staging drifted or failed.');
          }
          const artifactEvent = sink.emit({
            kind: 'artifact',
            eventId: `event:${digestVerificationValue({
              invocationId: invocation.invocationId,
              phase: 'artifact',
              digest: staged.digest,
            }).slice('sha256-'.length)}`,
            artifactId: replayArtifactId(options.binding),
            digest: staged.digest,
          });
          if (artifactEvent.status !== 'accepted') {
            return fail('Core rejected the sandbox artifact event.');
          }
          const completed = sink.emit({
            kind: 'progress',
            eventId: `event:${digestVerificationValue({
              invocationId: invocation.invocationId,
              phase: 'completed',
            }).slice('sha256-'.length)}`,
            messageKey: 'verification.g4-sandbox.completed',
            completed: 1,
            total: 1,
          });
          if (completed.status !== 'accepted') {
            return fail('Core rejected the sandbox completion event.');
          }
          state.replay = replay;
          state.phase = 'collecting';
          return reportForReplay(replay, invocation, options.binding, staged);
        } catch (error) {
          state.phase = 'collecting';
          throw error;
        }
      },

      cleanup: async (input) => {
        const matching = [...states.entries()].filter(([, state]) =>
          cleanupCoordinatesMatch(state, input)
        );
        if (
          input.invocation &&
          matching.some(
            ([invocationId, state]) =>
              invocationId !== input.invocation!.invocationId ||
              !invocationMatches(state, input.invocation!)
          )
        ) {
          return Object.freeze({
            status: 'residual' as const,
            residualCanaryIds: Object.freeze(
              matching.map(([, { canaryId }]) => canaryId)
            ),
            diagnosticCodes: Object.freeze(['VER-4002']),
          });
        }
        let cleanup: VerificationAdapterCleanupResult;
        try {
          cleanup = await options.port.cleanup({
            binding: options.binding,
            ...(matching[0]?.[1].lease ? { lease: matching[0][1].lease } : {}),
            cause: input.cause,
            signal: input.abortSignal,
          });
          assertCanaryClean(cleanup, canaries);
        } catch {
          return Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze(['VER-4002']),
          });
        }
        if (
          !exactRecord(cleanup, [
            'status',
            'residualCanaryIds',
            'diagnosticCodes',
          ]) ||
          !['clean', 'residual', 'failed'].includes(cleanup.status) ||
          !Array.isArray(cleanup.residualCanaryIds) ||
          cleanup.residualCanaryIds.some(
            (value) => !canonicalIdentity(value)
          ) ||
          !Array.isArray(cleanup.diagnosticCodes) ||
          cleanup.diagnosticCodes.some((value) => !canonicalIdentity(value))
        ) {
          return Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze(['VER-4002']),
          });
        }
        if (cleanup.status === 'clean') {
          for (const [invocationId, state] of matching) {
            state.phase = 'cleaned';
            states.delete(invocationId);
          }
        }
        return Object.freeze({
          status: cleanup.status,
          residualCanaryIds: Object.freeze(
            [...cleanup.residualCanaryIds].sort(compareUnicodeCodePoints)
          ),
          diagnosticCodes: Object.freeze(
            [...cleanup.diagnosticCodes].sort(compareUnicodeCodePoints)
          ),
        });
      },
    });
  };
};

export const assertProductionAgentEvaluationG3SandboxBinding = (
  binding: AgentEvaluationControlledWorkspaceG3SandboxBinding,
  expected: AgentEvaluationControlledWorkspaceG3SandboxBindInput
): AgentEvaluationControlledWorkspaceG3SandboxBinding =>
  isExactBinding(binding, expected)
    ? binding
    : fail('Sandbox binding authority drifted from the exact G3 cell.');

export const assertProductionAgentEvaluationG3SandboxCompletion = (
  completion: AgentEvaluationControlledWorkspaceG3SandboxCompletion,
  canaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource = () =>
    Object.freeze([])
): AgentEvaluationControlledWorkspaceG3SandboxCompletion => {
  assertCanaryClean(completion, canaries);
  if (
    !canonicalInstant(completion.timing.startedAt) ||
    !canonicalInstant(completion.timing.completedAt) ||
    completion.timing.durationMs !==
      Date.parse(completion.timing.completedAt) -
        Date.parse(completion.timing.startedAt) ||
    !isAgentCanonicalDigest(completion.dependencyLockDigest) ||
    !isAgentControlIdentity(completion.provenance.producerId) ||
    !isAgentControlIdentity(completion.provenance.providerId) ||
    !canonicalInstant(completion.provenance.issuedAt) ||
    !isAgentControlIdentity(completion.redaction.policyId) ||
    !isAgentCanonicalDigest(completion.redaction.scannerSetDigest)
  ) {
    return fail('Sandbox completion authority is invalid.');
  }
  return completion;
};

export type AgentEvaluationControlledWorkspaceG3SandboxRuntimeMaterial =
  Readonly<{
    binding: AgentEvaluationControlledWorkspaceG3SandboxBinding;
    replay?: AgentEvaluationControlledWorkspaceG3ReplayRecord;
    completion?: AgentEvaluationControlledWorkspaceG3SandboxCompletion;
    sourceTraces?: readonly VerificationEvidenceSourceTrace[];
    provenance?: VerificationEvidenceCandidateProvenance;
  }>;

// Compile-time guard that the frozen descriptor identity remains canonical.
if (
  !digestPattern.test(
    AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IDENTITY.descriptorDigest
  ) ||
  !digestPattern.test(AGENT_EVALUATION_G3_SANDBOX_ADAPTER_IMPLEMENTATION_DIGEST)
) {
  fail('Frozen G4 sandbox adapter identity is not canonical.');
}
