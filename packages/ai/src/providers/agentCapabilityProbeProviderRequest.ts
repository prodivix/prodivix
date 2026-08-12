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
  isAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeProviderRequestIntent,
} from './agentCapabilityProbeProgram';
import {
  matchAgentCapabilityProbeProviderResourceAuthority,
  type AgentCapabilityProbeProviderResourceAuthority,
} from './agentCapabilityProbeProviderResource';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';

type AgentCapabilityProbeRequestPhase =
  AgentCapabilityProbeProviderRequestIntent['requestPhases'][number];

export const AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_FORMAT =
  'prodivix.agent-capability-probe-provider-request-policy' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_VERSION =
  1 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_MAXIMUM_BYTES =
  16_384 as const;

export type AgentCapabilityProbeProviderRequestCodecAvailability = Readonly<{
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  availability: 'available' | 'unavailable';
  unavailableReason:
    | 'anthropic-background-codec-unavailable'
    | 'anthropic-continuation-codec-unavailable'
    | 'anthropic-retrieval-codec-unavailable'
    | null;
}>;

export type AgentCapabilityProbeProviderRequestPolicy = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  protocolFamily: AgentNativeProviderProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  phase: AgentCapabilityProbeRequestPhase;
  sequence: number;
  operation:
    | 'interactions.create'
    | 'interactions.get'
    | 'messages.create'
    | 'responses.create'
    | 'responses.get';
  httpMethod: 'GET' | 'POST';
  responseMode: 'application-json' | 'server-sent-events';
  stream: boolean;
  store: boolean | null;
  background: boolean | null;
  providerStateReference: Readonly<{
    required: boolean;
    kind: 'interaction-id' | 'response-id' | null;
    placement:
      'path' | 'previous_interaction_id' | 'previous_response_id' | null;
  }>;
  cacheDirective:
    | Readonly<{
        kind: 'anthropic-ephemeral-prefix';
        ttl: '5m';
        prefixDescriptorDigest: CanonicalDigest;
      }>
    | Readonly<{
        kind: 'gemini-implicit-prefix';
        prefixDescriptorDigest: CanonicalDigest;
      }>
    | Readonly<{
        kind: 'openai-prompt-cache-key';
        promptCacheKey: string;
        prefixDescriptorDigest: CanonicalDigest;
      }>
    | null;
  retrievalDirective: Readonly<{
    toolType: 'file_search';
    resourceField: 'file_search_store_names' | 'vector_store_ids';
    providerResourceId: string;
    providerResourceAuthorityDigest: CanonicalDigest;
  }> | null;
  policyDigest: CanonicalDigest;
}>;

export type CreateAgentCapabilityProbeProviderRequestPolicyInput = Readonly<{
  protocolFamily: AgentNativeProviderProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  sequence: number;
  observedAt: Instant;
  providerResourceAuthority: AgentCapabilityProbeProviderResourceAuthority | null;
}>;

export type AgentCapabilityProbeProviderStateReferenceDirective = Readonly<{
  pathSegment: string | null;
  bodyFields: Readonly<
    Partial<Record<'previous_interaction_id' | 'previous_response_id', string>>
  >;
}>;

const policyKeys = Object.freeze([
  'format',
  'version',
  'probeProgramDigest',
  'profileProjectionDigest',
  'capabilityProfileId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'phase',
  'sequence',
  'operation',
  'httpMethod',
  'responseMode',
  'stream',
  'store',
  'background',
  'providerStateReference',
  'cacheDirective',
  'retrievalDirective',
  'policyDigest',
] as const);

const stateReferenceKeys = Object.freeze([
  'required',
  'kind',
  'placement',
] as const);

const retrievalKeys = Object.freeze([
  'toolType',
  'resourceField',
  'providerResourceId',
  'providerResourceAuthorityDigest',
] as const);

const cacheKeysByKind = Object.freeze({
  'anthropic-ephemeral-prefix': Object.freeze([
    'kind',
    'ttl',
    'prefixDescriptorDigest',
  ]),
  'gemini-implicit-prefix': Object.freeze(['kind', 'prefixDescriptorDigest']),
  'openai-prompt-cache-key': Object.freeze([
    'kind',
    'promptCacheKey',
    'prefixDescriptorDigest',
  ]),
} as const);

export const resolveAgentCapabilityProbeProviderRequestCodecAvailability = (
  protocolFamily: AgentNativeProviderProtocol,
  capabilityProfileId: AgentCapabilityProbeProfileId
): AgentCapabilityProbeProviderRequestCodecAvailability => {
  const unavailableReason =
    protocolFamily !== 'anthropic-messages'
      ? null
      : capabilityProfileId === 'g4-provider-background-job'
        ? 'anthropic-background-codec-unavailable'
        : capabilityProfileId === 'g4-provider-reasoning-continuation'
          ? 'anthropic-continuation-codec-unavailable'
          : capabilityProfileId === 'g4-provider-hosted-retrieval-core' ||
              capabilityProfileId === 'g4-provider-hosted-retrieval-document'
            ? 'anthropic-retrieval-codec-unavailable'
            : null;
  return Object.freeze({
    protocolFamily,
    capabilityProfileId,
    availability: unavailableReason === null ? 'available' : 'unavailable',
    unavailableReason,
  });
};

const createStateReferencePolicy = (
  protocolFamily: AgentNativeProviderProtocol,
  phase: AgentCapabilityProbeRequestPhase
): AgentCapabilityProbeProviderRequestPolicy['providerStateReference'] => {
  if (phase === 'poll') {
    return Object.freeze({
      required: true,
      kind:
        protocolFamily === 'openai-responses'
          ? ('response-id' as const)
          : ('interaction-id' as const),
      placement: 'path' as const,
    });
  }
  if (phase === 'resume') {
    return Object.freeze({
      required: true,
      kind:
        protocolFamily === 'openai-responses'
          ? ('response-id' as const)
          : ('interaction-id' as const),
      placement:
        protocolFamily === 'openai-responses'
          ? ('previous_response_id' as const)
          : ('previous_interaction_id' as const),
    });
  }
  return Object.freeze({ required: false, kind: null, placement: null });
};

const operationFor = (
  protocolFamily: AgentNativeProviderProtocol,
  phase: AgentCapabilityProbeRequestPhase
): AgentCapabilityProbeProviderRequestPolicy['operation'] => {
  if (protocolFamily === 'openai-responses') {
    return phase === 'poll' ? 'responses.get' : 'responses.create';
  }
  if (protocolFamily === 'gemini-interactions') {
    return phase === 'poll' ? 'interactions.get' : 'interactions.create';
  }
  return 'messages.create';
};

const cacheDirectiveFor = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: AgentNativeProviderProtocol
): AgentCapabilityProbeProviderRequestPolicy['cacheDirective'] => {
  const descriptor = program.providerRequestIntent.cachePrefixResource;
  if (descriptor === null) return null;
  if (protocolFamily === 'openai-responses') {
    return Object.freeze({
      kind: 'openai-prompt-cache-key',
      promptCacheKey: `capability-probe-cache.${descriptor.descriptorDigest.slice('sha256-'.length)}`,
      prefixDescriptorDigest: descriptor.descriptorDigest,
    });
  }
  if (protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      kind: 'anthropic-ephemeral-prefix',
      ttl: '5m',
      prefixDescriptorDigest: descriptor.descriptorDigest,
    });
  }
  return Object.freeze({
    kind: 'gemini-implicit-prefix',
    prefixDescriptorDigest: descriptor.descriptorDigest,
  });
};

const retrievalDirectiveFor = (
  authority: AgentCapabilityProbeProviderResourceAuthority | null
): AgentCapabilityProbeProviderRequestPolicy['retrievalDirective'] => {
  if (authority === null) return null;
  if (authority.protocolFamily === 'anthropic-messages') {
    throw new TypeError('Anthropic retrieval request codec is unavailable.');
  }
  return Object.freeze({
    toolType: 'file_search',
    resourceField:
      authority.protocolFamily === 'openai-responses'
        ? ('vector_store_ids' as const)
        : ('file_search_store_names' as const),
    providerResourceId: authority.providerResourceId,
    providerResourceAuthorityDigest: authority.authorityDigest,
  });
};

const policyBase = (
  value: Omit<AgentCapabilityProbeProviderRequestPolicy, 'policyDigest'>
) => Object.freeze({ ...value });

export const createAgentCapabilityProbeProviderRequestPolicy = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentCapabilityProbeProviderRequestPolicyInput
): AgentCapabilityProbeProviderRequestPolicy => {
  const phase = resolveAgentCapabilityProbeNetworkRoundTripPhase(
    program,
    input.sequence
  );
  const availability =
    resolveAgentCapabilityProbeProviderRequestCodecAvailability(
      input.protocolFamily,
      program.profileProjection.capabilityProfileId
    );
  const retrieval =
    program.profileProjection.capabilityId === 'provider.hosted-retrieval';
  if (
    !isAgentCapabilityProbeProgram(program) ||
    phase === null ||
    availability.availability !== 'available' ||
    !isAgentControlIdentity(input.providerConfigurationId) ||
    !isAgentControlIdentity(input.modelId) ||
    !isAgentCanonicalDigest(input.modelLineageDigest) ||
    !isAgentCanonicalDigest(input.adapterDigest) ||
    !isAgentControlInstant(input.observedAt) ||
    retrieval !== (input.providerResourceAuthority !== null) ||
    (input.providerResourceAuthority !== null &&
      !matchAgentCapabilityProbeProviderResourceAuthority(
        input.providerResourceAuthority,
        program,
        {
          protocolFamily: input.protocolFamily,
          providerConfigurationId: input.providerConfigurationId,
          modelId: input.modelId,
          modelLineageDigest: input.modelLineageDigest,
          adapterDigest: input.adapterDigest,
          authorityDigest: input.providerResourceAuthority.authorityDigest,
          observedAt: input.observedAt,
        }
      ))
  ) {
    throw new TypeError('Capability probe provider request policy is invalid.');
  }
  const operation = operationFor(input.protocolFamily, phase);
  const background =
    program.profileProjection.capabilityProfileId ===
    'g4-provider-background-job';
  const continuation =
    program.profileProjection.capabilityProfileId ===
    'g4-provider-reasoning-continuation';
  const stateful = background || continuation;
  const stream = program.profileProjection.deliveryMode === 'stream';
  const base = policyBase({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.providerConfigurationId,
    modelId: input.modelId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    phase,
    sequence: input.sequence,
    operation,
    httpMethod: operation.endsWith('.get') ? 'GET' : 'POST',
    responseMode: stream ? 'server-sent-events' : 'application-json',
    stream,
    store: input.protocolFamily === 'anthropic-messages' ? null : stateful,
    background:
      input.protocolFamily === 'anthropic-messages' ? null : background,
    providerStateReference: createStateReferencePolicy(
      input.protocolFamily,
      phase
    ),
    cacheDirective: cacheDirectiveFor(program, input.protocolFamily),
    retrievalDirective: retrievalDirectiveFor(input.providerResourceAuthority),
  });
  const policy = Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
  if (
    inspectAgentControlJson(
      policy,
      AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(canonicalJsonText(policy))
  ) {
    throw new TypeError(
      'Capability probe provider request policy is unsafe or unbounded.'
    );
  }
  return policy;
};

const cacheDirectiveIsExact = (
  value: AgentCapabilityProbeProviderRequestPolicy['cacheDirective']
): boolean => {
  if (value === null) return true;
  if (!Object.hasOwn(cacheKeysByKind, value.kind)) return false;
  return (
    hasExactAgentControlKeys(value, cacheKeysByKind[value.kind]) &&
    isAgentCanonicalDigest(value.prefixDescriptorDigest) &&
    (value.kind !== 'anthropic-ephemeral-prefix' || value.ttl === '5m') &&
    (value.kind !== 'openai-prompt-cache-key' ||
      isAgentControlIdentity(value.promptCacheKey))
  );
};

export const isAgentCapabilityProbeProviderRequestPolicy = (
  value: unknown
): value is AgentCapabilityProbeProviderRequestPolicy => {
  if (!hasExactAgentControlKeys(value, policyKeys)) return false;
  const policy = value as AgentCapabilityProbeProviderRequestPolicy;
  const { policyDigest: _policyDigest, ...base } = policy;
  return (
    policy.format === AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_FORMAT &&
    policy.version === AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_VERSION &&
    isAgentCanonicalDigest(policy.probeProgramDigest) &&
    isAgentCanonicalDigest(policy.profileProjectionDigest) &&
    isAgentControlIdentity(policy.providerConfigurationId) &&
    isAgentControlIdentity(policy.modelId) &&
    isAgentCanonicalDigest(policy.modelLineageDigest) &&
    isAgentCanonicalDigest(policy.adapterDigest) &&
    Number.isSafeInteger(policy.sequence) &&
    policy.sequence >= 0 &&
    ['GET', 'POST'].includes(policy.httpMethod) &&
    ['application-json', 'server-sent-events'].includes(policy.responseMode) &&
    hasExactAgentControlKeys(
      policy.providerStateReference,
      stateReferenceKeys
    ) &&
    typeof policy.providerStateReference.required === 'boolean' &&
    cacheDirectiveIsExact(policy.cacheDirective) &&
    (policy.retrievalDirective === null ||
      (hasExactAgentControlKeys(policy.retrievalDirective, retrievalKeys) &&
        policy.retrievalDirective.toolType === 'file_search' &&
        ['file_search_store_names', 'vector_store_ids'].includes(
          policy.retrievalDirective.resourceField
        ) &&
        isAgentControlIdentity(policy.retrievalDirective.providerResourceId) &&
        isAgentCanonicalDigest(
          policy.retrievalDirective.providerResourceAuthorityDigest
        ))) &&
    isAgentCanonicalDigest(policy.policyDigest) &&
    policy.policyDigest === digestAgentCanonicalValue(base) &&
    inspectAgentControlJson(
      policy,
      AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_POLICY_MAXIMUM_BYTES
    ).length === 0 &&
    !containsAgentControlCredentialLikeText(canonicalJsonText(policy))
  );
};

export const matchAgentCapabilityProbeProviderRequestPolicy = (
  policy: AgentCapabilityProbeProviderRequestPolicy,
  program: AgentCapabilityProbeProgram,
  input: CreateAgentCapabilityProbeProviderRequestPolicyInput
): boolean => {
  try {
    return sameCanonicalJson(
      policy,
      createAgentCapabilityProbeProviderRequestPolicy(program, input)
    );
  } catch {
    return false;
  }
};

export const createAgentCapabilityProbeProviderRequestBodyDirectives = (
  policy: AgentCapabilityProbeProviderRequestPolicy
): Readonly<Record<string, unknown>> => {
  if (!isAgentCapabilityProbeProviderRequestPolicy(policy)) {
    throw new TypeError('Capability probe provider request policy is invalid.');
  }
  if (policy.httpMethod === 'GET') return Object.freeze({});
  const fields: Record<string, unknown> = {
    stream: policy.stream,
  };
  if (policy.store !== null) fields.store = policy.store;
  if (policy.background !== null) fields.background = policy.background;
  if (policy.cacheDirective?.kind === 'openai-prompt-cache-key') {
    fields.prompt_cache_key = policy.cacheDirective.promptCacheKey;
  }
  if (policy.retrievalDirective !== null) {
    fields.tools = Object.freeze([
      Object.freeze({
        type: policy.retrievalDirective.toolType,
        [policy.retrievalDirective.resourceField]: Object.freeze([
          policy.retrievalDirective.providerResourceId,
        ]),
      }),
    ]);
  }
  return Object.freeze(fields);
};

/**
 * Materializes a callback-local Provider state handle at the exact placement
 * frozen by the public policy. The handle stays outside persisted policy
 * records; the caller commits the final encoded Provider payload separately.
 */
export const createAgentCapabilityProbeProviderStateReferenceDirective = (
  policy: AgentCapabilityProbeProviderRequestPolicy,
  providerStateReference: string | null
): AgentCapabilityProbeProviderStateReferenceDirective => {
  if (
    !isAgentCapabilityProbeProviderRequestPolicy(policy) ||
    policy.providerStateReference.required !==
      (providerStateReference !== null) ||
    (providerStateReference !== null &&
      !isAgentControlIdentity(providerStateReference))
  ) {
    throw new TypeError(
      'Capability probe Provider state reference is invalid.'
    );
  }
  const placement = policy.providerStateReference.placement;
  if (providerStateReference === null) {
    return Object.freeze({
      pathSegment: null,
      bodyFields: Object.freeze({}),
    });
  }
  if (placement === 'path') {
    return Object.freeze({
      pathSegment: providerStateReference,
      bodyFields: Object.freeze({}),
    });
  }
  if (
    placement !== 'previous_interaction_id' &&
    placement !== 'previous_response_id'
  ) {
    throw new TypeError(
      'Capability probe Provider state reference placement is invalid.'
    );
  }
  return Object.freeze({
    pathSegment: null,
    bodyFields: Object.freeze({ [placement]: providerStateReference }),
  });
};
