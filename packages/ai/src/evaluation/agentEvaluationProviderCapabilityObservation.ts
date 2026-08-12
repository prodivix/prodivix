import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  containsAgentControlCredentialLikeText,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  CanonicalDigest,
  Instant,
  AgentProviderProtocolFamily,
} from '../domain/agent.types';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import type { AgentRetrievalQueryReceipt } from '../hosted/agentHosted.types';
import type {
  AgentOpaqueContinuationRef,
  AgentProviderCacheReceipt,
  AgentProviderEvent,
  AgentProviderJobReceipt,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import { createAgentProviderEvent } from '../providers/agentInvocationFacts';
import { normalizeAgentProviderRuntimePayload } from '../providers/agentProviderRuntime';
import {
  isAgentEvaluationProviderCacheCapabilityFact,
  isAgentEvaluationProviderJobCapabilityFact,
  isAgentEvaluationProviderOpaqueContinuationCapabilityFact,
  isAgentEvaluationRetrievalQueryCapabilityFact,
  isAgentEvaluationUsageVectorCapabilityFact,
} from './agentEvaluationCapabilitySpecificAuthorityValidation';
import type { AgentEvaluationCapabilityDescriptor } from './agentEvaluationCapabilityExecution';
import {
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
} from './agentEvaluationCapabilitySpecificReceipt';
import type { AgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluation.types';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  isAgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilityPreEffectIntent,
} from './agentEvaluationCapabilityEffectAuthority';

export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_FORMAT =
  'prodivix.agent-evaluation-provider-capability-observation-receipt' as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_VERSION =
  1 as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_FACTS =
  2 as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT =
  7 as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_PLANNED_TURNS =
  98_280 as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_ARCHIVE_BYTES =
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES *
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_PLANNED_TURNS;

export type AgentEvaluationProviderCapabilityObservedFact =
  | Readonly<{
      factKind: 'opaque-continuation';
      factDigest: CanonicalDigest;
      value: AgentOpaqueContinuationRef;
    }>
  | Readonly<{
      factKind: 'provider-cache-receipt';
      factDigest: CanonicalDigest;
      value: AgentProviderCacheReceipt;
    }>
  | Readonly<{
      factKind: 'provider-event';
      factDigest: CanonicalDigest;
      value: AgentProviderEvent;
    }>
  | Readonly<{
      factKind: 'provider-job-receipt';
      factDigest: CanonicalDigest;
      value: AgentProviderJobReceipt;
    }>
  | Readonly<{
      factKind: 'retrieval-query-receipt';
      factDigest: CanonicalDigest;
      value: AgentRetrievalQueryReceipt;
    }>
  | Readonly<{
      factKind: 'usage-vector';
      factDigest: CanonicalDigest;
      value: AgentUsageVector;
    }>;

export type AgentEvaluationProviderCapabilityObservationReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_FORMAT;
  version: typeof AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_VERSION;
  observationReceiptId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  protocolFamily: Exclude<AgentProviderProtocolFamily, 'openai-compatible'>;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  facts: readonly AgentEvaluationProviderCapabilityObservedFact[];
  factAuthorities: readonly AgentEvaluationProviderCapabilityFactAuthority[];
  selectedRuntimeFactEnvelopeSetDigest: CanonicalDigest;
  sourceAuthoritySetDigest: CanonicalDigest;
  observationDigest: CanonicalDigest;
  observedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationProviderCapabilityObservationReceiptInput =
  Omit<
    AgentEvaluationProviderCapabilityObservationReceipt,
    | 'format'
    | 'version'
    | 'selectedRuntimeFactEnvelopeSetDigest'
    | 'sourceAuthoritySetDigest'
    | 'observationDigest'
    | 'receiptDigest'
  >;

export type AgentEvaluationProviderCapabilityObservationSanitization =
  Readonly<{
    protectedMaterialCanaries: readonly string[];
    secretCanaries: readonly string[];
  }>;

const terminalEventTypes = new Set<AgentProviderEvent['type']>([
  'cancelled',
  'completed',
  'failed',
  'partial',
  'refusal',
  'safety-block',
  'timed-out',
  'truncation',
]);

const exactKeys = (
  value: unknown,
  required: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const isTerminalProviderEvent = (
  value: unknown
): value is AgentProviderEvent => {
  if (
    !exactKeys(value, [
      'eventId',
      'invocationId',
      'sequence',
      'type',
      'payloadDigest',
      'occurredAt',
      'eventDigest',
    ])
  ) {
    return false;
  }
  try {
    const event = value as unknown as AgentProviderEvent;
    const { eventDigest: _eventDigest, ...base } = event;
    return (
      terminalEventTypes.has(event.type) &&
      sameCanonicalJson(event, createAgentProviderEvent(base))
    );
  } catch {
    return false;
  }
};

const factDigestFor = (
  fact: AgentEvaluationProviderCapabilityObservedFact
): CanonicalDigest => {
  switch (fact.factKind) {
    case 'opaque-continuation':
      return fact.value.continuationDigest;
    case 'provider-cache-receipt':
    case 'provider-job-receipt':
    case 'retrieval-query-receipt':
      return fact.value.receiptDigest;
    case 'provider-event':
      return fact.value.eventDigest;
    case 'usage-vector':
      return fact.value.vectorDigest;
  }
};

export const isAgentEvaluationProviderCapabilityObservedFact = (
  value: unknown
): value is AgentEvaluationProviderCapabilityObservedFact => {
  if (!exactKeys(value, ['factKind', 'factDigest', 'value'])) return false;
  const candidate =
    value as unknown as AgentEvaluationProviderCapabilityObservedFact;
  const valid = (() => {
    switch (candidate.factKind) {
      case 'opaque-continuation':
        return isAgentEvaluationProviderOpaqueContinuationCapabilityFact(
          candidate.value
        );
      case 'provider-cache-receipt':
        return isAgentEvaluationProviderCacheCapabilityFact(candidate.value);
      case 'provider-event':
        return isTerminalProviderEvent(candidate.value);
      case 'provider-job-receipt':
        return isAgentEvaluationProviderJobCapabilityFact(candidate.value);
      case 'retrieval-query-receipt':
        return isAgentEvaluationRetrievalQueryCapabilityFact(candidate.value);
      case 'usage-vector':
        return isAgentEvaluationUsageVectorCapabilityFact(candidate.value);
      default:
        return false;
    }
  })();
  return valid && candidate.factDigest === factDigestFor(candidate);
};

const factOrderKey = (
  fact: AgentEvaluationProviderCapabilityObservedFact
): string => `${fact.factKind}\u0000${fact.factDigest}`;

export const canonicalAgentEvaluationProviderCapabilityObservedFactOrder = (
  left: AgentEvaluationProviderCapabilityObservedFact,
  right: AgentEvaluationProviderCapabilityObservedFact
): number => compareUnicodeCodePoints(factOrderKey(left), factOrderKey(right));

const canonicalFacts = (
  facts: readonly AgentEvaluationProviderCapabilityObservedFact[]
): readonly AgentEvaluationProviderCapabilityObservedFact[] =>
  Object.freeze(
    [...facts].sort(canonicalAgentEvaluationProviderCapabilityObservedFactOrder)
  );

export const AGENT_EVALUATION_PROVIDER_CAPABILITY_FACT_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-provider-capability-fact-authority' as const;

export type AgentEvaluationProviderCapabilityFactAuthority = Readonly<{
  format: typeof AGENT_EVALUATION_PROVIDER_CAPABILITY_FACT_AUTHORITY_FORMAT;
  version: 1;
  factKind: AgentEvaluationProviderCapabilityObservedFact['factKind'];
  factDigest: CanonicalDigest;
  sourceAuthorityKind:
    'native-provider-transport' | 'shared-durable-capability';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  sourceKind:
    'sealed-hosted-owner-result' | 'sealed-provider-response-metadata' | null;
  routeBinding: string | null;
  registrationAuthorityIssuerId: string | null;
  registrationReceiptDigest: CanonicalDigest | null;
  runtimeFactSourceAuthorityDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  runtimeFactEnvelopeDigest: CanonicalDigest;
  authorityDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationProviderCapabilityFactAuthorityInput = Omit<
  AgentEvaluationProviderCapabilityFactAuthority,
  | 'format'
  | 'version'
  | 'authorityDigest'
  | 'sourceKind'
  | 'routeBinding'
  | 'registrationAuthorityIssuerId'
  | 'registrationReceiptDigest'
  | 'runtimeFactSourceAuthorityDigest'
> &
  Partial<
    Pick<
      AgentEvaluationProviderCapabilityFactAuthority,
      | 'sourceKind'
      | 'routeBinding'
      | 'registrationAuthorityIssuerId'
      | 'registrationReceiptDigest'
      | 'runtimeFactSourceAuthorityDigest'
    >
  >;

const factAuthorityBase = (
  input: CreateAgentEvaluationProviderCapabilityFactAuthorityInput
) =>
  Object.freeze({
    format: AGENT_EVALUATION_PROVIDER_CAPABILITY_FACT_AUTHORITY_FORMAT,
    version: 1 as const,
    factKind: input.factKind,
    factDigest: input.factDigest,
    sourceAuthorityKind: input.sourceAuthorityKind,
    sourceAuthorityId: input.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      input.sourceAuthorityImplementationDigest,
    sourceKind: input.sourceKind ?? null,
    routeBinding: input.routeBinding ?? null,
    registrationAuthorityIssuerId: input.registrationAuthorityIssuerId ?? null,
    registrationReceiptDigest: input.registrationReceiptDigest ?? null,
    runtimeFactSourceAuthorityDigest:
      input.runtimeFactSourceAuthorityDigest ?? null,
    stageDigest: input.stageDigest,
    dispatchAckDigest: input.dispatchAckDigest,
    transportReceiptDigest: input.transportReceiptDigest,
    resultSpoolReceiptDigest: input.resultSpoolReceiptDigest,
    normalizedEventSetDigest: input.normalizedEventSetDigest,
    runtimeFactEnvelopeDigest: input.runtimeFactEnvelopeDigest,
  });

export const createAgentEvaluationProviderCapabilityFactAuthority = (
  input: CreateAgentEvaluationProviderCapabilityFactAuthorityInput
): AgentEvaluationProviderCapabilityFactAuthority => {
  const base = factAuthorityBase(input);
  const nativeFact =
    base.factKind === 'provider-event' || base.factKind === 'usage-vector';
  const sharedAuthority =
    base.sourceAuthorityKind === 'shared-durable-capability';
  if (
    !isAgentCanonicalDigest(base.factDigest) ||
    !isAgentControlIdentity(base.sourceAuthorityId) ||
    (base.sourceAuthorityKind === 'native-provider-transport') !== nativeFact ||
    (sharedAuthority
      ? ![
          'sealed-hosted-owner-result',
          'sealed-provider-response-metadata',
        ].includes(base.sourceKind ?? '') ||
        !isAgentControlIdentity(base.routeBinding) ||
        !isAgentControlIdentity(base.registrationAuthorityIssuerId) ||
        !isAgentCanonicalDigest(base.registrationReceiptDigest) ||
        !isAgentCanonicalDigest(base.runtimeFactSourceAuthorityDigest)
      : base.sourceKind !== null ||
        base.routeBinding !== null ||
        base.registrationAuthorityIssuerId !== null ||
        base.registrationReceiptDigest !== null ||
        base.runtimeFactSourceAuthorityDigest !== null) ||
    ![
      base.sourceAuthorityImplementationDigest,
      base.stageDigest,
      base.dispatchAckDigest,
      base.transportReceiptDigest,
      base.resultSpoolReceiptDigest,
      base.normalizedEventSetDigest,
      base.runtimeFactEnvelopeDigest,
    ].every(isAgentCanonicalDigest) ||
    inspectAgentControlJson(base, 4_096).length > 0
  ) {
    throw new TypeError('Provider capability fact authority is invalid.');
  }
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

const factAuthorityKeys = Object.freeze([
  'format',
  'version',
  'factKind',
  'factDigest',
  'sourceAuthorityKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceKind',
  'routeBinding',
  'registrationAuthorityIssuerId',
  'registrationReceiptDigest',
  'runtimeFactSourceAuthorityDigest',
  'stageDigest',
  'dispatchAckDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'runtimeFactEnvelopeDigest',
  'authorityDigest',
] as const);

export const isAgentEvaluationProviderCapabilityFactAuthority = (
  value: unknown
): value is AgentEvaluationProviderCapabilityFactAuthority => {
  if (!exactKeys(value, factAuthorityKeys)) return false;
  try {
    const authority =
      value as unknown as AgentEvaluationProviderCapabilityFactAuthority;
    const {
      format: _format,
      version: _version,
      authorityDigest: _authorityDigest,
      ...input
    } = authority;
    return sameCanonicalJson(
      authority,
      createAgentEvaluationProviderCapabilityFactAuthority(input)
    );
  } catch {
    return false;
  }
};

export type AgentEvaluationProviderCapabilityFactAuthorityBinding = Omit<
  AgentEvaluationProviderCapabilityFactAuthority,
  'format' | 'version' | 'authorityDigest'
>;

/** Exact join target reconstructed from plan and raw durable authority families. */
export const matchAgentEvaluationProviderCapabilityFactAuthorityBinding = (
  authority: AgentEvaluationProviderCapabilityFactAuthority,
  binding: AgentEvaluationProviderCapabilityFactAuthorityBinding
): boolean => {
  if (!isAgentEvaluationProviderCapabilityFactAuthority(authority)) {
    return false;
  }
  const {
    format: _format,
    version: _version,
    authorityDigest: _authorityDigest,
    ...authorityBinding
  } = authority;
  return sameCanonicalJson(authorityBinding, binding);
};

/** Exact plan-to-observation join for a registered shared runtime fact owner. */
export const matchAgentEvaluationProviderCapabilityFactRuntimeSourceAuthority =
  (
    authority: AgentEvaluationProviderCapabilityFactAuthority,
    runtimeSource: AgentEvaluationRuntimeFactSourceAuthority
  ): boolean =>
    isAgentEvaluationProviderCapabilityFactAuthority(authority) &&
    authority.sourceAuthorityKind === 'shared-durable-capability' &&
    authority.sourceAuthorityId === runtimeSource.sourceAuthorityId &&
    authority.sourceAuthorityImplementationDigest ===
      runtimeSource.sourceAuthorityImplementationDigest &&
    authority.sourceKind === runtimeSource.sourceKind &&
    authority.routeBinding === runtimeSource.routeBinding &&
    authority.registrationAuthorityIssuerId ===
      runtimeSource.registrationAuthorityIssuerId &&
    authority.registrationReceiptDigest ===
      runtimeSource.registrationReceiptDigest &&
    authority.runtimeFactSourceAuthorityDigest ===
      runtimeSource.authorityDigest;

/** Frozen terminal/fact policy used by archive admission and external verifiers. */
export const matchAgentEvaluationProviderCapabilityObservationFactPolicy = (
  observation: AgentEvaluationProviderCapabilityObservationReceipt,
  descriptor: AgentEvaluationCapabilityDescriptor,
  runtimeSourceAuthority?: AgentEvaluationRuntimeFactSourceAuthority
): boolean => {
  if (!isAgentEvaluationProviderCapabilityObservationReceipt(observation)) {
    return false;
  }
  const terminalFacts = observation.facts.filter(
    ({ factKind }) => factKind === 'provider-event'
  );
  if (terminalFacts.length > 1) return false;
  const sharedAuthorities = observation.factAuthorities.filter(
    ({ sourceAuthorityKind }) =>
      sourceAuthorityKind === 'shared-durable-capability'
  );
  if (
    sharedAuthorities.length > 0 &&
    (runtimeSourceAuthority === undefined ||
      !sharedAuthorities.every((authority) =>
        matchAgentEvaluationProviderCapabilityFactRuntimeSourceAuthority(
          authority,
          runtimeSourceAuthority
        )
      ))
  ) {
    return false;
  }
  const factKinds = new Set(observation.facts.map(({ factKind }) => factKind));
  const requiredCacheDescriptor =
    descriptor.capabilityId === 'provider.isolated-cache' &&
    descriptor.supportExpectation === 'required' &&
    sameCanonicalJson(descriptor.expectedReceiptKinds, [
      'cache-lineage-receipt',
      'usage-receipt',
    ]);
  if (!requiredCacheDescriptor) return terminalFacts.length === 1;
  const exactSupportedCache =
    terminalFacts.length === 0 &&
    observation.facts.length === 2 &&
    factKinds.size === 2 &&
    factKinds.has('provider-cache-receipt') &&
    factKinds.has('usage-vector') &&
    sharedAuthorities.length === 1 &&
    sharedAuthorities[0]?.factKind === 'provider-cache-receipt';
  const exactUnavailableCache =
    terminalFacts.length === 1 &&
    sharedAuthorities.length === 0 &&
    observation.facts.every(
      ({ factKind }) =>
        factKind === 'provider-event' || factKind === 'usage-vector'
    );
  return exactSupportedCache || exactUnavailableCache;
};

const factAuthorityOrderKey = (
  authority: AgentEvaluationProviderCapabilityFactAuthority
): string => `${authority.factKind}\u0000${authority.factDigest}`;

export const canonicalAgentEvaluationProviderCapabilityFactAuthorityOrder = (
  left: AgentEvaluationProviderCapabilityFactAuthority,
  right: AgentEvaluationProviderCapabilityFactAuthority
): number =>
  compareUnicodeCodePoints(
    factAuthorityOrderKey(left),
    factAuthorityOrderKey(right)
  );

const canonicalFactAuthorities = (
  authorities: readonly AgentEvaluationProviderCapabilityFactAuthority[]
): readonly AgentEvaluationProviderCapabilityFactAuthority[] =>
  Object.freeze(
    [...authorities].sort(
      canonicalAgentEvaluationProviderCapabilityFactAuthorityOrder
    )
  );

const hasCanonicalFactAuthorities = (
  authorities: unknown
): authorities is readonly AgentEvaluationProviderCapabilityFactAuthority[] => {
  if (
    !Array.isArray(authorities) ||
    authorities.length >
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_FACTS ||
    !authorities.every(isAgentEvaluationProviderCapabilityFactAuthority)
  ) {
    return false;
  }
  const canonical = canonicalFactAuthorities(authorities);
  return (
    sameCanonicalJson(authorities, canonical) &&
    new Set(canonical.map(factAuthorityOrderKey)).size === canonical.length &&
    new Set(canonical.map(({ authorityDigest }) => authorityDigest)).size ===
      canonical.length
  );
};

export const digestAgentEvaluationSelectedRuntimeFactEnvelopeSet = (
  authorities: readonly AgentEvaluationProviderCapabilityFactAuthority[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    runtimeFactEnvelopeDigests: canonicalFactAuthorities(authorities).map(
      ({ runtimeFactEnvelopeDigest }) => runtimeFactEnvelopeDigest
    ),
  });

export const digestAgentEvaluationProviderCapabilitySourceAuthoritySet = (
  authorities: readonly AgentEvaluationProviderCapabilityFactAuthority[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    authorityDigests: canonicalFactAuthorities(authorities).map(
      ({ authorityDigest }) => authorityDigest
    ),
  });

export const AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_FORMAT =
  'prodivix.agent-evaluation-provider-capability-runtime-fact-envelope' as const;
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_VERSION =
  1 as const;

export type AgentEvaluationProviderCapabilityRuntimeFactEnvelope = Readonly<{
  format: typeof AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_FORMAT;
  version: typeof AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_VERSION;
  sourceAuthorityKind:
    'native-provider-transport' | 'shared-durable-capability';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  sourceKind:
    'sealed-hosted-owner-result' | 'sealed-provider-response-metadata' | null;
  routeBinding: string | null;
  registrationAuthorityIssuerId: string | null;
  registrationReceiptDigest: CanonicalDigest | null;
  runtimeFactSourceAuthorityDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  protocolFamily: Exclude<AgentProviderProtocolFamily, 'openai-compatible'>;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  observedAt: Instant;
  fact: AgentEvaluationProviderCapabilityObservedFact;
  envelopeDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeInput =
  Omit<
    AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
    | 'format'
    | 'version'
    | 'envelopeDigest'
    | 'sourceKind'
    | 'routeBinding'
    | 'registrationAuthorityIssuerId'
    | 'registrationReceiptDigest'
    | 'runtimeFactSourceAuthorityDigest'
  > &
    Partial<
      Pick<
        AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
        | 'sourceKind'
        | 'routeBinding'
        | 'registrationAuthorityIssuerId'
        | 'registrationReceiptDigest'
        | 'runtimeFactSourceAuthorityDigest'
      >
    >;

const runtimeEnvelopeBase = (
  input: CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeInput
) =>
  Object.freeze({
    format: AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_FORMAT,
    version: AGENT_EVALUATION_PROVIDER_CAPABILITY_RUNTIME_FACT_ENVELOPE_VERSION,
    sourceAuthorityKind: input.sourceAuthorityKind,
    sourceAuthorityId: input.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      input.sourceAuthorityImplementationDigest,
    sourceKind: input.sourceKind ?? null,
    routeBinding: input.routeBinding ?? null,
    registrationAuthorityIssuerId: input.registrationAuthorityIssuerId ?? null,
    registrationReceiptDigest: input.registrationReceiptDigest ?? null,
    runtimeFactSourceAuthorityDigest:
      input.runtimeFactSourceAuthorityDigest ?? null,
    stageDigest: input.stageDigest,
    dispatchAckDigest: input.dispatchAckDigest,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    dispatchIntentDigest: input.dispatchIntentDigest,
    transportReceiptDigest: input.transportReceiptDigest,
    resultSpoolReceiptDigest: input.resultSpoolReceiptDigest,
    normalizedEventSetDigest: input.normalizedEventSetDigest,
    observedAt: input.observedAt,
    fact: normalizeAgentProviderRuntimePayload(input.fact, {
      maximumBytes:
        AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES,
    }) as unknown as AgentEvaluationProviderCapabilityObservedFact,
  });

export const digestAgentEvaluationProviderCapabilityRuntimeFactEnvelope = (
  input: CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeInput
): CanonicalDigest => digestAgentCanonicalValue(runtimeEnvelopeBase(input));

const runtimeFactMatchesEnvelope = (
  base: ReturnType<typeof runtimeEnvelopeBase>
): boolean => {
  const nativeFact =
    base.fact.factKind === 'provider-event' ||
    base.fact.factKind === 'usage-vector';
  if (
    (base.sourceAuthorityKind === 'native-provider-transport') !==
    nativeFact
  ) {
    return false;
  }
  if (base.sourceAuthorityKind === 'shared-durable-capability') {
    const expectedSourceKind =
      base.fact.factKind === 'retrieval-query-receipt'
        ? 'sealed-hosted-owner-result'
        : 'sealed-provider-response-metadata';
    if (
      base.sourceKind !== expectedSourceKind ||
      !isAgentControlIdentity(base.routeBinding) ||
      !isAgentControlIdentity(base.registrationAuthorityIssuerId) ||
      !isAgentCanonicalDigest(base.registrationReceiptDigest) ||
      !isAgentCanonicalDigest(base.runtimeFactSourceAuthorityDigest)
    ) {
      return false;
    }
  } else if (
    base.sourceKind !== null ||
    base.routeBinding !== null ||
    base.registrationAuthorityIssuerId !== null ||
    base.registrationReceiptDigest !== null ||
    base.runtimeFactSourceAuthorityDigest !== null
  ) {
    return false;
  }
  if (
    base.sourceAuthorityKind === 'native-provider-transport' &&
    (base.sourceAuthorityId !== base.providerConfigurationId ||
      base.sourceAuthorityImplementationDigest !== base.adapterDigest ||
      base.stageDigest !== base.dispatchIntentDigest ||
      base.dispatchAckDigest !== base.transportReceiptDigest)
  ) {
    return false;
  }
  switch (base.fact.factKind) {
    case 'provider-event':
      return (
        base.fact.value.invocationId === base.invocationId &&
        Date.parse(base.fact.value.occurredAt) <= Date.parse(base.observedAt)
      );
    case 'provider-job-receipt':
      return true;
    case 'opaque-continuation':
      return (
        base.fact.value.providerConfigurationId ===
          base.providerConfigurationId &&
        base.fact.value.modelLineageDigest === base.modelLineageDigest &&
        base.fact.value.parentInvocationId === base.invocationId
      );
    case 'provider-cache-receipt':
    case 'retrieval-query-receipt':
    case 'usage-vector':
      return true;
  }
};

export const createAgentEvaluationProviderCapabilityRuntimeFactEnvelope = (
  input: CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeInput,
  sanitization?: AgentEvaluationProviderCapabilityObservationSanitization
): AgentEvaluationProviderCapabilityRuntimeFactEnvelope => {
  if (
    inspectAgentControlJson(
      input,
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES
    ).length > 0 ||
    containsCredentialLikeText(input) ||
    (sanitization !== undefined && hasUnsafeCanaryMaterial(input, sanitization))
  ) {
    throw new TypeError(
      'Provider capability runtime fact envelope is not bounded and sanitized.'
    );
  }
  const base = runtimeEnvelopeBase(input);
  if (
    !['native-provider-transport', 'shared-durable-capability'].includes(
      base.sourceAuthorityKind
    ) ||
    !isAgentControlIdentity(base.sourceAuthorityId) ||
    !/^[0-9a-f]{40}$/u.test(base.repositoryCommit) ||
    !isAgentControlIdentity(base.attemptId) ||
    !Number.isSafeInteger(base.turnIndex) ||
    base.turnIndex < 0 ||
    base.turnIndex >=
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT ||
    !isAgentControlIdentity(base.invocationId) ||
    !['openai-responses', 'anthropic-messages', 'gemini-interactions'].includes(
      base.protocolFamily
    ) ||
    !isAgentControlIdentity(base.providerConfigurationId) ||
    !isAgentControlInstant(base.observedAt) ||
    !isAgentEvaluationProviderCapabilityObservedFact(base.fact) ||
    !runtimeFactMatchesEnvelope(base) ||
    ![
      base.sourceAuthorityImplementationDigest,
      base.stageDigest,
      base.dispatchAckDigest,
      base.planDigest,
      base.descriptorDigest,
      base.requestDigest,
      base.responseDigest,
      base.modelLineageDigest,
      base.adapterDigest,
      base.dispatchIntentDigest,
      base.transportReceiptDigest,
      base.resultSpoolReceiptDigest,
      base.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError(
      'Provider capability runtime fact authority is invalid.'
    );
  }
  return Object.freeze({
    ...base,
    envelopeDigest:
      digestAgentEvaluationProviderCapabilityRuntimeFactEnvelope(input),
  });
};

const runtimeEnvelopeKeys = Object.freeze([
  'format',
  'version',
  'sourceAuthorityKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceKind',
  'routeBinding',
  'registrationAuthorityIssuerId',
  'registrationReceiptDigest',
  'runtimeFactSourceAuthorityDigest',
  'stageDigest',
  'dispatchAckDigest',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'requestDigest',
  'responseDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'observedAt',
  'fact',
  'envelopeDigest',
] as const);

export const isAgentEvaluationProviderCapabilityRuntimeFactEnvelope = (
  value: unknown,
  sanitization?: AgentEvaluationProviderCapabilityObservationSanitization
): value is AgentEvaluationProviderCapabilityRuntimeFactEnvelope => {
  if (!exactKeys(value, runtimeEnvelopeKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      envelopeDigest,
      ...input
    } = value as unknown as AgentEvaluationProviderCapabilityRuntimeFactEnvelope;
    const canonical =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        input,
        sanitization
      );
    return (
      isAgentCanonicalDigest(envelopeDigest) &&
      sameCanonicalJson(value, canonical)
    );
  } catch {
    return false;
  }
};

export type AgentEvaluationProviderCapabilitySharedObservedFact = Exclude<
  AgentEvaluationProviderCapabilityObservedFact,
  Readonly<{ factKind: 'provider-event' | 'usage-vector' }>
>;

export type CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectInput =
  Omit<
    CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeInput,
    | 'sourceAuthorityKind'
    | 'sourceAuthorityId'
    | 'sourceAuthorityImplementationDigest'
    | 'sourceKind'
    | 'routeBinding'
    | 'registrationAuthorityIssuerId'
    | 'registrationReceiptDigest'
    | 'runtimeFactSourceAuthorityDigest'
    | 'stageDigest'
    | 'dispatchAckDigest'
    | 'transportReceiptDigest'
    | 'resultSpoolReceiptDigest'
    | 'normalizedEventSetDigest'
    | 'fact'
  > &
    Readonly<{
      fact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
    }>;

/**
 * Converts a completed shared-owner effect into a runtime envelope. Unavailable
 * and failed effects return no fact, leaving the caller to grade unavailable
 * from genuine terminal/usage evidence after the turn is complete.
 */
export const createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt =
  (
    intent: AgentEvaluationCapabilityPreEffectIntent,
    receipt: AgentEvaluationCapabilityEffectSourceReceipt,
    input: CreateAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectInput,
    sanitization?: AgentEvaluationProviderCapabilityObservationSanitization
  ): AgentEvaluationProviderCapabilityRuntimeFactEnvelope | null => {
    if (!isAgentEvaluationCapabilityEffectSourceReceipt(receipt, intent)) {
      throw new TypeError('Capability effect source receipt is invalid.');
    }
    const authority = receipt.runtimeFactSourceAuthority;
    if (
      input.planDigest !== intent.planDigest ||
      input.repositoryCommit !== intent.repositoryCommit ||
      input.attemptId !== intent.attemptId ||
      input.descriptorDigest !== intent.descriptorDigest ||
      input.turnIndex !== intent.turnIndex ||
      input.invocationId !== intent.invocationId ||
      input.requestDigest !== intent.providerRequestDigest ||
      input.protocolFamily !== authority.protocolFamily ||
      input.providerConfigurationId !== authority.providerConfigurationId ||
      input.modelLineageDigest !== authority.modelLineageDigest ||
      input.adapterDigest !== authority.adapterDigest ||
      Date.parse(input.observedAt) < Date.parse(receipt.sealedAt)
    ) {
      throw new TypeError(
        'Capability effect runtime fact envelope binding drifted.'
      );
    }
    if (receipt.effectStatus !== 'produced') {
      if (input.fact !== null) {
        throw new TypeError(
          'Unavailable capability effect cannot publish a runtime fact.'
        );
      }
      return null;
    }
    if (
      input.fact === null ||
      receipt.resultSpoolReceiptDigest === null ||
      input.fact.factKind !== receipt.sourceFactKind ||
      input.fact.factDigest !== receipt.sourceFactDigest ||
      (input.fact.factKind === 'provider-job-receipt' &&
        input.fact.value.invocationId !==
          intent.inputAuthorityBinding.sourceInvocationId) ||
      (input.fact.factKind === 'opaque-continuation' &&
        input.fact.value.parentInvocationId !== intent.invocationId)
    ) {
      throw new TypeError(
        'Capability effect runtime fact drifted from its sealed receipt.'
      );
    }
    return createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      {
        ...input,
        fact: input.fact,
        sourceAuthorityKind: 'shared-durable-capability',
        sourceAuthorityId: authority.sourceAuthorityId,
        sourceAuthorityImplementationDigest:
          authority.sourceAuthorityImplementationDigest,
        sourceKind: authority.sourceKind,
        routeBinding: authority.routeBinding,
        registrationAuthorityIssuerId: authority.registrationAuthorityIssuerId,
        registrationReceiptDigest: authority.registrationReceiptDigest,
        runtimeFactSourceAuthorityDigest: authority.authorityDigest,
        stageDigest: receipt.stageDigest,
        dispatchAckDigest: receipt.dispatchAckDigest,
        transportReceiptDigest: receipt.transportReceiptDigest,
        resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
        normalizedEventSetDigest: receipt.normalizedEventSetDigest,
      },
      sanitization
    );
  };

export const createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope =
  (
    envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
    sanitization?: AgentEvaluationProviderCapabilityObservationSanitization
  ): AgentEvaluationProviderCapabilityFactAuthority => {
    if (
      !isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        envelope,
        sanitization
      )
    ) {
      throw new TypeError(
        'Provider capability runtime fact envelope is invalid.'
      );
    }
    return createAgentEvaluationProviderCapabilityFactAuthority({
      factKind: envelope.fact.factKind,
      factDigest: envelope.fact.factDigest,
      sourceAuthorityKind: envelope.sourceAuthorityKind,
      sourceAuthorityId: envelope.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        envelope.sourceAuthorityImplementationDigest,
      sourceKind: envelope.sourceKind,
      routeBinding: envelope.routeBinding,
      registrationAuthorityIssuerId: envelope.registrationAuthorityIssuerId,
      registrationReceiptDigest: envelope.registrationReceiptDigest,
      runtimeFactSourceAuthorityDigest:
        envelope.runtimeFactSourceAuthorityDigest,
      stageDigest: envelope.stageDigest,
      dispatchAckDigest: envelope.dispatchAckDigest,
      transportReceiptDigest: envelope.transportReceiptDigest,
      resultSpoolReceiptDigest: envelope.resultSpoolReceiptDigest,
      normalizedEventSetDigest: envelope.normalizedEventSetDigest,
      runtimeFactEnvelopeDigest: envelope.envelopeDigest,
    });
  };

const runtimeEnvelopeBinding = (
  envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope
) =>
  Object.freeze({
    planDigest: envelope.planDigest,
    repositoryCommit: envelope.repositoryCommit,
    attemptId: envelope.attemptId,
    descriptorDigest: envelope.descriptorDigest,
    turnIndex: envelope.turnIndex,
    invocationId: envelope.invocationId,
    requestDigest: envelope.requestDigest,
    responseDigest: envelope.responseDigest,
    protocolFamily: envelope.protocolFamily,
    providerConfigurationId: envelope.providerConfigurationId,
    modelLineageDigest: envelope.modelLineageDigest,
    adapterDigest: envelope.adapterDigest,
    dispatchIntentDigest: envelope.dispatchIntentDigest,
    observedAt: envelope.observedAt,
  });

export type AgentEvaluationProviderCapabilityRuntimeSourceAuthority =
  | Readonly<{
      sourceAuthorityKind: 'native-provider-transport';
      sourceAuthorityId: string;
      sourceAuthorityImplementationDigest: CanonicalDigest;
    }>
  | Readonly<{
      sourceAuthorityKind: 'shared-durable-capability';
      runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
    }>;

export type AgentEvaluationProviderCapabilityObservationFactSelection =
  Readonly<{
    facts: readonly AgentEvaluationProviderCapabilityObservedFact[];
    factAuthorities: readonly AgentEvaluationProviderCapabilityFactAuthority[];
    selectedRuntimeFactEnvelopeSetDigest: CanonicalDigest;
    sourceAuthoritySetDigest: CanonicalDigest;
  }>;

const sourceAuthorityKey = (
  authority: AgentEvaluationProviderCapabilityRuntimeSourceAuthority
): string => {
  if (authority.sourceAuthorityKind === 'native-provider-transport') {
    return `${authority.sourceAuthorityKind}\u0000${authority.sourceAuthorityId}\u0000${authority.sourceAuthorityImplementationDigest}`;
  }
  return `${authority.sourceAuthorityKind}\u0000${authority.runtimeFactSourceAuthority.sourceAuthorityId}\u0000${authority.runtimeFactSourceAuthority.sourceAuthorityImplementationDigest}\u0000${authority.runtimeFactSourceAuthority.authorityDigest}`;
};

const runtimeEnvelopeSourceAuthorityKey = (
  envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope
): string =>
  envelope.sourceAuthorityKind === 'native-provider-transport'
    ? `${envelope.sourceAuthorityKind}\u0000${envelope.sourceAuthorityId}\u0000${envelope.sourceAuthorityImplementationDigest}`
    : `${envelope.sourceAuthorityKind}\u0000${envelope.sourceAuthorityId}\u0000${envelope.sourceAuthorityImplementationDigest}\u0000${envelope.runtimeFactSourceAuthorityDigest}`;

const isCanonicalRuntimeFactSourceAuthority = (
  authority: AgentEvaluationRuntimeFactSourceAuthority
): boolean => {
  try {
    const { authorityDigest, ...input } = authority;
    return (
      sameCanonicalJson(
        authority,
        createAgentEvaluationRuntimeFactSourceAuthority(input)
      ) && isAgentCanonicalDigest(authorityDigest)
    );
  } catch {
    return false;
  }
};

/** Exact plan-registration join for a shared runtime fact envelope. */
export const matchAgentEvaluationProviderCapabilityRuntimeFactEnvelopeSourceAuthority =
  (
    envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
    authority: AgentEvaluationRuntimeFactSourceAuthority
  ): boolean =>
    isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(envelope) &&
    isCanonicalRuntimeFactSourceAuthority(authority) &&
    envelope.sourceAuthorityKind === 'shared-durable-capability' &&
    envelope.sourceAuthorityId === authority.sourceAuthorityId &&
    envelope.sourceAuthorityImplementationDigest ===
      authority.sourceAuthorityImplementationDigest &&
    envelope.sourceKind === authority.sourceKind &&
    envelope.routeBinding === authority.routeBinding &&
    envelope.registrationAuthorityIssuerId ===
      authority.registrationAuthorityIssuerId &&
    envelope.registrationReceiptDigest ===
      authority.registrationReceiptDigest &&
    envelope.runtimeFactSourceAuthorityDigest === authority.authorityDigest &&
    envelope.protocolFamily === authority.protocolFamily &&
    envelope.providerConfigurationId === authority.providerConfigurationId &&
    envelope.modelLineageDigest === authority.modelLineageDigest &&
    envelope.adapterDigest === authority.adapterDigest;

const admittedSourceAuthorityMatchesEnvelope = (
  authority: AgentEvaluationProviderCapabilityRuntimeSourceAuthority,
  envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope
): boolean =>
  authority.sourceAuthorityKind === 'native-provider-transport'
    ? envelope.sourceAuthorityKind === 'native-provider-transport' &&
      envelope.sourceAuthorityId === authority.sourceAuthorityId &&
      envelope.sourceAuthorityImplementationDigest ===
        authority.sourceAuthorityImplementationDigest
    : matchAgentEvaluationProviderCapabilityRuntimeFactEnvelopeSourceAuthority(
        envelope,
        authority.runtimeFactSourceAuthority
      );

const emptyRuntimeFactSelection =
  (): AgentEvaluationProviderCapabilityObservationFactSelection => {
    const factAuthorities = Object.freeze([]);
    return Object.freeze({
      facts: Object.freeze([]),
      factAuthorities,
      selectedRuntimeFactEnvelopeSetDigest:
        digestAgentEvaluationSelectedRuntimeFactEnvelopeSet(factAuthorities),
      sourceAuthoritySetDigest:
        digestAgentEvaluationProviderCapabilitySourceAuthoritySet(
          factAuthorities
        ),
    });
  };

/** Selects only exact required facts already sealed by an admitted owner. */
export const selectAgentEvaluationProviderCapabilityObservationFacts = (input: {
  envelopes: readonly AgentEvaluationProviderCapabilityRuntimeFactEnvelope[];
  requiredFactKinds: readonly AgentEvaluationProviderCapabilityObservedFact['factKind'][];
  admittedSourceAuthorities: readonly AgentEvaluationProviderCapabilityRuntimeSourceAuthority[];
  sanitization?: AgentEvaluationProviderCapabilityObservationSanitization;
}): AgentEvaluationProviderCapabilityObservationFactSelection => {
  const admittedAuthorityKeys = new Set(
    input.admittedSourceAuthorities.map(sourceAuthorityKey)
  );
  if (
    input.envelopes.length > 6 ||
    input.admittedSourceAuthorities.length === 0 ||
    input.admittedSourceAuthorities.length > 2 ||
    admittedAuthorityKeys.size !== input.admittedSourceAuthorities.length ||
    input.admittedSourceAuthorities.some((authority) =>
      authority.sourceAuthorityKind === 'native-provider-transport'
        ? !isAgentControlIdentity(authority.sourceAuthorityId) ||
          !isAgentCanonicalDigest(authority.sourceAuthorityImplementationDigest)
        : !isCanonicalRuntimeFactSourceAuthority(
            authority.runtimeFactSourceAuthority
          )
    ) ||
    input.requiredFactKinds.length >
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_FACTS ||
    new Set(input.requiredFactKinds).size !== input.requiredFactKinds.length ||
    !input.envelopes.every((envelope) =>
      isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        envelope,
        input.sanitization
      )
    ) ||
    input.envelopes.some((envelope) => {
      if (
        !admittedAuthorityKeys.has(runtimeEnvelopeSourceAuthorityKey(envelope))
      ) {
        return true;
      }
      return !input.admittedSourceAuthorities.some((authority) =>
        admittedSourceAuthorityMatchesEnvelope(authority, envelope)
      );
    })
  ) {
    throw new TypeError(
      'Provider capability runtime fact selection is invalid.'
    );
  }
  const first = input.envelopes[0];
  if (
    first &&
    input.envelopes.some(
      (envelope) =>
        !sameCanonicalJson(
          runtimeEnvelopeBinding(envelope),
          runtimeEnvelopeBinding(first)
        )
    )
  ) {
    throw new TypeError('Provider capability runtime fact binding drifted.');
  }
  const facts = input.envelopes.map(({ fact }) => fact);
  if (new Set(facts.map(({ factKind }) => factKind)).size !== facts.length) {
    throw new TypeError('Provider capability runtime fact kind is ambiguous.');
  }
  const selected = facts.filter(({ factKind }) =>
    input.requiredFactKinds.includes(factKind)
  );
  if (selected.length !== input.requiredFactKinds.length) {
    return emptyRuntimeFactSelection();
  }
  const selectedEnvelopes = input.envelopes.filter(({ fact }) =>
    input.requiredFactKinds.includes(fact.factKind)
  );
  const factAuthorities = canonicalFactAuthorities(
    selectedEnvelopes.map((envelope) =>
      createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        envelope,
        input.sanitization
      )
    )
  );
  return Object.freeze({
    facts: canonicalFacts(selected),
    factAuthorities,
    selectedRuntimeFactEnvelopeSetDigest:
      digestAgentEvaluationSelectedRuntimeFactEnvelopeSet(factAuthorities),
    sourceAuthoritySetDigest:
      digestAgentEvaluationProviderCapabilitySourceAuthoritySet(
        factAuthorities
      ),
  });
};

const hasCanonicalFacts = (
  facts: unknown
): facts is readonly AgentEvaluationProviderCapabilityObservedFact[] => {
  if (
    !Array.isArray(facts) ||
    facts.length >
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_FACTS ||
    !facts.every(isAgentEvaluationProviderCapabilityObservedFact)
  ) {
    return false;
  }
  const canonical = canonicalFacts(facts);
  return (
    new Set(canonical.map(({ factKind }) => factKind)).size ===
      canonical.length &&
    new Set(canonical.map(factOrderKey)).size === canonical.length &&
    sameCanonicalJson(facts, canonical)
  );
};

const observationBase = (
  input: CreateAgentEvaluationProviderCapabilityObservationReceiptInput
) => {
  const factAuthorities = canonicalFactAuthorities(input.factAuthorities);
  return Object.freeze({
    format: AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_FORMAT,
    version: AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_VERSION,
    observationReceiptId: input.observationReceiptId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    dispatchIntentDigest: input.dispatchIntentDigest,
    transportReceiptDigest: input.transportReceiptDigest,
    resultSpoolReceiptDigest: input.resultSpoolReceiptDigest,
    normalizedEventSetDigest: input.normalizedEventSetDigest,
    facts: canonicalFacts(input.facts),
    factAuthorities,
    selectedRuntimeFactEnvelopeSetDigest:
      digestAgentEvaluationSelectedRuntimeFactEnvelopeSet(factAuthorities),
    sourceAuthoritySetDigest:
      digestAgentEvaluationProviderCapabilitySourceAuthoritySet(
        factAuthorities
      ),
    observedAt: input.observedAt,
  });
};

const observationProjection = (base: ReturnType<typeof observationBase>) =>
  Object.freeze({
    planDigest: base.planDigest,
    repositoryCommit: base.repositoryCommit,
    attemptId: base.attemptId,
    descriptorDigest: base.descriptorDigest,
    turnIndex: base.turnIndex,
    invocationId: base.invocationId,
    requestDigest: base.requestDigest,
    responseDigest: base.responseDigest,
    protocolFamily: base.protocolFamily,
    providerConfigurationId: base.providerConfigurationId,
    modelLineageDigest: base.modelLineageDigest,
    adapterDigest: base.adapterDigest,
    dispatchIntentDigest: base.dispatchIntentDigest,
    transportReceiptDigest: base.transportReceiptDigest,
    resultSpoolReceiptDigest: base.resultSpoolReceiptDigest,
    normalizedEventSetDigest: base.normalizedEventSetDigest,
    selectedRuntimeFactEnvelopeSetDigest:
      base.selectedRuntimeFactEnvelopeSetDigest,
    sourceAuthoritySetDigest: base.sourceAuthoritySetDigest,
    factDigests: base.facts.map(({ factKind, factDigest }) =>
      Object.freeze({ factKind, factDigest })
    ),
    factAuthorityDigests: base.factAuthorities.map(
      ({ factKind, factDigest, authorityDigest }) =>
        Object.freeze({ factKind, factDigest, authorityDigest })
    ),
  });

const factAuthoritiesMatchObservation = (
  base: ReturnType<typeof observationBase>
): boolean =>
  base.facts.length === base.factAuthorities.length &&
  base.facts.every((fact, index) => {
    const authority = base.factAuthorities[index];
    return (
      authority !== undefined &&
      authority.factKind === fact.factKind &&
      authority.factDigest === fact.factDigest &&
      authority.runtimeFactEnvelopeDigest ===
        digestAgentEvaluationProviderCapabilityRuntimeFactEnvelope({
          sourceAuthorityKind: authority.sourceAuthorityKind,
          sourceAuthorityId: authority.sourceAuthorityId,
          sourceAuthorityImplementationDigest:
            authority.sourceAuthorityImplementationDigest,
          sourceKind: authority.sourceKind,
          routeBinding: authority.routeBinding,
          registrationAuthorityIssuerId:
            authority.registrationAuthorityIssuerId,
          registrationReceiptDigest: authority.registrationReceiptDigest,
          runtimeFactSourceAuthorityDigest:
            authority.runtimeFactSourceAuthorityDigest,
          stageDigest: authority.stageDigest,
          dispatchAckDigest: authority.dispatchAckDigest,
          planDigest: base.planDigest,
          repositoryCommit: base.repositoryCommit,
          attemptId: base.attemptId,
          descriptorDigest: base.descriptorDigest,
          turnIndex: base.turnIndex,
          invocationId: base.invocationId,
          requestDigest: base.requestDigest,
          responseDigest: base.responseDigest,
          protocolFamily: base.protocolFamily,
          providerConfigurationId: base.providerConfigurationId,
          modelLineageDigest: base.modelLineageDigest,
          adapterDigest: base.adapterDigest,
          dispatchIntentDigest: base.dispatchIntentDigest,
          transportReceiptDigest: authority.transportReceiptDigest,
          resultSpoolReceiptDigest: authority.resultSpoolReceiptDigest,
          normalizedEventSetDigest: authority.normalizedEventSetDigest,
          observedAt: base.observedAt,
          fact,
        }) &&
      (authority.sourceAuthorityKind !== 'native-provider-transport' ||
        (authority.sourceAuthorityId === base.providerConfigurationId &&
          authority.sourceAuthorityImplementationDigest ===
            base.adapterDigest &&
          authority.stageDigest === base.dispatchIntentDigest &&
          authority.dispatchAckDigest === base.transportReceiptDigest &&
          authority.transportReceiptDigest === base.transportReceiptDigest &&
          authority.resultSpoolReceiptDigest ===
            base.resultSpoolReceiptDigest &&
          authority.normalizedEventSetDigest === base.normalizedEventSetDigest))
    );
  });

const factsMatchObservation = (
  base: ReturnType<typeof observationBase>
): boolean =>
  base.facts.every((fact) => {
    switch (fact.factKind) {
      case 'provider-event':
        return (
          fact.value.invocationId === base.invocationId &&
          Date.parse(fact.value.occurredAt) <= Date.parse(base.observedAt)
        );
      case 'provider-job-receipt':
        return true;
      case 'opaque-continuation':
        return (
          fact.value.providerConfigurationId === base.providerConfigurationId &&
          fact.value.modelLineageDigest === base.modelLineageDigest &&
          fact.value.parentInvocationId === base.invocationId
        );
      case 'provider-cache-receipt':
      case 'retrieval-query-receipt':
      case 'usage-vector':
        return true;
    }
  });

const containsCredentialLikeText = (value: unknown): boolean =>
  containsAgentControlCredentialLikeText(JSON.stringify(value));

const hasUnsafeCanaryMaterial = (
  value: unknown,
  sanitization: AgentEvaluationProviderCapabilityObservationSanitization
): boolean =>
  (sanitization.secretCanaries.length > 0 &&
    scanAgentArtifactForSecretCanaries(value, sanitization.secretCanaries)
      .length > 0) ||
  (sanitization.protectedMaterialCanaries.length > 0 &&
    scanAgentArtifactForProtectedHoldoutLeak(
      value,
      sanitization.protectedMaterialCanaries
    ).length > 0);

const createProviderCapabilityObservationReceipt = (
  input: CreateAgentEvaluationProviderCapabilityObservationReceiptInput,
  sanitization?: AgentEvaluationProviderCapabilityObservationSanitization
): AgentEvaluationProviderCapabilityObservationReceipt => {
  if (
    inspectAgentControlJson(
      input,
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES
    ).length > 0
  ) {
    throw new TypeError(
      'Provider capability observation receipt exceeds its safety bound.'
    );
  }
  if (
    containsCredentialLikeText(input) ||
    (sanitization !== undefined && hasUnsafeCanaryMaterial(input, sanitization))
  ) {
    throw new TypeError(
      'Provider capability observation receipt is not sanitized for persistence.'
    );
  }
  const base = observationBase(input);
  if (
    !isAgentControlIdentity(base.observationReceiptId) ||
    !/^[0-9a-f]{40}$/u.test(base.repositoryCommit) ||
    !isAgentControlIdentity(base.attemptId) ||
    !Number.isSafeInteger(base.turnIndex) ||
    base.turnIndex < 0 ||
    base.turnIndex >=
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT ||
    !isAgentControlIdentity(base.invocationId) ||
    !['openai-responses', 'anthropic-messages', 'gemini-interactions'].includes(
      base.protocolFamily
    ) ||
    !isAgentControlIdentity(base.providerConfigurationId) ||
    !hasCanonicalFacts(base.facts) ||
    !hasCanonicalFactAuthorities(base.factAuthorities) ||
    !factAuthoritiesMatchObservation(base) ||
    !isAgentControlInstant(base.observedAt) ||
    !factsMatchObservation(base) ||
    ![
      base.planDigest,
      base.descriptorDigest,
      base.requestDigest,
      base.responseDigest,
      base.modelLineageDigest,
      base.adapterDigest,
      base.dispatchIntentDigest,
      base.transportReceiptDigest,
      base.resultSpoolReceiptDigest,
      base.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    throw new TypeError(
      'Provider capability observation receipt authority is invalid.'
    );
  }
  const observationDigest = digestAgentCanonicalValue(
    observationProjection(base)
  );
  const receiptBase = Object.freeze({ ...base, observationDigest });
  const receipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  if (
    inspectAgentControlJson(
      receipt,
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES
    ).length > 0
  ) {
    throw new TypeError(
      'Provider capability observation receipt exceeds its safety bound.'
    );
  }
  return receipt;
};

export const createAgentEvaluationProviderCapabilityObservationReceipt = (
  input: CreateAgentEvaluationProviderCapabilityObservationReceiptInput,
  sanitization: AgentEvaluationProviderCapabilityObservationSanitization
): AgentEvaluationProviderCapabilityObservationReceipt => {
  const canaries = [
    ...sanitization.protectedMaterialCanaries,
    ...sanitization.secretCanaries,
  ];
  if (
    canaries.length === 0 ||
    canaries.some(
      (canary) =>
        typeof canary !== 'string' || canary.length < 8 || canary.length > 8_192
    ) ||
    new Set(canaries).size !== canaries.length
  ) {
    throw new TypeError(
      'Provider capability observation sanitization canaries are invalid.'
    );
  }
  return createProviderCapabilityObservationReceipt(input, sanitization);
};

export const isAgentEvaluationProviderCapabilityObservationReceipt = (
  value: unknown
): value is AgentEvaluationProviderCapabilityObservationReceipt => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'observationReceiptId',
      'planDigest',
      'repositoryCommit',
      'attemptId',
      'descriptorDigest',
      'turnIndex',
      'invocationId',
      'requestDigest',
      'responseDigest',
      'protocolFamily',
      'providerConfigurationId',
      'modelLineageDigest',
      'adapterDigest',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'resultSpoolReceiptDigest',
      'normalizedEventSetDigest',
      'facts',
      'factAuthorities',
      'selectedRuntimeFactEnvelopeSetDigest',
      'sourceAuthoritySetDigest',
      'observationDigest',
      'observedAt',
      'receiptDigest',
    ]) ||
    inspectAgentControlJson(
      value,
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES
    ).length > 0
  ) {
    return false;
  }
  try {
    const receipt =
      value as unknown as AgentEvaluationProviderCapabilityObservationReceipt;
    const {
      format: _format,
      version: _version,
      selectedRuntimeFactEnvelopeSetDigest:
        _selectedRuntimeFactEnvelopeSetDigest,
      sourceAuthoritySetDigest: _sourceAuthoritySetDigest,
      observationDigest: _observationDigest,
      receiptDigest: _receiptDigest,
      ...input
    } = receipt;
    return sameCanonicalJson(
      receipt,
      createProviderCapabilityObservationReceipt(input)
    );
  } catch {
    return false;
  }
};

export const canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder =
  (
    left: AgentEvaluationProviderCapabilityObservationReceipt,
    right: AgentEvaluationProviderCapabilityObservationReceipt
  ): number =>
    compareUnicodeCodePoints(
      `${left.attemptId}\u0000${left.turnIndex.toString().padStart(2, '0')}\u0000${left.invocationId}`,
      `${right.attemptId}\u0000${right.turnIndex.toString().padStart(2, '0')}\u0000${right.invocationId}`
    );

export type AgentEvaluationProviderCapabilityObservationReceiptSetBinding =
  Readonly<{
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    maximumTurnCount: number;
  }>;

/**
 * A native provider turn contributes zero or one observation. Missing turns
 * remain missing evidence; they are never filled from an expected capability
 * kind.
 */
export const isAgentEvaluationProviderCapabilityObservationReceiptSet = (
  receipts: unknown,
  binding: AgentEvaluationProviderCapabilityObservationReceiptSetBinding
): receipts is readonly AgentEvaluationProviderCapabilityObservationReceipt[] => {
  if (
    !Array.isArray(receipts) ||
    !Number.isSafeInteger(binding.maximumTurnCount) ||
    binding.maximumTurnCount < 0 ||
    binding.maximumTurnCount >
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT ||
    receipts.length > binding.maximumTurnCount ||
    !receipts.every(isAgentEvaluationProviderCapabilityObservationReceipt)
  ) {
    return false;
  }
  const canonical = [...receipts].sort(
    canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder
  );
  return (
    sameCanonicalJson(receipts, canonical) &&
    new Set(receipts.map(({ turnIndex }) => turnIndex)).size ===
      receipts.length &&
    new Set(receipts.map(({ observationReceiptId }) => observationReceiptId))
      .size === receipts.length &&
    receipts.every(
      (receipt) =>
        receipt.planDigest === binding.planDigest &&
        receipt.repositoryCommit === binding.repositoryCommit &&
        receipt.attemptId === binding.attemptId &&
        receipt.descriptorDigest === binding.descriptorDigest &&
        receipt.turnIndex < binding.maximumTurnCount
    )
  );
};

export type AgentEvaluationProviderCapabilityObservationFactProjection =
  Readonly<{
    factKind: AgentEvaluationProviderCapabilityObservedFact['factKind'];
    factDigest: CanonicalDigest;
    /** Terminal type is the only fact payload field required by the matcher. */
    type?: AgentProviderEvent['type'];
  }>;

export type AgentEvaluationProviderCapabilityObservationProjection = Readonly<{
  receiptDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  observedAt: Instant;
  facts: readonly AgentEvaluationProviderCapabilityObservationFactProjection[];
  factAuthorities: readonly AgentEvaluationProviderCapabilityFactAuthority[];
  selectedRuntimeFactEnvelopeSetDigest: CanonicalDigest;
  sourceAuthoritySetDigest: CanonicalDigest;
}>;

type AgentEvaluationCapabilitySpecificProviderAuthorityProjection =
  | Readonly<{
      authorityKind:
        | 'provider-job'
        | 'provider-cache'
        | 'opaque-continuation'
        | 'retrieval-query'
        | 'usage-vector';
      factDigest: CanonicalDigest;
    }>
  | Readonly<{
      authorityKind: 'terminal-normalization';
      terminalEventDigest: CanonicalDigest;
    }>
  | Readonly<{
      authorityKind: 'capability-denial';
      category: 'authority-denial-receipt' | 'capability-unavailable-receipt';
      authorityResultDigest: CanonicalDigest;
      decisionDigest: CanonicalDigest;
    }>;

export type AgentEvaluationCapabilitySpecificProviderObservationProjection =
  Readonly<{
    providerCapabilityObservationReceiptDigest: CanonicalDigest;
    receiptKind: AgentEvaluationCapabilitySpecificReceipt['receiptKind'];
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    turnIndex: number;
    invocationId: string;
    requestDigest: CanonicalDigest;
    resultDigest: CanonicalDigest;
    completedAt: Instant;
    authority: AgentEvaluationCapabilitySpecificProviderAuthorityProjection;
  }>;

export const createAgentEvaluationProviderCapabilityObservationProjection = (
  observation: AgentEvaluationProviderCapabilityObservationReceipt
): AgentEvaluationProviderCapabilityObservationProjection => {
  if (!isAgentEvaluationProviderCapabilityObservationReceipt(observation)) {
    throw new TypeError('Provider capability observation is invalid.');
  }
  return Object.freeze({
    receiptDigest: observation.receiptDigest,
    planDigest: observation.planDigest,
    repositoryCommit: observation.repositoryCommit,
    attemptId: observation.attemptId,
    descriptorDigest: observation.descriptorDigest,
    turnIndex: observation.turnIndex,
    invocationId: observation.invocationId,
    requestDigest: observation.requestDigest,
    responseDigest: observation.responseDigest,
    observedAt: observation.observedAt,
    factAuthorities: observation.factAuthorities,
    selectedRuntimeFactEnvelopeSetDigest:
      observation.selectedRuntimeFactEnvelopeSetDigest,
    sourceAuthoritySetDigest: observation.sourceAuthoritySetDigest,
    facts: Object.freeze(
      observation.facts.map((fact) =>
        Object.freeze({
          factKind: fact.factKind,
          factDigest: fact.factDigest,
          ...(fact.factKind === 'provider-event'
            ? { type: fact.value.type }
            : {}),
        })
      )
    ),
  });
};

const projectedObservationHasExactFactAuthorities = (
  observation: AgentEvaluationProviderCapabilityObservationProjection
): boolean =>
  hasCanonicalFactAuthorities(observation.factAuthorities) &&
  observation.facts.length === observation.factAuthorities.length &&
  observation.facts.every((fact, index) => {
    const authority = observation.factAuthorities[index];
    return (
      authority?.factKind === fact.factKind &&
      authority.factDigest === fact.factDigest
    );
  }) &&
  observation.selectedRuntimeFactEnvelopeSetDigest ===
    digestAgentEvaluationSelectedRuntimeFactEnvelopeSet(
      observation.factAuthorities
    ) &&
  observation.sourceAuthoritySetDigest ===
    digestAgentEvaluationProviderCapabilitySourceAuthoritySet(
      observation.factAuthorities
    );

export const createAgentEvaluationCapabilitySpecificProviderObservationProjection =
  (
    receipt: AgentEvaluationCapabilitySpecificReceipt
  ): AgentEvaluationCapabilitySpecificProviderObservationProjection => {
    if (
      !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
      receipt.providerCapabilityObservationReceiptDigest === undefined
    ) {
      throw new TypeError(
        'Capability-specific provider observation reference is invalid.'
      );
    }
    const authority = (() => {
      switch (receipt.authority.authorityKind) {
        case 'provider-job':
        case 'provider-cache':
        case 'opaque-continuation':
        case 'retrieval-query':
        case 'usage-vector':
          return Object.freeze({
            authorityKind: receipt.authority.authorityKind,
            factDigest: receipt.authority.factDigest,
          });
        case 'terminal-normalization':
          if (
            receipt.authority.fact.authorityKind !== 'terminal-normalization'
          ) {
            throw new TypeError('Terminal normalization authority is invalid.');
          }
          return Object.freeze({
            authorityKind: receipt.authority.authorityKind,
            terminalEventDigest: receipt.authority.fact.terminalEventDigest,
          });
        case 'capability-denial':
          if (receipt.authority.fact.authorityKind !== 'capability-denial') {
            throw new TypeError('Capability denial authority is invalid.');
          }
          return Object.freeze({
            authorityKind: receipt.authority.authorityKind,
            category: receipt.authority.fact.category,
            authorityResultDigest: receipt.authority.fact.authorityResultDigest,
            decisionDigest: receipt.authority.fact.decisionDigest,
          });
        case 'parallel-tool-join':
        case 'controlled-tool-execution':
        case 'controlled-continuation':
        case 'controlled-runtime':
        case 'recovery-authority':
          throw new TypeError(
            'Capability-specific receipt has no provider observation authority.'
          );
      }
    })();
    return Object.freeze({
      providerCapabilityObservationReceiptDigest:
        receipt.providerCapabilityObservationReceiptDigest,
      receiptKind: receipt.receiptKind,
      planDigest: receipt.planDigest,
      repositoryCommit: receipt.repositoryCommit,
      attemptId: receipt.attemptId,
      descriptorDigest: receipt.descriptorDigest,
      turnIndex: receipt.turnIndex,
      invocationId: receipt.invocationId,
      requestDigest: receipt.requestDigest,
      resultDigest: receipt.resultDigest,
      completedAt: receipt.completedAt,
      authority,
    });
  };

const projectedObservationFactMatchesAuthority = (
  observation: AgentEvaluationProviderCapabilityObservationProjection,
  receipt: AgentEvaluationCapabilitySpecificProviderObservationProjection
): boolean => {
  const { authority } = receipt;
  const factKindByAuthority = {
    'provider-job': 'provider-job-receipt',
    'provider-cache': 'provider-cache-receipt',
    'opaque-continuation': 'opaque-continuation',
    'retrieval-query': 'retrieval-query-receipt',
    'usage-vector': 'usage-vector',
  } as const;
  switch (authority.authorityKind) {
    case 'provider-job':
    case 'provider-cache':
    case 'opaque-continuation':
    case 'retrieval-query':
    case 'usage-vector':
      return observation.facts.some(
        (fact) =>
          fact.factKind === factKindByAuthority[authority.authorityKind] &&
          fact.factDigest === authority.factDigest
      );
    case 'terminal-normalization':
      return observation.facts.some(
        (fact) =>
          fact.factKind === 'provider-event' &&
          fact.factDigest === authority.terminalEventDigest &&
          ((receipt.receiptKind === 'refusal-receipt' &&
            fact.type === 'refusal') ||
            (receipt.receiptKind === 'truncation-receipt' &&
              fact.type === 'truncation'))
      );
    case 'capability-denial':
      break;
  }
  if (
    authority.category !== receipt.receiptKind ||
    authority.authorityResultDigest !== observation.responseDigest ||
    authority.decisionDigest !== observation.responseDigest ||
    receipt.resultDigest !== observation.responseDigest
  ) {
    return false;
  }
  const terminalFacts = observation.facts.filter(
    (fact) => fact.factKind === 'provider-event'
  );
  if (
    terminalFacts.length !== 1 ||
    !observation.facts.every(
      (fact) =>
        fact.factKind === 'provider-event' || fact.factKind === 'usage-vector'
    )
  ) {
    return false;
  }
  if (receipt.receiptKind === 'capability-unavailable-receipt') {
    return true;
  }
  return (
    receipt.receiptKind === 'authority-denial-receipt' &&
    (terminalFacts[0]!.type === 'refusal' ||
      terminalFacts[0]!.type === 'safety-block')
  );
};

/** Canonical bounded matcher used by the archive verifier and full receipts. */
export const matchAgentEvaluationCapabilitySpecificProviderObservationProjection =
  (
    receipt: AgentEvaluationCapabilitySpecificProviderObservationProjection,
    observation: AgentEvaluationProviderCapabilityObservationProjection
  ): boolean =>
    projectedObservationHasExactFactAuthorities(observation) &&
    receipt.providerCapabilityObservationReceiptDigest ===
      observation.receiptDigest &&
    receipt.planDigest === observation.planDigest &&
    receipt.repositoryCommit === observation.repositoryCommit &&
    receipt.attemptId === observation.attemptId &&
    receipt.descriptorDigest === observation.descriptorDigest &&
    receipt.turnIndex === observation.turnIndex &&
    receipt.invocationId === observation.invocationId &&
    receipt.requestDigest === observation.requestDigest &&
    Date.parse(receipt.completedAt) >= Date.parse(observation.observedAt) &&
    projectedObservationFactMatchesAuthority(observation, receipt);

/** Exact, acyclic specific-receipt binding to a sanitized provider fact. */
export const matchAgentEvaluationCapabilitySpecificProviderObservation = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  observation: AgentEvaluationProviderCapabilityObservationReceipt
): boolean => {
  try {
    return matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
      createAgentEvaluationCapabilitySpecificProviderObservationProjection(
        receipt
      ),
      createAgentEvaluationProviderCapabilityObservationProjection(observation)
    );
  } catch {
    return false;
  }
};

export const digestAgentEvaluationProviderCapabilityObservationReceiptSet = (
  receipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    receiptDigests: [...receipts]
      .sort(canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder)
      .map(({ receiptDigest }) => receiptDigest),
  });
