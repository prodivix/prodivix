import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

import {
  AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
  createAgentCapabilityQualificationTarget,
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgramReceipt,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  createAgentCapabilityProbeSupportedSemanticProof,
  createAgentCapabilityProbeNormalizedObservationSourceProjection,
  projectAgentCapabilityProbeSemanticProofPhaseLeaves,
  createAgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  createAgentEvaluationCapabilityProbeAdmissionResponse,
  createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  createAgentEvaluationCapabilityProbeReferenceArchiveRecord,
  createAgentEvaluationRuntimeFactSourceRegistrationReceipt,
  createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  createAgentEvaluationCapabilityDescriptor,
  createAgentEvaluationEndpointSmokeTarget,
  createAgentEvaluationOptionalCapabilitySupportAuthority,
  createAgentEvaluationQualificationAuthorityBundleCommitment,
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentEvaluationGraderPlan,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationRepetitionPolicy,
  createAgentHoldoutExecutionReceipt,
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
  createAgentEvaluationValidatedHumanReviewArtifact,
  createAgentEvaluationValidatedHumanMetricObservation,
  createAgentModelEvaluationAttempt,
  createAgentModelEvaluationBudget,
  createAgentModelEvaluationPlan,
  createAgentModelEvaluationThresholds,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
  createAgentModelLineage,
  createAgentQualificationSliceDigest,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES,
  planAgentModelEvaluationAttempts,
  resolveAgentModelEvaluationHostedRuntimeBudgetFloor,
  type AgentCapabilityQualificationTarget,
  type AgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  type AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  type AgentEvaluationCapabilityProbeReferenceArchiveRecord,
  type AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  type AgentEvaluationGraderReport,
  type AgentEvaluationHumanReviewImport,
  type AgentEvaluationHumanReviewTrustAuthority,
  type AgentEvaluationMetricReport,
  type AgentEvaluationValidatedHumanMetricObservation,
  type AgentEvaluationValidatedHumanReviewArtifact,
  type AgentEvaluationPublicReviewRubric,
  type AgentHoldoutExecutionReceipt,
  type AgentHumanReviewReport,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentProviderProtocolFamily,
  type CanonicalDigest,
  type Instant,
} from '../index';

const V8_REVIEW_CRITERION_IDS = Object.freeze([
  'composition-and-hierarchy',
  'finish-and-consistency',
  'legibility-and-contrast',
]);

const V8_REVIEW_PUBLIC_KEY = `${'B'.repeat(42)}A`;
const V8_REVIEW_SIGNATURE = 'A'.repeat(86);

export const createV8PublicReviewRubric =
  (): AgentEvaluationPublicReviewRubric => {
    const criterion = (criterionId: string) =>
      Object.freeze({
        criterionId,
        label: criterionId,
        instruction: `Apply the frozen ${criterionId} criterion.`,
        required: true,
        anchors: Object.freeze([
          Object.freeze({
            verdict: 'failed' as const,
            label: 'Failed',
            description: `The raster fails ${criterionId}.`,
          }),
          Object.freeze({
            verdict: 'passed' as const,
            label: 'Passed',
            description: `The raster passes ${criterionId}.`,
          }),
        ]),
      });
    const base = Object.freeze({
      format: 'prodivix.g4-public-human-review-rubric' as const,
      version: 1 as const,
      rubricId: 'rubric.g4-v8.visual-quality',
      title: 'G4 V8 visual quality',
      criteria: Object.freeze(V8_REVIEW_CRITERION_IDS.map(criterion)),
      metricMappings: Object.freeze([
        Object.freeze({
          metricId: 'visual.human-quality',
          criterionIds: V8_REVIEW_CRITERION_IDS,
          aggregation: 'all-pass' as const,
        }),
        Object.freeze({
          metricId: 'visual.information-hierarchy-quality',
          criterionIds: Object.freeze(['composition-and-hierarchy']),
          aggregation: 'all-pass' as const,
        }),
        Object.freeze({
          metricId: 'visual.usability-quality',
          criterionIds: Object.freeze(['legibility-and-contrast']),
          aggregation: 'all-pass' as const,
        }),
      ]),
      interRaterDisagreementMetricId: 'visual.inter-rater-disagreement',
      scale: 'binary-pass-fail' as const,
      accessibilityInstructions: Object.freeze([
        'Evaluate only the supplied raster.',
      ]),
    });
    return Object.freeze({
      ...base,
      rubricDigest: digestAgentCanonicalValue(base),
    });
  };

export const V8_TIME = Object.freeze({
  planned: '2026-08-02T00:00:00.000Z',
  started: '2026-08-02T01:00:00.000Z',
  completed: '2026-08-02T02:00:00.000Z',
  evaluated: '2026-08-02T03:00:00.000Z',
  expires: '2026-08-09T00:00:00.000Z',
});

const providerSpec = (
  family: AgentProviderProtocolFamily,
  operator: string,
  owner: string
) => {
  const modelId = `model.${family}.v8`;
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: `adapter.${family}.v8`,
    adapterVersion: '1.0.0',
    protocolFamily: family,
    transportSchemaDigest: digestAgentCanonicalValue({ family, version: 1 }),
    eventNormalizationDigest: digestAgentCanonicalValue({
      normalized: 'agent-provider-event-v1',
    }),
  });
  const dataPolicy = createAgentProviderDataPolicy({
    region: 'evaluation-region',
    maximumSensitivity: 'internal',
    training: 'disabled',
    telemetry: 'disabled',
    retentionDays: 0,
    deletionReceipt: 'available',
    ambientMemory: 'disabled',
    storage: 'disabled',
    cacheIsolation: 'invocation',
  });
  const provider = createAgentProviderConfigurationIdentity({
    providerConfigurationId: `provider.${family}.v8`,
    providerOperatorId: operator,
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue({ family, endpoint: 1 }),
    providerRegion: 'evaluation-region',
    apiRevision: '2026-08-02',
    adapter,
    dataPolicyDigest: dataPolicy.policyDigest,
  });
  const model = createAgentModelLineage({
    modelId,
    modelFamilyId: `family.${family}.v8`,
    modelFamilyOwnerId: owner,
    immutableVersion: modelId,
  });
  return Object.freeze({ adapter, dataPolicy, provider, model });
};

export const V8_NATIVE_CONFIGURATIONS = Object.freeze([
  providerSpec('openai-responses', 'operator.openai.v8', 'owner.openai.v8'),
  providerSpec(
    'anthropic-messages',
    'operator.anthropic.v8',
    'owner.anthropic.v8'
  ),
  providerSpec('gemini-interactions', 'operator.google.v8', 'owner.google.v8'),
]);

const policyDigest = digestAgentCanonicalValue('g4-v8-policy');
const endpointSmokeResponseSpoolEncryptionPolicyDigest =
  digestAgentCanonicalValue('g4-v8-endpoint-smoke-response-spool-encryption');
const profileIds = Object.freeze([
  'g4-core-text-tools',
  'g4-document-input',
  'g4-visual-input',
]);

export const V8_OPTIONAL_SUPPORTED_PROFILES_BY_PROTOCOL = Object.freeze({
  'openai-responses': Object.freeze([
    'g4-provider-background-job',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-parallel-tool',
  ]),
  'anthropic-messages': Object.freeze([
    'g4-provider-isolated-cache',
    'g4-provider-parallel-tool',
  ]),
  'gemini-interactions': Object.freeze([
    'g4-provider-hosted-retrieval-core',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-parallel-tool',
    'g4-provider-isolated-cache',
    'g4-provider-reasoning-continuation',
  ]),
} as const);

export const isV8OptionalCapabilitySupported = (
  protocolFamily: keyof typeof V8_OPTIONAL_SUPPORTED_PROFILES_BY_PROTOCOL,
  capabilityProfileId: string
): boolean =>
  V8_OPTIONAL_SUPPORTED_PROFILES_BY_PROTOCOL[protocolFamily].some(
    (candidate) => candidate === capabilityProfileId
  );

const capabilityProfileDigest = (profileId: string) =>
  digestAgentCanonicalValue({ profileId });

const declaredCapabilityProfileDigests = Object.freeze(
  [
    ...profileIds,
    ...G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES.map(
      ({ capabilityProfileId }) => capabilityProfileId
    ),
  ]
    .map(capabilityProfileDigest)
    .sort(compareUnicodeCodePoints)
);

const V8_PROBE_OBSERVED_AT = '2026-08-01T23:00:00.000Z' as const;
const V8_PROBE_EXPIRES_AT = '2026-08-09T00:00:00.000Z' as const;
const V8_REPOSITORY_COMMIT =
  '0123456789abcdef0123456789abcdef01234567' as const;
const V8_PROBE_REFERENCE_KINDS = Object.freeze([
  'probe-request',
  'probe-response',
  'dispatch',
  'transport',
  'encrypted-response-spool',
  'normalized-event-set',
] as const);
const V8_PROBE_REFERENCE_FORMATS = Object.freeze([
  'prodivix.agent-evaluation-capability-probe-request',
  'prodivix.agent-evaluation-capability-probe-response',
  'prodivix.agent-evaluation-capability-probe-dispatch-receipt',
  'prodivix.agent-evaluation-capability-probe-transport-receipt',
  'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt',
  'prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt',
] as const);

type V8OptionalCapabilitySlice =
  (typeof G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES)[number];
type V8NativeConfiguration = (typeof V8_NATIVE_CONFIGURATIONS)[number];

export const createV8CapabilityProbeArchiveAuthority = (input: {
  provider: V8NativeConfiguration['provider'];
  model: V8NativeConfiguration['model'];
  slice: V8OptionalCapabilitySlice;
  profileDigest: string;
  supported: boolean;
  declaredCapabilityProfileDigests?: readonly CanonicalDigest[];
  observedAt?: Instant;
  expiresAt?: Instant;
  repositoryCommit?: string;
  namespaceId?: string;
}): Readonly<{
  probeEvidence: ReturnType<
    typeof createAgentEvaluationProductionCapabilityProbeEvidence
  >;
  probeProviderResourceAuthority: ReturnType<
    typeof createAgentCapabilityProbeProviderResourceAuthority
  > | null;
  probeProviderResourceDeletionAuthorityReceipt: ReturnType<
    typeof createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt
  > | null;
  probeProviderResourceCleanupReceipt: ReturnType<
    typeof createAgentCapabilityProbeProviderResourceCleanupReceipt
  > | null;
  probeProviderResourceCleanupArchiveRecord: AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord | null;
  admission: AgentEvaluationCapabilityProbeAdmissionArchiveRecord;
  references: readonly AgentEvaluationCapabilityProbeReferenceArchiveRecord[];
}> => {
  const { provider, model, slice, profileDigest, supported } = input;
  const observedAt = input.observedAt ?? V8_PROBE_OBSERVED_AT;
  const expiresAt = input.expiresAt ?? V8_PROBE_EXPIRES_AT;
  const repositoryCommit = input.repositoryCommit ?? V8_REPOSITORY_COMMIT;
  const namespaceId = input.namespaceId ?? 'namespace.v8.release';
  const declaredProfileDigests =
    input.declaredCapabilityProfileDigests ?? declaredCapabilityProfileDigests;
  const shiftedInstant = (milliseconds: number): Instant =>
    new Date(Date.parse(observedAt) + milliseconds).toISOString() as Instant;
  const status = supported ? ('supported' as const) : ('unsupported' as const);
  const probeId = `probe.v8.${provider.adapter.protocolFamily}.${slice.capabilityProfileId}`;
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: slice.capabilityProfileId,
    capabilityProfileDigest: profileDigest,
  });
  const resourceLifecycle =
    slice.capabilityId === 'provider.hosted-retrieval' &&
    (provider.adapter.protocolFamily === 'openai-responses' ||
      provider.adapter.protocolFamily === 'gemini-interactions')
      ? (() => {
          const protocolFamily = provider.adapter.protocolFamily;
          const providerResourceId = `probe-resource.${protocolFamily}.${slice.capabilityProfileId}`;
          const resourceManifestDigest = digestAgentCanonicalValue({
            providerConfigurationId: provider.providerConfigurationId,
            capabilityProfileId: slice.capabilityProfileId,
            authority: 'v8-resource-manifest',
          });
          const auxiliaryResourceIds = Object.freeze(
            protocolFamily === 'openai-responses'
              ? [`probe-file.${protocolFamily}.${slice.capabilityProfileId}`]
              : []
          );
          const deletionRequestProjection =
            createAgentCapabilityProbeProviderResourceDeletionRequestProjection(
              {
                requestDigest: digestAgentCanonicalValue({
                  providerConfigurationId: provider.providerConfigurationId,
                  capabilityProfileId: slice.capabilityProfileId,
                  authority: 'v8-resource-registration-request',
                }),
                protocolFamily,
                providerResourceId,
                auxiliaryResourceIds,
              }
            );
          const deletionAuthorityReceipt =
            createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
              resourceManifestDigest,
              deletionRequestProjection,
              registeredAt: observedAt,
              expiresAt,
            });
          const authority = createAgentCapabilityProbeProviderResourceAuthority(
            probeProgram,
            {
              protocolFamily,
              providerConfigurationId: provider.providerConfigurationId,
              modelId: model.modelId,
              modelLineageDigest: model.lineageDigest,
              adapterDigest: provider.adapter.adapterDigest,
              providerResourceId,
              resourceManifestDigest,
              contentUploadReceiptDigest: digestAgentCanonicalValue({
                providerConfigurationId: provider.providerConfigurationId,
                capabilityProfileId: slice.capabilityProfileId,
                authority: 'v8-content-upload',
              }),
              deletionAuthorityReceiptDigest:
                deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
              registeredAt: observedAt,
              expiresAt,
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
                    dispatchIntentDigest: digestAgentCanonicalValue({
                      providerConfigurationId: provider.providerConfigurationId,
                      capabilityProfileId: slice.capabilityProfileId,
                      authority: 'v8-resource-cleanup-primary-dispatch',
                    }),
                    transportReceiptDigest: digestAgentCanonicalValue({
                      providerConfigurationId: provider.providerConfigurationId,
                      capabilityProfileId: slice.capabilityProfileId,
                      authority: 'v8-resource-cleanup-primary-transport',
                    }),
                    completedAt: shiftedInstant(60_000),
                  }
                ),
                ...auxiliaryResourceIds.map((resourceId) =>
                  createAgentCapabilityProbeProviderResourceCleanupResourceResult(
                    {
                      resourceId,
                      resourceRole: 'auxiliary',
                      outcome: 'deleted',
                      dispatchIntentDigest: digestAgentCanonicalValue({
                        providerConfigurationId:
                          provider.providerConfigurationId,
                        capabilityProfileId: slice.capabilityProfileId,
                        resourceId,
                        authority: 'v8-resource-cleanup-auxiliary-dispatch',
                      }),
                      transportReceiptDigest: digestAgentCanonicalValue({
                        providerConfigurationId:
                          provider.providerConfigurationId,
                        capabilityProfileId: slice.capabilityProfileId,
                        resourceId,
                        authority: 'v8-resource-cleanup-auxiliary-transport',
                      }),
                      completedAt: shiftedInstant(61_000),
                    }
                  )
                ),
              ]),
            });
          return Object.freeze({
            authority,
            deletionAuthorityReceipt,
            cleanupReceipt,
          });
        })()
      : null;
  const probeProviderResourceAuthority = resourceLifecycle?.authority ?? null;
  const ownerImplementationDigest = digestAgentCanonicalValue({
    owner: 'v8-fixture-probe',
    protocolFamily: provider.adapter.protocolFamily,
  });
  const probeProviderResourceCleanupArchiveRecord = resourceLifecycle
    ? (() => {
        const cleanupRequest =
          createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
            repositoryCommit,
            resourceRegistrationRequestDigest:
              resourceLifecycle.cleanupReceipt.requestDigest,
            deletionAuthorityReceiptDigest:
              resourceLifecycle.deletionAuthorityReceipt
                .deletionAuthorityReceiptDigest,
          });
        const cleanupResponse =
          createAgentCapabilityProbeProviderResourceCleanupResponse({
            repositoryCommit,
            resourceRegistrationRequestDigest:
              resourceLifecycle.cleanupReceipt.requestDigest,
            ownerImplementationDigest,
            cleanupReceipt: resourceLifecycle.cleanupReceipt,
          });
        return createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord(
          {
            repositoryCommit,
            resourceRegistrationRequestDigest:
              resourceLifecycle.cleanupReceipt.requestDigest,
            cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
            deletionAuthorityReceiptDigest:
              resourceLifecycle.deletionAuthorityReceipt
                .deletionAuthorityReceiptDigest,
            ownerImplementationDigest,
            stageDigest: cleanupResponse.stageDigest,
            ownerAdmissionDigest: cleanupResponse.ownerAdmissionDigest,
            dispatchAckDigest: cleanupResponse.dispatchAckDigest,
            resultIngressDigest: cleanupResponse.resultIngressDigest,
            resultIngressReceiptDigest:
              cleanupResponse.resultIngressReceiptDigest,
            cleanupReceiptDigest:
              resourceLifecycle.cleanupReceipt.cleanupReceiptDigest,
            cleanupRequest,
            deletionAuthorityReceipt:
              resourceLifecycle.deletionAuthorityReceipt,
            cleanupReceipt: resourceLifecycle.cleanupReceipt,
            cleanupResponse,
          }
        );
      })()
    : null;
  const authorityIssuerId = `authority.v8.${provider.adapter.protocolFamily}`;
  const requestBase = Object.freeze({
    format: 'prodivix.agent-evaluation-capability-probe-admission-request',
    version: 1,
    namespaceId,
    repositoryCommit,
    providerConfiguration: provider,
    modelLineage: model,
    qualificationCapabilityProfileId: slice.capabilityProfileId,
    qualificationCapabilityProfileDigest: profileDigest,
    capabilityId: slice.capabilityId,
    declaredCapabilityProfileDigests,
    probeProgram,
    probeProviderResourceAuthority,
    minimumExpiresAt: expiresAt,
  });
  const request = Object.freeze({
    ...requestBase,
    requestDigest: digestAgentCanonicalValue(requestBase),
  });
  const phases = probeProgram.providerRequestIntent.requestPhases;
  const phaseRequests = Object.freeze(
    phases.map((phase, sequence) =>
      Object.freeze({
        phase,
        sequence,
        requestDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          sequence,
          authority: 'raw-provider-request',
        }),
        requestBytes: 512,
      })
    )
  );
  const phaseResponses = Object.freeze(
    phases.map((phase, sequence) =>
      Object.freeze({
        phase,
        sequence,
        requestDigest: phaseRequests[sequence]!.requestDigest,
        responseDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          sequence,
          authority: 'raw-provider-response',
        }),
        responseBytes: 1_024,
        outcome: supported ? ('completed' as const) : ('refused' as const),
        completedAt: shiftedInstant(
          -((phases.length - sequence) * 2 - 1) * 1_000
        ),
      })
    )
  );
  const dispatchIntents = Object.freeze(
    phases.map((phase, sequence) =>
      Object.freeze({
        phase,
        sequence,
        requestDigest: phaseRequests[sequence]!.requestDigest,
        dispatchIntentDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          sequence,
          authority: 'raw-dispatch-intent',
        }),
        dispatchedAt: shiftedInstant(-(phases.length - sequence) * 2_000),
      })
    )
  );
  const transportReceipts = Object.freeze(
    phases.map((phase, sequence) =>
      Object.freeze({
        phase,
        sequence,
        dispatchIntentDigest: dispatchIntents[sequence]!.dispatchIntentDigest,
        transportReceiptDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          sequence,
          authority: 'raw-transport-receipt',
        }),
        outcome: phaseResponses[sequence]!.outcome,
        responseDigest: phaseResponses[sequence]!.responseDigest,
        completedAt: phaseResponses[sequence]!.completedAt,
      })
    )
  );
  const spoolReceipts = Object.freeze(
    phases.map((phase, sequence) => {
      const base = Object.freeze({
        phase,
        sequence,
        transportReceiptDigest:
          transportReceipts[sequence]!.transportReceiptDigest,
        responseDigest: phaseResponses[sequence]!.responseDigest,
        spoolRef: `probe-spool.${provider.adapter.protocolFamily}.${slice.capabilityProfileId}.${sequence}`,
        envelopeDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          authority: 'encrypted-envelope',
        }),
        ciphertextDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          authority: 'ciphertext',
        }),
        ciphertextByteLength: 2_048,
        aadDigest: digestAgentCanonicalValue({
          probeId,
          phase,
          authority: 'aad',
        }),
        encryptionProfileDigest: digestAgentCanonicalValue({
          probeId,
          authority: 'encryption-profile',
        }),
        keyRefDigest: digestAgentCanonicalValue({
          probeId,
          authority: 'key-ref',
        }),
      });
      return Object.freeze({
        ...base,
        spoolReceiptDigest: digestAgentCanonicalValue(base),
      });
    })
  );
  const observedFacts = supported
    ? probeProgram.observationContract.supportedRequirements.flatMap(
        (requirement) =>
          Array.from({ length: requirement.minimumCount }, (_, index) =>
            Object.freeze({
              factKind: requirement.factKind,
              factDigest: digestAgentCanonicalValue({
                probeId,
                factKind: requirement.factKind,
                index,
              }),
              providerEventType: requirement.providerEventType,
            })
          )
      )
    : Object.freeze([]);
  const requestDigestFor = (phase: string) =>
    phaseRequests.find((entry) => entry.phase === phase)!.requestDigest;
  const responseDigestFor = (phase: string) =>
    phaseResponses.find((entry) => entry.phase === phase)!.responseDigest;
  const factDigest = (factKind: string) =>
    observedFacts.find((fact) => fact.factKind === factKind)!.factDigest;
  const semanticProof = supported
    ? (() => {
        switch (slice.capabilityProfileId) {
          case 'g4-provider-background-job':
            return createAgentCapabilityProbeSupportedSemanticProof(
              probeProgram,
              {
                proofKind: 'background-job-lifecycle',
                jobReceiptDigest: factDigest('provider-job-receipt'),
                jobIdDigest: digestAgentCanonicalValue({
                  probeId,
                  authority: 'job-id',
                }),
                submitRequestDigest: requestDigestFor('submit'),
                pollResponseDigest: responseDigestFor('submit'),
                terminalResponseDigest: responseDigestFor('poll'),
              }
            );
          case 'g4-provider-hosted-retrieval-core':
          case 'g4-provider-hosted-retrieval-document': {
            const resource =
              probeProgram.providerRequestIntent.publicProbeResource!;
            return createAgentCapabilityProbeSupportedSemanticProof(
              probeProgram,
              {
                proofKind:
                  slice.capabilityProfileId ===
                  'g4-provider-hosted-retrieval-core'
                    ? 'hosted-retrieval-public-text'
                    : 'hosted-retrieval-public-document',
                retrievalQueryReceiptDigest: factDigest(
                  'retrieval-query-receipt'
                ),
                resourceDescriptorDigest: resource.descriptorDigest,
                queryDigest: resource.queryDigest,
                indexDigest: resource.indexDigest,
                expectedMarkerDigest: resource.expectedMarkerDigest,
                resultMarkerDigest: resource.expectedMarkerDigest,
                documentBytesDigest: resource.documentBytesDigest,
                providerResponseDigest: responseDigestFor('dispatch-terminal'),
              }
            );
          }
          case 'g4-provider-isolated-cache': {
            const descriptor =
              probeProgram.providerRequestIntent.cachePrefixResource!;
            return createAgentCapabilityProbeSupportedSemanticProof(
              probeProgram,
              {
                proofKind: 'isolated-cache-roundtrip',
                cacheReceiptDigest: factDigest('provider-cache-receipt'),
                usageVectorDigest: factDigest('usage-vector'),
                cachePrefixDescriptorDigest: descriptor.descriptorDigest,
                coldPrefixDigest: descriptor.prefixDigest,
                warmPrefixDigest: descriptor.prefixDigest,
                coldSuffixDigest: descriptor.coldSuffixDigest,
                warmSuffixDigest: descriptor.warmSuffixDigest,
                cacheKeyDigest: digestAgentCanonicalValue({
                  probeId,
                  authority: 'cache-key',
                }),
                coldResponseDigest: responseDigestFor('cache-cold'),
                warmResponseDigest: responseDigestFor('cache-warm'),
                usageDeltaDigest: digestAgentCanonicalValue({
                  probeId,
                  authority: 'usage-delta',
                }),
                isolationScopeDigest: digestAgentCanonicalValue({
                  probeId,
                  authority: 'isolation-scope',
                }),
                coldCachedTokenCount: 0,
                warmCachedTokenCount: 1,
                cacheHitObserved: true,
              }
            );
          }
          case 'g4-provider-parallel-tool':
            return createAgentCapabilityProbeSupportedSemanticProof(
              probeProgram,
              {
                proofKind: 'parallel-tool-call-set',
                providerResponseDigest: responseDigestFor('dispatch-terminal'),
                toolCalls: Object.freeze(
                  probeProgram.providerRequestIntent.requiredToolNames.map(
                    (toolName, index) =>
                      Object.freeze({
                        toolName,
                        toolCallId: `probe-tool-call-${index + 1}`,
                        factDigest: observedFacts[index]!.factDigest,
                      })
                  )
                ),
              }
            );
          case 'g4-provider-reasoning-continuation':
            return createAgentCapabilityProbeSupportedSemanticProof(
              probeProgram,
              {
                proofKind: 'opaque-continuation-roundtrip',
                continuationFactDigest: factDigest('opaque-continuation'),
                parentResponseDigest: responseDigestFor('continue'),
                opaqueHandleDigest: digestAgentCanonicalValue({
                  probeId,
                  authority: 'opaque-handle',
                }),
                resumeRequestDigest: requestDigestFor('resume'),
                resumeResponseDigest: responseDigestFor('resume'),
              }
            );
        }
      })()
    : null;
  const observedLimits = createAgentCapabilityProbeObservedLimits(
    probeProgram,
    {
      requestBytes: phaseRequests.reduce(
        (total, entry) => total + entry.requestBytes,
        0
      ),
      responseBytes: phaseResponses.reduce(
        (total, entry) => total + entry.responseBytes,
        0
      ),
      normalizedFactCount: observedFacts.length,
      toolCallCount:
        semanticProof?.proofKind === 'parallel-tool-call-set'
          ? semanticProof.toolCalls.length
          : 0,
      providerRoundTripCount: phases.length,
      pollAttemptCount: phases.includes('poll') ? 1 : 0,
      observedMaximumSingleDispatchMs: 1_000,
      observedExecutionDurationMs: (phases.length - 1) * 2_000 + 1_000,
    }
  );
  const commonSource = Object.freeze({
    version: 1,
    admissionRequestDigest: request.requestDigest,
    probeProgramDigest: probeProgram.programDigest,
    profileProjectionDigest: probeProgram.profileProjectionDigest,
    providerConfigurationDigest: digestAgentCanonicalValue(provider),
    modelLineageDigest: model.lineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    ownerImplementationDigest,
    authorityIssuerId,
    observedAt,
  });
  const sourceReceipts: unknown[] = [
    Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-request-source-receipt',
      ...commonSource,
      phaseRequests,
      requestPhaseSetDigest: digestAgentCanonicalValue({ phaseRequests }),
      publicProbeResourceDescriptorDigest:
        probeProgram.providerRequestIntent.publicProbeResource
          ?.descriptorDigest ?? null,
    }),
    Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-response-source-receipt',
      ...commonSource,
      phaseResponses,
      responsePhaseSetDigest: digestAgentCanonicalValue({ phaseResponses }),
      terminalResponseDigest: phaseResponses.at(-1)!.responseDigest,
    }),
    Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-dispatch-source-receipt',
      ...commonSource,
      dispatchIntents,
      dispatchIntentSetDigest: digestAgentCanonicalValue({ dispatchIntents }),
    }),
    Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-transport-source-receipt',
      ...commonSource,
      transportReceipts,
      transportReceiptSetDigest: digestAgentCanonicalValue({
        transportReceipts,
      }),
    }),
    Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt',
      ...commonSource,
      encryptionPolicyDigest: digestAgentCanonicalValue({
        probeId,
        authority: 'encryption-policy',
      }),
      spoolReceipts,
      spoolReceiptSetDigest: digestAgentCanonicalValue({ spoolReceipts }),
    }),
  ];
  const references: {
    kind: (typeof V8_PROBE_REFERENCE_KINDS)[number];
    receipt: Readonly<Record<string, unknown>>;
    receiptDigest: string;
  }[] = [];
  const appendReference = (ordinal: number, sourceReceipt: unknown) => {
    const receipt = Object.freeze({
      format: V8_PROBE_REFERENCE_FORMATS[ordinal]!,
      version: 1,
      admissionRequestDigest: request.requestDigest,
      providerConfigurationDigest: digestAgentCanonicalValue(provider),
      modelLineageDigest: model.lineageDigest,
      qualificationCapabilityProfileDigest: profileDigest,
      capabilityId: slice.capabilityId,
      probeProgramDigest: probeProgram.programDigest,
      profileProjectionDigest: probeProgram.profileProjectionDigest,
      adapterDigest: provider.adapter.adapterDigest,
      ownerImplementationDigest,
      authorityIssuerId,
      previousReceiptDigest:
        ordinal === 0 ? null : references[ordinal - 1]!.receiptDigest,
      observedAt,
      sourceReceipt,
      sourceReceiptDigest: digestAgentCanonicalValue(sourceReceipt),
    });
    references.push({
      kind: V8_PROBE_REFERENCE_KINDS[ordinal]!,
      receipt,
      receiptDigest: digestAgentCanonicalValue(receipt),
    });
  };
  sourceReceipts.forEach((sourceReceipt, ordinal) =>
    appendReference(ordinal, sourceReceipt)
  );
  const normalizedObservationInput = Object.freeze({
    providerConfigurationDigest: digestAgentCanonicalValue(provider),
    modelLineageDigest: model.lineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    probeRequestDigest: references[0]!.receiptDigest,
    providerResponseDigest: references[1]!.receiptDigest,
    status,
    observedFacts,
    semanticProof,
    denial: supported
      ? null
      : Object.freeze({
          denialKind: 'provider-feature-unavailable' as const,
          denialFactDigest: digestAgentCanonicalValue({
            probeId,
            denial: 'provider-feature-unavailable',
          }),
        }),
    observedLimits,
    observedAt,
  });
  const normalizedObservationProjection =
    createAgentCapabilityProbeNormalizedObservationSourceProjection(
      probeProgram,
      normalizedObservationInput
    );
  const semanticProofPhaseLeaves =
    semanticProof === null
      ? null
      : projectAgentCapabilityProbeSemanticProofPhaseLeaves(
          probeProgram,
          semanticProof
        );
  const normalizedSourceReceipt = Object.freeze({
    format:
      'prodivix.agent-evaluation-capability-probe-normalized-event-set-source-receipt',
    ...commonSource,
    normalizedObservationProjection,
    normalizedObservationProjectionDigest: digestAgentCanonicalValue(
      normalizedObservationProjection
    ),
    normalizerImplementationDigest: digestAgentCanonicalValue({
      probeId,
      authority: 'normalizer-implementation',
    }),
    semanticProofPhaseLeaves,
    semanticProofPhaseLeavesDigest:
      semanticProofPhaseLeaves?.projectionDigest ?? null,
  });
  appendReference(5, normalizedSourceReceipt);
  const normalizedObservation = createAgentCapabilityProbeProgramObservation(
    probeProgram,
    {
      ...normalizedObservationInput,
      normalizedEventSetDigest: references[5]!.receiptDigest,
    }
  );
  const receipt = createAgentCapabilityProbeProgramReceipt({
    probeId,
    program: probeProgram,
    observation: normalizedObservation,
    declaredCapabilityProfileDigests: declaredProfileDigests,
    probedAt: observedAt,
    expiresAt,
  });
  const referenceBundle = Object.freeze(
    references.map((entry) => Object.freeze({ ...entry }))
  );
  const probeEvidence = createAgentEvaluationProductionCapabilityProbeEvidence({
    authorityKind: 'sealed-provider-capability-probe',
    authorityIssuerId,
    ownerImplementationDigest,
    adapterDigest: provider.adapter.adapterDigest,
    probeRequestDigest: references[0]!.receiptDigest,
    probeResponseDigest: references[1]!.receiptDigest,
    dispatchReceiptDigest: references[2]!.receiptDigest,
    transportReceiptDigest: references[3]!.receiptDigest,
    responseSpoolDigest: references[4]!.receiptDigest,
    normalizedEventSetDigest: references[5]!.receiptDigest,
    probeProgram,
    normalizedObservation,
    receipt,
  });
  const response = createAgentEvaluationCapabilityProbeAdmissionResponse({
    request,
    probeEvidence,
    ownerImplementationDigest,
  });
  return Object.freeze({
    probeEvidence,
    probeProviderResourceAuthority,
    probeProviderResourceDeletionAuthorityReceipt:
      resourceLifecycle?.deletionAuthorityReceipt ?? null,
    probeProviderResourceCleanupReceipt:
      resourceLifecycle?.cleanupReceipt ?? null,
    probeProviderResourceCleanupArchiveRecord,
    admission: createAgentEvaluationCapabilityProbeAdmissionArchiveRecord({
      requestDigest: request.requestDigest,
      stageDigest: response.stageDigest,
      dispatchAckDigest: response.dispatchAckDigest,
      admissionReceiptDigest: response.admissionReceiptDigest,
      request,
      referenceBundle,
      response,
    }),
    references: Object.freeze(
      references.map((entry, ordinal) =>
        createAgentEvaluationCapabilityProbeReferenceArchiveRecord({
          admissionRequestDigest: request.requestDigest,
          ordinal,
          kind: entry.kind,
          receiptDigest: entry.receiptDigest,
          receipt: entry.receipt,
        })
      )
    ),
  });
};

const createV8RuntimeFactSourceRegistrationArchiveAuthority = (input: {
  provider: V8NativeConfiguration['provider'];
  model: V8NativeConfiguration['model'];
  slice: V8OptionalCapabilitySlice;
  profileDigest: string;
}): Readonly<{
  runtimeFactSourceAuthority: ReturnType<
    typeof createAgentEvaluationRuntimeFactSourceAuthority
  >;
  registration: AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord;
}> => {
  const { provider, model, slice, profileDigest } = input;
  const sourceKind =
    slice.capabilityId === 'provider.hosted-retrieval'
      ? ('sealed-hosted-owner-result' as const)
      : ('sealed-provider-response-metadata' as const);
  const sourceAuthorityId = `runtime-source.v8.${provider.adapter.protocolFamily}.${slice.capabilityProfileId}`;
  const sourceAuthorityImplementationDigest = digestAgentCanonicalValue({
    owner: 'v8-fixture-runtime-source',
    protocolFamily: provider.adapter.protocolFamily,
    profileId: slice.capabilityProfileId,
  });
  const routeBinding = `runtime-fact-source.${slice.capabilityProfileId}`;
  const registrationAuthorityIssuerId = 'authority.v8.runtime-registration';
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: slice.capabilityProfileId,
    capabilityProfileDigest: profileDigest,
  });
  const hostedRegistrationIntent =
    slice.capabilityId === 'provider.hosted-retrieval' &&
    (provider.adapter.protocolFamily === 'openai-responses' ||
      provider.adapter.protocolFamily === 'gemini-interactions')
      ? createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
          providerConfigurationId: provider.providerConfigurationId,
          providerConfigurationDigest: digestAgentCanonicalValue(provider),
          protocolFamily: provider.adapter.protocolFamily,
          modelId: model.modelId,
          modelLineageDigest: model.lineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          capabilityProfileId: slice.capabilityProfileId as
            | 'g4-provider-hosted-retrieval-core'
            | 'g4-provider-hosted-retrieval-document',
          capabilityProfileDigest: profileDigest,
          probeProgramDigest: probeProgram.programDigest,
          publicResourceDescriptorDigest:
            probeProgram.providerRequestIntent.publicProbeResource!
              .descriptorDigest,
        })
      : null;
  const requestBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request',
    version: 1,
    namespaceId: 'namespace.v8.release',
    repositoryCommit: V8_REPOSITORY_COMMIT,
    sourceAuthorityKind: 'shared-durable-capability',
    sourceKind,
    sourceAuthorityId,
    sourceAuthorityImplementationDigest,
    routeBinding,
    capabilityProfileId: slice.capabilityProfileId,
    capabilityProfileDigest: profileDigest,
    capabilityId: slice.capabilityId,
    protocolFamily: provider.adapter.protocolFamily as
      'openai-responses' | 'anthropic-messages' | 'gemini-interactions',
    providerConfigurationId: provider.providerConfigurationId,
    modelId: model.modelId,
    modelLineageDigest: model.lineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    ...(hostedRegistrationIntent !== null
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            hostedRegistrationIntent.intentDigest,
        }
      : {}),
    minimumExpiresAt: V8_PROBE_EXPIRES_AT,
  });
  const request = Object.freeze({
    ...requestBase,
    requestDigest: digestAgentCanonicalValue(requestBase),
  });
  const healthBase = Object.freeze({
    format: 'prodivix.agent-evaluation-runtime-fact-source-owner-health',
    version: 1,
    requestDigest: request.requestDigest,
    sourceAuthorityId,
    sourceAuthorityImplementationDigest,
    sourceKind,
    routeBinding,
    status: 'ready',
    checkedAt: V8_PROBE_OBSERVED_AT,
    expiresAt: V8_PROBE_EXPIRES_AT,
  });
  const ownerHealth = Object.freeze({
    ...healthBase,
    healthDigest: digestAgentCanonicalValue(healthBase),
  });
  const receipt = createAgentEvaluationRuntimeFactSourceRegistrationReceipt({
    request,
    ownerHealth,
    registrationAuthorityIssuerId,
    registeredAt: V8_PROBE_OBSERVED_AT,
    expiresAt: V8_PROBE_EXPIRES_AT,
  });
  return Object.freeze({
    runtimeFactSourceAuthority: createAgentEvaluationRuntimeFactSourceAuthority(
      {
        kind: 'shared-durable-capability',
        sourceKind,
        sourceAuthorityId,
        sourceAuthorityImplementationDigest,
        routeBinding,
        capabilityProfileId: slice.capabilityProfileId,
        capabilityProfileDigest: profileDigest,
        capabilityId: slice.capabilityId,
        protocolFamily: provider.adapter.protocolFamily,
        providerConfigurationId: provider.providerConfigurationId,
        modelId: model.modelId,
        modelLineageDigest: model.lineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        registrationAuthorityIssuerId,
        registrationReceiptDigest: receipt.registrationReceiptDigest,
        ...(hostedRegistrationIntent !== null
          ? {
              hostedRetrievalRuntimeResourceRegistrationIntentDigest:
                hostedRegistrationIntent.intentDigest,
            }
          : {}),
      }
    ),
    registration:
      createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord({
        registrationReceiptDigest: receipt.registrationReceiptDigest,
        requestDigest: request.requestDigest,
        ownerHealthDigest: ownerHealth.healthDigest,
        request,
        ownerHealth,
        receipt,
      }),
  });
};

type V8QualificationAuthorityFixture = Readonly<{
  capabilityQualificationTargets: readonly AgentCapabilityQualificationTarget[];
  capabilityProbeAdmissions: readonly AgentEvaluationCapabilityProbeAdmissionArchiveRecord[];
  capabilityProbeReferenceReceipts: readonly AgentEvaluationCapabilityProbeReferenceArchiveRecord[];
  runtimeFactSourceOwnerRegistrations: readonly AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord[];
  capabilityProbeProviderResourceCleanups: readonly AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord[];
}>;

const qualificationTargets = (): V8QualificationAuthorityFixture => {
  const capabilityProbeAdmissions: AgentEvaluationCapabilityProbeAdmissionArchiveRecord[] =
    [];
  const capabilityProbeReferenceReceipts: AgentEvaluationCapabilityProbeReferenceArchiveRecord[] =
    [];
  const runtimeFactSourceOwnerRegistrations: AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord[] =
    [];
  const capabilityProbeProviderResourceCleanups: AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord[] =
    [];
  const provisionalTargets = Object.freeze(
    V8_NATIVE_CONFIGURATIONS.flatMap(({ provider, model }) => [
      ...profileIds.map((profileId) => {
        const profileDigest = capabilityProfileDigest(profileId);
        return createAgentCapabilityQualificationTarget({
          targetId: `target.${provider.adapter.protocolFamily}.${profileId}`,
          providerConfigurationId: provider.providerConfigurationId,
          providerIdentityDigest: digestAgentCanonicalValue(provider),
          protocolFamily: provider.adapter.protocolFamily,
          providerOperatorId: provider.providerOperatorId,
          modelId: model.modelId,
          modelLineageDigest: model.lineageDigest,
          modelFamilyOwnerId: model.modelFamilyOwnerId,
          capabilityProfileId: profileId,
          capabilityProfileDigest: profileDigest,
          inferenceConfigurationDigest: digestAgentCanonicalValue({
            profileId,
            inference: 'v8',
          }),
          qualificationSliceDigest: createAgentQualificationSliceDigest({
            provider,
            model,
            capabilityProfileDigest: profileDigest,
            policyProfileDigest: policyDigest,
          }),
        });
      }),
      ...G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES.map((slice) => {
        const profileDigest = capabilityProfileDigest(
          slice.capabilityProfileId
        );
        const supported = isV8OptionalCapabilitySupported(
          provider.adapter
            .protocolFamily as keyof typeof V8_OPTIONAL_SUPPORTED_PROFILES_BY_PROTOCOL,
          slice.capabilityProfileId
        );
        const probeArchive = createV8CapabilityProbeArchiveAuthority({
          provider,
          model,
          slice,
          profileDigest,
          supported,
        });
        capabilityProbeAdmissions.push(probeArchive.admission);
        capabilityProbeReferenceReceipts.push(...probeArchive.references);
        if (probeArchive.probeProviderResourceCleanupArchiveRecord) {
          capabilityProbeProviderResourceCleanups.push(
            probeArchive.probeProviderResourceCleanupArchiveRecord
          );
        }
        const runtimeArchive =
          slice.capabilityId === 'provider.parallel-tool'
            ? undefined
            : createV8RuntimeFactSourceRegistrationArchiveAuthority({
                provider,
                model,
                slice,
                profileDigest,
              });
        if (runtimeArchive) {
          runtimeFactSourceOwnerRegistrations.push(runtimeArchive.registration);
        }
        const resolvedCapabilityDescriptor =
          createAgentEvaluationCapabilityDescriptor({
            capabilityId: slice.capabilityId,
            supportExpectation: supported ? 'required' : 'expected-blocked',
            expectedToolIds: supported
              ? slice.expectedToolIds
              : Object.freeze([]),
            expectedReceiptKinds: supported
              ? slice.expectedReceiptKinds
              : Object.freeze(['capability-unavailable-receipt']),
          });
        const probeProviderResourceAuthority =
          probeArchive.probeProviderResourceAuthority;
        const optionalCapabilitySupportAuthority =
          createAgentEvaluationOptionalCapabilitySupportAuthority({
            qualificationAuthorityBundleDigest: digestAgentCanonicalValue({
              fixture: 'v8-qualification-authority-bundle',
            }),
            qualificationCapabilityProfileId: slice.capabilityProfileId,
            qualificationCapabilityProfileDigest: profileDigest,
            capabilityId: slice.capabilityId,
            supportExpectation: supported ? 'required' : 'expected-blocked',
            declaredCapabilityProfileDigests,
            probeEvidence: probeArchive.probeEvidence,
            ...(probeProviderResourceAuthority !== null
              ? {
                  probeProviderResourceAuthority,
                  probeProviderResourceDeletionAuthorityReceipt:
                    probeArchive.probeProviderResourceDeletionAuthorityReceipt!,
                  probeProviderResourceCleanupReceipt:
                    probeArchive.probeProviderResourceCleanupReceipt!,
                }
              : {}),
            ...(runtimeArchive
              ? {
                  runtimeFactSourceAuthority:
                    runtimeArchive.runtimeFactSourceAuthority,
                }
              : {}),
            resolvedCapabilityDescriptor,
          });
        const baseQualificationSliceDigest =
          createAgentQualificationSliceDigest({
            provider,
            model,
            capabilityProfileDigest: profileDigest,
            policyProfileDigest: policyDigest,
          });
        return createAgentCapabilityQualificationTarget({
          targetId: `target.${provider.adapter.protocolFamily}.${slice.capabilityProfileId}`,
          providerConfigurationId: provider.providerConfigurationId,
          providerIdentityDigest: digestAgentCanonicalValue(provider),
          protocolFamily: provider.adapter.protocolFamily,
          providerOperatorId: provider.providerOperatorId,
          modelId: model.modelId,
          modelLineageDigest: model.lineageDigest,
          modelFamilyOwnerId: model.modelFamilyOwnerId,
          capabilityProfileId: slice.capabilityProfileId,
          capabilityProfileDigest: profileDigest,
          inferenceConfigurationDigest: digestAgentCanonicalValue({
            profileId: slice.capabilityProfileId,
            inference: 'v8',
          }),
          qualificationSliceDigest: digestAgentCanonicalValue({
            baseQualificationSliceDigest,
            optionalCapabilitySupportAuthorityDigest:
              optionalCapabilitySupportAuthority.authorityDigest,
          }),
          optionalCapabilitySupportAuthority,
        });
      }),
    ])
  );
  const optionalTargets = provisionalTargets.filter(
    ({ optionalCapabilitySupportAuthority }) =>
      optionalCapabilitySupportAuthority !== undefined
  );
  const commitment =
    createAgentEvaluationQualificationAuthorityBundleCommitment(
      optionalTargets.map((target) =>
        Object.freeze({
          protocolFamily: target.protocolFamily as
            'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
          profileId: target.capabilityProfileId as
            | 'g4-provider-background-job'
            | 'g4-provider-hosted-retrieval-core'
            | 'g4-provider-hosted-retrieval-document'
            | 'g4-provider-isolated-cache'
            | 'g4-provider-parallel-tool'
            | 'g4-provider-reasoning-continuation',
          evidenceDigest:
            target.optionalCapabilitySupportAuthority!.probeEvidence
              .evidenceDigest,
        })
      ),
      optionalTargets.flatMap((target) => {
        const authority =
          target.optionalCapabilitySupportAuthority!.runtimeFactSourceAuthority;
        return authority
          ? [
              Object.freeze({
                protocolFamily: target.protocolFamily as
                  | 'anthropic-messages'
                  | 'gemini-interactions'
                  | 'openai-responses',
                profileId: target.capabilityProfileId as
                  | 'g4-provider-background-job'
                  | 'g4-provider-hosted-retrieval-core'
                  | 'g4-provider-hosted-retrieval-document'
                  | 'g4-provider-isolated-cache'
                  | 'g4-provider-reasoning-continuation',
                authorityDigest: authority.authorityDigest,
              }),
            ]
          : [];
      }),
      optionalTargets.flatMap((target) => {
        const receipt =
          target.optionalCapabilitySupportAuthority!
            .probeProviderResourceCleanupReceipt;
        return receipt
          ? [
              Object.freeze({
                protocolFamily: target.protocolFamily as
                  'gemini-interactions' | 'openai-responses',
                profileId: target.capabilityProfileId as
                  | 'g4-provider-hosted-retrieval-core'
                  | 'g4-provider-hosted-retrieval-document',
                cleanupReceiptDigest: receipt.cleanupReceiptDigest,
              }),
            ]
          : [];
      })
    );
  const capabilityQualificationTargets = Object.freeze(
    provisionalTargets.map((target) => {
      const supplied = target.optionalCapabilitySupportAuthority;
      if (!supplied) return target;
      const { authorityDigest: _authorityDigest, ...authorityInput } = supplied;
      const optionalCapabilitySupportAuthority =
        createAgentEvaluationOptionalCapabilitySupportAuthority({
          ...authorityInput,
          qualificationAuthorityBundleDigest: commitment.bundleDigest,
        });
      const configuration = V8_NATIVE_CONFIGURATIONS.find(
        ({ provider, model }) =>
          provider.providerConfigurationId === target.providerConfigurationId &&
          model.modelId === target.modelId
      )!;
      const baseQualificationSliceDigest = createAgentQualificationSliceDigest({
        provider: configuration.provider,
        model: configuration.model,
        capabilityProfileDigest: target.capabilityProfileDigest,
        policyProfileDigest: policyDigest,
      });
      const { targetDigest: _targetDigest, ...targetInput } = target;
      return createAgentCapabilityQualificationTarget({
        ...targetInput,
        qualificationSliceDigest: digestAgentCanonicalValue({
          baseQualificationSliceDigest,
          optionalCapabilitySupportAuthorityDigest:
            optionalCapabilitySupportAuthority.authorityDigest,
        }),
        optionalCapabilitySupportAuthority,
      });
    })
  );
  return Object.freeze({
    capabilityQualificationTargets,
    capabilityProbeAdmissions: Object.freeze([...capabilityProbeAdmissions]),
    capabilityProbeReferenceReceipts: Object.freeze([
      ...capabilityProbeReferenceReceipts,
    ]),
    runtimeFactSourceOwnerRegistrations: Object.freeze([
      ...runtimeFactSourceOwnerRegistrations,
    ]),
    capabilityProbeProviderResourceCleanups: Object.freeze([
      ...capabilityProbeProviderResourceCleanups,
    ]),
  });
};

let cachedEvaluationPlan: AgentModelEvaluationPlan | undefined;

export const createV8EvaluationPlan = (): AgentModelEvaluationPlan => {
  if (cachedEvaluationPlan) return cachedEvaluationPlan;
  const { capabilityQualificationTargets } = qualificationTargets();
  const highAssuranceCaseIds = G4_V8_MINIMUM_EVALUATION_CORPUS.cases
    .filter(({ riskClass }) => riskClass === 'high-assurance')
    .map(({ caseId }) => caseId);
  const repetitionPolicy = createAgentEvaluationRepetitionPolicy({
    rules: Object.freeze([
      Object.freeze({
        riskClass: 'ordinary',
        minimumIndependentAttempts: 10,
        confidenceLevel: '0.95',
      }),
      Object.freeze({
        riskClass: 'critical',
        minimumIndependentAttempts: 30,
        confidenceLevel: '0.95',
        maximumFailureRateBound: '0.1',
      }),
      Object.freeze({
        riskClass: 'high-assurance',
        minimumIndependentAttempts: 100,
        confidenceLevel: '0.95',
        maximumFailureRateBound: '0.03',
      }),
    ]),
    highAssuranceCaseIds,
    samplingIndependencePolicyDigest: digestAgentCanonicalValue(
      'independent-run-per-attempt-v8'
    ),
    cacheAndStateIsolationPolicyDigest: digestAgentCanonicalValue(
      'invocation-isolated-cache-state-v8'
    ),
  });
  const hostedBudgetFloor = resolveAgentModelEvaluationHostedRuntimeBudgetFloor(
    {
      concreteCases: G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
      capabilityQualificationTargets,
      repetitionPolicy,
    }
  );
  cachedEvaluationPlan = createAgentModelEvaluationPlan({
    evaluationPlanId: 'evaluation-plan.g4-v8.minimum',
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    policyDigest,
    contextBuilderDigest: digestAgentCanonicalValue('context-builder-v8'),
    semanticProviderSetDigest: digestAgentCanonicalValue(
      'semantic-provider-set-v8'
    ),
    promptPolicyDigest: digestAgentCanonicalValue('prompt-policy-v8'),
    outputSchemaDigest: digestAgentCanonicalValue('output-schema-v8'),
    toolRegistryDigest: digestAgentCanonicalValue('tool-registry-v8'),
    actionRegistryDigest: digestAgentCanonicalValue('action-registry-v8'),
    providerConfigurations: V8_NATIVE_CONFIGURATIONS.map(
      ({ provider }) => provider
    ),
    modelConfigurations: V8_NATIVE_CONFIGURATIONS.map(({ model }) => model),
    capabilityQualificationTargets,
    endpointSmokeTargets: Object.freeze([
      ...V8_NATIVE_CONFIGURATIONS.map(({ adapter, provider, model }) => {
        const coreTarget = capabilityQualificationTargets.find(
          (target) =>
            target.providerConfigurationId ===
              provider.providerConfigurationId &&
            target.capabilityProfileId === 'g4-core-text-tools'
        )!;
        return createAgentEvaluationEndpointSmokeTarget({
          smokeTargetId: `smoke.release.${adapter.protocolFamily}.native`,
          endpointClass: provider.endpointClass,
          protocolFamily: adapter.protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          modelId: model.modelId,
          immutableModelVersion: model.immutableVersion!,
          modelLineageDigest: model.lineageDigest,
          inferenceConfigurationDigest: coreTarget.inferenceConfigurationDigest,
          adapterDigest: adapter.adapterDigest,
          pricingAuthorityDigest: digestAgentCanonicalValue({
            providerConfigurationId: provider.providerConfigurationId,
            pricingAuthority: 'v8-fixture',
          }),
          responseSpoolEncryptionPolicyDigest:
            endpointSmokeResponseSpoolEncryptionPolicyDigest,
          smokeProfileDigest: coreTarget.capabilityProfileDigest,
        });
      }),
      createAgentEvaluationEndpointSmokeTarget({
        smokeTargetId: 'smoke.release.openai-compatible.hosted',
        endpointClass: 'aggregator',
        protocolFamily: 'openai-compatible',
        providerConfigurationId: 'provider.compatible.hosted',
        modelId: 'model.compatible.hosted.2026-08-08',
        immutableModelVersion: 'model.compatible.hosted.2026-08-08',
        modelLineageDigest: digestAgentCanonicalValue(
          'compatible-hosted-model-lineage'
        ),
        inferenceConfigurationDigest: digestAgentCanonicalValue(
          'compatible-hosted-inference-configuration'
        ),
        adapterDigest: digestAgentCanonicalValue('compatible-hosted-adapter'),
        pricingAuthorityDigest: digestAgentCanonicalValue(
          'compatible-hosted-pricing-authority'
        ),
        responseSpoolEncryptionPolicyDigest:
          endpointSmokeResponseSpoolEncryptionPolicyDigest,
        smokeProfileDigest: digestAgentCanonicalValue('compatible-smoke'),
      }),
      createAgentEvaluationEndpointSmokeTarget({
        smokeTargetId: 'smoke.release.openai-compatible.local',
        endpointClass: 'local',
        protocolFamily: 'openai-compatible',
        providerConfigurationId: 'provider.compatible.local',
        modelId: 'model.compatible.local.2026-08-08',
        immutableModelVersion: 'model.compatible.local.2026-08-08',
        modelLineageDigest: digestAgentCanonicalValue(
          'compatible-local-model-lineage'
        ),
        inferenceConfigurationDigest: digestAgentCanonicalValue(
          'compatible-local-inference-configuration'
        ),
        adapterDigest: digestAgentCanonicalValue('compatible-local-adapter'),
        pricingAuthorityDigest: digestAgentCanonicalValue(
          'compatible-local-pricing-authority'
        ),
        responseSpoolEncryptionPolicyDigest:
          endpointSmokeResponseSpoolEncryptionPolicyDigest,
        smokeProfileDigest: digestAgentCanonicalValue('compatible-smoke'),
      }),
    ]),
    publicCorpusDigest: G4_V8_MINIMUM_EVALUATION_CORPUS.publicCorpusDigest,
    protectedHoldoutManifestDigest:
      G4_V8_MINIMUM_EVALUATION_CORPUS.protectedHoldoutManifestDigest,
    rotatingCorpusPolicyDigest: digestAgentCanonicalValue(
      'rotating-counterexample-policy-v8'
    ),
    concreteCases: G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
    contextTiers: G4_V8_MINIMUM_EVALUATION_CORPUS.contextTiers,
    mediaRepresentationTiers:
      G4_V8_MINIMUM_EVALUATION_CORPUS.mediaRepresentationTiers,
    contextSentinelCaseIds:
      G4_V8_MINIMUM_EVALUATION_CORPUS.contextSentinelCaseIds,
    mediaSentinelCaseIds: G4_V8_MINIMUM_EVALUATION_CORPUS.mediaSentinelCaseIds,
    repetitionPolicy,
    graderPlan: createAgentEvaluationGraderPlan({
      graders: Object.freeze([
        Object.freeze({
          graderId: 'grader.strict-authority.v8',
          kind: 'deterministic-rule',
          authority: 'deterministic',
          configurationDigest: digestAgentCanonicalValue('strict-authority-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
        Object.freeze({
          graderId: 'grader.auxiliary-judge.v8',
          kind: 'model-judge',
          authority: 'auxiliary',
          configurationDigest: digestAgentCanonicalValue('auxiliary-judge-v8'),
          providerConfigurationId: 'provider.judge.v8',
          modelLineageDigest: digestAgentCanonicalValue('judge-lineage-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
        Object.freeze({
          graderId: 'grader.blind-human.v8',
          kind: 'blind-human-rubric',
          authority: 'human',
          configurationDigest: digestAgentCanonicalValue('visual-rubric-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
      ]),
      deterministicAuthorityGraderIds: Object.freeze([
        'grader.strict-authority.v8',
      ]),
      auxiliaryJudgeGraderIds: Object.freeze(['grader.auxiliary-judge.v8']),
      blindHumanGraderIds: Object.freeze(['grader.blind-human.v8']),
      minimumIndependentVisualRatings: 2,
      disagreementPolicyDigest: digestAgentCanonicalValue(
        'human-adjudication-v8'
      ),
      randomizedPresentationPolicyDigest: digestAgentCanonicalValue(
        'blind-randomized-presentation-v8'
      ),
    }),
    thresholds: createAgentModelEvaluationThresholds({
      metrics: Object.freeze([
        Object.freeze({
          metricId: 'authority.correctness',
          requiredAuthority: 'deterministic',
          maximumObservedFailureRate: '0',
          maximumUpperConfidenceBound: '0.5',
          minimumSampleCount: 10,
        }),
      ]),
      multipleComparisonPolicyDigest: digestAgentCanonicalValue(
        'multiple-comparison-v8'
      ),
      slicePolicyDigest: digestAgentCanonicalValue('exact-slice-policy-v8'),
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
          Object.freeze({ unit: 'image-pixel', maximum: '1000000000000' }),
          Object.freeze({ unit: 'document-page', maximum: '10000000' }),
          Object.freeze({
            unit: 'hosted-search-query',
            maximum: String(hostedBudgetFloor.hostedSearchQueryCount),
          }),
          Object.freeze({
            unit: 'hosted-tool-call',
            maximum: String(hostedBudgetFloor.hostedToolCallCount),
          }),
          Object.freeze({
            unit: 'provider-upload-byte',
            maximum: String(hostedBudgetFloor.providerUploadBytes),
          }),
          Object.freeze({
            unit: 'provider-storage-byte-second',
            maximum: String(hostedBudgetFloor.providerStorageByteSeconds),
          }),
        ]),
        costLimits: Object.freeze([
          Object.freeze({ currency: 'USD', maximum: '1000000' }),
        ]),
        maxModelInvocations: 1_000_000,
        maxToolCalls: 10_000_000,
        maxRepairRounds: 0,
        maxTransactions: 100_000,
        maxArtifactBytes: 10_000_000_000,
        maxElapsedMs: 604_800_000,
      }),
      maxProviderJobs: 1_000_000,
      maxShards: 64,
      maxHumanRatings: 100_000,
      reservePolicyDigest: digestAgentCanonicalValue('shard-reserve-v8'),
    }),
    plannedAt: V8_TIME.planned,
    expiresAt: V8_TIME.expires,
  });
  return cachedEvaluationPlan;
};

export type V8QualificationAuthorityArchiveFixture = Readonly<{
  plan: AgentModelEvaluationPlan;
  capabilityProbeAdmissions: readonly AgentEvaluationCapabilityProbeAdmissionArchiveRecord[];
  capabilityProbeReferenceReceipts: readonly AgentEvaluationCapabilityProbeReferenceArchiveRecord[];
  runtimeFactSourceOwnerRegistrations: readonly AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord[];
  capabilityProbeProviderResourceCleanups: readonly AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord[];
}>;

export const createV8QualificationAuthorityArchiveFixture =
  (): V8QualificationAuthorityArchiveFixture => {
    const qualification = qualificationTargets();
    return Object.freeze({
      plan: createV8EvaluationPlan(),
      capabilityProbeAdmissions: qualification.capabilityProbeAdmissions,
      capabilityProbeReferenceReceipts:
        qualification.capabilityProbeReferenceReceipts,
      runtimeFactSourceOwnerRegistrations:
        qualification.runtimeFactSourceOwnerRegistrations,
      capabilityProbeProviderResourceCleanups:
        qualification.capabilityProbeProviderResourceCleanups,
    });
  };

const cachedPassingAttempts = new WeakMap<
  object,
  readonly AgentModelEvaluationAttempt[]
>();

const createPassingV8Attempt = (
  descriptor: AgentModelEvaluationAttemptDescriptor
): AgentModelEvaluationAttempt =>
  createAgentModelEvaluationAttempt({
    descriptor,
    independentRunId: `run.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    dispatchIntentSetDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      dispatchIntents: true,
    }),
    transportReceiptSetDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      transportReceipts: true,
    }),
    invocationTurnReceiptSetDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      invocationTurns: true,
    }),
    invocationTurnSetReceiptDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      invocationTurnSet: true,
    }),
    capabilityExecutionReceiptSetDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      capabilityExecutionReceipts: true,
    }),
    verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
      verificationAttemptGrantReceiptDigests: [],
    }),
    responseDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      response: true,
    }),
    status: 'completed',
    outcome: 'passed',
    metricObservations: Object.freeze([
      createAgentEvaluationMetricObservation({
        metricId: 'authority.correctness',
        graderId: 'grader.strict-authority.v8',
        graderKind: 'deterministic-rule',
        authority: 'deterministic',
        verdict: 'passed',
      }),
    ]),
    usage: createAgentUsageVector([
      Object.freeze({
        unit: 'text-token-input',
        logicalAmount: '1',
        billableAmount: '1',
        confidence: 'reported',
      }),
      Object.freeze({
        unit: 'text-token-output',
        logicalAmount: '1',
        billableAmount: '1',
        confidence: 'reported',
      }),
    ]),
    cost: Object.freeze([
      Object.freeze({
        currency: 'USD',
        amount: '0.000001',
        confidence: 'measured',
      }),
    ]),
    startedAt: V8_TIME.started,
    completedAt: V8_TIME.completed,
  });

export const createV8CodecAttemptFixture = (
  plan: AgentModelEvaluationPlan
): AgentModelEvaluationAttempt => {
  const concreteCase = plan.concreteCases[0]!;
  const target = plan.capabilityQualificationTargets[0]!;
  const samplingBase = Object.freeze({
    planDigest: plan.planDigest,
    caseId: concreteCase.caseId,
    targetId: target.targetId,
    targetDigest: target.targetDigest,
    capabilityDescriptorDigest: concreteCase.capabilityDescriptorDigest,
    riskClass: concreteCase.riskClass,
    repetitionIndex: 0,
  });
  const samplingIdentityDigest = digestAgentCanonicalValue(samplingBase);
  const descriptorBase = Object.freeze({
    attemptId: `evaluation-attempt:${samplingIdentityDigest.slice('sha256-'.length)}`,
    planDigest: plan.planDigest,
    shardId: `evaluation-shard:${digestAgentCanonicalValue({ targetId: target.targetId }).slice('sha256-'.length)}`,
    caseId: concreteCase.caseId,
    capabilityDescriptorDigest: concreteCase.capabilityDescriptorDigest,
    targetId: target.targetId,
    targetDigest: target.targetDigest,
    riskClass: concreteCase.riskClass,
    repetitionIndex: 0,
    samplingIdentityDigest,
  });
  return createPassingV8Attempt(
    Object.freeze({
      ...descriptorBase,
      descriptorDigest: digestAgentCanonicalValue(descriptorBase),
    })
  );
};

export const createPassingV8Attempts = (
  plan: AgentModelEvaluationPlan
): readonly AgentModelEvaluationAttempt[] => {
  const cached = cachedPassingAttempts.get(plan);
  if (cached) return cached;
  const attempts = Object.freeze(
    planAgentModelEvaluationAttempts(plan).map(createPassingV8Attempt)
  );
  cachedPassingAttempts.set(plan, attempts);
  return attempts;
};

export const createV8HumanReviewReport = (
  plan: AgentModelEvaluationPlan
): AgentHumanReviewReport => {
  const rubric = createV8PublicReviewRubric();
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const subjective = new Map<string, (typeof descriptors)[number]>();
  const subjectiveCaseIds = new Set(
    plan.concreteCases
      .filter(({ subjectiveVisualQuality }) => subjectiveVisualQuality)
      .map(({ caseId }) => caseId)
  );
  for (const descriptor of descriptors) {
    if (!subjectiveCaseIds.has(descriptor.caseId)) continue;
    const key = `${descriptor.caseId}\u0000${descriptor.targetId}`;
    if (!subjective.has(key)) subjective.set(key, descriptor);
  }
  return createAgentHumanReviewReport({
    reportId: 'human-review.g4-v8.minimum',
    planDigest: plan.planDigest,
    blindedArtifactSetDigest: digestAgentCanonicalValue('blinded-artifacts-v8'),
    ratings: Object.freeze(
      [...subjective.values()].flatMap((descriptor) =>
        ['reviewer-a', 'reviewer-b'].map((reviewer, index) =>
          createAgentHumanReviewRating({
            ratingId: `rating.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}.${index}`,
            attemptId: descriptor.attemptId,
            reviewerPseudonym: reviewer,
            randomizedPresentationId: `presentation.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
            rubricDigest: rubric.rubricDigest,
            criterionVerdicts: Object.freeze(
              V8_REVIEW_CRITERION_IDS.map((criterionId) =>
                Object.freeze({
                  criterionId,
                  verdict: 'passed' as const,
                })
              )
            ),
            verdict: 'passed',
          })
        )
      )
    ),
    adjudicationDigest: digestAgentCanonicalValue('no-disagreement-v8'),
    generatedAt: V8_TIME.evaluated,
  });
};

/** Builds the canonical signed human-review wrapper shared by evidence tests. */
export const createV8ValidatedHumanReviewArtifact = (
  plan: AgentModelEvaluationPlan,
  humanReviewReport: AgentHumanReviewReport
): AgentEvaluationValidatedHumanReviewArtifact => {
  const independencePolicyDigest = digestAgentCanonicalValue(
    'human-review-independence.evidence-v3'
  );
  const reviewerPseudonyms = Object.freeze(
    [
      ...new Set(
        humanReviewReport.ratings.map(
          ({ reviewerPseudonym }) => reviewerPseudonym
        )
      ),
    ].sort(compareUnicodeCodePoints)
  );
  const createAuthority = (
    authorityId: string,
    pseudonym: string,
    role: AgentEvaluationHumanReviewTrustAuthority['role']
  ): AgentEvaluationHumanReviewTrustAuthority => {
    const base = Object.freeze({
      authorityId,
      pseudonym,
      role,
      keyId: `key.${pseudonym}`,
      publicKeyBase64Url: V8_REVIEW_PUBLIC_KEY,
      validFrom: V8_TIME.planned,
      validUntil: V8_TIME.expires,
      independencePolicyDigest,
    });
    return Object.freeze({
      ...base,
      authorityDigest: digestAgentCanonicalValue(base),
    });
  };
  const authorities = Object.freeze(
    [
      createAuthority(
        'authority.human-review.adjudicator',
        'adjudicator-evidence-v3',
        'adjudicator'
      ),
      ...reviewerPseudonyms.map((pseudonym) =>
        createAuthority(
          `authority.human-review.${pseudonym}`,
          pseudonym,
          'reviewer'
        )
      ),
    ].sort((left, right) =>
      compareUnicodeCodePoints(left.authorityId, right.authorityId)
    )
  );
  const authoritySetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-authority-set',
    version: 1,
    authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
  });
  const trustRegistryBase = Object.freeze({
    format: 'prodivix.g4-human-review-trust-registry' as const,
    version: 1 as const,
    registryId: 'human-review.registry.evidence-v3',
    authorities,
    authoritySetDigest,
  });
  const trustRegistry = Object.freeze({
    ...trustRegistryBase,
    registryDigest: digestAgentCanonicalValue(trustRegistryBase),
  });
  const adjudicator = authorities.find(({ role }) => role === 'adjudicator')!;
  const reviewerAuthorityIds = Object.freeze(
    authorities
      .filter(({ role }) => role === 'reviewer')
      .map(({ authorityId }) => authorityId)
      .sort(compareUnicodeCodePoints)
  );
  const adjudicationPolicyBase = Object.freeze({
    minimumIndependentRatings: plan.graderPlan.minimumIndependentVisualRatings,
    reviewerAuthorityIds,
    adjudicationAuthorityId: adjudicator.authorityId,
    adjudicatorKeyId: adjudicator.keyId,
    trigger: 'reviewer-disagreement' as const,
    trustRegistryDigest: trustRegistry.registryDigest,
    independencePolicyDigest,
    consensusRule: 'unanimous' as const,
    disagreementRule: 'escalate-to-independent-adjudicator' as const,
    reviewerRatingSignaturesRequired: true as const,
    adjudicatorDecisionSignatureRequired: true as const,
    signatureAlgorithm: 'Ed25519' as const,
    decisionPayloadFields:
      AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  });
  const adjudicationPolicy = Object.freeze({
    ...adjudicationPolicyBase,
    policyDigest: digestAgentCanonicalValue(adjudicationPolicyBase),
  });
  const authoritiesByPseudonym = new Map(
    authorities.map((authority) => [authority.pseudonym, authority])
  );
  const signedRatings = Object.freeze(
    humanReviewReport.ratings.map((rating) => {
      const authority = authoritiesByPseudonym.get(rating.reviewerPseudonym)!;
      const payload = Object.freeze({
        format: 'prodivix.g4-human-review-signed-rating' as const,
        version: 1 as const,
        ratingId: rating.ratingId,
        randomizedPresentationId: rating.randomizedPresentationId,
        rubricDigest: rating.rubricDigest,
        blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
        reviewerAuthorityId: authority.authorityId,
        reviewerPseudonym: rating.reviewerPseudonym,
        keyId: authority.keyId,
        criterionVerdicts: rating.criterionVerdicts,
        verdict: rating.verdict,
        ratedAt: V8_TIME.completed,
      });
      return Object.freeze({
        ...payload,
        ratingDigest: digestAgentCanonicalValue(payload),
        signatureBase64Url: V8_REVIEW_SIGNATURE,
      });
    })
  );
  const independenceAttestations = Object.freeze(
    authorities
      .filter(({ role }) => role === 'reviewer')
      .map((authority) => {
        const payload = Object.freeze({
          format: 'prodivix.g4-human-review-independence-attestation' as const,
          version: 1 as const,
          attestationId: `independence.${authority.pseudonym}`,
          planDigest: plan.planDigest,
          blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
          authorityId: authority.authorityId,
          authorityPseudonym: authority.pseudonym,
          role: 'reviewer' as const,
          keyId: authority.keyId,
          independencePolicyDigest,
          testedModelFamilyOwnerSetDigest: digestAgentCanonicalValue(
            plan.modelConfigurations
              .map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
              .sort(compareUnicodeCodePoints)
          ),
          conflictModelFamilyOwnerSetDigest: digestAgentCanonicalValue([]),
          issuedAt: V8_TIME.completed,
          expiresAt: V8_TIME.expires,
        });
        return Object.freeze({
          ...payload,
          attestationDigest: digestAgentCanonicalValue(payload),
          signatureBase64Url: V8_REVIEW_SIGNATURE,
        });
      })
  );
  const sourceProvenance = Object.freeze({
    sourceRunId: '30761547895',
    sourceRunAttempt: 1,
    sourceArtifactName: 'g4-blind-review',
    sourceArtifactDigest: `sha256:${'b'.repeat(64)}`,
  });
  const ratingsByPresentation = new Map<
    string,
    (typeof signedRatings)[number][]
  >();
  for (const rating of signedRatings) {
    const grouped =
      ratingsByPresentation.get(rating.randomizedPresentationId) ?? [];
    grouped.push(rating);
    ratingsByPresentation.set(rating.randomizedPresentationId, grouped);
  }
  const candidateAdjudications = Object.freeze(
    [...ratingsByPresentation.entries()]
      .map(([randomizedPresentationId, ratings]) =>
        Object.freeze({
          randomizedPresentationId,
          candidateDigest: digestAgentCanonicalValue({
            randomizedPresentationId,
            authority: 'validated-human-review',
          }),
          rubricDigest: ratings[0]!.rubricDigest,
          ratingDigests: Object.freeze(
            ratings
              .map(({ ratingDigest }) => ratingDigest)
              .sort(compareUnicodeCodePoints)
          ),
          reviewerAuthorityIds: Object.freeze(
            ratings
              .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
              .sort(compareUnicodeCodePoints)
          ),
          criterionVerdicts: ratings[0]!.criterionVerdicts,
          verdict: 'passed' as const,
        })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.randomizedPresentationId,
          right.randomizedPresentationId
        )
      )
  );
  const reviewLeaseDigest = digestAgentCanonicalValue({
    planDigest: plan.planDigest,
    authority: 'human-review-lease',
  });
  const validationReceiptBase = Object.freeze({
    format: 'prodivix.g4-human-review-validation-receipt' as const,
    version: 1 as const,
    receiptId: 'human-review-validation:evidence-v3',
    submissionId: 'human-review-submission:evidence-v3',
    submissionDigest: digestAgentCanonicalValue('human-review-submission'),
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest: digestAgentCanonicalValue('blind-bundle.evidence-v3'),
    reviewLeaseDigest,
    blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    trustRegistryDigest: trustRegistry.registryDigest,
    authoritySetDigest: trustRegistry.authoritySetDigest,
    adjudicationPolicyDigest: adjudicationPolicy.policyDigest,
    ratingSignatureSetDigest: digestAgentCanonicalValue(
      signedRatings.map(({ ratingDigest, signatureBase64Url }) => ({
        ratingDigest,
        signatureBase64Url,
      }))
    ),
    independenceAttestationSetDigest: digestAgentCanonicalValue(
      independenceAttestations.map(
        ({ attestationDigest, signatureBase64Url }) => ({
          attestationDigest,
          signatureBase64Url,
        })
      )
    ),
    adjudicationDecisionSetDigest: digestAgentCanonicalValue([]),
    candidateAdjudications,
    candidateAdjudicationSetDigest: digestAgentCanonicalValue(
      candidateAdjudications
    ),
    adjudicationDigest: humanReviewReport.adjudicationDigest,
    validatedAt: '2026-08-02T02:30:00.000Z',
  });
  const validationReceipt = Object.freeze({
    ...validationReceiptBase,
    receiptDigest: digestAgentCanonicalValue(validationReceiptBase),
  });
  const reviewPayload = Object.freeze({
    format: AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
    version: 1 as const,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest: validationReceipt.blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    signedRatings,
    independenceAttestations,
    adjudicationDecisions: Object.freeze([]),
    validationReceipt,
    reviewedAt: '2026-08-02T02:15:00.000Z',
  });
  const artifactAuthority = Object.freeze({
    authorityId: adjudicator.authorityId,
    keyId: adjudicator.keyId,
    workflowName: 'g4-real-model-human-review' as const,
    workflowRunId: '30761547896',
    workflowRunAttempt: 1,
    signedAt: validationReceipt.validatedAt,
    payloadDigest: digestAgentCanonicalValue(reviewPayload),
    signatureBase64Url: V8_REVIEW_SIGNATURE,
  });
  const reviewArtifact: AgentEvaluationHumanReviewImport = Object.freeze({
    ...reviewPayload,
    artifactAuthority,
    artifactDigest: digestAgentCanonicalValue({
      ...reviewPayload,
      artifactAuthority,
    }),
  });
  return createAgentEvaluationValidatedHumanReviewArtifact({
    reviewArtifact,
    humanReviewReport,
    publicRubrics: Object.freeze([createV8PublicReviewRubric()]),
    trustRegistry,
    adjudicationPolicy,
  });
};

export const createV8ValidatedHumanMetricObservations = (
  plan: AgentModelEvaluationPlan,
  attempts: readonly AgentModelEvaluationAttempt[],
  report: AgentHumanReviewReport
): readonly AgentEvaluationValidatedHumanMetricObservation[] => {
  const attemptById = new Map(
    attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const artifactDigest = digestAgentCanonicalValue(
    'validated-human-review-artifact-v8'
  );
  const reviewLeaseDigest = digestAgentCanonicalValue('review-lease-v8');
  const metricMappings = createV8PublicReviewRubric().metricMappings;
  const ratingsByPresentation = new Map<
    string,
    (typeof report.ratings)[number][]
  >();
  for (const rating of report.ratings) {
    const ratings =
      ratingsByPresentation.get(rating.randomizedPresentationId) ?? [];
    ratings.push(rating);
    ratingsByPresentation.set(rating.randomizedPresentationId, ratings);
  }
  return Object.freeze(
    [...ratingsByPresentation.entries()]
      .flatMap(([randomizedPresentationId, ratings]) => {
        const attempt = attemptById.get(ratings[0]!.attemptId)!;
        const common = Object.freeze({
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: attempt.descriptor.attemptId,
          descriptorDigest: attempt.descriptor.descriptorDigest,
          randomizedPresentationId,
          rubricDigest: ratings[0]!.rubricDigest,
          graderId: plan.graderPlan.blindHumanGraderIds[0]!,
          graderKind: 'blind-human-rubric' as const,
          authority: 'human' as const,
          verdict: 'passed' as const,
          ratingDigests: Object.freeze(
            ratings
              .map(({ ratingDigest }) => ratingDigest)
              .sort(compareUnicodeCodePoints)
          ),
          reviewerAuthorityIds: Object.freeze(
            ratings
              .map(({ reviewerPseudonym }) => reviewerPseudonym)
              .sort(compareUnicodeCodePoints)
          ),
          candidateAdjudicationDigest: digestAgentCanonicalValue({
            randomizedPresentationId,
            verdict: 'passed',
          }),
          reviewLeaseDigest,
          humanReviewReportDigest: report.reportDigest,
          validatedHumanReviewArtifactDigest: artifactDigest,
          observedAt: report.generatedAt,
        });
        return [
          ...metricMappings.map((mapping) =>
            createAgentEvaluationValidatedHumanMetricObservation({
              ...common,
              metricId: mapping.metricId,
              basis: 'rubric-all-pass',
              criterionIds: mapping.criterionIds,
            })
          ),
          createAgentEvaluationValidatedHumanMetricObservation({
            ...common,
            metricId: 'visual.inter-rater-disagreement',
            basis: 'inter-rater-disagreement',
            criterionIds: V8_REVIEW_CRITERION_IDS,
          }),
        ];
      })
      .sort((left, right) =>
        left.observationId < right.observationId ? -1 : 1
      )
  );
};

export const createV8HoldoutReceipt = (
  plan: AgentModelEvaluationPlan
): AgentHoldoutExecutionReceipt =>
  createAgentHoldoutExecutionReceipt({
    receiptId: 'holdout-receipt.g4-v8.minimum',
    planDigest: plan.planDigest,
    protectedHoldoutManifestDigest: plan.protectedHoldoutManifestDigest,
    accessPolicyDigest: digestAgentCanonicalValue('holdout-access-v8'),
    encryptedCorpusDigest: digestAgentCanonicalValue('encrypted-holdout-v8'),
    executedCaseIds: plan.concreteCases
      .filter(({ access }) => access === 'protected-holdout')
      .map(({ caseId }) => caseId),
    publicArtifactScanDigest: digestAgentCanonicalValue(
      'holdout-scan-clean-v8'
    ),
    leakedCaseIds: Object.freeze([]),
    executorPrincipalId: 'evaluation-holdout-runner',
    executedAt: V8_TIME.evaluated,
  });

export type V8Reports = Readonly<{
  metric: AgentEvaluationMetricReport;
  grader: AgentEvaluationGraderReport;
  human: AgentHumanReviewReport;
  holdout: AgentHoldoutExecutionReceipt;
}>;
