import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type {
  AgentJsonValue,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import {
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeSupportedSemanticProof,
  type AgentCapabilityProbeSupportedSemanticProof,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';
import {
  digestAgentNativeProviderRuntimeResponse,
  normalizeNativeAgentProviderRuntimeEvents,
  type AgentNativeProviderRuntimeFact,
  type AgentNativeProviderRuntimeFactSanitization,
} from './agentNativeProviderAdapters';
import {
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
  isAgentNativeProviderExecutionIdentityAuthority,
  isAgentNativeProviderOptionalCapabilityProfileId,
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  matchAgentNativeProviderOptionalCapabilitySourceBinding,
  resolveAgentNativeProviderOptionalCapabilityCodecAvailability,
  type AgentNativeProviderOptionalCapabilitySourceBinding,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderProtocol,
} from './agentNativeProviderOptionalCapability';
import {
  AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  digestAgentNativeProviderStateReference,
  isAgentNativeProviderStateVaultAuthority,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  type AgentNativeProviderStateReferenceKind,
  type AgentNativeProviderStateVaultAuthority,
  type AgentNativeProviderStateVaultPort,
  type AgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultSealRequestProjection,
} from './agentNativeProviderStateVault';
import type { AgentUsageVector } from './agentProvider.types';

export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_FORMAT =
  'prodivix.agent-native-provider-optional-capability-extraction-candidate' as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_RESPONSE_PROJECTION_FORMAT =
  'prodivix.agent-native-provider-optional-capability-response-projection' as const;
export const AGENT_NATIVE_PROVIDER_CACHE_ISOLATION_AUTHORITY_FORMAT =
  'prodivix.agent-native-provider-cache-isolation-authority' as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION =
  1 as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_MAXIMUM_BYTES =
  32_768 as const;
export const AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_OBSERVATION_DELAY_MS =
  30_000 as const;

const emptySanitization: AgentNativeProviderRuntimeFactSanitization =
  Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  });

export type AgentNativeProviderOptionalCapabilityExtractionBinding =
  AgentNativeProviderOptionalCapabilitySourceBinding &
    Readonly<{
      responseBodyDigest: CanonicalDigest;
      runtimeFactOccurredAt: Instant;
      transportCompletedAt: Instant;
      httpStatus: number;
      attemptId: string;
      taskId: string;
      runId: string;
      generation: number;
      cacheIsolationAuthority: AgentNativeProviderCacheIsolationAuthority | null;
      providerRegion: string | null;
    }>;

type AgentNativeProviderCacheSemanticProof = Extract<
  AgentCapabilityProbeSupportedSemanticProof,
  Readonly<{ proofKind: 'isolated-cache-roundtrip' }>
>;

export type AgentNativeProviderCacheIsolationAuthority = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_CACHE_ISOLATION_AUTHORITY_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION;
  capabilityProfileDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  semanticProof: AgentNativeProviderCacheSemanticProof;
  semanticProofDigest: CanonicalDigest;
  isolationScopeDigest: CanonicalDigest;
  runtimeFactSourceAuthorityDigest: CanonicalDigest;
  providerConfigurationId: string;
  cacheScope: 'task';
  provenCacheIsolation: 'task';
  authorityDigest: CanonicalDigest;
}>;

export type AgentNativeProviderOptionalCapabilityProviderStatus =
  | 'budget-exceeded'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'in-progress'
  | 'incomplete'
  | 'queued'
  | 'requires-action';

export type AgentNativeProviderOptionalCapabilityResponseProjection = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_RESPONSE_PROJECTION_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION;
  protocolFamily: AgentNativeProviderProtocol;
  responseBodyDigest: CanonicalDigest;
  sealedResponseJsonDigest: CanonicalDigest;
  providerStateReferenceKind: AgentNativeProviderStateReferenceKind | null;
  providerStateReferenceDigest: CanonicalDigest | null;
  providerStatus: AgentNativeProviderOptionalCapabilityProviderStatus | null;
  terminalEventType:
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'partial'
    | 'refusal'
    | 'safety-block'
    | 'timed-out'
    | 'truncation'
    | null;
  usageVectorDigest: CanonicalDigest;
  cachedTokenCount: number | null;
  projectionDigest: CanonicalDigest;
}>;

export type AgentNativeProviderOptionalCapabilityExtractionReason =
  | 'native-codec-unavailable'
  | 'cache-hit-unobserved'
  | 'provider-response-structure-invalid'
  | 'provider-state-nonterminal'
  | 'provider-state-not-continuable'
  | 'provider-state-vault-failed'
  | 'provider-state-vault-unavailable';

export type AgentNativeProviderOptionalCapabilityExtractionCandidate =
  Readonly<{
    format: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_FORMAT;
    version: typeof AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION;
    capabilityProfileId:
      | 'g4-provider-background-job'
      | 'g4-provider-isolated-cache'
      | 'g4-provider-reasoning-continuation';
    probeProgramDigest: CanonicalDigest;
    binding: AgentNativeProviderOptionalCapabilityExtractionBinding;
    bindingDigest: CanonicalDigest;
    responseProjection: AgentNativeProviderOptionalCapabilityResponseProjection;
    outcome: 'failed' | 'observed' | 'unavailable';
    reason: AgentNativeProviderOptionalCapabilityExtractionReason | null;
    stateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    stateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    sourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    candidateDigest: CanonicalDigest;
  }>;

export type ExtractAgentNativeProviderOptionalCapabilityInput = Readonly<{
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding;
  sealedResponseJson: AgentJsonValue;
  stateVault: AgentNativeProviderStateVaultPort | null;
  sanitization?: AgentNativeProviderRuntimeFactSanitization;
}>;

const bindingKeys = Object.freeze([
  'protocolFamily',
  'capabilityProfileDigest',
  'invocationId',
  'requestDigest',
  'responseDigest',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'executionIdentityAuthority',
  'observedAt',
  'responseBodyDigest',
  'runtimeFactOccurredAt',
  'transportCompletedAt',
  'httpStatus',
  'attemptId',
  'taskId',
  'runId',
  'generation',
  'cacheIsolationAuthority',
  'providerRegion',
] as const);

const cacheIsolationAuthorityKeys = Object.freeze([
  'format',
  'version',
  'capabilityProfileDigest',
  'probeProgramDigest',
  'semanticProof',
  'semanticProofDigest',
  'isolationScopeDigest',
  'runtimeFactSourceAuthorityDigest',
  'providerConfigurationId',
  'cacheScope',
  'provenCacheIsolation',
  'authorityDigest',
] as const);

const responseProjectionKeys = Object.freeze([
  'format',
  'version',
  'protocolFamily',
  'responseBodyDigest',
  'sealedResponseJsonDigest',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'providerStatus',
  'terminalEventType',
  'usageVectorDigest',
  'cachedTokenCount',
  'projectionDigest',
] as const);

const candidateKeys = Object.freeze([
  'format',
  'version',
  'capabilityProfileId',
  'probeProgramDigest',
  'binding',
  'bindingDigest',
  'responseProjection',
  'outcome',
  'reason',
  'stateVaultSealRequest',
  'stateVaultSealReceipt',
  'sourceReceipt',
  'candidateDigest',
] as const);

const terminalEventTypes = new Set([
  'cancelled',
  'completed',
  'failed',
  'partial',
  'refusal',
  'safety-block',
  'timed-out',
  'truncation',
]);

const safeJson = (
  value: unknown,
  maximumBytes: number,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): value is AgentJsonValue => {
  try {
    return (
      inspectAgentControlJson(value, maximumBytes).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value)) &&
      (sanitization.protectedMaterialCanaries.length === 0 ||
        scanAgentArtifactForProtectedHoldoutLeak(
          value,
          sanitization.protectedMaterialCanaries
        ).length === 0) &&
      (sanitization.secretCanaries.length === 0 ||
        scanAgentArtifactForSecretCanaries(value, sanitization.secretCanaries)
          .length === 0)
    );
  } catch {
    return false;
  }
};

const cacheIsolationAuthorityBase = (
  value: Omit<AgentNativeProviderCacheIsolationAuthority, 'authorityDigest'>
) => Object.freeze({ ...value });

export const createAgentNativeProviderCacheIsolationAuthority = (input: {
  program: AgentCapabilityProbeProgram;
  semanticProof: AgentCapabilityProbeSupportedSemanticProof;
  runtimeFactSourceAuthorityDigest: CanonicalDigest;
  providerConfigurationId: string;
}): AgentNativeProviderCacheIsolationAuthority => {
  if (
    !isAgentCapabilityProbeProgram(input.program) ||
    input.program.profileProjection.capabilityProfileId !==
      'g4-provider-isolated-cache' ||
    !isAgentCapabilityProbeSupportedSemanticProof(
      input.semanticProof,
      input.program
    ) ||
    input.semanticProof.proofKind !== 'isolated-cache-roundtrip' ||
    !isAgentCanonicalDigest(input.runtimeFactSourceAuthorityDigest) ||
    !isAgentControlIdentity(input.providerConfigurationId)
  ) {
    throw new TypeError(
      'Native Provider cache isolation authority is invalid.'
    );
  }
  const base = cacheIsolationAuthorityBase({
    format: AGENT_NATIVE_PROVIDER_CACHE_ISOLATION_AUTHORITY_FORMAT,
    version: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION,
    capabilityProfileDigest:
      input.program.profileProjection.capabilityProfileDigest,
    probeProgramDigest: input.program.programDigest,
    semanticProof: input.semanticProof as AgentNativeProviderCacheSemanticProof,
    semanticProofDigest: input.semanticProof.proofDigest,
    isolationScopeDigest: input.semanticProof.isolationScopeDigest,
    runtimeFactSourceAuthorityDigest: input.runtimeFactSourceAuthorityDigest,
    providerConfigurationId: input.providerConfigurationId,
    cacheScope: 'task',
    provenCacheIsolation: 'task',
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentNativeProviderCacheIsolationAuthority = (
  value: unknown,
  program?: AgentCapabilityProbeProgram
): value is AgentNativeProviderCacheIsolationAuthority => {
  if (!hasExactAgentControlKeys(value, cacheIsolationAuthorityKeys)) {
    return false;
  }
  const authority = value as AgentNativeProviderCacheIsolationAuthority;
  if (
    authority.format !==
      AGENT_NATIVE_PROVIDER_CACHE_ISOLATION_AUTHORITY_FORMAT ||
    authority.version !==
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION ||
    !isAgentCanonicalDigest(authority.capabilityProfileDigest) ||
    !isAgentCanonicalDigest(authority.probeProgramDigest) ||
    !hasExactAgentControlKeys(authority.semanticProof, [
      'proofKind',
      'cacheReceiptDigest',
      'usageVectorDigest',
      'cachePrefixDescriptorDigest',
      'coldPrefixDigest',
      'warmPrefixDigest',
      'coldSuffixDigest',
      'warmSuffixDigest',
      'cacheKeyDigest',
      'coldResponseDigest',
      'warmResponseDigest',
      'usageDeltaDigest',
      'isolationScopeDigest',
      'coldCachedTokenCount',
      'warmCachedTokenCount',
      'cacheHitObserved',
      'proofDigest',
    ]) ||
    authority.semanticProof.proofKind !== 'isolated-cache-roundtrip' ||
    !isAgentCanonicalDigest(authority.semanticProofDigest) ||
    authority.semanticProofDigest !== authority.semanticProof.proofDigest ||
    !isAgentCanonicalDigest(authority.isolationScopeDigest) ||
    authority.isolationScopeDigest !==
      authority.semanticProof.isolationScopeDigest ||
    !isAgentCanonicalDigest(authority.runtimeFactSourceAuthorityDigest) ||
    !isAgentControlIdentity(authority.providerConfigurationId) ||
    authority.cacheScope !== 'task' ||
    authority.provenCacheIsolation !== 'task' ||
    !isAgentCanonicalDigest(authority.authorityDigest)
  ) {
    return false;
  }
  const { proofDigest, ...proofBase } = authority.semanticProof;
  const { authorityDigest, ...base } = authority;
  if (
    proofDigest !== digestAgentCanonicalValue(proofBase) ||
    authorityDigest !== digestAgentCanonicalValue(base)
  ) {
    return false;
  }
  return (
    program === undefined ||
    (isAgentCapabilityProbeSupportedSemanticProof(
      authority.semanticProof,
      program
    ) &&
      program.profileProjection.capabilityProfileId ===
        'g4-provider-isolated-cache' &&
      authority.capabilityProfileDigest ===
        program.profileProjection.capabilityProfileDigest &&
      authority.probeProgramDigest === program.programDigest)
  );
};

const copyBinding = (
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding
): AgentNativeProviderOptionalCapabilityExtractionBinding =>
  Object.freeze({ ...binding });

export const isAgentNativeProviderOptionalCapabilityExtractionBinding = (
  value: unknown
): value is AgentNativeProviderOptionalCapabilityExtractionBinding => {
  if (
    !hasExactAgentControlKeys(value, bindingKeys) ||
    !['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      String(value.protocolFamily)
    ) ||
    !isAgentCanonicalDigest(value.capabilityProfileDigest) ||
    !isAgentControlIdentity(value.invocationId) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.responseDigest) ||
    !isAgentControlIdentity(value.providerConfigurationId) ||
    !isAgentCanonicalDigest(value.modelLineageDigest) ||
    !isAgentCanonicalDigest(value.adapterDigest) ||
    !isAgentNativeProviderExecutionIdentityAuthority(
      value.executionIdentityAuthority
    ) ||
    !isAgentControlInstant(value.observedAt) ||
    !isAgentCanonicalDigest(value.responseBodyDigest) ||
    !isAgentControlInstant(value.runtimeFactOccurredAt) ||
    !isAgentControlInstant(value.transportCompletedAt) ||
    !Number.isSafeInteger(value.httpStatus) ||
    Number(value.httpStatus) < 200 ||
    Number(value.httpStatus) > 299 ||
    !isAgentControlIdentity(value.attemptId) ||
    !isAgentControlIdentity(value.taskId) ||
    !isAgentControlIdentity(value.runId) ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 0 ||
    value.executionIdentityAuthority.invocationId !== value.invocationId ||
    value.executionIdentityAuthority.taskId !== value.taskId ||
    value.executionIdentityAuthority.runId !== value.runId ||
    value.executionIdentityAuthority.generation !== value.generation ||
    (value.cacheIsolationAuthority !== null &&
      !isAgentNativeProviderCacheIsolationAuthority(
        value.cacheIsolationAuthority
      )) ||
    (value.providerRegion !== null &&
      !isAgentControlIdentity(value.providerRegion))
  ) {
    return false;
  }
  const runtimeAt = Date.parse(value.runtimeFactOccurredAt as string);
  const completedAt = Date.parse(value.transportCompletedAt as string);
  const observedAt = Date.parse(value.observedAt as string);
  return (
    runtimeAt <= completedAt &&
    completedAt <= observedAt &&
    observedAt - completedAt <=
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_OBSERVATION_DELAY_MS
  );
};

const normalizedStatus = (
  value: unknown
): AgentNativeProviderOptionalCapabilityProviderStatus | null => {
  switch (value) {
    case 'budget_exceeded':
    case 'budget-exceeded':
      return 'budget-exceeded';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'in_progress':
    case 'in-progress':
      return 'in-progress';
    case 'incomplete':
      return 'incomplete';
    case 'queued':
      return 'queued';
    case 'requires_action':
    case 'requires-action':
      return 'requires-action';
    default:
      return null;
  }
};

const objectValue = (
  value: unknown
): Readonly<Record<string, unknown>> | null =>
  isPlainObject(value) ? value : null;

const responseEvents = (value: AgentJsonValue): readonly unknown[] =>
  Array.isArray(value) ? value : Object.freeze([value]);

const officialState = (
  protocolFamily: AgentNativeProviderProtocol,
  value: AgentJsonValue
): Readonly<{
  valid: boolean;
  callbackLocalHandle: string | null;
  referenceKind: AgentNativeProviderStateReferenceKind | null;
  status: AgentNativeProviderOptionalCapabilityProviderStatus | null;
}> => {
  if (protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      valid: true,
      callbackLocalHandle: null,
      referenceKind: null,
      status: null,
    });
  }
  let callbackLocalHandle: string | null = null;
  let status: AgentNativeProviderOptionalCapabilityProviderStatus | null = null;
  for (const raw of responseEvents(value)) {
    const event = objectValue(raw);
    if (event === null) continue;
    const candidate =
      protocolFamily === 'openai-responses'
        ? (objectValue(event.response) ??
          (event.object === 'response' || Array.isArray(event.output)
            ? event
            : null))
        : (objectValue(event.interaction) ??
          (Array.isArray(event.steps) || Array.isArray(event.outputs)
            ? event
            : null));
    if (candidate === null) continue;
    if (typeof candidate.id === 'string') callbackLocalHandle = candidate.id;
    const candidateStatus = normalizedStatus(candidate.status);
    if (candidateStatus !== null) status = candidateStatus;
  }
  const referenceKind =
    protocolFamily === 'openai-responses'
      ? ('response-id' as const)
      : ('interaction-id' as const);
  const valid =
    callbackLocalHandle !== null &&
    isAgentControlIdentity(callbackLocalHandle) &&
    !containsAgentControlCredentialLikeText(callbackLocalHandle) &&
    status !== null;
  return Object.freeze({
    valid,
    callbackLocalHandle: valid ? callbackLocalHandle : null,
    referenceKind: valid ? referenceKind : null,
    status: valid ? status : null,
  });
};

const directCachedTokenCount = (
  protocolFamily: AgentNativeProviderProtocol,
  value: AgentJsonValue
): number | null => {
  let observed: number | null = null;
  for (const raw of responseEvents(value)) {
    const event = objectValue(raw);
    if (event === null) continue;
    let candidate: unknown;
    if (protocolFamily === 'openai-responses') {
      const response = objectValue(event.response) ?? event;
      candidate = objectValue(
        objectValue(response.usage)?.input_tokens_details
      )?.cached_tokens;
    } else if (protocolFamily === 'gemini-interactions') {
      const interaction = objectValue(event.interaction) ?? event;
      candidate = objectValue(interaction.usage)?.total_cached_tokens;
    } else {
      const message = objectValue(event.message) ?? event;
      candidate = objectValue(
        message.usage ?? event.usage
      )?.cache_read_input_tokens;
    }
    if (Number.isSafeInteger(candidate) && Number(candidate) >= 0) {
      observed = Number(candidate);
    }
  }
  return observed;
};

const terminalEventType = (
  facts: readonly AgentNativeProviderRuntimeFact[]
): AgentNativeProviderOptionalCapabilityResponseProjection['terminalEventType'] => {
  for (let index = facts.length - 1; index >= 0; index -= 1) {
    const fact = facts[index]!;
    if (
      fact.factType === 'provider-event' &&
      terminalEventTypes.has(fact.value.durableEvent.type)
    ) {
      return fact.value.durableEvent
        .type as AgentNativeProviderOptionalCapabilityResponseProjection['terminalEventType'];
    }
  }
  return null;
};

const terminalMatchesOfficialStatus = (
  status: AgentNativeProviderOptionalCapabilityProviderStatus | null,
  terminal: AgentNativeProviderOptionalCapabilityResponseProjection['terminalEventType']
): boolean => {
  switch (status) {
    case 'completed':
    case 'requires-action':
      return terminal === 'completed';
    case 'failed':
    case 'budget-exceeded':
      return terminal === 'failed';
    case 'cancelled':
      return terminal === 'cancelled';
    case 'incomplete':
      return terminal === 'partial' || terminal === 'truncation';
    case 'in-progress':
    case 'queued':
      return true;
    case null:
      return false;
  }
};

const responseProjectionStructureValid = (
  projection: AgentNativeProviderOptionalCapabilityResponseProjection
): boolean => {
  if (projection.protocolFamily === 'anthropic-messages') {
    return (
      projection.providerStateReferenceKind === null &&
      projection.providerStateReferenceDigest === null &&
      projection.providerStatus === null &&
      projection.terminalEventType !== null
    );
  }
  if (
    projection.providerStateReferenceKind === null ||
    projection.providerStateReferenceDigest === null ||
    projection.providerStatus === null
  ) {
    return false;
  }
  return terminalMatchesOfficialStatus(
    projection.providerStatus,
    projection.terminalEventType
  );
};

const usageVector = (
  facts: readonly AgentNativeProviderRuntimeFact[]
): AgentUsageVector => {
  const values = facts.filter(
    (
      fact
    ): fact is Extract<
      AgentNativeProviderRuntimeFact,
      { factType: 'usage-vector' }
    > => fact.factType === 'usage-vector'
  );
  if (values.length !== 1) {
    throw new TypeError('Native Provider usage projection is invalid.');
  }
  return values[0]!.value;
};

const reportedCachedTokenCount = (usage: AgentUsageVector): number | null => {
  const cached = usage.amounts.filter(
    ({ unit, confidence }) =>
      unit === 'cache-read-token' && confidence === 'reported'
  );
  if (cached.length !== 1) return null;
  const value =
    cached[0]!.logicalAmount ??
    cached[0]!.billableAmount ??
    cached[0]!.cachedAmount;
  return value !== undefined && /^(0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : null;
};

type ParsedSealedResponse = Readonly<{
  projection: AgentNativeProviderOptionalCapabilityResponseProjection;
  usageVector: AgentUsageVector;
  callbackLocalProviderStateHandle: string | null;
  structurallyValid: boolean;
}>;

const responseProjectionBase = (
  value: Omit<
    AgentNativeProviderOptionalCapabilityResponseProjection,
    'projectionDigest'
  >
) => Object.freeze({ ...value });

const parseSealedResponse = (
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  sealedResponseJson: AgentJsonValue,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): ParsedSealedResponse => {
  if (
    !safeJson(
      sealedResponseJson,
      program.hardLimits.maximumResponseBytes,
      sanitization
    )
  ) {
    throw new TypeError(
      'Native Provider sealed response is unsafe or unbounded.'
    );
  }
  const facts = normalizeNativeAgentProviderRuntimeEvents(
    binding.protocolFamily,
    responseEvents(sealedResponseJson),
    {
      invocationId: binding.invocationId,
      occurredAt: binding.runtimeFactOccurredAt,
    },
    {
      maximumEvents: Math.max(
        1,
        Math.min(program.hardLimits.maximumNormalizedFacts, 10_000)
      ),
      maximumEventBytes: Math.min(
        program.hardLimits.maximumResponseBytes,
        1_048_576
      ),
      maximumAggregateEventBytes: Math.min(
        program.hardLimits.maximumResponseBytes,
        67_108_864
      ),
      maximumOutputBytes: Math.min(
        program.hardLimits.maximumResponseBytes,
        16_777_216
      ),
      maximumToolCalls: Math.max(1, program.hardLimits.maximumToolCalls),
      maximumToolArgumentBytes: Math.min(
        program.hardLimits.maximumResponseBytes,
        1_048_576
      ),
      maximumAggregateToolArgumentBytes: Math.min(
        program.hardLimits.maximumResponseBytes,
        4_194_304
      ),
    }
  );
  if (
    digestAgentNativeProviderRuntimeResponse(binding.requestDigest, facts) !==
    binding.responseDigest
  ) {
    throw new TypeError(
      'Native Provider sealed response binding does not match normalized facts.'
    );
  }
  const state = officialState(binding.protocolFamily, sealedResponseJson);
  const usage = usageVector(facts);
  const normalizedCached = reportedCachedTokenCount(usage);
  const officialCached = directCachedTokenCount(
    binding.protocolFamily,
    sealedResponseJson
  );
  const cachedTokenCount =
    officialCached !== null && officialCached === normalizedCached
      ? officialCached
      : null;
  const terminal = terminalEventType(facts);
  const stateReferenceDigest =
    state.callbackLocalHandle === null || state.referenceKind === null
      ? null
      : digestAgentNativeProviderStateReference(
          state.referenceKind,
          state.callbackLocalHandle
        );
  const base = responseProjectionBase({
    format:
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_RESPONSE_PROJECTION_FORMAT,
    version: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION,
    protocolFamily: binding.protocolFamily,
    responseBodyDigest: binding.responseBodyDigest,
    sealedResponseJsonDigest: digestAgentCanonicalValue(sealedResponseJson),
    providerStateReferenceKind: state.referenceKind,
    providerStateReferenceDigest: stateReferenceDigest,
    providerStatus: state.status,
    terminalEventType: terminal,
    usageVectorDigest: usage.vectorDigest,
    cachedTokenCount,
  });
  const projection = Object.freeze({
    ...base,
    projectionDigest: digestAgentCanonicalValue(base),
  });
  return Object.freeze({
    projection,
    usageVector: usage,
    callbackLocalProviderStateHandle: state.callbackLocalHandle,
    structurallyValid: responseProjectionStructureValid(projection),
  });
};

export const isAgentNativeProviderOptionalCapabilityResponseProjection = (
  value: unknown
): value is AgentNativeProviderOptionalCapabilityResponseProjection => {
  if (
    !hasExactAgentControlKeys(value, responseProjectionKeys) ||
    value.format !==
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_RESPONSE_PROJECTION_FORMAT ||
    value.version !==
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION ||
    !['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      String(value.protocolFamily)
    ) ||
    !isAgentCanonicalDigest(value.responseBodyDigest) ||
    !isAgentCanonicalDigest(value.sealedResponseJsonDigest) ||
    ![null, 'interaction-id', 'response-id'].includes(
      value.providerStateReferenceKind as null
    ) ||
    (value.providerStateReferenceDigest !== null &&
      !isAgentCanonicalDigest(value.providerStateReferenceDigest)) ||
    ![
      null,
      'budget-exceeded',
      'cancelled',
      'completed',
      'failed',
      'in-progress',
      'incomplete',
      'queued',
      'requires-action',
    ].includes(value.providerStatus as null) ||
    ![
      null,
      'cancelled',
      'completed',
      'failed',
      'partial',
      'refusal',
      'safety-block',
      'timed-out',
      'truncation',
    ].includes(value.terminalEventType as null) ||
    !isAgentCanonicalDigest(value.usageVectorDigest) ||
    (value.cachedTokenCount !== null &&
      (!Number.isSafeInteger(value.cachedTokenCount) ||
        Number(value.cachedTokenCount) < 0)) ||
    !isAgentCanonicalDigest(value.projectionDigest)
  ) {
    return false;
  }
  if (
    (value.providerStateReferenceKind === null) !==
      (value.providerStateReferenceDigest === null) ||
    (value.protocolFamily === 'openai-responses' &&
      value.providerStateReferenceKind !== null &&
      value.providerStateReferenceKind !== 'response-id') ||
    (value.protocolFamily === 'gemini-interactions' &&
      value.providerStateReferenceKind !== null &&
      value.providerStateReferenceKind !== 'interaction-id') ||
    (value.protocolFamily === 'anthropic-messages' &&
      (value.providerStateReferenceKind !== null ||
        value.providerStateReferenceDigest !== null ||
        value.providerStatus !== null))
  ) {
    return false;
  }
  const { projectionDigest, ...base } = value;
  return projectionDigest === digestAgentCanonicalValue(base);
};

const addMilliseconds = (value: Instant, durationMs: number): Instant =>
  new Date(Date.parse(value) + durationMs).toISOString() as Instant;

const createVaultRequest = (
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  response: AgentNativeProviderOptionalCapabilityResponseProjection,
  authorityDigest: CanonicalDigest
): AgentNativeProviderStateVaultSealRequestProjection => {
  if (
    binding.protocolFamily === 'anthropic-messages' ||
    response.providerStateReferenceKind === null ||
    response.providerStateReferenceDigest === null
  ) {
    throw new TypeError('Native Provider state vault request is invalid.');
  }
  return createAgentNativeProviderStateVaultSealRequest({
    authorityDigest,
    purpose:
      program.profileProjection.capabilityProfileId ===
      'g4-provider-background-job'
        ? 'background-job-state'
        : 'reasoning-continuation-state',
    attemptId: binding.attemptId,
    protocolFamily: binding.protocolFamily,
    providerStateReferenceKind: response.providerStateReferenceKind,
    providerStateReferenceDigest: response.providerStateReferenceDigest,
    probeProgramDigest: program.programDigest,
    capabilityProfileDigest: binding.capabilityProfileDigest,
    invocationId: binding.invocationId,
    requestDigest: binding.requestDigest,
    responseDigest: binding.responseDigest,
    responseBodyDigest: binding.responseBodyDigest,
    sealedResponseJsonDigest: response.sealedResponseJsonDigest,
    providerConfigurationId: binding.providerConfigurationId,
    modelLineageDigest: binding.modelLineageDigest,
    adapterDigest: binding.adapterDigest,
    taskId: binding.taskId,
    runId: binding.runId,
    generation: binding.generation,
    observedAt: binding.observedAt,
    expiresAt: addMilliseconds(
      binding.observedAt,
      AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS
    ),
  });
};

const isVaultRequestProjectionSelf = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  response: AgentNativeProviderOptionalCapabilityResponseProjection
): value is AgentNativeProviderStateVaultSealRequestProjection => {
  if (!isAgentNativeProviderStateVaultSealRequest(value)) return false;
  try {
    return sameCanonicalJson(
      value,
      createVaultRequest(program, binding, response, value.authorityDigest)
    );
  } catch {
    return false;
  }
};

export const digestAgentNativeProviderCacheKeyAuthority = (
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding
): CanonicalDigest => {
  const descriptor = program.providerRequestIntent.cachePrefixResource;
  const isolationAuthority = binding.cacheIsolationAuthority;
  if (
    program.profileProjection.capabilityProfileId !==
      'g4-provider-isolated-cache' ||
    descriptor === null ||
    !isAgentNativeProviderOptionalCapabilityExtractionBinding(binding) ||
    !isAgentNativeProviderCacheIsolationAuthority(
      isolationAuthority,
      program
    ) ||
    isolationAuthority.providerConfigurationId !==
      binding.providerConfigurationId
  ) {
    throw new TypeError('Native Provider cache key authority is invalid.');
  }
  return digestAgentCanonicalValue({
    kind: 'sealed-provider-prefix-cache-key',
    protocolFamily: binding.protocolFamily,
    capabilityProfileDigest: binding.capabilityProfileDigest,
    providerConfigurationId: binding.providerConfigurationId,
    modelLineageDigest: binding.modelLineageDigest,
    prefixDescriptorDigest: descriptor.descriptorDigest,
    prefixDigest: descriptor.prefixDigest,
    cacheIsolationAuthorityDigest: isolationAuthority.authorityDigest,
    cacheScope: isolationAuthority.cacheScope,
    provenCacheIsolation: isolationAuthority.provenCacheIsolation,
  });
};

const candidateBase = (
  value: Omit<
    AgentNativeProviderOptionalCapabilityExtractionCandidate,
    'candidateDigest'
  >
) => Object.freeze({ ...value });

const createCandidate = (
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  responseProjection: AgentNativeProviderOptionalCapabilityResponseProjection,
  input: Readonly<{
    outcome: AgentNativeProviderOptionalCapabilityExtractionCandidate['outcome'];
    reason: AgentNativeProviderOptionalCapabilityExtractionReason | null;
    stateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    stateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    sourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
  }>,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): AgentNativeProviderOptionalCapabilityExtractionCandidate => {
  const frozenBinding = copyBinding(binding);
  const base = candidateBase({
    format: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_FORMAT,
    version: AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION,
    capabilityProfileId: program.profileProjection.capabilityProfileId as
      | 'g4-provider-background-job'
      | 'g4-provider-isolated-cache'
      | 'g4-provider-reasoning-continuation',
    probeProgramDigest: program.programDigest,
    binding: frozenBinding,
    bindingDigest: digestAgentCanonicalValue(frozenBinding),
    responseProjection,
    outcome: input.outcome,
    reason: input.reason,
    stateVaultSealRequest: input.stateVaultSealRequest,
    stateVaultSealReceipt: input.stateVaultSealReceipt,
    sourceReceipt: input.sourceReceipt,
  });
  const candidate = Object.freeze({
    ...base,
    candidateDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safeJson(
      candidate,
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_MAXIMUM_BYTES,
      sanitization
    )
  ) {
    throw new TypeError(
      'Native Provider optional capability extraction candidate is unsafe or unbounded.'
    );
  }
  return candidate;
};

const sealState = async (
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  parsed: ParsedSealedResponse,
  stateVault: AgentNativeProviderStateVaultPort | null,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): Promise<
  Readonly<{
    request: AgentNativeProviderStateVaultSealRequestProjection | null;
    receipt: AgentNativeProviderStateVaultSealReceipt | null;
    failureReason:
      'provider-state-vault-failed' | 'provider-state-vault-unavailable' | null;
  }>
> => {
  if (
    parsed.callbackLocalProviderStateHandle === null ||
    parsed.projection.providerStateReferenceDigest === null ||
    parsed.projection.providerStateReferenceKind === null
  ) {
    return Object.freeze({
      request: null,
      receipt: null,
      failureReason: 'provider-state-vault-failed',
    });
  }
  if (stateVault === null) {
    return Object.freeze({
      request: null,
      receipt: null,
      failureReason: 'provider-state-vault-unavailable',
    });
  }
  if (!isAgentNativeProviderStateVaultAuthority(stateVault.authority)) {
    throw new TypeError('Native Provider state vault port is invalid.');
  }
  const request = createVaultRequest(
    program,
    binding,
    parsed.projection,
    stateVault.authority.authorityDigest
  );
  try {
    const result = await stateVault.seal(
      Object.freeze({
        request,
        callbackLocalProviderStateHandle:
          parsed.callbackLocalProviderStateHandle,
      })
    );
    const receipt = createAgentNativeProviderStateVaultSealReceipt(
      request,
      result,
      sanitization
    );
    return Object.freeze({
      request,
      receipt,
      failureReason:
        receipt.status === 'sealed'
          ? null
          : receipt.status === 'unavailable'
            ? 'provider-state-vault-unavailable'
            : 'provider-state-vault-failed',
    });
  } catch {
    return Object.freeze({
      request,
      receipt: null,
      failureReason: 'provider-state-vault-failed',
    });
  }
};

const sourceBinding = (
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding
): AgentNativeProviderOptionalCapabilitySourceBinding =>
  Object.freeze({
    protocolFamily: binding.protocolFamily,
    capabilityProfileDigest: binding.capabilityProfileDigest,
    invocationId: binding.invocationId,
    requestDigest: binding.requestDigest,
    responseDigest: binding.responseDigest,
    providerConfigurationId: binding.providerConfigurationId,
    modelLineageDigest: binding.modelLineageDigest,
    adapterDigest: binding.adapterDigest,
    executionIdentityAuthority: binding.executionIdentityAuthority,
    observedAt: binding.observedAt,
  });

/**
 * Extracts only facts observed in one sealed official Provider response. The
 * static codec table can produce an unavailable outcome; it never produces an
 * observed fact or release support authority.
 */
export const extractAgentNativeProviderOptionalCapability = async (
  program: AgentCapabilityProbeProgram,
  input: ExtractAgentNativeProviderOptionalCapabilityInput
): Promise<AgentNativeProviderOptionalCapabilityExtractionCandidate> => {
  const sanitization = input.sanitization ?? emptySanitization;
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !isAgentNativeProviderOptionalCapabilityProfileId(
      program.profileProjection.capabilityProfileId
    ) ||
    !isAgentNativeProviderOptionalCapabilityExtractionBinding(input.binding) ||
    input.binding.capabilityProfileDigest !==
      program.profileProjection.capabilityProfileDigest ||
    (program.profileProjection.capabilityProfileId ===
    'g4-provider-isolated-cache'
      ? !isAgentNativeProviderCacheIsolationAuthority(
          input.binding.cacheIsolationAuthority,
          program
        ) ||
        input.binding.cacheIsolationAuthority.providerConfigurationId !==
          input.binding.providerConfigurationId
      : input.binding.cacheIsolationAuthority !== null)
  ) {
    throw new TypeError(
      'Native Provider optional capability extraction input is invalid.'
    );
  }
  const parsed = parseSealedResponse(
    program,
    input.binding,
    input.sealedResponseJson,
    sanitization
  );
  const availability =
    resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
      input.binding.protocolFamily,
      program.profileProjection.capabilityProfileId
    );
  if (availability.availability === 'unavailable') {
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome: 'unavailable',
        reason: 'native-codec-unavailable',
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        sourceReceipt: null,
      },
      sanitization
    );
  }
  if (!parsed.structurallyValid) {
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome: 'failed',
        reason: 'provider-response-structure-invalid',
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        sourceReceipt: null,
      },
      sanitization
    );
  }

  const profile = program.profileProjection.capabilityProfileId;
  if (profile === 'g4-provider-isolated-cache') {
    const cacheIsolationAuthority = input.binding.cacheIsolationAuthority!;
    const completed =
      input.binding.protocolFamily === 'anthropic-messages'
        ? parsed.projection.terminalEventType === 'completed'
        : parsed.projection.providerStatus === 'completed' &&
          terminalMatchesOfficialStatus(
            parsed.projection.providerStatus,
            parsed.projection.terminalEventType
          );
    if (
      input.binding.protocolFamily !== 'anthropic-messages' &&
      parsed.projection.providerStatus === 'completed' &&
      !completed
    ) {
      return createCandidate(
        program,
        input.binding,
        parsed.projection,
        {
          outcome: 'failed',
          reason: 'provider-response-structure-invalid',
          stateVaultSealRequest: null,
          stateVaultSealReceipt: null,
          sourceReceipt: null,
        },
        sanitization
      );
    }
    if (
      !completed ||
      parsed.projection.cachedTokenCount === null ||
      parsed.projection.cachedTokenCount <= 0
    ) {
      return createCandidate(
        program,
        input.binding,
        parsed.projection,
        {
          outcome: 'unavailable',
          reason: 'cache-hit-unobserved',
          stateVaultSealRequest: null,
          stateVaultSealReceipt: null,
          sourceReceipt: null,
        },
        sanitization
      );
    }
    const sourceReceipt =
      createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        {
          ...sourceBinding(input.binding),
          source: Object.freeze({
            sourceKind: 'provider-cache-usage' as const,
            cacheIsolationAuthorityDigest:
              cacheIsolationAuthority.authorityDigest,
            cacheKeyDigest: digestAgentNativeProviderCacheKeyAuthority(
              program,
              input.binding
            ),
            prefixDescriptorDigest:
              program.providerRequestIntent.cachePrefixResource!
                .descriptorDigest,
            usageVector: parsed.usageVector,
            cachedTokenCount: parsed.projection.cachedTokenCount,
            cacheScope: cacheIsolationAuthority.cacheScope,
            provenIsolation: cacheIsolationAuthority.provenCacheIsolation,
            providerRegion: input.binding.providerRegion,
          }),
        },
        sanitization
      );
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome: 'observed',
        reason: null,
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        sourceReceipt,
      },
      sanitization
    );
  }

  const nonterminal =
    parsed.projection.providerStatus === 'queued' ||
    parsed.projection.providerStatus === 'in-progress';
  const continuable =
    parsed.projection.providerStatus === 'completed' ||
    (profile === 'g4-provider-reasoning-continuation' &&
      parsed.projection.providerStatus === 'requires-action');
  const terminalJob =
    profile === 'g4-provider-background-job' &&
    ['cancelled', 'completed', 'failed'].includes(
      parsed.projection.providerStatus ?? ''
    );
  if (
    (continuable || terminalJob) &&
    !terminalMatchesOfficialStatus(
      parsed.projection.providerStatus,
      parsed.projection.terminalEventType
    )
  ) {
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome: 'failed',
        reason: 'provider-response-structure-invalid',
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        sourceReceipt: null,
      },
      sanitization
    );
  }
  if (!nonterminal && !continuable && !terminalJob) {
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome: 'unavailable',
        reason: 'provider-state-not-continuable',
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        sourceReceipt: null,
      },
      sanitization
    );
  }

  const sealed = await sealState(
    program,
    input.binding,
    parsed,
    input.stateVault,
    sanitization
  );
  if (sealed.failureReason !== null || sealed.receipt?.status !== 'sealed') {
    return createCandidate(
      program,
      input.binding,
      parsed.projection,
      {
        outcome:
          sealed.failureReason === 'provider-state-vault-failed'
            ? 'failed'
            : 'unavailable',
        reason: sealed.failureReason ?? 'provider-state-vault-unavailable',
        stateVaultSealRequest: sealed.request,
        stateVaultSealReceipt: sealed.receipt,
        sourceReceipt: null,
      },
      sanitization
    );
  }
  const stateReferenceDigest = parsed.projection.providerStateReferenceDigest!;
  const opaqueProviderStateRef = sealed.receipt.opaqueProviderStateRef!;
  const sourceReceipt =
    profile === 'g4-provider-background-job'
      ? nonterminal
        ? createAgentNativeProviderOptionalCapabilitySourceReceipt(
            program,
            {
              ...sourceBinding(input.binding),
              source: Object.freeze({
                sourceKind: 'provider-job-active-status' as const,
                providerStateReferenceDigest: stateReferenceDigest,
                opaqueProviderStateRef,
                stateVaultAuthorityDigest: sealed.receipt.authorityDigest,
                stateVaultSealRequestDigest: sealed.receipt.sealRequestDigest,
                stateVaultSealReceiptDigest: sealed.receipt.receiptDigest,
                taskId: input.binding.taskId,
                runId: input.binding.runId,
                generation: input.binding.generation,
                providerStatus: parsed.projection.providerStatus as
                  'in-progress' | 'queued',
              }),
            },
            sanitization
          )
        : createAgentNativeProviderOptionalCapabilitySourceReceipt(
            program,
            {
              ...sourceBinding(input.binding),
              source: Object.freeze({
                sourceKind: 'provider-job-terminal-status' as const,
                providerStateReferenceDigest: stateReferenceDigest,
                opaqueProviderStateRef,
                stateVaultAuthorityDigest: sealed.receipt.authorityDigest,
                stateVaultSealRequestDigest: sealed.receipt.sealRequestDigest,
                stateVaultSealReceiptDigest: sealed.receipt.receiptDigest,
                taskId: input.binding.taskId,
                runId: input.binding.runId,
                generation: input.binding.generation,
                providerStatus: parsed.projection.providerStatus as
                  'cancelled' | 'completed' | 'failed',
              }),
            },
            sanitization
          )
      : createAgentNativeProviderOptionalCapabilitySourceReceipt(
          program,
          {
            ...sourceBinding(input.binding),
            source: Object.freeze({
              sourceKind: 'provider-stored-continuation' as const,
              providerStateReferenceDigest: stateReferenceDigest,
              opaqueProviderStateRef,
              stateVaultAuthorityDigest: sealed.receipt.authorityDigest,
              stateVaultSealRequestDigest: sealed.receipt.sealRequestDigest,
              stateVaultSealReceiptDigest: sealed.receipt.receiptDigest,
              taskId: input.binding.taskId,
              runId: input.binding.runId,
              generation: input.binding.generation,
              expiresAt: sealed.receipt.expiresAt!,
            }),
          },
          sanitization
        );
  return createCandidate(
    program,
    input.binding,
    parsed.projection,
    {
      outcome: 'observed',
      reason: null,
      stateVaultSealRequest: sealed.request,
      stateVaultSealReceipt: sealed.receipt,
      sourceReceipt,
    },
    sanitization
  );
};

const candidateSemanticsMatch = (
  candidate: AgentNativeProviderOptionalCapabilityExtractionCandidate,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): boolean => {
  const profile = candidate.capabilityProfileId;
  const source = candidate.sourceReceipt;
  if (candidate.outcome === 'observed') {
    if (candidate.reason !== null || source === null) return false;
    if (
      !isAgentNativeProviderOptionalCapabilitySourceReceipt(
        source,
        program,
        sanitization
      ) ||
      !matchAgentNativeProviderOptionalCapabilitySourceBinding(
        source,
        program,
        sourceBinding(candidate.binding)
      )
    ) {
      return false;
    }
    if (profile === 'g4-provider-isolated-cache') {
      return (
        candidate.stateVaultSealRequest === null &&
        candidate.stateVaultSealReceipt === null &&
        source.source.sourceKind === 'provider-cache-usage' &&
        source.source.cachedTokenCount ===
          candidate.responseProjection.cachedTokenCount &&
        source.source.usageVector.vectorDigest ===
          candidate.responseProjection.usageVectorDigest &&
        source.source.cacheKeyDigest ===
          digestAgentNativeProviderCacheKeyAuthority(
            program,
            candidate.binding
          ) &&
        source.source.cacheIsolationAuthorityDigest ===
          candidate.binding.cacheIsolationAuthority?.authorityDigest &&
        (candidate.binding.protocolFamily === 'anthropic-messages'
          ? candidate.responseProjection.terminalEventType === 'completed'
          : candidate.responseProjection.providerStatus === 'completed' &&
            terminalMatchesOfficialStatus(
              candidate.responseProjection.providerStatus,
              candidate.responseProjection.terminalEventType
            ))
      );
    }
    const request = candidate.stateVaultSealRequest;
    const receipt = candidate.stateVaultSealReceipt;
    if (request === null || receipt === null || receipt.status !== 'sealed') {
      return false;
    }
    if (
      receipt.sealRequestDigest !== request.sealRequestDigest ||
      receipt.providerStateReferenceDigest !==
        candidate.responseProjection.providerStateReferenceDigest ||
      source.source.sourceKind === 'provider-cache-usage'
    ) {
      return false;
    }
    const sourceMatches =
      source.source.providerStateReferenceDigest ===
        candidate.responseProjection.providerStateReferenceDigest &&
      source.source.opaqueProviderStateRef === receipt.opaqueProviderStateRef &&
      source.source.stateVaultAuthorityDigest === receipt.authorityDigest &&
      source.source.stateVaultSealRequestDigest === receipt.sealRequestDigest &&
      source.source.stateVaultSealReceiptDigest === receipt.receiptDigest &&
      (source.source.sourceKind !== 'provider-stored-continuation' ||
        source.source.expiresAt === receipt.expiresAt);
    if (!sourceMatches) return false;
    if (source.source.sourceKind === 'provider-job-active-status') {
      return (
        source.source.providerStatus ===
          candidate.responseProjection.providerStatus &&
        candidate.responseProjection.terminalEventType === null
      );
    }
    return (
      terminalMatchesOfficialStatus(
        candidate.responseProjection.providerStatus,
        candidate.responseProjection.terminalEventType
      ) &&
      (source.source.sourceKind === 'provider-job-terminal-status'
        ? source.source.providerStatus ===
          candidate.responseProjection.providerStatus
        : source.source.sourceKind === 'provider-stored-continuation')
    );
  }
  if (source !== null || candidate.reason === null) return false;
  const failedReason =
    candidate.reason === 'provider-response-structure-invalid' ||
    candidate.reason === 'provider-state-vault-failed';
  if ((candidate.outcome === 'failed') !== failedReason) return false;
  if (candidate.reason === 'native-codec-unavailable') {
    return (
      resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
        candidate.binding.protocolFamily,
        profile
      ).availability === 'unavailable' &&
      candidate.stateVaultSealRequest === null &&
      candidate.stateVaultSealReceipt === null
    );
  }
  if (candidate.reason === 'cache-hit-unobserved') {
    return (
      profile === 'g4-provider-isolated-cache' &&
      candidate.stateVaultSealRequest === null &&
      candidate.stateVaultSealReceipt === null &&
      (candidate.responseProjection.cachedTokenCount === null ||
        candidate.responseProjection.cachedTokenCount === 0 ||
        candidate.responseProjection.providerStatus !== 'completed')
    );
  }
  if (candidate.reason === 'provider-response-structure-invalid') {
    return (
      candidate.stateVaultSealRequest === null &&
      candidate.stateVaultSealReceipt === null &&
      !responseProjectionStructureValid(candidate.responseProjection)
    );
  }
  if (candidate.reason === 'provider-state-not-continuable') {
    return (
      profile !== 'g4-provider-isolated-cache' &&
      candidate.stateVaultSealRequest === null &&
      candidate.stateVaultSealReceipt === null &&
      !['completed', 'in-progress', 'queued'].includes(
        candidate.responseProjection.providerStatus ?? ''
      ) &&
      !(
        profile === 'g4-provider-reasoning-continuation' &&
        candidate.responseProjection.providerStatus === 'requires-action'
      )
    );
  }
  if (
    candidate.stateVaultSealRequest === null ||
    candidate.stateVaultSealReceipt === null
  ) {
    return candidate.reason === 'provider-state-vault-unavailable'
      ? candidate.stateVaultSealRequest === null &&
          candidate.stateVaultSealReceipt === null
      : candidate.reason === 'provider-state-vault-failed' &&
          candidate.stateVaultSealRequest !== null &&
          candidate.stateVaultSealReceipt === null;
  }
  if (
    candidate.stateVaultSealReceipt.sealRequestDigest !==
      candidate.stateVaultSealRequest.sealRequestDigest ||
    candidate.stateVaultSealReceipt.providerStateReferenceDigest !==
      candidate.stateVaultSealRequest.providerStateReferenceDigest
  ) {
    return false;
  }
  if (candidate.reason === 'provider-state-nonterminal') {
    return (
      ['in-progress', 'queued'].includes(
        candidate.responseProjection.providerStatus ?? ''
      ) && candidate.stateVaultSealReceipt.status === 'sealed'
    );
  }
  return candidate.reason === 'provider-state-vault-unavailable'
    ? candidate.stateVaultSealReceipt.status === 'unavailable'
    : candidate.reason === 'provider-state-vault-failed' &&
        candidate.stateVaultSealReceipt.status === 'failed';
};

const nestedVaultEvidenceMatches = (
  candidate: AgentNativeProviderOptionalCapabilityExtractionCandidate,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): boolean => {
  const request = candidate.stateVaultSealRequest;
  const receipt = candidate.stateVaultSealReceipt;
  if (request === null) return receipt === null;
  return (
    isVaultRequestProjectionSelf(
      request,
      program,
      candidate.binding,
      candidate.responseProjection
    ) &&
    (receipt === null ||
      isAgentNativeProviderStateVaultSealReceipt(
        receipt,
        request,
        sanitization
      ))
  );
};

const candidateRootsMatch = (
  candidate: AgentNativeProviderOptionalCapabilityExtractionCandidate,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): boolean =>
  nestedVaultEvidenceMatches(candidate, program, sanitization) &&
  candidateSemanticsMatch(candidate, program, sanitization);

export const isAgentNativeProviderOptionalCapabilityExtractionCandidate = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): value is AgentNativeProviderOptionalCapabilityExtractionCandidate => {
  if (
    !hasExactAgentControlKeys(value, candidateKeys) ||
    value.format !==
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_FORMAT ||
    value.version !==
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_VERSION ||
    !isAgentCapabilityProbeProgram(program) ||
    value.probeProgramDigest !== program.programDigest ||
    value.capabilityProfileId !==
      program.profileProjection.capabilityProfileId ||
    !isAgentNativeProviderOptionalCapabilityProfileId(
      value.capabilityProfileId as never
    ) ||
    !isAgentNativeProviderOptionalCapabilityExtractionBinding(value.binding) ||
    value.binding.capabilityProfileDigest !==
      program.profileProjection.capabilityProfileDigest ||
    (value.capabilityProfileId === 'g4-provider-isolated-cache'
      ? !isAgentNativeProviderCacheIsolationAuthority(
          value.binding.cacheIsolationAuthority,
          program
        ) ||
        value.binding.cacheIsolationAuthority.providerConfigurationId !==
          value.binding.providerConfigurationId
      : value.binding.cacheIsolationAuthority !== null) ||
    value.bindingDigest !== digestAgentCanonicalValue(value.binding) ||
    !isAgentNativeProviderOptionalCapabilityResponseProjection(
      value.responseProjection
    ) ||
    value.responseProjection.protocolFamily !== value.binding.protocolFamily ||
    value.responseProjection.responseBodyDigest !==
      value.binding.responseBodyDigest ||
    !['failed', 'observed', 'unavailable'].includes(String(value.outcome)) ||
    ![
      null,
      'native-codec-unavailable',
      'cache-hit-unobserved',
      'provider-response-structure-invalid',
      'provider-state-nonterminal',
      'provider-state-not-continuable',
      'provider-state-vault-failed',
      'provider-state-vault-unavailable',
    ].includes(value.reason as null) ||
    !isAgentCanonicalDigest(value.candidateDigest)
  ) {
    return false;
  }
  const candidate =
    value as AgentNativeProviderOptionalCapabilityExtractionCandidate;
  const { candidateDigest, ...base } = candidate;
  return (
    candidateDigest === digestAgentCanonicalValue(base) &&
    safeJson(
      candidate,
      AGENT_NATIVE_PROVIDER_OPTIONAL_CAPABILITY_EXTRACTION_MAXIMUM_BYTES,
      sanitization
    ) &&
    candidateRootsMatch(candidate, program, sanitization)
  );
};

export const matchAgentNativeProviderOptionalCapabilityExtractionBinding = (
  candidate: AgentNativeProviderOptionalCapabilityExtractionCandidate,
  program: AgentCapabilityProbeProgram,
  binding: AgentNativeProviderOptionalCapabilityExtractionBinding,
  expectedStateVaultAuthority: AgentNativeProviderStateVaultAuthority | null,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): boolean => {
  if (
    !isAgentNativeProviderOptionalCapabilityExtractionCandidate(
      candidate,
      program,
      sanitization
    ) ||
    !sameCanonicalJson(candidate.binding, binding)
  ) {
    return false;
  }
  if (candidate.stateVaultSealRequest === null) {
    return expectedStateVaultAuthority === null;
  }
  return (
    expectedStateVaultAuthority !== null &&
    isAgentNativeProviderStateVaultAuthority(expectedStateVaultAuthority) &&
    candidate.stateVaultSealRequest.authorityDigest ===
      expectedStateVaultAuthority.authorityDigest
  );
};
