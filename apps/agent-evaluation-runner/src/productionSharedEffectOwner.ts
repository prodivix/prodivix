import {
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES,
  createAgentProductionEvaluationRuntimeFactSourceIdentity,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationCapabilityEffectSourceReceipt,
  isAgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
  type AgentJsonValue,
  type AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import type { AgentEvaluationCapabilityRuntimeToolInput } from './capabilityRuntime';
import {
  assertProductionCapabilityExecuteInput,
  createSealedProductionCapabilityAuthorityObservationSource,
  validateProductionCapabilityAuthorityResponse,
  type ProductionCapabilityAuthorityObservation,
  type ProductionCapabilityAuthorityObservationSource,
  type ProductionCapabilityExecuteResponse,
} from './productionCapabilityAuthority';
import type { AgentEvaluationOwnerAuthorityRequest } from './productionOwnerAuthoritySidecar';
import {
  decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth,
  type AgentEvaluationProductionRuntimeFactSourceHealthRegistry,
  type AgentEvaluationProductionRuntimeFactSourceRegistryHealth,
  type AgentEvaluationProductionRuntimeFactSourceRegistryLookup,
} from './productionRuntimeFactSourceHealthRegistry';
import {
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';

export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_STAGE_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-owner-stage' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_RESULT_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-owner-result' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION = 1 as const;

export const PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_AUTHORITY_ID =
  'evaluation.provider-capability.shared-effect-source.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-shared-effect-source-implementation',
    version: 1,
    effectExecution: 'injected-real-owner-registry',
    stageDurability: 'shared-durable',
    resultDurability: 'sealed-before-return',
    reconcile: 'read-sealed-result-only',
    readiness: 'same-real-owner-registry',
    supportedIdentityCount: 15,
  });

const maximumStageBytes = 65_536;
const maximumResultRecordBytes = 16_842_752;
const exactExpectedIdentityCount =
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.length *
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.length;

type SharedEffectToolInput = Extract<
  AgentEvaluationCapabilityRuntimeToolInput,
  Readonly<{ executionAuthorityKind: 'shared-effect' }>
>;

export type AgentEvaluationProductionSharedEffectBinding = Readonly<{
  authorityRequestDigest: CanonicalDigest;
  toolInput: SharedEffectToolInput;
  sourceIdentity: AgentProductionEvaluationRuntimeFactSourceIdentity;
  sourceIdentityDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectStage = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_STAGE_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION;
  authorityRequestDigest: CanonicalDigest;
  preEffectIntentDigest: CanonicalDigest;
  ownerRequestDigest: CanonicalDigest;
  inputAuthorityBindingDigest: CanonicalDigest;
  sourceIdentity: AgentProductionEvaluationRuntimeFactSourceIdentity;
  sourceIdentityDigest: CanonicalDigest;
  registrationReceiptDigest: CanonicalDigest;
  stagedAt: string;
  expiresAt: string;
  stageDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectDispatchAckInput = Readonly<{
  ownerRequestDigest: CanonicalDigest;
  preEffectIntentDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  effectStatus: AgentEvaluationCapabilityEffectSourceReceipt['effectStatus'];
  businessResultDigest: CanonicalDigest;
  sourceFactKind: AgentEvaluationCapabilityEffectSourceReceipt['sourceFactKind'];
  sourceFactDigest: CanonicalDigest | null;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest | null;
  normalizedEventSetDigest: CanonicalDigest;
  sealedAt: string;
}>;

export type AgentEvaluationProductionSharedEffectResult = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_RESULT_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION;
  authorityRequestDigest: CanonicalDigest;
  preEffectIntentDigest: CanonicalDigest;
  ownerRequestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  sourceIdentityDigest: CanonicalDigest;
  effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
  effectSourceReceiptDigest: CanonicalDigest;
  effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
  effectSourceFactDigest: CanonicalDigest | null;
  businessResult: AgentJsonValue;
  businessResultDigest: CanonicalDigest;
  sealedAt: string;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectHealthInput = Readonly<{
  lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup;
  registrationRequest: AgentEvaluationRuntimeFactSourceRegistrationRequest;
  sourceIdentity: AgentProductionEvaluationRuntimeFactSourceIdentity;
}>;

/**
 * The production adapter for this port must resolve the same real
 * provider-metadata or hosted-effect owner used for execute. executeAndSeal
 * persists its exact result before resolving; every read method is side-effect
 * free and may run on a different host.
 */
export interface AgentEvaluationProductionSharedEffectDurableRegistry {
  readonly durability: 'shared-durable';
  readonly effectExecution: 'real-owner-only';
  readonly reconcile: 'read-sealed-only';
  sealStage(
    binding: AgentEvaluationProductionSharedEffectBinding
  ): Promise<AgentEvaluationProductionSharedEffectStage | undefined>;
  readSealedStage(
    binding: AgentEvaluationProductionSharedEffectBinding
  ): Promise<AgentEvaluationProductionSharedEffectStage | undefined>;
  executeAndSeal(
    binding: AgentEvaluationProductionSharedEffectBinding,
    stage: AgentEvaluationProductionSharedEffectStage
  ): Promise<AgentEvaluationProductionSharedEffectResult | undefined>;
  readSealedResult(
    binding: AgentEvaluationProductionSharedEffectBinding,
    stage: AgentEvaluationProductionSharedEffectStage
  ): Promise<AgentEvaluationProductionSharedEffectResult | undefined>;
  sealOwnerReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionRuntimeFactSourceRegistryHealth | undefined
  >;
  readOwnerReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionRuntimeFactSourceRegistryHealth | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

export type CreateProductionAgentEvaluationSharedEffectOwnerInput = Readonly<{
  expectedSourceIdentities: readonly AgentProductionEvaluationRuntimeFactSourceIdentity[];
  registry: AgentEvaluationProductionSharedEffectDurableRegistry;
  forbiddenCanaries: () => readonly string[];
  clock?: () => Date;
}>;

export type ProductionAgentEvaluationSharedEffectOwner = Readonly<{
  observationSource: ProductionCapabilityAuthorityObservationSource;
  healthRegistry: AgentEvaluationProductionRuntimeFactSourceHealthRegistry;
}>;

const fail = (code: string): never => {
  throw new TypeError(`G4_PRODUCTION_SHARED_EFFECT_OWNER_INVALID: ${code}`);
};

const exactRecord = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const boundedCanonical = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumBytes
    );
  } catch {
    return false;
  }
};

const identityKey = (
  identity: Pick<
    AgentProductionEvaluationRuntimeFactSourceIdentity,
    'protocolFamily' | 'capabilityProfileId'
  >
): string => `${identity.protocolFamily}/${identity.capabilityProfileId}`;

const expectedIdentityIndexes = (
  source: readonly AgentProductionEvaluationRuntimeFactSourceIdentity[]
) => {
  if (source.length !== exactExpectedIdentityCount) {
    return fail('expected-identity-count');
  }
  const byKey = new Map<
    string,
    AgentProductionEvaluationRuntimeFactSourceIdentity
  >();
  const byDigest = new Map<
    CanonicalDigest,
    AgentProductionEvaluationRuntimeFactSourceIdentity
  >();
  for (const candidate of source) {
    const identity =
      createAgentProductionEvaluationRuntimeFactSourceIdentity(candidate);
    const key = identityKey(identity);
    const digest = digestAgentCanonicalValue(identity);
    if (byKey.has(key) || byDigest.has(digest)) {
      return fail('expected-identity-duplicate');
    }
    byKey.set(key, identity);
    byDigest.set(digest, identity);
  }
  for (const protocolFamily of AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES) {
    for (const capabilityProfileId of AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES) {
      if (!byKey.has(`${protocolFamily}/${capabilityProfileId}`)) {
        return fail('expected-identity-coverage');
      }
    }
  }
  return Object.freeze({ byKey, byDigest });
};

const sourceIdentityFromToolInput = (
  input: SharedEffectToolInput
): AgentProductionEvaluationRuntimeFactSourceIdentity => {
  const {
    registrationReceiptDigest: _registrationReceiptDigest,
    authorityDigest: _authorityDigest,
    ...identity
  } = input.preEffectIntent.runtimeFactSourceAuthority;
  return createAgentProductionEvaluationRuntimeFactSourceIdentity(identity);
};

const bindingFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  identities: ReturnType<typeof expectedIdentityIndexes>
): AgentEvaluationProductionSharedEffectBinding | undefined => {
  if (request.operation !== 'tool.execute') return undefined;
  const input = assertProductionCapabilityExecuteInput(request);
  if (input.executionAuthorityKind !== 'shared-effect') return undefined;
  const sourceIdentity = sourceIdentityFromToolInput(input);
  const expected = identities.byKey.get(identityKey(sourceIdentity));
  if (!expected || !sameCanonicalJson(sourceIdentity, expected)) {
    return fail('request-source-identity');
  }
  const sourceIdentityDigest = digestAgentCanonicalValue(sourceIdentity);
  return Object.freeze({
    authorityRequestDigest: request.requestDigest,
    toolInput: input,
    sourceIdentity,
    sourceIdentityDigest,
  });
};

export const createAgentEvaluationProductionSharedEffectStage = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  stagedAt: string
): AgentEvaluationProductionSharedEffectStage => {
  const intent = binding.toolInput.preEffectIntent;
  const expiresAt = intent.inputAuthorityBinding.requestRefAuthority.expiresAt;
  if (
    !isAgentControlInstant(stagedAt) ||
    !isAgentControlInstant(expiresAt) ||
    Date.parse(stagedAt) < Date.parse(intent.requestedAt) ||
    Date.parse(stagedAt) > Date.parse(expiresAt) ||
    !sameCanonicalJson(
      binding.sourceIdentity,
      sourceIdentityFromToolInput(binding.toolInput)
    ) ||
    binding.sourceIdentityDigest !==
      digestAgentCanonicalValue(binding.sourceIdentity)
  ) {
    return fail('stage-binding');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_STAGE_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION,
    authorityRequestDigest: binding.authorityRequestDigest,
    preEffectIntentDigest: intent.intentDigest,
    ownerRequestDigest: intent.ownerRequestDigest,
    inputAuthorityBindingDigest: intent.inputAuthorityBinding.bindingDigest,
    sourceIdentity: binding.sourceIdentity,
    sourceIdentityDigest: binding.sourceIdentityDigest,
    registrationReceiptDigest: intent.registrationReceiptDigest,
    stagedAt,
    expiresAt,
  });
  const record = Object.freeze({
    ...base,
    stageDigest: digestAgentCanonicalValue(base),
  });
  if (
    !boundedCanonical(record, maximumStageBytes) ||
    inspectAgentControlJson(record, maximumStageBytes).length > 0
  ) {
    return fail('stage-safety');
  }
  return record;
};

export const decodeAgentEvaluationProductionSharedEffectStage = (
  value: unknown,
  binding: AgentEvaluationProductionSharedEffectBinding
): AgentEvaluationProductionSharedEffectStage => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'authorityRequestDigest',
      'preEffectIntentDigest',
      'ownerRequestDigest',
      'inputAuthorityBindingDigest',
      'sourceIdentity',
      'sourceIdentityDigest',
      'registrationReceiptDigest',
      'stagedAt',
      'expiresAt',
      'stageDigest',
    ]) ||
    !isAgentControlInstant(value.stagedAt)
  ) {
    return fail('stage-shape');
  }
  const recreated = createAgentEvaluationProductionSharedEffectStage(
    binding,
    value.stagedAt
  );
  if (!sameCanonicalJson(value, recreated)) return fail('stage-drift');
  return recreated;
};

export const digestAgentEvaluationProductionSharedEffectDispatchAck = (
  input: AgentEvaluationProductionSharedEffectDispatchAckInput
): CanonicalDigest => {
  if (
    ![
      input.ownerRequestDigest,
      input.preEffectIntentDigest,
      input.stageDigest,
      input.businessResultDigest,
      input.transportReceiptDigest,
      input.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest) ||
    (input.resultSpoolReceiptDigest !== null &&
      !isAgentCanonicalDigest(input.resultSpoolReceiptDigest)) ||
    !['produced', 'unavailable', 'failed'].includes(input.effectStatus) ||
    !isAgentControlInstant(input.sealedAt) ||
    (input.sourceFactDigest !== null &&
      !isAgentCanonicalDigest(input.sourceFactDigest)) ||
    (input.effectStatus === 'produced') !==
      (input.sourceFactKind !== null && input.sourceFactDigest !== null)
  ) {
    return fail('dispatch-ack-input');
  }
  return digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-shared-effect-owner-dispatch-ack',
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION,
    ...input,
  });
};

export const createAgentEvaluationProductionSharedEffectResult = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage,
  input: Readonly<{
    effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
    effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
    businessResult: AgentJsonValue;
  }>
): AgentEvaluationProductionSharedEffectResult => {
  const intent = binding.toolInput.preEffectIntent;
  const receipt = input.effectSourceReceipt;
  const fact = input.effectSourceFact;
  const businessResultDigest = digestAgentCanonicalValue(input.businessResult);
  const factDigest = fact?.factDigest ?? null;
  const expectedAck = digestAgentEvaluationProductionSharedEffectDispatchAck({
    ownerRequestDigest: intent.ownerRequestDigest,
    preEffectIntentDigest: intent.intentDigest,
    stageDigest: stage.stageDigest,
    effectStatus: receipt.effectStatus,
    businessResultDigest,
    sourceFactKind: receipt.sourceFactKind,
    sourceFactDigest: factDigest,
    transportReceiptDigest: receipt.transportReceiptDigest,
    resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: receipt.normalizedEventSetDigest,
    sealedAt: receipt.sealedAt,
  });
  if (
    !sameCanonicalJson(
      stage,
      createAgentEvaluationProductionSharedEffectStage(binding, stage.stagedAt)
    ) ||
    !isAgentEvaluationCapabilityEffectSourceReceipt(receipt, intent) ||
    receipt.stageDigest !== stage.stageDigest ||
    receipt.dispatchAckDigest !== expectedAck ||
    receipt.businessResultDigest !== businessResultDigest ||
    !boundedCanonical(
      input.businessResult,
      binding.toolInput.maximumToolResultBytes
    ) ||
    Date.parse(receipt.sealedAt) < Date.parse(stage.stagedAt) ||
    Date.parse(receipt.sealedAt) > Date.parse(stage.expiresAt) ||
    (receipt.effectStatus === 'produced'
      ? !fact ||
        !isAgentEvaluationProviderCapabilityObservedFact(fact) ||
        fact.factKind !== receipt.sourceFactKind ||
        fact.factDigest !== receipt.sourceFactDigest
      : fact !== null ||
        receipt.sourceFactKind !== null ||
        receipt.sourceFactDigest !== null)
  ) {
    return fail('result-binding');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_RESULT_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_VERSION,
    authorityRequestDigest: binding.authorityRequestDigest,
    preEffectIntentDigest: intent.intentDigest,
    ownerRequestDigest: intent.ownerRequestDigest,
    stageDigest: stage.stageDigest,
    sourceIdentityDigest: binding.sourceIdentityDigest,
    effectSourceReceipt: receipt,
    effectSourceReceiptDigest: receipt.receiptDigest,
    effectSourceFact: fact,
    effectSourceFactDigest: factDigest,
    businessResult: input.businessResult,
    businessResultDigest,
    sealedAt: receipt.sealedAt,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (
    !boundedCanonical(record, maximumResultRecordBytes) ||
    inspectAgentControlJson(record, maximumResultRecordBytes).length > 0
  ) {
    return fail('result-safety');
  }
  return record;
};

export const decodeAgentEvaluationProductionSharedEffectResult = (
  value: unknown,
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage
): AgentEvaluationProductionSharedEffectResult => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'authorityRequestDigest',
      'preEffectIntentDigest',
      'ownerRequestDigest',
      'stageDigest',
      'sourceIdentityDigest',
      'effectSourceReceipt',
      'effectSourceReceiptDigest',
      'effectSourceFact',
      'effectSourceFactDigest',
      'businessResult',
      'businessResultDigest',
      'sealedAt',
      'recordDigest',
    ])
  ) {
    return fail('result-shape');
  }
  const recreated = createAgentEvaluationProductionSharedEffectResult(
    binding,
    stage,
    {
      effectSourceReceipt:
        value.effectSourceReceipt as AgentEvaluationCapabilityEffectSourceReceipt,
      effectSourceFact:
        value.effectSourceFact as AgentEvaluationProviderCapabilitySharedObservedFact | null,
      businessResult: value.businessResult as AgentJsonValue,
    }
  );
  if (!sameCanonicalJson(value, recreated)) return fail('result-drift');
  return recreated;
};

const continuationDigest = (
  input: SharedEffectToolInput,
  resultDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-provider-tool-continuation',
    version: 1,
    requestDigest: input.requestDigest,
    resultDigest,
    specificReceiptDigests: Object.freeze([]),
  });

const responseFromResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  binding: AgentEvaluationProductionSharedEffectBinding,
  result: AgentEvaluationProductionSharedEffectResult
): ProductionCapabilityExecuteResponse => {
  const outcome =
    result.effectSourceReceipt.effectStatus === 'produced'
      ? ('supported' as const)
      : result.effectSourceReceipt.effectStatus === 'unavailable'
        ? ('unsupported' as const)
        : ('failed' as const);
  return validateProductionCapabilityAuthorityResponse(
    request,
    Object.freeze({
      executionAuthorityKind: 'shared-effect' as const,
      outcome,
      result: result.businessResult,
      resultDigest: result.businessResultDigest,
      continuationReceiptDigest: continuationDigest(
        binding.toolInput,
        result.businessResultDigest
      ),
      effectSourceReceipt: result.effectSourceReceipt,
      effectSourceFact: result.effectSourceFact,
      specificReceipts: Object.freeze([]) as readonly [],
    })
  ) as ProductionCapabilityExecuteResponse;
};

const observationFromResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  binding: AgentEvaluationProductionSharedEffectBinding,
  result: AgentEvaluationProductionSharedEffectResult
): ProductionCapabilityAuthorityObservation => {
  const base = Object.freeze({
    sourceAuthorityId:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_AUTHORITY_ID,
    sourceImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_IMPLEMENTATION_DIGEST,
    sourceDurability: 'shared-durable' as const,
    authorityRequestDigest: request.requestDigest,
    sourceStageReceiptDigest: result.stageDigest,
    response: responseFromResult(request, binding, result),
    observedAt: result.sealedAt,
  });
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

const delegatedStageDigest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  delegateStageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-capability-observation-delegated-stage',
    version: 1,
    authorityRequestDigest: request.requestDigest,
    sourceAuthorityId:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_AUTHORITY_ID,
    sourceImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_IMPLEMENTATION_DIGEST,
    delegateStageDigest,
  });

const wrapDelegatedObservation = (
  request: AgentEvaluationOwnerAuthorityRequest,
  value: ProductionCapabilityAuthorityObservation,
  sourceStageReceiptDigest: CanonicalDigest
): ProductionCapabilityAuthorityObservation => {
  const base = Object.freeze({
    sourceAuthorityId:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_AUTHORITY_ID,
    sourceImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_IMPLEMENTATION_DIGEST,
    sourceDurability: 'shared-durable' as const,
    authorityRequestDigest: request.requestDigest,
    sourceStageReceiptDigest,
    response: value.response,
    observedAt: value.observedAt,
  });
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

const registrationRequestFor = (
  lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup,
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity
): AgentEvaluationRuntimeFactSourceRegistrationRequest => {
  const request = createAgentEvaluationRuntimeFactSourceRegistrationRequest({
    namespaceId: lookup.namespaceId,
    repositoryCommit: lookup.repositoryCommit,
    sourceAuthorityKind: identity.kind,
    sourceKind: identity.sourceKind,
    sourceAuthorityId: identity.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    routeBinding: identity.routeBinding,
    capabilityProfileId:
      identity.capabilityProfileId as AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
    capabilityProfileDigest: identity.capabilityProfileDigest,
    capabilityId: identity.capabilityId,
    protocolFamily:
      identity.protocolFamily as AgentProductionEvaluationNativeProtocolFamily,
    providerConfigurationId: identity.providerConfigurationId,
    modelId: identity.modelId,
    modelLineageDigest: identity.modelLineageDigest,
    adapterDigest: identity.adapterDigest,
    ...(identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
        }
      : {}),
    minimumExpiresAt: lookup.minimumExpiresAt,
  });
  if (request.requestDigest !== lookup.registrationRequestDigest) {
    return fail('health-registration-request');
  }
  return request;
};

export const createProductionAgentEvaluationSharedEffectOwner = (
  input: CreateProductionAgentEvaluationSharedEffectOwnerInput
): ProductionAgentEvaluationSharedEffectOwner => {
  if (
    !input.registry ||
    input.registry.durability !== 'shared-durable' ||
    input.registry.effectExecution !== 'real-owner-only' ||
    input.registry.reconcile !== 'read-sealed-only' ||
    ![
      input.registry.sealStage,
      input.registry.readSealedStage,
      input.registry.executeAndSeal,
      input.registry.readSealedResult,
      input.registry.sealOwnerReadiness,
      input.registry.readOwnerReadiness,
      input.registry.close,
      input.forbiddenCanaries,
    ].every((candidate) => typeof candidate === 'function')
  ) {
    return fail('durable-registry-port');
  }
  const identities = expectedIdentityIndexes(input.expectedSourceIdentities);
  const clock = input.clock ?? (() => new Date());
  const delegated =
    createSealedProductionCapabilityAuthorityObservationSource();
  let closed = false;
  let closePromise:
    | Promise<
        Readonly<{
          status: 'clean';
          residualResourceIds: readonly [];
          residualCanaryIds: readonly [];
        }>
      >
    | undefined;

  const assertOpen = () => {
    if (closed) return fail('owner-closed');
  };

  const validateCurrentStage = (
    value: unknown,
    binding: AgentEvaluationProductionSharedEffectBinding,
    requireUnexpired: boolean
  ) => {
    const stage = decodeAgentEvaluationProductionSharedEffectStage(
      value,
      binding
    );
    const now = clock().getTime();
    if (
      !Number.isFinite(now) ||
      Date.parse(stage.stagedAt) > now ||
      (requireUnexpired && Date.parse(stage.expiresAt) < now)
    ) {
      return fail('stage-expiry');
    }
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      stage,
      input.forbiddenCanaries
    );
    return stage;
  };

  const validateSealedResult = (
    value: unknown,
    binding: AgentEvaluationProductionSharedEffectBinding,
    stage: AgentEvaluationProductionSharedEffectStage
  ) => {
    const result = decodeAgentEvaluationProductionSharedEffectResult(
      value,
      binding,
      stage
    );
    if (Date.parse(result.sealedAt) > clock().getTime()) {
      return fail('result-future');
    }
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      result,
      input.forbiddenCanaries
    );
    return result;
  };

  const observationSource: ProductionCapabilityAuthorityObservationSource =
    Object.freeze({
      sourceAuthorityId:
        PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_AUTHORITY_ID,
      sourceImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_SHARED_EFFECT_SOURCE_IMPLEMENTATION_DIGEST,
      sourceDurability: 'shared-durable' as const,
      async stage(request: AgentEvaluationOwnerAuthorityRequest) {
        assertOpen();
        const binding = bindingFor(request, identities);
        if (!binding) {
          const delegateStage = await delegated.stage(request);
          return delegatedStageDigest(request, delegateStage);
        }
        const candidate = await input.registry.sealStage(binding);
        if (!candidate) return fail('stage-unavailable');
        return validateCurrentStage(candidate, binding, true).stageDigest;
      },
      async resolve(request: AgentEvaluationOwnerAuthorityRequest) {
        assertOpen();
        const binding = bindingFor(request, identities);
        if (!binding) {
          const delegateStage = delegatedStageDigest(
            request,
            await delegated.stage(request)
          );
          const value = await delegated.resolve(request);
          return value
            ? wrapDelegatedObservation(request, value, delegateStage)
            : undefined;
        }
        const stageCandidate = await input.registry.readSealedStage(binding);
        if (!stageCandidate) return fail('sealed-stage-unavailable');
        const stage = validateCurrentStage(stageCandidate, binding, true);
        const resultCandidate = await input.registry.executeAndSeal(
          binding,
          stage
        );
        if (!resultCandidate) return fail('effect-result-unavailable');
        return observationFromResult(
          request,
          binding,
          validateSealedResult(resultCandidate, binding, stage)
        );
      },
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        assertOpen();
        const binding = bindingFor(request, identities);
        if (!binding) {
          const delegateStage = delegatedStageDigest(
            request,
            await delegated.stage(request)
          );
          const value = await delegated.reconcile(request);
          return value
            ? wrapDelegatedObservation(request, value, delegateStage)
            : undefined;
        }
        const stageCandidate = await input.registry.readSealedStage(binding);
        if (!stageCandidate) return undefined;
        const stage = validateCurrentStage(stageCandidate, binding, false);
        const resultCandidate = await input.registry.readSealedResult(
          binding,
          stage
        );
        return resultCandidate
          ? observationFromResult(
              request,
              binding,
              validateSealedResult(resultCandidate, binding, stage)
            )
          : undefined;
      },
      async close() {
        closePromise ??= (async () => {
          closed = true;
          const [registryReceipt, delegatedReceipt] = await Promise.all([
            input.registry.close(),
            delegated.close(),
          ]);
          const expected = Object.freeze({
            status: 'clean' as const,
            residualResourceIds: Object.freeze([]) as readonly [],
            residualCanaryIds: Object.freeze([]) as readonly [],
          });
          if (
            !sameCanonicalJson(registryReceipt, expected) ||
            !sameCanonicalJson(delegatedReceipt, expected)
          ) {
            return fail('registry-close');
          }
          return expected;
        })();
        return closePromise;
      },
    });

  const resolveHealth = async (
    mode: 'seal' | 'read',
    lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
  ) => {
    assertOpen();
    if (
      !isAgentControlIdentity(lookup.namespaceId) ||
      !/^[0-9a-f]{40}$/u.test(lookup.repositoryCommit) ||
      !isAgentCanonicalDigest(lookup.registrationRequestDigest) ||
      !isAgentCanonicalDigest(lookup.expectedIdentityDigest) ||
      !isAgentControlInstant(lookup.minimumExpiresAt)
    ) {
      return fail('health-lookup');
    }
    const identity = identities.byDigest.get(lookup.expectedIdentityDigest);
    if (!identity) return undefined;
    const registrationRequest = registrationRequestFor(lookup, identity);
    const candidate = await (mode === 'seal'
      ? input.registry.sealOwnerReadiness({
          lookup,
          registrationRequest,
          sourceIdentity: identity,
        })
      : input.registry.readOwnerReadiness({
          lookup,
          registrationRequest,
          sourceIdentity: identity,
        }));
    if (!candidate) return undefined;
    const value =
      decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth(
        candidate,
        registrationRequest,
        identity,
        clock()
      );
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      value,
      input.forbiddenCanaries
    );
    return value;
  };

  const healthRegistry: AgentEvaluationProductionRuntimeFactSourceHealthRegistry =
    Object.freeze({
      sealReadyHealth: (
        lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
      ) => resolveHealth('seal', lookup),
      readSealedHealth: (
        lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
      ) => resolveHealth('read', lookup),
    });

  return Object.freeze({ observationSource, healthRegistry });
};
