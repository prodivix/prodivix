import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentExternalSourceResult,
  createAgentRetrievalQueryReceipt,
} from '../hosted/agentRetrieval';
import {
  createAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import {
  isAgentHostedRetrievalRuntimeResourceAuthority,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  matchAgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from '../providers/agentHostedRetrievalRuntimeResource';
import {
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
} from '../providers/agentInvocationFacts';
import {
  isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  isAgentNativeProviderCapabilityRuntimeRequestProjection,
  isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf,
  isAgentNativeProviderCapabilityRuntimeResponseProjection,
  type AgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  type AgentNativeProviderCapabilityRuntimeRequestProjection,
  type AgentNativeProviderCapabilityRuntimeResponseDecodeResult,
  type AgentNativeProviderCapabilityRuntimeResponseProjection,
} from '../providers/agentNativeProviderCapabilityRuntime';
import {
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import {
  digestAgentNativeProviderStateReference,
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultResolveRequest,
  isAgentNativeProviderStateVaultRetirementPolicyCompliant,
  isAgentNativeProviderStateVaultRetirementReceipt,
  isAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultResolveRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultSealRequestProjection,
} from '../providers/agentNativeProviderStateVault';
import type { AgentProviderJobReceipt } from '../providers/agentProvider.types';
import type {
  AgentEvaluationTransportDispatchIntent,
  AgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';
import {
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  isAgentEvaluationCapabilityPreEffectIntent,
  isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  type AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  type AgentEvaluationCapabilityEffectPriorSourceDisposition,
  type AgentEvaluationCapabilityPreEffectIntent,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  isAgentEvaluationCapabilityEffectProviderSpoolReceipt,
  type AgentEvaluationCapabilityEffectProviderSpoolReceipt,
} from './agentEvaluationCapabilityEffectProviderJournalSpool';
import {
  isAgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
} from './agentEvaluationProviderCapabilityObservation';

export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_READINESS_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-readiness-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_STAGE_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-stage-request' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-execution-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_FORMAT =
  'prodivix.agent-evaluation-capability-effect-provider-result-seal-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_BYTES =
  131_072 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS =
  30_000 as const;

export type AgentEvaluationCapabilityEffectProviderOwnerKind =
  'hosted-retrieval-owner' | 'provider-response-metadata-owner';

export type AgentEvaluationCapabilityEffectProviderReadinessReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_READINESS_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION;
  capabilityId:
    | 'provider.background-job'
    | 'provider.hosted-retrieval'
    | 'provider.isolated-cache'
    | 'provider.reasoning-continuation';
  ownerKind: AgentEvaluationCapabilityEffectProviderOwnerKind;
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  routeBinding: string;
  registrationReceiptDigest: CanonicalDigest;
  runtimeFactSourceAuthorityDigest: CanonicalDigest;
  hostedRetrievalRuntimeResourceRegistrationIntentDigest: CanonicalDigest | null;
  protocolFamily:
    'anthropic-messages' | 'gemini-interactions' | 'openai-responses';
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  ownerInstanceId: string;
  transportOwnerInstanceId: string;
  transportHealthDigest: CanonicalDigest;
  vaultOwnerInstanceId: string | null;
  vaultHealthDigest: CanonicalDigest | null;
  status: 'healthy' | 'unavailable';
  unavailableReason:
    'owner-unhealthy' | 'transport-unhealthy' | 'vault-unhealthy' | null;
  checkedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectProviderReadinessReceiptInput =
  Omit<
    AgentEvaluationCapabilityEffectProviderReadinessReceipt,
    | 'format'
    | 'version'
    | 'capabilityId'
    | 'ownerKind'
    | 'sourceAuthorityId'
    | 'sourceAuthorityImplementationDigest'
    | 'routeBinding'
    | 'registrationReceiptDigest'
    | 'runtimeFactSourceAuthorityDigest'
    | 'hostedRetrievalRuntimeResourceRegistrationIntentDigest'
    | 'protocolFamily'
    | 'providerConfigurationId'
    | 'modelId'
    | 'modelLineageDigest'
    | 'adapterDigest'
    | 'receiptDigest'
  >;

export type AgentEvaluationCapabilityEffectProviderStageRequest = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_STAGE_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION;
  intentDigest: CanonicalDigest;
  ownerRequestId: string;
  ownerRequestDigest: CanonicalDigest;
  bindingKind:
    | 'hosted-retrieval-query'
    | 'opaque-continuation'
    | 'provider-cache'
    | 'provider-job';
  capabilityId:
    | 'provider.background-job'
    | 'provider.hosted-retrieval'
    | 'provider.isolated-cache'
    | 'provider.reasoning-continuation';
  readinessReceipt: AgentEvaluationCapabilityEffectProviderReadinessReceipt;
  readinessReceiptDigest: CanonicalDigest;
  requestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
  nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
  stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
  stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
  providerResourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment | null;
  providerResourceAuthority: AgentHostedRetrievalRuntimeResourceAuthority | null;
  providerResourceReadRequest: AgentHostedRetrievalRuntimeResourceReadRequest | null;
  providerResourceReadReceipt: AgentHostedRetrievalRuntimeResourceReadReceipt | null;
  stagedAt: Instant;
  expiresAt: Instant;
  stageDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectProviderStageRequestInput =
  Readonly<{
    readinessReceipt: AgentEvaluationCapabilityEffectProviderReadinessReceipt;
    requestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
    nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
    stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
    providerResourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment | null;
    providerResourceAuthority: AgentHostedRetrievalRuntimeResourceAuthority | null;
    providerResourceReadRequest: AgentHostedRetrievalRuntimeResourceReadRequest | null;
    providerResourceReadReceipt: AgentHostedRetrievalRuntimeResourceReadReceipt | null;
    stagedAt: Instant;
    expiresAt: Instant;
  }>;

export type AgentEvaluationCapabilityEffectProviderExecutionReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION;
  stageDigest: CanonicalDigest;
  readinessReceiptDigest: CanonicalDigest;
  requestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
  cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null;
  dispatchIntent: AgentEvaluationTransportDispatchIntent;
  transportReceipt: AgentEvaluationTransportReceipt;
  resultSpoolReceipt: AgentEvaluationCapabilityEffectProviderSpoolReceipt | null;
  responseProjection: AgentNativeProviderCapabilityRuntimeResponseProjection;
  pollSequence: number;
  priorExecutionReceiptDigest: CanonicalDigest | null;
  executionStatus: 'completed' | 'failed' | 'in-progress' | 'unavailable';
  dispatchAckDigest: CanonicalDigest;
  executedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectProviderExecutionReceiptInput =
  Readonly<{
    requestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
    cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null;
    dispatchIntent: AgentEvaluationTransportDispatchIntent;
    transportReceipt: AgentEvaluationTransportReceipt;
    resultSpoolReceipt: AgentEvaluationCapabilityEffectProviderSpoolReceipt | null;
    responseProjection: AgentNativeProviderCapabilityRuntimeResponseProjection;
    pollSequence: number;
    priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null;
    executedAt: Instant;
  }>;

export type AgentEvaluationCapabilityEffectProviderBusinessResult = Readonly<{
  status: 'completed' | 'failed' | 'unavailable';
  providerStatus: AgentNativeProviderCapabilityRuntimeResponseProjection['providerStatus'];
  outputText: string | null;
  responseDigest: CanonicalDigest;
  resultDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityEffectProviderResultSealReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION;
    stageDigest: CanonicalDigest;
    executionReceiptDigest: CanonicalDigest;
    readinessReceiptDigest: CanonicalDigest;
    resultStatus: 'produced' | 'failed' | 'unavailable';
    businessResultDigest: CanonicalDigest;
    sourceFactKind:
      | 'opaque-continuation'
      | 'provider-cache-receipt'
      | 'provider-job-receipt'
      | 'retrieval-query-receipt'
      | null;
    sourceFactDigest: CanonicalDigest | null;
    stateVaultRetireRequestDigest: CanonicalDigest | null;
    stateVaultRetirementReceiptDigest: CanonicalDigest | null;
    nextStateVaultSealRequestDigest: CanonicalDigest | null;
    nextStateVaultSealReceiptDigest: CanonicalDigest | null;
    providerResourceSetCommitmentDigest: CanonicalDigest | null;
    providerResourceAuthorityDigest: CanonicalDigest | null;
    providerResourceReadRequestDigest: CanonicalDigest | null;
    providerResourceReadReceiptDigest: CanonicalDigest | null;
    consumedInputSourceFactDigest: CanonicalDigest | null;
    sealedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectProviderRuntimeResult = Readonly<{
  businessResult: AgentEvaluationCapabilityEffectProviderBusinessResult;
  fact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
  resultSealReceipt: AgentEvaluationCapabilityEffectProviderResultSealReceipt;
}>;

const readinessKeys = Object.freeze([
  'format',
  'version',
  'capabilityId',
  'ownerKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'routeBinding',
  'registrationReceiptDigest',
  'runtimeFactSourceAuthorityDigest',
  'hostedRetrievalRuntimeResourceRegistrationIntentDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'ownerInstanceId',
  'transportOwnerInstanceId',
  'transportHealthDigest',
  'vaultOwnerInstanceId',
  'vaultHealthDigest',
  'status',
  'unavailableReason',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

const stageKeys = Object.freeze([
  'format',
  'version',
  'intentDigest',
  'ownerRequestId',
  'ownerRequestDigest',
  'bindingKind',
  'capabilityId',
  'readinessReceipt',
  'readinessReceiptDigest',
  'requestProjection',
  'nativeSourceReceipt',
  'stateVaultResolveRequest',
  'stateVaultResolveReceipt',
  'providerResourceSetCommitment',
  'providerResourceAuthority',
  'providerResourceReadRequest',
  'providerResourceReadReceipt',
  'stagedAt',
  'expiresAt',
  'stageDigest',
] as const);

const executionKeys = Object.freeze([
  'format',
  'version',
  'stageDigest',
  'readinessReceiptDigest',
  'requestProjection',
  'cacheWarmAuthority',
  'dispatchIntent',
  'transportReceipt',
  'resultSpoolReceipt',
  'responseProjection',
  'pollSequence',
  'priorExecutionReceiptDigest',
  'executionStatus',
  'dispatchAckDigest',
  'executedAt',
  'receiptDigest',
] as const);

const resultSealKeys = Object.freeze([
  'format',
  'version',
  'stageDigest',
  'executionReceiptDigest',
  'readinessReceiptDigest',
  'resultStatus',
  'businessResultDigest',
  'sourceFactKind',
  'sourceFactDigest',
  'stateVaultRetireRequestDigest',
  'stateVaultRetirementReceiptDigest',
  'nextStateVaultSealRequestDigest',
  'nextStateVaultSealReceiptDigest',
  'providerResourceSetCommitmentDigest',
  'providerResourceAuthorityDigest',
  'providerResourceReadRequestDigest',
  'providerResourceReadReceiptDigest',
  'consumedInputSourceFactDigest',
  'sealedAt',
  'receiptDigest',
] as const);

const safe = (
  value: unknown,
  maximumBytes: number = AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_BYTES
): boolean => {
  try {
    return (
      inspectAgentControlJson(value, maximumBytes).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

const withinCanonicalBytes = (
  value: unknown,
  maximumBytes: number
): boolean => {
  try {
    return (
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumBytes
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationCapabilityEffectProviderExecutionReceiptByteCapacity =
  (value: unknown): boolean =>
    withinCanonicalBytes(
      value,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    );

export const isAgentEvaluationCapabilityEffectProviderBusinessResultByteCapacity =
  (value: unknown): boolean =>
    withinCanonicalBytes(
      value,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES
    );

const statefulCapability = (
  capabilityId: string
): capabilityId is
  'provider.background-job' | 'provider.reasoning-continuation' =>
  capabilityId === 'provider.background-job' ||
  capabilityId === 'provider.reasoning-continuation';

const supportedRuntimeIntent = (
  intent: AgentEvaluationCapabilityPreEffectIntent
): boolean =>
  [
    'provider.background-job',
    'provider.hosted-retrieval',
    'provider.isolated-cache',
    'provider.reasoning-continuation',
  ].includes(intent.runtimeFactSourceAuthority.capabilityId) &&
  (intent.runtimeFactSourceAuthority.protocolFamily !== 'anthropic-messages' ||
    intent.runtimeFactSourceAuthority.capabilityId ===
      'provider.isolated-cache');

export const createAgentEvaluationCapabilityEffectProviderReadinessReceipt = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  input: CreateAgentEvaluationCapabilityEffectProviderReadinessReceiptInput
): AgentEvaluationCapabilityEffectProviderReadinessReceipt => {
  if (
    !isAgentEvaluationCapabilityPreEffectIntent(intent) ||
    !supportedRuntimeIntent(intent) ||
    !hasExactAgentControlKeys(input, [
      'ownerInstanceId',
      'transportOwnerInstanceId',
      'transportHealthDigest',
      'vaultOwnerInstanceId',
      'vaultHealthDigest',
      'status',
      'unavailableReason',
      'checkedAt',
      'expiresAt',
    ]) ||
    ![input.ownerInstanceId, input.transportOwnerInstanceId].every(
      isAgentControlIdentity
    ) ||
    !isAgentCanonicalDigest(input.transportHealthDigest) ||
    !['healthy', 'unavailable'].includes(input.status) ||
    (input.status === 'healthy') !== (input.unavailableReason === null) ||
    (input.unavailableReason !== null &&
      !['owner-unhealthy', 'transport-unhealthy', 'vault-unhealthy'].includes(
        input.unavailableReason
      )) ||
    !isAgentControlInstant(input.checkedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.checkedAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.checkedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError('Capability effect Provider readiness is invalid.');
  }
  const authority = intent.runtimeFactSourceAuthority;
  const requiresVault = statefulCapability(authority.capabilityId);
  if (
    requiresVault !== (input.vaultOwnerInstanceId !== null) ||
    requiresVault !== (input.vaultHealthDigest !== null) ||
    (input.vaultOwnerInstanceId !== null &&
      !isAgentControlIdentity(input.vaultOwnerInstanceId)) ||
    (input.vaultHealthDigest !== null &&
      !isAgentCanonicalDigest(input.vaultHealthDigest)) ||
    (input.unavailableReason === 'vault-unhealthy' && !requiresVault)
  ) {
    throw new TypeError(
      'Capability effect Provider readiness vault authority drifted.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_READINESS_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    capabilityId:
      authority.capabilityId as AgentEvaluationCapabilityEffectProviderReadinessReceipt['capabilityId'],
    ownerKind:
      authority.capabilityId === 'provider.hosted-retrieval'
        ? ('hosted-retrieval-owner' as const)
        : ('provider-response-metadata-owner' as const),
    sourceAuthorityId: authority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      authority.sourceAuthorityImplementationDigest,
    routeBinding: authority.routeBinding,
    registrationReceiptDigest: authority.registrationReceiptDigest,
    runtimeFactSourceAuthorityDigest: authority.authorityDigest,
    hostedRetrievalRuntimeResourceRegistrationIntentDigest:
      authority.hostedRetrievalRuntimeResourceRegistrationIntentDigest ?? null,
    protocolFamily: authority.protocolFamily as
      'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
    providerConfigurationId: authority.providerConfigurationId,
    modelId: authority.modelId,
    modelLineageDigest: authority.modelLineageDigest,
    adapterDigest: authority.adapterDigest,
    ...input,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!safe(receipt)) {
    throw new TypeError(
      'Capability effect Provider readiness is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentEvaluationCapabilityEffectProviderReadinessReceipt = (
  value: unknown,
  intent: AgentEvaluationCapabilityPreEffectIntent
): value is AgentEvaluationCapabilityEffectProviderReadinessReceipt => {
  if (!hasExactAgentControlKeys(value, readinessKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      capabilityId: _capabilityId,
      ownerKind: _ownerKind,
      sourceAuthorityId: _sourceAuthorityId,
      sourceAuthorityImplementationDigest: _sourceAuthorityImplementationDigest,
      routeBinding: _routeBinding,
      registrationReceiptDigest: _registrationReceiptDigest,
      runtimeFactSourceAuthorityDigest: _runtimeFactSourceAuthorityDigest,
      hostedRetrievalRuntimeResourceRegistrationIntentDigest:
        _hostedRetrievalRuntimeResourceRegistrationIntentDigest,
      protocolFamily: _protocolFamily,
      providerConfigurationId: _providerConfigurationId,
      modelId: _modelId,
      modelLineageDigest: _modelLineageDigest,
      adapterDigest: _adapterDigest,
      receiptDigest: _receiptDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectProviderReadinessReceipt;
    return sameCanonicalJson(
      value,
      createAgentEvaluationCapabilityEffectProviderReadinessReceipt(
        intent,
        input
      )
    );
  } catch {
    return false;
  }
};

const sourceReceiptFactDigest = (
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt
): CanonicalDigest => {
  switch (receipt.fact.factType) {
    case 'provider-job-receipt':
    case 'provider-cache-receipt':
      return receipt.fact.value.receiptDigest;
    case 'opaque-continuation':
      return receipt.fact.value.continuationDigest;
  }
};

const operationForBinding = (
  bindingKind: AgentEvaluationCapabilityEffectProviderStageRequest['bindingKind']
): AgentNativeProviderCapabilityRuntimeRequestProjection['operation'] => {
  switch (bindingKind) {
    case 'provider-job':
      return 'background-poll';
    case 'provider-cache':
      return 'cache-cold';
    case 'opaque-continuation':
      return 'continuation-resume';
    case 'hosted-retrieval-query':
      return 'hosted-retrieval-query';
  }
};

const sourceReceiptMatchesIntent = (
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt,
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent
): boolean => {
  const binding = intent.inputAuthorityBinding;
  const expectedFactType =
    binding.bindingKind === 'provider-job'
      ? 'provider-job-receipt'
      : binding.bindingKind === 'provider-cache'
        ? 'provider-cache-receipt'
        : 'opaque-continuation';
  return (
    isAgentNativeProviderOptionalCapabilitySourceReceipt(receipt, program) &&
    receipt.fact.factType === expectedFactType &&
    receipt.protocolFamily === binding.protocolFamily &&
    receipt.providerConfigurationId === binding.providerConfigurationId &&
    receipt.modelLineageDigest === binding.modelLineageDigest &&
    receipt.adapterDigest === binding.adapterDigest &&
    receipt.invocationId === binding.sourceInvocationId &&
    receipt.requestDigest === binding.sourceProviderRequestDigest &&
    receipt.responseDigest === binding.sourceResponseDigest &&
    sourceReceiptFactDigest(receipt) === binding.sourceHandleDigest
  );
};

export const createAgentEvaluationCapabilityEffectProviderStageRequest = (
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  input: CreateAgentEvaluationCapabilityEffectProviderStageRequestInput
): AgentEvaluationCapabilityEffectProviderStageRequest => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !isAgentEvaluationCapabilityPreEffectIntent(intent) ||
    !supportedRuntimeIntent(intent) ||
    program.profileProjection.capabilityProfileId !==
      intent.runtimeFactSourceAuthority.capabilityProfileId ||
    program.profileProjection.capabilityProfileDigest !==
      intent.runtimeFactSourceAuthority.capabilityProfileDigest ||
    program.profileProjection.capabilityId !==
      intent.runtimeFactSourceAuthority.capabilityId ||
    !hasExactAgentControlKeys(input, [
      'readinessReceipt',
      'requestProjection',
      'nativeSourceReceipt',
      'stateVaultResolveRequest',
      'stateVaultResolveReceipt',
      'providerResourceSetCommitment',
      'providerResourceAuthority',
      'providerResourceReadRequest',
      'providerResourceReadReceipt',
      'stagedAt',
      'expiresAt',
    ]) ||
    !isAgentEvaluationCapabilityEffectProviderReadinessReceipt(
      input.readinessReceipt,
      intent
    ) ||
    input.readinessReceipt.status !== 'healthy' ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      input.requestProjection,
      program
    ) ||
    input.requestProjection.operation !==
      operationForBinding(intent.inputAuthorityBinding.bindingKind) ||
    input.requestProjection.protocolFamily !==
      intent.runtimeFactSourceAuthority.protocolFamily ||
    input.requestProjection.providerConfigurationId !==
      intent.runtimeFactSourceAuthority.providerConfigurationId ||
    input.requestProjection.modelId !==
      intent.runtimeFactSourceAuthority.modelId ||
    input.requestProjection.modelLineageDigest !==
      intent.runtimeFactSourceAuthority.modelLineageDigest ||
    input.requestProjection.adapterDigest !==
      intent.runtimeFactSourceAuthority.adapterDigest ||
    !isAgentControlInstant(input.stagedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.stagedAt) < Date.parse(input.readinessReceipt.checkedAt) ||
    Date.parse(input.stagedAt) >=
      Date.parse(input.readinessReceipt.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.stagedAt) ||
    Date.parse(input.expiresAt) >
      Date.parse(input.readinessReceipt.expiresAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.stagedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError('Capability effect Provider stage input is invalid.');
  }
  const binding = intent.inputAuthorityBinding;
  const stateful =
    binding.bindingKind === 'provider-job' ||
    binding.bindingKind === 'opaque-continuation';
  if (stateful) {
    const sealRequest = binding.stateVaultSealRequest;
    const sealReceipt = binding.stateVaultSealReceipt;
    const sourceReceipt = input.nativeSourceReceipt;
    const resolveRequest = input.stateVaultResolveRequest;
    const resolveReceipt = input.stateVaultResolveReceipt;
    if (
      sealRequest === null ||
      sealReceipt === null ||
      sourceReceipt === null ||
      resolveRequest === null ||
      resolveReceipt === null ||
      input.providerResourceSetCommitment !== null ||
      input.providerResourceAuthority !== null ||
      input.providerResourceReadRequest !== null ||
      input.providerResourceReadReceipt !== null ||
      !sourceReceiptMatchesIntent(sourceReceipt, program, intent) ||
      !isAgentNativeProviderStateVaultResolveRequest(
        resolveRequest,
        sealRequest,
        sealReceipt
      ) ||
      !isAgentNativeProviderStateVaultResolveReceipt(
        resolveReceipt,
        resolveRequest
      ) ||
      resolveReceipt.status !== 'resolved' ||
      resolveRequest.consumerAttemptId !== intent.attemptId ||
      resolveRequest.consumerInvocationId !== intent.invocationId ||
      resolveRequest.consumerGeneration !==
        sourceReceipt.executionIdentityAuthority.generation
    ) {
      throw new TypeError(
        'Capability effect Provider stage state authority drifted.'
      );
    }
    const source = sourceReceipt.source;
    if (
      binding.bindingKind === 'provider-job'
        ? source.sourceKind !== 'provider-job-active-status'
        : source.sourceKind !== 'provider-stored-continuation'
    ) {
      throw new TypeError(
        'Capability effect Provider stage state authority drifted.'
      );
    }
    if (
      source.sourceKind !== 'provider-job-active-status' &&
      source.sourceKind !== 'provider-stored-continuation'
    ) {
      throw new TypeError(
        'Capability effect Provider stage state source is unavailable.'
      );
    }
    if (
      source.opaqueProviderStateRef !== sealReceipt.opaqueProviderStateRef ||
      source.stateVaultAuthorityDigest !== sealRequest.authorityDigest ||
      source.stateVaultSealRequestDigest !== sealRequest.sealRequestDigest ||
      source.stateVaultSealReceiptDigest !== sealReceipt.receiptDigest ||
      input.requestProjection.providerStateReferenceDigest !==
        source.providerStateReferenceDigest ||
      resolveRequest.providerStateReferenceDigest !==
        source.providerStateReferenceDigest
    ) {
      throw new TypeError(
        'Capability effect Provider stage state authority drifted.'
      );
    }
  } else if (binding.bindingKind === 'provider-cache') {
    const sourceReceipt = input.nativeSourceReceipt;
    if (
      sourceReceipt === null ||
      input.stateVaultResolveRequest !== null ||
      input.stateVaultResolveReceipt !== null ||
      input.providerResourceSetCommitment !== null ||
      input.providerResourceAuthority !== null ||
      input.providerResourceReadRequest !== null ||
      input.providerResourceReadReceipt !== null ||
      !sourceReceiptMatchesIntent(sourceReceipt, program, intent) ||
      sourceReceipt.source.sourceKind !== 'provider-cache-usage' ||
      input.requestProjection.cacheKeyDigest !==
        sourceReceipt.source.cacheKeyDigest ||
      input.requestProjection.cachePrefixDescriptorDigest !==
        sourceReceipt.source.prefixDescriptorDigest
    ) {
      throw new TypeError(
        'Capability effect Provider stage cache authority drifted.'
      );
    }
  } else {
    const commitment = input.providerResourceSetCommitment;
    const authority = input.providerResourceAuthority;
    const readRequest = input.providerResourceReadRequest;
    const readReceipt = input.providerResourceReadReceipt;
    const publicResource = resolveAgentCapabilityProbePublicResource(program);
    if (
      input.nativeSourceReceipt !== null ||
      input.stateVaultResolveRequest !== null ||
      input.stateVaultResolveReceipt !== null ||
      commitment === null ||
      authority === null ||
      readRequest === null ||
      readReceipt === null ||
      publicResource === null ||
      !isAgentHostedRetrievalRuntimeResourceSetCommitment(commitment) ||
      !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
      !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
        commitment,
        authority
      ) ||
      authority.registrationIntentDigest !==
        intent.runtimeFactSourceAuthority
          .hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
      authority.registrationIntentDigest !==
        input.readinessReceipt
          .hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
      authority.planDigest !== intent.planDigest ||
      authority.protocolFamily !== input.requestProjection.protocolFamily ||
      authority.providerConfigurationId !==
        input.requestProjection.providerConfigurationId ||
      authority.modelId !== input.requestProjection.modelId ||
      authority.modelLineageDigest !==
        input.requestProjection.modelLineageDigest ||
      authority.adapterDigest !== input.requestProjection.adapterDigest ||
      authority.capabilityProfileId !==
        program.profileProjection.capabilityProfileId ||
      authority.capabilityProfileDigest !==
        program.profileProjection.capabilityProfileDigest ||
      authority.probeProgramDigest !== program.programDigest ||
      authority.publicResourceDescriptorDigest !==
        publicResource.descriptor.descriptorDigest ||
      !matchAgentHostedRetrievalRuntimeResourceReadReceipt(
        readReceipt,
        readRequest,
        authority,
        input.stagedAt
      ) ||
      Date.parse(input.expiresAt) > Date.parse(readReceipt.expiresAt) ||
      Date.parse(input.expiresAt) > Date.parse(authority.expiresAt) ||
      readRequest.namespaceId !== intent.namespaceId ||
      readRequest.repositoryCommit !== intent.repositoryCommit ||
      readRequest.planDigest !== intent.planDigest ||
      readRequest.resourceSetCommitmentDigest !== commitment.commitmentDigest ||
      readRequest.readerOwnerInstanceId !==
        input.readinessReceipt.ownerInstanceId ||
      readReceipt.activeOwnerInstanceId !==
        input.readinessReceipt.ownerInstanceId ||
      input.requestProjection.providerResourceSetCommitmentDigest !==
        commitment.commitmentDigest ||
      input.requestProjection.providerResourceAuthorityDigest !==
        authority.authorityDigest ||
      input.requestProjection.providerResourceReadRequestDigest !==
        readRequest.requestDigest ||
      input.requestProjection.providerResourceReadReceiptDigest !==
        readReceipt.receiptDigest
    ) {
      throw new TypeError(
        'Capability effect Provider stage resource authority drifted.'
      );
    }
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_STAGE_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    intentDigest: intent.intentDigest,
    ownerRequestId: intent.ownerRequestId,
    ownerRequestDigest: intent.ownerRequestDigest,
    bindingKind:
      binding.bindingKind as AgentEvaluationCapabilityEffectProviderStageRequest['bindingKind'],
    capabilityId: intent.runtimeFactSourceAuthority
      .capabilityId as AgentEvaluationCapabilityEffectProviderStageRequest['capabilityId'],
    readinessReceipt: input.readinessReceipt,
    readinessReceiptDigest: input.readinessReceipt.receiptDigest,
    requestProjection: input.requestProjection,
    nativeSourceReceipt: input.nativeSourceReceipt,
    stateVaultResolveRequest: input.stateVaultResolveRequest,
    stateVaultResolveReceipt: input.stateVaultResolveReceipt,
    providerResourceSetCommitment: input.providerResourceSetCommitment,
    providerResourceAuthority: input.providerResourceAuthority,
    providerResourceReadRequest: input.providerResourceReadRequest,
    providerResourceReadReceipt: input.providerResourceReadReceipt,
    stagedAt: input.stagedAt,
    expiresAt: input.expiresAt,
  });
  const stage = Object.freeze({
    ...base,
    stageDigest: digestAgentCanonicalValue(base),
  });
  if (!safe(stage)) {
    throw new TypeError(
      'Capability effect Provider stage is unsafe or unbounded.'
    );
  }
  return stage;
};

export const isAgentEvaluationCapabilityEffectProviderStageRequest = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent
): value is AgentEvaluationCapabilityEffectProviderStageRequest => {
  if (!hasExactAgentControlKeys(value, stageKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      intentDigest: _intentDigest,
      ownerRequestId: _ownerRequestId,
      ownerRequestDigest: _ownerRequestDigest,
      bindingKind: _bindingKind,
      capabilityId: _capabilityId,
      readinessReceiptDigest: _readinessReceiptDigest,
      stageDigest: _stageDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectProviderStageRequest;
    return sameCanonicalJson(
      value,
      createAgentEvaluationCapabilityEffectProviderStageRequest(
        program,
        intent,
        input
      )
    );
  } catch {
    return false;
  }
};

const executionStatusFor = (
  response: AgentNativeProviderCapabilityRuntimeResponseProjection,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  pollSequence: number,
  program: AgentCapabilityProbeProgram
): AgentEvaluationCapabilityEffectProviderExecutionReceipt['executionStatus'] =>
  response.denialKind === null
    ? stage.bindingKind === 'provider-job' &&
      ['in-progress', 'queued'].includes(response.providerStatus ?? '')
      ? pollSequence >= program.hardLimits.maximumPollAttempts ||
        Date.parse(response.observedAt) >= Date.parse(stage.expiresAt)
        ? 'failed'
        : 'in-progress'
      : stage.bindingKind === 'provider-cache' &&
          response.operation === 'cache-cold'
        ? 'in-progress'
        : 'completed'
    : response.denialKind === 'provider-denied'
      ? 'unavailable'
      : 'failed';

const isExecutionReceiptSelf = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderExecutionReceipt => {
  if (!hasExactAgentControlKeys(value, executionKeys)) return false;
  const receipt =
    value as AgentEvaluationCapabilityEffectProviderExecutionReceipt;
  const { receiptDigest, ...base } = receipt;
  const request = receipt.requestProjection;
  const dispatch = receipt.dispatchIntent;
  const transport = receipt.transportReceipt;
  const response = receipt.responseProjection;
  const spool = receipt.resultSpoolReceipt;
  const responseBodyDigest = transport.responseBodyDigest ?? null;
  const dispatchAckBase = Object.freeze({
    format: 'prodivix.agent-evaluation-capability-effect-provider-dispatch-ack',
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    stageDigest: receipt.stageDigest,
    dispatchIntentDigest: dispatch.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    resultSpoolReceiptDigest: spool?.receiptDigest ?? null,
    responseProjectionDigest: response.projectionDigest,
    pollSequence: receipt.pollSequence,
    priorExecutionReceiptDigest: receipt.priorExecutionReceiptDigest,
    executionStatus: receipt.executionStatus,
    executedAt: receipt.executedAt,
  });
  return (
    receipt.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_FORMAT &&
    receipt.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION &&
    [
      receipt.stageDigest,
      receipt.readinessReceiptDigest,
      receipt.dispatchAckDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    (receipt.priorExecutionReceiptDigest === null ||
      isAgentCanonicalDigest(receipt.priorExecutionReceiptDigest)) &&
    isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(request) &&
    (receipt.cacheWarmAuthority === null ||
      isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
        receipt.cacheWarmAuthority,
        createAgentCapabilityProbeProgram({
          capabilityProfileId: request.capabilityProfileId,
          capabilityProfileDigest: request.capabilityProfileDigest,
        })
      )) &&
    Number.isSafeInteger(receipt.pollSequence) &&
    receipt.pollSequence >= 0 &&
    ['completed', 'failed', 'in-progress', 'unavailable'].includes(
      receipt.executionStatus
    ) &&
    isAgentEvaluationTransportDispatchIntent(receipt.dispatchIntent) &&
    isAgentEvaluationTransportReceipt(receipt.transportReceipt) &&
    (receipt.resultSpoolReceipt === null ||
      isAgentEvaluationCapabilityEffectProviderSpoolReceipt(
        receipt.resultSpoolReceipt
      )) &&
    isAgentNativeProviderCapabilityRuntimeResponseProjection(
      response,
      request
    ) &&
    dispatch.protocolFamily === request.protocolFamily &&
    dispatch.providerConfigurationId === request.providerConfigurationId &&
    dispatch.modelLineageDigest === request.modelLineageDigest &&
    dispatch.requestDigest === request.requestDigest &&
    dispatch.requestBodyDigest === request.requestBodyDigest &&
    dispatch.requestBytes === request.requestBytes &&
    transport.protocolFamily === dispatch.protocolFamily &&
    transport.providerConfigurationId === dispatch.providerConfigurationId &&
    transport.invocationId === dispatch.invocationId &&
    transport.dispatchIntentDigest === dispatch.intentDigest &&
    transport.requestDigest === dispatch.requestDigest &&
    transport.endpointId === dispatch.endpointId &&
    transport.endpointClass === dispatch.endpointClass &&
    transport.requestBodyDigest === dispatch.requestBodyDigest &&
    transport.requestBytes === dispatch.requestBytes &&
    response.requestDigest === request.requestDigest &&
    response.httpStatus === (transport.httpStatus ?? null) &&
    response.responseBodyDigest === responseBodyDigest &&
    Date.parse(transport.startedAt) >= Date.parse(dispatch.createdAt) &&
    Date.parse(transport.completedAt) >= Date.parse(transport.startedAt) &&
    Date.parse(response.observedAt) >= Date.parse(transport.completedAt) &&
    Date.parse(receipt.executedAt) >= Date.parse(response.observedAt) &&
    (spool === null) === (response.responseBodyDigest === null) &&
    (spool === null ||
      (spool.stageDigest === receipt.stageDigest &&
        spool.executionSequence === receipt.pollSequence &&
        spool.dispatchIntentDigest === dispatch.intentDigest &&
        spool.transportReceiptDigest === transport.receiptDigest &&
        spool.responseBodyDigest === response.responseBodyDigest &&
        spool.responseProjectionDigest === response.projectionDigest &&
        spool.normalizedEventSetDigest === response.normalizedEventSetDigest &&
        spool.responseDigest === response.responseDigest &&
        spool.createdAt === response.observedAt)) &&
    receipt.dispatchAckDigest === digestAgentCanonicalValue(dispatchAckBase) &&
    isAgentControlInstant(receipt.executedAt) &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    )
  );
};

const executionReceiptMatchesContext = (
  receipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest
): boolean => {
  const dispatch = receipt.dispatchIntent;
  const request = receipt.requestProjection;
  const spool = receipt.resultSpoolReceipt;
  return (
    isExecutionReceiptSelf(receipt) &&
    receipt.stageDigest === stage.stageDigest &&
    receipt.readinessReceiptDigest === stage.readinessReceiptDigest &&
    dispatch.planDigest === intent.planDigest &&
    dispatch.repositoryCommit === intent.repositoryCommit &&
    dispatch.attemptId === intent.attemptId &&
    dispatch.descriptorDigest === intent.descriptorDigest &&
    dispatch.turnIndex === intent.turnIndex &&
    dispatch.invocationId === intent.invocationId &&
    dispatch.demandDigest === intent.ownerRequestDigest &&
    request.protocolFamily === stage.requestProjection.protocolFamily &&
    request.providerConfigurationId ===
      stage.requestProjection.providerConfigurationId &&
    request.modelId === stage.requestProjection.modelId &&
    request.modelLineageDigest === stage.requestProjection.modelLineageDigest &&
    request.adapterDigest === stage.requestProjection.adapterDigest &&
    (stage.bindingKind !== 'provider-job' ||
      sameCanonicalJson(request, stage.requestProjection)) &&
    Date.parse(dispatch.createdAt) >= Date.parse(stage.stagedAt) &&
    Date.parse(dispatch.createdAt) < Date.parse(stage.expiresAt) &&
    Date.parse(receipt.responseProjection.observedAt) <
      Date.parse(stage.expiresAt) &&
    Date.parse(receipt.executedAt) < Date.parse(stage.expiresAt) &&
    (stage.providerResourceAuthority === null ||
      dispatch.budgetReservationId ===
        stage.providerResourceAuthority.budgetReservationAuthority
          .reservationId) &&
    (spool === null ||
      (spool.planDigest === intent.planDigest &&
        spool.repositoryCommit === intent.repositoryCommit &&
        spool.attemptId === intent.attemptId &&
        spool.descriptorDigest === intent.descriptorDigest &&
        spool.turnIndex === intent.turnIndex &&
        spool.invocationId === intent.invocationId &&
        spool.ownerRequestDigest === intent.ownerRequestDigest &&
        spool.expiresAt === stage.expiresAt))
  );
};

export const createAgentEvaluationCapabilityEffectProviderExecutionReceipt = (
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  input: CreateAgentEvaluationCapabilityEffectProviderExecutionReceiptInput
): AgentEvaluationCapabilityEffectProviderExecutionReceipt => {
  if (
    !isAgentEvaluationCapabilityEffectProviderStageRequest(
      stage,
      program,
      intent
    ) ||
    !hasExactAgentControlKeys(input, [
      'requestProjection',
      'cacheWarmAuthority',
      'dispatchIntent',
      'transportReceipt',
      'resultSpoolReceipt',
      'responseProjection',
      'pollSequence',
      'priorExecutionReceipt',
      'executedAt',
    ]) ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      input.requestProjection,
      program
    ) ||
    (input.cacheWarmAuthority !== null &&
      !isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
        input.cacheWarmAuthority,
        program
      )) ||
    !isAgentEvaluationTransportDispatchIntent(input.dispatchIntent) ||
    !isAgentEvaluationTransportReceipt(input.transportReceipt) ||
    !isAgentNativeProviderCapabilityRuntimeResponseProjection(
      input.responseProjection,
      input.requestProjection
    ) ||
    !isAgentControlInstant(input.executedAt)
  ) {
    throw new TypeError(
      'Capability effect Provider execution input is invalid.'
    );
  }
  const dispatch = input.dispatchIntent;
  const transport = input.transportReceipt;
  const spool = input.resultSpoolReceipt;
  const response = input.responseProjection;
  const poll = stage.bindingKind === 'provider-job';
  const cache = stage.bindingKind === 'provider-cache';
  const prior = input.priorExecutionReceipt;
  const request = input.requestProjection;
  const responseBodyDigest = transport.responseBodyDigest ?? null;
  if (
    !Number.isSafeInteger(input.pollSequence) ||
    (poll
      ? input.pollSequence < 1 ||
        input.pollSequence > program.hardLimits.maximumPollAttempts ||
        !sameCanonicalJson(request, stage.requestProjection) ||
        (input.pollSequence === 1) !== (prior === null) ||
        (prior !== null &&
          (!executionReceiptMatchesContext(prior, intent, stage) ||
            prior.executionStatus !== 'in-progress' ||
            prior.pollSequence !== input.pollSequence - 1 ||
            Date.parse(dispatch.createdAt) < Date.parse(prior.executedAt)))
      : cache
        ? ![0, 1].includes(input.pollSequence) ||
          (input.pollSequence === 0) !== (prior === null) ||
          (input.pollSequence === 0
            ? request.operation !== 'cache-cold' ||
              request.requestDigest !== stage.requestProjection.requestDigest ||
              input.cacheWarmAuthority !== null
            : prior === null ||
              !executionReceiptMatchesContext(prior, intent, stage) ||
              prior.executionStatus !== 'in-progress' ||
              prior.pollSequence !== 0 ||
              prior.requestProjection.operation !== 'cache-cold' ||
              request.operation !== 'cache-warm' ||
              input.cacheWarmAuthority === null ||
              input.cacheWarmAuthority.coldRequestDigest !==
                stage.requestProjection.requestDigest ||
              input.cacheWarmAuthority.coldResponseProjectionDigest !==
                prior.responseProjection.projectionDigest ||
              input.cacheWarmAuthority.warmRequestDigest !==
                request.requestDigest ||
              Date.parse(input.cacheWarmAuthority.preparedAt) <
                Date.parse(prior.executedAt) ||
              Date.parse(input.cacheWarmAuthority.expiresAt) >
                Date.parse(stage.expiresAt) ||
              Date.parse(dispatch.createdAt) <
                Date.parse(input.cacheWarmAuthority.preparedAt) ||
              Date.parse(dispatch.createdAt) >=
                Date.parse(input.cacheWarmAuthority.expiresAt))
        : input.pollSequence !== 0 ||
          prior !== null ||
          request.requestDigest !== stage.requestProjection.requestDigest ||
          input.cacheWarmAuthority !== null) ||
    dispatch.planDigest !== intent.planDigest ||
    dispatch.repositoryCommit !== intent.repositoryCommit ||
    dispatch.attemptId !== intent.attemptId ||
    dispatch.descriptorDigest !== intent.descriptorDigest ||
    dispatch.turnIndex !== intent.turnIndex ||
    dispatch.protocolFamily !== request.protocolFamily ||
    dispatch.providerConfigurationId !== request.providerConfigurationId ||
    dispatch.modelLineageDigest !== request.modelLineageDigest ||
    dispatch.invocationId !== intent.invocationId ||
    (stage.providerResourceAuthority !== null &&
      dispatch.budgetReservationId !==
        stage.providerResourceAuthority.budgetReservationAuthority
          .reservationId) ||
    dispatch.demandDigest !== intent.ownerRequestDigest ||
    dispatch.requestDigest !== request.requestDigest ||
    dispatch.requestBodyDigest !== request.requestBodyDigest ||
    dispatch.requestBytes !== request.requestBytes ||
    Date.parse(dispatch.createdAt) < Date.parse(stage.stagedAt) ||
    Date.parse(dispatch.createdAt) >= Date.parse(stage.expiresAt) ||
    transport.protocolFamily !== dispatch.protocolFamily ||
    transport.providerConfigurationId !== dispatch.providerConfigurationId ||
    transport.invocationId !== dispatch.invocationId ||
    transport.dispatchIntentDigest !== dispatch.intentDigest ||
    transport.requestDigest !== dispatch.requestDigest ||
    transport.endpointId !== dispatch.endpointId ||
    transport.endpointClass !== dispatch.endpointClass ||
    transport.requestBodyDigest !== dispatch.requestBodyDigest ||
    transport.requestBytes !== dispatch.requestBytes ||
    response.requestDigest !== request.requestDigest ||
    response.httpStatus !== (transport.httpStatus ?? null) ||
    response.responseBodyDigest !== responseBodyDigest ||
    Date.parse(transport.startedAt) < Date.parse(dispatch.createdAt) ||
    Date.parse(transport.completedAt) < Date.parse(transport.startedAt) ||
    Date.parse(response.observedAt) < Date.parse(transport.completedAt) ||
    Date.parse(response.observedAt) >= Date.parse(stage.expiresAt) ||
    Date.parse(response.observedAt) - Date.parse(transport.completedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS ||
    Date.parse(input.executedAt) < Date.parse(response.observedAt) ||
    Date.parse(input.executedAt) >= Date.parse(stage.expiresAt) ||
    Date.parse(input.executedAt) - Date.parse(response.observedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS ||
    (response.transportOutcome === 'received'
      ? transport.dispatchState !== 'dispatched' ||
        (response.httpStatus !== null &&
        response.httpStatus >= 200 &&
        response.httpStatus <= 299
          ? transport.outcome !== 'completed'
          : transport.outcome !== 'failed')
      : transport.outcome === 'completed') ||
    (spool === null) !== (response.responseBodyDigest === null)
  ) {
    throw new TypeError(
      'Capability effect Provider execution transport binding drifted.'
    );
  }
  if (
    spool !== null &&
    (!isAgentEvaluationCapabilityEffectProviderSpoolReceipt(spool) ||
      spool.planDigest !== intent.planDigest ||
      spool.repositoryCommit !== intent.repositoryCommit ||
      spool.attemptId !== intent.attemptId ||
      spool.descriptorDigest !== intent.descriptorDigest ||
      spool.turnIndex !== intent.turnIndex ||
      spool.invocationId !== intent.invocationId ||
      spool.ownerRequestDigest !== intent.ownerRequestDigest ||
      spool.stageDigest !== stage.stageDigest ||
      spool.executionSequence !== input.pollSequence ||
      spool.dispatchIntentDigest !== dispatch.intentDigest ||
      spool.transportReceiptDigest !== transport.receiptDigest ||
      spool.responseBodyDigest !== response.responseBodyDigest ||
      spool.responseProjectionDigest !== response.projectionDigest ||
      spool.normalizedEventSetDigest !== response.normalizedEventSetDigest ||
      spool.responseDigest !== response.responseDigest ||
      spool.createdAt !== response.observedAt ||
      spool.expiresAt !== stage.expiresAt)
  ) {
    throw new TypeError(
      'Capability effect Provider execution spool binding drifted.'
    );
  }
  const executionStatus = executionStatusFor(
    response,
    stage,
    input.pollSequence,
    program
  );
  const dispatchAckBase = Object.freeze({
    format: 'prodivix.agent-evaluation-capability-effect-provider-dispatch-ack',
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    stageDigest: stage.stageDigest,
    dispatchIntentDigest: dispatch.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    resultSpoolReceiptDigest: spool?.receiptDigest ?? null,
    responseProjectionDigest: response.projectionDigest,
    pollSequence: input.pollSequence,
    priorExecutionReceiptDigest: prior?.receiptDigest ?? null,
    executionStatus,
    executedAt: input.executedAt,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    stageDigest: stage.stageDigest,
    readinessReceiptDigest: stage.readinessReceiptDigest,
    requestProjection: request,
    cacheWarmAuthority: input.cacheWarmAuthority,
    dispatchIntent: dispatch,
    transportReceipt: transport,
    resultSpoolReceipt: spool,
    responseProjection: response,
    pollSequence: input.pollSequence,
    priorExecutionReceiptDigest: prior?.receiptDigest ?? null,
    executionStatus,
    dispatchAckDigest: digestAgentCanonicalValue(dispatchAckBase),
    executedAt: input.executedAt,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Capability effect Provider execution receipt is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentEvaluationCapabilityEffectProviderExecutionReceipt = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null = null
): value is AgentEvaluationCapabilityEffectProviderExecutionReceipt => {
  if (!hasExactAgentControlKeys(value, executionKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      stageDigest: _stageDigest,
      readinessReceiptDigest: _readinessReceiptDigest,
      pollSequence,
      priorExecutionReceiptDigest,
      executionStatus: _executionStatus,
      dispatchAckDigest: _dispatchAckDigest,
      receiptDigest: _receiptDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectProviderExecutionReceipt;
    return (
      sameCanonicalJson(
        value,
        createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
          program,
          intent,
          stage,
          {
            ...input,
            pollSequence,
            priorExecutionReceipt,
          }
        )
      ) &&
      priorExecutionReceiptDigest ===
        (priorExecutionReceipt?.receiptDigest ?? null)
    );
  } catch {
    return false;
  }
};

const sharedFactDigest = (
  fact: AgentEvaluationProviderCapabilitySharedObservedFact
): CanonicalDigest => fact.factDigest;

const createBackgroundJobFact = (
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  response: AgentNativeProviderCapabilityRuntimeResponseProjection
): AgentEvaluationProviderCapabilitySharedObservedFact => {
  const source = stage.nativeSourceReceipt;
  if (
    source === null ||
    source.fact.factType !== 'provider-job-receipt' ||
    response.providerStatus === null ||
    !['cancelled', 'completed', 'failed'].includes(response.providerStatus)
  ) {
    throw new TypeError(
      'Capability effect Provider job result authority is invalid.'
    );
  }
  const prior = source.fact.value;
  const base = Object.freeze({
    providerJobId: prior.providerJobId,
    taskId: prior.taskId,
    runId: prior.runId,
    generation: prior.generation,
    invocationId: prior.invocationId,
    phase: 'terminal' as const,
    outcome: response.providerStatus as 'cancelled' | 'completed' | 'failed',
    callbackAuthority: 'revoked' as const,
  });
  const value: AgentProviderJobReceipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  const fact = Object.freeze({
    factKind: 'provider-job-receipt' as const,
    factDigest: value.receiptDigest,
    value,
  });
  if (!isAgentEvaluationProviderCapabilityObservedFact(fact)) {
    throw new TypeError('Capability effect Provider job fact is invalid.');
  }
  return fact;
};

const createContinuationFact = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  nextSealRequest: AgentNativeProviderStateVaultSealRequestProjection,
  nextSealReceipt: AgentNativeProviderStateVaultSealReceipt
): AgentEvaluationProviderCapabilitySharedObservedFact => {
  const source = stage.nativeSourceReceipt;
  if (
    source === null ||
    source.fact.factType !== 'opaque-continuation' ||
    source.source.sourceKind !== 'provider-stored-continuation' ||
    nextSealReceipt.opaqueProviderStateRef === null ||
    nextSealReceipt.expiresAt === null
  ) {
    throw new TypeError(
      'Capability effect Provider continuation authority is invalid.'
    );
  }
  const value = createAgentOpaqueContinuation({
    continuationId: `provider-continuation.${nextSealRequest.providerStateReferenceDigest.slice('sha256-'.length)}`,
    encryptedBlobRef: nextSealReceipt.opaqueProviderStateRef,
    providerConfigurationId: nextSealRequest.providerConfigurationId,
    modelLineageDigest: nextSealRequest.modelLineageDigest,
    taskId: nextSealRequest.taskId,
    runId: nextSealRequest.runId,
    generation: nextSealRequest.generation,
    parentInvocationId: intent.invocationId,
    purpose: 'provider-tool-loop-continuation',
    createdAt: nextSealRequest.observedAt,
    expiresAt: nextSealReceipt.expiresAt,
  });
  const fact = Object.freeze({
    factKind: 'opaque-continuation' as const,
    factDigest: value.continuationDigest,
    value,
  });
  if (
    fact.factDigest === source.fact.value.continuationDigest ||
    !isAgentEvaluationProviderCapabilityObservedFact(fact)
  ) {
    throw new TypeError(
      'Capability effect Provider continuation fact is invalid.'
    );
  }
  return fact;
};

const createCacheFact = (
  program: AgentCapabilityProbeProgram,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult
): AgentEvaluationProviderCapabilitySharedObservedFact => {
  const source = stage.nativeSourceReceipt;
  const usage = response.usageVector;
  if (
    source === null ||
    source.fact.factType !== 'provider-cache-receipt' ||
    source.source.sourceKind !== 'provider-cache-usage' ||
    execution.requestProjection.operation !== 'cache-warm' ||
    execution.cacheWarmAuthority === null ||
    usage === null ||
    response.projection.cachedTokenCount === null ||
    response.projection.cachedTokenCount <= 0 ||
    execution.requestProjection.cacheKeyDigest !==
      source.source.cacheKeyDigest ||
    execution.requestProjection.cachePrefixDescriptorDigest !==
      source.source.prefixDescriptorDigest
  ) {
    throw new TypeError(
      'Capability effect Provider cache result authority is invalid.'
    );
  }
  const cacheSource = source.source;
  const prefix = program.providerRequestIntent.cachePrefixResource;
  if (prefix === null || prefix === undefined) {
    throw new TypeError(
      'Capability effect Provider cache prefix authority is unavailable.'
    );
  }
  const value = createAgentProviderCacheReceipt({
    receipt: {
      cacheMode: 'prompt',
      cacheScope: cacheSource.cacheScope,
      cacheKeyDigest: cacheSource.cacheKeyDigest,
      prefixOrItemDigests: Object.freeze([prefix.prefixDigest]),
      ...(cacheSource.providerRegion === null
        ? {}
        : { providerRegion: cacheSource.providerRegion }),
      usageRef: usage.vectorDigest,
    },
    isolation: cacheSource.provenIsolation,
  });
  const fact = Object.freeze({
    factKind: 'provider-cache-receipt' as const,
    factDigest: value.receiptDigest,
    value,
  });
  if (!isAgentEvaluationProviderCapabilityObservedFact(fact)) {
    throw new TypeError('Capability effect Provider cache fact is invalid.');
  }
  return fact;
};

const createHostedRetrievalSources = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  response: AgentNativeProviderCapabilityRuntimeResponseProjection
) => {
  const citationResourceId = response.retrievalCitationResourceId;
  if (citationResourceId === null) return Object.freeze([]);
  if (
    citationResourceId !== authority.providerResourceId &&
    !authority.auxiliaryResourceIds.includes(citationResourceId)
  ) {
    throw new TypeError(
      'Capability effect hosted retrieval citation resource is foreign.'
    );
  }
  const sourceIdentityDigest = digestAgentCanonicalValue({
    requestDigest: response.requestDigest,
    responseDigest: response.responseDigest,
    citationResourceId,
  });
  return Object.freeze([
    createAgentExternalSourceResult({
      sourceResultId: `provider-citation.${sourceIdentityDigest.slice('sha256-'.length)}`,
      retrievedAt: response.observedAt,
      providerCitationRef: citationResourceId,
      availability: 'unavailable',
    }),
  ]);
};

const createRetrievalFact = (
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult
): AgentEvaluationProviderCapabilitySharedObservedFact => {
  const resource = resolveAgentCapabilityProbePublicResource(program);
  const authority = stage.providerResourceAuthority;
  const usage = response.usageVector;
  if (
    resource === null ||
    authority === null ||
    usage === null ||
    !response.projection.outputMarkerObserved
  ) {
    throw new TypeError(
      'Capability effect hosted retrieval result authority is invalid.'
    );
  }
  const sources = createHostedRetrievalSources(authority, response.projection);
  const receipt = createAgentRetrievalQueryReceipt({
    queryId: `retrieval-query.${stage.requestProjection.requestDigest.slice('sha256-'.length)}`,
    toolDescriptorDigest: digestAgentCanonicalValue({
      toolId: intent.toolId,
      runtimeFactSourceAuthorityDigest:
        intent.runtimeFactSourceAuthority.authorityDigest,
    }),
    queryDigest: resource.descriptor.queryDigest,
    purpose: 'public-research',
    networkPolicyDigest: authority.networkPolicyAuthorityDigest,
    sources,
    indexDigest: resource.descriptor.indexDigest,
    ...(sources.length === 0
      ? { retrievalConfigurationDigest: authority.authorityDigest }
      : {}),
    usageRef: `usage.${usage.vectorDigest.slice('sha256-'.length)}`,
    startedAt: execution.dispatchIntent.createdAt,
    completedAt: response.projection.observedAt,
  });
  const fact = Object.freeze({
    factKind: 'retrieval-query-receipt' as const,
    factDigest: receipt.receiptDigest,
    value: receipt,
  });
  if (!isAgentEvaluationProviderCapabilityObservedFact(fact)) {
    throw new TypeError('Capability effect hosted retrieval fact is invalid.');
  }
  return fact;
};

/** Rebuilds the terminal shared fact from journaled Provider preimages. */
export const doesAgentEvaluationCapabilityEffectProviderFactMatchContext = (
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null,
  fact: AgentEvaluationProviderCapabilitySharedObservedFact | null,
  nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null,
  nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null
): boolean => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !isAgentEvaluationCapabilityPreEffectIntent(intent) ||
    !isAgentEvaluationCapabilityEffectProviderStageRequest(
      stage,
      program,
      intent
    ) ||
    !isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
      execution,
      program,
      intent,
      stage,
      priorExecutionReceipt
    )
  ) {
    return false;
  }
  if (execution.executionStatus !== 'completed') {
    return (
      fact === null &&
      nextStateVaultSealRequest === null &&
      nextStateVaultSealReceipt === null
    );
  }
  if (fact === null || !isAgentEvaluationProviderCapabilityObservedFact(fact)) {
    return false;
  }
  try {
    switch (stage.bindingKind) {
      case 'provider-job':
        return (
          nextStateVaultSealRequest === null &&
          nextStateVaultSealReceipt === null &&
          sameCanonicalJson(
            fact,
            createBackgroundJobFact(stage, execution.responseProjection)
          )
        );
      case 'opaque-continuation':
        return (
          nextStateVaultSealRequest !== null &&
          nextStateVaultSealReceipt !== null &&
          sameCanonicalJson(
            fact,
            createContinuationFact(
              intent,
              stage,
              nextStateVaultSealRequest,
              nextStateVaultSealReceipt
            )
          )
        );
      case 'provider-cache': {
        const source = stage.nativeSourceReceipt;
        const prefix = program.providerRequestIntent.cachePrefixResource;
        const usageVectorDigest =
          execution.responseProjection.usageVectorDigest;
        if (
          source === null ||
          source.fact.factType !== 'provider-cache-receipt' ||
          source.source.sourceKind !== 'provider-cache-usage' ||
          prefix === null ||
          prefix === undefined ||
          usageVectorDigest === null ||
          execution.requestProjection.operation !== 'cache-warm' ||
          execution.cacheWarmAuthority === null ||
          nextStateVaultSealRequest !== null ||
          nextStateVaultSealReceipt !== null
        ) {
          return false;
        }
        const cacheSource = source.source;
        const value = createAgentProviderCacheReceipt({
          receipt: {
            cacheMode: 'prompt',
            cacheScope: cacheSource.cacheScope,
            cacheKeyDigest: cacheSource.cacheKeyDigest,
            prefixOrItemDigests: Object.freeze([prefix.prefixDigest]),
            ...(cacheSource.providerRegion === null
              ? {}
              : { providerRegion: cacheSource.providerRegion }),
            usageRef: usageVectorDigest,
          },
          isolation: cacheSource.provenIsolation,
        });
        return sameCanonicalJson(
          fact,
          Object.freeze({
            factKind: 'provider-cache-receipt' as const,
            factDigest: value.receiptDigest,
            value,
          })
        );
      }
      case 'hosted-retrieval-query': {
        const resource = resolveAgentCapabilityProbePublicResource(program);
        const authority = stage.providerResourceAuthority;
        const usageVectorDigest =
          execution.responseProjection.usageVectorDigest;
        if (
          resource === null ||
          authority === null ||
          usageVectorDigest === null ||
          !execution.responseProjection.outputMarkerObserved ||
          nextStateVaultSealRequest !== null ||
          nextStateVaultSealReceipt !== null
        ) {
          return false;
        }
        const sources = createHostedRetrievalSources(
          authority,
          execution.responseProjection
        );
        const value = createAgentRetrievalQueryReceipt({
          queryId: `retrieval-query.${stage.requestProjection.requestDigest.slice('sha256-'.length)}`,
          toolDescriptorDigest: digestAgentCanonicalValue({
            toolId: intent.toolId,
            runtimeFactSourceAuthorityDigest:
              intent.runtimeFactSourceAuthority.authorityDigest,
          }),
          queryDigest: resource.descriptor.queryDigest,
          purpose: 'public-research',
          networkPolicyDigest: authority.networkPolicyAuthorityDigest,
          sources,
          indexDigest: resource.descriptor.indexDigest,
          ...(sources.length === 0
            ? { retrievalConfigurationDigest: authority.authorityDigest }
            : {}),
          usageRef: `usage.${usageVectorDigest.slice('sha256-'.length)}`,
          startedAt: execution.dispatchIntent.createdAt,
          completedAt: execution.responseProjection.observedAt,
        });
        return sameCanonicalJson(
          fact,
          Object.freeze({
            factKind: 'retrieval-query-receipt' as const,
            factDigest: value.receiptDigest,
            value,
          })
        );
      }
    }
  } catch {
    return false;
  }
};

const createBusinessResult = (
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult
): AgentEvaluationCapabilityEffectProviderBusinessResult => {
  const usage = response.usageVector;
  let usageMatchesProjection =
    (usage === null) === (response.projection.usageVectorDigest === null);
  if (usage !== null) {
    try {
      usageMatchesProjection =
        sameCanonicalJson(usage, createAgentUsageVector(usage.amounts)) &&
        usage.vectorDigest === response.projection.usageVectorDigest;
    } catch {
      usageMatchesProjection = false;
    }
  }
  const callbackLocalProviderStateHandle =
    response.callbackLocalProviderStateHandle;
  const stateHandleMatchesProjection =
    callbackLocalProviderStateHandle === null
      ? response.projection.providerStateReferenceDigest === null
      : response.projection.providerStateReferenceKind !== null &&
        digestAgentNativeProviderStateReference(
          response.projection.providerStateReferenceKind,
          callbackLocalProviderStateHandle
        ) === response.projection.providerStateReferenceDigest;
  if (
    execution.executionStatus === 'in-progress' ||
    !usageMatchesProjection ||
    !stateHandleMatchesProjection ||
    !sameCanonicalJson(response.projection, execution.responseProjection) ||
    (response.callbackLocalOutputText === null) !==
      (response.projection.outputTextDigest === null) ||
    (response.callbackLocalOutputText !== null &&
      digestAgentCanonicalValue({ text: response.callbackLocalOutputText }) !==
        response.projection.outputTextDigest)
  ) {
    throw new TypeError(
      'Capability effect Provider business result projection drifted.'
    );
  }
  const status = execution.executionStatus as
    'completed' | 'failed' | 'unavailable';
  const base = Object.freeze({
    status,
    providerStatus: response.projection.providerStatus,
    outputText: response.callbackLocalOutputText,
    responseDigest: response.projection.responseDigest,
  });
  const result = Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      result,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Capability effect Provider business result is unsafe or unbounded.'
    );
  }
  return result;
};

export const createAgentEvaluationCapabilityEffectProviderRuntimeResult = (
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  input: Readonly<{
    response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult;
    priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null;
    stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
    stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
    nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    sealedAt: Instant;
  }>
): AgentEvaluationCapabilityEffectProviderRuntimeResult => {
  if (
    !isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
      execution,
      program,
      intent,
      stage,
      input.priorExecutionReceipt
    ) ||
    execution.executionStatus === 'in-progress' ||
    !hasExactAgentControlKeys(input, [
      'response',
      'priorExecutionReceipt',
      'stateVaultRetireRequest',
      'stateVaultRetirementReceipt',
      'nextStateVaultSealRequest',
      'nextStateVaultSealReceipt',
      'sealedAt',
    ]) ||
    !isAgentControlInstant(input.sealedAt) ||
    Date.parse(input.sealedAt) < Date.parse(execution.executedAt) ||
    Date.parse(input.sealedAt) >= Date.parse(stage.expiresAt) ||
    Date.parse(input.sealedAt) - Date.parse(execution.executedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS
  ) {
    throw new TypeError(
      'Capability effect Provider result seal input is invalid.'
    );
  }
  const stateful =
    stage.bindingKind === 'provider-job' ||
    stage.bindingKind === 'opaque-continuation';
  const producesContinuation =
    stage.bindingKind === 'opaque-continuation' &&
    execution.executionStatus === 'completed';
  if (stateful) {
    const binding = intent.inputAuthorityBinding;
    const retireRequest = input.stateVaultRetireRequest;
    const retirementReceipt = input.stateVaultRetirementReceipt;
    if (
      binding.stateVaultSealRequest === null ||
      binding.stateVaultSealReceipt === null ||
      retireRequest === null ||
      retirementReceipt === null ||
      !isAgentNativeProviderStateVaultRetireRequest(retireRequest) ||
      !isAgentNativeProviderStateVaultRetirementReceipt(
        retirementReceipt,
        retireRequest,
        binding.stateVaultSealRequest,
        binding.stateVaultSealReceipt
      ) ||
      !isAgentNativeProviderStateVaultRetirementPolicyCompliant(
        retirementReceipt
      ) ||
      retireRequest.resolveReceiptDigest !==
        stage.stateVaultResolveReceipt?.receiptDigest ||
      Date.parse(retirementReceipt.retiredAt) > Date.parse(input.sealedAt) ||
      retireRequest.disposition !== 'consumed'
    ) {
      throw new TypeError(
        'Capability effect Provider result retirement authority drifted.'
      );
    }
  } else if (
    input.stateVaultRetireRequest !== null ||
    input.stateVaultRetirementReceipt !== null
  ) {
    throw new TypeError(
      'Hosted retrieval cannot carry state vault retirement authority.'
    );
  }
  const nextSealRequest = input.nextStateVaultSealRequest;
  const nextSealReceipt = input.nextStateVaultSealReceipt;
  if (producesContinuation) {
    const priorSource = stage.nativeSourceReceipt?.source;
    const response = input.response.projection;
    const priorRetirement = input.stateVaultRetirementReceipt;
    const priorSealRequest = intent.inputAuthorityBinding.stateVaultSealRequest;
    if (
      priorSource?.sourceKind !== 'provider-stored-continuation' ||
      priorSealRequest === null ||
      priorRetirement === null ||
      nextSealRequest === null ||
      nextSealReceipt === null ||
      !isAgentNativeProviderStateVaultSealRequest(nextSealRequest) ||
      !isAgentNativeProviderStateVaultSealReceipt(
        nextSealReceipt,
        nextSealRequest
      ) ||
      nextSealReceipt.status !== 'sealed' ||
      nextSealRequest.authorityDigest !== priorSealRequest.authorityDigest ||
      nextSealRequest.purpose !== 'reasoning-continuation-state' ||
      nextSealRequest.attemptId !== intent.attemptId ||
      nextSealRequest.protocolFamily !==
        stage.requestProjection.protocolFamily ||
      nextSealRequest.providerStateReferenceKind !==
        response.providerStateReferenceKind ||
      nextSealRequest.providerStateReferenceDigest !==
        response.providerStateReferenceDigest ||
      nextSealRequest.probeProgramDigest !== program.programDigest ||
      nextSealRequest.capabilityProfileDigest !==
        program.profileProjection.capabilityProfileDigest ||
      nextSealRequest.invocationId !== intent.invocationId ||
      nextSealRequest.requestDigest !==
        execution.requestProjection.requestDigest ||
      nextSealRequest.responseDigest !== response.responseDigest ||
      nextSealRequest.responseBodyDigest !== response.responseBodyDigest ||
      nextSealRequest.sealedResponseJsonDigest !==
        response.sealedResponseJsonDigest ||
      nextSealRequest.providerConfigurationId !==
        execution.requestProjection.providerConfigurationId ||
      nextSealRequest.modelLineageDigest !==
        execution.requestProjection.modelLineageDigest ||
      nextSealRequest.adapterDigest !==
        execution.requestProjection.adapterDigest ||
      nextSealRequest.taskId !== priorSource.taskId ||
      nextSealRequest.runId !== priorSource.runId ||
      nextSealRequest.generation !== priorSource.generation + 1 ||
      nextSealRequest.observedAt !== response.observedAt ||
      Date.parse(nextSealReceipt.sealedAt) < Date.parse(response.observedAt) ||
      Date.parse(nextSealReceipt.sealedAt) >= Date.parse(stage.expiresAt) ||
      Date.parse(nextSealReceipt.sealedAt) >
        Date.parse(priorRetirement.retiredAt) ||
      Date.parse(nextSealReceipt.sealedAt) > Date.parse(input.sealedAt)
    ) {
      throw new TypeError(
        'Capability effect Provider continuation rotation authority drifted.'
      );
    }
  } else if (nextSealRequest !== null || nextSealReceipt !== null) {
    throw new TypeError(
      'Capability effect Provider result carried an unexpected next vault state.'
    );
  }
  const businessResult = createBusinessResult(execution, input.response);
  const fact =
    execution.executionStatus !== 'completed'
      ? null
      : stage.bindingKind === 'provider-job'
        ? createBackgroundJobFact(stage, input.response.projection)
        : stage.bindingKind === 'opaque-continuation'
          ? createContinuationFact(
              intent,
              stage,
              nextSealRequest!,
              nextSealReceipt!
            )
          : stage.bindingKind === 'provider-cache'
            ? createCacheFact(program, stage, execution, input.response)
            : createRetrievalFact(
                program,
                intent,
                stage,
                execution,
                input.response
              );
  if (
    !doesAgentEvaluationCapabilityEffectProviderFactMatchContext(
      program,
      intent,
      stage,
      execution,
      input.priorExecutionReceipt,
      fact,
      input.nextStateVaultSealRequest,
      input.nextStateVaultSealReceipt
    )
  ) {
    throw new TypeError(
      'Capability effect Provider fact drifted from terminal preimages.'
    );
  }
  const resultStatus =
    execution.executionStatus === 'completed'
      ? ('produced' as const)
      : execution.executionStatus;
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION,
    stageDigest: stage.stageDigest,
    executionReceiptDigest: execution.receiptDigest,
    readinessReceiptDigest: stage.readinessReceiptDigest,
    resultStatus,
    businessResultDigest: businessResult.resultDigest,
    sourceFactKind: fact?.factKind ?? null,
    sourceFactDigest: fact === null ? null : sharedFactDigest(fact),
    stateVaultRetireRequestDigest:
      input.stateVaultRetireRequest?.retireRequestDigest ?? null,
    stateVaultRetirementReceiptDigest:
      input.stateVaultRetirementReceipt?.receiptDigest ?? null,
    nextStateVaultSealRequestDigest:
      input.nextStateVaultSealRequest?.sealRequestDigest ?? null,
    nextStateVaultSealReceiptDigest:
      input.nextStateVaultSealReceipt?.receiptDigest ?? null,
    providerResourceSetCommitmentDigest:
      stage.providerResourceSetCommitment?.commitmentDigest ?? null,
    providerResourceAuthorityDigest:
      stage.providerResourceAuthority?.authorityDigest ?? null,
    providerResourceReadRequestDigest:
      stage.providerResourceReadRequest?.requestDigest ?? null,
    providerResourceReadReceiptDigest:
      stage.providerResourceReadReceipt?.receiptDigest ?? null,
    consumedInputSourceFactDigest:
      stage.bindingKind !== 'hosted-retrieval-query'
        ? sourceReceiptFactDigest(stage.nativeSourceReceipt!)
        : null,
    sealedAt: input.sealedAt,
  });
  const resultSealReceipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      resultSealReceipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Capability effect Provider result seal is unsafe or unbounded.'
    );
  }
  return Object.freeze({ businessResult, fact, resultSealReceipt });
};

export const isAgentEvaluationCapabilityEffectProviderResultSealReceipt = (
  value: unknown,
  stage: AgentEvaluationCapabilityEffectProviderStageRequest,
  execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  fact: AgentEvaluationProviderCapabilitySharedObservedFact | null
): value is AgentEvaluationCapabilityEffectProviderResultSealReceipt => {
  if (!hasExactAgentControlKeys(value, resultSealKeys)) return false;
  const receipt =
    value as AgentEvaluationCapabilityEffectProviderResultSealReceipt;
  const { receiptDigest, ...base } = receipt;
  const expectedStatus =
    execution.executionStatus === 'completed'
      ? 'produced'
      : execution.executionStatus;
  if (expectedStatus === 'in-progress') return false;
  const stateful =
    stage.bindingKind === 'provider-job' ||
    stage.bindingKind === 'opaque-continuation';
  const consumesSource = stage.bindingKind !== 'hosted-retrieval-query';
  const continuationProduced =
    stage.bindingKind === 'opaque-continuation' &&
    expectedStatus === 'produced';
  return (
    receipt.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_FORMAT &&
    receipt.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION &&
    receipt.stageDigest === stage.stageDigest &&
    receipt.executionReceiptDigest === execution.receiptDigest &&
    receipt.readinessReceiptDigest === stage.readinessReceiptDigest &&
    receipt.resultStatus === expectedStatus &&
    isAgentCanonicalDigest(receipt.businessResultDigest) &&
    receipt.sourceFactKind === (fact?.factKind ?? null) &&
    receipt.sourceFactDigest === (fact?.factDigest ?? null) &&
    (receipt.stateVaultRetireRequestDigest === null ||
      isAgentCanonicalDigest(receipt.stateVaultRetireRequestDigest)) &&
    (receipt.stateVaultRetirementReceiptDigest === null ||
      isAgentCanonicalDigest(receipt.stateVaultRetirementReceiptDigest)) &&
    (receipt.nextStateVaultSealRequestDigest === null ||
      isAgentCanonicalDigest(receipt.nextStateVaultSealRequestDigest)) &&
    (receipt.nextStateVaultSealReceiptDigest === null ||
      isAgentCanonicalDigest(receipt.nextStateVaultSealReceiptDigest)) &&
    (receipt.providerResourceSetCommitmentDigest === null ||
      isAgentCanonicalDigest(receipt.providerResourceSetCommitmentDigest)) &&
    (receipt.providerResourceAuthorityDigest === null ||
      isAgentCanonicalDigest(receipt.providerResourceAuthorityDigest)) &&
    (receipt.providerResourceReadRequestDigest === null ||
      isAgentCanonicalDigest(receipt.providerResourceReadRequestDigest)) &&
    (receipt.providerResourceReadReceiptDigest === null ||
      isAgentCanonicalDigest(receipt.providerResourceReadReceiptDigest)) &&
    (stateful
      ? receipt.stateVaultRetireRequestDigest !== null &&
        receipt.stateVaultRetirementReceiptDigest !== null
      : receipt.stateVaultRetireRequestDigest === null &&
        receipt.stateVaultRetirementReceiptDigest === null) &&
    (continuationProduced
      ? receipt.nextStateVaultSealRequestDigest !== null &&
        receipt.nextStateVaultSealReceiptDigest !== null
      : receipt.nextStateVaultSealRequestDigest === null &&
        receipt.nextStateVaultSealReceiptDigest === null) &&
    receipt.providerResourceAuthorityDigest ===
      (stage.providerResourceAuthority?.authorityDigest ?? null) &&
    receipt.providerResourceSetCommitmentDigest ===
      (stage.providerResourceSetCommitment?.commitmentDigest ?? null) &&
    receipt.providerResourceReadRequestDigest ===
      (stage.providerResourceReadRequest?.requestDigest ?? null) &&
    receipt.providerResourceReadReceiptDigest ===
      (stage.providerResourceReadReceipt?.receiptDigest ?? null) &&
    receipt.consumedInputSourceFactDigest ===
      (consumesSource
        ? sourceReceiptFactDigest(stage.nativeSourceReceipt!)
        : null) &&
    isAgentControlInstant(receipt.sealedAt) &&
    isAgentCanonicalDigest(receiptDigest) &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_MAXIMUM_BYTES
    )
  );
};

export const isAgentEvaluationCapabilityEffectProviderResultSealReceiptSelf = (
  value: unknown
): value is AgentEvaluationCapabilityEffectProviderResultSealReceipt => {
  if (!hasExactAgentControlKeys(value, resultSealKeys)) return false;
  const receipt =
    value as AgentEvaluationCapabilityEffectProviderResultSealReceipt;
  const { receiptDigest, ...base } = receipt;
  const nullableDigests = [
    receipt.sourceFactDigest,
    receipt.stateVaultRetireRequestDigest,
    receipt.stateVaultRetirementReceiptDigest,
    receipt.nextStateVaultSealRequestDigest,
    receipt.nextStateVaultSealReceiptDigest,
    receipt.providerResourceSetCommitmentDigest,
    receipt.providerResourceAuthorityDigest,
    receipt.providerResourceReadRequestDigest,
    receipt.providerResourceReadReceiptDigest,
    receipt.consumedInputSourceFactDigest,
  ];
  return (
    receipt.format ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_FORMAT &&
    receipt.version ===
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_VERSION &&
    [
      receipt.stageDigest,
      receipt.executionReceiptDigest,
      receipt.readinessReceiptDigest,
      receipt.businessResultDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    nullableDigests.every(
      (digest) => digest === null || isAgentCanonicalDigest(digest)
    ) &&
    ['failed', 'produced', 'unavailable'].includes(receipt.resultStatus) &&
    (receipt.sourceFactKind === null ||
      [
        'opaque-continuation',
        'provider-cache-receipt',
        'provider-job-receipt',
        'retrieval-query-receipt',
      ].includes(receipt.sourceFactKind)) &&
    (receipt.sourceFactKind === null) === (receipt.sourceFactDigest === null) &&
    (receipt.resultStatus === 'produced') ===
      (receipt.sourceFactKind !== null) &&
    (receipt.stateVaultRetireRequestDigest === null) ===
      (receipt.stateVaultRetirementReceiptDigest === null) &&
    (receipt.nextStateVaultSealRequestDigest === null) ===
      (receipt.nextStateVaultSealReceiptDigest === null) &&
    (receipt.sourceFactKind === 'opaque-continuation') ===
      (receipt.nextStateVaultSealRequestDigest !== null) &&
    (receipt.providerResourceSetCommitmentDigest === null) ===
      (receipt.providerResourceAuthorityDigest === null) &&
    (receipt.providerResourceSetCommitmentDigest === null) ===
      (receipt.providerResourceReadRequestDigest === null) &&
    (receipt.providerResourceSetCommitmentDigest === null) ===
      (receipt.providerResourceReadReceiptDigest === null) &&
    (receipt.consumedInputSourceFactDigest === null) ===
      (receipt.providerResourceSetCommitmentDigest !== null) &&
    isAgentControlInstant(receipt.sealedAt) &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RESULT_SEAL_MAXIMUM_BYTES
    )
  );
};

/**
 * O(1) durable lookup key used before issuing another request ref. A matching
 * result seal proves that the source fact's vault state was retired and must
 * never be resolved or issued again, even when the proof fact remains in the
 * final observation for grading.
 */
export const doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource =
  (
    resultSeal: AgentEvaluationCapabilityEffectProviderResultSealReceipt,
    registryReceipt: AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt
  ): boolean =>
    resultSeal.consumedInputSourceFactDigest !== null &&
    resultSeal.consumedInputSourceFactDigest ===
      registryReceipt.sourceHandleDigest;

/**
 * Resolves the only prior-source state that may drive request-ref issuance.
 * The caller must perform an O(1) durable lookup for a consumed result seal;
 * a terminal/revoked job and a consumed continuation can never be reissued.
 */
export const resolveAgentEvaluationCapabilityEffectPriorSourceDisposition = (
  registryReceipt: AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  sourceFact: AgentEvaluationProviderCapabilitySharedObservedFact,
  consumedResultSeal: AgentEvaluationCapabilityEffectProviderResultSealReceipt | null
): AgentEvaluationCapabilityEffectPriorSourceDisposition => {
  if (
    !isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(
      registryReceipt
    ) ||
    !isAgentEvaluationProviderCapabilityObservedFact(sourceFact) ||
    sourceFact.factDigest !== registryReceipt.sourceHandleDigest ||
    sourceFact.factKind !== registryReceipt.sourceFactKind ||
    registryReceipt.bindingKind === 'hosted-retrieval-query'
  ) {
    throw new TypeError(
      'Capability effect prior-source lookup binding drifted.'
    );
  }
  if (consumedResultSeal !== null) {
    if (
      !isAgentEvaluationCapabilityEffectProviderResultSealReceiptSelf(
        consumedResultSeal
      ) ||
      !doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource(
        consumedResultSeal,
        registryReceipt
      )
    ) {
      throw new TypeError(
        'Capability effect consumed-source lookup returned a mismatched result seal.'
      );
    }
    return 'consumed';
  }
  if (sourceFact.factKind === 'provider-job-receipt') {
    const job = sourceFact.value;
    return job.callbackAuthority === 'active' &&
      ['accepted', 'running', 'submitting'].includes(job.phase) &&
      job.outcome === undefined
      ? 'active'
      : 'unavailable-or-terminal';
  }
  if (
    sourceFact.factKind === 'opaque-continuation' ||
    sourceFact.factKind === 'provider-cache-receipt'
  ) {
    return 'active';
  }
  throw new TypeError(
    'Capability effect prior-source fact cannot issue a later-turn request ref.'
  );
};

export const assertAgentEvaluationCapabilityEffectInputSourceAvailable = (
  registryReceipt: AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  consumedResultSeal: AgentEvaluationCapabilityEffectProviderResultSealReceipt | null
): void => {
  if (
    !isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(
      registryReceipt
    )
  ) {
    throw new TypeError('Capability effect input-source registry is invalid.');
  }
  if (consumedResultSeal === null) return;
  if (
    !isAgentEvaluationCapabilityEffectProviderResultSealReceiptSelf(
      consumedResultSeal
    ) ||
    !doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource(
      consumedResultSeal,
      registryReceipt
    )
  ) {
    throw new TypeError(
      'Capability effect consumed-source lookup returned a mismatched result seal.'
    );
  }
  throw new TypeError(
    'Capability effect input source was already consumed and cannot be reissued.'
  );
};

const reconcileExact = <T>(
  persisted: T | null,
  returned: T,
  valid: (value: T) => boolean,
  label: string
): T => {
  if (!valid(returned)) {
    throw new TypeError(`Returned ${label} is invalid.`);
  }
  if (persisted === null) return returned;
  if (!valid(persisted) || !sameCanonicalJson(persisted, returned)) {
    throw new TypeError(`${label} ACK-loss reconciliation detected drift.`);
  }
  return persisted;
};

export const reconcileAgentEvaluationCapabilityEffectProviderStageRequest = (
  persisted: AgentEvaluationCapabilityEffectProviderStageRequest | null,
  returned: AgentEvaluationCapabilityEffectProviderStageRequest,
  program: AgentCapabilityProbeProgram,
  intent: AgentEvaluationCapabilityPreEffectIntent
): AgentEvaluationCapabilityEffectProviderStageRequest =>
  reconcileExact(
    persisted,
    returned,
    (value) =>
      isAgentEvaluationCapabilityEffectProviderStageRequest(
        value,
        program,
        intent
      ),
    'capability effect Provider stage request'
  );

export const reconcileAgentEvaluationCapabilityEffectProviderExecutionReceipt =
  (
    persisted: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null,
    returned: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
    program: AgentCapabilityProbeProgram,
    intent: AgentEvaluationCapabilityPreEffectIntent,
    stage: AgentEvaluationCapabilityEffectProviderStageRequest,
    priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null = null
  ): AgentEvaluationCapabilityEffectProviderExecutionReceipt =>
    reconcileExact(
      persisted,
      returned,
      (value) =>
        isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
          value,
          program,
          intent,
          stage,
          priorExecutionReceipt
        ),
      'capability effect Provider execution receipt'
    );

export const reconcileAgentEvaluationCapabilityEffectProviderResultSealReceipt =
  (
    persisted: AgentEvaluationCapabilityEffectProviderResultSealReceipt | null,
    returned: AgentEvaluationCapabilityEffectProviderResultSealReceipt,
    stage: AgentEvaluationCapabilityEffectProviderStageRequest,
    execution: AgentEvaluationCapabilityEffectProviderExecutionReceipt,
    fact: AgentEvaluationProviderCapabilitySharedObservedFact | null
  ): AgentEvaluationCapabilityEffectProviderResultSealReceipt =>
    reconcileExact(
      persisted,
      returned,
      (value) =>
        isAgentEvaluationCapabilityEffectProviderResultSealReceipt(
          value,
          stage,
          execution,
          fact
        ),
      'capability effect Provider result seal receipt'
    );
