import {
  AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_EVENT_BYTES,
  AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_TOOL_ARGUMENT_BYTES,
  AGENT_NATIVE_PROVIDER_MAXIMUM_EVENT_BYTES,
  AGENT_NATIVE_PROVIDER_MAXIMUM_EVENTS,
  AGENT_NATIVE_PROVIDER_MAXIMUM_OUTPUT_BYTES,
  AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_ARGUMENT_BYTES,
  AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_CALLS,
  createAgentEvaluationExecutionReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationPreDispatchFailureReceipt,
  createAgentEvaluationProviderResultSpoolDispositionReceipt,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt,
  createAgentEvaluationSourceReceipt,
  createAgentEvaluationTransportAttemptReceipt,
  createAgentEvaluationTransportRetryReceipt,
  createAgentModelEvaluationAttempt,
  createAgentProviderRuntimeEvent,
  createAgentUsageVector,
  createUnknownAgentUsageVector,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder,
  digestAgentCanonicalValue,
  digestAgentEvaluationControlledRuntimeReceiptSet,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  digestAgentEvaluationCapabilitySpecificReceiptSet,
  digestAgentEvaluationAttemptAuthorityOwnerReceiptSet,
  digestAgentEvaluationAttemptGrading,
  digestAgentEvaluationCostCalculationSource,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationPreDispatchFailureReceiptSet,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationResultSubmissionReceiptSet,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  digestAgentNativeProviderRuntimeResponse,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  isAgentEvaluationPreDispatchFailureReceipt,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
  isAgentModelEvaluationAttemptDescriptor,
  normalizeAgentCosts,
  planAgentModelEvaluationAttempts,
  selectAgentEvaluationProviderCapabilityObservationFacts,
  selectAgentNativeProviderCapabilityObservationFacts,
  validateAgentModelEvaluationPlan,
  validateAgentProviderEventSequence,
  validateAgentProviderRuntimeEventBinding,
  type AgentBudgetDemand,
  type AgentCost,
  type AgentEvaluationAttemptExecution,
  type AgentEvaluationAttemptStatus,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationAttemptExecutionMeasurements,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationInvocationTurnSetReceipt,
  type AgentEvaluationMetricObservation,
  type AgentEvaluationPreDispatchFailureReasonCode,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationPreDispatchFailureStage,
  type AgentEvaluationProviderResultSpoolDispositionReceipt,
  type AgentEvaluationProviderResultSpoolReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationProviderCapabilityObservationFactSelection,
  type AgentEvaluationProviderCapabilityObservationSanitization,
  type AgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentEvaluationProviderCapabilityRuntimeSourceAuthority,
  type AgentEvaluationRuntimeFactSourceAuthority,
  type AgentEvaluationResultSubmission,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationTransportReceipt,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationAttemptExecutor,
  type AgentModelEvaluationPlan,
  type AgentModelInvocationReceipt,
  type AgentNativeProviderAdapter,
  type AgentNativeProviderRuntimeFact,
  type AgentNativeProviderRuntimeOptionalCapabilityFact,
  type AgentProviderAdapterInvocationRequest,
  type AgentProviderEvent,
  type AgentProviderProtocolFamily,
  type AgentProviderRuntimeEvent,
  type AgentUsageVector,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  runAgentEvaluationAgentTurnLoop,
  type CreateAgentEvaluationAgentTurnLoopInput,
  type AgentEvaluationAgentLoopRuntimeResult,
  type AgentEvaluationAgentLoopTurn,
  type AgentEvaluationAgentTurnLoopResult,
} from './agentTurnLoop';
import {
  type AgentEvaluationEncodedInvocationPayload,
  type AgentEvaluationInvocationPayloadCodecOptions,
  type AgentEvaluationInvocationToolPhase,
  type CallbackBoundAgentEvaluationInvocationPayloadRegistry,
} from './invocationPayload';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';
import { containsAsciiControlCharacter } from './textSafety';
import {
  createAgentEvaluationAttemptCapabilityExecutionReceipt,
  createAgentEvaluationFailedCapabilityExecutionReceipt,
  type AgentEvaluationCapabilityRuntime,
} from './capabilityRuntime';
import {
  createAgentEvaluationOptionalCapabilityFactSourceRequest,
  type AgentEvaluationOptionalCapabilityFactAuthorityClient,
} from './optionalCapabilityFactAuthorityClient';

export type AgentEvaluationAttemptNativeProtocol = Extract<
  AgentProviderProtocolFamily,
  'openai-responses' | 'anthropic-messages' | 'gemini-interactions'
>;

export type AgentEvaluationAttemptAdapterSet = Readonly<
  Record<AgentEvaluationAttemptNativeProtocol, AgentNativeProviderAdapter>
>;

export interface AgentEvaluationAttemptMaterialSource {
  use<T>(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
    }>,
    callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
  ): Promise<T>;
}

export type AgentEvaluationRetryableStatus = Extract<
  AgentEvaluationAttemptStatus,
  | 'provider-error'
  | 'timed-out'
  | 'rate-limited'
  | 'schema-failed'
  | 'infrastructure-error'
>;

export type AgentEvaluationAttemptRetryPolicy = Readonly<{
  maximumAttempts: 1;
  retryableStatuses: readonly AgentEvaluationRetryableStatus[];
  policyDigest: CanonicalDigest;
}>;

export const createAgentEvaluationAttemptRetryPolicy = (
  input: Readonly<{
    maximumAttempts: number;
    retryableStatuses: readonly AgentEvaluationRetryableStatus[];
  }>
): AgentEvaluationAttemptRetryPolicy => {
  const allowed = new Set<AgentEvaluationRetryableStatus>([
    'provider-error',
    'timed-out',
    'rate-limited',
    'schema-failed',
    'infrastructure-error',
  ]);
  const retryableStatuses = Object.freeze(
    [...input.retryableStatuses].sort(compareUnicodeCodePoints)
  );
  if (
    input.maximumAttempts !== 1 ||
    new Set(retryableStatuses).size !== retryableStatuses.length ||
    retryableStatuses.some((status) => !allowed.has(status))
  ) {
    throw new TypeError(
      'Production evaluation permits one transport attempt per provider turn.'
    );
  }
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-attempt-retry-policy' as const,
    version: 1 as const,
    maximumAttempts: 1 as const,
    retryableStatuses,
  });
  return Object.freeze({
    maximumAttempts: 1,
    retryableStatuses,
    policyDigest: digestAgentCanonicalValue(base),
  });
};

export type AgentEvaluationAttemptTerminalClassificationInput = Readonly<{
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  protocolFamily: AgentEvaluationAttemptNativeProtocol;
  invocation: AgentProviderAdapterInvocationRequest;
  turnIndex: number;
  phase: AgentEvaluationInvocationToolPhase;
  events: readonly AgentProviderRuntimeEvent[];
  terminalEvent: AgentProviderRuntimeEvent;
  runtimeRejected: boolean;
  transportReceipt: AgentEvaluationTransportReceipt;
}>;

export type AgentEvaluationAttemptTerminalClassifier = (
  input: AgentEvaluationAttemptTerminalClassificationInput
) => AgentEvaluationAttemptStatus | Promise<AgentEvaluationAttemptStatus>;

export type AgentEvaluationAttemptAccounting = Readonly<{
  usage: AgentUsageVector;
  dispatchState: 'dispatched';
  costStatus: AgentModelInvocationReceipt['costStatus'];
  cost: readonly AgentCost[];
  statusOverride?: 'infrastructure-error';
  usageSourceReceipt: AgentEvaluationSourceReceipt;
  costSourceReceipt: AgentEvaluationSourceReceipt;
  pricingSourceReceipt?: AgentEvaluationSourceReceipt;
  providerRequestId?: string;
  executionFailureAuthorityReceiptDigest?: CanonicalDigest;
  executionFailureSourceUri?: string;
  transportReceiptDigest: CanonicalDigest;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
  resolvedModelIdentityDigest: CanonicalDigest;
  responseHeaderDigest: CanonicalDigest;
  accountingDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptAccountingInput = Readonly<{
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  protocolFamily: AgentEvaluationAttemptNativeProtocol;
  invocation: AgentProviderAdapterInvocationRequest;
  turnIndex: number;
  phase: AgentEvaluationInvocationToolPhase;
  status: AgentEvaluationAttemptStatus;
  responseDigest: CanonicalDigest;
  reportedUsage: AgentUsageVector;
  events: readonly AgentProviderRuntimeEvent[];
  terminalEvent: AgentProviderRuntimeEvent;
  transportReceipt: AgentEvaluationTransportReceipt;
  startedAt: Instant;
  completedAt: Instant;
}>;

export type AgentEvaluationAttemptAccountingPersistence = (
  input: AgentEvaluationAttemptAccountingInput
) => Promise<AgentEvaluationAttemptAccounting>;

export { digestAgentEvaluationAttemptGrading };
export type { AgentEvaluationAttemptExecutionMeasurements };

export type AgentEvaluationAttemptGrading = Readonly<{
  metricObservations: readonly AgentEvaluationMetricObservation[];
  gradingDigest: CanonicalDigest;
  authorityReceipt: AgentEvaluationAttemptAuthorityOwnerReceipt;
}>;

export type AgentEvaluationAttemptGradingInput = Readonly<{
  namespaceId: string;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  protocolFamily: AgentEvaluationAttemptNativeProtocol;
  status: AgentEvaluationAttemptStatus;
  invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
  terminalTurnReceipt: AgentEvaluationInvocationTurnReceipt;
  execution: AgentEvaluationAttemptExecutionMeasurements;
  resultSubmission?: AgentEvaluationResultSubmission;
  resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  capabilityExecutionReceipt: AgentEvaluationCapabilityExecutionReceipt;
}>;

export type AgentEvaluationAttemptGradingPersistence = (
  input: AgentEvaluationAttemptGradingInput
) => Promise<AgentEvaluationAttemptGrading>;

export type AgentEvaluationPreDispatchFailureClassification = Readonly<{
  reasonCode: AgentEvaluationPreDispatchFailureReasonCode;
  findingDigest: CanonicalDigest;
}>;

export type AgentEvaluationPreDispatchFailureClassifier = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    invocationId: string;
    stage: AgentEvaluationPreDispatchFailureStage;
    suggestedReasonCode: AgentEvaluationPreDispatchFailureReasonCode;
    policyDigest: CanonicalDigest;
    inputDigest: CanonicalDigest;
    caught?: unknown;
  }>
) =>
  | AgentEvaluationPreDispatchFailureClassification
  | Promise<AgentEvaluationPreDispatchFailureClassification>;

export type AgentEvaluationReceiptPersistence<T> = (
  receipt: T
) => T | Promise<T>;

export type AgentEvaluationAttemptClosedTransportTurn = Readonly<{
  state: 'closed';
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  budgetReservationId: string;
  dispatchIntent: AgentEvaluationTransportDispatchIntent;
  transportReceipt: AgentEvaluationTransportReceipt;
  resultSpoolReceipt?: AgentEvaluationProviderResultSpoolReceipt;
  createdAt: Instant;
  closedAt: Instant;
  turnDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeAttempt = Readonly<{
  runtimeFacts: readonly AgentNativeProviderRuntimeFact[];
  events: readonly AgentProviderRuntimeEvent[];
  reportedUsage: AgentUsageVector;
  terminalEvent: AgentProviderRuntimeEvent;
  responseDigest: CanonicalDigest;
  runtimeRejected: boolean;
  artifactBytes: number;
}>;

export interface AgentEvaluationAttemptTransportJournal {
  takeClosedTurn(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turnIndex: number;
      invocation: AgentProviderAdapterInvocationRequest;
      encodedPayload: AgentEvaluationEncodedInvocationPayload;
    }>
  ): Promise<AgentEvaluationAttemptClosedTransportTurn>;
  recoverRuntimeTurn(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turn: AgentEvaluationAttemptClosedTransportTurn;
      invocation: AgentProviderAdapterInvocationRequest;
      encodedPayload: AgentEvaluationEncodedInvocationPayload;
      protectedLeakCanaries: readonly string[];
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationRuntimeAttempt>;
}

export type AgentEvaluationAttemptExecutorResult =
  AgentEvaluationAttemptExecution &
    Readonly<{
      transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
      transportReceipts: readonly AgentEvaluationTransportReceipt[];
      preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
      capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
      capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
      providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
      attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
      providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
      providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
      invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
      invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
      sourceReceipts: readonly AgentEvaluationSourceReceipt[];
      executionReceipt: AgentEvaluationExecutionReceipt;
      resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
      controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
      accountingDigest: CanonicalDigest;
      gradingDigest: CanonicalDigest;
      payloadDigest: CanonicalDigest;
    }>;

export type AgentEvaluationCapabilityEffectInputAuthoritySource = Readonly<{
  prepareRequestRefs: NonNullable<
    CreateAgentEvaluationAgentTurnLoopInput['prepareCapabilityEffectRequestRefs']
  >;
  resolveInputAuthority: NonNullable<
    CreateAgentEvaluationAgentTurnLoopInput['resolveCapabilityEffectInputAuthority']
  >;
}>;

export type CreateAgentEvaluationAttemptExecutorInput = Readonly<{
  namespaceId: string;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  adapters: AgentEvaluationAttemptAdapterSet;
  materialSource: AgentEvaluationAttemptMaterialSource;
  payloadRegistry: CallbackBoundAgentEvaluationInvocationPayloadRegistry;
  payloadOptions?: AgentEvaluationInvocationPayloadCodecOptions;
  retryPolicy: AgentEvaluationAttemptRetryPolicy;
  controlledRuntimeConfiguration: AgentEvaluationControlledRuntimeConfiguration;
  controlledRuntime: AgentEvaluationControlledRuntime;
  capabilityRuntime: AgentEvaluationCapabilityRuntime;
  optionalCapabilityFactAuthorityClient?: Pick<
    AgentEvaluationOptionalCapabilityFactAuthorityClient,
    'observe' | 'readNativeBootstrapSource'
  >;
  capabilityEffectInputAuthoritySource?: AgentEvaluationCapabilityEffectInputAuthoritySource;
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  requiresControlledPreview(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      material: AgentEvaluationCaseMaterial;
    }>
  ): boolean;
  transportJournal: AgentEvaluationAttemptTransportJournal;
  estimateShard: AgentModelEvaluationAttemptExecutor['estimateShard'];
  classifyTerminal?: AgentEvaluationAttemptTerminalClassifier;
  classifyPreDispatchFailure: AgentEvaluationPreDispatchFailureClassifier;
  resolveAndPersistAccounting: AgentEvaluationAttemptAccountingPersistence;
  gradeAndPersist: AgentEvaluationAttemptGradingPersistence;
  persistSourceReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationSourceReceipt>;
  persistPreDispatchFailureReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationPreDispatchFailureReceipt>;
  persistCapabilityExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationCapabilityExecutionReceipt>;
  persistCapabilitySpecificReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationCapabilitySpecificReceipt>;
  persistProviderCapabilityObservationReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationProviderCapabilityObservationReceipt>;
  persistAttemptAuthorityOwnerReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationAttemptAuthorityOwnerReceipt>;
  persistInvocationTurnReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationInvocationTurnReceipt>;
  persistResultSubmissionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationResultSubmissionReceipt>;
  persistControlledRuntimeReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationControlledRuntimeReceipt>;
  stageResultSpoolDispositionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationProviderResultSpoolDispositionReceipt>;
  persistExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationExecutionReceipt>;
  secretCanaries: () => readonly string[];
  now: () => Instant;
}>;

export type AgentEvaluationPreDispatchAttemptFinalizerPersistence = Readonly<{
  classifyPreDispatchFailure: AgentEvaluationPreDispatchFailureClassifier;
  persistPreDispatchFailureReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationPreDispatchFailureReceipt>;
  persistCapabilityExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationCapabilityExecutionReceipt>;
  persistInvocationTurnReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationInvocationTurnReceipt>;
  persistExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationExecutionReceipt>;
  now: () => Instant;
}>;

export type AgentEvaluationPreDispatchAttemptFinalizationInput = Readonly<{
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  stage: AgentEvaluationPreDispatchFailureStage;
  suggestedReasonCode: AgentEvaluationPreDispatchFailureReasonCode;
  policyDigest: CanonicalDigest;
  inputDigest: CanonicalDigest;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  contextPackDigest?: CanonicalDigest;
  caught?: unknown;
}>;

export interface AgentEvaluationPreDispatchAttemptFinalizer {
  execute(
    input: AgentEvaluationPreDispatchAttemptFinalizationInput
  ): Promise<AgentEvaluationAttemptExecutorResult>;
}

type AttemptContext = Readonly<{
  target: AgentModelEvaluationPlan['capabilityQualificationTargets'][number];
  provider: AgentModelEvaluationPlan['providerConfigurations'][number];
  model: AgentModelEvaluationPlan['modelConfigurations'][number];
  concreteCase: AgentModelEvaluationPlan['concreteCases'][number];
  contextPackDigest: CanonicalDigest;
  mediaRepresentationManifestDigest?: CanonicalDigest;
  providerMediaBlockManifestDigest?: CanonicalDigest;
}>;

type ExecutedTurnAuthority = Readonly<{
  closed: AgentEvaluationAttemptClosedTransportTurn;
  accounting?: AgentEvaluationAttemptAccounting;
  sourceReceipts: readonly AgentEvaluationSourceReceipt[];
  dispositionReceipt?: AgentEvaluationProviderResultSpoolDispositionReceipt;
}>;

const textEncoder = new TextEncoder();
const byteLength = (value: string): number =>
  textEncoder.encode(value).byteLength;

const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
};

const assertInstant = (value: string, label: string): void => {
  if (!isAgentControlInstant(value)) {
    throw new TypeError(`${label} must be a canonical instant.`);
  }
};

const omitDigest = <
  T extends Readonly<Record<string, unknown>>,
  K extends keyof T,
>(
  value: T,
  key: K
): Omit<T, K> => {
  const clone = { ...value };
  delete clone[key];
  return clone;
};

const exactPersist = async <T>(
  value: T,
  persist: AgentEvaluationReceiptPersistence<T>,
  label: string
): Promise<T> => {
  const stored = await persist(value);
  if (!sameCanonicalJson(value, stored)) {
    throw new Error(`${label} persistence acknowledgement drifted.`);
  }
  return stored;
};

const normalizeDemand = (value: AgentBudgetDemand): AgentBudgetDemand => {
  [
    value.modelInvocations,
    value.toolCalls,
    value.repairRounds,
    value.transactions,
    value.artifactBytes,
    value.elapsedMs,
  ].forEach((count, index) =>
    assertCount(count, `Budget demand field ${index}`)
  );
  const usage = createAgentUsageVector(value.usage.amounts);
  const cost = normalizeAgentCosts(value.cost);
  if (
    !sameCanonicalJson(usage, value.usage) ||
    !sameCanonicalJson(cost, value.cost)
  ) {
    throw new TypeError('Budget demand usage or cost is non-canonical.');
  }
  return Object.freeze({ ...value, usage, cost });
};

const assertRetryPolicy = (
  value: AgentEvaluationAttemptRetryPolicy
): AgentEvaluationAttemptRetryPolicy => {
  const expected = createAgentEvaluationAttemptRetryPolicy(value);
  if (!sameCanonicalJson(expected, value)) {
    throw new TypeError('Evaluation attempt retry policy digest drifted.');
  }
  return expected;
};

const assertPlanDescriptor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor
): void => {
  if (
    validateAgentModelEvaluationPlan(plan).length > 0 ||
    !isAgentModelEvaluationAttemptDescriptor(descriptor) ||
    descriptor.planDigest !== plan.planDigest
  ) {
    throw new TypeError('Evaluation plan or attempt descriptor is invalid.');
  }
  const planned = planAgentModelEvaluationAttempts(plan).find(
    ({ attemptId }) => attemptId === descriptor.attemptId
  );
  if (!planned || !sameCanonicalJson(planned, descriptor)) {
    throw new TypeError(
      'Evaluation attempt descriptor is outside the frozen plan.'
    );
  }
};

const resolveAttemptContext = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  material: AgentEvaluationCaseMaterial
): AttemptContext => {
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  );
  const provider = target
    ? plan.providerConfigurations.find(
        ({ providerConfigurationId }) =>
          providerConfigurationId === target.providerConfigurationId
      )
    : undefined;
  const model = target
    ? plan.modelConfigurations.find(
        ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
      )
    : undefined;
  const concreteCase = plan.concreteCases.find(
    ({ caseId }) => caseId === descriptor.caseId
  );
  if (!target || !provider || !model || !concreteCase) {
    throw new TypeError(
      'Evaluation descriptor target, provider, model, or case is missing.'
    );
  }
  if (
    material.caseId !== concreteCase.caseId ||
    material.caseDigest !== concreteCase.caseDigest ||
    material.caseDefinitionDigest !== concreteCase.caseDefinitionDigest ||
    material.capabilityProfileId !== target.capabilityProfileId ||
    target.targetDigest !== descriptor.targetDigest ||
    target.providerIdentityDigest !== digestAgentCanonicalValue(provider) ||
    target.providerOperatorId !== provider.providerOperatorId ||
    target.protocolFamily !== provider.adapter.protocolFamily ||
    target.modelId !== model.modelId ||
    target.modelFamilyOwnerId !== model.modelFamilyOwnerId
  ) {
    throw new TypeError('Evaluation material or target binding drifted.');
  }
  const contextTier = descriptor.contextTier
    ? plan.contextTiers.find(
        ({ caseId, tier }) =>
          caseId === descriptor.caseId && tier === descriptor.contextTier
      )
    : undefined;
  if (descriptor.contextTier && !contextTier) {
    throw new TypeError('Evaluation Context tier is missing from the plan.');
  }
  const contextPackDigest =
    contextTier?.contextPackDigest ??
    digestAgentCanonicalValue({
      contextBuilderDigest: plan.contextBuilderDigest,
      materialDigest: material.materialDigest,
      tier: 'default',
    });
  const mediaTier = descriptor.mediaRepresentationTier
    ? plan.mediaRepresentationTiers.find(
        ({ caseId, tier }) =>
          caseId === descriptor.caseId &&
          tier === descriptor.mediaRepresentationTier
      )
    : undefined;
  if (descriptor.mediaRepresentationTier && !mediaTier) {
    throw new TypeError('Evaluation media tier is missing from the plan.');
  }
  const mediaRepresentationManifestDigest =
    mediaTier?.representationManifestDigest;
  return Object.freeze({
    target,
    provider,
    model,
    concreteCase,
    contextPackDigest,
    ...(mediaRepresentationManifestDigest
      ? {
          mediaRepresentationManifestDigest,
          providerMediaBlockManifestDigest: digestAgentCanonicalValue({
            protocolFamily: target.protocolFamily,
            representationManifestDigest: mediaRepresentationManifestDigest,
            materialDigest: material.materialDigest,
          }),
        }
      : {}),
  });
};

const selectAdapter = (
  adapters: AgentEvaluationAttemptAdapterSet,
  protocolFamily: AgentProviderProtocolFamily
): AgentNativeProviderAdapter => {
  switch (protocolFamily) {
    case 'openai-responses':
      return adapters['openai-responses'];
    case 'anthropic-messages':
      return adapters['anthropic-messages'];
    case 'gemini-interactions':
      return adapters['gemini-interactions'];
    case 'openai-compatible':
      throw new TypeError(
        'Real evaluation attempts require one of the three frozen native protocols.'
      );
  }
};

const requestDigestFor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  material: AgentEvaluationCaseMaterial,
  context: AttemptContext,
  turnIndex: number,
  encodedPayload: AgentEvaluationEncodedInvocationPayload
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-attempt-turn-request',
    version: 3,
    planDigest: plan.planDigest,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex,
    targetDigest: context.target.targetDigest,
    materialDigest: material.materialDigest,
    contextPackDigest: context.contextPackDigest,
    ...(context.mediaRepresentationManifestDigest
      ? {
          mediaRepresentationManifestDigest:
            context.mediaRepresentationManifestDigest,
          providerMediaBlockManifestDigest:
            context.providerMediaBlockManifestDigest,
        }
      : {}),
    promptPolicyDigest: plan.promptPolicyDigest,
    outputSchemaDigest: plan.outputSchemaDigest,
    toolRegistryDigest: plan.toolRegistryDigest,
    actionRegistryDigest: plan.actionRegistryDigest,
    protocolFamily: encodedPayload.protocolFamily,
    providerPayloadDigest: encodedPayload.payloadDigest,
  });

export const createAgentEvaluationAttemptInvocationId = (
  descriptor: AgentModelEvaluationAttemptDescriptor,
  turnIndex: number
): string =>
  `evaluation-invocation:${descriptor.samplingIdentityDigest.slice('sha256-'.length)}:${turnIndex}`;

const requestFor = (
  descriptor: AgentModelEvaluationAttemptDescriptor,
  context: AttemptContext,
  turnIndex: number,
  requestDigest: CanonicalDigest
): AgentProviderAdapterInvocationRequest =>
  Object.freeze({
    invocationId: createAgentEvaluationAttemptInvocationId(
      descriptor,
      turnIndex
    ),
    requestDigest,
    providerConfigurationId: context.target.providerConfigurationId,
    modelLineageDigest: context.target.modelLineageDigest,
    capabilityProfileDigest: context.target.capabilityProfileDigest,
    inferenceConfigurationDigest: context.target.inferenceConfigurationDigest,
    contextPackDigest: context.contextPackDigest,
    ...(context.mediaRepresentationManifestDigest
      ? {
          multimodalContextManifestDigest:
            context.mediaRepresentationManifestDigest,
          providerMediaBlockManifestDigest:
            context.providerMediaBlockManifestDigest,
        }
      : {}),
  });

const preDispatchStatusFor = (
  reasonCode: AgentEvaluationPreDispatchFailureReasonCode
): Exclude<AgentEvaluationAttemptStatus, 'completed'> => {
  switch (reasonCode) {
    case 'protected-material-unavailable':
    case 'verification-attempt-grant-unavailable':
      return 'infrastructure-error';
    case 'protected-material-integrity-failed':
    case 'protected-material-policy-rejected':
    case 'protected-material-leak-blocked':
    case 'budget-admission-rejected':
      return 'blocked';
    case 'invocation-payload-invalid':
      return 'schema-failed';
    case 'cancelled-before-dispatch':
      return 'cancelled';
  }
};

const preDispatchContextPackDigest = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor
): CanonicalDigest =>
  plan.contextTiers.find(
    ({ caseId, tier }) =>
      caseId === descriptor.caseId && tier === descriptor.contextTier
  )?.contextPackDigest ??
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-pre-dispatch-context',
    version: 1,
    contextBuilderDigest: plan.contextBuilderDigest,
    descriptorDigest: descriptor.descriptorDigest,
  });

const isTerminal = (type: AgentProviderEvent['type']): boolean =>
  [
    'completed',
    'failed',
    'refusal',
    'safety-block',
    'truncation',
    'cancelled',
    'timed-out',
    'partial',
  ].includes(type);

const toolArgumentBytes = (event: AgentProviderRuntimeEvent): number => {
  if (
    event.durableEvent.type !== 'tool-call' ||
    !isPlainObject(event.payload)
  ) {
    return 0;
  }
  return byteLength(canonicalJsonText(event.payload.arguments));
};

const syntheticFailure = (
  invocationId: string,
  requestDigest: CanonicalDigest,
  occurredAt: Instant,
  reason: string
): AgentEvaluationRuntimeAttempt => {
  const event = createAgentProviderRuntimeEvent({
    eventId: `${invocationId}.sanitized-terminal`,
    invocationId,
    sequence: 0,
    type: 'failed',
    payload: Object.freeze({ reason }),
    occurredAt,
  });
  const usage = createUnknownAgentUsageVector([
    'text-token-input',
    'text-token-output',
  ]);
  const runtimeFacts = Object.freeze([
    Object.freeze({ factType: 'provider-event' as const, value: event }),
    Object.freeze({ factType: 'usage-vector' as const, value: usage }),
  ]);
  return Object.freeze({
    runtimeFacts,
    events: Object.freeze([event]),
    reportedUsage: usage,
    terminalEvent: event,
    responseDigest: digestAgentNativeProviderRuntimeResponse(
      requestDigest,
      runtimeFacts
    ),
    runtimeRejected: true,
    artifactBytes: byteLength(canonicalJsonText(event.payload)),
  });
};

export const collectAgentEvaluationRuntimeFacts = async (
  facts:
    | AsyncIterable<AgentNativeProviderRuntimeFact>
    | Iterable<AgentNativeProviderRuntimeFact>,
  invocation: AgentProviderAdapterInvocationRequest,
  protectedLeakCanaries: readonly string[],
  now: () => Instant
): Promise<AgentEvaluationRuntimeAttempt> => {
  const runtimeFacts: AgentNativeProviderRuntimeFact[] = [];
  const events: AgentProviderRuntimeEvent[] = [];
  const optionalFactTypes = new Set<
    AgentNativeProviderRuntimeOptionalCapabilityFact['factType']
  >();
  let usage: AgentUsageVector | undefined;
  let aggregateBytes = 0;
  let outputBytes = 0;
  let aggregateToolArgumentBytes = 0;
  let toolCalls = 0;
  try {
    for await (const fact of facts) {
      if (fact.factType === 'usage-vector') {
        if (usage !== undefined) {
          throw new Error('Provider runtime emitted multiple usage vectors.');
        }
        const normalized = createAgentUsageVector(fact.value.amounts);
        if (!sameCanonicalJson(normalized, fact.value)) {
          throw new Error('Provider runtime usage vector drifted.');
        }
        usage = normalized;
        runtimeFacts.push(
          Object.freeze({ factType: 'usage-vector', value: normalized })
        );
        continue;
      }
      if (fact.factType !== 'provider-event') {
        if (
          usage !== undefined ||
          optionalFactTypes.has(fact.factType) ||
          optionalFactTypes.size >= 2
        ) {
          throw new Error(
            'Provider runtime optional capability facts drifted.'
          );
        }
        optionalFactTypes.add(fact.factType);
        aggregateBytes += byteLength(canonicalJsonText(fact));
        if (
          aggregateBytes > AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_EVENT_BYTES
        ) {
          throw new Error(
            'Provider runtime aggregate fact bound was exceeded.'
          );
        }
        runtimeFacts.push(fact);
        continue;
      }
      if (usage !== undefined) {
        throw new Error(
          'Provider runtime emitted an event after usage finalization.'
        );
      }
      const event = validateAgentProviderRuntimeEventBinding(fact.value, {
        secretCanaries: protectedLeakCanaries,
      });
      if (events.at(-1) && isTerminal(events.at(-1)!.durableEvent.type)) {
        throw new Error(
          'Provider runtime emitted an event after terminal finalization.'
        );
      }
      const eventBytes = byteLength(canonicalJsonText(event.payload));
      aggregateBytes += eventBytes;
      if (
        events.length >= AGENT_NATIVE_PROVIDER_MAXIMUM_EVENTS ||
        eventBytes > AGENT_NATIVE_PROVIDER_MAXIMUM_EVENT_BYTES ||
        aggregateBytes > AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_EVENT_BYTES
      ) {
        throw new Error('Provider runtime event bounds were exceeded.');
      }
      if (event.durableEvent.type === 'output-delta') {
        outputBytes += eventBytes;
        if (outputBytes > AGENT_NATIVE_PROVIDER_MAXIMUM_OUTPUT_BYTES) {
          throw new Error('Provider runtime output bound was exceeded.');
        }
      }
      if (event.durableEvent.type === 'tool-call') {
        toolCalls += 1;
        const argumentBytes = toolArgumentBytes(event);
        aggregateToolArgumentBytes += argumentBytes;
        if (
          toolCalls > AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_CALLS ||
          argumentBytes > AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_ARGUMENT_BYTES ||
          aggregateToolArgumentBytes >
            AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_TOOL_ARGUMENT_BYTES
        ) {
          throw new Error('Provider runtime tool-call bounds were exceeded.');
        }
      }
      events.push(event);
      runtimeFacts.push(
        Object.freeze({ factType: 'provider-event', value: event })
      );
    }
    if (!usage || events.length === 0) {
      throw new Error('Provider runtime omitted events or usage.');
    }
    if (
      validateAgentProviderEventSequence(
        invocation.invocationId,
        events.map(({ durableEvent }) => durableEvent)
      ).length > 0
    ) {
      throw new Error('Provider runtime event sequence is invalid.');
    }
    return Object.freeze({
      runtimeFacts: Object.freeze(runtimeFacts),
      events: Object.freeze(events),
      reportedUsage: usage,
      terminalEvent: events.at(-1)!,
      responseDigest: digestAgentNativeProviderRuntimeResponse(
        invocation.requestDigest,
        runtimeFacts
      ),
      runtimeRejected: false,
      artifactBytes: aggregateBytes,
    });
  } catch {
    const occurredAt = now();
    assertInstant(occurredAt, 'Synthetic runtime completion');
    return syntheticFailure(
      invocation.invocationId,
      invocation.requestDigest,
      occurredAt,
      'runtime-evidence-rejected'
    );
  }
};

const collectRuntimeAttempt = (
  adapter: AgentNativeProviderAdapter,
  invocation: AgentProviderAdapterInvocationRequest,
  signal: AbortSignal | undefined,
  protectedLeakCanaries: readonly string[],
  now: () => Instant
): Promise<AgentEvaluationRuntimeAttempt> =>
  collectAgentEvaluationRuntimeFacts(
    adapter.invokeRuntime(invocation, signal),
    invocation,
    protectedLeakCanaries,
    now
  );

const optionalObservationFactTypeFor = (
  context: AttemptContext
): AgentEvaluationProviderCapabilityObservedFact['factKind'] | undefined => {
  switch (context.target.optionalCapabilitySupportAuthority?.capabilityId) {
    case 'provider.background-job':
      return 'provider-job-receipt';
    case 'provider.isolated-cache':
      return 'provider-cache-receipt';
    case 'provider.reasoning-continuation':
      return 'opaque-continuation';
    case 'provider.hosted-retrieval':
      return 'retrieval-query-receipt';
    case 'provider.parallel-tool':
    case undefined:
      return undefined;
    default:
      throw new TypeError('Evaluation optional capability identity drifted.');
  }
};

export const selectAgentEvaluationAttemptProviderCapabilityObservationFacts =
  (input: {
    envelopes: readonly AgentEvaluationProviderCapabilityRuntimeFactEnvelope[];
    expectedOptionalFactKind?: AgentEvaluationProviderCapabilityObservedFact['factKind'];
    optionalCapabilityRequired: boolean;
    admittedSourceAuthorities: readonly AgentEvaluationProviderCapabilityRuntimeSourceAuthority[];
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization;
  }): AgentEvaluationProviderCapabilityObservationFactSelection => {
    const requiredFactKinds: readonly AgentEvaluationProviderCapabilityObservedFact['factKind'][] =
      input.optionalCapabilityRequired && input.expectedOptionalFactKind
        ? input.expectedOptionalFactKind === 'provider-cache-receipt'
          ? Object.freeze(['provider-cache-receipt', 'usage-vector'])
          : Object.freeze([input.expectedOptionalFactKind, 'provider-event'])
        : Object.freeze(['provider-event', 'usage-vector']);
    const selected = selectAgentEvaluationProviderCapabilityObservationFacts({
      envelopes: input.envelopes,
      requiredFactKinds,
      admittedSourceAuthorities: input.admittedSourceAuthorities,
      sanitization: input.sanitization,
    });
    if (
      selected.facts.length > 0 ||
      !input.optionalCapabilityRequired ||
      input.expectedOptionalFactKind === undefined
    ) {
      return selected;
    }
    return selectAgentEvaluationProviderCapabilityObservationFacts({
      envelopes: input.envelopes,
      requiredFactKinds: Object.freeze(['provider-event', 'usage-vector']),
      admittedSourceAuthorities: input.admittedSourceAuthorities,
      sanitization: input.sanitization,
    });
  };

const transportFailureStatus = (
  receipt: AgentEvaluationTransportReceipt
): AgentEvaluationAttemptStatus => {
  switch (receipt.errorCategory) {
    case 'G4_RUNNER_PROVIDER_RATE_LIMITED':
      return 'rate-limited';
    case 'G4_RUNNER_ABORTED':
      return 'cancelled';
    case 'G4_RUNNER_RESPONSE_SECRET_LEAK':
      return 'blocked';
    case 'G4_RUNNER_RESPONSE_INVALID':
    case 'G4_RUNNER_RESPONSE_TOO_LARGE':
      return 'schema-failed';
    case 'G4_RUNNER_PROVIDER_AUTH_REJECTED':
    case 'G4_RUNNER_PROVIDER_REJECTED':
      return 'provider-error';
    case 'G4_RUNNER_CAPTURE_FAILED':
    case 'G4_RUNNER_CONFIGURATION_INVALID':
    case 'G4_RUNNER_DISABLED':
    case 'G4_RUNNER_EGRESS_DENIED':
    case 'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE':
    case 'G4_RUNNER_SECRET_UNAVAILABLE':
    case 'G4_RUNNER_SECRET_USE_DENIED':
    case 'G4_RUNNER_SERVER_ONLY':
    case 'G4_RUNNER_TRANSPORT_FAILED':
    case undefined:
      return 'infrastructure-error';
  }
};

const defaultRuntimeStatus = (
  runtime: AgentEvaluationRuntimeAttempt
): AgentEvaluationAttemptStatus => {
  if (runtime.runtimeRejected) return 'schema-failed';
  switch (runtime.terminalEvent.durableEvent.type) {
    case 'completed':
      return 'completed';
    case 'refusal':
    case 'truncation':
    case 'partial':
      return 'schema-failed';
    case 'safety-block':
      return 'blocked';
    case 'cancelled':
      return 'cancelled';
    case 'timed-out':
      return 'timed-out';
    case 'failed':
      return 'provider-error';
    case 'output-delta':
    case 'tool-call':
    case 'usage':
      throw new TypeError('Provider runtime terminal event is invalid.');
  }
};

const assertClosedTransportTurn = (
  turn: AgentEvaluationAttemptClosedTransportTurn,
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    context: AttemptContext;
    turnIndex: number;
    invocation: AgentProviderAdapterInvocationRequest;
    responseDigest?: CanonicalDigest;
  }>
): void => {
  const intent = turn.dispatchIntent;
  const receipt = turn.transportReceipt;
  const completed = receipt.outcome === 'completed';
  if (
    turn.state !== 'closed' ||
    turn.attemptId !== input.descriptor.attemptId ||
    turn.descriptorDigest !== input.descriptor.descriptorDigest ||
    turn.turnIndex !== input.turnIndex ||
    !isAgentControlIdentity(turn.budgetReservationId) ||
    !isAgentCanonicalDigest(turn.turnDigest) ||
    !isAgentControlInstant(turn.createdAt) ||
    !isAgentControlInstant(turn.closedAt) ||
    !isAgentEvaluationTransportDispatchIntent(intent) ||
    !isAgentEvaluationTransportReceipt(receipt) ||
    intent.planDigest !== input.plan.planDigest ||
    intent.repositoryCommit !== input.plan.repositoryCommit ||
    intent.attemptId !== input.descriptor.attemptId ||
    intent.descriptorDigest !== input.descriptor.descriptorDigest ||
    intent.turnIndex !== input.turnIndex ||
    intent.budgetReservationId !== turn.budgetReservationId ||
    intent.protocolFamily !== input.context.target.protocolFamily ||
    intent.providerConfigurationId !==
      input.context.target.providerConfigurationId ||
    intent.modelLineageDigest !== input.context.target.modelLineageDigest ||
    intent.inferenceConfigurationDigest !==
      input.context.target.inferenceConfigurationDigest ||
    intent.invocationId !== input.invocation.invocationId ||
    intent.requestDigest !== input.invocation.requestDigest ||
    receipt.protocolFamily !== intent.protocolFamily ||
    receipt.providerConfigurationId !== intent.providerConfigurationId ||
    receipt.invocationId !== intent.invocationId ||
    receipt.dispatchIntentDigest !== intent.intentDigest ||
    receipt.requestDigest !== intent.requestDigest ||
    receipt.endpointId !== intent.endpointId ||
    receipt.endpointClass !== intent.endpointClass ||
    receipt.requestBodyDigest !== intent.requestBodyDigest ||
    receipt.requestBytes !== intent.requestBytes ||
    completed !== (turn.resultSpoolReceipt !== undefined) ||
    (receipt.dispatchState === 'not-dispatched' &&
      receipt.outcome !== 'failed') ||
    (receipt.outcome === 'post-dispatch-unknown' &&
      receipt.dispatchState !== 'dispatched')
  ) {
    throw new TypeError('Evaluation closed transport turn drifted.');
  }
  const spool = turn.resultSpoolReceipt;
  if (
    spool &&
    (!isAgentEvaluationProviderResultSpoolReceipt(spool) ||
      spool.planDigest !== input.plan.planDigest ||
      spool.repositoryCommit !== input.plan.repositoryCommit ||
      spool.attemptId !== input.descriptor.attemptId ||
      spool.descriptorDigest !== input.descriptor.descriptorDigest ||
      spool.turnIndex !== input.turnIndex ||
      spool.invocationId !== input.invocation.invocationId ||
      spool.dispatchIntentDigest !== intent.intentDigest ||
      spool.transportReceiptDigest !== receipt.receiptDigest ||
      spool.responseBodyDigest !== receipt.responseBodyDigest ||
      (input.responseDigest !== undefined &&
        spool.responseDigest !== input.responseDigest))
  ) {
    throw new TypeError('Evaluation provider-result spool binding drifted.');
  }
};

const createProviderCapabilityObservation = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  context: AttemptContext,
  turnIndex: number,
  invocation: AgentProviderAdapterInvocationRequest,
  runtime: AgentEvaluationRuntimeAttempt,
  closed: AgentEvaluationAttemptClosedTransportTurn,
  protectedMaterialCanaries: readonly string[],
  secretCanaries: readonly string[],
  sharedAuthority?: Readonly<{
    runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
    runtimeFactEnvelopes: readonly AgentEvaluationProviderCapabilityRuntimeFactEnvelope[];
    observedAt: Instant;
  }>
): AgentEvaluationProviderCapabilityObservationReceipt | undefined => {
  const spool = closed.resultSpoolReceipt;
  if (
    runtime.runtimeRejected ||
    closed.transportReceipt.outcome !== 'completed' ||
    !spool
  ) {
    return undefined;
  }
  const expectedOptionalFactType = optionalObservationFactTypeFor(context);
  const nativeFacts = selectAgentNativeProviderCapabilityObservationFacts({
    facts: runtime.runtimeFacts,
  }).flatMap(
    (fact): readonly AgentEvaluationProviderCapabilityObservedFact[] => {
      switch (fact.factType) {
        case 'provider-event':
          return Object.freeze([
            Object.freeze({
              factKind: 'provider-event' as const,
              factDigest: fact.value.durableEvent.eventDigest,
              value: fact.value.durableEvent,
            }),
          ]);
        case 'usage-vector':
          return Object.freeze([
            Object.freeze({
              factKind: 'usage-vector' as const,
              factDigest: fact.value.vectorDigest,
              value: fact.value,
            }),
          ]);
        case 'provider-job-receipt':
        case 'provider-cache-receipt':
        case 'opaque-continuation':
          return Object.freeze([]);
      }
    }
  );
  const sanitization = Object.freeze({
    protectedMaterialCanaries,
    secretCanaries,
  });
  const observedAt =
    sharedAuthority?.observedAt ?? closed.transportReceipt.completedAt;
  const nativeSourceAuthority = Object.freeze({
    sourceAuthorityKind: 'native-provider-transport' as const,
    sourceAuthorityId: context.target.providerConfigurationId,
    sourceAuthorityImplementationDigest: context.provider.adapter.adapterDigest,
  });
  const nativeEnvelopes = Object.freeze(
    nativeFacts.map((fact) =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...nativeSourceAuthority,
          stageDigest: closed.dispatchIntent.intentDigest,
          dispatchAckDigest: closed.transportReceipt.receiptDigest,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          turnIndex,
          invocationId: invocation.invocationId,
          requestDigest: invocation.requestDigest,
          responseDigest: spool.responseDigest,
          protocolFamily: context.target
            .protocolFamily as AgentEvaluationAttemptNativeProtocol,
          providerConfigurationId: context.target.providerConfigurationId,
          modelLineageDigest: context.target.modelLineageDigest,
          adapterDigest: context.provider.adapter.adapterDigest,
          dispatchIntentDigest: closed.dispatchIntent.intentDigest,
          transportReceiptDigest: closed.transportReceipt.receiptDigest,
          resultSpoolReceiptDigest: spool.receiptDigest,
          normalizedEventSetDigest: spool.normalizedEventSetDigest,
          observedAt,
          fact,
        },
        sanitization
      )
    )
  );
  const envelopes = Object.freeze([
    ...nativeEnvelopes,
    ...(sharedAuthority?.runtimeFactEnvelopes ?? []),
  ]);
  const admittedSourceAuthorities = Object.freeze([
    nativeSourceAuthority,
    ...(sharedAuthority
      ? [
          Object.freeze({
            sourceAuthorityKind: 'shared-durable-capability' as const,
            runtimeFactSourceAuthority:
              sharedAuthority.runtimeFactSourceAuthority,
          }),
        ]
      : []),
  ] satisfies readonly AgentEvaluationProviderCapabilityRuntimeSourceAuthority[]);
  const selection =
    selectAgentEvaluationAttemptProviderCapabilityObservationFacts({
      envelopes,
      ...(expectedOptionalFactType
        ? { expectedOptionalFactKind: expectedOptionalFactType }
        : {}),
      optionalCapabilityRequired:
        context.target.optionalCapabilitySupportAuthority
          ?.supportExpectation === 'required',
      admittedSourceAuthorities,
      sanitization,
    });
  const receipt = createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: `evaluation-provider-observation:${descriptor.samplingIdentityDigest.slice('sha256-'.length)}:${turnIndex}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex,
      invocationId: invocation.invocationId,
      requestDigest: invocation.requestDigest,
      responseDigest: spool.responseDigest,
      protocolFamily: context.target
        .protocolFamily as AgentEvaluationAttemptNativeProtocol,
      providerConfigurationId: context.target.providerConfigurationId,
      modelLineageDigest: context.target.modelLineageDigest,
      adapterDigest: context.provider.adapter.adapterDigest,
      dispatchIntentDigest: closed.dispatchIntent.intentDigest,
      transportReceiptDigest: closed.transportReceipt.receiptDigest,
      resultSpoolReceiptDigest: spool.receiptDigest,
      normalizedEventSetDigest: spool.normalizedEventSetDigest,
      facts: selection.facts,
      factAuthorities: selection.factAuthorities,
      observedAt,
    },
    sanitization
  );
  if (!isAgentEvaluationProviderCapabilityObservationReceipt(receipt)) {
    throw new TypeError(
      'Evaluation provider capability observation receipt is invalid.'
    );
  }
  return receipt;
};

const assertSourceReceiptCanonical = (
  receipt: AgentEvaluationSourceReceipt,
  plan: AgentModelEvaluationPlan
): void => {
  const expected = createAgentEvaluationSourceReceipt(
    omitDigest(receipt, 'receiptDigest')
  );
  if (
    !sameCanonicalJson(expected, receipt) ||
    !isAgentEvaluationSourceReceipt(receipt) ||
    receipt.planDigest !== plan.planDigest ||
    receipt.repositoryCommit !== plan.repositoryCommit
  ) {
    throw new TypeError('Evaluation source receipt digest drifted.');
  }
};

const accountingBinding = (
  input: AgentEvaluationAttemptAccountingInput,
  value: AgentEvaluationAttemptAccounting,
  context: AttemptContext
): readonly AgentEvaluationSourceReceipt[] => {
  const usage = createAgentUsageVector(value.usage.amounts);
  const cost = normalizeAgentCosts(value.cost);
  const effectiveStatus = value.statusOverride ?? input.status;
  const transport = input.transportReceipt;
  const hasProviderAuthority = value.providerRequestId !== undefined;
  const hasFailureAuthority =
    value.executionFailureAuthorityReceiptDigest !== undefined &&
    value.executionFailureSourceUri !== undefined;
  const usageIsAuthoritative =
    usage.amounts.length > 0 &&
    usage.amounts.every(
      ({ confidence, sourceDigest }) =>
        confidence !== 'unknown' && isAgentCanonicalDigest(sourceDigest)
    );
  const costIsAuthoritative =
    cost.length > 0 &&
    cost.every(
      ({ amount, confidence, sourceDigest }) =>
        amount !== undefined &&
        confidence !== 'unknown' &&
        isAgentCanonicalDigest(sourceDigest)
    );
  const validDisposition =
    (value.costStatus === 'priced' &&
      hasProviderAuthority &&
      usageIsAuthoritative &&
      costIsAuthoritative) ||
    (value.costStatus === 'unknown' &&
      effectiveStatus !== 'completed' &&
      (hasProviderAuthority || hasFailureAuthority) &&
      (usage.amounts.length === 0 || usageIsAuthoritative) &&
      cost.length === 0);
  const modelIdentityBase = {
    protocolFamily: context.target.protocolFamily,
    transportReceiptDigest: transport.receiptDigest,
    frozenModelId: context.model.modelId,
    ...(context.model.immutableVersion
      ? { frozenImmutableModelVersion: context.model.immutableVersion }
      : {}),
    ...(value.resolvedModelId
      ? { resolvedModelId: value.resolvedModelId }
      : {}),
    ...(value.resolvedModelVersion
      ? { resolvedModelVersion: value.resolvedModelVersion }
      : {}),
  } as const;
  const successfulModelMatch =
    value.resolvedModelId === context.model.modelId &&
    (value.resolvedModelVersion === undefined ||
      value.resolvedModelVersion === context.model.immutableVersion) &&
    (context.target.protocolFamily !== 'gemini-interactions' ||
      value.resolvedModelVersion === context.model.immutableVersion);
  if (
    !sameCanonicalJson(usage, value.usage) ||
    !sameCanonicalJson(cost, value.cost) ||
    value.dispatchState !== 'dispatched' ||
    transport.dispatchState !== 'dispatched' ||
    value.transportReceiptDigest !== transport.receiptDigest ||
    !validDisposition ||
    (value.statusOverride !== undefined &&
      (input.status !== 'completed' ||
        value.statusOverride !== 'infrastructure-error')) ||
    (effectiveStatus === 'completed' &&
      (value.costStatus !== 'priced' || !successfulModelMatch)) ||
    value.resolvedModelId !== transport.resolvedModelId ||
    value.resolvedModelVersion !== transport.resolvedModelVersion ||
    value.resolvedModelIdentityDigest !==
      digestAgentEvaluationResolvedModelIdentity(modelIdentityBase) ||
    hasProviderAuthority === hasFailureAuthority ||
    value.providerRequestId !== transport.providerRequestId ||
    (hasFailureAuthority &&
      value.executionFailureAuthorityReceiptDigest !==
        transport.receiptDigest) ||
    (value.executionFailureSourceUri !== undefined &&
      (value.executionFailureSourceUri.length === 0 ||
        value.executionFailureSourceUri.length > 2_048 ||
        containsAsciiControlCharacter(value.executionFailureSourceUri)))
  ) {
    throw new TypeError('Evaluation accounting authority is malformed.');
  }
  const sourceReceipts = [
    value.usageSourceReceipt,
    value.costSourceReceipt,
    ...(value.pricingSourceReceipt ? [value.pricingSourceReceipt] : []),
  ];
  sourceReceipts.forEach((receipt) =>
    assertSourceReceiptCanonical(receipt, input.plan)
  );
  const sourceBaseMatches = (receipt: AgentEvaluationSourceReceipt): boolean =>
    receipt.providerConfigurationId ===
      context.target.providerConfigurationId &&
    receipt.modelLineageDigest === context.target.modelLineageDigest &&
    receipt.providerRequestId === value.providerRequestId &&
    receipt.executionFailureAuthorityReceiptDigest ===
      value.executionFailureAuthorityReceiptDigest &&
    (hasProviderAuthority
      ? receipt.sourceUri === undefined
      : receipt.sourceUri === value.executionFailureSourceUri);
  if (
    !sourceBaseMatches(value.usageSourceReceipt) ||
    value.usageSourceReceipt.sourceKind !== 'provider-reported-usage' ||
    value.usageSourceReceipt.inputUsageDigest !== usage.vectorDigest ||
    usage.amounts.some(
      ({ sourceDigest }) =>
        sourceDigest !== value.usageSourceReceipt.sourceContentDigest
    ) ||
    !sourceBaseMatches(value.costSourceReceipt) ||
    !['provider-reported-cost', 'cost-calculation'].includes(
      value.costSourceReceipt.sourceKind
    ) ||
    (value.costStatus === 'unknown' &&
      value.costSourceReceipt.sourceKind !== 'provider-reported-cost') ||
    value.costSourceReceipt.outputCostDigest !==
      digestAgentEvaluationCostValues(cost) ||
    cost.some(
      ({ sourceDigest }) =>
        sourceDigest !== value.costSourceReceipt.sourceContentDigest
    )
  ) {
    throw new TypeError('Evaluation usage or cost source binding drifted.');
  }
  if (value.costSourceReceipt.sourceKind === 'cost-calculation') {
    const pricing = value.pricingSourceReceipt;
    if (
      !pricing ||
      pricing.sourceKind !== 'pricing-snapshot' ||
      !value.costSourceReceipt.pricingSnapshot ||
      value.costSourceReceipt.inputUsageDigest !== usage.vectorDigest ||
      value.costSourceReceipt.sourceContentDigest !==
        digestAgentEvaluationCostCalculationSource({
          providerConfigurationId: context.target.providerConfigurationId,
          modelLineageDigest: context.target.modelLineageDigest,
          ...(value.providerRequestId
            ? { providerRequestId: value.providerRequestId }
            : {
                executionFailureAuthorityReceiptDigest:
                  value.executionFailureAuthorityReceiptDigest,
              }),
          pricingSnapshotDigest:
            value.costSourceReceipt.pricingSnapshot.snapshotDigest,
          inputUsageDigest: usage.vectorDigest,
          outputCostDigest: digestAgentEvaluationCostValues(cost),
        }) ||
      pricing.sourceContentDigest !==
        value.costSourceReceipt.pricingSnapshot.snapshotDigest
    ) {
      throw new TypeError('Evaluation pricing-source binding drifted.');
    }
  } else if (value.pricingSourceReceipt !== undefined) {
    throw new TypeError('Provider-reported cost cannot claim pricing source.');
  }
  if (
    new Set(sourceReceipts.map(({ receiptDigest }) => receiptDigest)).size !==
      sourceReceipts.length ||
    value.accountingDigest !==
      digestAgentEvaluationAttemptAccounting({
        descriptorDigest: input.descriptor.descriptorDigest,
        turnIndex: input.turnIndex,
        invocationId: input.invocation.invocationId,
        requestDigest: input.invocation.requestDigest,
        responseDigest: input.responseDigest,
        status: effectiveStatus,
        costStatus: value.costStatus,
        usageVectorDigest: usage.vectorDigest,
        cost,
        sourceReceiptDigests: sourceReceipts.map(
          ({ receiptDigest }) => receiptDigest
        ),
        transportReceiptDigest: transport.receiptDigest,
        resolvedModelIdentityDigest: value.resolvedModelIdentityDigest,
        ...(value.providerRequestId
          ? { providerRequestId: value.providerRequestId }
          : {
              executionFailureAuthorityReceiptDigest:
                value.executionFailureAuthorityReceiptDigest,
              executionFailureSourceUri: value.executionFailureSourceUri,
            }),
        responseHeaderDigest: value.responseHeaderDigest,
      })
  ) {
    throw new TypeError('Evaluation accounting persistence digest drifted.');
  }
  return Object.freeze(sourceReceipts);
};

export const digestAgentEvaluationAttemptAccounting = (
  input: Readonly<{
    descriptorDigest: CanonicalDigest;
    turnIndex: number;
    invocationId: string;
    requestDigest: CanonicalDigest;
    responseDigest: CanonicalDigest;
    status: AgentEvaluationAttemptStatus;
    costStatus: AgentModelInvocationReceipt['costStatus'];
    usageVectorDigest: CanonicalDigest;
    cost: readonly AgentCost[];
    sourceReceiptDigests: readonly CanonicalDigest[];
    transportReceiptDigest: CanonicalDigest;
    resolvedModelIdentityDigest: CanonicalDigest;
    providerRequestId?: string;
    executionFailureAuthorityReceiptDigest?: CanonicalDigest;
    executionFailureSourceUri?: string;
    responseHeaderDigest: CanonicalDigest;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    descriptorDigest: input.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    status: input.status,
    dispatchState: 'dispatched',
    costStatus: input.costStatus,
    usageVectorDigest: input.usageVectorDigest,
    costDigest: digestAgentEvaluationCostValues(
      normalizeAgentCosts(input.cost)
    ),
    transportReceiptDigest: input.transportReceiptDigest,
    resolvedModelIdentityDigest: input.resolvedModelIdentityDigest,
    sourceReceiptDigests: input.sourceReceiptDigests,
    ...(input.providerRequestId
      ? { providerRequestId: input.providerRequestId }
      : {
          executionFailureAuthorityReceiptDigest:
            input.executionFailureAuthorityReceiptDigest,
          executionFailureSourceUri: input.executionFailureSourceUri,
        }),
    responseHeaderDigest: input.responseHeaderDigest,
  });

const invocationOutcome = (
  terminalType: AgentProviderEvent['type'],
  status: AgentEvaluationAttemptStatus
): AgentModelInvocationReceipt['outcome'] => {
  if (status === 'schema-failed') return 'schema-failed';
  switch (terminalType) {
    case 'completed':
      return status === 'completed' ? 'completed' : 'provider-error';
    case 'refusal':
      return 'refused';
    case 'safety-block':
      return 'safety-blocked';
    case 'truncation':
      return 'truncated';
    case 'cancelled':
      return 'cancelled';
    case 'timed-out':
      return 'timed-out';
    case 'partial':
      return 'partial';
    case 'failed':
      return 'provider-error';
    case 'output-delta':
    case 'tool-call':
    case 'usage':
      throw new TypeError('Evaluation invocation outcome is invalid.');
  }
};

const createInvocationReceipt = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    context: AttemptContext;
    turn: AgentEvaluationAgentLoopTurn;
    accounting: AgentEvaluationAttemptAccounting;
  }>
): AgentModelInvocationReceipt => {
  const base = Object.freeze({
    invocationId: input.turn.invocation.invocationId,
    taskId: `evaluation-task:${input.plan.planDigest.slice('sha256-'.length)}`,
    runId: `evaluation-run:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    generation: input.turn.turnIndex,
    attempt: 0,
    provider: input.context.provider,
    model: input.context.model,
    capabilityQualificationDigest:
      input.context.target.qualificationSliceDigest,
    inferenceConfigurationDigest:
      input.context.target.inferenceConfigurationDigest,
    contextPackDigest: input.context.contextPackDigest,
    ...(input.context.mediaRepresentationManifestDigest
      ? {
          multimodalContextManifestDigest:
            input.context.mediaRepresentationManifestDigest,
          providerMediaBlockManifestDigest:
            input.context.providerMediaBlockManifestDigest,
        }
      : {}),
    requestDigest: input.turn.invocation.requestDigest,
    responseDigest: input.turn.responseDigest,
    outcome: invocationOutcome(
      input.turn.runtime.terminalEvent.durableEvent.type,
      input.turn.status
    ),
    usage: input.accounting.usage,
    costStatus: input.accounting.costStatus,
    cost: input.accounting.cost,
    ...(input.accounting.costSourceReceipt.sourceKind === 'cost-calculation' &&
    input.accounting.costSourceReceipt.pricingSnapshot
      ? {
          pricingSnapshotRef:
            input.accounting.costSourceReceipt.pricingSnapshot
              .pricingSnapshotId,
        }
      : {}),
    startedAt: input.turn.runtime.startedAt,
    completedAt: input.turn.runtime.completedAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const retryReceiptFor = (
  input: Readonly<{
    retryPolicy: AgentEvaluationAttemptRetryPolicy;
    turn: AgentEvaluationAgentLoopTurn;
    invocationReceipt?: AgentModelInvocationReceipt;
    dispatched: boolean;
  }>
) => {
  const retryable = input.retryPolicy.retryableStatuses.includes(
    input.turn.status as AgentEvaluationRetryableStatus
  );
  const attempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest: input.turn.invocation.requestDigest,
    status: input.turn.status,
    retryable,
    ...(input.invocationReceipt
      ? { invocationReceiptDigest: input.invocationReceipt.receiptDigest }
      : {}),
    ...(input.dispatched ? { responseDigest: input.turn.responseDigest } : {}),
    startedAt: input.turn.runtime.startedAt,
    completedAt: input.turn.runtime.completedAt,
  });
  return createAgentEvaluationTransportRetryReceipt({
    policyDigest: input.retryPolicy.policyDigest,
    maximumAttempts: 1,
    attempts: [attempt],
    exhausted: input.turn.status !== 'completed',
  });
};

const createTurnReceipt = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    context: AttemptContext;
    turn: AgentEvaluationAgentLoopTurn;
    authority: ExecutedTurnAuthority;
    retryPolicy: AgentEvaluationAttemptRetryPolicy;
  }>
): AgentEvaluationInvocationTurnReceipt => {
  const transport = input.authority.closed.transportReceipt;
  const common = {
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turn.turnIndex,
    invocationId: input.turn.invocation.invocationId,
    status: input.turn.status,
    terminal: input.turn.terminal,
    caseDefinitionDigest: input.context.concreteCase.caseDefinitionDigest,
    contextPackDigest: input.context.contextPackDigest,
    ...(input.context.mediaRepresentationManifestDigest
      ? {
          mediaRepresentationManifestDigest:
            input.context.mediaRepresentationManifestDigest,
        }
      : {}),
  } as const;
  if (transport.dispatchState === 'not-dispatched') {
    if (!input.turn.terminal || input.authority.accounting) {
      throw new TypeError('Not-dispatched evaluation turn is malformed.');
    }
    return createAgentEvaluationInvocationTurnReceipt({
      ...common,
      status: input.turn.status as Exclude<
        AgentEvaluationAttemptStatus,
        'completed'
      >,
      dispatchState: 'not-dispatched',
      terminal: true,
      requestArtifactDigest: input.turn.invocation.requestDigest,
      dispatchIntentDigest: input.authority.closed.dispatchIntent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      transportRetryReceipt: retryReceiptFor({
        retryPolicy: input.retryPolicy,
        turn: input.turn,
        dispatched: false,
      }),
      executionFailureAuthorityReceiptDigest: transport.receiptDigest,
    });
  }
  const accounting = input.authority.accounting;
  if (!accounting) {
    throw new TypeError('Dispatched evaluation turn omitted accounting.');
  }
  const invocationReceipt = createInvocationReceipt({
    plan: input.plan,
    descriptor: input.descriptor,
    context: input.context,
    turn: input.turn,
    accounting,
  });
  const dispatched = {
    ...common,
    dispatchState: 'dispatched' as const,
    requestArtifactDigest: input.turn.invocation.requestDigest,
    dispatchIntentDigest: input.authority.closed.dispatchIntent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    transportRetryReceipt: retryReceiptFor({
      retryPolicy: input.retryPolicy,
      turn: input.turn,
      invocationReceipt,
      dispatched: true,
    }),
    invocationReceipt,
    ...(accounting.providerRequestId
      ? { providerRequestId: accounting.providerRequestId }
      : {}),
    ...(accounting.resolvedModelId
      ? { resolvedModelId: accounting.resolvedModelId }
      : {}),
    ...(accounting.resolvedModelVersion
      ? { resolvedModelVersion: accounting.resolvedModelVersion }
      : {}),
    resolvedModelIdentityDigest: accounting.resolvedModelIdentityDigest,
    ...(transport.responseHeaderDigest
      ? { responseHeaderDigest: transport.responseHeaderDigest }
      : {}),
    responseArtifactDigest: input.turn.responseDigest,
    ...(input.authority.closed.resultSpoolReceipt
      ? {
          providerResultSpoolReceiptDigest:
            input.authority.closed.resultSpoolReceipt.receiptDigest,
        }
      : {}),
    usageSourceReceiptDigest: accounting.usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: accounting.costSourceReceipt.receiptDigest,
  } as const;
  if (input.turn.status !== 'completed') {
    return createAgentEvaluationInvocationTurnReceipt({
      ...dispatched,
      status: input.turn.status,
      terminal: true,
      executionFailureAuthorityReceiptDigest: transport.receiptDigest,
    });
  }
  if (
    !accounting.providerRequestId ||
    !transport.responseHeaderDigest ||
    !input.authority.closed.resultSpoolReceipt
  ) {
    throw new TypeError(
      'Completed evaluation turn omitted provider response authority.'
    );
  }
  if (input.turn.zeroToolCallDisposition !== undefined) {
    const {
      capabilityEffectBindingKind,
      postObservationRequestRefIssuanceDecision,
      providerCapabilityObservationReceiptDigest,
      bootstrapInvocationAuthority,
      bootstrapProviderRequestAuthority,
    } = input.turn;
    const bootstrapContinuation =
      input.turn.zeroToolCallDisposition === 'seal-observation-and-continue';
    if (
      !capabilityEffectBindingKind ||
      !postObservationRequestRefIssuanceDecision ||
      !providerCapabilityObservationReceiptDigest ||
      !bootstrapInvocationAuthority ||
      !bootstrapProviderRequestAuthority ||
      input.turn.turnIndex !== 0 ||
      input.turn.terminal === bootstrapContinuation ||
      input.turn.continuationReceipt ||
      input.turn.resultSubmissionReceipt ||
      input.turn.controlledRuntimeReceipt ||
      input.turn.runtime.providerCapabilityObservationReceipt?.receiptDigest !==
        providerCapabilityObservationReceiptDigest
    ) {
      throw new TypeError(
        'Completed capability bootstrap turn authority is malformed.'
      );
    }
    const capabilityBootstrap = {
      ...dispatched,
      status: 'completed',
      providerRequestId: accounting.providerRequestId,
      responseHeaderDigest: transport.responseHeaderDigest,
      providerResultSpoolReceiptDigest:
        input.authority.closed.resultSpoolReceipt.receiptDigest,
      capabilityEffectBindingKind,
      postObservationRequestRefIssuanceDecision,
      providerCapabilityObservationReceiptDigest,
      bootstrapInvocationAuthority,
      bootstrapProviderRequestAuthority,
    } as const;
    return bootstrapContinuation
      ? createAgentEvaluationInvocationTurnReceipt({
          ...capabilityBootstrap,
          terminal: false,
          zeroToolCallDisposition: 'seal-observation-and-continue',
        })
      : createAgentEvaluationInvocationTurnReceipt({
          ...capabilityBootstrap,
          terminal: true,
          zeroToolCallDisposition: 'grade-unavailable',
        });
  }
  if (input.turn.terminal) {
    if (
      !input.turn.resultSubmissionReceipt ||
      !input.turn.controlledRuntimeReceipt
    ) {
      throw new TypeError(
        'Completed terminal turn omitted controlled final authority.'
      );
    }
    return createAgentEvaluationInvocationTurnReceipt({
      ...dispatched,
      status: 'completed',
      terminal: true,
      providerRequestId: accounting.providerRequestId,
      responseHeaderDigest: transport.responseHeaderDigest,
      providerResultSpoolReceiptDigest:
        input.authority.closed.resultSpoolReceipt.receiptDigest,
      resultSubmissionReceiptDigest:
        input.turn.resultSubmissionReceipt.receiptDigest,
      controlledRuntimeReceiptDigest:
        input.turn.controlledRuntimeReceipt.receiptDigest,
    });
  }
  if (!input.turn.continuationReceipt) {
    throw new TypeError('Completed continuation turn omitted its receipt.');
  }
  return createAgentEvaluationInvocationTurnReceipt({
    ...dispatched,
    status: 'completed',
    terminal: false,
    providerRequestId: accounting.providerRequestId,
    responseHeaderDigest: transport.responseHeaderDigest,
    providerResultSpoolReceiptDigest:
      input.authority.closed.resultSpoolReceipt.receiptDigest,
    continuationReceiptDigest: input.turn.continuationReceipt.receiptDigest,
  });
};

const normalizeObservation = (
  value: AgentEvaluationMetricObservation
): AgentEvaluationMetricObservation =>
  createAgentEvaluationMetricObservation(
    omitDigest(value, 'observationDigest')
  );

export const validateAgentEvaluationAttemptGrading = (
  input: AgentEvaluationAttemptGradingInput,
  value: AgentEvaluationAttemptGrading
): AgentEvaluationAttemptGrading => {
  const observations = Object.freeze(
    value.metricObservations
      .map((observation) => {
        const normalized = normalizeObservation(observation);
        const grader = input.plan.graderPlan.graders.find(
          ({ graderId }) => graderId === observation.graderId
        );
        const metric = input.plan.thresholds.metrics.find(
          ({ metricId }) => metricId === observation.metricId
        );
        if (
          !sameCanonicalJson(normalized, observation) ||
          !grader ||
          !metric ||
          grader.kind !== observation.graderKind ||
          grader.authority !== observation.authority
        ) {
          throw new TypeError('Evaluation grader authority drifted.');
        }
        return normalized;
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(
          `${left.metricId}\u0000${left.graderId}`,
          `${right.metricId}\u0000${right.graderId}`
        )
      )
  );
  if (
    observations.length === 0 ||
    new Set(
      observations.map(
        ({ metricId, graderId }) => `${metricId}\u0000${graderId}`
      )
    ).size !== observations.length ||
    !observations.some(({ authority }) => authority === 'deterministic') ||
    (input.status !== 'completed' &&
      observations.some(({ verdict }) => verdict !== 'inconclusive')) ||
    value.gradingDigest !==
      digestAgentEvaluationAttemptGrading({
        descriptorDigest: input.descriptor.descriptorDigest,
        invocationTurnSetReceiptDigest:
          input.invocationTurnSetReceipt.receiptDigest,
        terminalTurnReceiptDigest: input.terminalTurnReceipt.evidenceDigest,
        capabilityExecutionReceiptDigest:
          input.capabilityExecutionReceipt.receiptDigest,
        ...(input.resultSubmissionReceipt
          ? {
              resultSubmissionReceiptDigest:
                input.resultSubmissionReceipt.receiptDigest,
            }
          : {}),
        ...(input.controlledRuntimeReceipt
          ? {
              controlledRuntimeReceiptDigest:
                input.controlledRuntimeReceipt.receiptDigest,
            }
          : {}),
        metricObservations: observations,
        execution: input.execution,
      }) ||
    !isAgentEvaluationAttemptAuthorityOwnerReceipt(value.authorityReceipt) ||
    value.authorityReceipt.serviceKind !== 'attempt-grading' ||
    value.authorityReceipt.operation !== 'grade-and-persist' ||
    value.authorityReceipt.namespaceId !== input.namespaceId ||
    value.authorityReceipt.planDigest !== input.plan.planDigest ||
    value.authorityReceipt.repositoryCommit !== input.plan.repositoryCommit ||
    value.authorityReceipt.attemptId !== input.descriptor.attemptId ||
    value.authorityReceipt.descriptorDigest !==
      input.descriptor.descriptorDigest ||
    value.authorityReceipt.shardLeaseOwnerId !== input.shardLeaseOwnerId ||
    value.authorityReceipt.shardLeaseGeneration !==
      input.shardLeaseGeneration ||
    value.authorityReceipt.verificationGrantGeneration !==
      input.verificationGrantGeneration ||
    value.authorityReceipt.verificationAttemptGrantReceiptSetDigest !==
      input.verificationAttemptGrantReceiptSetDigest ||
    !sameCanonicalJson(
      value.authorityReceipt.responseProjection,
      createAgentEvaluationAttemptAuthorityResponseProjection(
        'attempt-grading',
        'grade-and-persist',
        {
          metricObservations: observations,
          gradingDigest: value.gradingDigest,
        }
      )
    )
  ) {
    throw new TypeError('Evaluation grading persistence drifted.');
  }
  return Object.freeze({
    metricObservations: observations,
    gradingDigest: value.gradingDigest,
    authorityReceipt: value.authorityReceipt,
  });
};

const outcomeFor = (
  status: AgentEvaluationAttemptStatus,
  observations: readonly AgentEvaluationMetricObservation[]
): 'passed' | 'failed' | 'inconclusive' => {
  if (status !== 'completed') return 'inconclusive';
  if (observations.some(({ verdict }) => verdict === 'failed')) return 'failed';
  return observations.every(({ verdict }) => verdict === 'passed')
    ? 'passed'
    : 'inconclusive';
};

/** Production bounded multi-turn executor. Credentials and raw response bytes remain outside this owner. */
export class AgentEvaluationAttemptExecutor implements AgentModelEvaluationAttemptExecutor {
  readonly #input: CreateAgentEvaluationAttemptExecutorInput;
  readonly #retryPolicy: AgentEvaluationAttemptRetryPolicy;
  readonly #verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  readonly #verificationAttemptGrantReceiptSetDigest: CanonicalDigest;

  constructor(input: CreateAgentEvaluationAttemptExecutorInput) {
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !isAgentControlIdentity(input.shardLeaseOwnerId) ||
      !Number.isSafeInteger(input.shardLeaseGeneration) ||
      input.shardLeaseGeneration < 1
    ) {
      throw new TypeError(
        'Evaluation durable shard lease authority is invalid.'
      );
    }
    this.#input = input;
    this.#retryPolicy = assertRetryPolicy(input.retryPolicy);
    this.#verificationAttemptGrantReceipts =
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        input.verificationAttemptGrantReceipts
      );
    if (this.#verificationAttemptGrantReceipts.length === 0) {
      throw new TypeError(
        'Evaluation Verification AttemptGrant receipt-set authority is invalid.'
      );
    }
    this.#verificationAttemptGrantReceiptSetDigest =
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        this.#verificationAttemptGrantReceipts
      );
    for (const protocolFamily of [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
    ] as const) {
      if (
        input.adapters[protocolFamily].identity.protocolFamily !==
        protocolFamily
      ) {
        throw new TypeError(
          'Evaluation adapter set contains a protocol mismatch.'
        );
      }
    }
  }

  static async executePreDispatchFailure(
    persistence: AgentEvaluationPreDispatchAttemptFinalizerPersistence,
    input: AgentEvaluationPreDispatchAttemptFinalizationInput
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    if (
      !isAgentCanonicalDigest(input.verificationAttemptGrantReceiptSetDigest)
    ) {
      throw new TypeError(
        'Evaluation Verification AttemptGrant receipt-set authority is invalid.'
      );
    }
    const turnIndex = 0;
    const invocationId = createAgentEvaluationAttemptInvocationId(
      input.descriptor,
      turnIndex
    );
    const classification = await persistence.classifyPreDispatchFailure({
      plan: input.plan,
      descriptor: input.descriptor,
      turnIndex,
      invocationId,
      stage: input.stage,
      suggestedReasonCode: input.suggestedReasonCode,
      policyDigest: input.policyDigest,
      inputDigest: input.inputDigest,
      ...(input.caught === undefined ? {} : { caught: input.caught }),
    });
    if (!isAgentCanonicalDigest(classification.findingDigest)) {
      throw new TypeError(
        'Evaluation pre-dispatch failure classification is invalid.'
      );
    }
    const occurredAt = persistence.now();
    assertInstant(occurredAt, 'Evaluation pre-dispatch failure time');
    const failureReceipt = createAgentEvaluationPreDispatchFailureReceipt({
      failureReceiptId: `evaluation-pre-dispatch-failure:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}:${turnIndex}`,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      stage: input.stage,
      reasonCode: classification.reasonCode,
      policyDigest: input.policyDigest,
      inputDigest: input.inputDigest,
      findingDigest: classification.findingDigest,
      occurredAt,
    });
    if (!isAgentEvaluationPreDispatchFailureReceipt(failureReceipt)) {
      throw new TypeError('Evaluation pre-dispatch failure authority drifted.');
    }
    await exactPersist(
      failureReceipt,
      persistence.persistPreDispatchFailureReceipt,
      'Evaluation pre-dispatch failure receipt'
    );
    const capabilityExecutionReceipt =
      createAgentEvaluationFailedCapabilityExecutionReceipt({
        plan: input.plan,
        descriptor: input.descriptor,
        turnIndex,
        invocationId,
        observedAt: occurredAt,
      });
    await exactPersist(
      capabilityExecutionReceipt,
      persistence.persistCapabilityExecutionReceipt,
      'Evaluation capability execution receipt'
    );
    const capabilityExecutionReceipts = Object.freeze([
      capabilityExecutionReceipt,
    ]);
    const capabilityExecutionReceiptSetDigest =
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        capabilityExecutionReceipts
      );
    const concreteCase = input.plan.concreteCases.find(
      ({ caseId }) => caseId === input.descriptor.caseId
    );
    if (!concreteCase) {
      throw new TypeError('Evaluation pre-dispatch case authority is missing.');
    }
    const status = preDispatchStatusFor(classification.reasonCode);
    const turnReceipt = createAgentEvaluationInvocationTurnReceipt({
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      status,
      dispatchState: 'not-created',
      terminal: true,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      contextPackDigest:
        input.contextPackDigest ??
        preDispatchContextPackDigest(input.plan, input.descriptor),
      executionFailureAuthorityReceiptDigest: failureReceipt.receiptDigest,
    });
    await exactPersist(
      turnReceipt,
      persistence.persistInvocationTurnReceipt,
      'Evaluation invocation turn receipt'
    );
    const turnSetReceipt = createAgentEvaluationInvocationTurnSetReceipt({
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turns: [turnReceipt],
    });
    const execution = Object.freeze({
      modelInvocations: 0,
      toolCalls: 0,
      repairRounds: 0,
      transactions: 0,
      artifactBytes: 0,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        input.verificationAttemptGrantReceiptSetDigest,
    });
    const executionReceipt = createAgentEvaluationExecutionReceipt({
      executionReceiptId: `evaluation-execution:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      ...execution,
      elapsedMs: 0,
    });
    await exactPersist(
      executionReceipt,
      persistence.persistExecutionReceipt,
      'Evaluation execution receipt'
    );
    const deterministicGraderId =
      input.plan.graderPlan.deterministicAuthorityGraderIds[0];
    const deterministicGrader = input.plan.graderPlan.graders.find(
      ({ graderId }) => graderId === deterministicGraderId
    );
    const metricId = input.plan.thresholds.metrics[0]?.metricId;
    if (!deterministicGraderId || !deterministicGrader || !metricId) {
      throw new TypeError(
        'Evaluation pre-dispatch metric authority is missing from the plan.'
      );
    }
    const metricObservations = Object.freeze([
      createAgentEvaluationMetricObservation({
        metricId,
        graderId: deterministicGraderId,
        graderKind: deterministicGrader.kind,
        authority: 'deterministic',
        verdict: 'inconclusive',
      }),
    ]);
    const gradingDigest = digestAgentEvaluationAttemptGrading({
      descriptorDigest: input.descriptor.descriptorDigest,
      invocationTurnSetReceiptDigest: turnSetReceipt.receiptDigest,
      terminalTurnReceiptDigest: turnReceipt.evidenceDigest,
      capabilityExecutionReceiptDigest:
        capabilityExecutionReceipt.receiptDigest,
      metricObservations,
      execution,
    });
    const emptyDispatchIntents = Object.freeze([]);
    const emptyTransportReceipts = Object.freeze([]);
    const attempt = createAgentModelEvaluationAttempt({
      descriptor: input.descriptor,
      independentRunId: `evaluation-run:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
      dispatchIntentSetDigest:
        digestAgentEvaluationTransportDispatchIntentSet(emptyDispatchIntents),
      transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet(
        emptyTransportReceipts
      ),
      invocationTurnReceiptSetDigest:
        digestAgentEvaluationInvocationTurnReceiptSet([turnReceipt]),
      invocationTurnSetReceiptDigest: turnSetReceipt.receiptDigest,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        input.verificationAttemptGrantReceiptSetDigest,
      status,
      outcome: 'inconclusive',
      metricObservations,
      usage: turnSetReceipt.aggregateUsage,
      cost: turnSetReceipt.aggregateCost,
      startedAt: occurredAt,
      completedAt: occurredAt,
    });
    return Object.freeze({
      attempt,
      demand: normalizeDemand({
        usage: attempt.usage,
        cost: attempt.cost,
        modelInvocations: 0,
        toolCalls: 0,
        repairRounds: 0,
        transactions: 0,
        artifactBytes: 0,
        elapsedMs: 0,
      }),
      preDispatchFailureReceipts: Object.freeze([failureReceipt]),
      capabilityExecutionReceipts,
      capabilitySpecificReceipts: Object.freeze([]),
      providerCapabilityObservationReceipts: Object.freeze([]),
      attemptAuthorityOwnerReceipts: Object.freeze([]),
      transportDispatchIntents: emptyDispatchIntents,
      transportReceipts: emptyTransportReceipts,
      providerResultSpoolReceipts: Object.freeze([]),
      providerResultSpoolDispositionReceipts: Object.freeze([]),
      invocationTurnReceipts: Object.freeze([turnReceipt]),
      invocationTurnSetReceipt: turnSetReceipt,
      sourceReceipts: Object.freeze([]),
      executionReceipt,
      accountingDigest: digestAgentCanonicalValue({ accountingDigests: [] }),
      gradingDigest,
      payloadDigest: digestAgentCanonicalValue({ payloadDigests: [] }),
    });
  }

  async #preDispatchFailureResult(
    input: Omit<
      AgentEvaluationPreDispatchAttemptFinalizationInput,
      'verificationAttemptGrantReceiptSetDigest'
    >
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    return AgentEvaluationAttemptExecutor.executePreDispatchFailure(
      this.#input,
      Object.freeze({
        ...input,
        verificationAttemptGrantReceiptSetDigest:
          this.#verificationAttemptGrantReceiptSetDigest,
      })
    );
  }

  estimateShard(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
    }>
  ): AgentBudgetDemand {
    input.descriptors.forEach((descriptor) =>
      assertPlanDescriptor(input.plan, descriptor)
    );
    const demand = normalizeDemand(this.#input.estimateShard(input));
    const loop = this.#input.controlledRuntimeConfiguration.loop;
    if (
      demand.modelInvocations !==
        input.descriptors.length * loop.maximumTurnsPerAttempt ||
      demand.toolCalls <
        input.descriptors.length * loop.maximumToolCallsPerAttempt ||
      demand.repairRounds <
        input.descriptors.length * loop.maximumRepairRoundsPerAttempt ||
      demand.artifactBytes <
        input.descriptors.length * loop.maximumAggregateArtifactBytes
    ) {
      throw new TypeError(
        'Evaluation shard estimate omits the frozen agent-loop ceiling.'
      );
    }
    return demand;
  }

  async execute(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    return this.#execute(input, Object.freeze([]));
  }

  async resume(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turns: readonly AgentEvaluationAttemptClosedTransportTurn[];
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    return this.#execute(input, input.turns);
  }

  async #execute(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      signal?: AbortSignal;
    }>,
    recoveredTurns: readonly AgentEvaluationAttemptClosedTransportTurn[]
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    assertPlanDescriptor(input.plan, input.descriptor);
    const [verificationAttemptGrant] = this.#verificationAttemptGrantReceipts;
    if (
      verificationAttemptGrant === undefined ||
      this.#verificationAttemptGrantReceipts.some(
        (receipt) =>
          receipt.namespaceId !== verificationAttemptGrant.namespaceId ||
          receipt.evaluationPlanDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.evaluationAttemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.capabilityDescriptorDigest !==
            input.descriptor.capabilityDescriptorDigest ||
          receipt.caseId !== input.descriptor.caseId ||
          receipt.generation !== verificationAttemptGrant.generation ||
          receipt.verificationPlanDigest !==
            verificationAttemptGrant.verificationPlanDigest ||
          Date.parse(receipt.grant.expiresAt) <=
            Date.parse(receipt.grant.issuedAt)
      )
    ) {
      throw new TypeError(
        'Evaluation Verification AttemptGrant binding drifted.'
      );
    }
    if (input.signal?.aborted) {
      return this.#preDispatchFailureResult({
        plan: input.plan,
        descriptor: input.descriptor,
        stage: 'dispatch-admission',
        suggestedReasonCode: 'cancelled-before-dispatch',
        policyDigest: input.plan.policyDigest,
        inputDigest: input.descriptor.descriptorDigest,
      });
    }
    let materialResolved = false;
    try {
      return await this.#input.materialSource.use(
        { plan: input.plan, descriptor: input.descriptor },
        async (material) => {
          materialResolved = true;
          return this.#executeWithMaterial(input, material, recoveredTurns);
        }
      );
    } catch (caught) {
      if (materialResolved || recoveredTurns.length > 0) throw caught;
      return this.#preDispatchFailureResult({
        plan: input.plan,
        descriptor: input.descriptor,
        stage: 'protected-material-resolution',
        suggestedReasonCode: 'protected-material-unavailable',
        policyDigest: input.plan.policyDigest,
        inputDigest: digestAgentCanonicalValue({
          planDigest: input.plan.planDigest,
          descriptorDigest: input.descriptor.descriptorDigest,
          caseId: input.descriptor.caseId,
        }),
        caught,
      });
    }
  }

  async #executeWithMaterial(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      signal?: AbortSignal;
    }>,
    material: AgentEvaluationCaseMaterial,
    recoveredTurns: readonly AgentEvaluationAttemptClosedTransportTurn[]
  ): Promise<AgentEvaluationAttemptExecutorResult> {
    const verificationAttemptGrant = this.#verificationAttemptGrantReceipts[0];
    if (!verificationAttemptGrant) {
      throw new TypeError(
        'Evaluation Verification AttemptGrant authority is unavailable.'
      );
    }
    let context: AttemptContext;
    try {
      context = resolveAttemptContext(input.plan, input.descriptor, material);
    } catch (caught) {
      return this.#preDispatchFailureResult({
        plan: input.plan,
        descriptor: input.descriptor,
        stage: 'protected-material-resolution',
        suggestedReasonCode: 'protected-material-integrity-failed',
        policyDigest: input.plan.policyDigest,
        inputDigest: material.materialDigest,
        caught,
      });
    }
    const protocolFamily = context.target
      .protocolFamily as AgentEvaluationAttemptNativeProtocol;
    const adapter = selectAdapter(this.#input.adapters, protocolFamily);
    if (!sameCanonicalJson(adapter.identity, context.provider.adapter)) {
      throw new TypeError('Evaluation native adapter identity drifted.');
    }
    if (
      recoveredTurns.some(
        (turn, turnIndex) =>
          turn.turnIndex !== turnIndex ||
          turn.attemptId !== input.descriptor.attemptId ||
          turn.descriptorDigest !== input.descriptor.descriptorDigest
      )
    ) {
      throw new TypeError('Evaluation recovery turn sequence drifted.');
    }

    const turnAuthorities: ExecutedTurnAuthority[] = [];
    const sourceReceipts: AgentEvaluationSourceReceipt[] = [];
    const dispositions: AgentEvaluationProviderResultSpoolDispositionReceipt[] =
      [];
    const providerCapabilityObservationReceipts: AgentEvaluationProviderCapabilityObservationReceipt[] =
      [];
    const providerCapabilityObservationInputs = new Map<
      number,
      Readonly<{
        invocation: AgentProviderAdapterInvocationRequest;
        runtime: AgentEvaluationRuntimeAttempt;
        closed: AgentEvaluationAttemptClosedTransportTurn;
        secretCanaries: readonly string[];
      }>
    >();
    let recoveredTurnCount = 0;
    let providerInvocationBoundaryEntered = false;
    let loopResult: AgentEvaluationAgentTurnLoopResult;
    try {
      loopResult = await runAgentEvaluationAgentTurnLoop({
        namespaceId: this.#input.namespaceId,
        shardLeaseOwnerId: this.#input.shardLeaseOwnerId,
        shardLeaseGeneration: this.#input.shardLeaseGeneration,
        verificationGrantGeneration: verificationAttemptGrant.generation,
        verificationAttemptGrantReceiptSetDigest:
          this.#verificationAttemptGrantReceiptSetDigest,
        plan: input.plan,
        descriptor: input.descriptor,
        material,
        protocolFamily,
        contextPackDigest: context.contextPackDigest,
        controlledRuntimeConfiguration:
          this.#input.controlledRuntimeConfiguration,
        controlledRuntime: this.#input.controlledRuntime,
        capabilityRuntime: this.#input.capabilityRuntime,
        now: this.#input.now,
        ...(this.#input.capabilityEffectInputAuthoritySource
          ? {
              prepareCapabilityEffectRequestRefs:
                this.#input.capabilityEffectInputAuthoritySource
                  .prepareRequestRefs,
              resolveCapabilityEffectInputAuthority:
                this.#input.capabilityEffectInputAuthoritySource
                  .resolveInputAuthority,
            }
          : {}),
        ...(this.#input.payloadOptions
          ? { payloadOptions: this.#input.payloadOptions }
          : {}),
        createInvocation: ({
          turnIndex,
          encodedPayload,
          requestDigest: authoritativeRequestDigest,
        }) => {
          const requestDigest =
            authoritativeRequestDigest ??
            requestDigestFor(
              input.plan,
              input.descriptor,
              material,
              context,
              turnIndex,
              encodedPayload
            );
          return requestFor(
            input.descriptor,
            context,
            turnIndex,
            requestDigest
          );
        },
        invoke: async (
          turnInput
        ): Promise<AgentEvaluationAgentLoopRuntimeResult> => {
          providerInvocationBoundaryEntered = true;
          const recovered = recoveredTurns[turnInput.turnIndex];
          const startedAt =
            recovered?.transportReceipt.startedAt ?? this.#input.now();
          assertInstant(startedAt, 'Evaluation provider turn start');
          let runtime: AgentEvaluationRuntimeAttempt;
          let closed: AgentEvaluationAttemptClosedTransportTurn;
          if (recovered) {
            recoveredTurnCount += 1;
            closed = recovered;
            if (closed.transportReceipt.outcome === 'completed') {
              runtime = await this.#input.transportJournal.recoverRuntimeTurn({
                plan: input.plan,
                descriptor: input.descriptor,
                turn: closed,
                invocation: turnInput.invocation,
                encodedPayload: turnInput.encodedPayload,
                protectedLeakCanaries: material.protectedLeakCanaries,
                ...(turnInput.signal ? { signal: turnInput.signal } : {}),
              });
            } else {
              runtime = syntheticFailure(
                turnInput.invocation.invocationId,
                turnInput.invocation.requestDigest,
                closed.transportReceipt.completedAt,
                'sanitized-transport-failure'
              );
            }
          } else {
            runtime = await this.#input.payloadRegistry.use(
              {
                protocolFamily,
                invocation: turnInput.invocation,
                encodedPayload: turnInput.encodedPayload,
                protectedLeakCanaries: material.protectedLeakCanaries,
              },
              () =>
                collectRuntimeAttempt(
                  adapter,
                  turnInput.invocation,
                  turnInput.signal,
                  material.protectedLeakCanaries,
                  this.#input.now
                )
            );
            closed = await this.#input.transportJournal.takeClosedTurn({
              plan: input.plan,
              descriptor: input.descriptor,
              turnIndex: turnInput.turnIndex,
              invocation: turnInput.invocation,
              encodedPayload: turnInput.encodedPayload,
            });
          }
          const responseDigest = runtime.responseDigest;
          assertClosedTransportTurn(closed, {
            plan: input.plan,
            descriptor: input.descriptor,
            context,
            turnIndex: turnInput.turnIndex,
            invocation: turnInput.invocation,
            ...(closed.transportReceipt.outcome === 'completed'
              ? { responseDigest }
              : {}),
          });
          const secretCanaries = Object.freeze([
            ...this.#input.secretCanaries(),
          ]);
          const providerCapabilityObservationReceipt =
            createProviderCapabilityObservation(
              input.plan,
              input.descriptor,
              context,
              turnInput.turnIndex,
              turnInput.invocation,
              runtime,
              closed,
              material.protectedLeakCanaries,
              secretCanaries
            );
          if (providerCapabilityObservationInputs.has(turnInput.turnIndex)) {
            throw new TypeError(
              'Evaluation provider capability observation input was reused.'
            );
          }
          providerCapabilityObservationInputs.set(
            turnInput.turnIndex,
            Object.freeze({
              invocation: turnInput.invocation,
              runtime,
              closed,
              secretCanaries,
            })
          );
          let status =
            closed.transportReceipt.outcome === 'completed'
              ? defaultRuntimeStatus(runtime)
              : transportFailureStatus(closed.transportReceipt);
          if (this.#input.classifyTerminal) {
            status = await this.#input.classifyTerminal({
              plan: input.plan,
              descriptor: input.descriptor,
              material,
              protocolFamily,
              invocation: turnInput.invocation,
              turnIndex: turnInput.turnIndex,
              phase: turnInput.phase,
              events: runtime.events,
              terminalEvent: runtime.terminalEvent,
              runtimeRejected: runtime.runtimeRejected,
              transportReceipt: closed.transportReceipt,
            });
          }
          let accounting: AgentEvaluationAttemptAccounting | undefined;
          let turnSources: readonly AgentEvaluationSourceReceipt[] = [];
          if (closed.transportReceipt.dispatchState === 'dispatched') {
            const accountingInput = Object.freeze({
              plan: input.plan,
              descriptor: input.descriptor,
              material,
              protocolFamily,
              invocation: turnInput.invocation,
              turnIndex: turnInput.turnIndex,
              phase: turnInput.phase,
              status,
              responseDigest,
              reportedUsage: runtime.reportedUsage,
              events: runtime.events,
              terminalEvent: runtime.terminalEvent,
              transportReceipt: closed.transportReceipt,
              startedAt,
              completedAt: closed.transportReceipt.completedAt,
            });
            accounting =
              await this.#input.resolveAndPersistAccounting(accountingInput);
            status = accounting.statusOverride ?? status;
            turnSources = accountingBinding(
              accountingInput,
              accounting,
              context
            );
            for (const receipt of turnSources) {
              await exactPersist(
                receipt,
                this.#input.persistSourceReceipt,
                'Evaluation source receipt'
              );
              sourceReceipts.push(receipt);
            }
          } else if (status === 'completed') {
            throw new TypeError('Not-dispatched turn cannot complete.');
          }
          let dispositionReceipt:
            AgentEvaluationProviderResultSpoolDispositionReceipt | undefined;
          if (closed.resultSpoolReceipt) {
            const disposedAt = this.#input.now();
            assertInstant(disposedAt, 'Evaluation spool disposition time');
            dispositionReceipt =
              createAgentEvaluationProviderResultSpoolDispositionReceipt({
                spoolRef: closed.resultSpoolReceipt.spoolRef,
                spoolReceiptDigest: closed.resultSpoolReceipt.receiptDigest,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                attemptId: input.descriptor.attemptId,
                descriptorDigest: input.descriptor.descriptorDigest,
                turnIndex: turnInput.turnIndex,
                invocationId: turnInput.invocation.invocationId,
                disposition: 'consumed-and-destroyed',
                retentionPolicyDigest:
                  closed.resultSpoolReceipt.retentionPolicyDigest,
                disposedAt,
              });
            await exactPersist(
              dispositionReceipt,
              this.#input.stageResultSpoolDispositionReceipt,
              'Evaluation result-spool disposition receipt'
            );
            dispositions.push(dispositionReceipt);
          }
          turnAuthorities.push(
            Object.freeze({
              closed,
              ...(accounting ? { accounting } : {}),
              sourceReceipts: turnSources,
              ...(dispositionReceipt ? { dispositionReceipt } : {}),
            })
          );
          return Object.freeze({
            ...runtime,
            budgetReservationId: closed.budgetReservationId,
            status,
            startedAt,
            completedAt: closed.transportReceipt.completedAt,
            ...(providerCapabilityObservationReceipt
              ? { providerCapabilityObservationReceipt }
              : {}),
          });
        },
        finalizeProviderCapabilityObservation: async ({
          turnIndex,
          invocation,
          runtime,
          sharedEffectExecution,
        }) => {
          const observationInput =
            providerCapabilityObservationInputs.get(turnIndex);
          if (
            !observationInput ||
            observationInput.invocation.invocationId !==
              invocation.invocationId ||
            observationInput.invocation.requestDigest !==
              invocation.requestDigest
          ) {
            throw new TypeError(
              'Evaluation provider capability observation input is unavailable.'
            );
          }
          let receipt = runtime.providerCapabilityObservationReceipt;
          if (sharedEffectExecution) {
            const client = this.#input.optionalCapabilityFactAuthorityClient;
            const optionalAuthority =
              context.target.optionalCapabilitySupportAuthority;
            const runtimeFactSourceAuthority =
              optionalAuthority?.runtimeFactSourceAuthority;
            const spool = observationInput.closed.resultSpoolReceipt;
            if (
              !client ||
              !optionalAuthority ||
              !runtimeFactSourceAuthority ||
              !spool ||
              sharedEffectExecution.input.preEffectIntent.intentDigest !==
                sharedEffectExecution.output.effectSourceReceipt.intentDigest ||
              !sameCanonicalJson(
                sharedEffectExecution.input.preEffectIntent
                  .runtimeFactSourceAuthority,
                runtimeFactSourceAuthority
              )
            ) {
              throw new TypeError(
                'Evaluation shared capability observation authority is unavailable.'
              );
            }
            const effectSourceReceipt =
              sharedEffectExecution.output.effectSourceReceipt;
            const effectSourceFact =
              sharedEffectExecution.output.effectSourceFact;
            const expectedOutcome =
              effectSourceReceipt.effectStatus === 'produced'
                ? 'observed'
                : effectSourceReceipt.effectStatus;
            const authorityResult = await client.observe(
              createAgentEvaluationOptionalCapabilityFactSourceRequest({
                attemptId: input.descriptor.attemptId,
                descriptorDigest: input.descriptor.descriptorDigest,
                targetId: context.target.targetId,
                targetDigest: context.target.targetDigest,
                capabilityProfileId: context.target.capabilityProfileId,
                capabilityProfileDigest: context.target.capabilityProfileDigest,
                capabilityDescriptorDigest:
                  input.descriptor.capabilityDescriptorDigest,
                capabilityId: optionalAuthority.capabilityId as
                  | 'provider.background-job'
                  | 'provider.hosted-retrieval'
                  | 'provider.isolated-cache'
                  | 'provider.reasoning-continuation',
                supportExpectation: optionalAuthority.supportExpectation,
                turnIndex,
                invocationId: invocation.invocationId,
                protocolFamily,
                providerConfigurationId: context.target.providerConfigurationId,
                modelId: context.target.modelId,
                modelLineageDigest: context.target.modelLineageDigest,
                adapterDigest: context.provider.adapter.adapterDigest,
                providerRequestDigest: invocation.requestDigest,
                responseDigest: spool.responseDigest,
                dispatchIntentDigest:
                  observationInput.closed.dispatchIntent.intentDigest,
                transportReceiptDigest:
                  effectSourceReceipt.transportReceiptDigest,
                resultSpoolReceiptDigest:
                  effectSourceReceipt.resultSpoolReceiptDigest,
                normalizedEventSetDigest:
                  effectSourceReceipt.normalizedEventSetDigest,
                source: Object.freeze({
                  kind: runtimeFactSourceAuthority.sourceKind,
                  ownerRequestDigest:
                    sharedEffectExecution.output.authorityReceipt.requestDigest,
                  ownerReceiptDigest:
                    sharedEffectExecution.output.authorityReceipt.receiptDigest,
                  effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
                }),
              })
            );
            const sourceReceipt = authorityResult.sourceSealReceipt;
            const expectedRuntimeFactEnvelope =
              createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
                sharedEffectExecution.input.preEffectIntent,
                effectSourceReceipt,
                {
                  planDigest: input.plan.planDigest,
                  repositoryCommit: input.plan.repositoryCommit,
                  attemptId: input.descriptor.attemptId,
                  descriptorDigest: input.descriptor.descriptorDigest,
                  turnIndex,
                  invocationId: invocation.invocationId,
                  requestDigest: invocation.requestDigest,
                  responseDigest: spool.responseDigest,
                  protocolFamily,
                  providerConfigurationId:
                    context.target.providerConfigurationId,
                  modelLineageDigest: context.target.modelLineageDigest,
                  adapterDigest: context.provider.adapter.adapterDigest,
                  dispatchIntentDigest:
                    observationInput.closed.dispatchIntent.intentDigest,
                  observedAt: sourceReceipt.observedAt,
                  fact: effectSourceFact,
                },
                {
                  protectedMaterialCanaries: material.protectedLeakCanaries,
                  secretCanaries: observationInput.secretCanaries,
                }
              );
            const observedRuntimeFactEnvelope =
              authorityResult.authorityResponse.runtimeFactEnvelopes[0];
            if (
              sourceReceipt.outcome !== expectedOutcome ||
              sourceReceipt.preEffectIntentDigest !==
                sharedEffectExecution.input.preEffectIntent.intentDigest ||
              sourceReceipt.effectSourceReceiptDigest !==
                effectSourceReceipt.receiptDigest ||
              sourceReceipt.businessResultDigest !==
                effectSourceReceipt.businessResultDigest ||
              sourceReceipt.effectSourceFactDigest !==
                (effectSourceFact?.factDigest ?? null) ||
              (effectSourceFact !== null &&
                !sameCanonicalJson(sourceReceipt.fact, effectSourceFact)) ||
              (expectedRuntimeFactEnvelope === null
                ? authorityResult.authorityResponse.runtimeFactEnvelopes
                    .length !== 0
                : !observedRuntimeFactEnvelope ||
                  authorityResult.authorityResponse.runtimeFactEnvelopes
                    .length !== 1 ||
                  !sameCanonicalJson(
                    observedRuntimeFactEnvelope,
                    expectedRuntimeFactEnvelope
                  ))
            ) {
              throw new TypeError(
                'Evaluation shared capability source receipt drifted.'
              );
            }
            receipt = createProviderCapabilityObservation(
              input.plan,
              input.descriptor,
              context,
              turnIndex,
              invocation,
              observationInput.runtime,
              observationInput.closed,
              material.protectedLeakCanaries,
              observationInput.secretCanaries,
              Object.freeze({
                runtimeFactSourceAuthority,
                runtimeFactEnvelopes:
                  authorityResult.authorityResponse.runtimeFactEnvelopes,
                observedAt: sourceReceipt.observedAt,
              })
            );
          } else if (
            turnIndex === 0 &&
            observationInput.closed.transportReceipt.outcome === 'completed' &&
            observationInput.closed.resultSpoolReceipt !== undefined &&
            context.target.optionalCapabilitySupportAuthority
              ?.runtimeFactSourceAuthority !== undefined &&
            context.target.optionalCapabilitySupportAuthority.capabilityId !==
              'provider.hosted-retrieval'
          ) {
            const client = this.#input.optionalCapabilityFactAuthorityClient;
            const optionalAuthority =
              context.target.optionalCapabilitySupportAuthority;
            const runtimeFactSourceAuthority =
              optionalAuthority?.runtimeFactSourceAuthority;
            const spool = observationInput.closed.resultSpoolReceipt;
            const capabilityId = optionalAuthority?.capabilityId;
            if (
              !client ||
              !optionalAuthority ||
              !runtimeFactSourceAuthority ||
              !spool ||
              capabilityId === 'provider.hosted-retrieval'
            ) {
              throw new TypeError(
                'Evaluation native capability bootstrap authority is unavailable.'
              );
            }
            const program = optionalAuthority.probeEvidence.probeProgram;
            const sourceRead = await client.readNativeBootstrapSource({
              attemptId: input.descriptor.attemptId,
              program,
            });
            if (!sourceRead) {
              throw new TypeError(
                'Evaluation native capability bootstrap source is unavailable.'
              );
            }
            const bootstrapReceipt = sourceRead.sourceReceipt;
            const bootstrapRequest = bootstrapReceipt.sourceRequest;
            if (
              bootstrapRequest.namespaceId !== this.#input.namespaceId ||
              bootstrapRequest.planDigest !== input.plan.planDigest ||
              bootstrapRequest.repositoryCommit !==
                input.plan.repositoryCommit ||
              bootstrapRequest.attemptId !== input.descriptor.attemptId ||
              bootstrapRequest.descriptorDigest !==
                input.descriptor.descriptorDigest ||
              bootstrapRequest.turnIndex !== turnIndex ||
              bootstrapRequest.invocationId !== invocation.invocationId ||
              bootstrapRequest.providerRequestDigest !==
                invocation.requestDigest ||
              bootstrapRequest.providerResponseDigest !==
                spool.responseDigest ||
              bootstrapRequest.protocolFamily !== protocolFamily ||
              bootstrapRequest.providerConfigurationId !==
                context.target.providerConfigurationId ||
              bootstrapRequest.modelLineageDigest !==
                context.target.modelLineageDigest ||
              bootstrapRequest.adapterDigest !==
                context.provider.adapter.adapterDigest ||
              bootstrapRequest.dispatchIntentDigest !==
                observationInput.closed.dispatchIntent.intentDigest ||
              bootstrapRequest.transportReceiptDigest !==
                observationInput.closed.transportReceipt.receiptDigest ||
              bootstrapRequest.resultSpoolReceiptDigest !==
                spool.receiptDigest ||
              bootstrapRequest.normalizedEventSetDigest !==
                spool.normalizedEventSetDigest ||
              !sameCanonicalJson(
                bootstrapRequest.runtimeFactSourceAuthority,
                runtimeFactSourceAuthority
              )
            ) {
              throw new TypeError(
                'Evaluation native capability bootstrap source binding drifted.'
              );
            }
            const sourceRequest =
              createAgentEvaluationOptionalCapabilityFactSourceRequest({
                attemptId: input.descriptor.attemptId,
                descriptorDigest: input.descriptor.descriptorDigest,
                targetId: context.target.targetId,
                targetDigest: context.target.targetDigest,
                capabilityProfileId: context.target.capabilityProfileId,
                capabilityProfileDigest: context.target.capabilityProfileDigest,
                capabilityDescriptorDigest:
                  input.descriptor.capabilityDescriptorDigest,
                capabilityId: capabilityId as
                  | 'provider.background-job'
                  | 'provider.isolated-cache'
                  | 'provider.reasoning-continuation',
                supportExpectation: optionalAuthority.supportExpectation,
                turnIndex,
                invocationId: invocation.invocationId,
                protocolFamily,
                providerConfigurationId: context.target.providerConfigurationId,
                modelId: context.target.modelId,
                modelLineageDigest: context.target.modelLineageDigest,
                adapterDigest: context.provider.adapter.adapterDigest,
                providerRequestDigest: invocation.requestDigest,
                responseDigest: spool.responseDigest,
                dispatchIntentDigest:
                  observationInput.closed.dispatchIntent.intentDigest,
                transportReceiptDigest:
                  observationInput.closed.transportReceipt.receiptDigest,
                resultSpoolReceiptDigest: spool.receiptDigest,
                normalizedEventSetDigest: spool.normalizedEventSetDigest,
                source: Object.freeze({
                  kind: 'sealed-provider-response-metadata' as const,
                  nativeBootstrapSourceRequestDigest:
                    sourceRead.sourceRequestDigest,
                }),
              });
            const authorityResult = await client.observe(sourceRequest);
            const sourceSealReceipt = authorityResult.sourceSealReceipt;
            const expectedRuntimeFactEnvelope =
              createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
                program,
                bootstrapReceipt,
                {
                  protectedMaterialCanaries: material.protectedLeakCanaries,
                  secretCanaries: observationInput.secretCanaries,
                }
              );
            const observedRuntimeFactEnvelope =
              authorityResult.authorityResponse.runtimeFactEnvelopes[0];
            if (
              sourceSealReceipt.outcome !== bootstrapRequest.outcome ||
              sourceSealReceipt.observedAt !== bootstrapRequest.observedAt ||
              sourceSealReceipt.nativeBootstrapSourceRequestDigest !==
                sourceRead.sourceRequestDigest ||
              sourceSealReceipt.nativeBootstrapSourceReceiptDigest !==
                sourceRead.sourceReceiptDigest ||
              sourceSealReceipt.ownerStageDigest !==
                bootstrapReceipt.sourceOwnerStageDigest ||
              sourceSealReceipt.ownerDispatchAckDigest !==
                bootstrapReceipt.sourceOwnerDispatchAckDigest ||
              sourceSealReceipt.nativeProviderSourceReceiptDigest !==
                bootstrapRequest.nativeSourceReceiptDigest ||
              sourceSealReceipt.nativeProviderSourceDigest !==
                (bootstrapRequest.nativeSourceReceipt?.sourceDigest ?? null) ||
              sourceSealReceipt.nativeProviderSourceFactDigest !==
                (bootstrapRequest.fact?.factDigest ?? null) ||
              (bootstrapRequest.fact !== null &&
                !sameCanonicalJson(
                  sourceSealReceipt.fact,
                  bootstrapRequest.fact
                )) ||
              (expectedRuntimeFactEnvelope === null
                ? authorityResult.authorityResponse.runtimeFactEnvelopes
                    .length !== 0
                : !observedRuntimeFactEnvelope ||
                  authorityResult.authorityResponse.runtimeFactEnvelopes
                    .length !== 1 ||
                  !sameCanonicalJson(
                    observedRuntimeFactEnvelope,
                    expectedRuntimeFactEnvelope
                  ))
            ) {
              throw new TypeError(
                'Evaluation native capability bootstrap source receipt drifted.'
              );
            }
            receipt = createProviderCapabilityObservation(
              input.plan,
              input.descriptor,
              context,
              turnIndex,
              invocation,
              observationInput.runtime,
              observationInput.closed,
              material.protectedLeakCanaries,
              observationInput.secretCanaries,
              Object.freeze({
                runtimeFactSourceAuthority,
                runtimeFactEnvelopes:
                  authorityResult.authorityResponse.runtimeFactEnvelopes,
                observedAt: sourceSealReceipt.observedAt,
              })
            );
          }
          if (!receipt) return undefined;
          await exactPersist(
            receipt,
            this.#input.persistProviderCapabilityObservationReceipt,
            'Evaluation provider capability observation receipt'
          );
          providerCapabilityObservationReceipts.push(receipt);
          providerCapabilityObservationInputs.delete(turnIndex);
          return receipt;
        },
        requiresControlledPreview: this.#input.requiresControlledPreview({
          plan: input.plan,
          descriptor: input.descriptor,
          material,
        }),
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (caught) {
      if (
        providerInvocationBoundaryEntered ||
        turnAuthorities.length > 0 ||
        recoveredTurns.length > 0
      ) {
        throw caught;
      }
      return this.#preDispatchFailureResult({
        plan: input.plan,
        descriptor: input.descriptor,
        stage: 'invocation-payload-encoding',
        suggestedReasonCode: 'invocation-payload-invalid',
        policyDigest: digestAgentCanonicalValue({
          promptPolicyDigest: input.plan.promptPolicyDigest,
          outputSchemaDigest: input.plan.outputSchemaDigest,
          toolRegistryDigest: input.plan.toolRegistryDigest,
          actionRegistryDigest: input.plan.actionRegistryDigest,
          loopPolicyDigest:
            this.#input.controlledRuntimeConfiguration.loop.loopPolicyDigest,
        }),
        inputDigest: material.materialDigest,
        contextPackDigest: context.contextPackDigest,
        caught,
      });
    }
    if (
      recoveredTurnCount !== recoveredTurns.length ||
      turnAuthorities.length !== loopResult.turns.length
    ) {
      throw new TypeError(
        'Evaluation recovery transcript was not consumed exactly.'
      );
    }

    const invocationTurnReceipts: AgentEvaluationInvocationTurnReceipt[] = [];
    for (const turn of loopResult.turns) {
      const authority = turnAuthorities[turn.turnIndex];
      if (!authority) {
        throw new TypeError('Evaluation turn authority is missing.');
      }
      const receipt = createTurnReceipt({
        plan: input.plan,
        descriptor: input.descriptor,
        context,
        turn,
        authority,
        retryPolicy: this.#retryPolicy,
      });
      if (!isAgentEvaluationInvocationTurnReceipt(receipt)) {
        throw new TypeError('Evaluation invocation turn receipt is invalid.');
      }
      await exactPersist(
        receipt,
        this.#input.persistInvocationTurnReceipt,
        'Evaluation invocation turn receipt'
      );
      invocationTurnReceipts.push(receipt);
    }
    const invocationTurnSetReceipt =
      createAgentEvaluationInvocationTurnSetReceipt({
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        turns: invocationTurnReceipts,
      });
    const terminalLoopTurn = loopResult.turns.at(-1)!;
    const capabilityUnavailable =
      terminalLoopTurn.zeroToolCallDisposition === 'grade-unavailable';
    if (
      loopResult.resultSubmissionReceipt &&
      loopResult.controlledRuntimeReceipt
    ) {
      await exactPersist(
        loopResult.resultSubmissionReceipt,
        this.#input.persistResultSubmissionReceipt,
        'Evaluation result submission receipt'
      );
      await exactPersist(
        loopResult.controlledRuntimeReceipt,
        this.#input.persistControlledRuntimeReceipt,
        'Evaluation controlled runtime receipt'
      );
    } else if (
      loopResult.resultSubmissionReceipt ||
      loopResult.controlledRuntimeReceipt ||
      (loopResult.finalStatus === 'completed' && !capabilityUnavailable)
    ) {
      throw new TypeError(
        'Evaluation terminal controlled authority is incomplete.'
      );
    }

    const capabilityEvidence =
      await createAgentEvaluationAttemptCapabilityExecutionReceipt(
        this.#input.capabilityRuntime,
        {
          namespaceId: this.#input.namespaceId,
          shardLeaseOwnerId: this.#input.shardLeaseOwnerId,
          shardLeaseGeneration: this.#input.shardLeaseGeneration,
          verificationGrantGeneration: verificationAttemptGrant.generation,
          verificationAttemptGrantReceiptSetDigest:
            this.#verificationAttemptGrantReceiptSetDigest,
          plan: input.plan,
          descriptor: input.descriptor,
          material,
          capabilityDescriptor: context.concreteCase.capabilityDescriptor,
          terminalTurnIndex: terminalLoopTurn.turnIndex,
          terminalInvocationId: terminalLoopTurn.invocation.invocationId,
          terminalStatus: loopResult.finalStatus,
          observedAt: terminalLoopTurn.runtime.completedAt,
          providerCapabilityObservationReceipts: Object.freeze(
            providerCapabilityObservationReceipts
          ),
          capabilityToolExecutions: loopResult.capabilityToolExecutions,
          controlledToolExecutionReceipts: loopResult.toolExecutionOutputs.map(
            ({ receipt }) => receipt
          ),
          ...(loopResult.resultSubmissionReceipt
            ? {
                resultSubmissionReceipt: loopResult.resultSubmissionReceipt,
              }
            : {}),
          ...(loopResult.controlledRuntimeReceipt
            ? {
                controlledRuntimeReceipt: loopResult.controlledRuntimeReceipt,
              }
            : {}),
        }
      );
    for (const receipt of capabilityEvidence.attemptAuthorityOwnerReceipts) {
      await exactPersist(
        receipt,
        this.#input.persistAttemptAuthorityOwnerReceipt,
        'Evaluation attempt-authority owner receipt'
      );
    }
    for (const receipt of capabilityEvidence.specificReceipts) {
      await exactPersist(
        receipt,
        this.#input.persistCapabilitySpecificReceipt,
        'Evaluation capability-specific receipt'
      );
    }
    const capabilityExecutionReceipt = capabilityEvidence.executionReceipt;
    await exactPersist(
      capabilityExecutionReceipt,
      this.#input.persistCapabilityExecutionReceipt,
      'Evaluation capability execution receipt'
    );
    const capabilityExecutionReceipts = Object.freeze([
      capabilityExecutionReceipt,
    ]);
    const capabilityExecutionReceiptSetDigest =
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        capabilityExecutionReceipts
      );

    const toolReceiptDigests = loopResult.toolExecutionOutputs
      .map(({ receipt }) => receipt.receiptDigest)
      .sort(compareUnicodeCodePoints);
    const transactionReceiptDigests = loopResult.toolExecutionOutputs
      .flatMap(({ receipt }) => receipt.transactionReceiptDigests)
      .sort(compareUnicodeCodePoints);
    const execution = Object.freeze({
      modelInvocations: invocationTurnSetReceipt.dispatchedInvocationCount,
      toolCalls: loopResult.toolCallCount,
      repairRounds: loopResult.repairRoundCount,
      transactions: loopResult.transactionCount,
      artifactBytes: loopResult.artifactBytes,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        this.#verificationAttemptGrantReceiptSetDigest,
      ...(toolReceiptDigests.length > 0
        ? {
            toolReceiptSetDigest: digestAgentCanonicalValue({
              toolReceiptDigests,
            }),
          }
        : {}),
      ...(transactionReceiptDigests.length > 0
        ? {
            transactionReceiptSetDigest: digestAgentCanonicalValue({
              transactionReceiptDigests,
            }),
          }
        : {}),
      ...(loopResult.controlledRuntimeReceipt
        ? {
            verificationClosureDigest:
              loopResult.controlledRuntimeReceipt.g3Verification
                .verificationClosureDigest,
          }
        : {}),
    });
    const terminalTurnReceipt = invocationTurnReceipts.at(-1)!;
    const gradingInput = Object.freeze({
      namespaceId: this.#input.namespaceId,
      shardLeaseOwnerId: this.#input.shardLeaseOwnerId,
      shardLeaseGeneration: this.#input.shardLeaseGeneration,
      verificationGrantGeneration: verificationAttemptGrant.generation,
      verificationAttemptGrantReceiptSetDigest:
        this.#verificationAttemptGrantReceiptSetDigest,
      plan: input.plan,
      descriptor: input.descriptor,
      material,
      protocolFamily,
      status: loopResult.finalStatus,
      invocationTurnSetReceipt,
      terminalTurnReceipt,
      execution,
      capabilityExecutionReceipt,
      ...(loopResult.resultSubmission
        ? { resultSubmission: loopResult.resultSubmission }
        : {}),
      ...(loopResult.resultSubmissionReceipt
        ? { resultSubmissionReceipt: loopResult.resultSubmissionReceipt }
        : {}),
      ...(loopResult.controlledRuntimeReceipt
        ? { controlledRuntimeReceipt: loopResult.controlledRuntimeReceipt }
        : {}),
    });
    const grading = validateAgentEvaluationAttemptGrading(
      gradingInput,
      await this.#input.gradeAndPersist(gradingInput)
    );
    await exactPersist(
      grading.authorityReceipt,
      this.#input.persistAttemptAuthorityOwnerReceipt,
      'Evaluation grading owner receipt'
    );
    const attemptAuthorityOwnerReceipts = Object.freeze(
      [
        ...capabilityEvidence.attemptAuthorityOwnerReceipts,
        grading.authorityReceipt,
      ].sort(canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder)
    );
    const startedAt = loopResult.turns[0]!.runtime.startedAt;
    const completedAt = loopResult.turns.at(-1)!.runtime.completedAt;
    const elapsedMs = Date.parse(completedAt) - Date.parse(startedAt);
    assertCount(elapsedMs, 'Evaluation attempt elapsed time');
    const executionReceipt = createAgentEvaluationExecutionReceipt({
      executionReceiptId: `evaluation-execution:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      modelInvocations: execution.modelInvocations,
      toolCalls: execution.toolCalls,
      repairRounds: execution.repairRounds,
      transactions: execution.transactions,
      artifactBytes: execution.artifactBytes,
      elapsedMs,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        execution.verificationAttemptGrantReceiptSetDigest,
      ...(execution.toolReceiptSetDigest
        ? { toolReceiptSetDigest: execution.toolReceiptSetDigest }
        : {}),
      ...(execution.transactionReceiptSetDigest
        ? {
            transactionReceiptSetDigest: execution.transactionReceiptSetDigest,
          }
        : {}),
      ...(execution.verificationClosureDigest
        ? {
            verificationClosureDigest: execution.verificationClosureDigest,
          }
        : {}),
    });
    await exactPersist(
      executionReceipt,
      this.#input.persistExecutionReceipt,
      'Evaluation execution receipt'
    );
    const dispatchIntents = Object.freeze(
      turnAuthorities.map(({ closed }) => closed.dispatchIntent)
    );
    const transportReceipts = Object.freeze(
      turnAuthorities.map(({ closed }) => closed.transportReceipt)
    );
    const spoolReceipts = Object.freeze(
      turnAuthorities.flatMap(({ closed }) =>
        closed.resultSpoolReceipt ? [closed.resultSpoolReceipt] : []
      )
    );
    const terminalResponseDigest = terminalTurnReceipt.responseArtifactDigest;
    const attempt = createAgentModelEvaluationAttempt({
      descriptor: input.descriptor,
      independentRunId: `evaluation-run:${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
      dispatchIntentSetDigest:
        digestAgentEvaluationTransportDispatchIntentSet(dispatchIntents),
      transportReceiptSetDigest:
        digestAgentEvaluationTransportReceiptSet(transportReceipts),
      invocationTurnReceiptSetDigest:
        digestAgentEvaluationInvocationTurnReceiptSet(invocationTurnReceipts),
      invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        execution.verificationAttemptGrantReceiptSetDigest,
      ...(terminalResponseDigest
        ? { responseDigest: terminalResponseDigest }
        : {}),
      status: loopResult.finalStatus,
      outcome:
        loopResult.finalStatus === 'completed' &&
        capabilityExecutionReceipt.verdict === 'failed'
          ? 'failed'
          : outcomeFor(loopResult.finalStatus, grading.metricObservations),
      metricObservations: grading.metricObservations,
      usage: invocationTurnSetReceipt.aggregateUsage,
      cost: invocationTurnSetReceipt.aggregateCost,
      startedAt,
      completedAt,
    });
    const demand = normalizeDemand({
      usage: attempt.usage,
      cost: attempt.cost,
      modelInvocations: executionReceipt.modelInvocations,
      toolCalls: executionReceipt.toolCalls,
      repairRounds: executionReceipt.repairRounds,
      transactions: executionReceipt.transactions,
      artifactBytes: executionReceipt.artifactBytes,
      elapsedMs: executionReceipt.elapsedMs,
    });
    return Object.freeze({
      attempt,
      demand,
      preDispatchFailureReceipts: Object.freeze([]),
      capabilityExecutionReceipts,
      capabilitySpecificReceipts: capabilityEvidence.specificReceipts,
      providerCapabilityObservationReceipts: Object.freeze(
        providerCapabilityObservationReceipts
      ),
      attemptAuthorityOwnerReceipts,
      transportDispatchIntents: dispatchIntents,
      transportReceipts,
      providerResultSpoolReceipts: spoolReceipts,
      providerResultSpoolDispositionReceipts: Object.freeze(dispositions),
      invocationTurnReceipts: Object.freeze(invocationTurnReceipts),
      invocationTurnSetReceipt,
      sourceReceipts: Object.freeze(sourceReceipts),
      executionReceipt,
      ...(loopResult.resultSubmissionReceipt
        ? { resultSubmissionReceipt: loopResult.resultSubmissionReceipt }
        : {}),
      ...(loopResult.controlledRuntimeReceipt
        ? { controlledRuntimeReceipt: loopResult.controlledRuntimeReceipt }
        : {}),
      accountingDigest: digestAgentCanonicalValue({
        accountingDigests: turnAuthorities.flatMap(({ accounting }) =>
          accounting ? [accounting.accountingDigest] : []
        ),
      }),
      gradingDigest: grading.gradingDigest,
      payloadDigest: digestAgentCanonicalValue({
        payloadDigests: loopResult.turns.map(
          ({ encodedPayload }) => encodedPayload.payloadDigest
        ),
        providerCapabilityObservationReceiptSetDigest:
          digestAgentEvaluationProviderCapabilityObservationReceiptSet(
            providerCapabilityObservationReceipts
          ),
      }),
    });
  }
}

export const createAgentEvaluationPreDispatchAttemptFinalizer = (
  persistence: AgentEvaluationPreDispatchAttemptFinalizerPersistence
): AgentEvaluationPreDispatchAttemptFinalizer =>
  Object.freeze({
    execute: (input: AgentEvaluationPreDispatchAttemptFinalizationInput) =>
      AgentEvaluationAttemptExecutor.executePreDispatchFailure(
        persistence,
        input
      ),
  });

export const digestAgentEvaluationAttemptResultAuthority = (
  result: Pick<
    AgentEvaluationAttemptExecutorResult,
    | 'preDispatchFailureReceipts'
    | 'capabilityExecutionReceipts'
    | 'capabilitySpecificReceipts'
    | 'providerCapabilityObservationReceipts'
    | 'attemptAuthorityOwnerReceipts'
    | 'transportDispatchIntents'
    | 'transportReceipts'
    | 'invocationTurnReceipts'
    | 'invocationTurnSetReceipt'
    | 'resultSubmissionReceipt'
    | 'controlledRuntimeReceipt'
  >
): CanonicalDigest =>
  digestAgentCanonicalValue({
    preDispatchFailureReceiptSetDigest:
      digestAgentEvaluationPreDispatchFailureReceiptSet(
        result.preDispatchFailureReceipts
      ),
    capabilityExecutionReceiptSetDigest:
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        result.capabilityExecutionReceipts
      ),
    capabilitySpecificReceiptSetDigest:
      digestAgentEvaluationCapabilitySpecificReceiptSet(
        result.capabilitySpecificReceipts
      ),
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        result.providerCapabilityObservationReceipts
      ),
    attemptAuthorityOwnerReceiptSetDigest:
      digestAgentEvaluationAttemptAuthorityOwnerReceiptSet(
        result.attemptAuthorityOwnerReceipts
      ),
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet(
      result.transportDispatchIntents
    ),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet(
      result.transportReceipts
    ),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet(
        result.invocationTurnReceipts
      ),
    invocationTurnSetReceiptDigest:
      result.invocationTurnSetReceipt.receiptDigest,
    resultSubmissionReceiptSetDigest:
      digestAgentEvaluationResultSubmissionReceiptSet(
        result.resultSubmissionReceipt ? [result.resultSubmissionReceipt] : []
      ),
    controlledRuntimeReceiptSetDigest:
      digestAgentEvaluationControlledRuntimeReceiptSet(
        result.controlledRuntimeReceipt ? [result.controlledRuntimeReceipt] : []
      ),
  });
