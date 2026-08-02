import type {
  AgentCapability,
  AgentContextPack,
  AgentInvocationId,
  AgentModelEvaluationManifestRef,
  AgentProviderEndpointClass,
  AgentProviderProtocolFamily,
  AgentProviderSupportTier,
  AgentRunId,
  AgentSensitivity,
  AgentTaskId,
  AgentTaskMode,
  AgentToolExecutionLocus,
  AgentUsageLimit,
  AgentUsageUnit,
  AgentUsageVectorRef,
  CanonicalDigest,
  DecimalString,
  Instant,
} from '../domain/agent.types';

export type AgentProviderAdapterIdentity = Readonly<{
  adapterId: string;
  adapterVersion: string;
  adapterDigest: CanonicalDigest;
  protocolFamily: AgentProviderProtocolFamily;
  transportSchemaDigest: CanonicalDigest;
  eventNormalizationDigest: CanonicalDigest;
}>;

export type AgentProviderConfigurationIdentity = Readonly<{
  providerConfigurationId: string;
  providerOperatorId: string;
  endpointClass: AgentProviderEndpointClass;
  endpointProfileDigest: CanonicalDigest;
  providerRegion?: string;
  apiRevision?: string;
  adapter: AgentProviderAdapterIdentity;
  dataPolicyDigest: CanonicalDigest;
}>;

export type AgentModelRef = Readonly<{
  modelId: string;
  lineageDigest: CanonicalDigest;
}>;

export type AgentFineTuneRef = Readonly<{
  fineTuneId: string;
  jobId: string;
  deploymentId: string;
  baseModelLineageDigest: CanonicalDigest;
  trainingPolicyDigest: CanonicalDigest;
  disclosedDataLineageDigest: CanonicalDigest;
}>;

export type AgentModelLineage = Readonly<{
  modelId: string;
  modelFamilyId: string;
  modelFamilyOwnerId: string;
  immutableVersion?: string;
  baseModelRef?: AgentModelRef;
  fineTuneRef?: AgentFineTuneRef;
  tokenizerDigest?: CanonicalDigest;
  chatTemplateDigest?: CanonicalDigest;
  quantizationDigest?: CanonicalDigest;
  runtimeBackendDigest?: CanonicalDigest;
  lineageDigest: CanonicalDigest;
}>;

export type AgentProviderTrainingDisposition =
  'disabled' | 'policy-qualified' | 'enabled' | 'unknown';

export type AgentProviderTelemetryDisposition =
  'disabled' | 'policy-qualified' | 'enabled' | 'unknown';

export type AgentProviderDataPolicy = Readonly<{
  policyDigest: CanonicalDigest;
  region?: string;
  maximumSensitivity: AgentSensitivity;
  training: AgentProviderTrainingDisposition;
  telemetry: AgentProviderTelemetryDisposition;
  retentionDays: number;
  deletionReceipt: 'available' | 'unavailable' | 'unknown';
  ambientMemory: 'disabled' | 'enabled' | 'unknown';
  storage: 'disabled' | 'task-scoped' | 'workspace-scoped' | 'unknown';
  cacheIsolation:
    'invocation' | 'task' | 'workspace' | 'cross-tenant' | 'unknown';
}>;

export type AgentProviderStateMode =
  | 'stateless'
  | 'provider-stored-parent'
  | 'provider-background-job'
  | 'realtime-session';

export type AgentContextMutationMode =
  | 'none'
  | 'provider-compaction'
  | 'provider-context-editing'
  | 'tool-result-trimming'
  | 'deferred-tool-expansion';

export type AgentReasoningMode = 'none' | 'summary' | 'opaque-continuation';

export type AgentProviderCacheMode =
  'disabled' | 'prompt' | 'file' | 'conversation';

export type AgentCapabilityFeature =
  | 'bounded-text-input'
  | 'bounded-code-input'
  | 'visual-input'
  | 'document-input'
  | 'generated-asset-output'
  | 'audio-input-output'
  | 'video-input'
  | 'realtime-media'
  | 'structured-output'
  | 'client-hosted-tool-calling'
  | 'streaming'
  | 'refusal-normalization'
  | 'truncation-normalization'
  | 'parallel-tool-calling'
  | 'usage-reporting';

export type AgentCapabilityLimits = Readonly<{
  maxInputBytes: number;
  maxOutputUnits: readonly AgentUsageLimit[];
  maxToolCalls: number;
  maxParallelToolCalls: number;
  maxBackgroundRuntimeMs: number;
}>;

export type AgentCapabilityProfile = Readonly<{
  profileId: string;
  inputModalityRefs: readonly string[];
  outputModalityRefs: readonly string[];
  outputContracts: readonly ('structured' | 'text' | 'tool-call')[];
  toolExecutionLoci: readonly AgentToolExecutionLocus[];
  deliveryModes: readonly (
    'background' | 'realtime-session' | 'response' | 'stream'
  )[];
  providerStateModes: readonly AgentProviderStateMode[];
  cacheModes: readonly AgentProviderCacheMode[];
  contextMutationModes: readonly AgentContextMutationMode[];
  reasoningModes: readonly AgentReasoningMode[];
  featureFlags: readonly AgentCapabilityFeature[];
  hardLimits: AgentCapabilityLimits;
  profileDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeReceipt = Readonly<{
  probeId: string;
  providerConfigurationDigest: CanonicalDigest;
  modelLineageDigest: CanonicalDigest;
  requestedProfileDigest: CanonicalDigest;
  declaredCapabilityDigest: CanonicalDigest;
  probedCapabilityDigest: CanonicalDigest;
  status: 'supported' | 'unsupported' | 'inconclusive';
  observedLimitDigest: CanonicalDigest;
  probedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationQualification = Readonly<{
  manifestRef: AgentModelEvaluationManifestRef;
  manifestDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  qualificationTargetDigest: CanonicalDigest;
  qualificationSliceDigest: CanonicalDigest;
  evaluatedAt: Instant;
  expiresAt: Instant;
  qualificationDigest: CanonicalDigest;
}>;

export type AgentCapabilityQualification = Readonly<{
  provider: AgentProviderConfigurationIdentity;
  model: AgentModelLineage;
  capabilityProfileDigest: CanonicalDigest;
  policyProfileDigest: CanonicalDigest;
  declaredCapabilityDigest: CanonicalDigest;
  probedCapabilityDigest: CanonicalDigest;
  evaluationManifestRef?: AgentModelEvaluationManifestRef;
  supportTier: AgentProviderSupportTier;
  evaluatedAt: Instant;
  expiresAt: Instant;
  qualificationDigest: CanonicalDigest;
}>;

export type AgentToolChoicePolicy =
  'none' | 'auto' | 'required' | 'registered-only';

export type AgentParallelToolPolicy = 'forbidden' | 'bounded';

export type AgentInferenceConfiguration = Readonly<{
  temperature?: number;
  topP?: number;
  seed?: number;
  maxOutputUnits: AgentUsageLimit;
  reasoningMode: AgentReasoningMode;
  reasoningBudget?: AgentUsageLimit;
  outputSchemaDigest: CanonicalDigest;
  promptPolicyDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  toolChoicePolicy: AgentToolChoicePolicy;
  parallelToolPolicy: AgentParallelToolPolicy;
  providerStateMode: AgentProviderStateMode;
  contextMutationMode: AgentContextMutationMode;
  cacheMode: AgentProviderCacheMode;
  deliveryMode: 'background' | 'realtime-session' | 'response' | 'stream';
  safetyPolicyDigest?: CanonicalDigest;
  serviceTier?: string;
  configurationDigest: CanonicalDigest;
}>;

export type AgentOpaqueContinuationRef = Readonly<{
  continuationId: string;
  encryptedBlobRef: string;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  parentInvocationId: AgentInvocationId;
  purpose: 'provider-tool-loop-continuation';
  createdAt: Instant;
  expiresAt: Instant;
  continuationDigest: CanonicalDigest;
}>;

export type AgentContextTransformOmission = Readonly<{
  itemDigest: CanonicalDigest;
  reason: 'compacted' | 'provider-limit' | 'tool-result-trimmed' | 'unknown';
}>;

export type AgentContextTransformReceipt = Readonly<{
  invocationId: AgentInvocationId;
  submittedContextPackDigest: CanonicalDigest;
  transformMode: AgentContextMutationMode;
  transformConfigurationDigest?: CanonicalDigest;
  retainedItemDigests?: readonly CanonicalDigest[];
  omittedOrCompacted?: readonly AgentContextTransformOmission[];
  effectiveContextDigest?: CanonicalDigest;
  confidence: 'verified' | 'provider-reported' | 'unknown';
  receiptDigest: CanonicalDigest;
}>;

export type AgentProviderCacheReceipt = Readonly<{
  cacheMode: AgentProviderCacheMode;
  cacheScope: 'invocation' | 'task' | 'workspace';
  provenIsolation: 'invocation' | 'task' | 'workspace';
  cacheKeyDigest?: CanonicalDigest;
  prefixOrItemDigests: readonly CanonicalDigest[];
  providerRegion?: string;
  createdAt?: Instant;
  expiresAt?: Instant;
  usageRef: AgentUsageVectorRef;
  receiptDigest: CanonicalDigest;
}>;

export type AgentProviderStateReceipt = Readonly<{
  stateMode: AgentProviderStateMode;
  storage: AgentProviderDataPolicy['storage'];
  ambientMemory: AgentProviderDataPolicy['ambientMemory'];
  providerRegion?: string;
  retentionDays: number;
  deletionReceiptRef?: string;
  receiptDigest: CanonicalDigest;
}>;

export type AgentProviderJobPhase =
  'submitting' | 'accepted' | 'running' | 'cancelling' | 'terminal';

export type AgentProviderJobOutcome =
  'completed' | 'failed' | 'cancelled' | 'expired' | 'reconciliation-required';

export type AgentProviderJob = Readonly<{
  providerJobId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  invocationId: AgentInvocationId;
  requestDigest: CanonicalDigest;
  phase: AgentProviderJobPhase;
  outcome?: AgentProviderJobOutcome;
  callbackAuthority: 'active' | 'revoked';
  latestEventDigest: CanonicalDigest;
}>;

export type AgentProviderJobReceipt = Readonly<{
  providerJobId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  invocationId: AgentInvocationId;
  phase: AgentProviderJobPhase;
  outcome?: AgentProviderJobOutcome;
  callbackAuthority: 'active' | 'revoked';
  receiptDigest: CanonicalDigest;
}>;

export type AgentUsageAmount = Readonly<{
  unit: AgentUsageUnit;
  logicalAmount?: DecimalString;
  billableAmount?: DecimalString;
  cachedAmount?: DecimalString;
  confidence: 'reported' | 'measured' | 'estimated' | 'unknown';
  sourceDigest?: CanonicalDigest;
}>;

export type AgentUsageVector = Readonly<{
  amounts: readonly AgentUsageAmount[];
  vectorDigest: CanonicalDigest;
}>;

export type AgentPricingRate = Readonly<{
  unit: AgentUsageUnit;
  currency: string;
  unitPrice: DecimalString;
}>;

export type AgentPricingSnapshot = Readonly<{
  pricingSnapshotId: string;
  providerConfigurationId: string;
  serviceTier?: string;
  region?: string;
  effectiveAt: Instant;
  rates: readonly AgentPricingRate[];
  sourceDigest: CanonicalDigest;
  snapshotDigest: CanonicalDigest;
}>;

export type AgentCost = Readonly<{
  currency: string;
  amount?: DecimalString;
  confidence: AgentUsageAmount['confidence'];
  sourceDigest?: CanonicalDigest;
}>;

export type AgentInvocationOutcome =
  | 'completed'
  | 'refused'
  | 'safety-blocked'
  | 'truncated'
  | 'schema-failed'
  | 'provider-error'
  | 'cancelled'
  | 'timed-out'
  | 'partial';

export type AgentProviderEvent = Readonly<{
  eventId: string;
  invocationId: AgentInvocationId;
  sequence: number;
  type:
    | 'output-delta'
    | 'tool-call'
    | 'usage'
    | 'refusal'
    | 'safety-block'
    | 'truncation'
    | 'cancelled'
    | 'timed-out'
    | 'partial'
    | 'completed'
    | 'failed';
  payloadDigest: CanonicalDigest;
  occurredAt: Instant;
  eventDigest: CanonicalDigest;
}>;

export type AgentModelInvocationReceipt = Readonly<{
  invocationId: AgentInvocationId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  attempt: number;
  provider: AgentProviderConfigurationIdentity;
  model: AgentModelLineage;
  capabilityQualificationDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  multimodalContextManifestDigest?: CanonicalDigest;
  providerMediaBlockManifestDigest?: CanonicalDigest;
  contextTransformReceiptRef?: string;
  cacheReceiptRef?: string;
  providerStateReceiptRef?: string;
  providerJobReceiptRef?: string;
  requestDigest: CanonicalDigest;
  responseDigest?: CanonicalDigest;
  outcome: AgentInvocationOutcome;
  usage: AgentUsageVector;
  costStatus: 'priced' | 'not-applicable' | 'unknown';
  cost: readonly AgentCost[];
  pricingSnapshotRef?: string;
  startedAt: Instant;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentInvocationPlan = Readonly<{
  invocationId: AgentInvocationId;
  taskId: AgentTaskId;
  runId: AgentRunId;
  taskMode: AgentTaskMode;
  generation: number;
  attempt: number;
  provider: AgentProviderConfigurationIdentity;
  providerDataPolicy: AgentProviderDataPolicy;
  model: AgentModelLineage;
  capabilityProfile: AgentCapabilityProfile;
  qualification: AgentCapabilityQualification;
  inferenceConfiguration: AgentInferenceConfiguration;
  contextPack: AgentContextPack;
  multimodalContextManifestDigest?: CanonicalDigest;
  providerMediaBlockManifestDigest?: CanonicalDigest;
  policyDigest: CanonicalDigest;
  grantCapabilities: readonly AgentCapability[];
  startedAt: Instant;
}>;
