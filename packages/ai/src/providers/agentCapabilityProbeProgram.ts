import {
  canonicalJsonText,
  compareUnicodeCodePoints,
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
import type { AgentCapabilityProbeReceipt } from './agentProvider.types';

export const AGENT_CAPABILITY_PROBE_PROFILE_PROJECTION_FORMAT =
  'prodivix.agent-capability-probe-profile-projection' as const;
export const AGENT_CAPABILITY_PROBE_PROGRAM_FORMAT =
  'prodivix.agent-capability-probe-program' as const;
export const AGENT_CAPABILITY_PROBE_PROGRAM_OBSERVATION_FORMAT =
  'prodivix.agent-capability-probe-program-observation' as const;
export const AGENT_CAPABILITY_PROBE_PROGRAM_VERSION = 1 as const;
export const AGENT_CAPABILITY_PROBE_PROGRAM_MAXIMUM_BYTES = 16_384 as const;
export const AGENT_CAPABILITY_PROBE_OBSERVATION_MAXIMUM_BYTES = 16_384 as const;

export const AGENT_CAPABILITY_PROBE_PROFILE_IDS = Object.freeze([
  'g4-provider-background-job',
  'g4-provider-hosted-retrieval-core',
  'g4-provider-hosted-retrieval-document',
  'g4-provider-isolated-cache',
  'g4-provider-parallel-tool',
  'g4-provider-reasoning-continuation',
] as const);

export type AgentCapabilityProbeProfileId =
  (typeof AGENT_CAPABILITY_PROBE_PROFILE_IDS)[number];

export type AgentCapabilityProbeCapabilityId =
  | 'provider.background-job'
  | 'provider.hosted-retrieval'
  | 'provider.isolated-cache'
  | 'provider.parallel-tool'
  | 'provider.reasoning-continuation';

export type AgentCapabilityProbeObservedFactKind =
  | 'opaque-continuation'
  | 'provider-cache-receipt'
  | 'provider-event'
  | 'provider-job-receipt'
  | 'retrieval-query-receipt'
  | 'usage-vector';

export type AgentCapabilityProbeDenialKind =
  | 'normalized-response-incomplete'
  | 'probe-execution-timeout'
  | 'provider-declared-unsupported'
  | 'provider-feature-unavailable'
  | 'provider-request-denied'
  | 'provider-response-unavailable';

export type AgentCapabilityProbeProfileProjection = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROFILE_PROJECTION_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROGRAM_VERSION;
  capabilityProfileId: AgentCapabilityProbeProfileId;
  capabilityProfileDigest: CanonicalDigest;
  capabilityId: AgentCapabilityProbeCapabilityId;
  inputClass: 'bounded-public-document' | 'bounded-public-text';
  deliveryMode: 'background' | 'response' | 'stream';
  providerStateMode:
    'provider-background-job' | 'provider-stored-parent' | 'stateless';
  toolExecutionLocus: 'client-hosted' | 'none' | 'provider-hosted';
  cacheMode: 'disabled' | 'prompt';
  reasoningMode: 'none' | 'opaque-continuation';
  minimumParallelToolCalls: 0 | 2;
  projectionDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbePublicResourceDescriptor = Readonly<{
  resourceId: string;
  resourceKind:
    'repository-owned-public-document' | 'repository-owned-public-text';
  contentDigest: CanonicalDigest;
  queryDigest: CanonicalDigest;
  indexDigest: CanonicalDigest;
  expectedMarkerDigest: CanonicalDigest;
  documentBytesDigest: CanonicalDigest | null;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbePublicResourceMaterial = Readonly<{
  descriptor: AgentCapabilityProbePublicResourceDescriptor;
  contentText: string;
  queryText: string;
  indexId: string;
  documentText: string | null;
}>;

export type AgentCapabilityProbeCachePrefixDescriptor = Readonly<{
  resourceId: string;
  encoding: 'utf-8';
  prefixByteLength: number;
  prefixDigest: CanonicalDigest;
  minimumTokenCountByProtocol: Readonly<{
    'anthropic-messages': 4096;
    'gemini-interactions': 4096;
    'openai-responses': 1024;
  }>;
  coldSuffixDigest: CanonicalDigest;
  warmSuffixDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeCachePrefixMaterial = Readonly<{
  descriptor: AgentCapabilityProbeCachePrefixDescriptor;
  prefixText: string;
  coldSuffixText: string;
  warmSuffixText: string;
}>;

export type AgentCapabilityProbeProviderRequestIntent = Readonly<{
  intentKind:
    | 'background-job-lifecycle'
    | 'hosted-retrieval-public-document'
    | 'hosted-retrieval-public-text'
    | 'isolated-prompt-cache-roundtrip'
    | 'opaque-continuation-roundtrip'
    | 'parallel-client-tool-calls';
  publicPayload: Readonly<{
    marker: 'prodivix-capability-probe-v1';
    instruction: string;
    documentText: string | null;
  }>;
  publicPayloadDigest: CanonicalDigest;
  publicProbeResource: AgentCapabilityProbePublicResourceDescriptor | null;
  cachePrefixResource: AgentCapabilityProbeCachePrefixDescriptor | null;
  requestPhases: readonly (
    | 'cache-cold'
    | 'cache-warm'
    | 'continue'
    | 'dispatch-terminal'
    | 'poll'
    | 'resume'
    | 'submit'
  )[];
  networkRoundTripPolicy: Readonly<{
    mode: 'fixed' | 'repeat-until-terminal';
    minimumRoundTrips: number;
    maximumRoundTrips: number;
    repeatedPhase: 'poll' | null;
    minimumRepeatCount: number;
    maximumRepeatCount: number;
    terminalOnFinalRoundTrip: true;
  }>;
  requiredToolNames: readonly string[];
}>;

export type AgentCapabilityProbeSupportedRequirement = Readonly<{
  factKind: AgentCapabilityProbeObservedFactKind;
  minimumCount: 1 | 2;
  providerEventType: 'tool-call' | null;
}>;

export type AgentCapabilityProbeObservationContract = Readonly<{
  supportedRequirements: readonly AgentCapabilityProbeSupportedRequirement[];
  unsupportedDenialKinds: readonly AgentCapabilityProbeDenialKind[];
  inconclusiveDenialKinds: readonly AgentCapabilityProbeDenialKind[];
}>;

export type AgentCapabilityProbeHardLimits = Readonly<{
  maximumRequestBytes: number;
  maximumResponseBytes: number;
  maximumNormalizedFacts: number;
  maximumToolCalls: number;
  maximumProviderRoundTrips: number;
  maximumPollAttempts: number;
  maximumSingleDispatchMs: number;
  maximumExecutionDurationMs: number;
}>;

export type AgentCapabilityProbeProgram = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROGRAM_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROGRAM_VERSION;
  programId: string;
  profileProjection: AgentCapabilityProbeProfileProjection;
  profileProjectionDigest: CanonicalDigest;
  providerRequestIntent: AgentCapabilityProbeProviderRequestIntent;
  observationContract: AgentCapabilityProbeObservationContract;
  hardLimits: AgentCapabilityProbeHardLimits;
  programDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeObservedFactProjection = Readonly<{
  factKind: AgentCapabilityProbeObservedFactKind;
  factDigest: CanonicalDigest;
  providerEventType: string | null;
}>;

export type AgentCapabilityProbeDenialProjection = Readonly<{
  denialKind: AgentCapabilityProbeDenialKind;
  denialFactDigest: CanonicalDigest;
}>;

type AgentCapabilityProbeSemanticProofBase = Readonly<{
  proofDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeSupportedSemanticProof =
  | (Readonly<{
      proofKind: 'background-job-lifecycle';
      jobReceiptDigest: CanonicalDigest;
      jobIdDigest: CanonicalDigest;
      submitRequestDigest: CanonicalDigest;
      pollResponseDigest: CanonicalDigest;
      terminalResponseDigest: CanonicalDigest;
    }> &
      AgentCapabilityProbeSemanticProofBase)
  | (Readonly<{
      proofKind:
        'hosted-retrieval-public-document' | 'hosted-retrieval-public-text';
      retrievalQueryReceiptDigest: CanonicalDigest;
      resourceDescriptorDigest: CanonicalDigest;
      queryDigest: CanonicalDigest;
      indexDigest: CanonicalDigest;
      expectedMarkerDigest: CanonicalDigest;
      resultMarkerDigest: CanonicalDigest;
      documentBytesDigest: CanonicalDigest | null;
      providerResponseDigest: CanonicalDigest;
    }> &
      AgentCapabilityProbeSemanticProofBase)
  | (Readonly<{
      proofKind: 'isolated-cache-roundtrip';
      cacheReceiptDigest: CanonicalDigest;
      usageVectorDigest: CanonicalDigest;
      cachePrefixDescriptorDigest: CanonicalDigest;
      coldPrefixDigest: CanonicalDigest;
      warmPrefixDigest: CanonicalDigest;
      coldSuffixDigest: CanonicalDigest;
      warmSuffixDigest: CanonicalDigest;
      cacheKeyDigest: CanonicalDigest;
      coldResponseDigest: CanonicalDigest;
      warmResponseDigest: CanonicalDigest;
      usageDeltaDigest: CanonicalDigest;
      isolationScopeDigest: CanonicalDigest;
      coldCachedTokenCount: 0;
      warmCachedTokenCount: number;
      cacheHitObserved: true;
    }> &
      AgentCapabilityProbeSemanticProofBase)
  | (Readonly<{
      proofKind: 'parallel-tool-call-set';
      providerResponseDigest: CanonicalDigest;
      toolCalls: readonly Readonly<{
        toolName: string;
        toolCallId: string;
        factDigest: CanonicalDigest;
      }>[];
    }> &
      AgentCapabilityProbeSemanticProofBase)
  | (Readonly<{
      proofKind: 'opaque-continuation-roundtrip';
      continuationFactDigest: CanonicalDigest;
      parentResponseDigest: CanonicalDigest;
      opaqueHandleDigest: CanonicalDigest;
      resumeRequestDigest: CanonicalDigest;
      resumeResponseDigest: CanonicalDigest;
    }> &
      AgentCapabilityProbeSemanticProofBase);

export type AgentCapabilityProbeObservedLimits = Readonly<{
  requestBytes: number;
  responseBytes: number;
  normalizedFactCount: number;
  toolCallCount: number;
  providerRoundTripCount: number;
  pollAttemptCount: number;
  observedMaximumSingleDispatchMs: number;
  observedExecutionDurationMs: number;
  limitDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeProgramObservation = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROGRAM_OBSERVATION_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROGRAM_VERSION;
  observationSource: 'normalized-provider-response';
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  providerConfigurationDigest: CanonicalDigest;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  probeRequestDigest: CanonicalDigest;
  providerResponseDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  status: 'supported' | 'unsupported' | 'inconclusive';
  observedFacts: readonly AgentCapabilityProbeObservedFactProjection[];
  semanticProof: AgentCapabilityProbeSupportedSemanticProof | null;
  denial: AgentCapabilityProbeDenialProjection | null;
  observedLimits: AgentCapabilityProbeObservedLimits;
  observedLimitDigest: CanonicalDigest;
  observedAt: Instant;
  observationDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeNormalizedObservationSourceProjection = Omit<
  AgentCapabilityProbeProgramObservation,
  'normalizedEventSetDigest' | 'observationDigest'
>;

export type CreateAgentCapabilityProbeNormalizedObservationSourceProjectionInput =
  Omit<
    AgentCapabilityProbeNormalizedObservationSourceProjection,
    | 'format'
    | 'version'
    | 'observationSource'
    | 'probeProgramDigest'
    | 'profileProjectionDigest'
    | 'observedLimitDigest'
  >;

export type AgentCapabilityProbeProgramReceipt = AgentCapabilityProbeReceipt &
  Readonly<{
    probeProgramDigest: CanonicalDigest;
    profileProjectionDigest: CanonicalDigest;
    normalizedObservationDigest: CanonicalDigest;
  }>;

type ProbeSpec = Readonly<{
  capabilityId: AgentCapabilityProbeCapabilityId;
  profile: Omit<
    AgentCapabilityProbeProfileProjection,
    | 'format'
    | 'version'
    | 'capabilityProfileId'
    | 'capabilityProfileDigest'
    | 'capabilityId'
    | 'projectionDigest'
  >;
  intent: Omit<
    AgentCapabilityProbeProviderRequestIntent,
    'publicPayloadDigest'
  >;
  requirements: readonly AgentCapabilityProbeSupportedRequirement[];
  limits: AgentCapabilityProbeHardLimits;
}>;

const unsupportedDenialKinds = Object.freeze([
  'provider-declared-unsupported',
  'provider-feature-unavailable',
  'provider-request-denied',
] as const);
const inconclusiveDenialKinds = Object.freeze([
  'normalized-response-incomplete',
  'probe-execution-timeout',
  'provider-response-unavailable',
] as const);

const publicPayload = (
  instruction: string,
  documentText: string | null = null
): AgentCapabilityProbeProviderRequestIntent['publicPayload'] =>
  Object.freeze({
    marker: 'prodivix-capability-probe-v1' as const,
    instruction,
    documentText,
  });

const publicProbeMarker = 'prodivix-capability-probe-v1';
const publicProbeIndexedText =
  'Prodivix public capability probe corpus entry. Marker: prodivix-capability-probe-v1.';
const publicProbeDocumentText =
  'Public capability probe document. Marker: prodivix-capability-probe-v1.';
const publicProbeCachePrefixText = Array.from(
  { length: 4_608 },
  () => 'prodivix'
).join(' ');
const publicProbeCacheColdSuffixText =
  'Cold pass: return marker prodivix-capability-probe-v1.';
const publicProbeCacheWarmSuffixText =
  'Warm pass: return marker prodivix-capability-probe-v1.';

const publicResource = (
  input: Readonly<{
    resourceId: string;
    resourceKind:
      'repository-owned-public-document' | 'repository-owned-public-text';
    content: string;
    query: string;
    indexId: string;
    documentText: string | null;
  }>
): AgentCapabilityProbePublicResourceDescriptor => {
  const base = Object.freeze({
    resourceId: input.resourceId,
    resourceKind: input.resourceKind,
    contentDigest: digestAgentCanonicalValue({
      encoding: 'utf-8',
      text: input.content,
    }),
    queryDigest: digestAgentCanonicalValue({ query: input.query }),
    indexDigest: digestAgentCanonicalValue({ indexId: input.indexId }),
    expectedMarkerDigest: digestAgentCanonicalValue({
      marker: publicProbeMarker,
    }),
    documentBytesDigest:
      input.documentText === null
        ? null
        : digestAgentCanonicalValue({
            encoding: 'utf-8',
            text: input.documentText,
          }),
  });
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

const publicTextRetrievalResource = publicResource({
  resourceId: 'capability-probe.public-text.v1',
  resourceKind: 'repository-owned-public-text',
  content: publicProbeIndexedText,
  query: 'prodivix capability probe marker',
  indexId: 'capability-probe.public-index.v1',
  documentText: null,
});

const publicDocumentRetrievalResource = publicResource({
  resourceId: 'capability-probe.public-document.v1',
  resourceKind: 'repository-owned-public-document',
  content: publicProbeDocumentText,
  query: 'prodivix capability probe marker',
  indexId: 'capability-probe.public-document-index.v1',
  documentText: publicProbeDocumentText,
});

const publicProbeResourceMaterials = Object.freeze({
  [publicTextRetrievalResource.resourceId]: Object.freeze({
    descriptor: publicTextRetrievalResource,
    contentText: publicProbeIndexedText,
    queryText: 'prodivix capability probe marker',
    indexId: 'capability-probe.public-index.v1',
    documentText: null,
  }),
  [publicDocumentRetrievalResource.resourceId]: Object.freeze({
    descriptor: publicDocumentRetrievalResource,
    contentText: publicProbeDocumentText,
    queryText: 'prodivix capability probe marker',
    indexId: 'capability-probe.public-document-index.v1',
    documentText: publicProbeDocumentText,
  }),
}) satisfies Readonly<
  Record<string, AgentCapabilityProbePublicResourceMaterial>
>;

const cachePrefixDescriptorBase = Object.freeze({
  resourceId: 'capability-probe.cache-prefix.v1',
  encoding: 'utf-8' as const,
  prefixByteLength: new TextEncoder().encode(publicProbeCachePrefixText).length,
  prefixDigest: digestAgentCanonicalValue({
    encoding: 'utf-8',
    text: publicProbeCachePrefixText,
  }),
  minimumTokenCountByProtocol: Object.freeze({
    'anthropic-messages': 4096 as const,
    'gemini-interactions': 4096 as const,
    'openai-responses': 1024 as const,
  }),
  coldSuffixDigest: digestAgentCanonicalValue({
    suffix: publicProbeCacheColdSuffixText,
  }),
  warmSuffixDigest: digestAgentCanonicalValue({
    suffix: publicProbeCacheWarmSuffixText,
  }),
});
const publicProbeCachePrefixDescriptor = Object.freeze({
  ...cachePrefixDescriptorBase,
  descriptorDigest: digestAgentCanonicalValue(cachePrefixDescriptorBase),
});
const publicProbeCachePrefixMaterial = Object.freeze({
  descriptor: publicProbeCachePrefixDescriptor,
  prefixText: publicProbeCachePrefixText,
  coldSuffixText: publicProbeCacheColdSuffixText,
  warmSuffixText: publicProbeCacheWarmSuffixText,
});

const limits = (
  overrides: Partial<AgentCapabilityProbeHardLimits> = {}
): AgentCapabilityProbeHardLimits =>
  Object.freeze({
    maximumRequestBytes: 16_384,
    maximumResponseBytes: 262_144,
    maximumNormalizedFacts: 16,
    maximumToolCalls: 0,
    maximumProviderRoundTrips: 2,
    maximumPollAttempts: 0,
    maximumSingleDispatchMs: 30_000,
    maximumExecutionDurationMs: 120_000,
    ...overrides,
  });

const specs: Readonly<Record<AgentCapabilityProbeProfileId, ProbeSpec>> =
  Object.freeze({
    'g4-provider-background-job': Object.freeze({
      capabilityId: 'provider.background-job',
      profile: Object.freeze({
        inputClass: 'bounded-public-text',
        deliveryMode: 'background',
        providerStateMode: 'provider-background-job',
        toolExecutionLocus: 'none',
        cacheMode: 'disabled',
        reasoningMode: 'none',
        minimumParallelToolCalls: 0,
      }),
      intent: Object.freeze({
        intentKind: 'background-job-lifecycle',
        publicPayload: publicPayload(
          'Complete the bounded public marker task in background mode.'
        ),
        requestPhases: Object.freeze(['submit', 'poll'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'repeat-until-terminal' as const,
          minimumRoundTrips: 2,
          maximumRoundTrips: 5,
          repeatedPhase: 'poll' as const,
          minimumRepeatCount: 1,
          maximumRepeatCount: 4,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze([]),
        publicProbeResource: null,
        cachePrefixResource: null,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'provider-job-receipt',
          minimumCount: 1,
          providerEventType: null,
        }),
      ]),
      limits: limits({
        maximumProviderRoundTrips: 5,
        maximumPollAttempts: 4,
      }),
    }),
    'g4-provider-hosted-retrieval-core': Object.freeze({
      capabilityId: 'provider.hosted-retrieval',
      profile: Object.freeze({
        inputClass: 'bounded-public-text',
        deliveryMode: 'response',
        providerStateMode: 'stateless',
        toolExecutionLocus: 'provider-hosted',
        cacheMode: 'disabled',
        reasoningMode: 'none',
        minimumParallelToolCalls: 0,
      }),
      intent: Object.freeze({
        intentKind: 'hosted-retrieval-public-text',
        publicPayload: publicPayload(
          'Retrieve and cite the canonical public probe marker source.'
        ),
        requestPhases: Object.freeze(['dispatch-terminal'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'fixed' as const,
          minimumRoundTrips: 1,
          maximumRoundTrips: 1,
          repeatedPhase: null,
          minimumRepeatCount: 0,
          maximumRepeatCount: 0,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze(['provider.retrieval.search']),
        publicProbeResource: publicTextRetrievalResource,
        cachePrefixResource: null,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'retrieval-query-receipt',
          minimumCount: 1,
          providerEventType: null,
        }),
      ]),
      limits: limits({
        maximumToolCalls: 1,
        maximumProviderRoundTrips: 1,
      }),
    }),
    'g4-provider-hosted-retrieval-document': Object.freeze({
      capabilityId: 'provider.hosted-retrieval',
      profile: Object.freeze({
        inputClass: 'bounded-public-document',
        deliveryMode: 'response',
        providerStateMode: 'stateless',
        toolExecutionLocus: 'provider-hosted',
        cacheMode: 'disabled',
        reasoningMode: 'none',
        minimumParallelToolCalls: 0,
      }),
      intent: Object.freeze({
        intentKind: 'hosted-retrieval-public-document',
        publicPayload: publicPayload(
          'Retrieve and cite the marker from the attached public probe document.',
          publicProbeDocumentText
        ),
        requestPhases: Object.freeze(['dispatch-terminal'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'fixed' as const,
          minimumRoundTrips: 1,
          maximumRoundTrips: 1,
          repeatedPhase: null,
          minimumRepeatCount: 0,
          maximumRepeatCount: 0,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze(['provider.retrieval.search']),
        publicProbeResource: publicDocumentRetrievalResource,
        cachePrefixResource: null,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'retrieval-query-receipt',
          minimumCount: 1,
          providerEventType: null,
        }),
      ]),
      limits: limits({
        maximumToolCalls: 1,
        maximumProviderRoundTrips: 1,
      }),
    }),
    'g4-provider-isolated-cache': Object.freeze({
      capabilityId: 'provider.isolated-cache',
      profile: Object.freeze({
        inputClass: 'bounded-public-text',
        deliveryMode: 'response',
        providerStateMode: 'stateless',
        toolExecutionLocus: 'none',
        cacheMode: 'prompt',
        reasoningMode: 'none',
        minimumParallelToolCalls: 0,
      }),
      intent: Object.freeze({
        intentKind: 'isolated-prompt-cache-roundtrip',
        publicPayload: publicPayload(
          'Return the public marker through a task-isolated prompt cache roundtrip.'
        ),
        requestPhases: Object.freeze(['cache-cold', 'cache-warm'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'fixed' as const,
          minimumRoundTrips: 2,
          maximumRoundTrips: 2,
          repeatedPhase: null,
          minimumRepeatCount: 0,
          maximumRepeatCount: 0,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze([]),
        publicProbeResource: null,
        cachePrefixResource: publicProbeCachePrefixDescriptor,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'provider-cache-receipt',
          minimumCount: 1,
          providerEventType: null,
        }),
        Object.freeze({
          factKind: 'usage-vector',
          minimumCount: 1,
          providerEventType: null,
        }),
      ]),
      limits: limits({ maximumRequestBytes: 65_536 }),
    }),
    'g4-provider-parallel-tool': Object.freeze({
      capabilityId: 'provider.parallel-tool',
      profile: Object.freeze({
        inputClass: 'bounded-public-text',
        deliveryMode: 'stream',
        providerStateMode: 'stateless',
        toolExecutionLocus: 'client-hosted',
        cacheMode: 'disabled',
        reasoningMode: 'none',
        minimumParallelToolCalls: 2,
      }),
      intent: Object.freeze({
        intentKind: 'parallel-client-tool-calls',
        publicPayload: publicPayload(
          'Call both public marker tools in one parallel provider turn.'
        ),
        requestPhases: Object.freeze(['dispatch-terminal'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'fixed' as const,
          minimumRoundTrips: 1,
          maximumRoundTrips: 1,
          repeatedPhase: null,
          minimumRepeatCount: 0,
          maximumRepeatCount: 0,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze([
          'capability_probe_alpha',
          'capability_probe_beta',
        ]),
        publicProbeResource: null,
        cachePrefixResource: null,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'provider-event',
          minimumCount: 2,
          providerEventType: 'tool-call',
        }),
      ]),
      limits: limits({
        maximumToolCalls: 2,
        maximumProviderRoundTrips: 1,
      }),
    }),
    'g4-provider-reasoning-continuation': Object.freeze({
      capabilityId: 'provider.reasoning-continuation',
      profile: Object.freeze({
        inputClass: 'bounded-public-text',
        deliveryMode: 'response',
        providerStateMode: 'provider-stored-parent',
        toolExecutionLocus: 'none',
        cacheMode: 'disabled',
        reasoningMode: 'opaque-continuation',
        minimumParallelToolCalls: 0,
      }),
      intent: Object.freeze({
        intentKind: 'opaque-continuation-roundtrip',
        publicPayload: publicPayload(
          'Preserve and resume the opaque continuation for the public marker.'
        ),
        requestPhases: Object.freeze(['continue', 'resume'] as const),
        networkRoundTripPolicy: Object.freeze({
          mode: 'fixed' as const,
          minimumRoundTrips: 2,
          maximumRoundTrips: 2,
          repeatedPhase: null,
          minimumRepeatCount: 0,
          maximumRepeatCount: 0,
          terminalOnFinalRoundTrip: true as const,
        }),
        requiredToolNames: Object.freeze([]),
        publicProbeResource: null,
        cachePrefixResource: null,
      }),
      requirements: Object.freeze([
        Object.freeze({
          factKind: 'opaque-continuation',
          minimumCount: 1,
          providerEventType: null,
        }),
      ]),
      limits: limits(),
    }),
  });

const profileId = (value: unknown): value is AgentCapabilityProbeProfileId =>
  typeof value === 'string' &&
  AGENT_CAPABILITY_PROBE_PROFILE_IDS.includes(
    value as AgentCapabilityProbeProfileId
  );

export const digestAgentCapabilityProbeProfile = (
  capabilityProfileId: AgentCapabilityProbeProfileId
): CanonicalDigest =>
  digestAgentCanonicalValue({ profileId: capabilityProfileId });

const containsCredential = (value: unknown): boolean =>
  containsAgentControlCredentialLikeText(canonicalJsonText(value));

export const createAgentCapabilityProbeProgram = (
  input: Readonly<{
    capabilityProfileId: AgentCapabilityProbeProfileId;
    capabilityProfileDigest: CanonicalDigest;
  }>
): AgentCapabilityProbeProgram => {
  if (
    !hasExactAgentControlKeys(input, [
      'capabilityProfileId',
      'capabilityProfileDigest',
    ]) ||
    !profileId(input.capabilityProfileId) ||
    input.capabilityProfileDigest !==
      digestAgentCapabilityProbeProfile(input.capabilityProfileId)
  ) {
    throw new TypeError('Capability probe profile identity is invalid.');
  }
  const spec = specs[input.capabilityProfileId];
  const profileBase = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROFILE_PROJECTION_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROGRAM_VERSION,
    capabilityProfileId: input.capabilityProfileId,
    capabilityProfileDigest: input.capabilityProfileDigest,
    capabilityId: spec.capabilityId,
    ...spec.profile,
  });
  const profileProjection = Object.freeze({
    ...profileBase,
    projectionDigest: digestAgentCanonicalValue(profileBase),
  });
  const providerRequestIntent = Object.freeze({
    ...spec.intent,
    publicPayloadDigest: digestAgentCanonicalValue(spec.intent.publicPayload),
  });
  const observationContract = Object.freeze({
    supportedRequirements: spec.requirements,
    unsupportedDenialKinds,
    inconclusiveDenialKinds,
  });
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROGRAM_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROGRAM_VERSION,
    programId: `capability-probe.${input.capabilityProfileId}`,
    profileProjection,
    profileProjectionDigest: profileProjection.projectionDigest,
    providerRequestIntent,
    observationContract,
    hardLimits: spec.limits,
  });
  if (
    inspectAgentControlJson(base, AGENT_CAPABILITY_PROBE_PROGRAM_MAXIMUM_BYTES)
      .length > 0 ||
    containsCredential(base)
  ) {
    throw new TypeError('Capability probe program is unsafe or unbounded.');
  }
  return Object.freeze({
    ...base,
    programDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentCapabilityProbeProgram = (
  value: unknown
): value is AgentCapabilityProbeProgram => {
  if (
    !hasExactAgentControlKeys(value, [
      'format',
      'version',
      'programId',
      'profileProjection',
      'profileProjectionDigest',
      'providerRequestIntent',
      'observationContract',
      'hardLimits',
      'programDigest',
    ]) ||
    !hasExactAgentControlKeys(value.profileProjection, [
      'format',
      'version',
      'capabilityProfileId',
      'capabilityProfileDigest',
      'capabilityId',
      'inputClass',
      'deliveryMode',
      'providerStateMode',
      'toolExecutionLocus',
      'cacheMode',
      'reasoningMode',
      'minimumParallelToolCalls',
      'projectionDigest',
    ]) ||
    !profileId(value.profileProjection.capabilityProfileId) ||
    !isAgentCanonicalDigest(value.profileProjection.capabilityProfileDigest)
  ) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProgram({
        capabilityProfileId: value.profileProjection.capabilityProfileId,
        capabilityProfileDigest:
          value.profileProjection.capabilityProfileDigest,
      })
    );
  } catch {
    return false;
  }
};

export type AgentCapabilityProbeNetworkRoundTripPhase =
  AgentCapabilityProbeProviderRequestIntent['requestPhases'][number];

export type AgentCapabilityProbeNetworkRoundTripResult = Readonly<{
  phase: AgentCapabilityProbeNetworkRoundTripPhase;
  sequence: number;
  outcome: 'completed' | 'failed' | 'refused' | 'timed-out';
  programTerminal: boolean;
  providerJobStatus:
    'cancelled' | 'completed' | 'failed' | 'in-progress' | 'queued' | null;
}>;

/** Resolves each real network row; repeated background polls share one phase kind. */
export const resolveAgentCapabilityProbeNetworkRoundTripPhase = (
  program: AgentCapabilityProbeProgram,
  sequence: number
): AgentCapabilityProbeNetworkRoundTripPhase | null => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0
  ) {
    throw new TypeError('Capability probe network roundtrip is invalid.');
  }
  const policy = program.providerRequestIntent.networkRoundTripPolicy;
  if (sequence >= policy.maximumRoundTrips) return null;
  if (policy.mode === 'repeat-until-terminal') {
    return sequence === 0
      ? program.providerRequestIntent.requestPhases[0]!
      : 'poll';
  }
  return program.providerRequestIntent.requestPhases[sequence] ?? null;
};

export const isAgentCapabilityProbeNetworkRoundTripResult = (
  program: AgentCapabilityProbeProgram,
  value: unknown
): value is AgentCapabilityProbeNetworkRoundTripResult => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(value, [
      'phase',
      'sequence',
      'outcome',
      'programTerminal',
      'providerJobStatus',
    ]) ||
    !Number.isSafeInteger(value.sequence) ||
    !['completed', 'failed', 'refused', 'timed-out'].includes(
      String(value.outcome)
    ) ||
    typeof value.programTerminal !== 'boolean' ||
    resolveAgentCapabilityProbeNetworkRoundTripPhase(
      program,
      value.sequence as number
    ) !== value.phase
  ) {
    return false;
  }
  const policy = program.providerRequestIntent.networkRoundTripPolicy;
  const completed = value.outcome === 'completed';
  if (policy.mode === 'fixed') {
    return (
      value.providerJobStatus === null &&
      value.programTerminal ===
        (!completed || value.sequence === policy.maximumRoundTrips - 1)
    );
  }
  if (
    !['cancelled', 'completed', 'failed', 'in-progress', 'queued'].includes(
      String(value.providerJobStatus)
    )
  ) {
    return false;
  }
  if (!completed) return value.programTerminal === true;
  const terminalStatus = ['cancelled', 'completed', 'failed'].includes(
    String(value.providerJobStatus)
  );
  return value.programTerminal === terminalStatus;
};

export const validateAgentCapabilityProbeNetworkRoundTripSequence = (
  program: AgentCapabilityProbeProgram,
  values: readonly AgentCapabilityProbeNetworkRoundTripResult[]
): readonly AgentCapabilityProbeNetworkRoundTripResult[] => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    values.length === 0 ||
    values.length >
      program.providerRequestIntent.networkRoundTripPolicy.maximumRoundTrips ||
    values.some(
      (value, sequence) =>
        value.sequence !== sequence ||
        !isAgentCapabilityProbeNetworkRoundTripResult(program, value) ||
        (sequence < values.length - 1 && value.programTerminal)
    ) ||
    values.at(-1)?.programTerminal !== true
  ) {
    throw new TypeError(
      'Capability probe network roundtrip sequence is incomplete or invalid.'
    );
  }
  return Object.freeze(values.map((value) => Object.freeze({ ...value })));
};

/** Unique repo-owned resolver consumed by the real probe transport producer. */
export const resolveAgentCapabilityProbePublicResource = (
  program: AgentCapabilityProbeProgram
): AgentCapabilityProbePublicResourceMaterial | null => {
  if (!isAgentCapabilityProbeProgram(program)) {
    throw new TypeError('Capability probe program is invalid.');
  }
  const descriptor = program.providerRequestIntent.publicProbeResource;
  if (descriptor === null) return null;
  const material = publicProbeResourceMaterials[descriptor.resourceId];
  if (
    material === undefined ||
    !sameCanonicalJson(material.descriptor, descriptor)
  ) {
    throw new TypeError(
      'Capability probe public resource is not owned by the canonical registry.'
    );
  }
  return material;
};

/** Unique repo-owned cache prefix bytes consumed by cold/warm probe requests. */
export const resolveAgentCapabilityProbeCachePrefixMaterial = (
  program: AgentCapabilityProbeProgram
): AgentCapabilityProbeCachePrefixMaterial | null => {
  if (!isAgentCapabilityProbeProgram(program)) {
    throw new TypeError('Capability probe program is invalid.');
  }
  const descriptor = program.providerRequestIntent.cachePrefixResource;
  if (descriptor === null) return null;
  if (!sameCanonicalJson(descriptor, publicProbeCachePrefixDescriptor)) {
    throw new TypeError(
      'Capability probe cache prefix is not owned by the canonical registry.'
    );
  }
  return publicProbeCachePrefixMaterial;
};

const compareFacts = (
  left: AgentCapabilityProbeObservedFactProjection,
  right: AgentCapabilityProbeObservedFactProjection
): number =>
  compareUnicodeCodePoints(left.factKind, right.factKind) ||
  compareUnicodeCodePoints(
    left.providerEventType ?? '',
    right.providerEventType ?? ''
  ) ||
  compareUnicodeCodePoints(left.factDigest, right.factDigest);

const factIsValid = (
  value: unknown
): value is AgentCapabilityProbeObservedFactProjection =>
  hasExactAgentControlKeys(value, [
    'factKind',
    'factDigest',
    'providerEventType',
  ]) &&
  [
    'opaque-continuation',
    'provider-cache-receipt',
    'provider-event',
    'provider-job-receipt',
    'retrieval-query-receipt',
    'usage-vector',
  ].includes(String(value.factKind)) &&
  isAgentCanonicalDigest(value.factDigest) &&
  (value.providerEventType === null ||
    (value.factKind === 'provider-event' &&
      isAgentControlIdentity(value.providerEventType)));

type WithoutProofDigest<T> = T extends AgentCapabilityProbeSemanticProofBase
  ? Omit<T, 'proofDigest'>
  : never;

export type CreateAgentCapabilityProbeSupportedSemanticProofInput =
  WithoutProofDigest<AgentCapabilityProbeSupportedSemanticProof>;

const expectedProofKind = (
  program: AgentCapabilityProbeProgram
): AgentCapabilityProbeSupportedSemanticProof['proofKind'] => {
  switch (program.profileProjection.capabilityProfileId) {
    case 'g4-provider-background-job':
      return 'background-job-lifecycle';
    case 'g4-provider-hosted-retrieval-core':
      return 'hosted-retrieval-public-text';
    case 'g4-provider-hosted-retrieval-document':
      return 'hosted-retrieval-public-document';
    case 'g4-provider-isolated-cache':
      return 'isolated-cache-roundtrip';
    case 'g4-provider-parallel-tool':
      return 'parallel-tool-call-set';
    case 'g4-provider-reasoning-continuation':
      return 'opaque-continuation-roundtrip';
  }
};

export const createAgentCapabilityProbeSupportedSemanticProof = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentCapabilityProbeSupportedSemanticProofInput
): AgentCapabilityProbeSupportedSemanticProof => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    input.proofKind !== expectedProofKind(program)
  ) {
    throw new TypeError(
      'Capability probe semantic proof has the wrong program profile.'
    );
  }
  const base = (() => {
    switch (input.proofKind) {
      case 'background-job-lifecycle': {
        if (
          !hasExactAgentControlKeys(input, [
            'proofKind',
            'jobReceiptDigest',
            'jobIdDigest',
            'submitRequestDigest',
            'pollResponseDigest',
            'terminalResponseDigest',
          ]) ||
          ![
            input.jobReceiptDigest,
            input.jobIdDigest,
            input.submitRequestDigest,
            input.pollResponseDigest,
            input.terminalResponseDigest,
          ].every(isAgentCanonicalDigest)
        ) {
          throw new TypeError('Background probe semantic proof is invalid.');
        }
        return Object.freeze({ ...input });
      }
      case 'hosted-retrieval-public-document':
      case 'hosted-retrieval-public-text': {
        if (
          !hasExactAgentControlKeys(input, [
            'proofKind',
            'retrievalQueryReceiptDigest',
            'resourceDescriptorDigest',
            'queryDigest',
            'indexDigest',
            'expectedMarkerDigest',
            'resultMarkerDigest',
            'documentBytesDigest',
            'providerResponseDigest',
          ]) ||
          ![
            input.retrievalQueryReceiptDigest,
            input.resourceDescriptorDigest,
            input.queryDigest,
            input.indexDigest,
            input.expectedMarkerDigest,
            input.resultMarkerDigest,
            input.providerResponseDigest,
          ].every(isAgentCanonicalDigest) ||
          (input.documentBytesDigest !== null &&
            !isAgentCanonicalDigest(input.documentBytesDigest))
        ) {
          throw new TypeError('Retrieval probe semantic proof is invalid.');
        }
        return Object.freeze({ ...input });
      }
      case 'isolated-cache-roundtrip': {
        if (
          !hasExactAgentControlKeys(input, [
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
          ]) ||
          input.cacheHitObserved !== true ||
          input.coldCachedTokenCount !== 0 ||
          !Number.isSafeInteger(input.warmCachedTokenCount) ||
          input.warmCachedTokenCount <= 0 ||
          ![
            input.cacheReceiptDigest,
            input.usageVectorDigest,
            input.cachePrefixDescriptorDigest,
            input.coldPrefixDigest,
            input.warmPrefixDigest,
            input.coldSuffixDigest,
            input.warmSuffixDigest,
            input.cacheKeyDigest,
            input.coldResponseDigest,
            input.warmResponseDigest,
            input.usageDeltaDigest,
            input.isolationScopeDigest,
          ].every(isAgentCanonicalDigest)
        ) {
          throw new TypeError('Cache probe semantic proof is invalid.');
        }
        return Object.freeze({ ...input });
      }
      case 'parallel-tool-call-set': {
        if (
          !hasExactAgentControlKeys(input, [
            'proofKind',
            'providerResponseDigest',
            'toolCalls',
          ]) ||
          !isAgentCanonicalDigest(input.providerResponseDigest) ||
          !Array.isArray(input.toolCalls) ||
          input.toolCalls.length !== 2 ||
          !input.toolCalls.every(
            (call) =>
              hasExactAgentControlKeys(call, [
                'toolName',
                'toolCallId',
                'factDigest',
              ]) &&
              isAgentControlIdentity(call.toolName) &&
              isAgentControlIdentity(call.toolCallId) &&
              isAgentCanonicalDigest(call.factDigest)
          )
        ) {
          throw new TypeError('Parallel probe semantic proof is invalid.');
        }
        const toolCalls = Object.freeze(
          [...input.toolCalls]
            .sort(
              (left, right) =>
                compareUnicodeCodePoints(left.toolName, right.toolName) ||
                compareUnicodeCodePoints(left.toolCallId, right.toolCallId)
            )
            .map((call) => Object.freeze({ ...call }))
        );
        if (
          new Set(toolCalls.map(({ toolName }) => toolName)).size !== 2 ||
          new Set(toolCalls.map(({ toolCallId }) => toolCallId)).size !== 2 ||
          new Set(toolCalls.map(({ factDigest }) => factDigest)).size !== 2
        ) {
          throw new TypeError(
            'Parallel probe semantic proof requires two unique tool bindings.'
          );
        }
        return Object.freeze({
          proofKind: input.proofKind,
          providerResponseDigest: input.providerResponseDigest,
          toolCalls,
        });
      }
      case 'opaque-continuation-roundtrip': {
        if (
          !hasExactAgentControlKeys(input, [
            'proofKind',
            'continuationFactDigest',
            'parentResponseDigest',
            'opaqueHandleDigest',
            'resumeRequestDigest',
            'resumeResponseDigest',
          ]) ||
          ![
            input.continuationFactDigest,
            input.parentResponseDigest,
            input.opaqueHandleDigest,
            input.resumeRequestDigest,
            input.resumeResponseDigest,
          ].every(isAgentCanonicalDigest)
        ) {
          throw new TypeError('Continuation probe semantic proof is invalid.');
        }
        return Object.freeze({ ...input });
      }
    }
  })();
  return Object.freeze({
    ...base,
    proofDigest: digestAgentCanonicalValue(base),
  }) as AgentCapabilityProbeSupportedSemanticProof;
};

export const isAgentCapabilityProbeSupportedSemanticProof = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentCapabilityProbeSupportedSemanticProof => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('proofDigest' in value)
  ) {
    return false;
  }
  try {
    const { proofDigest: _proofDigest, ...input } =
      value as AgentCapabilityProbeSupportedSemanticProof;
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeSupportedSemanticProof(
        program,
        input as CreateAgentCapabilityProbeSupportedSemanticProofInput
      )
    );
  } catch {
    return false;
  }
};

export const AGENT_CAPABILITY_PROBE_SEMANTIC_PROOF_PHASE_LEAF_PROJECTION_FORMAT =
  'prodivix.agent-capability-probe-semantic-proof-phase-leaf-projection' as const;

export type AgentCapabilityProbeSemanticProofPhaseLeafProjection = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_SEMANTIC_PROOF_PHASE_LEAF_PROJECTION_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROGRAM_VERSION;
  probeProgramDigest: CanonicalDigest;
  proofKind: AgentCapabilityProbeSupportedSemanticProof['proofKind'];
  proofDigest: CanonicalDigest;
  requestPhaseDigests: readonly Readonly<{
    phase: 'resume-request' | 'submit-request';
    digest: CanonicalDigest;
  }>[];
  responsePhaseDigests: readonly Readonly<{
    phase:
      | 'cold-response'
      | 'parent-response'
      | 'poll-response'
      | 'provider-response'
      | 'resume-response'
      | 'terminal-response'
      | 'warm-response';
    digest: CanonicalDigest;
  }>[];
  phaseLeafSetDigest: CanonicalDigest;
  projectionDigest: CanonicalDigest;
}>;

/** Projects only raw phase request/response leaves; outer reference roots stay separate. */
export const projectAgentCapabilityProbeSemanticProofPhaseLeaves = (
  program: AgentCapabilityProbeProgram,
  proof: AgentCapabilityProbeSupportedSemanticProof
): AgentCapabilityProbeSemanticProofPhaseLeafProjection => {
  if (!isAgentCapabilityProbeSupportedSemanticProof(proof, program)) {
    throw new TypeError('Capability probe semantic proof is invalid.');
  }
  const requestPhaseDigests: AgentCapabilityProbeSemanticProofPhaseLeafProjection['requestPhaseDigests'] =
    Object.freeze(
      proof.proofKind === 'background-job-lifecycle'
        ? [
            Object.freeze({
              phase: 'submit-request' as const,
              digest: proof.submitRequestDigest,
            }),
          ]
        : proof.proofKind === 'opaque-continuation-roundtrip'
          ? [
              Object.freeze({
                phase: 'resume-request' as const,
                digest: proof.resumeRequestDigest,
              }),
            ]
          : []
    );
  const responsePhaseDigests: AgentCapabilityProbeSemanticProofPhaseLeafProjection['responsePhaseDigests'] =
    Object.freeze(
      (() => {
        switch (proof.proofKind) {
          case 'background-job-lifecycle':
            return [
              Object.freeze({
                phase: 'poll-response' as const,
                digest: proof.pollResponseDigest,
              }),
              Object.freeze({
                phase: 'terminal-response' as const,
                digest: proof.terminalResponseDigest,
              }),
            ];
          case 'hosted-retrieval-public-document':
          case 'hosted-retrieval-public-text':
          case 'parallel-tool-call-set':
            return [
              Object.freeze({
                phase: 'provider-response' as const,
                digest: proof.providerResponseDigest,
              }),
            ];
          case 'isolated-cache-roundtrip':
            return [
              Object.freeze({
                phase: 'cold-response' as const,
                digest: proof.coldResponseDigest,
              }),
              Object.freeze({
                phase: 'warm-response' as const,
                digest: proof.warmResponseDigest,
              }),
            ];
          case 'opaque-continuation-roundtrip':
            return [
              Object.freeze({
                phase: 'parent-response' as const,
                digest: proof.parentResponseDigest,
              }),
              Object.freeze({
                phase: 'resume-response' as const,
                digest: proof.resumeResponseDigest,
              }),
            ];
        }
      })()
    );
  const phaseLeafSetDigest = digestAgentCanonicalValue({
    requestPhaseDigests,
    responsePhaseDigests,
  });
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_SEMANTIC_PROOF_PHASE_LEAF_PROJECTION_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROGRAM_VERSION,
    probeProgramDigest: program.programDigest,
    proofKind: proof.proofKind,
    proofDigest: proof.proofDigest,
    requestPhaseDigests,
    responsePhaseDigests,
    phaseLeafSetDigest,
  });
  return Object.freeze({
    ...base,
    projectionDigest: digestAgentCanonicalValue(base),
  });
};

export const matchAgentCapabilityProbeSemanticProofPhaseLeaves = (
  program: AgentCapabilityProbeProgram,
  proof: AgentCapabilityProbeSupportedSemanticProof,
  projection: AgentCapabilityProbeSemanticProofPhaseLeafProjection
): boolean => {
  try {
    return sameCanonicalJson(
      projection,
      projectAgentCapabilityProbeSemanticProofPhaseLeaves(program, proof)
    );
  } catch {
    return false;
  }
};

const semanticProofMatchesObservation = (
  program: AgentCapabilityProbeProgram,
  proof: AgentCapabilityProbeSupportedSemanticProof,
  facts: readonly AgentCapabilityProbeObservedFactProjection[]
): boolean => {
  const factDigests = new Map(
    facts.map(({ factKind, factDigest }) => [factKind, factDigest])
  );
  switch (proof.proofKind) {
    case 'background-job-lifecycle':
      return proof.jobReceiptDigest === factDigests.get('provider-job-receipt');
    case 'hosted-retrieval-public-document':
    case 'hosted-retrieval-public-text': {
      const resource = program.providerRequestIntent.publicProbeResource;
      return (
        resource !== null &&
        proof.retrievalQueryReceiptDigest ===
          factDigests.get('retrieval-query-receipt') &&
        proof.resourceDescriptorDigest === resource.descriptorDigest &&
        proof.queryDigest === resource.queryDigest &&
        proof.indexDigest === resource.indexDigest &&
        proof.expectedMarkerDigest === resource.expectedMarkerDigest &&
        proof.resultMarkerDigest === resource.expectedMarkerDigest &&
        proof.documentBytesDigest === resource.documentBytesDigest
      );
    }
    case 'isolated-cache-roundtrip': {
      const descriptor = program.providerRequestIntent.cachePrefixResource;
      return (
        descriptor !== null &&
        proof.cacheReceiptDigest ===
          factDigests.get('provider-cache-receipt') &&
        proof.usageVectorDigest === factDigests.get('usage-vector') &&
        proof.cachePrefixDescriptorDigest === descriptor.descriptorDigest &&
        proof.coldPrefixDigest === descriptor.prefixDigest &&
        proof.warmPrefixDigest === descriptor.prefixDigest &&
        proof.coldSuffixDigest === descriptor.coldSuffixDigest &&
        proof.warmSuffixDigest === descriptor.warmSuffixDigest &&
        proof.coldCachedTokenCount === 0 &&
        proof.warmCachedTokenCount > 0
      );
    }
    case 'parallel-tool-call-set': {
      const expectedToolNames = [
        ...program.providerRequestIntent.requiredToolNames,
      ].sort(compareUnicodeCodePoints);
      return (
        sameCanonicalJson(
          proof.toolCalls.map(({ toolName }) => toolName),
          expectedToolNames
        ) &&
        proof.toolCalls.every(({ factDigest }) =>
          facts.some(
            (fact) =>
              fact.factKind === 'provider-event' &&
              fact.providerEventType === 'tool-call' &&
              fact.factDigest === factDigest
          )
        )
      );
    }
    case 'opaque-continuation-roundtrip':
      return (
        proof.continuationFactDigest === factDigests.get('opaque-continuation')
      );
  }
};

const requirementsSatisfied = (
  program: AgentCapabilityProbeProgram,
  facts: readonly AgentCapabilityProbeObservedFactProjection[]
): boolean => {
  const requirements = program.observationContract.supportedRequirements;
  return (
    facts.length ===
      requirements.reduce(
        (count, requirement) => count + requirement.minimumCount,
        0
      ) &&
    requirements.every(
      (requirement) =>
        facts.filter(
          (fact) =>
            fact.factKind === requirement.factKind &&
            fact.providerEventType === requirement.providerEventType
        ).length === requirement.minimumCount
    )
  );
};

/**
 * Canonical supported-evidence matcher shared by probe transports and the
 * durable observation constructor. It verifies the exact profile fact set and
 * its profile-specific semantic proof without creating a second verdict owner.
 */
export const matchAgentCapabilityProbeSupportedObservationEvidence = (
  program: AgentCapabilityProbeProgram,
  facts: readonly AgentCapabilityProbeObservedFactProjection[],
  proof: AgentCapabilityProbeSupportedSemanticProof
): boolean =>
  isAgentCapabilityProbeProgram(program) &&
  facts.length <= program.hardLimits.maximumNormalizedFacts &&
  facts.every(factIsValid) &&
  isAgentCapabilityProbeSupportedSemanticProof(proof, program) &&
  requirementsSatisfied(program, facts) &&
  semanticProofMatchesObservation(program, proof, facts);

export const createAgentCapabilityProbeObservedLimits = (
  program: AgentCapabilityProbeProgram,
  input: Omit<AgentCapabilityProbeObservedLimits, 'limitDigest'>
): AgentCapabilityProbeObservedLimits => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(input, [
      'requestBytes',
      'responseBytes',
      'normalizedFactCount',
      'toolCallCount',
      'providerRoundTripCount',
      'pollAttemptCount',
      'observedMaximumSingleDispatchMs',
      'observedExecutionDurationMs',
    ])
  ) {
    throw new TypeError('Capability probe observed limits are invalid.');
  }
  const values = Object.values(input);
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    input.requestBytes > program.hardLimits.maximumRequestBytes ||
    input.responseBytes > program.hardLimits.maximumResponseBytes ||
    input.normalizedFactCount > program.hardLimits.maximumNormalizedFacts ||
    input.toolCallCount > program.hardLimits.maximumToolCalls ||
    input.providerRoundTripCount >
      program.hardLimits.maximumProviderRoundTrips ||
    input.pollAttemptCount > program.hardLimits.maximumPollAttempts ||
    input.observedMaximumSingleDispatchMs >
      program.hardLimits.maximumSingleDispatchMs ||
    input.observedExecutionDurationMs >
      program.hardLimits.maximumExecutionDurationMs
  ) {
    throw new TypeError(
      'Capability probe observed limits exceeded the program.'
    );
  }
  const roundTripPolicy = program.providerRequestIntent.networkRoundTripPolicy;
  if (
    (roundTripPolicy.mode === 'repeat-until-terminal'
      ? input.providerRoundTripCount < 1 ||
        input.pollAttemptCount !== input.providerRoundTripCount - 1
      : input.pollAttemptCount !== 0) ||
    input.providerRoundTripCount > roundTripPolicy.maximumRoundTrips
  ) {
    throw new TypeError(
      'Capability probe observed roundtrips drifted from the network policy.'
    );
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    limitDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentCapabilityProbeObservedLimits = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentCapabilityProbeObservedLimits => {
  if (
    !hasExactAgentControlKeys(value, [
      'requestBytes',
      'responseBytes',
      'normalizedFactCount',
      'toolCallCount',
      'providerRoundTripCount',
      'pollAttemptCount',
      'observedMaximumSingleDispatchMs',
      'observedExecutionDurationMs',
      'limitDigest',
    ])
  ) {
    return false;
  }
  try {
    const { limitDigest: _limitDigest, ...input } =
      value as unknown as AgentCapabilityProbeObservedLimits;
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeObservedLimits(program, input)
    );
  } catch {
    return false;
  }
};

export const createAgentCapabilityProbeNormalizedObservationSourceProjection = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentCapabilityProbeNormalizedObservationSourceProjectionInput
): AgentCapabilityProbeNormalizedObservationSourceProjection => {
  if (
    !isAgentCapabilityProbeProgram(program) ||
    !hasExactAgentControlKeys(input, [
      'providerConfigurationDigest',
      'modelLineageDigest',
      'adapterDigest',
      'probeRequestDigest',
      'providerResponseDigest',
      'status',
      'observedFacts',
      'semanticProof',
      'denial',
      'observedLimits',
      'observedAt',
    ]) ||
    ![
      input.providerConfigurationDigest,
      input.modelLineageDigest,
      input.adapterDigest,
      input.probeRequestDigest,
      input.providerResponseDigest,
    ].every(isAgentCanonicalDigest) ||
    !['supported', 'unsupported', 'inconclusive'].includes(input.status) ||
    !Array.isArray(input.observedFacts) ||
    input.observedFacts.length > program.hardLimits.maximumNormalizedFacts ||
    !input.observedFacts.every(factIsValid) ||
    !isAgentControlInstant(input.observedAt)
  ) {
    throw new TypeError('Capability probe normalized observation is invalid.');
  }
  const observedFacts = Object.freeze(
    [...input.observedFacts]
      .sort(compareFacts)
      .map((fact) => Object.freeze({ ...fact }))
  );
  if (
    new Set(
      observedFacts.map(
        ({ factKind, factDigest, providerEventType }) =>
          `${factKind}\u0000${providerEventType ?? ''}\u0000${factDigest}`
      )
    ).size !== observedFacts.length
  ) {
    throw new TypeError('Capability probe normalized facts are duplicated.');
  }
  const denial = input.denial;
  if (
    denial !== null &&
    (!hasExactAgentControlKeys(denial, ['denialKind', 'denialFactDigest']) ||
      !isAgentCanonicalDigest(denial.denialFactDigest))
  ) {
    throw new TypeError('Capability probe denial projection is invalid.');
  }
  const semanticProof = input.semanticProof;
  if (
    semanticProof !== null &&
    !isAgentCapabilityProbeSupportedSemanticProof(semanticProof, program)
  ) {
    throw new TypeError('Capability probe semantic proof is invalid.');
  }
  if (
    !isAgentCapabilityProbeObservedLimits(input.observedLimits, program) ||
    input.observedLimits.normalizedFactCount !== observedFacts.length
  ) {
    throw new TypeError(
      'Capability probe normalized facts drifted from observed limits.'
    );
  }
  const supported = requirementsSatisfied(program, observedFacts);
  const networkRoundTripPolicy =
    program.providerRequestIntent.networkRoundTripPolicy;
  const supportedRoundTrips =
    input.observedLimits.providerRoundTripCount >=
      networkRoundTripPolicy.minimumRoundTrips &&
    input.observedLimits.providerRoundTripCount <=
      networkRoundTripPolicy.maximumRoundTrips &&
    (networkRoundTripPolicy.mode === 'repeat-until-terminal'
      ? input.observedLimits.pollAttemptCount >=
          networkRoundTripPolicy.minimumRepeatCount &&
        input.observedLimits.pollAttemptCount <=
          networkRoundTripPolicy.maximumRepeatCount
      : input.observedLimits.providerRoundTripCount ===
        program.providerRequestIntent.requestPhases.length);
  const validStatus =
    (input.status === 'supported' &&
      supported &&
      supportedRoundTrips &&
      semanticProof !== null &&
      semanticProofMatchesObservation(program, semanticProof, observedFacts) &&
      denial === null) ||
    (input.status === 'unsupported' &&
      !supported &&
      observedFacts.length === 0 &&
      semanticProof === null &&
      denial !== null &&
      program.observationContract.unsupportedDenialKinds.includes(
        denial.denialKind
      )) ||
    (input.status === 'inconclusive' &&
      !supported &&
      observedFacts.length === 0 &&
      semanticProof === null &&
      denial !== null &&
      program.observationContract.inconclusiveDenialKinds.includes(
        denial.denialKind
      ));
  if (!validStatus) {
    throw new TypeError(
      'Capability probe status lacks its required normalized fact or denial authority.'
    );
  }
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROGRAM_OBSERVATION_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROGRAM_VERSION,
    observationSource: 'normalized-provider-response' as const,
    probeProgramDigest: program.programDigest,
    profileProjectionDigest: program.profileProjectionDigest,
    providerConfigurationDigest: input.providerConfigurationDigest,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    probeRequestDigest: input.probeRequestDigest,
    providerResponseDigest: input.providerResponseDigest,
    status: input.status,
    observedFacts,
    semanticProof,
    denial: denial === null ? null : Object.freeze({ ...denial }),
    observedLimits: input.observedLimits,
    observedLimitDigest: input.observedLimits.limitDigest,
    observedAt: input.observedAt,
  });
  if (
    inspectAgentControlJson(
      base,
      AGENT_CAPABILITY_PROBE_OBSERVATION_MAXIMUM_BYTES
    ).length > 0 ||
    containsCredential(base)
  ) {
    throw new TypeError(
      'Capability probe normalized observation is unsafe or unbounded.'
    );
  }
  return Object.freeze({
    ...base,
  });
};

const normalizedObservationSourceProjectionKeys = Object.freeze([
  'format',
  'version',
  'observationSource',
  'probeProgramDigest',
  'profileProjectionDigest',
  'providerConfigurationDigest',
  'modelLineageDigest',
  'adapterDigest',
  'probeRequestDigest',
  'providerResponseDigest',
  'status',
  'observedFacts',
  'semanticProof',
  'denial',
  'observedLimits',
  'observedLimitDigest',
  'observedAt',
] as const);

export const isAgentCapabilityProbeNormalizedObservationSourceProjection = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentCapabilityProbeNormalizedObservationSourceProjection => {
  if (
    !hasExactAgentControlKeys(value, normalizedObservationSourceProjectionKeys)
  ) {
    return false;
  }
  try {
    const {
      format: _format,
      version: _version,
      observationSource: _observationSource,
      probeProgramDigest: _probeProgramDigest,
      profileProjectionDigest: _profileProjectionDigest,
      observedLimitDigest: _observedLimitDigest,
      ...input
    } = value as unknown as AgentCapabilityProbeNormalizedObservationSourceProjection;
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeNormalizedObservationSourceProjection(
        program,
        input
      )
    );
  } catch {
    return false;
  }
};

export const digestAgentCapabilityProbeNormalizedObservationSourceProjection = (
  projection: AgentCapabilityProbeNormalizedObservationSourceProjection,
  program: AgentCapabilityProbeProgram
): CanonicalDigest => {
  if (
    !isAgentCapabilityProbeNormalizedObservationSourceProjection(
      projection,
      program
    )
  ) {
    throw new TypeError(
      'Capability probe normalized observation source projection is invalid.'
    );
  }
  return digestAgentCanonicalValue(projection);
};

export const createAgentCapabilityProbeProgramObservation = (
  program: AgentCapabilityProbeProgram,
  input: Omit<
    AgentCapabilityProbeProgramObservation,
    | 'format'
    | 'version'
    | 'observationSource'
    | 'probeProgramDigest'
    | 'profileProjectionDigest'
    | 'observedLimitDigest'
    | 'observationDigest'
  >
): AgentCapabilityProbeProgramObservation => {
  if (
    !hasExactAgentControlKeys(input, [
      'providerConfigurationDigest',
      'modelLineageDigest',
      'adapterDigest',
      'probeRequestDigest',
      'providerResponseDigest',
      'normalizedEventSetDigest',
      'status',
      'observedFacts',
      'semanticProof',
      'denial',
      'observedLimits',
      'observedAt',
    ]) ||
    !isAgentCanonicalDigest(input.normalizedEventSetDigest)
  ) {
    throw new TypeError('Capability probe normalized observation is invalid.');
  }
  const { normalizedEventSetDigest, ...sourceInput } = input;
  const sourceProjection =
    createAgentCapabilityProbeNormalizedObservationSourceProjection(
      program,
      sourceInput
    );
  const base = Object.freeze({
    ...sourceProjection,
    normalizedEventSetDigest,
  });
  if (
    inspectAgentControlJson(
      base,
      AGENT_CAPABILITY_PROBE_OBSERVATION_MAXIMUM_BYTES
    ).length > 0 ||
    containsCredential(base)
  ) {
    throw new TypeError(
      'Capability probe normalized observation is unsafe or unbounded.'
    );
  }
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

export const projectAgentCapabilityProbeNormalizedObservationSource = (
  observation: AgentCapabilityProbeProgramObservation,
  program: AgentCapabilityProbeProgram
): AgentCapabilityProbeNormalizedObservationSourceProjection => {
  if (!isAgentCapabilityProbeProgramObservation(observation, program)) {
    throw new TypeError('Capability probe normalized observation is invalid.');
  }
  const {
    normalizedEventSetDigest: _normalizedEventSetDigest,
    observationDigest: _observationDigest,
    ...projection
  } = observation;
  return createAgentCapabilityProbeNormalizedObservationSourceProjection(
    program,
    (() => {
      const {
        format: _format,
        version: _version,
        observationSource: _observationSource,
        probeProgramDigest: _probeProgramDigest,
        profileProjectionDigest: _profileProjectionDigest,
        observedLimitDigest: _observedLimitDigest,
        ...input
      } = projection;
      return input;
    })()
  );
};

export const isAgentCapabilityProbeProgramObservation = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentCapabilityProbeProgramObservation => {
  if (
    !hasExactAgentControlKeys(value, [
      'format',
      'version',
      'observationSource',
      'probeProgramDigest',
      'profileProjectionDigest',
      'providerConfigurationDigest',
      'modelLineageDigest',
      'adapterDigest',
      'probeRequestDigest',
      'providerResponseDigest',
      'normalizedEventSetDigest',
      'status',
      'observedFacts',
      'semanticProof',
      'denial',
      'observedLimits',
      'observedLimitDigest',
      'observedAt',
      'observationDigest',
    ])
  ) {
    return false;
  }
  try {
    const {
      format: _format,
      version: _version,
      observationSource: _observationSource,
      probeProgramDigest: _probeProgramDigest,
      profileProjectionDigest: _profileProjectionDigest,
      observedLimitDigest: _observedLimitDigest,
      observationDigest: _observationDigest,
      ...input
    } = value as unknown as AgentCapabilityProbeProgramObservation;
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProgramObservation(program, input)
    );
  } catch {
    return false;
  }
};

export const createAgentCapabilityProbeProgramReceipt = (
  input: Readonly<{
    probeId: string;
    program: AgentCapabilityProbeProgram;
    observation: AgentCapabilityProbeProgramObservation;
    declaredCapabilityProfileDigests: readonly CanonicalDigest[];
    probedAt: Instant;
    expiresAt: Instant;
  }>
): AgentCapabilityProbeProgramReceipt => {
  if (
    !hasExactAgentControlKeys(input, [
      'probeId',
      'program',
      'observation',
      'declaredCapabilityProfileDigests',
      'probedAt',
      'expiresAt',
    ]) ||
    !isAgentControlIdentity(input.probeId) ||
    !isAgentCapabilityProbeProgram(input.program) ||
    !isAgentCapabilityProbeProgramObservation(
      input.observation,
      input.program
    ) ||
    !isAgentControlInstant(input.probedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    input.probedAt !== input.observation.observedAt ||
    Date.parse(input.expiresAt) <= Date.parse(input.probedAt) ||
    !Array.isArray(input.declaredCapabilityProfileDigests) ||
    input.declaredCapabilityProfileDigests.length === 0 ||
    input.declaredCapabilityProfileDigests.length > 128 ||
    input.declaredCapabilityProfileDigests.some(
      (digest) => !isAgentCanonicalDigest(digest)
    )
  ) {
    throw new TypeError('Capability probe program receipt input is invalid.');
  }
  const declaredCapabilityProfileDigests = Object.freeze(
    [...input.declaredCapabilityProfileDigests].sort(compareUnicodeCodePoints)
  );
  if (
    new Set(declaredCapabilityProfileDigests).size !==
    declaredCapabilityProfileDigests.length
  ) {
    throw new TypeError('Capability probe declarations are duplicated.');
  }
  const status = input.observation.status;
  const observedProfileDigest =
    status === 'supported'
      ? input.program.profileProjection.capabilityProfileDigest
      : undefined;
  const probedCapabilityDigest = digestAgentCanonicalValue({
    normalizedObservationDigest: input.observation.observationDigest,
    observedLimitDigest: input.observation.observedLimitDigest,
    observedProfileDigest: observedProfileDigest ?? null,
    probeProgramDigest: input.program.programDigest,
    profileProjectionDigest: input.program.profileProjectionDigest,
    status,
  });
  const base = Object.freeze({
    probeId: input.probeId,
    providerConfigurationDigest: input.observation.providerConfigurationDigest,
    modelLineageDigest: input.observation.modelLineageDigest,
    requestedProfileDigest:
      input.program.profileProjection.capabilityProfileDigest,
    declaredCapabilityDigest: digestAgentCanonicalValue(
      declaredCapabilityProfileDigests
    ),
    probedCapabilityDigest,
    status,
    ...(observedProfileDigest ? { observedProfileDigest } : {}),
    observedLimitDigest: input.observation.observedLimitDigest,
    probeProgramDigest: input.program.programDigest,
    profileProjectionDigest: input.program.profileProjectionDigest,
    normalizedObservationDigest: input.observation.observationDigest,
    probedAt: input.probedAt,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};
