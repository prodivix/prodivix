import { describe, expect, it } from 'vitest';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
} from '../providers/agentProviderIdentity';
import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgramReceipt,
  createAgentCapabilityProbeSupportedSemanticProof,
  digestAgentCapabilityProbeProfile,
  type AgentCapabilityProbeObservedFactProjection,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import {
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  type AgentCapabilityProbeProviderResourceCleanupReceipt,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
} from '../providers/agentCapabilityProbeProviderResource';
import { createAgentHostedRetrievalRuntimeResourceRegistrationIntent } from '../providers/agentHostedRetrievalRuntimeResource';
import { G4_V8_MINIMUM_EVALUATION_CORPUS } from './agentEvaluationCorpus';
import type {
  AgentEvaluationProductionCapabilityProbeEvidence,
  AgentEvaluationRuntimeFactSourceAuthority,
} from './agentEvaluation.types';
import { createAgentEvaluationCapabilityDescriptor } from './agentEvaluationCapabilityExecution';
import {
  createAgentCapabilityQualificationTarget,
  createAgentEvaluationOptionalCapabilitySupportAuthority,
  createAgentEvaluationEndpointSmokeTarget,
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentModelEvaluationBudget,
  planAgentModelEvaluationAttempts,
  resolveAgentEvaluationCapabilityDescriptor,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import { resolveAgentProductionEvaluationQualificationAuthorityBundleFromPlan } from './agentEvaluationQualificationAuthorityBundle';
import {
  AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_CANONICAL_CASE_SET_DIGEST,
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG,
  AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST,
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT,
  assertAgentProductionReleaseEvaluationPlanComposition,
  createAgentProductionEvaluationQualificationAuthorityBundle,
  createAgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  createAgentProductionEvaluationRuntimeFactSourceIdentity,
  createAgentProductionReleaseEvaluationPlan,
  resolveAgentProductionEvaluationNativeProviderIdentity,
  type AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
  type AgentProductionEvaluationFrozenCapabilityProfileId,
  type AgentProductionEvaluationNativeIdentity,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationOptionalCapabilityProfileId,
  type AgentProductionEvaluationQualificationAuthorityBundle,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  type AgentProductionReleaseEvaluationPlanInput,
} from './agentEvaluationReleasePlan';

const digest = (label: string) =>
  digestAgentCanonicalValue({ releasePlanTestIdentity: label });

const probeSemanticProof = (
  program: AgentCapabilityProbeProgram,
  facts: readonly AgentCapabilityProbeObservedFactProjection[],
  probeId: string,
  probeRequestDigest: string
) => {
  const factDigest = (factKind: string) =>
    facts.find((fact) => fact.factKind === factKind)!.factDigest;
  switch (program.profileProjection.capabilityProfileId) {
    case 'g4-provider-background-job':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'background-job-lifecycle',
        jobReceiptDigest: factDigest('provider-job-receipt'),
        jobIdDigest: digest(`${probeId}.job-id`),
        submitRequestDigest: probeRequestDigest,
        pollResponseDigest: digest(`${probeId}.poll-response`),
        terminalResponseDigest: digest(`${probeId}.terminal-response`),
      });
    case 'g4-provider-hosted-retrieval-core':
    case 'g4-provider-hosted-retrieval-document': {
      const resource = program.providerRequestIntent.publicProbeResource!;
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind:
          program.profileProjection.capabilityProfileId ===
          'g4-provider-hosted-retrieval-core'
            ? 'hosted-retrieval-public-text'
            : 'hosted-retrieval-public-document',
        retrievalQueryReceiptDigest: factDigest('retrieval-query-receipt'),
        resourceDescriptorDigest: resource.descriptorDigest,
        queryDigest: resource.queryDigest,
        indexDigest: resource.indexDigest,
        expectedMarkerDigest: resource.expectedMarkerDigest,
        resultMarkerDigest: resource.expectedMarkerDigest,
        documentBytesDigest: resource.documentBytesDigest,
        providerResponseDigest: digest(`${probeId}.provider-response`),
      });
    }
    case 'g4-provider-isolated-cache': {
      const descriptor = program.providerRequestIntent.cachePrefixResource!;
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'isolated-cache-roundtrip',
        cacheReceiptDigest: factDigest('provider-cache-receipt'),
        usageVectorDigest: factDigest('usage-vector'),
        cachePrefixDescriptorDigest: descriptor.descriptorDigest,
        coldPrefixDigest: descriptor.prefixDigest,
        warmPrefixDigest: descriptor.prefixDigest,
        coldSuffixDigest: descriptor.coldSuffixDigest,
        warmSuffixDigest: descriptor.warmSuffixDigest,
        cacheKeyDigest: digest(`${probeId}.cache-key`),
        coldResponseDigest: digest(`${probeId}.cold-response`),
        warmResponseDigest: digest(`${probeId}.warm-response`),
        usageDeltaDigest: digest(`${probeId}.usage-delta`),
        isolationScopeDigest: digest(`${probeId}.isolation-scope`),
        coldCachedTokenCount: 0,
        warmCachedTokenCount: 1,
        cacheHitObserved: true,
      });
    }
    case 'g4-provider-parallel-tool':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'parallel-tool-call-set',
        providerResponseDigest: digest(`${probeId}.provider-response`),
        toolCalls: Object.freeze(
          program.providerRequestIntent.requiredToolNames.map(
            (toolName, index) =>
              Object.freeze({
                toolName,
                toolCallId: `probe-tool-call-${index + 1}`,
                factDigest: facts[index]!.factDigest,
              })
          )
        ),
      });
    case 'g4-provider-reasoning-continuation':
      return createAgentCapabilityProbeSupportedSemanticProof(program, {
        proofKind: 'opaque-continuation-roundtrip',
        continuationFactDigest: factDigest('opaque-continuation'),
        parentResponseDigest: digest(`${probeId}.parent-response`),
        opaqueHandleDigest: digest(`${probeId}.opaque-handle`),
        resumeRequestDigest: probeRequestDigest,
        resumeResponseDigest: digest(`${probeId}.resume-response`),
      });
  }
};

const probeObservedLimits = (
  program: AgentCapabilityProbeProgram,
  normalizedFactCount: number
) =>
  createAgentCapabilityProbeObservedLimits(program, {
    requestBytes: 1_024,
    responseBytes: 4_096,
    normalizedFactCount,
    toolCallCount: program.providerRequestIntent.requiredToolNames.length,
    providerRoundTripCount: Math.min(
      2,
      program.hardLimits.maximumProviderRoundTrips
    ),
    pollAttemptCount:
      program.profileProjection.capabilityProfileId ===
      'g4-provider-background-job'
        ? 1
        : 0,
    observedMaximumSingleDispatchMs: 1_000,
    observedExecutionDurationMs: 2_000,
  });

const profileDigestRecord = (prefix: string) =>
  Object.freeze(
    Object.fromEntries(
      AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES.map((profileId) => [
        profileId,
        digest(`${prefix}.${profileId}`),
      ])
    )
  ) as Readonly<
    Record<AgentProductionEvaluationFrozenCapabilityProfileId, string>
  >;

const capabilityProfileDigests = Object.freeze(
  Object.fromEntries(
    AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES.map((profileId) => [
      profileId,
      AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.includes(
        profileId as never
      )
        ? digestAgentCapabilityProbeProfile(profileId as never)
        : digest(`capability-profile.${profileId}`),
    ])
  )
) as Readonly<
  Record<AgentProductionEvaluationFrozenCapabilityProfileId, string>
>;

const supportedOptionalProfiles: Readonly<
  Record<
    AgentProductionEvaluationNativeProtocolFamily,
    readonly AgentProductionEvaluationFrozenCapabilityProfileId[]
  >
> = Object.freeze({
  'openai-responses': Object.freeze([
    'g4-provider-background-job',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-parallel-tool',
  ] as const),
  'anthropic-messages': Object.freeze([
    'g4-provider-isolated-cache',
    'g4-provider-parallel-tool',
  ] as const),
  'gemini-interactions': Object.freeze([
    'g4-provider-hosted-retrieval-core',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-isolated-cache',
    'g4-provider-reasoning-continuation',
  ] as const),
});

type NativeFixture = Readonly<{
  identity: AgentProductionEvaluationNativeIdentity;
  capabilityProbeAuthorities: Readonly<
    Record<
      AgentProductionEvaluationOptionalCapabilityProfileId,
      AgentEvaluationProductionCapabilityProbeEvidence
    >
  >;
  runtimeFactSourceAuthorities: Readonly<
    Record<
      AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
      AgentEvaluationRuntimeFactSourceAuthority
    >
  >;
  probeProviderResourceAuthorities: Readonly<
    Partial<
      Record<
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document',
        ReturnType<typeof createAgentCapabilityProbeProviderResourceAuthority>
      >
    >
  >;
  probeProviderResourceDeletionAuthorityReceipts: Readonly<
    Partial<
      Record<
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document',
        AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt
      >
    >
  >;
  probeProviderResourceCleanupReceipts: Readonly<
    Partial<
      Record<
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document',
        AgentCapabilityProbeProviderResourceCleanupReceipt
      >
    >
  >;
}>;

const nativeIdentity = (
  protocolFamily: AgentProductionEvaluationNativeProtocolFamily,
  operator: string,
  owner: string,
  region: string
): NativeFixture =>
  (() => {
    const adapter = createAgentProviderAdapterIdentity({
      adapterId: `adapter.release.${protocolFamily}`,
      adapterVersion: '1.0.0',
      protocolFamily,
      transportSchemaDigest: digest(`${protocolFamily}.transport-schema`),
      eventNormalizationDigest: digest(`${protocolFamily}.event-normalization`),
    });
    const provider = createAgentProviderConfigurationIdentity({
      providerConfigurationId: `provider.release.${protocolFamily}`,
      providerOperatorId: operator,
      endpointClass: 'first-party-hosted',
      endpointProfileDigest: digest(`${protocolFamily}.endpoint-profile`),
      providerRegion: region,
      apiRevision: '2026-08-08',
      adapter,
      dataPolicyDigest: digest(`${protocolFamily}.data-policy`),
    });
    const model = createAgentModelLineage({
      modelId: `model.release.${protocolFamily}.2026-08-08`,
      modelFamilyId: `model-family.release.${protocolFamily}`,
      modelFamilyOwnerId: owner,
      immutableVersion:
        protocolFamily === 'gemini-interactions'
          ? `2026-08-08-${protocolFamily}`
          : `model.release.${protocolFamily}.2026-08-08`,
      tokenizerDigest: digest(`${protocolFamily}.tokenizer`),
      chatTemplateDigest: digest(`${protocolFamily}.chat-template`),
    });
    const declaredCapabilityProfileDigests = Object.freeze(
      Object.values(capabilityProfileDigests).sort(compareUnicodeCodePoints)
    );
    const capabilityProbeAuthorities = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => {
            const status = supportedOptionalProfiles[protocolFamily].includes(
              profileId
            )
              ? ('supported' as const)
              : ('unsupported' as const);
            const requestedProfileDigest = capabilityProfileDigests[profileId];
            const probeId = `probe.release.${protocolFamily}.${profileId}`;
            const probeRequestDigest = digest(
              `${protocolFamily}.${profileId}.probe-request`
            );
            const probeResponseDigest = digest(
              `${protocolFamily}.${profileId}.probe-response`
            );
            const normalizedEventSetDigest = digest(
              `${protocolFamily}.${profileId}.probe-normalized-events`
            );
            const probeProgram = createAgentCapabilityProbeProgram({
              capabilityProfileId: profileId,
              capabilityProfileDigest: requestedProfileDigest,
            });
            const observedFacts =
              status === 'supported'
                ? probeProgram.observationContract.supportedRequirements.flatMap(
                    (requirement) =>
                      Array.from(
                        { length: requirement.minimumCount },
                        (_, index) =>
                          Object.freeze({
                            factKind: requirement.factKind,
                            factDigest: digest(
                              `${protocolFamily}.${profileId}.${requirement.factKind}.${index}`
                            ),
                            providerEventType: requirement.providerEventType,
                          })
                      )
                  )
                : Object.freeze([]);
            const normalizedObservation =
              createAgentCapabilityProbeProgramObservation(probeProgram, {
                providerConfigurationDigest:
                  digestAgentCanonicalValue(provider),
                modelLineageDigest: model.lineageDigest,
                adapterDigest: adapter.adapterDigest,
                probeRequestDigest,
                providerResponseDigest: probeResponseDigest,
                normalizedEventSetDigest,
                status,
                observedFacts,
                semanticProof:
                  status === 'supported'
                    ? probeSemanticProof(
                        probeProgram,
                        observedFacts,
                        probeId,
                        probeRequestDigest
                      )
                    : null,
                denial:
                  status === 'supported'
                    ? null
                    : Object.freeze({
                        denialKind: 'provider-feature-unavailable' as const,
                        denialFactDigest: digest(
                          `${protocolFamily}.${profileId}.denial`
                        ),
                      }),
                observedLimits: probeObservedLimits(
                  probeProgram,
                  observedFacts.length
                ),
                observedAt: '2026-08-07T23:00:00.000Z',
              });
            const receipt = createAgentCapabilityProbeProgramReceipt({
              probeId,
              program: probeProgram,
              observation: normalizedObservation,
              declaredCapabilityProfileDigests,
              probedAt: '2026-08-07T23:00:00.000Z',
              expiresAt: '2026-08-16T00:00:00.000Z',
            });
            return [
              profileId,
              createAgentEvaluationProductionCapabilityProbeEvidence({
                authorityKind: 'sealed-provider-capability-probe',
                authorityIssuerId: `authority.release.${protocolFamily}`,
                ownerImplementationDigest: digest(
                  `${protocolFamily}.probe-owner-implementation`
                ),
                adapterDigest: adapter.adapterDigest,
                probeRequestDigest,
                probeResponseDigest,
                dispatchReceiptDigest: digest(
                  `${protocolFamily}.${profileId}.probe-dispatch`
                ),
                transportReceiptDigest: digest(
                  `${protocolFamily}.${profileId}.probe-transport`
                ),
                responseSpoolDigest: digest(
                  `${protocolFamily}.${profileId}.probe-spool`
                ),
                normalizedEventSetDigest,
                probeProgram,
                normalizedObservation,
                receipt,
              }),
            ];
          }
        )
      )
    ) as NativeFixture['capabilityProbeAuthorities'];
    const capabilityRuntimeFactSourceAuthorities = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.flatMap(
          (profileId) => {
            const probeProgram =
              capabilityProbeAuthorities[profileId].probeProgram;
            if (
              probeProgram.profileProjection.capabilityId ===
              'provider.parallel-tool'
            ) {
              return [];
            }
            return [
              [
                profileId,
                createAgentEvaluationRuntimeFactSourceAuthority({
                  kind: 'shared-durable-capability',
                  sourceKind:
                    probeProgram.profileProjection.capabilityId ===
                    'provider.hosted-retrieval'
                      ? 'sealed-hosted-owner-result'
                      : 'sealed-provider-response-metadata',
                  sourceAuthorityId: `runtime-source.release.${protocolFamily}.${profileId}`,
                  sourceAuthorityImplementationDigest: digest(
                    `${protocolFamily}.${profileId}.runtime-source-implementation`
                  ),
                  routeBinding: `runtime-fact-source.${profileId}`,
                  capabilityProfileId: profileId,
                  capabilityProfileDigest: capabilityProfileDigests[profileId],
                  capabilityId: probeProgram.profileProjection.capabilityId,
                  protocolFamily,
                  providerConfigurationId: provider.providerConfigurationId,
                  modelId: model.modelId,
                  modelLineageDigest: model.lineageDigest,
                  adapterDigest: adapter.adapterDigest,
                  registrationAuthorityIssuerId:
                    'authority.release.runtime-registration',
                  registrationReceiptDigest: digest(
                    `${protocolFamily}.${profileId}.runtime-source-registration`
                  ),
                  ...(probeProgram.profileProjection.capabilityId ===
                    'provider.hosted-retrieval' &&
                  protocolFamily !== 'anthropic-messages'
                    ? {
                        hostedRetrievalRuntimeResourceRegistrationIntentDigest:
                          createAgentHostedRetrievalRuntimeResourceRegistrationIntent(
                            {
                              providerConfigurationId:
                                provider.providerConfigurationId,
                              providerConfigurationDigest:
                                digestAgentCanonicalValue(provider),
                              protocolFamily,
                              modelId: model.modelId,
                              modelLineageDigest: model.lineageDigest,
                              adapterDigest: adapter.adapterDigest,
                              capabilityProfileId:
                                profileId ===
                                'g4-provider-hosted-retrieval-core'
                                  ? 'g4-provider-hosted-retrieval-core'
                                  : 'g4-provider-hosted-retrieval-document',
                              capabilityProfileDigest:
                                capabilityProfileDigests[profileId],
                              probeProgramDigest: probeProgram.programDigest,
                              publicResourceDescriptorDigest:
                                probeProgram.providerRequestIntent
                                  .publicProbeResource!.descriptorDigest,
                            }
                          ).intentDigest,
                      }
                    : {}),
                }),
              ],
            ];
          }
        )
      )
    ) as NativeFixture['runtimeFactSourceAuthorities'];
    const capabilityProbePrograms = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => [
            profileId,
            capabilityProbeAuthorities[profileId].probeProgram,
          ]
        )
      )
    ) as AgentProductionEvaluationNativeIdentity['capabilityProbePrograms'];
    const expectedRuntimeFactSourceIdentities = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => {
            const {
              registrationReceiptDigest: _registrationReceiptDigest,
              authorityDigest: _authorityDigest,
              ...identity
            } = capabilityRuntimeFactSourceAuthorities[profileId];
            return [
              profileId,
              createAgentProductionEvaluationRuntimeFactSourceIdentity(
                identity
              ),
            ];
          }
        )
      )
    ) as AgentProductionEvaluationNativeIdentity['expectedRuntimeFactSourceIdentities'];
    const probeProviderResourceRecords =
      protocolFamily === 'anthropic-messages'
        ? Object.freeze([])
        : Object.freeze(
            (
              [
                'g4-provider-hosted-retrieval-core',
                'g4-provider-hosted-retrieval-document',
              ] as const
            ).map((profileId) => {
              const providerResourceId = `probe-resource.${protocolFamily}.${profileId}`;
              const resourceManifestDigest = digest(
                `${protocolFamily}.${profileId}.resource-manifest`
              );
              const auxiliaryResourceIds = Object.freeze(
                protocolFamily === 'openai-responses'
                  ? [`probe-file.${protocolFamily}.${profileId}`]
                  : []
              );
              const deletionRequestProjection =
                createAgentCapabilityProbeProviderResourceDeletionRequestProjection(
                  {
                    requestDigest: digest(
                      `${protocolFamily}.${profileId}.resource-registration-request`
                    ),
                    protocolFamily,
                    providerResourceId,
                    auxiliaryResourceIds,
                  }
                );
              const deletionAuthorityReceipt =
                createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
                  {
                    resourceManifestDigest,
                    deletionRequestProjection,
                    registeredAt: '2026-08-07T23:00:00.000Z',
                    expiresAt: '2026-08-15T00:00:00.000Z',
                  }
                );
              const authority =
                createAgentCapabilityProbeProviderResourceAuthority(
                  capabilityProbePrograms[profileId],
                  {
                    protocolFamily,
                    providerConfigurationId: provider.providerConfigurationId,
                    modelId: model.modelId,
                    modelLineageDigest: model.lineageDigest,
                    adapterDigest: adapter.adapterDigest,
                    providerResourceId,
                    resourceManifestDigest,
                    contentUploadReceiptDigest: digest(
                      `${protocolFamily}.${profileId}.content-upload`
                    ),
                    deletionAuthorityReceiptDigest:
                      deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
                    registeredAt: '2026-08-07T23:00:00.000Z',
                    expiresAt: '2026-08-15T00:00:00.000Z',
                  }
                );
              const cleanupReceipt =
                createAgentCapabilityProbeProviderResourceCleanupReceipt({
                  deletionAuthorityReceipt,
                  resourceResults: Object.freeze([
                    createAgentCapabilityProbeProviderResourceCleanupResourceResult(
                      {
                        resourceId: providerResourceId,
                        resourceRole: 'primary',
                        outcome: 'deleted',
                        dispatchIntentDigest: digest(
                          `${protocolFamily}.${profileId}.delete-primary-dispatch`
                        ),
                        transportReceiptDigest: digest(
                          `${protocolFamily}.${profileId}.delete-primary-transport`
                        ),
                        completedAt: '2026-08-07T23:30:00.000Z',
                      }
                    ),
                    ...auxiliaryResourceIds.map((resourceId) =>
                      createAgentCapabilityProbeProviderResourceCleanupResourceResult(
                        {
                          resourceId,
                          resourceRole: 'auxiliary',
                          outcome: 'deleted',
                          dispatchIntentDigest: digest(
                            `${protocolFamily}.${profileId}.${resourceId}.delete-dispatch`
                          ),
                          transportReceiptDigest: digest(
                            `${protocolFamily}.${profileId}.${resourceId}.delete-transport`
                          ),
                          completedAt: '2026-08-07T23:30:01.000Z',
                        }
                      )
                    ),
                  ]),
                });
              return Object.freeze({
                profileId,
                authority,
                deletionAuthorityReceipt,
                cleanupReceipt,
              });
            })
          );
    const probeProviderResourceAuthorities = Object.freeze(
      Object.fromEntries(
        probeProviderResourceRecords.map(({ profileId, authority }) => [
          profileId,
          authority,
        ])
      )
    ) as NativeFixture['probeProviderResourceAuthorities'];
    const probeProviderResourceDeletionAuthorityReceipts = Object.freeze(
      Object.fromEntries(
        probeProviderResourceRecords.map(
          ({ profileId, deletionAuthorityReceipt }) => [
            profileId,
            deletionAuthorityReceipt,
          ]
        )
      )
    ) as NativeFixture['probeProviderResourceDeletionAuthorityReceipts'];
    const probeProviderResourceCleanupReceipts = Object.freeze(
      Object.fromEntries(
        probeProviderResourceRecords.map(({ profileId, cleanupReceipt }) => [
          profileId,
          cleanupReceipt,
        ])
      )
    ) as NativeFixture['probeProviderResourceCleanupReceipts'];
    const identity = Object.freeze({
      protocolFamily,
      providerConfigurationId: provider.providerConfigurationId,
      providerOperatorId: operator,
      apiRevision: '2026-08-08',
      region,
      endpointProfileDigest: digest(`${protocolFamily}.endpoint-profile`),
      dataPolicyDigest: digest(`${protocolFamily}.data-policy`),
      adapter: Object.freeze({
        adapterId: adapter.adapterId,
        adapterVersion: adapter.adapterVersion,
        transportSchemaDigest: adapter.transportSchemaDigest,
        eventNormalizationDigest: adapter.eventNormalizationDigest,
      }),
      model: Object.freeze({
        modelId: `model.release.${protocolFamily}.2026-08-08`,
        modelFamilyId: `model-family.release.${protocolFamily}`,
        modelFamilyOwnerId: owner,
        immutableVersion:
          protocolFamily === 'gemini-interactions'
            ? `2026-08-08-${protocolFamily}`
            : `model.release.${protocolFamily}.2026-08-08`,
        tokenizerDigest: digest(`${protocolFamily}.tokenizer`),
        chatTemplateDigest: digest(`${protocolFamily}.chat-template`),
      }),
      capabilityInferenceConfigurationDigests: profileDigestRecord(
        `${protocolFamily}.inference`
      ),
      declaredCapabilityProfileDigests,
      capabilityProbePrograms,
      expectedRuntimeFactSourceIdentities,
      pricingAuthorityDigest: digest(`${protocolFamily}.pricing-authority`),
      smokeProfileDigest: digest(`${protocolFamily}.native-smoke-profile`),
    });
    return Object.freeze({
      identity,
      capabilityProbeAuthorities,
      runtimeFactSourceAuthorities: capabilityRuntimeFactSourceAuthorities,
      probeProviderResourceAuthorities,
      probeProviderResourceDeletionAuthorityReceipts,
      probeProviderResourceCleanupReceipts,
    });
  })();

const createInput = (): AgentProductionReleaseEvaluationPlanInput => {
  const nativeFixtures = Object.freeze([
    nativeIdentity(
      'openai-responses',
      'operator.release.openai',
      'owner.release.openai',
      'us-east-1'
    ),
    nativeIdentity(
      'anthropic-messages',
      'operator.release.anthropic',
      'owner.release.anthropic',
      'us-west-2'
    ),
    nativeIdentity(
      'gemini-interactions',
      'operator.release.google',
      'owner.release.google',
      'europe-west4'
    ),
  ]);
  const qualificationAuthorityBundle =
    createAgentProductionEvaluationQualificationAuthorityBundle({
      capabilityProbeAuthorities: Object.freeze(
        Object.fromEntries(
          nativeFixtures.map((fixture) => [
            fixture.identity.protocolFamily,
            fixture.capabilityProbeAuthorities,
          ])
        )
      ) as AgentProductionEvaluationQualificationAuthorityBundle['capabilityProbeAuthorities'],
      runtimeFactSourceAuthorities: Object.freeze(
        Object.fromEntries(
          nativeFixtures.map((fixture) => [
            fixture.identity.protocolFamily,
            fixture.runtimeFactSourceAuthorities,
          ])
        )
      ) as AgentProductionEvaluationQualificationAuthorityBundle['runtimeFactSourceAuthorities'],
      providerResourceCleanupReceipts: Object.freeze(
        Object.fromEntries(
          nativeFixtures
            .filter(
              ({ identity }) => identity.protocolFamily !== 'anthropic-messages'
            )
            .map((fixture) => [
              fixture.identity.protocolFamily,
              fixture.probeProviderResourceCleanupReceipts,
            ])
        )
      ) as AgentProductionEvaluationQualificationAuthorityBundle['providerResourceCleanupReceipts'],
    });
  const probeProviderResourceAuthorityBundle =
    createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
      authorities: Object.freeze(
        Object.fromEntries(
          nativeFixtures
            .filter(
              ({ identity }) => identity.protocolFamily !== 'anthropic-messages'
            )
            .map((fixture) => [
              fixture.identity.protocolFamily,
              fixture.probeProviderResourceAuthorities,
            ])
        )
      ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['authorities'],
      deletionAuthorityReceipts: Object.freeze(
        Object.fromEntries(
          nativeFixtures
            .filter(
              ({ identity }) => identity.protocolFamily !== 'anthropic-messages'
            )
            .map((fixture) => [
              fixture.identity.protocolFamily,
              fixture.probeProviderResourceDeletionAuthorityReceipts,
            ])
        )
      ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['deletionAuthorityReceipts'],
      cleanupReceipts: Object.freeze(
        Object.fromEntries(
          nativeFixtures
            .filter(
              ({ identity }) => identity.protocolFamily !== 'anthropic-messages'
            )
            .map((fixture) => [
              fixture.identity.protocolFamily,
              fixture.probeProviderResourceCleanupReceipts,
            ])
        )
      ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['cleanupReceipts'],
    });
  return Object.freeze({
    repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
    nativeIdentities: Object.freeze(
      nativeFixtures.map(({ identity }) => identity)
    ),
    qualificationAuthorityBundle,
    probeProviderResourceAuthorityBundle,
    compatibilitySmokes: Object.freeze({
      hosted: Object.freeze({
        providerConfigurationId: 'provider.release.compatible.hosted',
        endpointClass: 'aggregator',
        modelId: 'model.release.compatible.hosted.2026-08-08',
        immutableModelVersion: 'model.release.compatible.hosted.2026-08-08',
        modelLineageDigest: digest('compatible.hosted.model-lineage'),
        inferenceConfigurationDigest: digest(
          'compatible.hosted.inference-configuration'
        ),
        adapterDigest: digest('compatible.hosted.adapter'),
        pricingAuthorityDigest: digest('compatible.hosted.pricing-authority'),
        smokeProfileDigest: digest('compatible.hosted.smoke-profile'),
      }),
      local: Object.freeze({
        providerConfigurationId: 'provider.release.compatible.local',
        endpointClass: 'local',
        modelId: 'model.release.compatible.local.2026-08-08',
        immutableModelVersion: 'model.release.compatible.local.2026-08-08',
        modelLineageDigest: digest('compatible.local.model-lineage'),
        inferenceConfigurationDigest: digest(
          'compatible.local.inference-configuration'
        ),
        adapterDigest: digest('compatible.local.adapter'),
        pricingAuthorityDigest: digest('compatible.local.pricing-authority'),
        smokeProfileDigest: digest('compatible.local.smoke-profile'),
      }),
    }),
    materialCatalogDigests: Object.freeze({
      caseSetDigest: digestAgentCanonicalValue(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases.map(
          ({ caseId, caseDigest, access }) => ({
            caseId,
            caseDigest,
            access,
          })
        )
      ),
      publicMaterialSetDigest: digest('material.public-set'),
      restrictedMaterialManifestDigest: digest('material.restricted-manifest'),
      catalogDigest: digest('material.catalog'),
    }),
    policyDigests: Object.freeze({
      policyDigest: digest('policy'),
      contextBuilderDigest: digest('context-builder'),
      semanticProviderSetDigest: digest('semantic-provider-set'),
      promptPolicyDigest: digest('prompt-policy'),
      outputSchemaDigest: digest('output-schema'),
      toolRegistryDigest: digest('tool-registry'),
      actionRegistryDigest: digest('action-registry'),
      rotatingCorpusPolicyDigest: digest('rotating-corpus-policy'),
      samplingIndependencePolicyDigest: digest('sampling-independence'),
      cacheAndStateIsolationPolicyDigest: digest('cache-and-state-isolation'),
      sequentialStoppingRuleDigests: Object.freeze({
        ordinary: digest('sequential-stopping.ordinary'),
        critical: digest('sequential-stopping.critical'),
        'high-assurance': digest('sequential-stopping.high-assurance'),
      }),
      capabilityProfileDigests,
      multipleComparisonPolicyDigest: digest('multiple-comparison-policy'),
      slicePolicyDigest: digest('slice-policy'),
      graderConfigurationDigests: Object.freeze({
        strictDecoder: digest('grader.strict-decoder'),
        deterministicRule: digest('grader.deterministic-rule'),
        domainDryRun: digest('grader.domain-dry-run'),
        g3Closure: digest('grader.g3-closure'),
        perceptualMetric: digest('grader.perceptual-metric'),
        blindHumanRubric: digest('grader.blind-human-rubric'),
      }),
      disagreementPolicyDigest: digest('grader.disagreement-policy'),
      randomizedPresentationPolicyDigest: digest(
        'grader.randomized-presentation'
      ),
    }),
    auxiliaryJudge: Object.freeze({
      providerConfigurationId: 'provider.release.independent-judge',
      modelLineageDigest: digest('independent-judge.model-lineage'),
      modelFamilyOwnerId: 'owner.release.independent-judge',
      configurationDigest: digest('independent-judge.configuration'),
      promptDigest: digest('independent-judge.prompt'),
      outputSchemaDigest: digest('independent-judge.output-schema'),
      capabilityProfileDigest: digest('independent-judge.capability-profile'),
    }),
    budget: createAgentModelEvaluationBudget({
      budget: Object.freeze({
        usageLimits: Object.freeze([
          Object.freeze({
            unit: 'text-token-input',
            maximum: '10000000000',
          }),
          Object.freeze({
            unit: 'text-token-output',
            maximum: '10000000000',
          }),
          Object.freeze({
            unit: 'image-pixel',
            maximum: '1000000000000',
          }),
          Object.freeze({
            unit: 'document-page',
            maximum: '10000000',
          }),
          Object.freeze({
            unit: 'hosted-tool-call',
            maximum: '10000000',
          }),
          Object.freeze({
            unit: 'hosted-search-query',
            maximum: '10000000',
          }),
          Object.freeze({
            unit: 'provider-upload-byte',
            maximum: '10000000',
          }),
          Object.freeze({
            unit: 'provider-storage-byte-second',
            maximum: '1000000000',
          }),
        ]),
        costLimits: Object.freeze([
          Object.freeze({ currency: 'USD', maximum: '1000000' }),
        ]),
        maxModelInvocations: 100_000,
        maxToolCalls: 1_000_000,
        maxRepairRounds: 100_000,
        maxTransactions: 100_000,
        maxArtifactBytes: 10_000_000_000,
        maxElapsedMs: 604_800_000,
      }),
      maxProviderJobs: 100_000,
      maxShards: 32,
      maxHumanRatings: 100_000,
      reservePolicyDigest: digest('budget.reserve-policy'),
    }),
    minimumIndependentVisualRatings: 2,
    endpointSmokeResponseSpoolEncryptionPolicyDigest: digest(
      'endpoint-smoke-response-spool-encryption-policy'
    ),
    plannedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-15T00:00:00.000Z',
  });
};

const rebuiltProbeEvidence = (
  evidence: AgentEvaluationProductionCapabilityProbeEvidence,
  receiptOverrides: Readonly<Record<string, unknown>> = {},
  evidenceOverrides: Readonly<Record<string, unknown>> = {}
): AgentEvaluationProductionCapabilityProbeEvidence => {
  const { receiptDigest: _receiptDigest, ...receiptInput } = evidence.receipt;
  const receiptBase = Object.freeze({ ...receiptInput, ...receiptOverrides });
  const receipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  const { evidenceDigest: _evidenceDigest, ...evidenceInput } = evidence;
  const evidenceBase = Object.freeze({
    ...evidenceInput,
    receipt,
    ...evidenceOverrides,
  });
  return Object.freeze({
    ...evidenceBase,
    evidenceDigest: digestAgentCanonicalValue(evidenceBase),
  }) as AgentEvaluationProductionCapabilityProbeEvidence;
};

const withOpenAiBackgroundProbe = (
  input: AgentProductionReleaseEvaluationPlanInput,
  transform: (
    evidence: AgentEvaluationProductionCapabilityProbeEvidence
  ) => unknown
): AgentProductionReleaseEvaluationPlanInput => {
  const profileId = 'g4-provider-background-job' as const;
  const existing =
    input.qualificationAuthorityBundle.capabilityProbeAuthorities[
      'openai-responses'
    ][profileId];
  return Object.freeze({
    ...input,
    qualificationAuthorityBundle:
      createAgentProductionEvaluationQualificationAuthorityBundle({
        capabilityProbeAuthorities: Object.freeze({
          ...input.qualificationAuthorityBundle.capabilityProbeAuthorities,
          'openai-responses': Object.freeze({
            ...input.qualificationAuthorityBundle.capabilityProbeAuthorities[
              'openai-responses'
            ],
            [profileId]: transform(existing),
          }),
        }) as AgentProductionEvaluationQualificationAuthorityBundle['capabilityProbeAuthorities'],
        runtimeFactSourceAuthorities:
          input.qualificationAuthorityBundle.runtimeFactSourceAuthorities,
        providerResourceCleanupReceipts:
          input.qualificationAuthorityBundle.providerResourceCleanupReceipts,
      }),
  });
};

describe('G4 production release evaluation plan', () => {
  it('freezes the exact native, corpus, repetition, sentinel, and metric matrix', () => {
    const input = createInput();
    const plan = createAgentProductionReleaseEvaluationPlan(input);
    const descriptors = planAgentModelEvaluationAttempts(plan);

    expect(validateAgentModelEvaluationPlan(plan)).toEqual([]);
    expect(plan.repositoryCommit).toBe(input.repositoryCommit);
    expect(plan.concreteCases).toHaveLength(128);
    expect(
      new Set(plan.concreteCases.map(({ familyId }) => familyId)).size
    ).toBe(52);
    expect(plan.contextSentinelCaseIds).toHaveLength(24);
    expect(plan.mediaSentinelCaseIds).toHaveLength(16);
    expect(plan.contextTiers).toHaveLength(72);
    expect(plan.mediaRepresentationTiers).toHaveLength(48);
    expect(plan.plannedJourneyCount).toBe(
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT
    );
    expect(descriptors).toHaveLength(14_040);
    expect(
      Object.values(
        input.qualificationAuthorityBundle.capabilityProbeAuthorities
      ).reduce(
        (count, authorities) => count + Object.keys(authorities).length,
        0
      )
    ).toBe(18);
    expect(
      Object.values(
        input.qualificationAuthorityBundle.runtimeFactSourceAuthorities
      ).reduce(
        (count, authorities) => count + Object.keys(authorities).length,
        0
      )
    ).toBe(15);
    expect(
      Object.values(
        input.probeProviderResourceAuthorityBundle.authorities
      ).reduce(
        (count, authorities) => count + Object.keys(authorities).length,
        0
      )
    ).toBe(4);
    expect(
      plan.capabilityQualificationTargets
        .filter(({ optionalCapabilitySupportAuthority }) =>
          Boolean(optionalCapabilitySupportAuthority)
        )
        .every(
          ({ optionalCapabilitySupportAuthority }) =>
            optionalCapabilitySupportAuthority!
              .qualificationAuthorityBundleDigest ===
            input.qualificationAuthorityBundle.bundleDigest
        )
    ).toBe(true);

    const nativeSmokes = plan.endpointSmokeTargets.filter(
      ({ protocolFamily }) => protocolFamily !== 'openai-compatible'
    );
    expect(nativeSmokes).toHaveLength(3);
    expect(
      nativeSmokes
        .map(({ protocolFamily }) => protocolFamily)
        .sort(compareUnicodeCodePoints)
    ).toEqual([...AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES]);
    for (const smoke of nativeSmokes) {
      const identity = input.nativeIdentities.find(
        ({ protocolFamily }) => protocolFamily === smoke.protocolFamily
      )!;
      const model = plan.modelConfigurations.find(
        ({ modelId }) => modelId === identity.model.modelId
      )!;
      const nativeProviderIdentity =
        resolveAgentProductionEvaluationNativeProviderIdentity(identity);
      expect(nativeProviderIdentity.provider.providerConfigurationId).toBe(
        identity.providerConfigurationId
      );
      expect(nativeProviderIdentity.model.lineageDigest).toBe(
        model.lineageDigest
      );
      expect(smoke).toMatchObject({
        modelId: identity.model.modelId,
        immutableModelVersion: identity.model.immutableVersion,
        modelLineageDigest: model.lineageDigest,
        inferenceConfigurationDigest:
          identity.capabilityInferenceConfigurationDigests[
            'g4-core-text-tools'
          ],
        pricingAuthorityDigest: identity.pricingAuthorityDigest,
        responseSpoolEncryptionPolicyDigest:
          input.endpointSmokeResponseSpoolEncryptionPolicyDigest,
      });
    }
    const compatibleSmokes = plan.endpointSmokeTargets.filter(
      ({ protocolFamily }) => protocolFamily === 'openai-compatible'
    );
    expect(compatibleSmokes).toHaveLength(2);
    expect(compatibleSmokes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pricingAuthorityDigest:
            input.compatibilitySmokes.hosted.pricingAuthorityDigest,
          responseSpoolEncryptionPolicyDigest:
            input.endpointSmokeResponseSpoolEncryptionPolicyDigest,
        }),
        expect.objectContaining({
          pricingAuthorityDigest:
            input.compatibilitySmokes.local.pricingAuthorityDigest,
          responseSpoolEncryptionPolicyDigest:
            input.endpointSmokeResponseSpoolEncryptionPolicyDigest,
        }),
      ])
    );
    expect(plan.capabilityQualificationTargets).toHaveLength(27);
    expect(
      new Set(
        plan.capabilityQualificationTargets.map(
          ({ providerConfigurationId, capabilityProfileId }) =>
            `${providerConfigurationId}\u0000${capabilityProfileId}`
        )
      ).size
    ).toBe(27);
    for (const profileId of AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES) {
      const profileTargets = plan.capabilityQualificationTargets.filter(
        ({ capabilityProfileId }) => capabilityProfileId === profileId
      );
      expect(profileTargets).toHaveLength(3);
      expect(
        new Set(
          profileTargets.map(
            ({ optionalCapabilitySupportAuthority }) =>
              optionalCapabilitySupportAuthority?.supportExpectation
          )
        )
      ).toEqual(new Set(['required', 'expected-blocked']));
      expect(
        profileTargets.every(
          ({ optionalCapabilitySupportAuthority }) =>
            optionalCapabilitySupportAuthority?.probeEvidence.authorityKind ===
            'sealed-provider-capability-probe'
        )
      ).toBe(true);
    }
    for (const descriptor of descriptors) {
      const concreteCase = plan.concreteCases.find(
        ({ caseId }) => caseId === descriptor.caseId
      )!;
      const target = plan.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === descriptor.targetId
      )!;
      expect(descriptor.capabilityDescriptorDigest).toBe(
        resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
          .descriptorDigest
      );
    }

    const repetitionByRisk = new Map(
      plan.repetitionPolicy.rules.map(
        ({ riskClass, minimumIndependentAttempts }) => [
          riskClass,
          minimumIndependentAttempts,
        ]
      )
    );
    const repetitionsByVariant = new Map<string, Set<number>>();
    for (const descriptor of descriptors) {
      const key = [
        descriptor.caseId,
        descriptor.targetId,
        descriptor.contextTier ?? '',
        descriptor.mediaRepresentationTier ?? '',
      ].join('\u0000');
      const repetitions = repetitionsByVariant.get(key) ?? new Set<number>();
      repetitions.add(descriptor.repetitionIndex);
      repetitionsByVariant.set(key, repetitions);
    }
    for (const [key, repetitions] of repetitionsByVariant) {
      const caseId = key.split('\u0000')[0]!;
      const riskClass = plan.concreteCases.find(
        (evaluationCase) => evaluationCase.caseId === caseId
      )!.riskClass;
      expect(repetitions.size).toBe(repetitionByRisk.get(riskClass));
    }
    expect(Object.fromEntries(repetitionByRisk)).toEqual({
      critical: 30,
      'high-assurance': 100,
      ordinary: 10,
    });

    expect(
      new Set(
        AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG.map(
          ({ category }) => category
        )
      )
    ).toEqual(
      new Set([
        'structure-schema',
        'target-action-authority',
        'g3-plan-closure',
        'security-injection',
        'repair-recovery',
        'context-media-fidelity',
        'hosted-retrieval-concurrency',
        'stability-usage-cost',
        'human-visual-quality',
      ])
    );
    const metricIds = new Set(
      AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG.map(({ metricId }) => metricId)
    );
    expect(
      [
        'output.strict-schema-validity',
        'tool.dynamic-expansion-correctness',
        'transaction.atomic-authority',
        'verification.plan-authority',
        'verification.closure-authority',
        'security.injection-follow-rate',
        'security.cache-state-mismatch-rate',
        'repair.success-rate',
        'recovery.reconciliation-correctness',
        'context.transform-fidelity',
        'media.representation-robustness',
        'retrieval.stale-source-handling',
        'parallel.conflict-cancel-correctness',
        'sampling.variance-bound-compliance',
        'sampling.confidence-upper-bound-compliance',
        'invocation.count-receipt-completeness',
        'tool.count-receipt-completeness',
        'usage.logical-billable-cache-accounting',
        'cost.actual-distribution-completeness',
        'visual.human-quality',
        'visual.information-hierarchy-quality',
        'visual.usability-quality',
      ].every((metricId) => metricIds.has(metricId))
    ).toBe(true);
    expect(plan.thresholds.metrics).toHaveLength(
      AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG.filter(
        ({ releaseBlocking }) => releaseBlocking
      ).length
    );
    expect(
      plan.thresholds.metrics.every(
        ({
          requiredAuthority,
          maximumObservedFailureRate,
          minimumSampleCount,
        }) =>
          ['deterministic', 'human'].includes(requiredAuthority) &&
          maximumObservedFailureRate.length > 0 &&
          minimumSampleCount > 0
      )
    ).toBe(true);
    expect(
      plan.thresholds.metrics.some(
        ({ metricId, requiredAuthority }) =>
          metricId === 'visual.human-quality' && requiredAuthority === 'human'
      )
    ).toBe(true);
    expect(
      plan.thresholds.metrics.some(
        ({ metricId }) => metricId === 'auxiliary.explanation-quality'
      )
    ).toBe(false);
    expect(plan.graderPlan.graders.map(({ kind }) => kind)).toEqual([
      'model-judge',
      'blind-human-rubric',
      'deterministic-rule',
      'domain-dry-run',
      'g3-closure',
      'perceptual-metric',
      'strict-decoder',
    ]);
    expect(plan.graderPlan.auxiliaryJudgeGraderIds).toEqual([
      'grader.release.auxiliary-model-judge',
    ]);
    expect(plan.graderPlan.blindHumanGraderIds).toEqual([
      'grader.release.blind-human-rubric',
    ]);
    expect(plan.thresholds.slicePolicyDigest).toBe(
      digestAgentCanonicalValue({
        metricCatalogDigest: AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST,
        slicePolicyDigest: input.policyDigests.slicePolicyDigest,
      })
    );
  }, 30_000);

  it('is byte-stable when caller ordering changes', () => {
    const input = createInput();
    const first = createAgentProductionReleaseEvaluationPlan(input);
    const reordered = createAgentProductionReleaseEvaluationPlan({
      ...input,
      nativeIdentities: Object.freeze([...input.nativeIdentities].reverse()),
    });

    expect(reordered).toEqual(first);
    expect(reordered.planDigest).toBe(first.planDigest);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.providerConfigurations)).toBe(true);
  }, 30_000);

  it('keeps tracked probe programs separate from 18 admissions and 15 registered runtime owners', () => {
    const input = createInput();
    const profileId = 'g4-provider-background-job' as const;
    const supplied =
      input.qualificationAuthorityBundle.runtimeFactSourceAuthorities[
        'openai-responses'
      ][profileId];
    const { authorityDigest: _authorityDigest, ...sourceInput } = supplied;
    const swapped = createAgentEvaluationRuntimeFactSourceAuthority({
      ...sourceInput,
      sourceAuthorityId: 'runtime-source.release.openai-responses.swapped',
      sourceAuthorityImplementationDigest: digest(
        'openai-responses.background.runtime-owner-swapped'
      ),
    });
    const swappedBundle =
      createAgentProductionEvaluationQualificationAuthorityBundle({
        capabilityProbeAuthorities:
          input.qualificationAuthorityBundle.capabilityProbeAuthorities,
        runtimeFactSourceAuthorities: Object.freeze({
          ...input.qualificationAuthorityBundle.runtimeFactSourceAuthorities,
          'openai-responses': Object.freeze({
            ...input.qualificationAuthorityBundle.runtimeFactSourceAuthorities[
              'openai-responses'
            ],
            [profileId]: swapped,
          }),
        }),
        providerResourceCleanupReceipts:
          input.qualificationAuthorityBundle.providerResourceCleanupReceipts,
      });
    expect(() =>
      createAgentProductionReleaseEvaluationPlan(
        Object.freeze({
          ...input,
          qualificationAuthorityBundle: swappedBundle,
        })
      )
    ).toThrow(/registered provider\/model\/profile route/u);

    const hostedProfileId = 'g4-provider-hosted-retrieval-core' as const;
    const hostedSupplied =
      input.qualificationAuthorityBundle.runtimeFactSourceAuthorities[
        'openai-responses'
      ][hostedProfileId];
    const { authorityDigest: _hostedAuthorityDigest, ...hostedSourceInput } =
      hostedSupplied;
    const foreignIntentDigest = digest('foreign-hosted-registration-intent');
    const foreignIntentSource = createAgentEvaluationRuntimeFactSourceAuthority(
      {
        ...hostedSourceInput,
        hostedRetrievalRuntimeResourceRegistrationIntentDigest:
          foreignIntentDigest,
      }
    );
    const foreignIntentBundle =
      createAgentProductionEvaluationQualificationAuthorityBundle({
        capabilityProbeAuthorities:
          input.qualificationAuthorityBundle.capabilityProbeAuthorities,
        runtimeFactSourceAuthorities: Object.freeze({
          ...input.qualificationAuthorityBundle.runtimeFactSourceAuthorities,
          'openai-responses': Object.freeze({
            ...input.qualificationAuthorityBundle.runtimeFactSourceAuthorities[
              'openai-responses'
            ],
            [hostedProfileId]: foreignIntentSource,
          }),
        }),
        providerResourceCleanupReceipts:
          input.qualificationAuthorityBundle.providerResourceCleanupReceipts,
      });
    const foreignIntentIdentities = Object.freeze(
      input.nativeIdentities.map((identity) =>
        identity.protocolFamily === 'openai-responses'
          ? Object.freeze({
              ...identity,
              expectedRuntimeFactSourceIdentities: Object.freeze({
                ...identity.expectedRuntimeFactSourceIdentities,
                [hostedProfileId]:
                  createAgentProductionEvaluationRuntimeFactSourceIdentity({
                    ...identity.expectedRuntimeFactSourceIdentities[
                      hostedProfileId
                    ],
                    hostedRetrievalRuntimeResourceRegistrationIntentDigest:
                      foreignIntentDigest,
                  }),
              }),
            })
          : identity
      )
    );
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        nativeIdentities: foreignIntentIdentities,
        qualificationAuthorityBundle: foreignIntentBundle,
      })
    ).toThrow(/registered provider\/model\/profile route/u);

    expect(() =>
      createAgentEvaluationRuntimeFactSourceAuthority({
        ...sourceInput,
        sourceKind: 'sealed-hosted-owner-result',
      })
    ).toThrow(/invalid or unbounded/u);

    expect(() =>
      createAgentProductionReleaseEvaluationPlan(
        Object.freeze({
          ...input,
          nativeIdentities: Object.freeze(
            input.nativeIdentities.map((identity, index) =>
              index === 0
                ? Object.freeze({
                    ...identity,
                    capabilityProbeAuthorities:
                      input.qualificationAuthorityBundle
                        .capabilityProbeAuthorities[identity.protocolFamily],
                  })
                : identity
            )
          ),
        }) as AgentProductionReleaseEvaluationPlanInput
      )
    ).toThrow(/contains sealed qualification authority state/u);

    expect(() =>
      createAgentProductionReleaseEvaluationPlan(
        Object.freeze({
          ...input,
          nativeIdentities: Object.freeze(
            input.nativeIdentities.map((identity, index) =>
              index === 0
                ? Object.freeze({
                    ...identity,
                    capabilityProbeProviderResourceAuthorities:
                      identity.protocolFamily === 'anthropic-messages'
                        ? Object.freeze({})
                        : input.probeProviderResourceAuthorityBundle
                            .authorities[identity.protocolFamily],
                  })
                : identity
            )
          ),
        }) as AgentProductionReleaseEvaluationPlanInput
      )
    ).toThrow(/contains sealed qualification authority state/u);
  }, 30_000);

  it('freezes fresh pre-plan retrieval resources outside tracked identities', () => {
    const input = createInput();
    const protocolFamily = 'openai-responses' as const;
    const profileId = 'g4-provider-hosted-retrieval-core' as const;
    const identity = input.nativeIdentities.find(
      (candidate) => candidate.protocolFamily === protocolFamily
    )!;
    const existing =
      input.probeProviderResourceAuthorityBundle.authorities[protocolFamily][
        profileId
      ];
    const {
      format: _format,
      version: _version,
      capabilityProfileId: _capabilityProfileId,
      probeProgramDigest: _probeProgramDigest,
      publicResourceDescriptorDigest: _publicResourceDescriptorDigest,
      providerResourceKind: _providerResourceKind,
      authorityDigest: _authorityDigest,
      ...resourceInput
    } = existing;
    const existingDeletion =
      input.probeProviderResourceAuthorityBundle.deletionAuthorityReceipts[
        protocolFamily
      ][profileId];
    const existingCleanup =
      input.probeProviderResourceAuthorityBundle.cleanupReceipts[
        protocolFamily
      ][profileId];
    const staleDeletion =
      createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
        resourceManifestDigest: existing.resourceManifestDigest,
        deletionRequestProjection: existingDeletion.deletionRequestProjection,
        registeredAt: '2026-08-06T00:00:00.000Z',
        expiresAt: '2026-08-07T22:00:00.000Z',
      });
    const stale = createAgentCapabilityProbeProviderResourceAuthority(
      identity.capabilityProbePrograms[profileId],
      {
        ...resourceInput,
        deletionAuthorityReceiptDigest:
          staleDeletion.deletionAuthorityReceiptDigest,
        registeredAt: '2026-08-06T00:00:00.000Z',
        expiresAt: '2026-08-07T22:00:00.000Z',
      }
    );
    const staleCleanup =
      createAgentCapabilityProbeProviderResourceCleanupReceipt({
        deletionAuthorityReceipt: staleDeletion,
        resourceResults: existingCleanup.resourceResults,
      });
    const staleBundle =
      createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
        authorities: Object.freeze({
          ...input.probeProviderResourceAuthorityBundle.authorities,
          [protocolFamily]: Object.freeze({
            ...input.probeProviderResourceAuthorityBundle.authorities[
              protocolFamily
            ],
            [profileId]: stale,
          }),
        }),
        deletionAuthorityReceipts: Object.freeze({
          ...input.probeProviderResourceAuthorityBundle
            .deletionAuthorityReceipts,
          [protocolFamily]: Object.freeze({
            ...input.probeProviderResourceAuthorityBundle
              .deletionAuthorityReceipts[protocolFamily],
            [profileId]: staleDeletion,
          }),
        }),
        cleanupReceipts: Object.freeze({
          ...input.probeProviderResourceAuthorityBundle.cleanupReceipts,
          [protocolFamily]: Object.freeze({
            ...input.probeProviderResourceAuthorityBundle.cleanupReceipts[
              protocolFamily
            ],
            [profileId]: staleCleanup,
          }),
        }),
      });
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        probeProviderResourceAuthorityBundle: staleBundle,
      })
    ).toThrow(/provider-resource cleanup roots drifted/u);

    expect(() =>
      createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
        authorities: Object.freeze({
          ...input.probeProviderResourceAuthorityBundle.authorities,
          [protocolFamily]: Object.freeze({
            ...input.probeProviderResourceAuthorityBundle.authorities[
              protocolFamily
            ],
            [profileId]:
              input.probeProviderResourceAuthorityBundle.authorities[
                'gemini-interactions'
              ][profileId],
          }),
        }),
        deletionAuthorityReceipts:
          input.probeProviderResourceAuthorityBundle.deletionAuthorityReceipts,
        cleanupReceipts:
          input.probeProviderResourceAuthorityBundle.cleanupReceipts,
      })
    ).toThrow(/resource authority bundle is invalid/u);
  }, 30_000);

  it('rejects one recomputed target bundle swap against the plan-wide 18 plus 15 root', () => {
    const plan = createAgentProductionReleaseEvaluationPlan(createInput());
    const targetIndex = plan.capabilityQualificationTargets.findIndex(
      ({ capabilityProfileId, protocolFamily }) =>
        capabilityProfileId === 'g4-provider-background-job' &&
        protocolFamily === 'openai-responses'
    );
    const target = plan.capabilityQualificationTargets[targetIndex]!;
    const supplied = target.optionalCapabilitySupportAuthority!;
    const { authorityDigest: _authorityDigest, ...authorityInput } = supplied;
    const swappedAuthority =
      createAgentEvaluationOptionalCapabilitySupportAuthority({
        ...authorityInput,
        qualificationAuthorityBundleDigest: digest(
          'swapped-qualification-authority-bundle'
        ),
      });
    const { targetDigest: _targetDigest, ...targetInput } = target;
    const swappedTarget = createAgentCapabilityQualificationTarget({
      ...targetInput,
      qualificationSliceDigest: digest(
        'swapped-qualification-slice-recomputed'
      ),
      optionalCapabilitySupportAuthority: swappedAuthority,
    });
    const targets = Object.freeze(
      plan.capabilityQualificationTargets.map((entry, index) =>
        index === targetIndex ? swappedTarget : entry
      )
    );
    expect(() =>
      resolveAgentProductionEvaluationQualificationAuthorityBundleFromPlan({
        capabilityQualificationTargets: targets,
      })
    ).toThrow(/bundle digest drifted across optional targets/u);
  }, 30_000);

  it('rejects every unsealed, stale, swapped, or digest-tampered production probe authority', () => {
    const cases: readonly Readonly<{
      name: string;
      transform: (
        evidence: AgentEvaluationProductionCapabilityProbeEvidence
      ) => unknown;
    }>[] = Object.freeze([
      Object.freeze({ name: 'missing authority', transform: () => undefined }),
      Object.freeze({
        name: 'direct deterministic receipt',
        transform: (
          evidence: AgentEvaluationProductionCapabilityProbeEvidence
        ) => evidence.receipt,
      }),
      Object.freeze({
        name: 'inconclusive status',
        transform: (
          evidence: AgentEvaluationProductionCapabilityProbeEvidence
        ) =>
          rebuiltProbeEvidence(evidence, {
            status: 'inconclusive',
            observedProfileDigest: null,
            probedCapabilityDigest: digestAgentCanonicalValue({
              observedLimitDigest: evidence.receipt.observedLimitDigest,
              observedProfileDigest: null,
              status: 'inconclusive',
            }),
          }),
      }),
      Object.freeze({
        name: 'expired probe',
        transform: (
          evidence: AgentEvaluationProductionCapabilityProbeEvidence
        ) =>
          rebuiltProbeEvidence(evidence, {
            expiresAt: '2026-08-10T00:00:00.000Z',
          }),
      }),
      ...(
        [
          'providerConfigurationDigest',
          'modelLineageDigest',
          'requestedProfileDigest',
          'declaredCapabilityDigest',
          'probedCapabilityDigest',
          'observedLimitDigest',
        ] as const
      ).map((field) =>
        Object.freeze({
          name: `${field} swap`,
          transform: (
            evidence: AgentEvaluationProductionCapabilityProbeEvidence
          ) =>
            rebuiltProbeEvidence(evidence, {
              [field]: digest(`swapped.${field}`),
            }),
        })
      ),
      Object.freeze({
        name: 'evidence digest tamper',
        transform: (
          evidence: AgentEvaluationProductionCapabilityProbeEvidence
        ) =>
          Object.freeze({
            ...evidence,
            evidenceDigest: digest('tampered.evidence-digest'),
          }),
      }),
      Object.freeze({
        name: 'receipt self digest tamper',
        transform: (
          evidence: AgentEvaluationProductionCapabilityProbeEvidence
        ) =>
          Object.freeze({
            ...evidence,
            receipt: Object.freeze({
              ...evidence.receipt,
              receiptDigest: digest('tampered.receipt-digest'),
            }),
          }),
      }),
    ]);

    for (const entry of cases) {
      expect(
        () =>
          createAgentProductionReleaseEvaluationPlan(
            withOpenAiBackgroundProbe(createInput(), entry.transform)
          ),
        entry.name
      ).toThrow();
    }
  }, 30_000);

  it('rejects a required-to-blocked swap after target and plan digests are recomputed and round-tripped', () => {
    const plan = createAgentProductionReleaseEvaluationPlan(createInput());
    const target = plan.capabilityQualificationTargets.find(
      ({ protocolFamily, capabilityProfileId }) =>
        protocolFamily === 'openai-responses' &&
        capabilityProfileId === 'g4-provider-background-job'
    )!;
    const authority = target.optionalCapabilitySupportAuthority!;
    expect(authority.supportExpectation).toBe('required');
    const blockedDescriptor = createAgentEvaluationCapabilityDescriptor({
      capabilityId: authority.capabilityId,
      supportExpectation: 'expected-blocked',
      expectedToolIds: Object.freeze([]),
      expectedReceiptKinds: Object.freeze(['capability-unavailable-receipt']),
    });
    const { authorityDigest: _authorityDigest, ...authorityInput } = authority;
    const forgedAuthorityBase = Object.freeze({
      ...authorityInput,
      supportExpectation: 'expected-blocked' as const,
      resolvedCapabilityDescriptor: blockedDescriptor,
    });
    const forgedAuthority = Object.freeze({
      ...forgedAuthorityBase,
      authorityDigest: digestAgentCanonicalValue(forgedAuthorityBase),
    });
    const { targetDigest: _targetDigest, ...targetInput } = target;
    const forgedTargetBase = Object.freeze({
      ...targetInput,
      optionalCapabilitySupportAuthority: forgedAuthority,
    });
    const forgedTarget = Object.freeze({
      ...forgedTargetBase,
      targetDigest: digestAgentCanonicalValue(forgedTargetBase),
    });
    const { planDigest: _planDigest, ...planInput } = plan;
    const forgedPlanBase = Object.freeze({
      ...planInput,
      capabilityQualificationTargets: Object.freeze(
        plan.capabilityQualificationTargets.map((candidate) =>
          candidate.targetId === target.targetId ? forgedTarget : candidate
        )
      ),
    });
    const forgedPlan = Object.freeze({
      ...forgedPlanBase,
      planDigest: digestAgentCanonicalValue(forgedPlanBase),
    });
    const decoded = JSON.parse(JSON.stringify(forgedPlan)) as typeof plan;
    expect(validateAgentModelEvaluationPlan(decoded)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI-9001',
          message: expect.stringMatching(/support authority|probe/u),
        }),
      ])
    );
  }, 30_000);

  it('rejects native endpoint smoke lineage or inference drift', () => {
    const plan = createAgentProductionReleaseEvaluationPlan(createInput());
    const nativeSmoke = plan.endpointSmokeTargets.find(
      ({ protocolFamily }) => protocolFamily === 'openai-responses'
    )!;
    const { targetDigest: _targetDigest, ...smokeInput } = nativeSmoke;
    const driftedSmoke = createAgentEvaluationEndpointSmokeTarget({
      ...smokeInput,
      inferenceConfigurationDigest: digest('drifted-smoke-inference'),
    });
    const issues = validateAgentModelEvaluationPlan({
      ...plan,
      endpointSmokeTargets: plan.endpointSmokeTargets.map((target) =>
        target.smokeTargetId === nativeSmoke.smokeTargetId
          ? driftedSmoke
          : target
      ),
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI-6010',
          path: `/endpointSmokeTargets/${nativeSmoke.smokeTargetId}`,
        }),
      ])
    );
  }, 30_000);

  it('rejects mutable or diversity-laundered identities and corpus drift', () => {
    const input = createInput();
    expect(AGENT_PRODUCTION_EVALUATION_CANONICAL_CASE_SET_DIGEST).toBe(
      input.materialCatalogDigests.caseSetDigest
    );
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        repositoryCommit: 'main',
      })
    ).toThrow(/exact lowercase 40-hex/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        endpointSmokeResponseSpoolEncryptionPolicyDigest: 'unfrozen',
      })
    ).toThrow(/canonical digest/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        materialCatalogDigests: {
          ...input.materialCatalogDigests,
          caseSetDigest: digest('drifted-case-set'),
        },
      })
    ).toThrow(/canonical 128-case set/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        nativeIdentities: input.nativeIdentities.map((identity, index) =>
          index === 1
            ? {
                ...identity,
                model: {
                  ...identity.model,
                  modelFamilyOwnerId:
                    input.nativeIdentities[0]!.model.modelFamilyOwnerId,
                },
              }
            : identity
        ),
      })
    ).toThrow(/independent/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        nativeIdentities: input.nativeIdentities.map((identity, index) =>
          index === 0
            ? {
                ...identity,
                model: { ...identity.model, immutableVersion: 'latest' },
              }
            : identity
        ),
      })
    ).toThrow(/immutable public version/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        nativeIdentities: input.nativeIdentities.map((identity, index) =>
          index === 0
            ? {
                ...identity,
                model: {
                  ...identity.model,
                  immutableVersion:
                    'different-openai-transport-model.2026-08-08',
                },
              }
            : identity
        ),
      })
    ).toThrow(/same exact transport identity/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        compatibilitySmokes: {
          ...input.compatibilitySmokes,
          hosted: {
            ...input.compatibilitySmokes.hosted,
            immutableModelVersion: 'latest',
          },
        },
      })
    ).toThrow(/immutable public version/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        compatibilitySmokes: {
          ...input.compatibilitySmokes,
          hosted: {
            ...input.compatibilitySmokes.hosted,
            immutableModelVersion:
              'different-hosted-compatible-model.2026-08-08',
          },
        },
      })
    ).toThrow(/one exact model identity/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        compatibilitySmokes: {
          ...input.compatibilitySmokes,
          hosted: {
            ...input.compatibilitySmokes.hosted,
            pricingAuthorityDigest: 'runtime-price-page',
          },
        },
      })
    ).toThrow(/canonical digest/u);
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        auxiliaryJudge: {
          ...input.auxiliaryJudge,
          modelFamilyOwnerId:
            input.nativeIdentities[0]!.model.modelFamilyOwnerId,
        },
      })
    ).toThrow(/independent/u);
    const { budgetDigest: _budgetDigest, ...budgetInput } = input.budget;
    expect(() =>
      createAgentProductionReleaseEvaluationPlan({
        ...input,
        budget: createAgentModelEvaluationBudget({
          ...budgetInput,
          budget: Object.freeze({
            ...budgetInput.budget,
            maxRepairRounds: 0,
          }),
        }),
      })
    ).toThrow(/structural demand floor/u);
  });

  it('rejects every recomputed journey denominator outside exact 14,040', () => {
    const plan = createAgentProductionReleaseEvaluationPlan(createInput());
    const { planDigest: _planDigest, ...planBase } = plan;
    void _planDigest;
    for (const plannedJourneyCount of [13_200, 14_039, 14_041]) {
      const driftedBase = Object.freeze({ ...planBase, plannedJourneyCount });
      const drifted = Object.freeze({
        ...driftedBase,
        planDigest: digestAgentCanonicalValue(driftedBase),
      });
      expect(() =>
        assertAgentProductionReleaseEvaluationPlanComposition(drifted)
      ).toThrow(/release matrix drifted/u);
    }
  }, 30_000);
});
