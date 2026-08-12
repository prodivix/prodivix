import { sameCanonicalJson } from '@prodivix/shared/canonical';
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
import type { AgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluation.types';
import type { AgentEvaluationInvocationMaterial } from './agentEvaluationCorpusMaterial.types';
import {
  isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  isAgentNativeProviderCapabilityRuntimeRequestProjection,
  isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf,
  resolveAgentNativeProviderCapabilityRuntimeProgram,
  type AgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  type AgentNativeProviderCapabilityRuntimeRequestProjection,
} from '../providers/agentNativeProviderCapabilityRuntime';
import {
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import {
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultResolveRequest,
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
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';

export const AGENT_EVALUATION_CAPABILITY_PRE_EFFECT_INTENT_FORMAT =
  'prodivix.agent-evaluation-capability-pre-effect-intent' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_SOURCE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-source-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_OWNER_REQUEST_IDENTITY_FORMAT =
  'prodivix.agent-evaluation-capability-effect-owner-request-identity' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_BINDING_FORMAT =
  'prodivix.agent-evaluation-capability-effect-input-authority-binding' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-input-authority-registry-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-request-ref-authority-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_ISSUANCE_DECISION_FORMAT =
  'prodivix.agent-evaluation-capability-effect-request-ref-issuance-decision' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_INVOCATION_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-capability-effect-bootstrap-invocation-authority' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_PROVIDER_REQUEST_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-capability-effect-bootstrap-provider-request-authority' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION = 1 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_PER_TURN =
  4 as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_PER_ATTEMPT =
  7 * AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_PER_TURN;

export type AgentEvaluationCapabilityEffectSourceFactKind =
  | 'opaque-continuation'
  | 'provider-cache-receipt'
  | 'provider-job-receipt'
  | 'retrieval-query-receipt';

export type AgentEvaluationCapabilityEffectInputBindingKind =
  | 'hosted-retrieval-query'
  | 'opaque-continuation'
  | 'provider-cache'
  | 'provider-job';

export type AgentEvaluationCapabilityEffectInputSourceFactKind =
  AgentEvaluationCapabilityEffectSourceFactKind | 'provider-event';

export type AgentEvaluationCapabilityEffectPriorSourceDisposition =
  'active' | 'consumed' | 'unavailable-or-terminal';

export type AgentEvaluationCapabilityEffectRequestRefIssuanceDecision =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_ISSUANCE_DECISION_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
    bindingKind: AgentEvaluationCapabilityEffectInputBindingKind;
    sourceLifecycle:
      'current-closed-provider-transport' | 'prior-sealed-provider-observation';
    turnIndex: number;
    priorSourceTurnIndex: number | null;
    priorSourceObservationReceiptDigest: CanonicalDigest | null;
    priorSourceDisposition: AgentEvaluationCapabilityEffectPriorSourceDisposition | null;
    priorEffectResultSealReceiptDigest: CanonicalDigest | null;
    disposition:
      | 'bootstrap-provider-source'
      | 'continue-after-consumed-effect'
      | 'issue-request-ref'
      | 'source-unavailable';
    zeroToolCallDisposition:
      | 'continue-without-shared-tool'
      | 'grade-unavailable'
      | 'schema-failed'
      | 'seal-observation-and-continue';
    decisionDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationCapabilityEffectRequestRefIssuanceDecisionInput =
  Readonly<{
    bindingKind: AgentEvaluationCapabilityEffectInputBindingKind;
    turnIndex: number;
    priorSourceTurnIndex: number | null;
    priorSourceObservationReceiptDigest: CanonicalDigest | null;
    priorSourceDisposition: AgentEvaluationCapabilityEffectPriorSourceDisposition | null;
    priorEffectResultSealReceiptDigest: CanonicalDigest | null;
  }>;

export type AgentEvaluationCapabilityEffectBootstrapInvocationAuthority =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_INVOCATION_AUTHORITY_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
    bindingKind: Exclude<
      AgentEvaluationCapabilityEffectInputBindingKind,
      'hosted-retrieval-query'
    >;
    turnIndex: 0;
    decisionDigest: CanonicalDigest;
    omittedToolIds: readonly string[];
    remainingToolIds: readonly string[];
    providerToolEncoding: 'omit-tools-and-tool-choice';
    sourceInvocationMaterialDigest: CanonicalDigest;
    specializedInvocationMaterialDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectBootstrapInvocationMaterial =
  Readonly<{
    invocation: AgentEvaluationInvocationMaterial;
    authority: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  }>;

export type AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_PROVIDER_REQUEST_AUTHORITY_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
    bindingKind: Exclude<
      AgentEvaluationCapabilityEffectInputBindingKind,
      'hosted-retrieval-query'
    >;
    turnIndex: 0;
    decisionDigest: CanonicalDigest;
    invocationMaterialAuthorityDigest: CanonicalDigest;
    providerRequestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
    providerRequestProjectionDigest: CanonicalDigest;
    cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null;
    cacheWarmAuthorityDigest: CanonicalDigest | null;
    requestBodyDigest: CanonicalDigest;
    requestDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityEffectToolArguments = Readonly<{
  requestRef: string;
  targetRef: string;
}>;

export type AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    turnIndex: number;
    invocationId: string;
    bindingKind: AgentEvaluationCapabilityEffectInputBindingKind;
    capabilityId:
      | 'provider.background-job'
      | 'provider.hosted-retrieval'
      | 'provider.isolated-cache'
      | 'provider.reasoning-continuation';
    toolId: string;
    targetRef: string;
    protocolFamily:
      'anthropic-messages' | 'gemini-interactions' | 'openai-responses';
    providerConfigurationId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    runtimeFactSourceAuthorityDigest: CanonicalDigest;
    registrationReceiptDigest: CanonicalDigest;
    issuedAt: Instant;
    expiresAt: Instant;
    authorityDigest: CanonicalDigest;
    requestRef: string;
    receiptDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationCapabilityEffectRequestRefAuthorityReceiptInput =
  Omit<
    AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
    'format' | 'version' | 'authorityDigest' | 'requestRef' | 'receiptDigest'
  >;

export type AgentEvaluationCapabilityEffectInputAuthorityBinding = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_BINDING_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
  bindingKind: AgentEvaluationCapabilityEffectInputBindingKind;
  capabilityId:
    | 'provider.background-job'
    | 'provider.hosted-retrieval'
    | 'provider.isolated-cache'
    | 'provider.reasoning-continuation';
  requestRef: string;
  targetRef: string;
  requestRefAuthority: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt;
  requestRefAuthorityReceiptDigest: CanonicalDigest;
  sourceAttemptId: string;
  sourceTurnIndex: number;
  sourceInvocationId: string;
  sourceProviderRequestDigest: CanonicalDigest;
  sourceResponseDigest: CanonicalDigest;
  sourceDispatchIntentDigest: CanonicalDigest;
  sourceTransportReceiptDigest: CanonicalDigest;
  sourceResultSpoolReceiptDigest: CanonicalDigest;
  sourceNormalizedEventSetDigest: CanonicalDigest;
  sourceObservationReceiptDigest: CanonicalDigest | null;
  sourceFactKind: AgentEvaluationCapabilityEffectInputSourceFactKind;
  sourceProviderEventType: 'tool-call' | null;
  sourceProviderToolCallId: string | null;
  sourceToolId: string | null;
  sourceArgumentsDigest: CanonicalDigest | null;
  /** Digest of the selected observed fact/event; Provider state has its own sealed digest. */
  sourceHandleDigest: CanonicalDigest;
  stateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
  stateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
  protocolFamily:
    'anthropic-messages' | 'gemini-interactions' | 'openai-responses';
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  sourceRegistryReceiptDigest: CanonicalDigest;
  bindingDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectInputAuthorityBindingInput =
  Omit<
    AgentEvaluationCapabilityEffectInputAuthorityBinding,
    'format' | 'version' | 'bindingDigest'
  >;

export type AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt =
  Readonly<
    Omit<
      AgentEvaluationCapabilityEffectInputAuthorityBinding,
      'format' | 'version' | 'sourceRegistryReceiptDigest' | 'bindingDigest'
    > & {
      format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RECEIPT_FORMAT;
      version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
      receiptDigest: CanonicalDigest;
    }
  >;

export type CreateAgentEvaluationCapabilityEffectInputAuthorityRegistryReceiptInput =
  Omit<
    AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
    'format' | 'version' | 'receiptDigest'
  >;

const capabilityEffectInputBindingProfiles = Object.freeze({
  'hosted-retrieval-query': Object.freeze({
    capabilityId: 'provider.hosted-retrieval' as const,
    toolId: 'provider.retrieval.search' as const,
    sourceFactKind: 'provider-event' as const,
    sourceProviderEventType: 'tool-call' as const,
  }),
  'opaque-continuation': Object.freeze({
    capabilityId: 'provider.reasoning-continuation' as const,
    toolId: 'provider.continuation.resume' as const,
    sourceFactKind: 'opaque-continuation' as const,
    sourceProviderEventType: null,
  }),
  'provider-cache': Object.freeze({
    capabilityId: 'provider.isolated-cache' as const,
    toolId: 'provider.cache.inspect' as const,
    sourceFactKind: 'provider-cache-receipt' as const,
    sourceProviderEventType: null,
  }),
  'provider-job': Object.freeze({
    capabilityId: 'provider.background-job' as const,
    toolId: 'provider.background-job.poll' as const,
    sourceFactKind: 'provider-job-receipt' as const,
    sourceProviderEventType: null,
  }),
});

export const isAgentEvaluationCapabilityEffectInputBindingKind = (
  value: unknown
): value is AgentEvaluationCapabilityEffectInputBindingKind =>
  typeof value === 'string' &&
  Object.hasOwn(capabilityEffectInputBindingProfiles, value);

/**
 * Freezes the clean-run two-stage rule. Retrieval preissues a visible handle
 * and joins the current closed tool-call event. Other shared effects first
 * seal a Provider source fact, then expose the exact ref on a later turn.
 */
export const createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision = (
  input: CreateAgentEvaluationCapabilityEffectRequestRefIssuanceDecisionInput
): AgentEvaluationCapabilityEffectRequestRefIssuanceDecision => {
  const profile = capabilityEffectInputBindingProfiles[input.bindingKind];
  const retrieval = input.bindingKind === 'hosted-retrieval-query';
  const hasPriorSource =
    input.priorSourceTurnIndex !== null &&
    input.priorSourceObservationReceiptDigest !== null;
  if (
    !hasExactAgentControlKeys(input, [
      'bindingKind',
      'turnIndex',
      'priorSourceTurnIndex',
      'priorSourceObservationReceiptDigest',
      'priorSourceDisposition',
      'priorEffectResultSealReceiptDigest',
    ]) ||
    !profile ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= 7 ||
    (input.priorSourceTurnIndex === null) !==
      (input.priorSourceObservationReceiptDigest === null) ||
    hasPriorSource !== (input.priorSourceDisposition !== null) ||
    ![null, 'active', 'consumed', 'unavailable-or-terminal'].includes(
      input.priorSourceDisposition
    ) ||
    (input.priorSourceDisposition === 'consumed') !==
      (input.priorEffectResultSealReceiptDigest !== null) ||
    (input.priorEffectResultSealReceiptDigest !== null &&
      !isAgentCanonicalDigest(input.priorEffectResultSealReceiptDigest)) ||
    (hasPriorSource &&
      (!Number.isSafeInteger(input.priorSourceTurnIndex) ||
        input.priorSourceTurnIndex! < 0 ||
        input.priorSourceTurnIndex! >= input.turnIndex ||
        !isAgentCanonicalDigest(input.priorSourceObservationReceiptDigest))) ||
    (retrieval &&
      (hasPriorSource || input.priorEffectResultSealReceiptDigest !== null))
  ) {
    throw new TypeError(
      'Capability effect request-ref issuance input is invalid.'
    );
  }
  const disposition = retrieval
    ? ('issue-request-ref' as const)
    : input.priorSourceDisposition === 'active'
      ? ('issue-request-ref' as const)
      : input.priorSourceDisposition === 'consumed'
        ? ('continue-after-consumed-effect' as const)
        : input.turnIndex === 0
          ? ('bootstrap-provider-source' as const)
          : ('source-unavailable' as const);
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_ISSUANCE_DECISION_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    bindingKind: input.bindingKind,
    sourceLifecycle: retrieval
      ? ('current-closed-provider-transport' as const)
      : ('prior-sealed-provider-observation' as const),
    turnIndex: input.turnIndex,
    priorSourceTurnIndex: input.priorSourceTurnIndex,
    priorSourceObservationReceiptDigest:
      input.priorSourceObservationReceiptDigest,
    priorSourceDisposition: input.priorSourceDisposition,
    priorEffectResultSealReceiptDigest:
      input.priorEffectResultSealReceiptDigest,
    disposition,
    zeroToolCallDisposition:
      disposition === 'bootstrap-provider-source'
        ? ('seal-observation-and-continue' as const)
        : disposition === 'continue-after-consumed-effect'
          ? ('continue-without-shared-tool' as const)
          : disposition === 'source-unavailable'
            ? ('grade-unavailable' as const)
            : ('schema-failed' as const),
  });
  return Object.freeze({
    ...base,
    decisionDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision = (
  value: unknown
): value is AgentEvaluationCapabilityEffectRequestRefIssuanceDecision => {
  if (
    !hasExactAgentControlKeys(value, [
      'format',
      'version',
      'bindingKind',
      'sourceLifecycle',
      'turnIndex',
      'priorSourceTurnIndex',
      'priorSourceObservationReceiptDigest',
      'priorSourceDisposition',
      'priorEffectResultSealReceiptDigest',
      'disposition',
      'zeroToolCallDisposition',
      'decisionDigest',
    ])
  ) {
    return false;
  }
  try {
    const {
      format: _format,
      version: _version,
      sourceLifecycle: _sourceLifecycle,
      disposition: _disposition,
      zeroToolCallDisposition: _zeroToolCallDisposition,
      decisionDigest: _decisionDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
    return sameCanonicalJson(
      value,
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision(input)
    );
  } catch {
    return false;
  }
};

const bootstrapInvocationAuthorityKeys = Object.freeze([
  'format',
  'version',
  'bindingKind',
  'turnIndex',
  'decisionDigest',
  'omittedToolIds',
  'remainingToolIds',
  'providerToolEncoding',
  'sourceInvocationMaterialDigest',
  'specializedInvocationMaterialDigest',
  'authorityDigest',
] as const);

export const createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial =
  (
    input: Readonly<{
      invocation: AgentEvaluationInvocationMaterial;
      decision: AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
    }>
  ): AgentEvaluationCapabilityEffectBootstrapInvocationMaterial => {
    if (
      !hasExactAgentControlKeys(input, ['invocation', 'decision']) ||
      !isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision(
        input.decision
      ) ||
      input.decision.disposition !== 'bootstrap-provider-source' ||
      input.decision.zeroToolCallDisposition !==
        'seal-observation-and-continue' ||
      input.decision.turnIndex !== 0 ||
      !Array.isArray(input.invocation.blocks) ||
      !Array.isArray(input.invocation.contextItems) ||
      !Array.isArray(input.invocation.tools)
    ) {
      throw new TypeError(
        'Capability effect bootstrap invocation material is invalid.'
      );
    }
    const bindingKind = input.decision.bindingKind as Exclude<
      AgentEvaluationCapabilityEffectInputBindingKind,
      'hosted-retrieval-query'
    >;
    const omittedToolId =
      capabilityEffectInputBindingProfiles[bindingKind].toolId;
    const sourceToolIds = input.invocation.tools.map(({ toolId }) => toolId);
    if (
      sourceToolIds.filter((toolId) => toolId === omittedToolId).length !== 1 ||
      new Set(sourceToolIds).size !== sourceToolIds.length
    ) {
      throw new TypeError(
        'Capability effect bootstrap tool authority drifted.'
      );
    }
    const omittedToolIds = Object.freeze([...sourceToolIds]);
    const tools = Object.freeze([]);
    const invocation = Object.freeze({
      blocks: input.invocation.blocks,
      contextItems: input.invocation.contextItems,
      tools,
    });
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_INVOCATION_AUTHORITY_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
      bindingKind,
      turnIndex: 0 as const,
      decisionDigest: input.decision.decisionDigest,
      omittedToolIds,
      remainingToolIds: Object.freeze([]),
      providerToolEncoding: 'omit-tools-and-tool-choice' as const,
      sourceInvocationMaterialDigest: digestAgentCanonicalValue(
        input.invocation
      ),
      specializedInvocationMaterialDigest:
        digestAgentCanonicalValue(invocation),
    });
    return Object.freeze({
      invocation,
      authority: Object.freeze({
        ...base,
        authorityDigest: digestAgentCanonicalValue(base),
      }),
    });
  };

export const isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority = (
  value: unknown
): value is AgentEvaluationCapabilityEffectBootstrapInvocationAuthority => {
  if (!hasExactAgentControlKeys(value, bootstrapInvocationAuthorityKeys)) {
    return false;
  }
  const authority =
    value as AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  const profile = capabilityEffectInputBindingProfiles[authority.bindingKind];
  if (
    !profile ||
    authority.turnIndex !== 0 ||
    !isAgentCanonicalDigest(authority.decisionDigest) ||
    !Array.isArray(authority.omittedToolIds) ||
    authority.omittedToolIds.length < 1 ||
    !authority.omittedToolIds.includes(profile.toolId) ||
    authority.omittedToolIds.some(
      (toolId) => !isAgentControlIdentity(toolId)
    ) ||
    new Set(authority.omittedToolIds).size !==
      authority.omittedToolIds.length ||
    !Array.isArray(authority.remainingToolIds) ||
    authority.remainingToolIds.length !== 0 ||
    authority.providerToolEncoding !== 'omit-tools-and-tool-choice' ||
    !isAgentCanonicalDigest(authority.sourceInvocationMaterialDigest) ||
    !isAgentCanonicalDigest(authority.specializedInvocationMaterialDigest) ||
    !isAgentCanonicalDigest(authority.authorityDigest)
  ) {
    return false;
  }
  const { authorityDigest: _authorityDigest, ...base } = authority;
  return authority.authorityDigest === digestAgentCanonicalValue(base);
};

const bootstrapProviderRequestAuthorityKeys = Object.freeze([
  'format',
  'version',
  'bindingKind',
  'turnIndex',
  'decisionDigest',
  'invocationMaterialAuthorityDigest',
  'providerRequestProjection',
  'providerRequestProjectionDigest',
  'cacheWarmAuthority',
  'cacheWarmAuthorityDigest',
  'requestBodyDigest',
  'requestDigest',
  'authorityDigest',
] as const);

export const createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority =
  (
    program: AgentCapabilityProbeProgram,
    input: Readonly<{
      invocationAuthority: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
      providerRequestProjection: AgentNativeProviderCapabilityRuntimeRequestProjection;
      cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null;
    }>
  ): AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority => {
    if (
      !isAgentCapabilityProbeProgram(program) ||
      !hasExactAgentControlKeys(input, [
        'invocationAuthority',
        'providerRequestProjection',
        'cacheWarmAuthority',
      ]) ||
      !isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority(
        input.invocationAuthority
      ) ||
      !isAgentNativeProviderCapabilityRuntimeRequestProjection(
        input.providerRequestProjection,
        program
      )
    ) {
      throw new TypeError(
        'Capability effect bootstrap Provider request authority is invalid.'
      );
    }
    const expectedOperation =
      input.invocationAuthority.bindingKind === 'provider-job'
        ? ('background-submit' as const)
        : input.invocationAuthority.bindingKind === 'provider-cache'
          ? ('cache-warm' as const)
          : ('continuation-parent' as const);
    const cache = input.invocationAuthority.bindingKind === 'provider-cache';
    if (
      input.providerRequestProjection.operation !== expectedOperation ||
      cache !== (input.cacheWarmAuthority !== null) ||
      (input.cacheWarmAuthority !== null &&
        (!isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
          input.cacheWarmAuthority,
          program
        ) ||
          input.cacheWarmAuthority.warmRequestDigest !==
            input.providerRequestProjection.requestDigest ||
          input.cacheWarmAuthority.protocolFamily !==
            input.providerRequestProjection.protocolFamily ||
          input.cacheWarmAuthority.providerConfigurationId !==
            input.providerRequestProjection.providerConfigurationId ||
          input.cacheWarmAuthority.modelLineageDigest !==
            input.providerRequestProjection.modelLineageDigest ||
          input.cacheWarmAuthority.adapterDigest !==
            input.providerRequestProjection.adapterDigest))
    ) {
      throw new TypeError(
        'Capability effect bootstrap Provider operation authority drifted.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_PROVIDER_REQUEST_AUTHORITY_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
      bindingKind: input.invocationAuthority.bindingKind,
      turnIndex: 0 as const,
      decisionDigest: input.invocationAuthority.decisionDigest,
      invocationMaterialAuthorityDigest:
        input.invocationAuthority.authorityDigest,
      providerRequestProjection: input.providerRequestProjection,
      providerRequestProjectionDigest:
        input.providerRequestProjection.requestDigest,
      cacheWarmAuthority: input.cacheWarmAuthority,
      cacheWarmAuthorityDigest:
        input.cacheWarmAuthority?.authorityDigest ?? null,
      requestBodyDigest: input.providerRequestProjection.requestBodyDigest,
      requestDigest: input.providerRequestProjection.requestDigest,
    });
    return Object.freeze({
      ...base,
      authorityDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority =
  (
    value: unknown
  ): value is AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority => {
    if (
      !hasExactAgentControlKeys(value, bootstrapProviderRequestAuthorityKeys)
    ) {
      return false;
    }
    const authority =
      value as AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority;
    if (
      authority.format !==
        AGENT_EVALUATION_CAPABILITY_EFFECT_BOOTSTRAP_PROVIDER_REQUEST_AUTHORITY_FORMAT ||
      authority.version !==
        AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION ||
      !['opaque-continuation', 'provider-cache', 'provider-job'].includes(
        authority.bindingKind
      ) ||
      authority.turnIndex !== 0 ||
      ![
        authority.decisionDigest,
        authority.invocationMaterialAuthorityDigest,
        authority.providerRequestProjectionDigest,
        authority.requestBodyDigest,
        authority.requestDigest,
        authority.authorityDigest,
      ].every(isAgentCanonicalDigest)
    ) {
      return false;
    }
    if (
      !isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(
        authority.providerRequestProjection
      )
    ) {
      return false;
    }
    const expectedOperation =
      authority.bindingKind === 'provider-job'
        ? ('background-submit' as const)
        : authority.bindingKind === 'provider-cache'
          ? ('cache-warm' as const)
          : ('continuation-parent' as const);
    const cache = authority.bindingKind === 'provider-cache';
    if (
      authority.providerRequestProjection.operation !== expectedOperation ||
      authority.providerRequestProjectionDigest !==
        authority.providerRequestProjection.requestDigest ||
      authority.requestBodyDigest !==
        authority.providerRequestProjection.requestBodyDigest ||
      authority.requestDigest !==
        authority.providerRequestProjection.requestDigest ||
      cache !== (authority.cacheWarmAuthority !== null) ||
      authority.cacheWarmAuthorityDigest !==
        (authority.cacheWarmAuthority?.authorityDigest ?? null)
    ) {
      return false;
    }
    try {
      const program = resolveAgentNativeProviderCapabilityRuntimeProgram(
        authority.providerRequestProjection.capabilityProfileId,
        authority.providerRequestProjection.capabilityProfileDigest
      );
      if (
        authority.cacheWarmAuthority !== null &&
        (!isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
          authority.cacheWarmAuthority,
          program
        ) ||
          authority.cacheWarmAuthority.warmRequestDigest !==
            authority.requestDigest ||
          authority.cacheWarmAuthority.protocolFamily !==
            authority.providerRequestProjection.protocolFamily ||
          authority.cacheWarmAuthority.providerConfigurationId !==
            authority.providerRequestProjection.providerConfigurationId ||
          authority.cacheWarmAuthority.modelLineageDigest !==
            authority.providerRequestProjection.modelLineageDigest ||
          authority.cacheWarmAuthority.adapterDigest !==
            authority.providerRequestProjection.adapterDigest)
      ) {
        return false;
      }
    } catch {
      return false;
    }
    const { authorityDigest, ...base } = authority;
    return authorityDigest === digestAgentCanonicalValue(base);
  };

const capabilityEffectInputAuthorityBindingInputKeys = Object.freeze([
  'bindingKind',
  'capabilityId',
  'requestRef',
  'targetRef',
  'requestRefAuthority',
  'requestRefAuthorityReceiptDigest',
  'sourceAttemptId',
  'sourceTurnIndex',
  'sourceInvocationId',
  'sourceProviderRequestDigest',
  'sourceResponseDigest',
  'sourceDispatchIntentDigest',
  'sourceTransportReceiptDigest',
  'sourceResultSpoolReceiptDigest',
  'sourceNormalizedEventSetDigest',
  'sourceObservationReceiptDigest',
  'sourceFactKind',
  'sourceProviderEventType',
  'sourceProviderToolCallId',
  'sourceToolId',
  'sourceArgumentsDigest',
  'sourceHandleDigest',
  'stateVaultSealRequest',
  'stateVaultSealReceipt',
  'protocolFamily',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'sourceRegistryReceiptDigest',
] as const);

const capabilityEffectInputAuthorityBindingKeys = Object.freeze([
  'format',
  'version',
  ...capabilityEffectInputAuthorityBindingInputKeys,
  'bindingDigest',
] as const);

export const createAgentEvaluationCapabilityEffectRequestRef = (
  bindingKind: AgentEvaluationCapabilityEffectInputBindingKind,
  requestRefAuthorityDigest: CanonicalDigest
): string => {
  if (
    !Object.hasOwn(capabilityEffectInputBindingProfiles, bindingKind) ||
    !isAgentCanonicalDigest(requestRefAuthorityDigest)
  ) {
    throw new TypeError('Capability effect request reference is invalid.');
  }
  return `capability-effect-ref.${bindingKind}.${requestRefAuthorityDigest.slice('sha256-'.length)}`;
};

const requestRefAuthorityInputKeys = Object.freeze([
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'bindingKind',
  'capabilityId',
  'toolId',
  'targetRef',
  'protocolFamily',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'runtimeFactSourceAuthorityDigest',
  'registrationReceiptDigest',
  'issuedAt',
  'expiresAt',
] as const);
const requestRefAuthorityReceiptKeys = Object.freeze([
  'format',
  'version',
  ...requestRefAuthorityInputKeys,
  'authorityDigest',
  'requestRef',
  'receiptDigest',
] as const);

const createRequestRefAuthorityReceipt = (
  input: CreateAgentEvaluationCapabilityEffectRequestRefAuthorityReceiptInput
): AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt => {
  const profile = capabilityEffectInputBindingProfiles[input.bindingKind];
  if (
    !hasExactAgentControlKeys(input, requestRefAuthorityInputKeys) ||
    !profile ||
    input.capabilityId !== profile.capabilityId ||
    input.toolId !== profile.toolId ||
    !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
    !isAgentControlInstant(input.issuedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.issuedAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.issuedAt) >
      AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_MAXIMUM_LIFETIME_MS ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= 7 ||
    ![
      input.namespaceId,
      input.attemptId,
      input.invocationId,
      input.toolId,
      input.targetRef,
      input.providerConfigurationId,
    ].every(isAgentControlIdentity) ||
    ![
      input.planDigest,
      input.descriptorDigest,
      input.modelLineageDigest,
      input.adapterDigest,
      input.runtimeFactSourceAuthorityDigest,
      input.registrationReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    !['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      input.protocolFamily
    )
  ) {
    throw new TypeError('Capability effect request-ref authority is invalid.');
  }
  const authorityBase = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    ...input,
  });
  const authorityDigest = digestAgentCanonicalValue(authorityBase);
  const requestRef = createAgentEvaluationCapabilityEffectRequestRef(
    input.bindingKind,
    authorityDigest
  );
  const receiptBase = Object.freeze({
    ...authorityBase,
    authorityDigest,
    requestRef,
  });
  const receipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  if (
    inspectAgentControlJson(
      receipt,
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(receipt))
  ) {
    throw new TypeError('Capability effect request-ref authority is unsafe.');
  }
  return receipt;
};

export const createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt =
  createRequestRefAuthorityReceipt;

export const isAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt = (
  value: unknown
): value is AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt => {
  if (!hasExactAgentControlKeys(value, requestRefAuthorityReceiptKeys)) {
    return false;
  }
  try {
    const {
      format: _format,
      version: _version,
      authorityDigest: _authorityDigest,
      requestRef: _requestRef,
      receiptDigest: _receiptDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt;
    return sameCanonicalJson(value, createRequestRefAuthorityReceipt(input));
  } catch {
    return false;
  }
};

export const digestAgentEvaluationCapabilityEffectToolArguments = (
  input: AgentEvaluationCapabilityEffectToolArguments
): CanonicalDigest => {
  if (
    !hasExactAgentControlKeys(input, ['requestRef', 'targetRef']) ||
    ![input.requestRef, input.targetRef].every(isAgentControlIdentity)
  ) {
    throw new TypeError('Capability effect tool arguments are invalid.');
  }
  return digestAgentCanonicalValue(input);
};

export const isAgentEvaluationCapabilityEffectInputAuthorityBinding = (
  value: unknown
): value is AgentEvaluationCapabilityEffectInputAuthorityBinding => {
  if (
    !hasExactAgentControlKeys(value, capabilityEffectInputAuthorityBindingKeys)
  ) {
    return false;
  }
  const binding = value as AgentEvaluationCapabilityEffectInputAuthorityBinding;
  const profile = capabilityEffectInputBindingProfiles[binding.bindingKind];
  if (
    !profile ||
    binding.format !==
      AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_BINDING_FORMAT ||
    binding.version !== AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION ||
    binding.capabilityId !== profile.capabilityId ||
    binding.sourceFactKind !== profile.sourceFactKind ||
    binding.sourceProviderEventType !== profile.sourceProviderEventType ||
    !isAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt(
      binding.requestRefAuthority
    ) ||
    binding.requestRefAuthorityReceiptDigest !==
      binding.requestRefAuthority.receiptDigest ||
    binding.requestRef !== binding.requestRefAuthority.requestRef ||
    binding.targetRef !== binding.requestRefAuthority.targetRef ||
    binding.bindingKind !== binding.requestRefAuthority.bindingKind ||
    binding.capabilityId !== binding.requestRefAuthority.capabilityId ||
    binding.sourceAttemptId !== binding.requestRefAuthority.attemptId ||
    binding.protocolFamily !== binding.requestRefAuthority.protocolFamily ||
    binding.providerConfigurationId !==
      binding.requestRefAuthority.providerConfigurationId ||
    binding.modelLineageDigest !==
      binding.requestRefAuthority.modelLineageDigest ||
    binding.adapterDigest !== binding.requestRefAuthority.adapterDigest ||
    !Number.isSafeInteger(binding.sourceTurnIndex) ||
    binding.sourceTurnIndex < 0 ||
    binding.sourceTurnIndex >= 7 ||
    ![
      binding.requestRef,
      binding.targetRef,
      binding.sourceAttemptId,
      binding.sourceInvocationId,
      binding.providerConfigurationId,
    ].every(isAgentControlIdentity) ||
    ![
      binding.sourceProviderRequestDigest,
      binding.sourceResponseDigest,
      binding.sourceDispatchIntentDigest,
      binding.sourceTransportReceiptDigest,
      binding.sourceResultSpoolReceiptDigest,
      binding.sourceNormalizedEventSetDigest,
      binding.sourceHandleDigest,
      binding.modelLineageDigest,
      binding.adapterDigest,
      binding.sourceRegistryReceiptDigest,
      binding.requestRefAuthorityReceiptDigest,
      binding.bindingDigest,
    ].every(isAgentCanonicalDigest) ||
    (binding.sourceObservationReceiptDigest !== null &&
      !isAgentCanonicalDigest(binding.sourceObservationReceiptDigest)) ||
    (binding.sourceArgumentsDigest !== null &&
      !isAgentCanonicalDigest(binding.sourceArgumentsDigest)) ||
    (binding.bindingKind === 'provider-job' ||
    binding.bindingKind === 'opaque-continuation'
      ? binding.stateVaultSealRequest === null ||
        binding.stateVaultSealReceipt === null ||
        !isAgentNativeProviderStateVaultSealRequest(
          binding.stateVaultSealRequest
        ) ||
        !isAgentNativeProviderStateVaultSealReceipt(
          binding.stateVaultSealReceipt,
          binding.stateVaultSealRequest
        ) ||
        binding.stateVaultSealReceipt.status !== 'sealed' ||
        binding.stateVaultSealRequest.attemptId !== binding.sourceAttemptId ||
        binding.stateVaultSealRequest.invocationId !==
          binding.sourceInvocationId ||
        binding.stateVaultSealRequest.requestDigest !==
          binding.sourceProviderRequestDigest ||
        binding.stateVaultSealRequest.responseDigest !==
          binding.sourceResponseDigest ||
        binding.stateVaultSealRequest.protocolFamily !==
          binding.protocolFamily ||
        binding.stateVaultSealRequest.providerConfigurationId !==
          binding.providerConfigurationId ||
        binding.stateVaultSealRequest.modelLineageDigest !==
          binding.modelLineageDigest ||
        binding.stateVaultSealRequest.adapterDigest !== binding.adapterDigest ||
        binding.stateVaultSealRequest.purpose !==
          (binding.bindingKind === 'provider-job'
            ? 'background-job-state'
            : 'reasoning-continuation-state')
      : binding.stateVaultSealRequest !== null ||
        binding.stateVaultSealReceipt !== null) ||
    (binding.bindingKind === 'hosted-retrieval-query'
      ? binding.sourceObservationReceiptDigest !== null ||
        !isAgentControlIdentity(binding.sourceProviderToolCallId) ||
        binding.sourceToolId !== profile.toolId ||
        !isAgentCanonicalDigest(binding.sourceArgumentsDigest)
      : binding.sourceObservationReceiptDigest === null ||
        binding.sourceProviderToolCallId !== null ||
        binding.sourceToolId !== null ||
        binding.sourceArgumentsDigest !== null) ||
    !['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      binding.protocolFamily
    ) ||
    inspectAgentControlJson(
      binding,
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(binding))
  ) {
    return false;
  }
  const { bindingDigest, ...base } = binding;
  const {
    sourceRegistryReceiptDigest,
    format: _format,
    version: _version,
    ...registryInput
  } = base;
  const registryBase = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    ...registryInput,
  });
  return (
    sourceRegistryReceiptDigest === digestAgentCanonicalValue(registryBase) &&
    bindingDigest === digestAgentCanonicalValue(base)
  );
};

export const createAgentEvaluationCapabilityEffectInputAuthorityBinding = (
  input: CreateAgentEvaluationCapabilityEffectInputAuthorityBindingInput
): AgentEvaluationCapabilityEffectInputAuthorityBinding => {
  if (
    !hasExactAgentControlKeys(
      input,
      capabilityEffectInputAuthorityBindingInputKeys
    )
  ) {
    throw new TypeError('Capability effect input authority is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_BINDING_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    ...input,
  });
  const binding = Object.freeze({
    ...base,
    bindingDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityEffectInputAuthorityBinding(binding)) {
    throw new TypeError('Capability effect input authority is invalid.');
  }
  return binding;
};

const capabilityEffectInputAuthorityRegistryReceiptInputKeys = Object.freeze(
  capabilityEffectInputAuthorityBindingInputKeys.filter(
    (key) => key !== 'sourceRegistryReceiptDigest'
  )
);
const capabilityEffectInputAuthorityRegistryReceiptKeys = Object.freeze([
  'format',
  'version',
  ...capabilityEffectInputAuthorityRegistryReceiptInputKeys,
  'receiptDigest',
]);

export const createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt =
  (
    input: CreateAgentEvaluationCapabilityEffectInputAuthorityRegistryReceiptInput
  ): AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt => {
    if (
      !hasExactAgentControlKeys(
        input,
        capabilityEffectInputAuthorityRegistryReceiptInputKeys
      )
    ) {
      throw new TypeError(
        'Capability effect input authority registry receipt is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RECEIPT_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
      ...input,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    const binding = createAgentEvaluationCapabilityEffectInputAuthorityBinding({
      ...input,
      sourceRegistryReceiptDigest: receipt.receiptDigest,
    });
    if (binding.sourceRegistryReceiptDigest !== receipt.receiptDigest) {
      throw new TypeError(
        'Capability effect input authority registry receipt is invalid.'
      );
    }
    return receipt;
  };

export const isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt = (
  value: unknown
): value is AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt => {
  if (
    !hasExactAgentControlKeys(
      value,
      capabilityEffectInputAuthorityRegistryReceiptKeys
    )
  ) {
    return false;
  }
  try {
    const {
      format: _format,
      version: _version,
      receiptDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt;
    return (
      receiptDigest ===
        digestAgentCanonicalValue({
          format:
            AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RECEIPT_FORMAT,
          version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
          ...input,
        }) &&
      createAgentEvaluationCapabilityEffectInputAuthorityBinding({
        ...input,
        sourceRegistryReceiptDigest: receiptDigest,
      }).sourceRegistryReceiptDigest === receiptDigest
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt =
  (
    receipt: AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt
  ): AgentEvaluationCapabilityEffectInputAuthorityBinding => {
    if (
      !isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(receipt)
    ) {
      throw new TypeError(
        'Capability effect input authority registry receipt is invalid.'
      );
    }
    const {
      format: _format,
      version: _version,
      receiptDigest,
      ...input
    } = receipt;
    return createAgentEvaluationCapabilityEffectInputAuthorityBinding({
      ...input,
      sourceRegistryReceiptDigest: receiptDigest,
    });
  };

export type AgentEvaluationCapabilityPreEffectIntent = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PRE_EFFECT_INTENT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  toolId: string;
  toolCallId: string;
  providerToolCallId: string;
  providerRequestDigest: CanonicalDigest;
  argumentsDigest: CanonicalDigest;
  requestedAt: Instant;
  inputAuthorityBinding: AgentEvaluationCapabilityEffectInputAuthorityBinding;
  runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
  registrationReceiptDigest: CanonicalDigest;
  ownerRequestId: string;
  ownerRequestDigest: CanonicalDigest;
  intentDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityPreEffectIntentInput = Omit<
  AgentEvaluationCapabilityPreEffectIntent,
  'format' | 'version' | 'intentDigest'
>;

const recreateRuntimeFactSourceAuthority = (
  authority: AgentEvaluationRuntimeFactSourceAuthority
): AgentEvaluationRuntimeFactSourceAuthority => {
  const { authorityDigest, ...input } = authority;
  const recreated = createAgentEvaluationRuntimeFactSourceAuthority(input);
  if (recreated.authorityDigest !== authorityDigest) {
    throw new TypeError('Runtime fact source authority digest drifted.');
  }
  return recreated;
};

export type AgentEvaluationCapabilityEffectOwnerRequestIdentity = Readonly<{
  ownerRequestId: string;
  ownerRequestDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectOwnerRequestIdentityInput =
  Omit<
    CreateAgentEvaluationCapabilityPreEffectIntentInput,
    'ownerRequestId' | 'ownerRequestDigest'
  >;

const effectOwnerRequestIdentityInputKeys = Object.freeze([
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'caseId',
  'materialDigest',
  'turnIndex',
  'invocationId',
  'toolId',
  'toolCallId',
  'providerToolCallId',
  'providerRequestDigest',
  'argumentsDigest',
  'requestedAt',
  'inputAuthorityBinding',
  'runtimeFactSourceAuthority',
  'registrationReceiptDigest',
] as const);

/** Canonical request identity shared by runner, 8791, and Backend. */
export const createAgentEvaluationCapabilityEffectOwnerRequestIdentity = (
  input: CreateAgentEvaluationCapabilityEffectOwnerRequestIdentityInput
): AgentEvaluationCapabilityEffectOwnerRequestIdentity => {
  if (
    !hasExactAgentControlKeys(input, effectOwnerRequestIdentityInputKeys) ||
    !isAgentEvaluationCapabilityEffectInputAuthorityBinding(
      input.inputAuthorityBinding
    ) ||
    !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
    !isAgentControlInstant(input.requestedAt) ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= 7 ||
    ![
      input.namespaceId,
      input.attemptId,
      input.caseId,
      input.invocationId,
      input.toolId,
      input.toolCallId,
      input.providerToolCallId,
    ].every(isAgentControlIdentity) ||
    ![
      input.planDigest,
      input.descriptorDigest,
      input.materialDigest,
      input.providerRequestDigest,
      input.argumentsDigest,
      input.registrationReceiptDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError('Capability effect owner request input is invalid.');
  }
  const runtimeFactSourceAuthority = recreateRuntimeFactSourceAuthority(
    input.runtimeFactSourceAuthority
  );
  const inputAuthorityBinding = input.inputAuthorityBinding;
  const bindingProfile =
    capabilityEffectInputBindingProfiles[inputAuthorityBinding.bindingKind];
  const retrievalCurrentTurnBinding =
    inputAuthorityBinding.bindingKind === 'hosted-retrieval-query';
  const requestRefAuthority = inputAuthorityBinding.requestRefAuthority;
  if (
    runtimeFactSourceAuthority.registrationReceiptDigest !==
      input.registrationReceiptDigest ||
    inputAuthorityBinding.capabilityId !== bindingProfile.capabilityId ||
    input.toolId !== bindingProfile.toolId ||
    requestRefAuthority.namespaceId !== input.namespaceId ||
    requestRefAuthority.planDigest !== input.planDigest ||
    requestRefAuthority.repositoryCommit !== input.repositoryCommit ||
    requestRefAuthority.attemptId !== input.attemptId ||
    requestRefAuthority.descriptorDigest !== input.descriptorDigest ||
    requestRefAuthority.turnIndex !== input.turnIndex ||
    requestRefAuthority.invocationId !== input.invocationId ||
    requestRefAuthority.toolId !== input.toolId ||
    requestRefAuthority.runtimeFactSourceAuthorityDigest !==
      runtimeFactSourceAuthority.authorityDigest ||
    requestRefAuthority.registrationReceiptDigest !==
      input.registrationReceiptDigest ||
    Date.parse(requestRefAuthority.issuedAt) > Date.parse(input.requestedAt) ||
    Date.parse(requestRefAuthority.expiresAt) < Date.parse(input.requestedAt) ||
    inputAuthorityBinding.sourceAttemptId !== input.attemptId ||
    (retrievalCurrentTurnBinding
      ? inputAuthorityBinding.sourceTurnIndex !== input.turnIndex ||
        inputAuthorityBinding.sourceInvocationId !== input.invocationId ||
        inputAuthorityBinding.sourceProviderRequestDigest !==
          input.providerRequestDigest ||
        inputAuthorityBinding.sourceProviderToolCallId !==
          input.providerToolCallId ||
        inputAuthorityBinding.sourceToolId !== input.toolId ||
        inputAuthorityBinding.sourceArgumentsDigest !== input.argumentsDigest
      : inputAuthorityBinding.sourceTurnIndex >= input.turnIndex ||
        inputAuthorityBinding.sourceInvocationId === input.invocationId ||
        inputAuthorityBinding.sourceProviderRequestDigest ===
          input.providerRequestDigest) ||
    input.argumentsDigest !==
      digestAgentEvaluationCapabilityEffectToolArguments({
        requestRef: inputAuthorityBinding.requestRef,
        targetRef: inputAuthorityBinding.targetRef,
      }) ||
    inputAuthorityBinding.capabilityId !==
      runtimeFactSourceAuthority.capabilityId ||
    inputAuthorityBinding.protocolFamily !==
      runtimeFactSourceAuthority.protocolFamily ||
    inputAuthorityBinding.providerConfigurationId !==
      runtimeFactSourceAuthority.providerConfigurationId ||
    inputAuthorityBinding.modelLineageDigest !==
      runtimeFactSourceAuthority.modelLineageDigest ||
    inputAuthorityBinding.adapterDigest !==
      runtimeFactSourceAuthority.adapterDigest
  ) {
    throw new TypeError(
      'Capability effect owner request authority binding drifted.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_OWNER_REQUEST_IDENTITY_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    namespaceId: input.namespaceId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    toolId: input.toolId,
    toolCallId: input.toolCallId,
    providerToolCallId: input.providerToolCallId,
    providerRequestDigest: input.providerRequestDigest,
    argumentsDigest: input.argumentsDigest,
    requestedAt: input.requestedAt,
    inputAuthorityBindingDigest: input.inputAuthorityBinding.bindingDigest,
    runtimeFactSourceAuthorityDigest:
      runtimeFactSourceAuthority.authorityDigest,
    registrationReceiptDigest: input.registrationReceiptDigest,
  });
  if (
    inspectAgentControlJson(
      base,
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(base))
  ) {
    throw new TypeError(
      'Capability effect owner request is unsafe or unbounded.'
    );
  }
  const ownerRequestDigest = digestAgentCanonicalValue(base);
  return Object.freeze({
    ownerRequestId: `capability-effect-owner-request.${ownerRequestDigest.slice('sha256-'.length)}`,
    ownerRequestDigest,
  });
};

const preEffectIntentBase = (
  input: CreateAgentEvaluationCapabilityPreEffectIntentInput
) =>
  Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PRE_EFFECT_INTENT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    ...input,
  });

const preEffectIntentInputKeys = Object.freeze([
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'caseId',
  'materialDigest',
  'turnIndex',
  'invocationId',
  'toolId',
  'toolCallId',
  'providerToolCallId',
  'providerRequestDigest',
  'argumentsDigest',
  'requestedAt',
  'inputAuthorityBinding',
  'runtimeFactSourceAuthority',
  'registrationReceiptDigest',
  'ownerRequestId',
  'ownerRequestDigest',
] as const);

export const createAgentEvaluationCapabilityPreEffectIntent = (
  input: CreateAgentEvaluationCapabilityPreEffectIntentInput
): AgentEvaluationCapabilityPreEffectIntent => {
  if (
    !hasExactAgentControlKeys(input, preEffectIntentInputKeys) ||
    !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
    !isAgentControlInstant(input.requestedAt) ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= 7 ||
    ![
      input.namespaceId,
      input.attemptId,
      input.caseId,
      input.invocationId,
      input.toolId,
      input.toolCallId,
      input.providerToolCallId,
      input.ownerRequestId,
    ].every(isAgentControlIdentity) ||
    ![
      input.planDigest,
      input.descriptorDigest,
      input.materialDigest,
      input.providerRequestDigest,
      input.argumentsDigest,
      input.registrationReceiptDigest,
      input.ownerRequestDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError('Capability pre-effect intent input is invalid.');
  }
  const runtimeFactSourceAuthority = recreateRuntimeFactSourceAuthority(
    input.runtimeFactSourceAuthority
  );
  const {
    ownerRequestId: expectedOwnerRequestId,
    ownerRequestDigest: expectedOwnerRequestDigest,
  } = createAgentEvaluationCapabilityEffectOwnerRequestIdentity({
    namespaceId: input.namespaceId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    toolId: input.toolId,
    toolCallId: input.toolCallId,
    providerToolCallId: input.providerToolCallId,
    providerRequestDigest: input.providerRequestDigest,
    argumentsDigest: input.argumentsDigest,
    requestedAt: input.requestedAt,
    inputAuthorityBinding: input.inputAuthorityBinding,
    runtimeFactSourceAuthority,
    registrationReceiptDigest: input.registrationReceiptDigest,
  });
  if (
    runtimeFactSourceAuthority.registrationReceiptDigest !==
      input.registrationReceiptDigest ||
    input.ownerRequestId !== expectedOwnerRequestId ||
    input.ownerRequestDigest !== expectedOwnerRequestDigest
  ) {
    throw new TypeError(
      'Capability pre-effect intent registration authority drifted.'
    );
  }
  const base = preEffectIntentBase(
    Object.freeze({ ...input, runtimeFactSourceAuthority })
  );
  if (
    inspectAgentControlJson(
      base,
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(base))
  ) {
    throw new TypeError('Capability pre-effect intent is unsafe or unbounded.');
  }
  return Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
};

const preEffectIntentKeys = Object.freeze([
  'format',
  'version',
  ...preEffectIntentInputKeys,
  'intentDigest',
] as const);

export const isAgentEvaluationCapabilityPreEffectIntent = (
  value: unknown
): value is AgentEvaluationCapabilityPreEffectIntent => {
  if (!hasExactAgentControlKeys(value, preEffectIntentKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      intentDigest: _intentDigest,
      ...input
    } = value as AgentEvaluationCapabilityPreEffectIntent;
    return sameCanonicalJson(
      value,
      createAgentEvaluationCapabilityPreEffectIntent(input)
    );
  } catch {
    return false;
  }
};

export type AgentEvaluationCapabilityEffectSourceReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_SOURCE_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION;
  intentDigest: CanonicalDigest;
  ownerRequestId: string;
  ownerRequestDigest: CanonicalDigest;
  runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
  registrationReceiptDigest: CanonicalDigest;
  effectStatus: 'produced' | 'unavailable' | 'failed';
  businessResultDigest: CanonicalDigest;
  providerRuntimeJournalResultRecordDigest: CanonicalDigest;
  providerRuntimeResultSealReceiptDigest: CanonicalDigest;
  sourceFactKind: AgentEvaluationCapabilityEffectSourceFactKind | null;
  sourceFactDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest | null;
  normalizedEventSetDigest: CanonicalDigest;
  stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
  stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
  stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
  stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
  specificReceiptDigests: readonly [];
  sealedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectSourceReceiptInput = Omit<
  AgentEvaluationCapabilityEffectSourceReceipt,
  'format' | 'version' | 'receiptDigest'
>;

const expectedSourceFactKind = (
  authority: AgentEvaluationRuntimeFactSourceAuthority
): AgentEvaluationCapabilityEffectSourceFactKind => {
  switch (authority.capabilityId) {
    case 'provider.background-job':
      return 'provider-job-receipt';
    case 'provider.hosted-retrieval':
      return 'retrieval-query-receipt';
    case 'provider.isolated-cache':
      return 'provider-cache-receipt';
    case 'provider.reasoning-continuation':
      return 'opaque-continuation';
    default:
      throw new TypeError(
        'Capability effect has no shared runtime fact owner.'
      );
  }
};

const effectSourceReceiptInputKeys = Object.freeze([
  'intentDigest',
  'ownerRequestId',
  'ownerRequestDigest',
  'runtimeFactSourceAuthority',
  'registrationReceiptDigest',
  'effectStatus',
  'businessResultDigest',
  'providerRuntimeJournalResultRecordDigest',
  'providerRuntimeResultSealReceiptDigest',
  'sourceFactKind',
  'sourceFactDigest',
  'stageDigest',
  'dispatchAckDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'stateVaultResolveRequest',
  'stateVaultResolveReceipt',
  'stateVaultRetireRequest',
  'stateVaultRetirementReceipt',
  'specificReceiptDigests',
  'sealedAt',
] as const);

const stateVaultEffectLifecycleMatches = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  input: CreateAgentEvaluationCapabilityEffectSourceReceiptInput
): boolean => {
  const binding = intent.inputAuthorityBinding;
  const requiresStateVault =
    binding.bindingKind === 'provider-job' ||
    binding.bindingKind === 'opaque-continuation';
  if (!requiresStateVault) {
    return (
      input.stateVaultResolveRequest === null &&
      input.stateVaultResolveReceipt === null &&
      input.stateVaultRetireRequest === null &&
      input.stateVaultRetirementReceipt === null
    );
  }
  const sealRequest = binding.stateVaultSealRequest;
  const sealReceipt = binding.stateVaultSealReceipt;
  const resolveRequest = input.stateVaultResolveRequest;
  const resolveReceipt = input.stateVaultResolveReceipt;
  const retireRequest = input.stateVaultRetireRequest;
  const retirementReceipt = input.stateVaultRetirementReceipt;
  if (
    sealRequest === null ||
    sealReceipt === null ||
    resolveRequest === null ||
    resolveReceipt === null ||
    retireRequest === null ||
    retirementReceipt === null ||
    !isAgentNativeProviderStateVaultResolveRequest(
      resolveRequest,
      sealRequest,
      sealReceipt
    ) ||
    !isAgentNativeProviderStateVaultResolveReceipt(
      resolveReceipt,
      resolveRequest
    ) ||
    !isAgentNativeProviderStateVaultRetireRequest(retireRequest) ||
    !isAgentNativeProviderStateVaultRetirementReceipt(
      retirementReceipt,
      retireRequest,
      sealRequest,
      sealReceipt
    ) ||
    resolveRequest.sourceAttemptId !== binding.sourceAttemptId ||
    resolveRequest.sourceInvocationId !== binding.sourceInvocationId ||
    resolveRequest.consumerAttemptId !== intent.attemptId ||
    resolveRequest.consumerInvocationId !== intent.invocationId ||
    resolveRequest.consumerGeneration !== sealRequest.generation ||
    retireRequest.sealRequestDigest !== sealRequest.sealRequestDigest ||
    retireRequest.sealReceiptDigest !== sealReceipt.receiptDigest ||
    retireRequest.resolveReceiptDigest !== resolveReceipt.receiptDigest ||
    Date.parse(retirementReceipt.retiredAt) > Date.parse(input.sealedAt) ||
    (resolveReceipt.status === 'resolved'
      ? retireRequest.disposition !== 'consumed'
      : retireRequest.disposition === 'consumed') ||
    (input.effectStatus === 'produced' && resolveReceipt.status !== 'resolved')
  ) {
    return false;
  }
  return true;
};

export const createAgentEvaluationCapabilityEffectSourceReceipt = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  input: CreateAgentEvaluationCapabilityEffectSourceReceiptInput
): AgentEvaluationCapabilityEffectSourceReceipt => {
  if (
    !isAgentEvaluationCapabilityPreEffectIntent(intent) ||
    !hasExactAgentControlKeys(input, effectSourceReceiptInputKeys) ||
    !['produced', 'unavailable', 'failed'].includes(input.effectStatus) ||
    !isAgentControlIdentity(input.ownerRequestId) ||
    !isAgentControlInstant(input.sealedAt) ||
    !Array.isArray(input.specificReceiptDigests) ||
    input.specificReceiptDigests.length !== 0 ||
    ![
      input.intentDigest,
      input.ownerRequestDigest,
      input.registrationReceiptDigest,
      input.businessResultDigest,
      input.providerRuntimeJournalResultRecordDigest,
      input.providerRuntimeResultSealReceiptDigest,
      input.stageDigest,
      input.dispatchAckDigest,
      input.transportReceiptDigest,
      input.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest) ||
    (input.resultSpoolReceiptDigest !== null &&
      !isAgentCanonicalDigest(input.resultSpoolReceiptDigest)) ||
    (input.sourceFactDigest !== null &&
      !isAgentCanonicalDigest(input.sourceFactDigest))
  ) {
    throw new TypeError('Capability effect source receipt input is invalid.');
  }
  const runtimeFactSourceAuthority = recreateRuntimeFactSourceAuthority(
    input.runtimeFactSourceAuthority
  );
  const produced = input.effectStatus === 'produced';
  if (
    input.intentDigest !== intent.intentDigest ||
    input.ownerRequestId !== intent.ownerRequestId ||
    input.ownerRequestDigest !== intent.ownerRequestDigest ||
    input.registrationReceiptDigest !== intent.registrationReceiptDigest ||
    !sameCanonicalJson(
      runtimeFactSourceAuthority,
      intent.runtimeFactSourceAuthority
    ) ||
    !stateVaultEffectLifecycleMatches(intent, input) ||
    (produced
      ? input.sourceFactKind !==
          expectedSourceFactKind(runtimeFactSourceAuthority) ||
        input.sourceFactDigest === null ||
        input.resultSpoolReceiptDigest === null
      : input.sourceFactKind !== null || input.sourceFactDigest !== null)
  ) {
    throw new TypeError(
      'Capability effect source receipt drifted from its pre-effect intent.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_EFFECT_SOURCE_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_VERSION,
    ...input,
    runtimeFactSourceAuthority,
    specificReceiptDigests: Object.freeze([]) as readonly [],
  });
  if (
    inspectAgentControlJson(
      base,
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(base))
  ) {
    throw new TypeError(
      'Capability effect source receipt is unsafe or unbounded.'
    );
  }
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const effectSourceReceiptKeys = Object.freeze([
  'format',
  'version',
  ...effectSourceReceiptInputKeys,
  'receiptDigest',
] as const);

export const isAgentEvaluationCapabilityEffectSourceReceipt = (
  value: unknown,
  intent: AgentEvaluationCapabilityPreEffectIntent
): value is AgentEvaluationCapabilityEffectSourceReceipt => {
  if (!hasExactAgentControlKeys(value, effectSourceReceiptKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      receiptDigest: _receiptDigest,
      ...input
    } = value as AgentEvaluationCapabilityEffectSourceReceipt;
    return sameCanonicalJson(
      value,
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, input)
    );
  } catch {
    return false;
  }
};

export const matchAgentEvaluationCapabilityEffectSourceReceipt = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  receipt: AgentEvaluationCapabilityEffectSourceReceipt
): boolean => isAgentEvaluationCapabilityEffectSourceReceipt(receipt, intent);

/** ACK-loss reconciliation returns the persisted bytes and never authorizes execution. */
export const reconcileAgentEvaluationCapabilityEffectSourceReceipt = (
  intent: AgentEvaluationCapabilityPreEffectIntent,
  persistedReceipt: AgentEvaluationCapabilityEffectSourceReceipt | null,
  returnedReceipt: AgentEvaluationCapabilityEffectSourceReceipt
): AgentEvaluationCapabilityEffectSourceReceipt => {
  if (
    !isAgentEvaluationCapabilityEffectSourceReceipt(returnedReceipt, intent)
  ) {
    throw new TypeError(
      'Returned capability effect source receipt is invalid.'
    );
  }
  if (persistedReceipt === null) return returnedReceipt;
  if (
    !isAgentEvaluationCapabilityEffectSourceReceipt(persistedReceipt, intent) ||
    !sameCanonicalJson(persistedReceipt, returnedReceipt)
  ) {
    throw new TypeError(
      'Capability effect ACK-loss reconciliation detected receipt drift.'
    );
  }
  return persistedReceipt;
};
