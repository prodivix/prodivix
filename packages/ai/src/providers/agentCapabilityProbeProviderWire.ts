import {
  canonicalJsonText,
  compareUnicodeCodePoints,
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
import { scanAgentArtifactForSecretCanaries } from '../security/agentSecurity';
import type { AgentUsageVector } from './agentProvider.types';
import {
  createAgentCapabilityProbeSupportedSemanticProof,
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeNetworkRoundTripResult,
  isAgentCapabilityProbeSupportedSemanticProof,
  matchAgentCapabilityProbeSupportedObservationEvidence,
  projectAgentCapabilityProbeSemanticProofPhaseLeaves,
  resolveAgentCapabilityProbeCachePrefixMaterial,
  resolveAgentCapabilityProbePublicResource,
  validateAgentCapabilityProbeNetworkRoundTripSequence,
  type AgentCapabilityProbeDenialProjection,
  type AgentCapabilityProbeNetworkRoundTripResult,
  type AgentCapabilityProbeObservedFactProjection,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeSemanticProofPhaseLeafProjection,
  type AgentCapabilityProbeSupportedSemanticProof,
} from './agentCapabilityProbeProgram';
import {
  createAgentCapabilityProbeProviderRequestBodyDirectives,
  createAgentCapabilityProbeProviderStateReferenceDirective,
  matchAgentCapabilityProbeProviderRequestPolicy,
  resolveAgentCapabilityProbeProviderRequestCodecAvailability,
  type AgentCapabilityProbeProviderRequestPolicy,
} from './agentCapabilityProbeProviderRequest';
import {
  matchAgentCapabilityProbeProviderResourceAuthority,
  type AgentCapabilityProbeProviderResourceAuthority,
} from './agentCapabilityProbeProviderResource';
import {
  normalizeNativeAgentProviderRuntimeEvents,
  type AgentNativeProviderRuntimeFact,
} from './agentNativeProviderAdapters';
import { type AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';
import {
  digestAgentNativeProviderStateReference,
  type AgentNativeProviderStateReferenceKind,
} from './agentNativeProviderStateVault';
import { normalizeAgentProviderRuntimePayload } from './agentProviderRuntime';

export const AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_PROJECTION_FORMAT =
  'prodivix.agent-capability-probe-provider-request-projection' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_PHASE_OBSERVATION_FORMAT =
  'prodivix.agent-capability-probe-provider-phase-observation' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_EXECUTION_EVIDENCE_FORMAT =
  'prodivix.agent-capability-probe-provider-execution-evidence' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION = 1 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_PROJECTION_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_PATH_MAXIMUM_BYTES =
  2_048 as const;

type ProviderStateReferenceKind = AgentNativeProviderStateReferenceKind;

export type AgentCapabilityProbeProviderRequestProjection = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_PROJECTION_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  policyDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  phase: AgentCapabilityProbeProviderRequestPolicy['phase'];
  sequence: number;
  operation: AgentCapabilityProbeProviderRequestPolicy['operation'];
  httpMethod: 'GET' | 'POST';
  apiVersion: 'v1';
  pathTemplate:
    | '/v1/messages'
    | '/v1/responses'
    | '/v1/responses/{response-id}'
    | '/v1/interactions'
    | '/v1/interactions/{interaction-id}';
  responseQuery: 'alt=json' | 'alt=sse' | null;
  pathDigest: CanonicalDigest;
  bodyDigest: CanonicalDigest | null;
  publicPayloadDigest: CanonicalDigest;
  providerStateReferenceKind: ProviderStateReferenceKind | null;
  providerStateReferenceDigest: CanonicalDigest | null;
  providerResourceAuthorityDigest: CanonicalDigest | null;
  projectionDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeProviderRequestMaterial = Readonly<{
  projection: AgentCapabilityProbeProviderRequestProjection;
  /** Callback-local only. Never place this path or its state handle in archives. */
  callbackLocalPath: string;
  /** Callback-local only. Credentials and raw headers are outside this API. */
  callbackLocalBody: AgentJsonValue | null;
}>;

export type CreateAgentCapabilityProbeProviderRequestMaterialInput = Readonly<{
  observedAt: Instant;
  providerStateHandle: string | null;
  providerResourceAuthority: AgentCapabilityProbeProviderResourceAuthority | null;
}>;

export type AgentCapabilityProbeProviderToolCallProjection = Readonly<{
  toolName: string;
  toolCallId: string;
  argumentsDigest: CanonicalDigest;
  factDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeProviderPhaseObservation = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_PHASE_OBSERVATION_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  policyDigest: CanonicalDigest;
  providerRequestProjectionDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  phase: AgentCapabilityProbeProviderRequestPolicy['phase'];
  sequence: number;
  requestLeafDigest: CanonicalDigest;
  responseLeafDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest | null;
  httpStatus: number | null;
  outcome: AgentCapabilityProbeNetworkRoundTripResult['outcome'];
  programTerminal: boolean;
  providerJobStatus: AgentCapabilityProbeNetworkRoundTripResult['providerJobStatus'];
  requestStateReferenceDigest: CanonicalDigest | null;
  responseStateReferenceKind: ProviderStateReferenceKind | null;
  responseStateReferenceDigest: CanonicalDigest | null;
  observedFacts: readonly AgentCapabilityProbeObservedFactProjection[];
  toolCalls: readonly AgentCapabilityProbeProviderToolCallProjection[];
  usageVectorDigest: CanonicalDigest | null;
  cachedTokenCount: number | null;
  outputMarkerObserved: boolean;
  semanticProof: AgentCapabilityProbeSupportedSemanticProof | null;
  denial: AgentCapabilityProbeDenialProjection | null;
  observedAt: Instant;
  phaseDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeProviderPhaseRecord = Readonly<{
  policy: AgentCapabilityProbeProviderRequestPolicy;
  requestProjection: AgentCapabilityProbeProviderRequestProjection;
  observation: AgentCapabilityProbeProviderPhaseObservation;
}>;

export type AgentCapabilityProbeProviderPhaseDecodeResult = Readonly<{
  observation: AgentCapabilityProbeProviderPhaseObservation;
  /** Callback-local state returned to the next poll/resume materialization. */
  callbackLocalProviderStateHandle: string | null;
}>;

export type DecodeAgentCapabilityProbeProviderPhaseResponseInput = Readonly<{
  requestProjection: AgentCapabilityProbeProviderRequestProjection;
  priorPhases: readonly AgentCapabilityProbeProviderPhaseRecord[];
  requestLeafDigest: CanonicalDigest;
  responseLeafDigest: CanonicalDigest;
  transportOutcome: 'failed' | 'received' | 'timed-out';
  httpStatus: number | null;
  responseBody: unknown | null;
  observedAt: Instant;
}>;

export type AgentCapabilityProbeProviderWireSanitization = Readonly<{
  secretCanaries: readonly string[];
}>;

export type AgentCapabilityProbeProviderExecutionEvidence = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_EXECUTION_EVIDENCE_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  protocolFamily: AgentNativeProviderProtocol;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  phaseDigests: readonly CanonicalDigest[];
  phaseSetDigest: CanonicalDigest;
  status: 'inconclusive' | 'supported' | 'unsupported';
  observedFacts: readonly AgentCapabilityProbeObservedFactProjection[];
  semanticProof: AgentCapabilityProbeSupportedSemanticProof | null;
  semanticProofPhaseLeaves: AgentCapabilityProbeSemanticProofPhaseLeafProjection | null;
  denial: AgentCapabilityProbeDenialProjection | null;
  evidenceDigest: CanonicalDigest;
}>;

const emptySanitization: AgentCapabilityProbeProviderWireSanitization =
  Object.freeze({ secretCanaries: Object.freeze([]) });
const encoder = new TextEncoder();
const marker = 'prodivix-capability-probe-v1';

const requestProjectionKeys = Object.freeze([
  'format',
  'version',
  'probeProgramDigest',
  'profileProjectionDigest',
  'policyDigest',
  'protocolFamily',
  'capabilityProfileId',
  'phase',
  'sequence',
  'operation',
  'httpMethod',
  'apiVersion',
  'pathTemplate',
  'responseQuery',
  'pathDigest',
  'bodyDigest',
  'publicPayloadDigest',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'providerResourceAuthorityDigest',
  'projectionDigest',
] as const);

const phaseObservationKeys = Object.freeze([
  'format',
  'version',
  'probeProgramDigest',
  'profileProjectionDigest',
  'policyDigest',
  'providerRequestProjectionDigest',
  'protocolFamily',
  'capabilityProfileId',
  'phase',
  'sequence',
  'requestLeafDigest',
  'responseLeafDigest',
  'responseBodyDigest',
  'httpStatus',
  'outcome',
  'programTerminal',
  'providerJobStatus',
  'requestStateReferenceDigest',
  'responseStateReferenceKind',
  'responseStateReferenceDigest',
  'observedFacts',
  'toolCalls',
  'usageVectorDigest',
  'cachedTokenCount',
  'outputMarkerObserved',
  'semanticProof',
  'denial',
  'observedAt',
  'phaseDigest',
] as const);

const toolCallKeys = Object.freeze([
  'toolName',
  'toolCallId',
  'argumentsDigest',
  'factDigest',
] as const);

const safeBounded = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      inspectAgentControlJson(value, maximumBytes).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

const requestPath = (
  policy: AgentCapabilityProbeProviderRequestPolicy,
  pathSegment: string | null
): Readonly<{
  path: string;
  apiVersion: AgentCapabilityProbeProviderRequestProjection['apiVersion'];
  template: AgentCapabilityProbeProviderRequestProjection['pathTemplate'];
  responseQuery: AgentCapabilityProbeProviderRequestProjection['responseQuery'];
}> => {
  if (policy.protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      path: '/v1/messages',
      apiVersion: 'v1',
      template: '/v1/messages',
      responseQuery: null,
    });
  }
  if (policy.protocolFamily === 'openai-responses') {
    return pathSegment === null
      ? Object.freeze({
          path: '/v1/responses',
          apiVersion: 'v1',
          template: '/v1/responses',
          responseQuery: null,
        })
      : Object.freeze({
          path: `/v1/responses/${encodeURIComponent(pathSegment)}`,
          apiVersion: 'v1',
          template: '/v1/responses/{response-id}',
          responseQuery: null,
        });
  }
  const responseQuery =
    policy.responseMode === 'server-sent-events'
      ? ('alt=sse' as const)
      : ('alt=json' as const);
  const querySuffix = `?${responseQuery}`;
  return pathSegment === null
    ? Object.freeze({
        path: `/v1/interactions${querySuffix}`,
        apiVersion: 'v1',
        template: '/v1/interactions',
        responseQuery,
      })
    : Object.freeze({
        path: `/v1/interactions/${encodeURIComponent(pathSegment)}${querySuffix}`,
        apiVersion: 'v1',
        template: '/v1/interactions/{interaction-id}',
        responseQuery,
      });
};

const publicInstruction = (program: AgentCapabilityProbeProgram): string => {
  const resource = resolveAgentCapabilityProbePublicResource(program);
  return resource === null
    ? program.providerRequestIntent.publicPayload.instruction
    : `${program.providerRequestIntent.publicPayload.instruction}\nQuery: ${resource.queryText}`;
};

const toolSchema = () =>
  Object.freeze({
    type: 'object' as const,
    properties: Object.freeze({
      marker: Object.freeze({
        type: 'string' as const,
        const: marker,
      }),
    }),
    required: Object.freeze(['marker']),
    additionalProperties: false,
  });

const parallelTools = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: AgentNativeProviderProtocol
): readonly Readonly<Record<string, unknown>>[] =>
  Object.freeze(
    program.providerRequestIntent.requiredToolNames.map((name) => {
      const schema = toolSchema();
      if (protocolFamily === 'openai-responses') {
        return Object.freeze({
          type: 'function',
          name,
          description: 'Return the public capability probe marker.',
          parameters: schema,
          strict: true,
        });
      }
      if (protocolFamily === 'anthropic-messages') {
        return Object.freeze({
          name,
          description: 'Return the public capability probe marker.',
          input_schema: schema,
        });
      }
      return Object.freeze({
        type: 'function',
        name,
        description: 'Return the public capability probe marker.',
        parameters: schema,
      });
    })
  );

const requestText = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy
): string => {
  const cache = resolveAgentCapabilityProbeCachePrefixMaterial(program);
  if (cache !== null) {
    const suffix =
      policy.phase === 'cache-cold'
        ? cache.coldSuffixText
        : cache.warmSuffixText;
    return `${cache.prefixText}\n${suffix}`;
  }
  if (policy.phase === 'resume') {
    return 'Resume the prior Provider state and return the public capability probe result.';
  }
  return publicInstruction(program);
};

const providerBody = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  stateFields: Readonly<Record<string, string>>
): Readonly<Record<string, unknown>> | null => {
  if (policy.httpMethod === 'GET') return null;
  const directives =
    createAgentCapabilityProbeProviderRequestBodyDirectives(policy);
  const text = requestText(program, policy);
  const parallel =
    program.profileProjection.capabilityId === 'provider.parallel-tool';
  if (policy.protocolFamily === 'anthropic-messages') {
    const cache = resolveAgentCapabilityProbeCachePrefixMaterial(program);
    const content =
      cache === null
        ? text
        : Object.freeze([
            Object.freeze({
              type: 'text',
              text: cache.prefixText,
              cache_control: Object.freeze({ type: 'ephemeral', ttl: '5m' }),
            }),
            Object.freeze({
              type: 'text',
              text:
                policy.phase === 'cache-cold'
                  ? cache.coldSuffixText
                  : cache.warmSuffixText,
            }),
          ]);
    return Object.freeze({
      model: policy.modelId,
      max_tokens: 256,
      stream: policy.stream,
      messages: Object.freeze([Object.freeze({ role: 'user', content })]),
      ...(parallel
        ? {
            tools: parallelTools(program, policy.protocolFamily),
            tool_choice: Object.freeze({
              type: 'any',
              disable_parallel_tool_use: false,
            }),
          }
        : {}),
    });
  }
  return Object.freeze({
    model: policy.modelId,
    input: text,
    ...directives,
    ...stateFields,
    ...(parallel
      ? {
          tools: parallelTools(program, policy.protocolFamily),
          ...(policy.protocolFamily === 'openai-responses'
            ? { tool_choice: 'required', parallel_tool_calls: true }
            : {}),
        }
      : {}),
  });
};

const normalizeRequestBody = (
  value: Readonly<Record<string, unknown>> | null,
  maximumBytes: number
): AgentJsonValue | null => {
  if (value === null) return null;
  const normalized = normalizeAgentProviderRuntimePayload(value, {
    maximumBytes,
  });
  if (
    !isPlainObject(normalized) ||
    containsAgentControlCredentialLikeText(canonicalJsonText(normalized))
  ) {
    throw new TypeError(
      'Capability probe Provider request body is unsafe or invalid.'
    );
  }
  return normalized;
};

export const createAgentCapabilityProbeProviderRequestMaterial = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  input: CreateAgentCapabilityProbeProviderRequestMaterialInput
): AgentCapabilityProbeProviderRequestMaterial => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(input, [
      'observedAt',
      'providerStateHandle',
      'providerResourceAuthority',
    ]) ||
    !isAgentControlInstant(input.observedAt) ||
    (input.providerStateHandle !== null &&
      (!isAgentControlIdentity(input.providerStateHandle) ||
        containsAgentControlCredentialLikeText(input.providerStateHandle))) ||
    !matchAgentCapabilityProbeProviderRequestPolicy(policy, program, {
      protocolFamily: policy.protocolFamily,
      providerConfigurationId: policy.providerConfigurationId,
      modelId: policy.modelId,
      modelLineageDigest: policy.modelLineageDigest,
      adapterDigest: policy.adapterDigest,
      sequence: policy.sequence,
      observedAt: input.observedAt,
      providerResourceAuthority: input.providerResourceAuthority,
    }) ||
    (input.providerResourceAuthority !== null &&
      !matchAgentCapabilityProbeProviderResourceAuthority(
        input.providerResourceAuthority,
        program,
        {
          protocolFamily: policy.protocolFamily,
          providerConfigurationId: policy.providerConfigurationId,
          modelId: policy.modelId,
          modelLineageDigest: policy.modelLineageDigest,
          adapterDigest: policy.adapterDigest,
          authorityDigest: input.providerResourceAuthority.authorityDigest,
          observedAt: input.observedAt,
        }
      ))
  ) {
    throw new TypeError(
      'Capability probe Provider request material is invalid.'
    );
  }
  const availability =
    resolveAgentCapabilityProbeProviderRequestCodecAvailability(
      policy.protocolFamily,
      program.profileProjection.capabilityProfileId
    );
  if (availability.availability !== 'available') {
    throw new TypeError(
      'Capability probe Provider request codec is unavailable.'
    );
  }
  const state = createAgentCapabilityProbeProviderStateReferenceDirective(
    policy,
    input.providerStateHandle
  );
  const path = requestPath(policy, state.pathSegment);
  if (
    encoder.encode(path.path).byteLength >
      AGENT_CAPABILITY_PROBE_PROVIDER_PATH_MAXIMUM_BYTES ||
    containsAgentControlCredentialLikeText(path.path)
  ) {
    throw new TypeError('Capability probe Provider request path is unsafe.');
  }
  const body = normalizeRequestBody(
    providerBody(program, policy, state.bodyFields),
    program.hardLimits.maximumRequestBytes
  );
  const stateKind = policy.providerStateReference.kind;
  const stateDigest =
    stateKind === null || input.providerStateHandle === null
      ? null
      : digestAgentNativeProviderStateReference(
          stateKind,
          input.providerStateHandle
        );
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_PROJECTION_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    policyDigest: policy.policyDigest,
    protocolFamily: policy.protocolFamily,
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    phase: policy.phase,
    sequence: policy.sequence,
    operation: policy.operation,
    httpMethod: policy.httpMethod,
    apiVersion: path.apiVersion,
    pathTemplate: path.template,
    responseQuery: path.responseQuery,
    pathDigest: digestAgentCanonicalValue({ path: path.path }),
    bodyDigest: body === null ? null : digestAgentCanonicalValue(body),
    publicPayloadDigest: program.providerRequestIntent.publicPayloadDigest,
    providerStateReferenceKind: stateKind,
    providerStateReferenceDigest: stateDigest,
    providerResourceAuthorityDigest:
      input.providerResourceAuthority?.authorityDigest ?? null,
  });
  const projection = Object.freeze({
    ...base,
    projectionDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safeBounded(
      projection,
      AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_PROJECTION_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Capability probe Provider request projection is unsafe or unbounded.'
    );
  }
  return Object.freeze({
    projection,
    callbackLocalPath: path.path,
    callbackLocalBody: body,
  });
};

const expectedPathTemplate = (
  policy: AgentCapabilityProbeProviderRequestPolicy
): AgentCapabilityProbeProviderRequestProjection['pathTemplate'] => {
  if (policy.protocolFamily === 'anthropic-messages') return '/v1/messages';
  if (policy.protocolFamily === 'openai-responses') {
    return policy.httpMethod === 'GET'
      ? '/v1/responses/{response-id}'
      : '/v1/responses';
  }
  return policy.httpMethod === 'GET'
    ? '/v1/interactions/{interaction-id}'
    : '/v1/interactions';
};

const expectedApiVersion =
  (): AgentCapabilityProbeProviderRequestProjection['apiVersion'] => 'v1';

const expectedResponseQuery = (
  policy: AgentCapabilityProbeProviderRequestPolicy
): AgentCapabilityProbeProviderRequestProjection['responseQuery'] =>
  policy.protocolFamily !== 'gemini-interactions'
    ? null
    : policy.responseMode === 'server-sent-events'
      ? 'alt=sse'
      : 'alt=json';

export const isAgentCapabilityProbeProviderRequestProjection = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy
): value is AgentCapabilityProbeProviderRequestProjection => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(value, requestProjectionKeys)
  ) {
    return false;
  }
  const projection = value as AgentCapabilityProbeProviderRequestProjection;
  const { projectionDigest: _projectionDigest, ...base } = projection;
  return (
    projection.format ===
      AGENT_CAPABILITY_PROBE_PROVIDER_REQUEST_PROJECTION_FORMAT &&
    projection.version === AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION &&
    projection.probeProgramDigest === program.programDigest &&
    projection.profileProjectionDigest === program.profileProjectionDigest &&
    projection.policyDigest === policy.policyDigest &&
    projection.protocolFamily === policy.protocolFamily &&
    projection.capabilityProfileId ===
      program.profileProjection.capabilityProfileId &&
    projection.phase === policy.phase &&
    projection.sequence === policy.sequence &&
    projection.operation === policy.operation &&
    projection.httpMethod === policy.httpMethod &&
    projection.apiVersion === expectedApiVersion() &&
    projection.pathTemplate === expectedPathTemplate(policy) &&
    projection.responseQuery === expectedResponseQuery(policy) &&
    isAgentCanonicalDigest(projection.pathDigest) &&
    (projection.bodyDigest === null ||
      isAgentCanonicalDigest(projection.bodyDigest)) &&
    (policy.httpMethod === 'GET') === (projection.bodyDigest === null) &&
    projection.publicPayloadDigest ===
      program.providerRequestIntent.publicPayloadDigest &&
    projection.providerStateReferenceKind ===
      policy.providerStateReference.kind &&
    policy.providerStateReference.required ===
      (projection.providerStateReferenceDigest !== null) &&
    (projection.providerStateReferenceDigest === null ||
      isAgentCanonicalDigest(projection.providerStateReferenceDigest)) &&
    projection.providerResourceAuthorityDigest ===
      (policy.retrievalDirective?.providerResourceAuthorityDigest ?? null) &&
    isAgentCanonicalDigest(projection.projectionDigest) &&
    projection.projectionDigest === digestAgentCanonicalValue(base) &&
    resolveAgentCapabilityProbeProviderRequestCodecAvailability(
      policy.protocolFamily,
      program.profileProjection.capabilityProfileId
    ).availability === 'available' &&
    safeBounded(
      projection,
      AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_PROJECTION_MAXIMUM_BYTES
    )
  );
};

export const matchAgentCapabilityProbeProviderRequestMaterial = (
  value: AgentCapabilityProbeProviderRequestMaterial,
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  input: CreateAgentCapabilityProbeProviderRequestMaterialInput
): boolean => {
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderRequestMaterial(program, policy, input)
    );
  } catch {
    return false;
  }
};

const factCompare = (
  left: AgentCapabilityProbeObservedFactProjection,
  right: AgentCapabilityProbeObservedFactProjection
): number =>
  compareUnicodeCodePoints(left.factKind, right.factKind) ||
  compareUnicodeCodePoints(
    left.providerEventType ?? '',
    right.providerEventType ?? ''
  ) ||
  compareUnicodeCodePoints(left.factDigest, right.factDigest);

const toolCompare = (
  left: AgentCapabilityProbeProviderToolCallProjection,
  right: AgentCapabilityProbeProviderToolCallProjection
): number =>
  compareUnicodeCodePoints(left.toolName, right.toolName) ||
  compareUnicodeCodePoints(left.toolCallId, right.toolCallId);

const phaseBase = (
  value: Omit<AgentCapabilityProbeProviderPhaseObservation, 'phaseDigest'>
) => Object.freeze({ ...value });

const denial = (
  denialKind: AgentCapabilityProbeDenialProjection['denialKind'],
  input: Readonly<{
    transportOutcome: DecodeAgentCapabilityProbeProviderPhaseResponseInput['transportOutcome'];
    httpStatus: number | null;
    responseBodyDigest: CanonicalDigest | null;
    responseLeafDigest: CanonicalDigest;
    errorCodeDigest: CanonicalDigest | null;
  }>
): AgentCapabilityProbeDenialProjection =>
  Object.freeze({
    denialKind,
    denialFactDigest: digestAgentCanonicalValue({ denialKind, ...input }),
  });

const safeErrorCodeDigest = (
  body: AgentJsonValue | null
): CanonicalDigest | null => {
  if (!isPlainObject(body)) return null;
  const error = isPlainObject(body.error) ? body.error : body;
  const code =
    typeof error.code === 'string'
      ? error.code
      : typeof error.type === 'string'
        ? error.type
        : null;
  return code === null || !isAgentControlIdentity(code)
    ? null
    : digestAgentCanonicalValue({ code });
};

const explicitUnsupported = (body: AgentJsonValue | null): boolean => {
  if (!isPlainObject(body)) return false;
  const error = isPlainObject(body.error) ? body.error : body;
  const code =
    typeof error.code === 'string'
      ? error.code
      : typeof error.type === 'string'
        ? error.type
        : '';
  return [
    'feature_not_supported',
    'not_supported',
    'unsupported',
    'unsupported_feature',
    'unsupported_value',
  ].includes(code);
};

const mapProviderJobStatus = (
  value: string | null
): AgentCapabilityProbeNetworkRoundTripResult['providerJobStatus'] => {
  switch (value) {
    case 'queued':
      return 'queued';
    case 'in_progress':
    case 'in-progress':
    case 'running':
      return 'in-progress';
    case 'completed':
    case 'requires_action':
      return 'completed';
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

const objectValue = (value: unknown): Record<string, unknown> | null =>
  isPlainObject(value) ? value : null;

const providerResponseState = (
  protocolFamily: AgentNativeProviderProtocol,
  body: AgentJsonValue
): Readonly<{ handle: string | null; status: string | null }> => {
  const events = Array.isArray(body) ? body : [body];
  let handle: string | null = null;
  let status: string | null = null;
  for (const raw of events) {
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
      continue;
    }
    if (protocolFamily === 'gemini-interactions') {
      const interaction =
        objectValue(event.interaction) ??
        (Array.isArray(event.steps) || Array.isArray(event.outputs)
          ? event
          : null);
      if (interaction !== null) {
        if (typeof interaction.id === 'string') handle = interaction.id;
        if (typeof interaction.status === 'string') status = interaction.status;
      }
      continue;
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

const normalizeResponse = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  body: AgentJsonValue,
  observedAt: Instant
): Readonly<{
  terminalType: string | null;
  usageVector: AgentUsageVector | null;
  cachedTokenCount: number | null;
  outputMarkerObserved: boolean;
  toolCalls: readonly AgentCapabilityProbeProviderToolCallProjection[];
}> => {
  const events = Array.isArray(body) ? body : [body];
  const facts = normalizeNativeAgentProviderRuntimeEvents(
    policy.protocolFamily,
    events,
    {
      invocationId: `capability-probe.${policy.policyDigest.slice('sha256-'.length)}.${policy.sequence}`,
      occurredAt: observedAt,
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
  const runtimeEvents = facts.filter(
    (
      fact
    ): fact is Extract<
      AgentNativeProviderRuntimeFact,
      { factType: 'provider-event' }
    > => fact.factType === 'provider-event'
  );
  const usage =
    facts.find(
      (
        fact
      ): fact is Extract<
        AgentNativeProviderRuntimeFact,
        { factType: 'usage-vector' }
      > => fact.factType === 'usage-vector'
    )?.value ?? null;
  const cached = usage?.amounts.find(
    (amount) =>
      amount.unit === 'cache-read-token' && amount.confidence === 'reported'
  );
  const cachedText =
    cached?.logicalAmount ?? cached?.billableAmount ?? cached?.cachedAmount;
  const cachedTokenCount =
    cachedText !== undefined && /^(0|[1-9][0-9]*)$/u.test(cachedText)
      ? Number(cachedText)
      : null;
  const toolCalls = Object.freeze(
    runtimeEvents
      .filter(({ value }) => value.durableEvent.type === 'tool-call')
      .map(({ value }) => {
        const payload = objectValue(value.payload);
        const toolName = payload?.name;
        const toolCallId = payload?.itemId ?? payload?.id;
        const argumentsDigest = payload?.argumentsDigest;
        if (
          typeof toolName !== 'string' ||
          typeof toolCallId !== 'string' ||
          typeof argumentsDigest !== 'string' ||
          !isAgentControlIdentity(toolName) ||
          !isAgentControlIdentity(toolCallId) ||
          !isAgentCanonicalDigest(argumentsDigest)
        ) {
          throw new TypeError(
            'Capability probe Provider tool-call projection is invalid.'
          );
        }
        return Object.freeze({
          toolName,
          toolCallId,
          argumentsDigest,
          factDigest: value.durableEvent.eventDigest,
        });
      })
      .sort(toolCompare)
  );
  const output = runtimeEvents
    .filter(({ value }) => value.durableEvent.type === 'output-delta')
    .map(({ value }) => objectValue(value.payload)?.delta)
    .filter((value): value is string => typeof value === 'string')
    .join('');
  let terminalType: string | null = null;
  for (const { value } of runtimeEvents) {
    if (terminalTypes.has(value.durableEvent.type)) {
      terminalType = value.durableEvent.type;
    }
  }
  return Object.freeze({
    terminalType,
    usageVector: usage,
    cachedTokenCount:
      cachedTokenCount !== null && Number.isSafeInteger(cachedTokenCount)
        ? cachedTokenCount
        : null,
    outputMarkerObserved: output.includes(marker),
    toolCalls,
  });
};

const fact = (
  factKind: AgentCapabilityProbeObservedFactProjection['factKind'],
  factDigest: CanonicalDigest,
  providerEventType: string | null = null
): AgentCapabilityProbeObservedFactProjection =>
  Object.freeze({ factKind, factDigest, providerEventType });

const stateKindFor = (
  protocolFamily: AgentNativeProviderProtocol
): ProviderStateReferenceKind | null =>
  protocolFamily === 'openai-responses'
    ? 'response-id'
    : protocolFamily === 'gemini-interactions'
      ? 'interaction-id'
      : null;

const priorObservationsAreExact = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  prior: readonly AgentCapabilityProbeProviderPhaseRecord[]
): boolean =>
  prior.every(
    (record, sequence) =>
      hasExactAgentControlKeys(record, [
        'policy',
        'requestProjection',
        'observation',
      ]) &&
      record.policy.sequence === sequence &&
      record.policy.protocolFamily === policy.protocolFamily &&
      record.policy.providerConfigurationId ===
        policy.providerConfigurationId &&
      record.policy.modelId === policy.modelId &&
      record.policy.modelLineageDigest === policy.modelLineageDigest &&
      record.policy.adapterDigest === policy.adapterDigest &&
      isAgentCapabilityProbeProviderRequestProjection(
        record.requestProjection,
        program,
        record.policy
      ) &&
      isAgentCapabilityProbeProviderPhaseObservation(
        record.observation,
        program,
        record.policy,
        record.requestProjection
      ) &&
      record.observation.programTerminal === false
  );

const expectedRequestStateDigest = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection,
  prior: readonly AgentCapabilityProbeProviderPhaseRecord[]
): boolean => {
  if (!policy.providerStateReference.required) {
    return requestProjection.providerStateReferenceDigest === null;
  }
  const first = prior[0]?.observation.responseStateReferenceDigest ?? null;
  if (first === null) return false;
  if (program.profileProjection.capabilityId === 'provider.background-job') {
    return (
      requestProjection.providerStateReferenceDigest === first &&
      prior.every(
        ({ observation }) => observation.responseStateReferenceDigest === first
      )
    );
  }
  return requestProjection.providerStateReferenceDigest === first;
};

const pollResponseSetDigest = (
  observations: readonly Readonly<{
    phase: AgentCapabilityProbeProviderRequestPolicy['phase'];
    responseLeafDigest: CanonicalDigest;
  }>[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    responseLeafDigests: Object.freeze(
      observations
        .filter(({ phase }) => phase === 'poll')
        .map(({ responseLeafDigest }) => responseLeafDigest)
    ),
  });

const supportedEvidence = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection,
  prior: readonly AgentCapabilityProbeProviderPhaseRecord[],
  current: Readonly<{
    requestLeafDigest: CanonicalDigest;
    responseLeafDigest: CanonicalDigest;
    responseStateReferenceDigest: CanonicalDigest | null;
    usageVectorDigest: CanonicalDigest | null;
    cachedTokenCount: number | null;
    outputMarkerObserved: boolean;
    toolCalls: readonly AgentCapabilityProbeProviderToolCallProjection[];
  }>
): Readonly<{
  facts: readonly AgentCapabilityProbeObservedFactProjection[];
  proof: AgentCapabilityProbeSupportedSemanticProof;
}> | null => {
  const observations = [
    ...prior.map(({ observation }) => observation),
    Object.freeze({
      phase: policy.phase,
      requestLeafDigest: current.requestLeafDigest,
      responseLeafDigest: current.responseLeafDigest,
    }),
  ];
  switch (program.profileProjection.capabilityProfileId) {
    case 'g4-provider-background-job': {
      if (prior.length < 1 || current.responseStateReferenceDigest === null) {
        return null;
      }
      const factDigest = digestAgentCanonicalValue({
        factKind: 'provider-job-receipt',
        protocolFamily: policy.protocolFamily,
        providerConfigurationId: policy.providerConfigurationId,
        modelId: policy.modelId,
        probeProgramDigest: program.programDigest,
        providerStateReferenceDigest: current.responseStateReferenceDigest,
        submitRequestDigest: prior[0]!.observation.requestLeafDigest,
        terminalResponseDigest: current.responseLeafDigest,
        providerStatus: 'completed',
      });
      const facts = Object.freeze([fact('provider-job-receipt', factDigest)]);
      const proof = createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'background-job-lifecycle',
        jobReceiptDigest: factDigest,
        jobIdDigest: current.responseStateReferenceDigest,
        submitRequestDigest: prior[0]!.observation.requestLeafDigest,
        pollResponseDigest: pollResponseSetDigest(observations),
        terminalResponseDigest: current.responseLeafDigest,
      });
      return Object.freeze({ facts, proof });
    }
    case 'g4-provider-hosted-retrieval-core':
    case 'g4-provider-hosted-retrieval-document': {
      const resource = program.providerRequestIntent.publicProbeResource;
      if (
        resource === null ||
        !current.outputMarkerObserved ||
        requestProjection.providerResourceAuthorityDigest === null
      ) {
        return null;
      }
      const factDigest = digestAgentCanonicalValue({
        factKind: 'retrieval-query-receipt',
        protocolFamily: policy.protocolFamily,
        providerConfigurationId: policy.providerConfigurationId,
        modelId: policy.modelId,
        probeProgramDigest: program.programDigest,
        providerResourceAuthorityDigest:
          requestProjection.providerResourceAuthorityDigest,
        resourceDescriptorDigest: resource.descriptorDigest,
        queryDigest: resource.queryDigest,
        indexDigest: resource.indexDigest,
        resultMarkerDigest: resource.expectedMarkerDigest,
        requestLeafDigest: current.requestLeafDigest,
        responseLeafDigest: current.responseLeafDigest,
      });
      const facts = Object.freeze([
        fact('retrieval-query-receipt', factDigest),
      ]);
      const proof = createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind:
          program.profileProjection.capabilityProfileId ===
          'g4-provider-hosted-retrieval-core'
            ? 'hosted-retrieval-public-text'
            : 'hosted-retrieval-public-document',
        retrievalQueryReceiptDigest: factDigest,
        resourceDescriptorDigest: resource.descriptorDigest,
        queryDigest: resource.queryDigest,
        indexDigest: resource.indexDigest,
        expectedMarkerDigest: resource.expectedMarkerDigest,
        resultMarkerDigest: resource.expectedMarkerDigest,
        documentBytesDigest: resource.documentBytesDigest,
        providerResponseDigest: current.responseLeafDigest,
      });
      return Object.freeze({ facts, proof });
    }
    case 'g4-provider-isolated-cache': {
      const descriptor = program.providerRequestIntent.cachePrefixResource;
      const cold = prior[0]?.observation;
      if (
        descriptor === null ||
        prior.length !== 1 ||
        cold === undefined ||
        cold.phase !== 'cache-cold' ||
        cold.cachedTokenCount !== 0 ||
        cold.usageVectorDigest === null ||
        current.cachedTokenCount === null ||
        current.cachedTokenCount <= 0 ||
        current.usageVectorDigest === null
      ) {
        return null;
      }
      const cacheKeyDigest = digestAgentCanonicalValue({
        protocolFamily: policy.protocolFamily,
        providerConfigurationId: policy.providerConfigurationId,
        prefixDescriptorDigest: descriptor.descriptorDigest,
      });
      const cacheReceiptDigest = digestAgentCanonicalValue({
        factKind: 'provider-cache-receipt',
        cacheKeyDigest,
        prefixDescriptorDigest: descriptor.descriptorDigest,
        coldResponseDigest: cold.responseLeafDigest,
        warmResponseDigest: current.responseLeafDigest,
        warmCachedTokenCount: current.cachedTokenCount,
      });
      const facts = Object.freeze(
        [
          fact('provider-cache-receipt', cacheReceiptDigest),
          fact('usage-vector', current.usageVectorDigest),
        ].sort(factCompare)
      );
      const proof = createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'isolated-cache-roundtrip',
        cacheReceiptDigest,
        usageVectorDigest: current.usageVectorDigest,
        cachePrefixDescriptorDigest: descriptor.descriptorDigest,
        coldPrefixDigest: descriptor.prefixDigest,
        warmPrefixDigest: descriptor.prefixDigest,
        coldSuffixDigest: descriptor.coldSuffixDigest,
        warmSuffixDigest: descriptor.warmSuffixDigest,
        cacheKeyDigest,
        coldResponseDigest: cold.responseLeafDigest,
        warmResponseDigest: current.responseLeafDigest,
        usageDeltaDigest: digestAgentCanonicalValue({
          coldUsageVectorDigest: cold.usageVectorDigest,
          warmUsageVectorDigest: current.usageVectorDigest,
          coldCachedTokenCount: 0,
          warmCachedTokenCount: current.cachedTokenCount,
        }),
        isolationScopeDigest: digestAgentCanonicalValue({
          isolation: 'probe-program-provider-configuration',
          probeProgramDigest: program.programDigest,
          providerConfigurationId: policy.providerConfigurationId,
          cacheKeyDigest,
        }),
        coldCachedTokenCount: 0,
        warmCachedTokenCount: current.cachedTokenCount,
        cacheHitObserved: true,
      });
      return Object.freeze({ facts, proof });
    }
    case 'g4-provider-parallel-tool': {
      const expected = [
        ...program.providerRequestIntent.requiredToolNames,
      ].sort(compareUnicodeCodePoints);
      if (
        current.toolCalls.length !== 2 ||
        !sameCanonicalJson(
          current.toolCalls.map(({ toolName }) => toolName),
          expected
        )
      ) {
        return null;
      }
      const facts = Object.freeze(
        current.toolCalls
          .map(({ factDigest }) =>
            fact('provider-event', factDigest, 'tool-call')
          )
          .sort(factCompare)
      );
      const proof = createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'parallel-tool-call-set',
        providerResponseDigest: current.responseLeafDigest,
        toolCalls: Object.freeze(
          current.toolCalls.map(({ toolName, toolCallId, factDigest }) =>
            Object.freeze({ toolName, toolCallId, factDigest })
          )
        ),
      });
      return Object.freeze({ facts, proof });
    }
    case 'g4-provider-reasoning-continuation': {
      const parent = prior[0]?.observation;
      if (
        prior.length !== 1 ||
        parent === undefined ||
        parent.responseStateReferenceDigest === null ||
        requestProjection.providerStateReferenceDigest !==
          parent.responseStateReferenceDigest
      ) {
        return null;
      }
      const continuationFactDigest = digestAgentCanonicalValue({
        factKind: 'opaque-continuation',
        protocolFamily: policy.protocolFamily,
        providerConfigurationId: policy.providerConfigurationId,
        modelId: policy.modelId,
        probeProgramDigest: program.programDigest,
        opaqueHandleDigest: parent.responseStateReferenceDigest,
        parentResponseDigest: parent.responseLeafDigest,
        resumeRequestDigest: current.requestLeafDigest,
        resumeResponseDigest: current.responseLeafDigest,
      });
      const facts = Object.freeze([
        fact('opaque-continuation', continuationFactDigest),
      ]);
      const proof = createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'opaque-continuation-roundtrip',
        continuationFactDigest,
        parentResponseDigest: parent.responseLeafDigest,
        opaqueHandleDigest: parent.responseStateReferenceDigest,
        resumeRequestDigest: current.requestLeafDigest,
        resumeResponseDigest: current.responseLeafDigest,
      });
      return Object.freeze({ facts, proof });
    }
  }
};

const createPhaseObservation = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection,
  input: Omit<
    AgentCapabilityProbeProviderPhaseObservation,
    | 'format'
    | 'version'
    | 'probeProgramDigest'
    | 'profileProjectionDigest'
    | 'policyDigest'
    | 'providerRequestProjectionDigest'
    | 'protocolFamily'
    | 'capabilityProfileId'
    | 'phase'
    | 'sequence'
    | 'requestStateReferenceDigest'
    | 'phaseDigest'
  >
): AgentCapabilityProbeProviderPhaseObservation => {
  const observedFacts = Object.freeze(
    [...input.observedFacts]
      .sort(factCompare)
      .map((value) => Object.freeze({ ...value }))
  );
  const toolCalls = Object.freeze(
    [...input.toolCalls]
      .sort(toolCompare)
      .map((value) => Object.freeze({ ...value }))
  );
  const base = phaseBase({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_PHASE_OBSERVATION_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    policyDigest: policy.policyDigest,
    providerRequestProjectionDigest: requestProjection.projectionDigest,
    protocolFamily: policy.protocolFamily,
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    phase: policy.phase,
    sequence: policy.sequence,
    requestLeafDigest: input.requestLeafDigest,
    responseLeafDigest: input.responseLeafDigest,
    responseBodyDigest: input.responseBodyDigest,
    httpStatus: input.httpStatus,
    outcome: input.outcome,
    programTerminal: input.programTerminal,
    providerJobStatus: input.providerJobStatus,
    requestStateReferenceDigest: requestProjection.providerStateReferenceDigest,
    responseStateReferenceKind: input.responseStateReferenceKind,
    responseStateReferenceDigest: input.responseStateReferenceDigest,
    observedFacts,
    toolCalls,
    usageVectorDigest: input.usageVectorDigest,
    cachedTokenCount: input.cachedTokenCount,
    outputMarkerObserved: input.outputMarkerObserved,
    semanticProof: input.semanticProof,
    denial: input.denial,
    observedAt: input.observedAt,
  });
  const observation = Object.freeze({
    ...base,
    phaseDigest: digestAgentCanonicalValue(base),
  });
  if (
    !isAgentCapabilityProbeProviderPhaseObservation(
      observation,
      program,
      policy,
      requestProjection
    )
  ) {
    throw new TypeError(
      'Capability probe Provider phase observation is invalid.'
    );
  }
  return observation;
};

const failedPhase = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection,
  input: Readonly<{
    requestLeafDigest: CanonicalDigest;
    responseLeafDigest: CanonicalDigest;
    responseBodyDigest: CanonicalDigest | null;
    httpStatus: number | null;
    outcome: 'failed' | 'refused' | 'timed-out';
    denialKind: AgentCapabilityProbeDenialProjection['denialKind'];
    transportOutcome: DecodeAgentCapabilityProbeProviderPhaseResponseInput['transportOutcome'];
    errorCodeDigest: CanonicalDigest | null;
    observedAt: Instant;
  }>
): AgentCapabilityProbeProviderPhaseObservation =>
  createPhaseObservation(program, policy, requestProjection, {
    requestLeafDigest: input.requestLeafDigest,
    responseLeafDigest: input.responseLeafDigest,
    responseBodyDigest: input.responseBodyDigest,
    httpStatus: input.httpStatus,
    outcome: input.outcome,
    programTerminal: true,
    providerJobStatus:
      program.providerRequestIntent.networkRoundTripPolicy.mode ===
      'repeat-until-terminal'
        ? 'failed'
        : null,
    responseStateReferenceKind: null,
    responseStateReferenceDigest: null,
    observedFacts: Object.freeze([]),
    toolCalls: Object.freeze([]),
    usageVectorDigest: null,
    cachedTokenCount: null,
    outputMarkerObserved: false,
    semanticProof: null,
    denial: denial(input.denialKind, {
      transportOutcome: input.transportOutcome,
      httpStatus: input.httpStatus,
      responseBodyDigest: input.responseBodyDigest,
      responseLeafDigest: input.responseLeafDigest,
      errorCodeDigest: input.errorCodeDigest,
    }),
    observedAt: input.observedAt,
  });

const normalizeSealedBody = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentCapabilityProbeProviderWireSanitization
): AgentJsonValue => {
  const normalized = normalizeAgentProviderRuntimePayload(value, {
    maximumBytes: program.hardLimits.maximumResponseBytes,
    secretCanaries: sanitization.secretCanaries,
  });
  if (
    containsAgentControlCredentialLikeText(canonicalJsonText(normalized)) ||
    (sanitization.secretCanaries.length > 0 &&
      scanAgentArtifactForSecretCanaries(
        normalized,
        sanitization.secretCanaries
      ).length > 0)
  ) {
    throw new TypeError('Capability probe sealed Provider response is unsafe.');
  }
  return normalized;
};

export const decodeAgentCapabilityProbeProviderPhaseResponse = (
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  input: DecodeAgentCapabilityProbeProviderPhaseResponseInput,
  sanitization: AgentCapabilityProbeProviderWireSanitization = emptySanitization
): AgentCapabilityProbeProviderPhaseDecodeResult => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(input, [
      'requestProjection',
      'priorPhases',
      'requestLeafDigest',
      'responseLeafDigest',
      'transportOutcome',
      'httpStatus',
      'responseBody',
      'observedAt',
    ]) ||
    !isAgentCapabilityProbeProviderRequestProjection(
      input.requestProjection,
      program,
      policy
    ) ||
    !Array.isArray(input.priorPhases) ||
    input.priorPhases.length !== policy.sequence ||
    !priorObservationsAreExact(program, policy, input.priorPhases) ||
    !expectedRequestStateDigest(
      program,
      policy,
      input.requestProjection,
      input.priorPhases
    ) ||
    !isAgentCanonicalDigest(input.requestLeafDigest) ||
    !isAgentCanonicalDigest(input.responseLeafDigest) ||
    !['failed', 'received', 'timed-out'].includes(input.transportOutcome) ||
    !isAgentControlInstant(input.observedAt) ||
    !hasExactAgentControlKeys(sanitization, ['secretCanaries']) ||
    !Array.isArray(sanitization.secretCanaries) ||
    !sanitization.secretCanaries.every(
      (value) => typeof value === 'string' && value.length > 0
    )
  ) {
    throw new TypeError('Capability probe Provider phase input is invalid.');
  }
  const received = input.transportOutcome === 'received';
  if (
    received !== (input.responseBody !== null) ||
    received !==
      (Number.isSafeInteger(input.httpStatus) &&
        Number(input.httpStatus) >= 100 &&
        Number(input.httpStatus) <= 599)
  ) {
    throw new TypeError(
      'Capability probe Provider transport result is invalid.'
    );
  }
  if (!received) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest: null,
      httpStatus: null,
      outcome: input.transportOutcome === 'timed-out' ? 'timed-out' : 'failed',
      denialKind:
        input.transportOutcome === 'timed-out'
          ? 'probe-execution-timeout'
          : 'provider-response-unavailable',
      transportOutcome: input.transportOutcome,
      errorCodeDigest: null,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const body = normalizeSealedBody(input.responseBody, program, sanitization);
  const responseBodyDigest = digestAgentCanonicalValue(body);
  const httpStatus = input.httpStatus!;
  const errorCodeDigest = safeErrorCodeDigest(body);
  if (httpStatus < 200 || httpStatus >= 300) {
    const denied = httpStatus === 400 || httpStatus === 422;
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: denied ? 'refused' : 'failed',
      denialKind: denied
        ? explicitUnsupported(body)
          ? 'provider-feature-unavailable'
          : 'provider-request-denied'
        : 'provider-response-unavailable',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  if (policy.responseMode === 'server-sent-events' && !Array.isArray(body)) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'failed',
      denialKind: 'normalized-response-incomplete',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const responseState = providerResponseState(policy.protocolFamily, body);
  const stateKind = stateKindFor(policy.protocolFamily);
  const retainsProviderState =
    program.profileProjection.capabilityId === 'provider.background-job' ||
    program.profileProjection.capabilityId ===
      'provider.reasoning-continuation';
  const responseStateDigest =
    !retainsProviderState || stateKind === null || responseState.handle === null
      ? null
      : digestAgentNativeProviderStateReference(
          stateKind,
          responseState.handle
        );
  const providerJobStatus =
    program.providerRequestIntent.networkRoundTripPolicy.mode ===
    'repeat-until-terminal'
      ? mapProviderJobStatus(responseState.status)
      : null;
  const background =
    program.profileProjection.capabilityId === 'provider.background-job';
  if (
    (background && providerJobStatus === null) ||
    (background && responseStateDigest === null) ||
    (policy.phase === 'poll' &&
      responseStateDigest !==
        input.requestProjection.providerStateReferenceDigest) ||
    (program.profileProjection.capabilityId ===
      'provider.reasoning-continuation' &&
      policy.phase === 'continue' &&
      responseStateDigest === null)
  ) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'failed',
      denialKind: 'normalized-response-incomplete',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const queued =
    providerJobStatus === 'queued' || providerJobStatus === 'in-progress';
  if (
    queued &&
    policy.sequence ===
      program.providerRequestIntent.networkRoundTripPolicy.maximumRoundTrips - 1
  ) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'failed',
      denialKind: 'normalized-response-incomplete',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  if (queued) {
    const observation = createPhaseObservation(
      program,
      policy,
      input.requestProjection,
      {
        requestLeafDigest: input.requestLeafDigest,
        responseLeafDigest: input.responseLeafDigest,
        responseBodyDigest,
        httpStatus,
        outcome: 'completed',
        programTerminal: false,
        providerJobStatus,
        responseStateReferenceKind: stateKind,
        responseStateReferenceDigest: responseStateDigest,
        observedFacts: Object.freeze([]),
        toolCalls: Object.freeze([]),
        usageVectorDigest: null,
        cachedTokenCount: null,
        outputMarkerObserved: false,
        semanticProof: null,
        denial: null,
        observedAt: input.observedAt,
      }
    );
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: retainsProviderState
        ? responseState.handle
        : null,
    });
  }
  const normalized = normalizeResponse(program, policy, body, input.observedAt);
  const successfulTerminal =
    normalized.terminalType === 'completed' &&
    (!background || providerJobStatus === 'completed');
  if (!successfulTerminal) {
    const refused =
      normalized.terminalType === 'refusal' ||
      normalized.terminalType === 'safety-block';
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: refused ? 'refused' : 'failed',
      denialKind: refused
        ? 'provider-request-denied'
        : 'provider-response-unavailable',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const networkPolicy = program.providerRequestIntent.networkRoundTripPolicy;
  const fixedTerminal =
    networkPolicy.mode === 'fixed' &&
    policy.sequence === networkPolicy.maximumRoundTrips - 1;
  const backgroundTerminal =
    networkPolicy.mode === 'repeat-until-terminal' &&
    providerJobStatus === 'completed';
  const terminal = fixedTerminal || backgroundTerminal;
  if (
    backgroundTerminal &&
    policy.sequence + 1 < networkPolicy.minimumRoundTrips
  ) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'failed',
      denialKind: 'normalized-response-incomplete',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const evidence = terminal
    ? supportedEvidence(
        program,
        policy,
        input.requestProjection,
        input.priorPhases,
        {
          requestLeafDigest: input.requestLeafDigest,
          responseLeafDigest: input.responseLeafDigest,
          responseStateReferenceDigest: responseStateDigest,
          usageVectorDigest: normalized.usageVector?.vectorDigest ?? null,
          cachedTokenCount: normalized.cachedTokenCount,
          outputMarkerObserved: normalized.outputMarkerObserved,
          toolCalls: normalized.toolCalls,
        }
      )
    : null;
  if (
    terminal &&
    (evidence === null ||
      !matchAgentCapabilityProbeSupportedObservationEvidence(
        program,
        evidence.facts,
        evidence.proof
      ))
  ) {
    const observation = failedPhase(program, policy, input.requestProjection, {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'failed',
      denialKind: 'normalized-response-incomplete',
      transportOutcome: input.transportOutcome,
      errorCodeDigest,
      observedAt: input.observedAt,
    });
    return Object.freeze({
      observation,
      callbackLocalProviderStateHandle: null,
    });
  }
  const observation = createPhaseObservation(
    program,
    policy,
    input.requestProjection,
    {
      requestLeafDigest: input.requestLeafDigest,
      responseLeafDigest: input.responseLeafDigest,
      responseBodyDigest,
      httpStatus,
      outcome: 'completed',
      programTerminal: terminal,
      providerJobStatus,
      responseStateReferenceKind:
        responseStateDigest === null ? null : stateKind,
      responseStateReferenceDigest: responseStateDigest,
      observedFacts: evidence?.facts ?? Object.freeze([]),
      toolCalls: normalized.toolCalls,
      usageVectorDigest: normalized.usageVector?.vectorDigest ?? null,
      cachedTokenCount: normalized.cachedTokenCount,
      outputMarkerObserved: normalized.outputMarkerObserved,
      semanticProof: evidence?.proof ?? null,
      denial: null,
      observedAt: input.observedAt,
    }
  );
  return Object.freeze({
    observation,
    callbackLocalProviderStateHandle: retainsProviderState
      ? responseState.handle
      : null,
  });
};

const factIsExact = (value: unknown): boolean =>
  hasExactAgentControlKeys(value, [
    'factKind',
    'factDigest',
    'providerEventType',
  ]) &&
  isAgentCanonicalDigest(value.factDigest) &&
  (value.providerEventType === null ||
    (value.factKind === 'provider-event' &&
      isAgentControlIdentity(value.providerEventType)));

const toolCallIsExact = (value: unknown): boolean =>
  hasExactAgentControlKeys(value, toolCallKeys) &&
  isAgentControlIdentity(value.toolName) &&
  isAgentControlIdentity(value.toolCallId) &&
  isAgentCanonicalDigest(value.argumentsDigest) &&
  isAgentCanonicalDigest(value.factDigest);

export const isAgentCapabilityProbeProviderPhaseObservation = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection
): value is AgentCapabilityProbeProviderPhaseObservation => {
  if (
    !isAgentCapabilityProbeProviderRequestProjection(
      requestProjection,
      program,
      policy
    ) ||
    !hasExactAgentControlKeys(value, phaseObservationKeys)
  ) {
    return false;
  }
  const observation = value as AgentCapabilityProbeProviderPhaseObservation;
  const { phaseDigest: _phaseDigest, ...base } = observation;
  const denialIsExact =
    observation.denial === null ||
    (hasExactAgentControlKeys(observation.denial, [
      'denialKind',
      'denialFactDigest',
    ]) &&
      isAgentCanonicalDigest(observation.denial.denialFactDigest) &&
      [
        ...program.observationContract.unsupportedDenialKinds,
        ...program.observationContract.inconclusiveDenialKinds,
      ].includes(observation.denial.denialKind));
  const semanticProofIsExact =
    observation.semanticProof === null ||
    isAgentCapabilityProbeSupportedSemanticProof(
      observation.semanticProof,
      program
    );
  return (
    observation.format ===
      AGENT_CAPABILITY_PROBE_PROVIDER_PHASE_OBSERVATION_FORMAT &&
    observation.version === AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION &&
    observation.probeProgramDigest === program.programDigest &&
    observation.profileProjectionDigest === program.profileProjectionDigest &&
    observation.policyDigest === policy.policyDigest &&
    observation.providerRequestProjectionDigest ===
      requestProjection.projectionDigest &&
    observation.protocolFamily === policy.protocolFamily &&
    observation.capabilityProfileId ===
      program.profileProjection.capabilityProfileId &&
    observation.phase === policy.phase &&
    observation.sequence === policy.sequence &&
    isAgentCanonicalDigest(observation.requestLeafDigest) &&
    isAgentCanonicalDigest(observation.responseLeafDigest) &&
    (observation.responseBodyDigest === null ||
      isAgentCanonicalDigest(observation.responseBodyDigest)) &&
    (observation.httpStatus === null ||
      (Number.isSafeInteger(observation.httpStatus) &&
        observation.httpStatus >= 100 &&
        observation.httpStatus <= 599)) &&
    observation.requestStateReferenceDigest ===
      requestProjection.providerStateReferenceDigest &&
    (observation.responseStateReferenceKind === null) ===
      (observation.responseStateReferenceDigest === null) &&
    (observation.responseStateReferenceDigest === null ||
      isAgentCanonicalDigest(observation.responseStateReferenceDigest)) &&
    Array.isArray(observation.observedFacts) &&
    observation.observedFacts.length <=
      program.hardLimits.maximumNormalizedFacts &&
    observation.observedFacts.every(factIsExact) &&
    sameCanonicalJson(
      observation.observedFacts,
      [...observation.observedFacts].sort(factCompare)
    ) &&
    Array.isArray(observation.toolCalls) &&
    observation.toolCalls.length <= program.hardLimits.maximumToolCalls &&
    observation.toolCalls.every(toolCallIsExact) &&
    sameCanonicalJson(
      observation.toolCalls,
      [...observation.toolCalls].sort(toolCompare)
    ) &&
    (observation.usageVectorDigest === null ||
      isAgentCanonicalDigest(observation.usageVectorDigest)) &&
    (observation.cachedTokenCount === null ||
      (Number.isSafeInteger(observation.cachedTokenCount) &&
        observation.cachedTokenCount >= 0)) &&
    typeof observation.outputMarkerObserved === 'boolean' &&
    semanticProofIsExact &&
    denialIsExact &&
    isAgentControlInstant(observation.observedAt) &&
    isAgentCanonicalDigest(observation.phaseDigest) &&
    observation.phaseDigest === digestAgentCanonicalValue(base) &&
    isAgentCapabilityProbeNetworkResultProjection(program, observation) &&
    ((observation.denial === null &&
      observation.outcome === 'completed' &&
      (!observation.programTerminal ||
        (observation.semanticProof !== null &&
          matchAgentCapabilityProbeSupportedObservationEvidence(
            program,
            observation.observedFacts,
            observation.semanticProof
          )))) ||
      (observation.denial !== null &&
        observation.programTerminal &&
        observation.outcome !== 'completed' &&
        observation.observedFacts.length === 0 &&
        observation.semanticProof === null)) &&
    safeBounded(
      observation,
      AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_PROJECTION_MAXIMUM_BYTES
    )
  );
};

const isAgentCapabilityProbeNetworkResultProjection = (
  program: AgentCapabilityProbeProgram,
  observation: AgentCapabilityProbeProviderPhaseObservation
): boolean =>
  isAgentCapabilityProbeNetworkRoundTripResult(
    program,
    Object.freeze({
      phase: observation.phase,
      sequence: observation.sequence,
      outcome: observation.outcome,
      programTerminal: observation.programTerminal,
      providerJobStatus: observation.providerJobStatus,
    })
  );

export const matchAgentCapabilityProbeProviderPhaseObservation = (
  observation: AgentCapabilityProbeProviderPhaseObservation,
  program: AgentCapabilityProbeProgram,
  policy: AgentCapabilityProbeProviderRequestPolicy,
  requestProjection: AgentCapabilityProbeProviderRequestProjection,
  binding: Readonly<{
    requestLeafDigest: CanonicalDigest;
    responseLeafDigest: CanonicalDigest;
    responseBodyDigest: CanonicalDigest | null;
    observedAt: Instant;
  }>
): boolean =>
  isAgentCapabilityProbeProviderPhaseObservation(
    observation,
    program,
    policy,
    requestProjection
  ) &&
  observation.requestLeafDigest === binding.requestLeafDigest &&
  observation.responseLeafDigest === binding.responseLeafDigest &&
  observation.responseBodyDigest === binding.responseBodyDigest &&
  observation.observedAt === binding.observedAt;

export const createAgentCapabilityProbeProviderExecutionEvidence = (
  program: AgentCapabilityProbeProgram,
  records: readonly AgentCapabilityProbeProviderPhaseRecord[]
): AgentCapabilityProbeProviderExecutionEvidence => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    records.length === 0 ||
    records.some(
      (record, sequence) =>
        !hasExactAgentControlKeys(record, [
          'policy',
          'requestProjection',
          'observation',
        ]) ||
        record.policy.sequence !== sequence ||
        !isAgentCapabilityProbeProviderRequestProjection(
          record.requestProjection,
          program,
          record.policy
        ) ||
        !isAgentCapabilityProbeProviderPhaseObservation(
          record.observation,
          program,
          record.policy,
          record.requestProjection
        ) ||
        (sequence < records.length - 1 && record.observation.programTerminal)
    )
  ) {
    throw new TypeError(
      'Capability probe Provider execution evidence is invalid.'
    );
  }
  const first = records[0]!;
  if (
    records.some(
      ({ policy }) =>
        policy.protocolFamily !== first.policy.protocolFamily ||
        policy.providerConfigurationId !==
          first.policy.providerConfigurationId ||
        policy.modelId !== first.policy.modelId ||
        policy.modelLineageDigest !== first.policy.modelLineageDigest ||
        policy.adapterDigest !== first.policy.adapterDigest
    )
  ) {
    throw new TypeError('Capability probe Provider execution binding drifted.');
  }
  const network = records.map(({ observation }) =>
    Object.freeze({
      phase: observation.phase,
      sequence: observation.sequence,
      outcome: observation.outcome,
      programTerminal: observation.programTerminal,
      providerJobStatus: observation.providerJobStatus,
    })
  );
  validateAgentCapabilityProbeNetworkRoundTripSequence(program, network);
  const final = records.at(-1)!.observation;
  const supported =
    final.semanticProof !== null &&
    matchAgentCapabilityProbeSupportedObservationEvidence(
      program,
      final.observedFacts,
      final.semanticProof
    ) &&
    records.length >=
      program.providerRequestIntent.networkRoundTripPolicy.minimumRoundTrips;
  const status = supported
    ? ('supported' as const)
    : final.denial !== null &&
        program.observationContract.unsupportedDenialKinds.includes(
          final.denial.denialKind
        )
      ? ('unsupported' as const)
      : ('inconclusive' as const);
  if (
    (supported && final.denial !== null) ||
    (!supported && final.denial === null)
  ) {
    throw new TypeError(
      'Capability probe Provider execution lacks terminal evidence.'
    );
  }
  const phaseDigests = Object.freeze(
    records.map(({ observation }) => observation.phaseDigest)
  );
  const semanticProofPhaseLeaves =
    final.semanticProof === null
      ? null
      : projectAgentCapabilityProbeSemanticProofPhaseLeaves(
          program,
          final.semanticProof
        );
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_EXECUTION_EVIDENCE_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_VERSION,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    protocolFamily: first.policy.protocolFamily,
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    phaseDigests,
    phaseSetDigest: digestAgentCanonicalValue({ phaseDigests }),
    status,
    observedFacts: final.observedFacts,
    semanticProof: final.semanticProof,
    semanticProofPhaseLeaves,
    denial: final.denial,
  });
  const evidence = Object.freeze({
    ...base,
    evidenceDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safeBounded(
      evidence,
      AGENT_CAPABILITY_PROBE_PROVIDER_WIRE_PROJECTION_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Capability probe Provider execution evidence is unsafe or unbounded.'
    );
  }
  return evidence;
};
