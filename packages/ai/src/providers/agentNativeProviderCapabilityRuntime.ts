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
  AGENT_CAPABILITY_PROBE_PROFILE_IDS,
  createAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbeCachePrefixMaterial,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';
import {
  isAgentHostedRetrievalRuntimeResourceAuthority,
  matchAgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
} from './agentHostedRetrievalRuntimeResource';
import {
  digestAgentNativeProviderRuntimeResponse,
  normalizeNativeAgentProviderRuntimeEvents,
  type AgentNativeProviderRuntimeFact,
  type AgentNativeProviderRuntimeFactSanitization,
} from './agentNativeProviderAdapters';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';
import { digestAgentNativeProviderStateReference } from './agentNativeProviderStateVault';
import type { AgentUsageVector } from './agentProvider.types';
import { normalizeAgentProviderRuntimePayload } from './agentProviderRuntime';

export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_REQUEST_FORMAT =
  'prodivix.agent-native-provider-capability-runtime-request-projection' as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_RESPONSE_FORMAT =
  'prodivix.agent-native-provider-capability-runtime-response-projection' as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_CACHE_WARM_AUTHORITY_FORMAT =
  'prodivix.agent-native-provider-capability-runtime-cache-warm-authority' as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION = 1 as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES =
  16_384 as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_OUTPUT_BYTES =
  8_192 as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PATH_BYTES =
  2_048 as const;
export const AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_LIFETIME_MS =
  125_000 as const;

export type AgentNativeProviderCapabilityRuntimeOperation =
  | 'background-poll'
  | 'background-submit'
  | 'cache-cold'
  | 'cache-warm'
  | 'continuation-parent'
  | 'continuation-resume'
  | 'hosted-retrieval-query';

export type AgentNativeProviderCapabilityRuntimeCodecAvailability = Readonly<{
  protocolFamily: AgentNativeProviderProtocol;
  operation: AgentNativeProviderCapabilityRuntimeOperation;
  availability: 'available' | 'unavailable';
  unavailableReason:
    | 'anthropic-background-runtime-codec-unavailable'
    | 'anthropic-continuation-runtime-codec-unavailable'
    | 'anthropic-retrieval-runtime-codec-unavailable'
    | null;
}>;

export type AgentNativeProviderCapabilityRuntimeRequestProjection = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_REQUEST_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  capabilityProfileDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  operation: AgentNativeProviderCapabilityRuntimeOperation;
  httpMethod: 'GET' | 'POST';
  apiVersion: 'v1';
  pathTemplate:
    | '/v1/messages'
    | '/v1/responses'
    | '/v1/responses/{response-id}'
    | '/v1/interactions'
    | '/v1/interactions/{interaction-id}';
  responseQuery: 'alt=json' | null;
  responseMode: 'application-json';
  stream: false;
  store: boolean | null;
  background: boolean | null;
  pathDigest: CanonicalDigest;
  requestBodyDigest: CanonicalDigest;
  requestBytes: number;
  providerStateReferenceKind: 'interaction-id' | 'response-id' | null;
  providerStateReferenceDigest: CanonicalDigest | null;
  providerResourceSetCommitmentDigest: CanonicalDigest | null;
  providerResourceAuthorityDigest: CanonicalDigest | null;
  providerResourceReadRequestDigest: CanonicalDigest | null;
  providerResourceReadReceiptDigest: CanonicalDigest | null;
  cachePrefixDescriptorDigest: CanonicalDigest | null;
  cacheKeyDigest: CanonicalDigest | null;
  requestTextDigest: CanonicalDigest | null;
  requestDigest: CanonicalDigest;
}>;

export type AgentNativeProviderCapabilityRuntimeRequestMaterial = Readonly<{
  projection: AgentNativeProviderCapabilityRuntimeRequestProjection;
  /** Callback-local path. Provider state handles are never stored in projection fields. */
  callbackLocalPath: string;
  /** Callback-local sanitized body. Credentials and headers stay outside this API. */
  callbackLocalBody: AgentJsonValue | null;
}>;

export type CreateAgentNativeProviderCapabilityRuntimeRequestMaterialInput =
  Readonly<{
    operation: AgentNativeProviderCapabilityRuntimeOperation;
    protocolFamily: AgentNativeProviderProtocol;
    providerConfigurationId: string;
    modelId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    callbackLocalBaseRequestBody: AgentJsonValue | null;
    callbackLocalProviderStateHandle: string | null;
    providerResourceAuthority: AgentHostedRetrievalRuntimeResourceAuthority | null;
    providerResourceReadRequest: AgentHostedRetrievalRuntimeResourceReadRequest | null;
    providerResourceReadReceipt: AgentHostedRetrievalRuntimeResourceReadReceipt | null;
    cacheKeyDigest: CanonicalDigest | null;
    observedAt: Instant;
  }>;

export type AgentNativeProviderCapabilityRuntimeDenialKind =
  'provider-denied' | 'response-invalid' | 'timed-out' | 'transport-failed';

export type AgentNativeProviderCapabilityRuntimeResponseProjection = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_RESPONSE_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION;
  requestDigest: CanonicalDigest;
  requestProjectionDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  operation: AgentNativeProviderCapabilityRuntimeOperation;
  transportOutcome: 'failed' | 'received' | 'timed-out';
  httpStatus: number | null;
  responseBodyDigest: CanonicalDigest | null;
  sealedResponseJsonDigest: CanonicalDigest | null;
  responseDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  providerStateReferenceKind: 'interaction-id' | 'response-id' | null;
  providerStateReferenceDigest: CanonicalDigest | null;
  providerStatus:
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'in-progress'
    | 'queued'
    | 'requires-action'
    | null;
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
  usageVectorDigest: CanonicalDigest | null;
  cachedTokenCount: number | null;
  outputTextDigest: CanonicalDigest | null;
  outputMarkerObserved: boolean;
  /** Exact Provider resource cited by one hosted retrieval response. */
  retrievalCitationResourceId: string | null;
  denialKind: AgentNativeProviderCapabilityRuntimeDenialKind | null;
  observedAt: Instant;
  projectionDigest: CanonicalDigest;
}>;

export type DecodeAgentNativeProviderCapabilityRuntimeResponseInput = Readonly<{
  transportOutcome: 'failed' | 'received' | 'timed-out';
  httpStatus: number | null;
  responseBodyDigest: CanonicalDigest | null;
  sealedResponseJson: AgentJsonValue | null;
  observedAt: Instant;
}>;

export type AgentNativeProviderCapabilityRuntimeResponseDecodeResult =
  Readonly<{
    projection: AgentNativeProviderCapabilityRuntimeResponseProjection;
    usageVector: AgentUsageVector | null;
    /** Callback-local official response/interaction id. */
    callbackLocalProviderStateHandle: string | null;
    /** Sanitized public/business output. */
    callbackLocalOutputText: string | null;
  }>;

export type AgentNativeProviderCapabilityRuntimeCacheWarmAuthority = Readonly<{
  format: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_CACHE_WARM_AUTHORITY_FORMAT;
  version: typeof AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  cachePrefixDescriptorDigest: CanonicalDigest;
  cacheKeyDigest: CanonicalDigest;
  coldRequestDigest: CanonicalDigest;
  coldResponseProjectionDigest: CanonicalDigest;
  coldUsageVectorDigest: CanonicalDigest;
  coldCachedTokenCount: 0;
  warmRequestDigest: CanonicalDigest;
  preparedAt: Instant;
  expiresAt: Instant;
  authorityDigest: CanonicalDigest;
}>;

const emptySanitization: AgentNativeProviderRuntimeFactSanitization =
  Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  });
const encoder = new TextEncoder();
const publicMarker = 'prodivix-capability-probe-v1';

const requestProjectionKeys = Object.freeze([
  'format',
  'version',
  'probeProgramDigest',
  'profileProjectionDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'operation',
  'httpMethod',
  'apiVersion',
  'pathTemplate',
  'responseQuery',
  'responseMode',
  'stream',
  'store',
  'background',
  'pathDigest',
  'requestBodyDigest',
  'requestBytes',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'providerResourceSetCommitmentDigest',
  'providerResourceAuthorityDigest',
  'providerResourceReadRequestDigest',
  'providerResourceReadReceiptDigest',
  'cachePrefixDescriptorDigest',
  'cacheKeyDigest',
  'requestTextDigest',
  'requestDigest',
] as const);

const responseProjectionKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'requestProjectionDigest',
  'protocolFamily',
  'operation',
  'transportOutcome',
  'httpStatus',
  'responseBodyDigest',
  'sealedResponseJsonDigest',
  'responseDigest',
  'normalizedEventSetDigest',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'providerStatus',
  'terminalEventType',
  'usageVectorDigest',
  'cachedTokenCount',
  'outputTextDigest',
  'outputMarkerObserved',
  'retrievalCitationResourceId',
  'denialKind',
  'observedAt',
  'projectionDigest',
] as const);

const cacheWarmAuthorityKeys = Object.freeze([
  'format',
  'version',
  'probeProgramDigest',
  'profileProjectionDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'cachePrefixDescriptorDigest',
  'cacheKeyDigest',
  'coldRequestDigest',
  'coldResponseProjectionDigest',
  'coldUsageVectorDigest',
  'coldCachedTokenCount',
  'warmRequestDigest',
  'preparedAt',
  'expiresAt',
  'authorityDigest',
] as const);

const safeBounded = (
  value: unknown,
  maximumBytes: number,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): boolean => {
  try {
    const text = canonicalJsonText(value);
    return (
      encoder.encode(text).byteLength <= maximumBytes &&
      inspectAgentControlJson(value, maximumBytes).length === 0 &&
      !containsAgentControlCredentialLikeText(text) &&
      (sanitization.secretCanaries.length === 0 ||
        scanAgentArtifactForSecretCanaries(value, sanitization.secretCanaries)
          .length === 0) &&
      (sanitization.protectedMaterialCanaries.length === 0 ||
        scanAgentArtifactForProtectedHoldoutLeak(
          value,
          sanitization.protectedMaterialCanaries
        ).length === 0)
    );
  } catch {
    return false;
  }
};

const profilesForOperation = (
  operation: AgentNativeProviderCapabilityRuntimeOperation
): readonly AgentCapabilityProbeProfileId[] => {
  switch (operation) {
    case 'background-poll':
    case 'background-submit':
      return Object.freeze(['g4-provider-background-job']);
    case 'cache-cold':
    case 'cache-warm':
      return Object.freeze(['g4-provider-isolated-cache']);
    case 'continuation-parent':
    case 'continuation-resume':
      return Object.freeze(['g4-provider-reasoning-continuation']);
    case 'hosted-retrieval-query':
      return Object.freeze([
        'g4-provider-hosted-retrieval-core',
        'g4-provider-hosted-retrieval-document',
      ]);
  }
};

const operationMatchesProfile = (
  operation: AgentNativeProviderCapabilityRuntimeOperation,
  capabilityProfileId: AgentCapabilityProbeProfileId
): boolean => profilesForOperation(operation).includes(capabilityProfileId);

export const resolveAgentNativeProviderCapabilityRuntimeCodecAvailability = (
  protocolFamily: AgentNativeProviderProtocol,
  operation: AgentNativeProviderCapabilityRuntimeOperation
): AgentNativeProviderCapabilityRuntimeCodecAvailability => {
  const unavailableReason =
    protocolFamily !== 'anthropic-messages'
      ? null
      : operation.startsWith('background-')
        ? ('anthropic-background-runtime-codec-unavailable' as const)
        : operation.startsWith('continuation-')
          ? ('anthropic-continuation-runtime-codec-unavailable' as const)
          : operation === 'hosted-retrieval-query'
            ? ('anthropic-retrieval-runtime-codec-unavailable' as const)
            : null;
  return Object.freeze({
    protocolFamily,
    operation,
    availability: unavailableReason === null ? 'available' : 'unavailable',
    unavailableReason,
  });
};

const stateReferenceKindFor = (
  protocolFamily: AgentNativeProviderProtocol
): 'interaction-id' | 'response-id' | null =>
  protocolFamily === 'openai-responses'
    ? 'response-id'
    : protocolFamily === 'gemini-interactions'
      ? 'interaction-id'
      : null;

const operationUsesState = (
  operation: AgentNativeProviderCapabilityRuntimeOperation
): boolean =>
  operation === 'background-poll' || operation === 'continuation-resume';

const operationUsesBaseBody = (
  operation: AgentNativeProviderCapabilityRuntimeOperation
): boolean =>
  operation === 'background-submit' || operation === 'continuation-parent';

const pathPolicyFor = (
  protocolFamily: AgentNativeProviderProtocol,
  operation: AgentNativeProviderCapabilityRuntimeOperation
): Readonly<{
  apiVersion: 'v1';
  pathTemplate: AgentNativeProviderCapabilityRuntimeRequestProjection['pathTemplate'];
  responseQuery: 'alt=json' | null;
}> => {
  if (protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      apiVersion: 'v1',
      pathTemplate: '/v1/messages',
      responseQuery: null,
    });
  }
  if (protocolFamily === 'openai-responses') {
    return Object.freeze({
      apiVersion: 'v1',
      pathTemplate:
        operation === 'background-poll'
          ? '/v1/responses/{response-id}'
          : '/v1/responses',
      responseQuery: null,
    });
  }
  return Object.freeze({
    apiVersion: 'v1',
    pathTemplate:
      operation === 'background-poll'
        ? '/v1/interactions/{interaction-id}'
        : '/v1/interactions',
    responseQuery: 'alt=json',
  });
};

const pathFor = (
  protocolFamily: AgentNativeProviderProtocol,
  operation: AgentNativeProviderCapabilityRuntimeOperation,
  stateHandle: string | null
): Readonly<{
  callbackLocalPath: string;
  apiVersion: 'v1';
  pathTemplate: AgentNativeProviderCapabilityRuntimeRequestProjection['pathTemplate'];
  responseQuery: 'alt=json' | null;
}> => {
  const policy = pathPolicyFor(protocolFamily, operation);
  if (protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      callbackLocalPath: '/v1/messages',
      ...policy,
    });
  }
  if (protocolFamily === 'openai-responses') {
    return operation === 'background-poll'
      ? Object.freeze({
          callbackLocalPath: `/v1/responses/${encodeURIComponent(stateHandle!)}`,
          ...policy,
        })
      : Object.freeze({
          callbackLocalPath: '/v1/responses',
          ...policy,
        });
  }
  return operation === 'background-poll'
    ? Object.freeze({
        callbackLocalPath: `/v1/interactions/${encodeURIComponent(stateHandle!)}?alt=json`,
        ...policy,
      })
    : Object.freeze({
        callbackLocalPath: '/v1/interactions?alt=json',
        ...policy,
      });
};

const assertUnreservedBaseBody = (
  value: AgentJsonValue | null,
  modelId: string
): Readonly<Record<string, unknown>> => {
  if (
    !isPlainObject(value) ||
    value.model !== modelId ||
    [
      'stream',
      'store',
      'background',
      'previous_response_id',
      'previous_interaction_id',
      'prompt_cache_key',
    ].some((key) => Object.hasOwn(value, key)) ||
    Object.hasOwn(value, 'tools') ||
    Object.hasOwn(value, 'tool_choice')
  ) {
    throw new TypeError(
      'Native Provider capability runtime base request body is invalid.'
    );
  }
  return value;
};

const cacheText = (
  program: AgentCapabilityProbeProgram,
  operation: 'cache-cold' | 'cache-warm'
): Readonly<{ prefix: string; suffix: string; text: string }> => {
  const material = resolveAgentCapabilityProbeCachePrefixMaterial(program);
  if (material === null) {
    throw new TypeError(
      'Native Provider capability cache material is missing.'
    );
  }
  const suffix =
    operation === 'cache-cold'
      ? material.coldSuffixText
      : material.warmSuffixText;
  return Object.freeze({
    prefix: material.prefixText,
    suffix,
    text: `${material.prefixText}\n${suffix}`,
  });
};

const providerBody = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentNativeProviderCapabilityRuntimeRequestMaterialInput
): Readonly<Record<string, unknown>> | null => {
  if (input.operation === 'background-poll') return null;
  const cache =
    input.operation === 'cache-cold' || input.operation === 'cache-warm'
      ? cacheText(program, input.operation)
      : null;
  if (input.protocolFamily === 'anthropic-messages') {
    if (cache === null) {
      throw new TypeError('Anthropic capability runtime codec is unavailable.');
    }
    return Object.freeze({
      model: input.modelId,
      max_tokens: 256,
      stream: false,
      messages: Object.freeze([
        Object.freeze({
          role: 'user',
          content: Object.freeze([
            Object.freeze({
              type: 'text',
              text: cache.prefix,
              cache_control: Object.freeze({ type: 'ephemeral', ttl: '5m' }),
            }),
            Object.freeze({ type: 'text', text: cache.suffix }),
          ]),
        }),
      ]),
    });
  }
  if (cache !== null) {
    return Object.freeze({
      model: input.modelId,
      input: cache.text,
      stream: false,
      store: false,
      background: false,
      ...(input.protocolFamily === 'openai-responses'
        ? {
            prompt_cache_key: `runtime-cache.${input.cacheKeyDigest!.slice('sha256-'.length)}`,
          }
        : {}),
    });
  }
  if (input.operation === 'continuation-resume') {
    return Object.freeze({
      model: input.modelId,
      input:
        'Resume the sealed Provider state and return the bounded capability result.',
      stream: false,
      store: false,
      background: false,
      ...(input.protocolFamily === 'openai-responses'
        ? { previous_response_id: input.callbackLocalProviderStateHandle! }
        : {
            previous_interaction_id: input.callbackLocalProviderStateHandle!,
          }),
    });
  }
  if (input.operation === 'hosted-retrieval-query') {
    const resource = resolveAgentCapabilityProbePublicResource(program);
    if (resource === null || input.providerResourceAuthority === null) {
      throw new TypeError('Hosted retrieval resource material is missing.');
    }
    return Object.freeze({
      model: input.modelId,
      input: resource.queryText,
      stream: false,
      store: false,
      background: false,
      tools: Object.freeze([
        Object.freeze({
          type: 'file_search',
          [input.protocolFamily === 'openai-responses'
            ? 'vector_store_ids'
            : 'file_search_store_names']: Object.freeze([
            input.providerResourceAuthority.providerResourceId,
          ]),
        }),
      ]),
    });
  }
  const base = assertUnreservedBaseBody(
    input.callbackLocalBaseRequestBody,
    input.modelId
  );
  return Object.freeze({
    ...base,
    stream: false,
    store: true,
    background: input.operation === 'background-submit',
  });
};

const normalizeBody = (
  value: Readonly<Record<string, unknown>> | null,
  maximumBytes: number,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): AgentJsonValue | null => {
  if (value === null) return null;
  const normalized = normalizeAgentProviderRuntimePayload(value, {
    maximumBytes,
    secretCanaries: sanitization.secretCanaries,
  });
  if (
    !isPlainObject(normalized) ||
    !safeBounded(normalized, maximumBytes, sanitization)
  ) {
    throw new TypeError(
      'Native Provider capability runtime request body is unsafe or invalid.'
    );
  }
  return normalized;
};

const requestTextDigest = (
  program: AgentCapabilityProbeProgram,
  operation: AgentNativeProviderCapabilityRuntimeOperation
): CanonicalDigest | null => {
  if (operation === 'background-poll') return null;
  if (operation === 'cache-cold' || operation === 'cache-warm') {
    return digestAgentCanonicalValue({
      text: cacheText(program, operation).text,
    });
  }
  if (operation === 'hosted-retrieval-query') {
    const resource = resolveAgentCapabilityProbePublicResource(program);
    return resource === null
      ? null
      : digestAgentCanonicalValue({ query: resource.queryText });
  }
  return program.providerRequestIntent.publicPayloadDigest;
};

export const createAgentNativeProviderCapabilityRuntimeRequestMaterial = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentNativeProviderCapabilityRuntimeRequestMaterialInput,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): AgentNativeProviderCapabilityRuntimeRequestMaterial => {
  const stateRequired = operationUsesState(input.operation);
  const baseBodyRequired = operationUsesBaseBody(input.operation);
  const stateKind = stateReferenceKindFor(input.protocolFamily);
  const retrieval = input.operation === 'hosted-retrieval-query';
  const cache =
    input.operation === 'cache-cold' || input.operation === 'cache-warm';
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(input, [
      'operation',
      'protocolFamily',
      'providerConfigurationId',
      'modelId',
      'modelLineageDigest',
      'adapterDigest',
      'callbackLocalBaseRequestBody',
      'callbackLocalProviderStateHandle',
      'providerResourceAuthority',
      'providerResourceReadRequest',
      'providerResourceReadReceipt',
      'cacheKeyDigest',
      'observedAt',
    ]) ||
    !operationMatchesProfile(
      input.operation,
      program.profileProjection.capabilityProfileId
    ) ||
    resolveAgentNativeProviderCapabilityRuntimeCodecAvailability(
      input.protocolFamily,
      input.operation
    ).availability !== 'available' ||
    ![input.providerConfigurationId, input.modelId].every(
      isAgentControlIdentity
    ) ||
    ![input.modelLineageDigest, input.adapterDigest].every(
      isAgentCanonicalDigest
    ) ||
    !isAgentControlInstant(input.observedAt) ||
    stateRequired !== (input.callbackLocalProviderStateHandle !== null) ||
    baseBodyRequired !== (input.callbackLocalBaseRequestBody !== null) ||
    (input.callbackLocalProviderStateHandle !== null &&
      (!isAgentControlIdentity(input.callbackLocalProviderStateHandle) ||
        containsAgentControlCredentialLikeText(
          input.callbackLocalProviderStateHandle
        ))) ||
    retrieval !== (input.providerResourceAuthority !== null) ||
    retrieval !== (input.providerResourceReadRequest !== null) ||
    retrieval !== (input.providerResourceReadReceipt !== null) ||
    cache !== (input.cacheKeyDigest !== null) ||
    (input.cacheKeyDigest !== null &&
      !isAgentCanonicalDigest(input.cacheKeyDigest)) ||
    (retrieval &&
      (!isAgentHostedRetrievalRuntimeResourceAuthority(
        input.providerResourceAuthority
      ) ||
        !matchAgentHostedRetrievalRuntimeResourceReadReceipt(
          input.providerResourceReadReceipt!,
          input.providerResourceReadRequest!,
          input.providerResourceAuthority,
          input.observedAt
        ) ||
        input.providerResourceAuthority.protocolFamily !==
          input.protocolFamily ||
        input.providerResourceAuthority.providerConfigurationId !==
          input.providerConfigurationId ||
        input.providerResourceAuthority.modelId !== input.modelId ||
        input.providerResourceAuthority.modelLineageDigest !==
          input.modelLineageDigest ||
        input.providerResourceAuthority.adapterDigest !== input.adapterDigest ||
        input.providerResourceAuthority.probeProgramDigest !==
          program.programDigest ||
        input.providerResourceAuthority.capabilityProfileId !==
          program.profileProjection.capabilityProfileId ||
        input.providerResourceAuthority.capabilityProfileDigest !==
          program.profileProjection.capabilityProfileDigest ||
        input.providerResourceAuthority.publicResourceDescriptorDigest !==
          program.providerRequestIntent.publicProbeResource?.descriptorDigest))
  ) {
    throw new TypeError(
      'Native Provider capability runtime request input is invalid.'
    );
  }
  const path = pathFor(
    input.protocolFamily,
    input.operation,
    input.callbackLocalProviderStateHandle
  );
  if (
    encoder.encode(path.callbackLocalPath).byteLength >
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PATH_BYTES ||
    containsAgentControlCredentialLikeText(path.callbackLocalPath)
  ) {
    throw new TypeError('Native Provider capability runtime path is invalid.');
  }
  const body = normalizeBody(
    providerBody(program, input),
    program.hardLimits.maximumRequestBytes,
    sanitization
  );
  const requestBodyDigest = digestAgentCanonicalValue({ body });
  const requestBytes =
    encoder.encode(path.callbackLocalPath).byteLength +
    (body === null ? 0 : encoder.encode(canonicalJsonText(body)).byteLength);
  const stateDigest =
    input.callbackLocalProviderStateHandle === null || stateKind === null
      ? null
      : digestAgentNativeProviderStateReference(
          stateKind,
          input.callbackLocalProviderStateHandle
        );
  const descriptor = program.providerRequestIntent.cachePrefixResource;
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_REQUEST_FORMAT,
    version: AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.providerConfigurationId,
    modelId: input.modelId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    operation: input.operation,
    httpMethod:
      input.operation === 'background-poll'
        ? ('GET' as const)
        : ('POST' as const),
    apiVersion: path.apiVersion,
    pathTemplate: path.pathTemplate,
    responseQuery: path.responseQuery,
    responseMode: 'application-json' as const,
    stream: false as const,
    store:
      input.protocolFamily === 'anthropic-messages'
        ? null
        : input.operation === 'background-submit' ||
          input.operation === 'continuation-parent',
    background:
      input.protocolFamily === 'anthropic-messages'
        ? null
        : input.operation === 'background-submit',
    pathDigest: digestAgentCanonicalValue({ path: path.callbackLocalPath }),
    requestBodyDigest,
    requestBytes,
    providerStateReferenceKind: stateRequired ? stateKind : null,
    providerStateReferenceDigest: stateDigest,
    providerResourceAuthorityDigest:
      input.providerResourceAuthority?.authorityDigest ?? null,
    providerResourceSetCommitmentDigest:
      input.providerResourceReadRequest?.resourceSetCommitmentDigest ?? null,
    providerResourceReadRequestDigest:
      input.providerResourceReadRequest?.requestDigest ?? null,
    providerResourceReadReceiptDigest:
      input.providerResourceReadReceipt?.receiptDigest ?? null,
    cachePrefixDescriptorDigest: descriptor?.descriptorDigest ?? null,
    cacheKeyDigest: input.cacheKeyDigest,
    requestTextDigest: requestTextDigest(program, input.operation),
  });
  const projection = Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
  if (
    requestBytes > program.hardLimits.maximumRequestBytes ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      projection,
      program
    ) ||
    !safeBounded(
      projection,
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES,
      sanitization
    )
  ) {
    throw new TypeError(
      'Native Provider capability runtime request projection is invalid.'
    );
  }
  return Object.freeze({
    projection,
    callbackLocalPath: path.callbackLocalPath,
    callbackLocalBody: body,
  });
};

export const isAgentNativeProviderCapabilityRuntimeRequestProjection = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentNativeProviderCapabilityRuntimeRequestProjection => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(value, requestProjectionKeys)
  ) {
    return false;
  }
  const projection =
    value as AgentNativeProviderCapabilityRuntimeRequestProjection;
  const { requestDigest, ...base } = projection;
  const cache =
    projection.operation === 'cache-cold' ||
    projection.operation === 'cache-warm';
  const retrieval = projection.operation === 'hosted-retrieval-query';
  const state = operationUsesState(projection.operation);
  return (
    projection.format ===
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_REQUEST_FORMAT &&
    projection.version === AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION &&
    projection.probeProgramDigest === program.programDigest &&
    projection.profileProjectionDigest === program.profileProjectionDigest &&
    projection.capabilityProfileId ===
      program.profileProjection.capabilityProfileId &&
    projection.capabilityProfileDigest ===
      program.profileProjection.capabilityProfileDigest &&
    operationMatchesProfile(
      projection.operation,
      projection.capabilityProfileId
    ) &&
    resolveAgentNativeProviderCapabilityRuntimeCodecAvailability(
      projection.protocolFamily,
      projection.operation
    ).availability === 'available' &&
    isAgentControlIdentity(projection.providerConfigurationId) &&
    isAgentControlIdentity(projection.modelId) &&
    isAgentCanonicalDigest(projection.modelLineageDigest) &&
    isAgentCanonicalDigest(projection.adapterDigest) &&
    projection.httpMethod ===
      (projection.operation === 'background-poll' ? 'GET' : 'POST') &&
    projection.apiVersion ===
      pathPolicyFor(projection.protocolFamily, projection.operation)
        .apiVersion &&
    projection.pathTemplate ===
      pathPolicyFor(projection.protocolFamily, projection.operation)
        .pathTemplate &&
    projection.responseQuery ===
      pathPolicyFor(projection.protocolFamily, projection.operation)
        .responseQuery &&
    projection.responseMode === 'application-json' &&
    projection.stream === false &&
    (projection.protocolFamily === 'anthropic-messages'
      ? projection.store === null && projection.background === null
      : projection.store ===
          (projection.operation === 'background-submit' ||
            projection.operation === 'continuation-parent') &&
        projection.background ===
          (projection.operation === 'background-submit')) &&
    isAgentCanonicalDigest(projection.pathDigest) &&
    isAgentCanonicalDigest(projection.requestBodyDigest) &&
    Number.isSafeInteger(projection.requestBytes) &&
    projection.requestBytes > 0 &&
    projection.requestBytes <= program.hardLimits.maximumRequestBytes &&
    state === (projection.providerStateReferenceDigest !== null) &&
    (projection.providerStateReferenceDigest === null ||
      isAgentCanonicalDigest(projection.providerStateReferenceDigest)) &&
    projection.providerStateReferenceKind ===
      (state ? stateReferenceKindFor(projection.protocolFamily) : null) &&
    retrieval === (projection.providerResourceSetCommitmentDigest !== null) &&
    (projection.providerResourceSetCommitmentDigest === null ||
      isAgentCanonicalDigest(projection.providerResourceSetCommitmentDigest)) &&
    retrieval === (projection.providerResourceAuthorityDigest !== null) &&
    (projection.providerResourceAuthorityDigest === null ||
      isAgentCanonicalDigest(projection.providerResourceAuthorityDigest)) &&
    retrieval === (projection.providerResourceReadRequestDigest !== null) &&
    (projection.providerResourceReadRequestDigest === null ||
      isAgentCanonicalDigest(projection.providerResourceReadRequestDigest)) &&
    retrieval === (projection.providerResourceReadReceiptDigest !== null) &&
    (projection.providerResourceReadReceiptDigest === null ||
      isAgentCanonicalDigest(projection.providerResourceReadReceiptDigest)) &&
    cache === (projection.cacheKeyDigest !== null) &&
    (projection.cacheKeyDigest === null ||
      isAgentCanonicalDigest(projection.cacheKeyDigest)) &&
    projection.cachePrefixDescriptorDigest ===
      (cache
        ? (program.providerRequestIntent.cachePrefixResource
            ?.descriptorDigest ?? null)
        : null) &&
    (projection.operation === 'background-poll'
      ? projection.requestTextDigest === null
      : isAgentCanonicalDigest(projection.requestTextDigest)) &&
    isAgentCanonicalDigest(requestDigest) &&
    requestDigest === digestAgentCanonicalValue(base) &&
    safeBounded(
      projection,
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES
    )
  );
};

/**
 * Validates a durable request projection by resolving its repository-owned
 * program from the committed profile identity. Callers never supply tags or a
 * second program registry at archive/turn admission boundaries.
 */
export const isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf = (
  value: unknown
): value is AgentNativeProviderCapabilityRuntimeRequestProjection => {
  if (!hasExactAgentControlKeys(value, requestProjectionKeys)) return false;
  const projection =
    value as AgentNativeProviderCapabilityRuntimeRequestProjection;
  if (
    !AGENT_CAPABILITY_PROBE_PROFILE_IDS.includes(
      projection.capabilityProfileId as AgentCapabilityProbeProfileId
    ) ||
    !isAgentCanonicalDigest(projection.capabilityProfileDigest)
  ) {
    return false;
  }
  try {
    return isAgentNativeProviderCapabilityRuntimeRequestProjection(
      projection,
      resolveAgentNativeProviderCapabilityRuntimeProgram(
        projection.capabilityProfileId,
        projection.capabilityProfileDigest
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentNativeProviderCapabilityRuntimeRequestMaterial = (
  value: AgentNativeProviderCapabilityRuntimeRequestMaterial,
  program: AgentCapabilityProbeProgram,
  input: CreateAgentNativeProviderCapabilityRuntimeRequestMaterialInput,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): boolean => {
  try {
    return sameCanonicalJson(
      value,
      createAgentNativeProviderCapabilityRuntimeRequestMaterial(
        program,
        input,
        sanitization
      )
    );
  } catch {
    return false;
  }
};

const factDigest = (fact: AgentNativeProviderRuntimeFact): CanonicalDigest => {
  switch (fact.factType) {
    case 'provider-event':
      return fact.value.durableEvent.eventDigest as CanonicalDigest;
    case 'usage-vector':
      return fact.value.vectorDigest as CanonicalDigest;
    case 'provider-job-receipt':
    case 'provider-cache-receipt':
      return fact.value.receiptDigest as CanonicalDigest;
    case 'opaque-continuation':
      return fact.value.continuationDigest as CanonicalDigest;
  }
};

const responseEvents = (value: AgentJsonValue): readonly unknown[] =>
  Array.isArray(value) ? value : Object.freeze([value]);

const objectValue = (
  value: unknown
): Readonly<Record<string, unknown>> | null =>
  isPlainObject(value) ? value : null;

const annotationValues = (
  value: Readonly<Record<string, unknown>>,
  context: string
): readonly Readonly<Record<string, unknown>>[] => {
  if (!Object.hasOwn(value, 'annotations')) return Object.freeze([]);
  if (!Array.isArray(value.annotations)) {
    throw new TypeError(`${context} annotations are invalid.`);
  }
  return Object.freeze(
    value.annotations.map((annotation) => {
      const object = objectValue(annotation);
      if (object === null) {
        throw new TypeError(`${context} annotation is invalid.`);
      }
      return object;
    })
  );
};

const openAiCitationAnnotations = (
  response: Readonly<Record<string, unknown>>
): readonly Readonly<Record<string, unknown>>[] => {
  if (!Array.isArray(response.output)) return Object.freeze([]);
  const annotations: Readonly<Record<string, unknown>>[] = [];
  for (const rawOutput of response.output) {
    const output = objectValue(rawOutput);
    if (output === null || !Array.isArray(output.content)) continue;
    for (const rawContent of output.content) {
      const content = objectValue(rawContent);
      if (content === null || content.type !== 'output_text') continue;
      annotations.push(...annotationValues(content, 'OpenAI output text'));
    }
  }
  return Object.freeze(annotations);
};

const geminiCitationAnnotations = (
  interaction: Readonly<Record<string, unknown>>
): readonly Readonly<Record<string, unknown>>[] => {
  const annotations: Readonly<Record<string, unknown>>[] = [];
  for (const collection of [interaction.steps, interaction.outputs]) {
    if (!Array.isArray(collection)) continue;
    for (const rawOutput of collection) {
      const output = objectValue(rawOutput);
      if (output === null) continue;
      annotations.push(...annotationValues(output, 'Gemini output'));
      if (!Array.isArray(output.content)) continue;
      for (const rawContent of output.content) {
        const content = objectValue(rawContent);
        if (
          content === null ||
          !['output_text', 'text'].includes(String(content.type))
        ) {
          continue;
        }
        annotations.push(...annotationValues(content, 'Gemini output text'));
      }
    }
  }
  return Object.freeze(annotations);
};

const retrievalCitationResourceId = (
  protocolFamily: AgentNativeProviderProtocol,
  operation: AgentNativeProviderCapabilityRuntimeOperation,
  body: AgentJsonValue
): string | null => {
  if (operation !== 'hosted-retrieval-query') return null;
  const resourceIds = new Set<string>();
  for (const raw of responseEvents(body)) {
    const event = objectValue(raw);
    if (event === null) continue;
    if (protocolFamily === 'openai-responses') {
      const response =
        objectValue(event.response) ??
        (event.object === 'response' || Array.isArray(event.output)
          ? event
          : null);
      if (response === null) continue;
      for (const annotation of openAiCitationAnnotations(response)) {
        if (annotation.type !== 'file_citation') continue;
        if (
          !isAgentControlIdentity(annotation.file_id) ||
          containsAgentControlCredentialLikeText(annotation.file_id)
        ) {
          throw new TypeError(
            'OpenAI hosted retrieval file citation is invalid.'
          );
        }
        resourceIds.add(annotation.file_id);
      }
    } else if (protocolFamily === 'gemini-interactions') {
      const interaction =
        objectValue(event.interaction) ??
        (Array.isArray(event.steps) || Array.isArray(event.outputs)
          ? event
          : null);
      if (interaction === null) continue;
      for (const annotation of geminiCitationAnnotations(interaction)) {
        if (annotation.type !== 'file_citation') continue;
        if (
          !isAgentControlIdentity(annotation.document_uri) ||
          containsAgentControlCredentialLikeText(annotation.document_uri)
        ) {
          throw new TypeError(
            'Gemini hosted retrieval file citation is invalid.'
          );
        }
        resourceIds.add(annotation.document_uri);
      }
    }
  }
  if (resourceIds.size > 1) {
    throw new TypeError('Hosted retrieval Provider citation is ambiguous.');
  }
  return resourceIds.values().next().value ?? null;
};

const providerState = (
  protocolFamily: AgentNativeProviderProtocol,
  body: AgentJsonValue
): Readonly<{ handle: string | null; status: string | null }> => {
  let handle: string | null = null;
  let status: string | null = null;
  for (const raw of responseEvents(body)) {
    const event = objectValue(raw);
    if (event === null) continue;
    if (protocolFamily === 'openai-responses') {
      const response =
        objectValue(event.response) ??
        (event.object === 'response' || Array.isArray(event.output)
          ? event
          : null);
      if (response !== null) {
        if (typeof response.id === 'string') handle = response.id;
        if (typeof response.status === 'string') status = response.status;
      }
    } else if (protocolFamily === 'gemini-interactions') {
      const interaction =
        objectValue(event.interaction) ??
        (Array.isArray(event.steps) || Array.isArray(event.outputs)
          ? event
          : null);
      if (interaction !== null) {
        if (typeof interaction.id === 'string') handle = interaction.id;
        if (typeof interaction.status === 'string') status = interaction.status;
      }
    }
  }
  if (
    handle !== null &&
    (!isAgentControlIdentity(handle) ||
      containsAgentControlCredentialLikeText(handle))
  ) {
    return Object.freeze({ handle: null, status });
  }
  return Object.freeze({ handle, status });
};

const mapProviderStatus = (
  value: string | null
): AgentNativeProviderCapabilityRuntimeResponseProjection['providerStatus'] => {
  switch (value) {
    case 'queued':
      return 'queued';
    case 'in_progress':
    case 'in-progress':
    case 'running':
      return 'in-progress';
    case 'completed':
      return 'completed';
    case 'requires_action':
      return 'requires-action';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'failed':
    case 'incomplete':
      return 'failed';
    default:
      return null;
  }
};

const terminalTypes = new Set([
  'cancelled',
  'completed',
  'failed',
  'partial',
  'refusal',
  'safety-block',
  'timed-out',
  'truncation',
]);
const providerStatuses = new Set([
  'cancelled',
  'completed',
  'failed',
  'in-progress',
  'queued',
  'requires-action',
]);

const operationResponseIsComplete = (
  projection: Pick<
    AgentNativeProviderCapabilityRuntimeResponseProjection,
    | 'cachedTokenCount'
    | 'operation'
    | 'outputMarkerObserved'
    | 'outputTextDigest'
    | 'providerStateReferenceDigest'
    | 'providerStatus'
    | 'terminalEventType'
    | 'usageVectorDigest'
  >,
  request: AgentNativeProviderCapabilityRuntimeRequestProjection
): boolean => {
  switch (projection.operation) {
    case 'background-submit':
      return (
        projection.providerStateReferenceDigest !== null &&
        projection.providerStatus !== null &&
        ['cancelled', 'completed', 'failed', 'in-progress', 'queued'].includes(
          projection.providerStatus
        )
      );
    case 'background-poll':
      return (
        projection.providerStateReferenceDigest ===
          request.providerStateReferenceDigest &&
        projection.providerStatus !== null &&
        ['cancelled', 'completed', 'failed', 'in-progress', 'queued'].includes(
          projection.providerStatus
        )
      );
    case 'cache-cold':
      return (
        projection.usageVectorDigest !== null &&
        projection.cachedTokenCount === 0
      );
    case 'cache-warm':
      return (
        projection.usageVectorDigest !== null &&
        projection.cachedTokenCount !== null &&
        projection.cachedTokenCount > 0
      );
    case 'continuation-parent':
      return projection.providerStateReferenceDigest !== null;
    case 'continuation-resume':
      return (
        projection.terminalEventType === 'completed' &&
        projection.outputTextDigest !== null &&
        projection.providerStateReferenceDigest !== null
      );
    case 'hosted-retrieval-query':
      return (
        projection.terminalEventType === 'completed' &&
        projection.outputTextDigest !== null &&
        projection.outputMarkerObserved
      );
  }
};

const responseDetails = (
  facts: readonly AgentNativeProviderRuntimeFact[]
): Readonly<{
  terminalEventType: AgentNativeProviderCapabilityRuntimeResponseProjection['terminalEventType'];
  usageVector: AgentUsageVector | null;
  cachedTokenCount: number | null;
  outputText: string | null;
}> => {
  const usages = facts.filter(
    (
      fact
    ): fact is Extract<
      AgentNativeProviderRuntimeFact,
      { factType: 'usage-vector' }
    > => fact.factType === 'usage-vector'
  );
  if (usages.length > 1) {
    throw new TypeError(
      'Native Provider capability runtime usage is ambiguous.'
    );
  }
  const usageVector = usages[0]?.value ?? null;
  const cached = usageVector?.amounts.filter(
    ({ unit, confidence }) =>
      unit === 'cache-read-token' && confidence === 'reported'
  );
  const cachedAmount =
    cached?.length === 1
      ? (cached[0]!.logicalAmount ??
        cached[0]!.billableAmount ??
        cached[0]!.cachedAmount)
      : undefined;
  const cachedTokenCount =
    cachedAmount !== undefined && /^(0|[1-9][0-9]*)$/u.test(cachedAmount)
      ? Number(cachedAmount)
      : null;
  const events = facts.filter(
    (
      fact
    ): fact is Extract<
      AgentNativeProviderRuntimeFact,
      { factType: 'provider-event' }
    > => fact.factType === 'provider-event'
  );
  let terminalEventType: AgentNativeProviderCapabilityRuntimeResponseProjection['terminalEventType'] =
    null;
  for (const event of events) {
    if (terminalTypes.has(event.value.durableEvent.type)) {
      terminalEventType = event.value.durableEvent
        .type as AgentNativeProviderCapabilityRuntimeResponseProjection['terminalEventType'];
    }
  }
  const output = events
    .filter(({ value }) => value.durableEvent.type === 'output-delta')
    .map(({ value }) => objectValue(value.payload)?.delta)
    .filter((value): value is string => typeof value === 'string')
    .join('');
  return Object.freeze({
    terminalEventType,
    usageVector,
    cachedTokenCount:
      cachedTokenCount !== null && Number.isSafeInteger(cachedTokenCount)
        ? cachedTokenCount
        : null,
    outputText: output.length === 0 ? null : output,
  });
};

const responseProjection = (
  request: AgentNativeProviderCapabilityRuntimeRequestProjection,
  input: DecodeAgentNativeProviderCapabilityRuntimeResponseInput,
  parsed: Readonly<{
    body: AgentJsonValue | null;
    facts: readonly AgentNativeProviderRuntimeFact[];
    stateHandle: string | null;
    providerStatus: AgentNativeProviderCapabilityRuntimeResponseProjection['providerStatus'];
    terminalEventType: AgentNativeProviderCapabilityRuntimeResponseProjection['terminalEventType'];
    usageVector: AgentUsageVector | null;
    cachedTokenCount: number | null;
    outputText: string | null;
    retrievalCitationResourceId: string | null;
    denialKind: AgentNativeProviderCapabilityRuntimeDenialKind | null;
  }>
): AgentNativeProviderCapabilityRuntimeResponseProjection => {
  const responseBodyDigest =
    parsed.body === null ? null : input.responseBodyDigest;
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    factDigests: Object.freeze(parsed.facts.map(factDigest)),
  });
  const responseDigest = digestAgentNativeProviderRuntimeResponse(
    request.requestDigest,
    parsed.facts
  ) as CanonicalDigest;
  const stateKind =
    parsed.stateHandle === null
      ? null
      : stateReferenceKindFor(request.protocolFamily);
  const stateDigest =
    stateKind === null || parsed.stateHandle === null
      ? null
      : digestAgentNativeProviderStateReference(stateKind, parsed.stateHandle);
  const base = Object.freeze({
    format: AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_RESPONSE_FORMAT,
    version: AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION,
    requestDigest: request.requestDigest,
    requestProjectionDigest: request.requestDigest,
    protocolFamily: request.protocolFamily,
    operation: request.operation,
    transportOutcome: input.transportOutcome,
    httpStatus: input.httpStatus,
    responseBodyDigest,
    sealedResponseJsonDigest:
      parsed.body === null ? null : digestAgentCanonicalValue(parsed.body),
    responseDigest,
    normalizedEventSetDigest,
    providerStateReferenceKind: stateKind,
    providerStateReferenceDigest: stateDigest,
    providerStatus: parsed.providerStatus,
    terminalEventType: parsed.terminalEventType,
    usageVectorDigest: parsed.usageVector?.vectorDigest ?? null,
    cachedTokenCount: parsed.cachedTokenCount,
    outputTextDigest:
      parsed.outputText === null
        ? null
        : digestAgentCanonicalValue({ text: parsed.outputText }),
    outputMarkerObserved: parsed.outputText?.includes(publicMarker) ?? false,
    retrievalCitationResourceId: parsed.retrievalCitationResourceId,
    denialKind: parsed.denialKind,
    observedAt: input.observedAt,
  });
  return Object.freeze({
    ...base,
    projectionDigest: digestAgentCanonicalValue(base),
  });
};

export const decodeAgentNativeProviderCapabilityRuntimeResponse = (
  program: AgentCapabilityProbeProgram,
  request: AgentNativeProviderCapabilityRuntimeRequestProjection,
  input: DecodeAgentNativeProviderCapabilityRuntimeResponseInput,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptySanitization
): AgentNativeProviderCapabilityRuntimeResponseDecodeResult => {
  if (
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      request,
      program
    ) ||
    !hasExactAgentControlKeys(input, [
      'transportOutcome',
      'httpStatus',
      'responseBodyDigest',
      'sealedResponseJson',
      'observedAt',
    ]) ||
    !['failed', 'received', 'timed-out'].includes(input.transportOutcome) ||
    (input.httpStatus !== null &&
      (!Number.isSafeInteger(input.httpStatus) ||
        input.httpStatus < 100 ||
        input.httpStatus > 599)) ||
    !isAgentControlInstant(input.observedAt) ||
    (input.responseBodyDigest !== null &&
      !isAgentCanonicalDigest(input.responseBodyDigest)) ||
    (input.sealedResponseJson === null) !==
      (input.responseBodyDigest === null) ||
    (input.transportOutcome === 'received') !== (input.httpStatus !== null) ||
    (input.transportOutcome !== 'received' &&
      (input.sealedResponseJson !== null || input.responseBodyDigest !== null))
  ) {
    throw new TypeError(
      'Native Provider capability runtime response input is invalid.'
    );
  }
  const body =
    input.sealedResponseJson === null
      ? null
      : normalizeAgentProviderRuntimePayload(input.sealedResponseJson, {
          maximumBytes: program.hardLimits.maximumResponseBytes,
          secretCanaries: sanitization.secretCanaries,
        });
  if (
    body !== null &&
    (!safeBounded(
      body,
      program.hardLimits.maximumResponseBytes,
      sanitization
    ) ||
      digestAgentCanonicalValue(body) !== input.responseBodyDigest)
  ) {
    throw new TypeError(
      'Native Provider capability runtime response is unsafe, unbounded, or digest-drifted.'
    );
  }
  if (
    input.transportOutcome !== 'received' ||
    input.httpStatus === null ||
    input.httpStatus < 200 ||
    input.httpStatus >= 300
  ) {
    const denialKind =
      input.transportOutcome === 'timed-out'
        ? ('timed-out' as const)
        : input.transportOutcome === 'failed'
          ? ('transport-failed' as const)
          : ('provider-denied' as const);
    const projection = responseProjection(request, input, {
      body,
      facts: Object.freeze([]),
      stateHandle: null,
      providerStatus: null,
      terminalEventType: null,
      usageVector: null,
      cachedTokenCount: null,
      outputText: null,
      retrievalCitationResourceId: null,
      denialKind,
    });
    if (
      !isAgentNativeProviderCapabilityRuntimeResponseProjection(
        projection,
        request
      )
    ) {
      throw new TypeError(
        'Native Provider capability runtime denial projection is invalid.'
      );
    }
    return Object.freeze({
      projection,
      usageVector: null,
      callbackLocalProviderStateHandle: null,
      callbackLocalOutputText: null,
    });
  }
  if (body === null) {
    const projection = responseProjection(request, input, {
      body: null,
      facts: Object.freeze([]),
      stateHandle: null,
      providerStatus: null,
      terminalEventType: null,
      usageVector: null,
      cachedTokenCount: null,
      outputText: null,
      retrievalCitationResourceId: null,
      denialKind: 'response-invalid',
    });
    if (
      !isAgentNativeProviderCapabilityRuntimeResponseProjection(
        projection,
        request
      )
    ) {
      throw new TypeError(
        'Native Provider capability runtime empty response projection is invalid.'
      );
    }
    return Object.freeze({
      projection,
      usageVector: null,
      callbackLocalProviderStateHandle: null,
      callbackLocalOutputText: null,
    });
  }
  const facts = normalizeNativeAgentProviderRuntimeEvents(
    request.protocolFamily,
    responseEvents(body),
    {
      invocationId: `capability-runtime.${request.requestDigest.slice('sha256-'.length)}`,
      occurredAt: input.observedAt,
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
        AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_OUTPUT_BYTES
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
  const state = providerState(request.protocolFamily, body);
  const details = responseDetails(facts);
  const citationResourceId = retrievalCitationResourceId(
    request.protocolFamily,
    request.operation,
    body
  );
  const candidate = responseProjection(request, input, {
    body,
    facts,
    stateHandle: state.handle,
    providerStatus: mapProviderStatus(state.status),
    terminalEventType: details.terminalEventType,
    usageVector: details.usageVector,
    cachedTokenCount: details.cachedTokenCount,
    outputText: details.outputText,
    retrievalCitationResourceId: citationResourceId,
    denialKind: null,
  });
  const projection = operationResponseIsComplete(candidate, request)
    ? candidate
    : responseProjection(request, input, {
        body,
        facts,
        stateHandle: state.handle,
        providerStatus: mapProviderStatus(state.status),
        terminalEventType: details.terminalEventType,
        usageVector: details.usageVector,
        cachedTokenCount: details.cachedTokenCount,
        outputText: details.outputText,
        retrievalCitationResourceId: citationResourceId,
        denialKind: 'response-invalid',
      });
  if (
    !isAgentNativeProviderCapabilityRuntimeResponseProjection(
      projection,
      request
    )
  ) {
    throw new TypeError(
      'Native Provider capability runtime response projection is invalid.'
    );
  }
  return Object.freeze({
    projection,
    usageVector: details.usageVector,
    callbackLocalProviderStateHandle: state.handle,
    callbackLocalOutputText: details.outputText,
  });
};

export const isAgentNativeProviderCapabilityRuntimeResponseProjection = (
  value: unknown,
  request: AgentNativeProviderCapabilityRuntimeRequestProjection
): value is AgentNativeProviderCapabilityRuntimeResponseProjection => {
  if (!hasExactAgentControlKeys(value, responseProjectionKeys)) return false;
  const projection =
    value as AgentNativeProviderCapabilityRuntimeResponseProjection;
  const { projectionDigest, ...base } = projection;
  const denied = projection.denialKind !== null;
  const receivedSuccess =
    projection.transportOutcome === 'received' &&
    projection.httpStatus !== null &&
    projection.httpStatus >= 200 &&
    projection.httpStatus < 300;
  const expectedDenialKind =
    projection.transportOutcome === 'timed-out'
      ? ('timed-out' as const)
      : projection.transportOutcome === 'failed'
        ? ('transport-failed' as const)
        : !receivedSuccess
          ? ('provider-denied' as const)
          : operationResponseIsComplete(projection, request)
            ? null
            : ('response-invalid' as const);
  return (
    projection.format ===
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_RESPONSE_FORMAT &&
    projection.version === AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION &&
    projection.requestDigest === request.requestDigest &&
    projection.requestProjectionDigest === request.requestDigest &&
    projection.protocolFamily === request.protocolFamily &&
    projection.operation === request.operation &&
    ['failed', 'received', 'timed-out'].includes(projection.transportOutcome) &&
    (projection.httpStatus === null ||
      (Number.isSafeInteger(projection.httpStatus) &&
        projection.httpStatus >= 100 &&
        projection.httpStatus <= 599)) &&
    (projection.responseBodyDigest === null ||
      isAgentCanonicalDigest(projection.responseBodyDigest)) &&
    (projection.responseBodyDigest === null) ===
      (projection.sealedResponseJsonDigest === null) &&
    (projection.sealedResponseJsonDigest === null ||
      isAgentCanonicalDigest(projection.sealedResponseJsonDigest)) &&
    [projection.responseDigest, projection.normalizedEventSetDigest].every(
      isAgentCanonicalDigest
    ) &&
    (projection.providerStateReferenceDigest === null ||
      isAgentCanonicalDigest(projection.providerStateReferenceDigest)) &&
    (projection.providerStateReferenceDigest === null) ===
      (projection.providerStateReferenceKind === null) &&
    (projection.providerStateReferenceKind === null ||
      projection.providerStateReferenceKind ===
        stateReferenceKindFor(projection.protocolFamily)) &&
    (projection.providerStatus === null ||
      providerStatuses.has(projection.providerStatus)) &&
    (projection.terminalEventType === null ||
      terminalTypes.has(projection.terminalEventType)) &&
    (projection.usageVectorDigest === null ||
      isAgentCanonicalDigest(projection.usageVectorDigest)) &&
    (projection.cachedTokenCount === null ||
      (Number.isSafeInteger(projection.cachedTokenCount) &&
        projection.cachedTokenCount >= 0)) &&
    (projection.outputTextDigest === null ||
      isAgentCanonicalDigest(projection.outputTextDigest)) &&
    typeof projection.outputMarkerObserved === 'boolean' &&
    (projection.retrievalCitationResourceId === null ||
      (projection.operation === 'hosted-retrieval-query' &&
        isAgentControlIdentity(projection.retrievalCitationResourceId) &&
        !containsAgentControlCredentialLikeText(
          projection.retrievalCitationResourceId
        ))) &&
    (projection.denialKind === null ||
      [
        'provider-denied',
        'response-invalid',
        'timed-out',
        'transport-failed',
      ].includes(projection.denialKind)) &&
    denied === (expectedDenialKind !== null) &&
    projection.denialKind === expectedDenialKind &&
    isAgentControlInstant(projection.observedAt) &&
    isAgentCanonicalDigest(projectionDigest) &&
    projectionDigest === digestAgentCanonicalValue(base) &&
    safeBounded(
      projection,
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES
    )
  );
};

/**
 * Proves that one real cold request completed with zero reported cache reads
 * before the exact warm request was authorized. Probe support alone cannot
 * create this runtime authority.
 */
export const createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority = (
  program: AgentCapabilityProbeProgram,
  input: Readonly<{
    coldRequest: AgentNativeProviderCapabilityRuntimeRequestProjection;
    coldResponse: AgentNativeProviderCapabilityRuntimeResponseProjection;
    warmRequest: AgentNativeProviderCapabilityRuntimeRequestProjection;
    preparedAt: Instant;
    expiresAt: Instant;
  }>
): AgentNativeProviderCapabilityRuntimeCacheWarmAuthority => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    program.profileProjection.capabilityProfileId !==
      'g4-provider-isolated-cache' ||
    !hasExactAgentControlKeys(input, [
      'coldRequest',
      'coldResponse',
      'warmRequest',
      'preparedAt',
      'expiresAt',
    ]) ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      input.coldRequest,
      program
    ) ||
    !isAgentNativeProviderCapabilityRuntimeResponseProjection(
      input.coldResponse,
      input.coldRequest
    ) ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjection(
      input.warmRequest,
      program
    ) ||
    input.coldRequest.operation !== 'cache-cold' ||
    input.warmRequest.operation !== 'cache-warm' ||
    input.coldResponse.denialKind !== null ||
    input.coldResponse.cachedTokenCount !== 0 ||
    input.coldResponse.usageVectorDigest === null ||
    input.coldRequest.protocolFamily !== input.warmRequest.protocolFamily ||
    input.coldRequest.providerConfigurationId !==
      input.warmRequest.providerConfigurationId ||
    input.coldRequest.modelId !== input.warmRequest.modelId ||
    input.coldRequest.modelLineageDigest !==
      input.warmRequest.modelLineageDigest ||
    input.coldRequest.adapterDigest !== input.warmRequest.adapterDigest ||
    input.coldRequest.cachePrefixDescriptorDigest !==
      input.warmRequest.cachePrefixDescriptorDigest ||
    input.coldRequest.cacheKeyDigest !== input.warmRequest.cacheKeyDigest ||
    input.coldRequest.requestTextDigest ===
      input.warmRequest.requestTextDigest ||
    !isAgentControlInstant(input.preparedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.preparedAt) < Date.parse(input.coldResponse.observedAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.preparedAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.preparedAt) >
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError(
      'Native Provider runtime cache warm authority input is invalid.'
    );
  }
  const base = Object.freeze({
    format:
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_CACHE_WARM_AUTHORITY_FORMAT,
    version: AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    protocolFamily: input.coldRequest.protocolFamily,
    providerConfigurationId: input.coldRequest.providerConfigurationId,
    modelId: input.coldRequest.modelId,
    modelLineageDigest: input.coldRequest.modelLineageDigest,
    adapterDigest: input.coldRequest.adapterDigest,
    cachePrefixDescriptorDigest: input.coldRequest.cachePrefixDescriptorDigest!,
    cacheKeyDigest: input.coldRequest.cacheKeyDigest!,
    coldRequestDigest: input.coldRequest.requestDigest,
    coldResponseProjectionDigest: input.coldResponse.projectionDigest,
    coldUsageVectorDigest: input.coldResponse.usageVectorDigest,
    coldCachedTokenCount: 0 as const,
    warmRequestDigest: input.warmRequest.requestDigest,
    preparedAt: input.preparedAt,
    expiresAt: input.expiresAt,
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safeBounded(
      authority,
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES
    )
  ) {
    throw new TypeError(
      'Native Provider runtime cache warm authority is unsafe or unbounded.'
    );
  }
  return authority;
};

export const isAgentNativeProviderCapabilityRuntimeCacheWarmAuthority = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentNativeProviderCapabilityRuntimeCacheWarmAuthority => {
  if (!hasExactAgentControlKeys(value, cacheWarmAuthorityKeys)) return false;
  const authority =
    value as AgentNativeProviderCapabilityRuntimeCacheWarmAuthority;
  const { authorityDigest, ...base } = authority;
  return (
    isAgentCapabilityProbeProgram(program) &&
    program.profileProjection.capabilityProfileId ===
      'g4-provider-isolated-cache' &&
    authority.format ===
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_CACHE_WARM_AUTHORITY_FORMAT &&
    authority.version === AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_VERSION &&
    authority.probeProgramDigest === program.programDigest &&
    authority.profileProjectionDigest === program.profileProjectionDigest &&
    ['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      authority.protocolFamily
    ) &&
    [authority.providerConfigurationId, authority.modelId].every(
      isAgentControlIdentity
    ) &&
    [
      authority.modelLineageDigest,
      authority.adapterDigest,
      authority.cachePrefixDescriptorDigest,
      authority.cacheKeyDigest,
      authority.coldRequestDigest,
      authority.coldResponseProjectionDigest,
      authority.coldUsageVectorDigest,
      authority.warmRequestDigest,
      authority.authorityDigest,
    ].every(isAgentCanonicalDigest) &&
    authority.cachePrefixDescriptorDigest ===
      program.providerRequestIntent.cachePrefixResource?.descriptorDigest &&
    authority.coldCachedTokenCount === 0 &&
    isAgentControlInstant(authority.preparedAt) &&
    isAgentControlInstant(authority.expiresAt) &&
    Date.parse(authority.expiresAt) > Date.parse(authority.preparedAt) &&
    Date.parse(authority.expiresAt) - Date.parse(authority.preparedAt) <=
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_LIFETIME_MS &&
    authorityDigest === digestAgentCanonicalValue(base) &&
    safeBounded(
      authority,
      AGENT_NATIVE_PROVIDER_CAPABILITY_RUNTIME_MAXIMUM_PROJECTION_BYTES
    )
  );
};

/** Resolves the repository-owned program without accepting caller-authored tags. */
export const resolveAgentNativeProviderCapabilityRuntimeProgram = (
  capabilityProfileId: AgentCapabilityProbeProfileId,
  capabilityProfileDigest: CanonicalDigest
): AgentCapabilityProbeProgram =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
