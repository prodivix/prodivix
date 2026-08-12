import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createV8QualificationAuthorityArchiveFixture } from '../__tests__/agentV8Fixtures';
import {
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeProgramReceipt,
  digestAgentCapabilityProbeProfile,
} from '../providers/agentCapabilityProbeProgram';
import { createAgentCapabilityProbeProviderResourceAuthority } from '../providers/agentCapabilityProbeProviderResource';
import { createAgentHostedRetrievalRuntimeResourceRegistrationIntent } from '../providers/agentHostedRetrievalRuntimeResource';
import { createAgentRetrievalQueryReceipt } from '../hosted/agentRetrieval';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import {
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
} from '../providers/agentNativeProviderStateVault';
import {
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  digestAgentEvaluationCapabilityEffectToolArguments,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentEvaluationRuntimeFactSourceAuthority,
} from './agentEvaluationPlan';
import {
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt,
} from './agentEvaluationProviderCapabilityObservation';
import {
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt,
} from './agentEvaluationNativeOptionalCapabilityBootstrap';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_STAGE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_DISPATCH_ACK_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_OWNER_ADMISSION_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT,
  createAgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  createAgentEvaluationCapabilityProbeAdmissionResponse,
  createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  createAgentEvaluationCapabilityProbeReferenceArchiveRecord,
  createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord,
  createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
  createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  createAgentEvaluationRuntimeFactSourceRegistrationReceipt,
  isAgentEvaluationCapabilityProbeAdmissionRequest,
  isAgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  isAgentEvaluationCapabilityProbeReferenceArchiveRecord,
  isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord,
  isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
  isAgentEvaluationQualificationAuthorityArchiveFamilyBudget,
  isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  projectAgentEvaluationQualificationAuthorityArchiveRecord,
  type AgentEvaluationCapabilityProbeAdmissionResponse,
  type AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord,
  type AgentEvaluationRuntimeFactSourceRegistrationReceipt,
} from './agentEvaluationEvidenceArchiveAuthorityRecords';
import {
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveOrderKey,
  createAgentModelEvaluationEvidenceArchiveRecord,
  digestAgentModelEvaluationEvidenceArchiveSemanticRecord,
  isAgentModelEvaluationEvidenceArchiveRecord,
} from './agentEvaluationEvidenceArchive';

const COMMIT = '1234567890abcdef1234567890abcdef12345678';
const OBSERVED_AT = '2026-08-09T03:00:00.000Z';
const digest = (label: string) => digestAgentCanonicalValue({ label });

const adapterBase = Object.freeze({
  adapterId: 'adapter.openai-responses',
  adapterVersion: '1.0.0',
  protocolFamily: 'openai-responses' as const,
  transportSchemaDigest: digest('transport-schema'),
  eventNormalizationDigest: digest('event-normalization'),
});
const adapter = Object.freeze({
  ...adapterBase,
  adapterDigest: digestAgentCanonicalValue(adapterBase),
});
const provider = Object.freeze({
  providerConfigurationId: 'provider.release.openai-responses',
  providerOperatorId: 'provider-operator.openai',
  endpointClass: 'first-party-hosted' as const,
  endpointProfileDigest: digest('endpoint-profile'),
  adapter,
  dataPolicyDigest: digest('data-policy'),
});
const modelBase = Object.freeze({
  modelId: 'model.release.openai-responses',
  modelFamilyId: 'model-family.release.openai-responses',
  modelFamilyOwnerId: 'model-owner.openai',
});
const model = Object.freeze({
  ...modelBase,
  lineageDigest: digestAgentCanonicalValue(modelBase),
});
const profileDigest = digestAgentCapabilityProbeProfile(
  'g4-provider-hosted-retrieval-core'
);
const probeProgram = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-hosted-retrieval-core',
  capabilityProfileDigest: profileDigest,
});
const ownerImplementationDigest = digest('probe-owner-implementation');
const authorityIssuerId = 'authority.release.capability-probe';
const probeProviderResourceAuthority =
  createAgentCapabilityProbeProviderResourceAuthority(probeProgram, {
    protocolFamily: 'openai-responses',
    providerConfigurationId: provider.providerConfigurationId,
    modelId: model.modelId,
    modelLineageDigest: model.lineageDigest,
    adapterDigest: adapter.adapterDigest,
    providerResourceId: 'probe-resource.openai.retrieval-core',
    resourceManifestDigest: digest('probe-resource-manifest'),
    contentUploadReceiptDigest: digest('probe-resource-upload'),
    deletionAuthorityReceiptDigest: digest('probe-resource-delete'),
    registeredAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-10T00:00:00.000Z',
  });

const referenceFormats = Object.freeze([
  'prodivix.agent-evaluation-capability-probe-request',
  'prodivix.agent-evaluation-capability-probe-response',
  'prodivix.agent-evaluation-capability-probe-dispatch-receipt',
  'prodivix.agent-evaluation-capability-probe-transport-receipt',
  'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt',
  'prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt',
] as const);

const createProbeArchiveFixture = () => {
  const requestBase = Object.freeze({
    format: 'prodivix.agent-evaluation-capability-probe-admission-request',
    version: 1,
    namespaceId: 'namespace.release',
    repositoryCommit: COMMIT,
    providerConfiguration: provider,
    modelLineage: model,
    qualificationCapabilityProfileId: 'g4-provider-hosted-retrieval-core',
    qualificationCapabilityProfileDigest: profileDigest,
    capabilityId: 'provider.hosted-retrieval',
    declaredCapabilityProfileDigests: Object.freeze([profileDigest]),
    probeProgram,
    probeProviderResourceAuthority,
    minimumExpiresAt: '2026-08-10T00:00:00.000Z',
  });
  const request = Object.freeze({
    ...requestBase,
    requestDigest: digestAgentCanonicalValue(requestBase),
  });
  let previousReceiptDigest: string | null = null;
  const referenceBundle = AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.map(
    (kind, ordinal) => {
      const sourceReceipt = Object.freeze({
        format: `prodivix.fixture.${kind}-source`,
        version: 1,
        admissionRequestDigest: request.requestDigest,
        ordinal,
      });
      const receipt = Object.freeze({
        format: referenceFormats[ordinal]!,
        version: 1,
        admissionRequestDigest: request.requestDigest,
        providerConfigurationDigest: digestAgentCanonicalValue(provider),
        modelLineageDigest: model.lineageDigest,
        qualificationCapabilityProfileDigest: profileDigest,
        capabilityId: 'provider.hosted-retrieval',
        probeProgramDigest: probeProgram.programDigest,
        profileProjectionDigest: probeProgram.profileProjectionDigest,
        adapterDigest: adapter.adapterDigest,
        ownerImplementationDigest,
        authorityIssuerId,
        previousReceiptDigest,
        observedAt: OBSERVED_AT,
        sourceReceipt,
        sourceReceiptDigest: digestAgentCanonicalValue(sourceReceipt),
      });
      const entry = Object.freeze({
        kind,
        receipt,
        receiptDigest: digestAgentCanonicalValue(receipt),
      });
      previousReceiptDigest = entry.receiptDigest;
      return entry;
    }
  );
  const observedLimits = createAgentCapabilityProbeObservedLimits(
    probeProgram,
    {
      requestBytes: 1_024,
      responseBytes: 2_048,
      normalizedFactCount: 0,
      toolCallCount: 0,
      providerRoundTripCount: 1,
      pollAttemptCount: 0,
      observedMaximumSingleDispatchMs: 1_000,
      observedExecutionDurationMs: 1_000,
    }
  );
  const observation = createAgentCapabilityProbeProgramObservation(
    probeProgram,
    {
      providerConfigurationDigest: digestAgentCanonicalValue(provider),
      modelLineageDigest: model.lineageDigest,
      adapterDigest: adapter.adapterDigest,
      probeRequestDigest: referenceBundle[0]!.receiptDigest,
      providerResponseDigest: referenceBundle[1]!.receiptDigest,
      normalizedEventSetDigest: referenceBundle[5]!.receiptDigest,
      status: 'unsupported',
      observedFacts: Object.freeze([]),
      semanticProof: null,
      denial: Object.freeze({
        denialKind: 'provider-feature-unavailable' as const,
        denialFactDigest: digest('probe-denial'),
      }),
      observedLimits,
      observedAt: OBSERVED_AT,
    }
  );
  const receipt = createAgentCapabilityProbeProgramReceipt({
    probeId: 'probe.release.retrieval-core',
    program: probeProgram,
    observation,
    declaredCapabilityProfileDigests: Object.freeze([profileDigest]),
    probedAt: OBSERVED_AT,
    expiresAt: '2026-08-10T00:00:00.000Z',
  });
  const probeEvidence = createAgentEvaluationProductionCapabilityProbeEvidence({
    authorityKind: 'sealed-provider-capability-probe',
    authorityIssuerId,
    ownerImplementationDigest,
    adapterDigest: adapter.adapterDigest,
    probeRequestDigest: referenceBundle[0]!.receiptDigest,
    probeResponseDigest: referenceBundle[1]!.receiptDigest,
    dispatchReceiptDigest: referenceBundle[2]!.receiptDigest,
    transportReceiptDigest: referenceBundle[3]!.receiptDigest,
    responseSpoolDigest: referenceBundle[4]!.receiptDigest,
    normalizedEventSetDigest: referenceBundle[5]!.receiptDigest,
    probeProgram,
    normalizedObservation: observation,
    receipt,
  });
  const response = createAgentEvaluationCapabilityProbeAdmissionResponse({
    request,
    probeEvidence,
    ownerImplementationDigest,
  });
  const admission = createAgentEvaluationCapabilityProbeAdmissionArchiveRecord({
    requestDigest: request.requestDigest,
    stageDigest: response.stageDigest,
    dispatchAckDigest: response.dispatchAckDigest,
    admissionReceiptDigest: response.admissionReceiptDigest,
    request,
    referenceBundle,
    response,
  });
  const references = referenceBundle.map((entry, ordinal) =>
    createAgentEvaluationCapabilityProbeReferenceArchiveRecord({
      admissionRequestDigest: request.requestDigest,
      ordinal,
      kind: entry.kind,
      receiptDigest: entry.receiptDigest,
      receipt: entry.receipt,
    })
  );
  return Object.freeze({ admission, references });
};

const hostedRuntimeResourceRegistrationIntent =
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
    providerConfigurationId: provider.providerConfigurationId,
    providerConfigurationDigest: digestAgentCanonicalValue(provider),
    protocolFamily: 'openai-responses',
    modelId: model.modelId,
    modelLineageDigest: model.lineageDigest,
    adapterDigest: adapter.adapterDigest,
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: profileDigest,
    probeProgramDigest: probeProgram.programDigest,
    publicResourceDescriptorDigest: digestAgentCanonicalValue({
      kind: 'hosted-retrieval-runtime-public-resource',
      capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    }),
  });

const runtimeFactSourceAuthority =
  createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-hosted-owner-result',
    sourceAuthorityId: 'runtime-source.release.retrieval-core',
    sourceAuthorityImplementationDigest: digest(
      'runtime-source-implementation'
    ),
    routeBinding: 'runtime-fact-source.retrieval-core',
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: profileDigest,
    capabilityId: 'provider.hosted-retrieval',
    protocolFamily: 'openai-responses',
    providerConfigurationId: provider.providerConfigurationId,
    modelId: model.modelId,
    modelLineageDigest: model.lineageDigest,
    adapterDigest: adapter.adapterDigest,
    registrationAuthorityIssuerId: 'authority.release.runtime-registration',
    registrationReceiptDigest: digest('registration-receipt'),
    hostedRetrievalRuntimeResourceRegistrationIntentDigest:
      hostedRuntimeResourceRegistrationIntent.intentDigest,
  });

const createRegistrationArchiveFixture = () => {
  const requestBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request',
    version: 1,
    namespaceId: 'namespace.release',
    repositoryCommit: COMMIT,
    sourceAuthorityKind: 'shared-durable-capability',
    sourceKind: runtimeFactSourceAuthority.sourceKind,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    routeBinding: runtimeFactSourceAuthority.routeBinding,
    capabilityProfileId: runtimeFactSourceAuthority.capabilityProfileId,
    capabilityProfileDigest: runtimeFactSourceAuthority.capabilityProfileDigest,
    capabilityId: runtimeFactSourceAuthority.capabilityId,
    protocolFamily: runtimeFactSourceAuthority.protocolFamily as
      'openai-responses' | 'anthropic-messages' | 'gemini-interactions',
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelId: runtimeFactSourceAuthority.modelId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    hostedRetrievalRuntimeResourceRegistrationIntentDigest:
      hostedRuntimeResourceRegistrationIntent.intentDigest,
    minimumExpiresAt: '2026-08-10T00:00:00.000Z',
  });
  const request = Object.freeze({
    ...requestBase,
    requestDigest: digestAgentCanonicalValue(requestBase),
  });
  const ownerHealthBase = Object.freeze({
    format: 'prodivix.agent-evaluation-runtime-fact-source-owner-health',
    version: 1,
    requestDigest: request.requestDigest,
    sourceAuthorityId: request.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      request.sourceAuthorityImplementationDigest,
    sourceKind: request.sourceKind,
    routeBinding: request.routeBinding,
    status: 'ready',
    checkedAt: OBSERVED_AT,
    expiresAt: '2026-08-10T00:00:00.000Z',
  });
  const ownerHealth = Object.freeze({
    ...ownerHealthBase,
    healthDigest: digestAgentCanonicalValue(ownerHealthBase),
  });
  const receipt = createAgentEvaluationRuntimeFactSourceRegistrationReceipt({
    request,
    ownerHealth,
    registrationAuthorityIssuerId:
      runtimeFactSourceAuthority.registrationAuthorityIssuerId,
    registeredAt: OBSERVED_AT,
    expiresAt: '2026-08-10T00:00:00.000Z',
  });
  return createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord({
    registrationReceiptDigest: receipt.registrationReceiptDigest,
    requestDigest: request.requestDigest,
    ownerHealthDigest: ownerHealth.healthDigest,
    request,
    ownerHealth,
    receipt,
  });
};

const createOptionalFactArchiveFixture = () => {
  const sourceHandleDigest = digest('optional-source-handle');
  const targetRef = 'target.release.retrieval';
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId: 'namespace.release',
      planDigest: digest('plan'),
      repositoryCommit: COMMIT,
      attemptId: 'attempt.release.1',
      descriptorDigest: digest('descriptor'),
      turnIndex: 2,
      invocationId: 'invocation.release.3',
      bindingKind: 'hosted-retrieval-query',
      capabilityId: 'provider.hosted-retrieval',
      toolId: 'provider.retrieval.search',
      targetRef,
      protocolFamily: 'openai-responses',
      providerConfigurationId:
        runtimeFactSourceAuthority.providerConfigurationId,
      modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
      adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest:
        runtimeFactSourceAuthority.authorityDigest,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      issuedAt: '2026-08-09T02:59:58.000Z',
      expiresAt: '2026-08-09T03:02:03.000Z',
    });
  const requestRef = requestRefAuthority.requestRef;
  const argumentsDigest = digestAgentEvaluationCapabilityEffectToolArguments({
    requestRef,
    targetRef,
  });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind: 'hosted-retrieval-query',
        capabilityId: 'provider.hosted-retrieval',
        requestRef,
        targetRef,
        requestRefAuthority,
        requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
        sourceAttemptId: 'attempt.release.1',
        sourceTurnIndex: 2,
        sourceInvocationId: 'invocation.release.3',
        sourceProviderRequestDigest: digest('provider-request'),
        sourceResponseDigest: digest('source-provider-response'),
        sourceDispatchIntentDigest: digest('source-dispatch'),
        sourceTransportReceiptDigest: digest('source-transport'),
        sourceResultSpoolReceiptDigest: digest('source-spool'),
        sourceNormalizedEventSetDigest: digest('source-normalized-events'),
        sourceObservationReceiptDigest: null,
        sourceFactKind: 'provider-event',
        sourceProviderEventType: 'tool-call',
        sourceProviderToolCallId: 'provider-tool-call.release.1',
        sourceToolId: 'provider.retrieval.search',
        sourceArgumentsDigest: argumentsDigest,
        sourceHandleDigest,
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        protocolFamily: 'openai-responses',
        providerConfigurationId:
          runtimeFactSourceAuthority.providerConfigurationId,
        modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      })
    );
  const intentBinding = Object.freeze({
    namespaceId: 'namespace.release',
    planDigest: digest('plan'),
    repositoryCommit: COMMIT,
    attemptId: 'attempt.release.1',
    descriptorDigest: digest('descriptor'),
    caseId: 'case.release.retrieval',
    materialDigest: digest('material'),
    turnIndex: 2,
    invocationId: 'invocation.release.3',
    toolId: 'provider.retrieval.search',
    toolCallId: 'tool-call.release.1',
    providerToolCallId: 'provider-tool-call.release.1',
    providerRequestDigest: digest('provider-request'),
    argumentsDigest,
    requestedAt: '2026-08-09T03:00:00.000Z',
    inputAuthorityBinding,
    runtimeFactSourceAuthority,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
  });
  const intent = createAgentEvaluationCapabilityPreEffectIntent({
    ...intentBinding,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentBinding),
  });
  const retrieval = createAgentRetrievalQueryReceipt({
    queryId: 'query.release.retrieval.1',
    toolDescriptorDigest: digest('retrieval-tool-descriptor'),
    queryDigest: digest('retrieval-query'),
    purpose: 'authorized-project-retrieval',
    networkPolicyDigest: digest('retrieval-network-policy'),
    sources: Object.freeze([]),
    indexDigest: digest('retrieval-index'),
    retrievalConfigurationDigest: digest('retrieval-configuration'),
    usageRef: 'usage.release.retrieval.1',
    startedAt: '2026-08-09T02:59:59.000Z',
    completedAt: OBSERVED_AT,
  });
  const fact = Object.freeze({
    factKind: 'retrieval-query-receipt' as const,
    factDigest: retrieval.receiptDigest,
    value: retrieval,
  });
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
      intentDigest: intent.intentDigest,
      ownerRequestId: intent.ownerRequestId,
      ownerRequestDigest: intent.ownerRequestDigest,
      runtimeFactSourceAuthority,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      effectStatus: 'produced',
      businessResultDigest: digest('business-result'),
      providerRuntimeJournalResultRecordDigest: digest(
        'provider-runtime-result-record'
      ),
      providerRuntimeResultSealReceiptDigest: digest(
        'provider-runtime-result-seal'
      ),
      sourceFactKind: fact.factKind,
      sourceFactDigest: fact.factDigest,
      stageDigest: digest('effect-stage'),
      dispatchAckDigest: digest('effect-ack'),
      transportReceiptDigest: digest('effect-transport'),
      resultSpoolReceiptDigest: digest('effect-spool'),
      normalizedEventSetDigest: digest('effect-normalized-events'),
      stateVaultResolveRequest: null,
      stateVaultResolveReceipt: null,
      stateVaultRetireRequest: null,
      stateVaultRetirementReceipt: null,
      specificReceiptDigests: Object.freeze([]),
      sealedAt: OBSERVED_AT,
    });
  const responseDigest = digest('provider-response');
  const dispatchIntentDigest = digest('provider-dispatch');
  const envelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
      intent,
      effectSourceReceipt,
      {
        planDigest: intent.planDigest,
        repositoryCommit: intent.repositoryCommit,
        attemptId: intent.attemptId,
        descriptorDigest: intent.descriptorDigest,
        turnIndex: intent.turnIndex,
        invocationId: intent.invocationId,
        requestDigest: intent.providerRequestDigest,
        responseDigest,
        protocolFamily: 'openai-responses',
        providerConfigurationId:
          runtimeFactSourceAuthority.providerConfigurationId,
        modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: runtimeFactSourceAuthority.adapterDigest,
        dispatchIntentDigest,
        observedAt: OBSERVED_AT,
        fact,
      }
    )!;
  const factAuthority =
    createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
      envelope
    );
  const originalSourceRequestDigest = digest('optional-source-request');
  const sourceReceiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt',
    version: 1,
    namespaceId: intent.namespaceId,
    planDigest: intent.planDigest,
    repositoryCommit: intent.repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    targetId: 'target.release.retrieval',
    targetDigest: digest('target'),
    capabilityProfileId: runtimeFactSourceAuthority.capabilityProfileId,
    capabilityProfileDigest: runtimeFactSourceAuthority.capabilityProfileDigest,
    capabilityDescriptorDigest: digest('capability-descriptor'),
    capabilityId: runtimeFactSourceAuthority.capabilityId,
    supportExpectation: 'required',
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    protocolFamily: runtimeFactSourceAuthority.protocolFamily,
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelId: runtimeFactSourceAuthority.modelId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    providerRequestDigest: intent.providerRequestDigest,
    responseDigest,
    dispatchIntentDigest,
    transportReceiptDigest: effectSourceReceipt.transportReceiptDigest,
    resultSpoolReceiptDigest: effectSourceReceipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: effectSourceReceipt.normalizedEventSetDigest,
    targetAuthorityDigest: runtimeFactSourceAuthority.authorityDigest,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: runtimeFactSourceAuthority.routeBinding,
    registrationAuthorityIssuerId:
      runtimeFactSourceAuthority.registrationAuthorityIssuerId,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
    sourceKind: runtimeFactSourceAuthority.sourceKind,
    sourceDigest: digest('source'),
    sourceRequestDigest: originalSourceRequestDigest,
    outcome: 'observed',
    observedAt: OBSERVED_AT,
    sealedAt: OBSERVED_AT,
    ownerRequestDigest: effectSourceReceipt.ownerRequestDigest,
    ownerReceiptDigest: effectSourceReceipt.receiptDigest,
    ownerStageDigest: effectSourceReceipt.stageDigest,
    ownerDispatchAckDigest: effectSourceReceipt.dispatchAckDigest,
    preEffectIntentDigest: intent.intentDigest,
    effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
    providerRuntimeJournalResultRecordDigest:
      effectSourceReceipt.providerRuntimeJournalResultRecordDigest,
    providerRuntimeResultSealReceiptDigest:
      effectSourceReceipt.providerRuntimeResultSealReceiptDigest,
    effectSourceFactDigest: fact.factDigest,
    businessResultDigest: effectSourceReceipt.businessResultDigest,
    fact,
  });
  const sourceReceipt = Object.freeze({
    ...sourceReceiptBase,
    sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
  });
  const sourceRecord =
    createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
      attemptId: intent.attemptId,
      turnIndex: intent.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      sourceReceipt,
      preEffectIntent: intent,
      effectSourceReceipt,
      effectSourceFact: fact,
    });
  const stageRequest = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-authority-stage-request',
    version: 1,
    planDigest: intent.planDigest,
    repositoryCommit: intent.repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: intent.turnIndex,
    sourceSealDigest: sourceReceipt.sourceSealDigest,
  });
  const authorityRequestDigest = digestAgentCanonicalValue(stageRequest);
  const stageDigest = digest('optional-authority-stage');
  const dispatchAckDigest = digest('optional-authority-ack');
  const sealedResponseBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-authority-response',
    version: 1,
    outcome: 'observed',
    authorityRequestDigest,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    stageDigest,
    dispatchAckDigest,
    runtimeFactEnvelopes: Object.freeze([envelope]),
    factAuthorities: Object.freeze([factAuthority]),
  });
  const sealedResponse = Object.freeze({
    ...sealedResponseBase,
    resultDigest: digestAgentCanonicalValue(sealedResponseBase),
  });
  const authorityRecord =
    createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
      attemptId: intent.attemptId,
      turnIndex: intent.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      authorityRequestDigest,
      stageDigest,
      dispatchAckDigest,
      resultDigest: sealedResponse.resultDigest,
      stageRequest,
      fact,
      runtimeFactEnvelope: envelope,
      factAuthority,
      sealedResponse,
    });
  return Object.freeze({ sourceRecord, authorityRecord });
};

const createNativeBootstrapOptionalFactArchiveFixture = (
  outcome: 'observed' | 'unavailable' | 'failed' = 'observed'
) => {
  const nativeProfileDigest = digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  );
  const nativeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: 'g4-provider-background-job',
    capabilityProfileDigest: nativeProfileDigest,
  });
  const nativeRuntimeFactSourceAuthority =
    createAgentEvaluationRuntimeFactSourceAuthority({
      kind: 'shared-durable-capability',
      sourceKind: 'sealed-provider-response-metadata',
      sourceAuthorityId: 'authority.release.native-bootstrap',
      sourceAuthorityImplementationDigest: digest(
        'native-bootstrap-source-implementation'
      ),
      routeBinding: 'route.release.native-bootstrap',
      capabilityProfileId: 'g4-provider-background-job',
      capabilityProfileDigest: nativeProfileDigest,
      capabilityId: 'provider.background-job',
      protocolFamily: 'openai-responses',
      providerConfigurationId: provider.providerConfigurationId,
      modelId: model.modelId,
      modelLineageDigest: model.lineageDigest,
      adapterDigest: adapter.adapterDigest,
      registrationAuthorityIssuerId: 'authority.backend-8790.production',
      registrationReceiptDigest: digest('native-bootstrap-registration'),
    });
  const nativeProviderRequestDigest = digest('native-bootstrap-request');
  const nativeProviderResponseDigest = digest('native-bootstrap-response');
  const nativeInvocationId = 'invocation.release.native-bootstrap.1';
  const stateVaultAuthority = createAgentNativeProviderStateVaultAuthority({
    authorityId: 'provider-state-vault.release.native-bootstrap',
    authorityImplementationDigest: digest(
      'native-bootstrap-vault-implementation'
    ),
    algorithm: 'aes-256-gcm',
    keyReferenceDigest: digest('native-bootstrap-vault-wrapping-key'),
    keyVersion: 1,
    encryptionProfileDigest: digest(
      'native-bootstrap-vault-encryption-profile'
    ),
    retentionPolicyDigest: digest('native-bootstrap-vault-retention-policy'),
    deletionReceiptPolicyDigest: digest(
      'native-bootstrap-vault-deletion-policy'
    ),
  });
  const stateVaultSealRequest =
    outcome === 'observed'
      ? createAgentNativeProviderStateVaultSealRequest({
          authorityDigest: stateVaultAuthority.authorityDigest,
          purpose: 'background-job-state',
          attemptId: 'attempt.release.native-bootstrap.1',
          protocolFamily: 'openai-responses',
          providerStateReferenceKind: 'response-id',
          providerStateReferenceDigest: digest('native-bootstrap-job-state'),
          probeProgramDigest: nativeProgram.programDigest,
          capabilityProfileDigest: nativeProfileDigest,
          invocationId: nativeInvocationId,
          requestDigest: nativeProviderRequestDigest,
          responseDigest: nativeProviderResponseDigest,
          responseBodyDigest: digest('native-bootstrap-response-body'),
          sealedResponseJsonDigest: digest('native-bootstrap-response-json'),
          providerConfigurationId: provider.providerConfigurationId,
          modelLineageDigest: model.lineageDigest,
          adapterDigest: adapter.adapterDigest,
          taskId: 'task.release.native-bootstrap.1',
          runId: 'run.release.native-bootstrap.1',
          generation: 1,
          observedAt: OBSERVED_AT,
          expiresAt: '2026-08-09T03:02:05.000Z',
        })
      : null;
  const stateKeyCreationReceiptDigest = digest(
    'native-bootstrap-state-key-created'
  );
  const stateVaultSealReceipt =
    stateVaultSealRequest === null
      ? null
      : createAgentNativeProviderStateVaultSealReceipt(stateVaultSealRequest, {
          status: 'sealed',
          opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
            authorityDigest: stateVaultAuthority.authorityDigest,
            sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
            stateKeyCreationReceiptDigest,
          }),
          stateKeyCreationReceiptDigest,
          sealedAt: '2026-08-09T03:00:00.250Z',
        });
  const stateVaultRetireRequest =
    stateVaultSealRequest === null || stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetireRequest({
          sealRequest: stateVaultSealRequest,
          sealReceipt: stateVaultSealReceipt,
          resolveRequest: null,
          resolveReceipt: null,
          disposition: 'cancelled',
          requestedAt: '2026-08-09T03:00:02.000Z',
        });
  const stateVaultRetirementReceipt =
    stateVaultRetireRequest === null ||
    stateVaultSealRequest === null ||
    stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetirementReceipt(
          stateVaultRetireRequest,
          stateVaultSealRequest,
          stateVaultSealReceipt,
          {
            status: 'retired',
            stateKeyDestructionReceiptDigest: digest(
              'native-bootstrap-state-key-destroyed'
            ),
            opaqueRecordDeletionReceiptDigest: digest(
              'native-bootstrap-state-record-deleted'
            ),
            retiredAt: '2026-08-09T03:00:02.250Z',
          }
        );
  const nativeSourceReceipt =
    outcome === 'observed'
      ? createAgentNativeProviderOptionalCapabilitySourceReceipt(
          nativeProgram,
          {
            protocolFamily: 'openai-responses',
            capabilityProfileDigest: nativeProfileDigest,
            invocationId: nativeInvocationId,
            requestDigest: nativeProviderRequestDigest,
            responseDigest: nativeProviderResponseDigest,
            providerConfigurationId: provider.providerConfigurationId,
            modelLineageDigest: model.lineageDigest,
            adapterDigest: adapter.adapterDigest,
            executionIdentityAuthority:
              createAgentNativeProviderExecutionIdentityAuthority({
                invocationId: nativeInvocationId,
                taskId: 'task.release.native-bootstrap.1',
                runId: 'run.release.native-bootstrap.1',
                generation: 1,
              }),
            source: Object.freeze({
              sourceKind: 'provider-job-terminal-status',
              providerStateReferenceDigest: digest(
                'native-bootstrap-job-state'
              ),
              opaqueProviderStateRef:
                stateVaultSealReceipt!.opaqueProviderStateRef!,
              stateVaultAuthorityDigest: stateVaultAuthority.authorityDigest,
              stateVaultSealRequestDigest:
                stateVaultSealRequest!.sealRequestDigest,
              stateVaultSealReceiptDigest: stateVaultSealReceipt!.receiptDigest,
              taskId: 'task.release.native-bootstrap.1',
              runId: 'run.release.native-bootstrap.1',
              generation: 1,
              providerStatus: 'completed',
            }),
            observedAt: OBSERVED_AT,
          }
        )
      : null;
  const bootstrapSourceRequest =
    createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
      nativeProgram,
      {
        namespaceId: 'namespace.release',
        planDigest: digest('native-bootstrap-plan'),
        repositoryCommit: COMMIT,
        attemptId: 'attempt.release.native-bootstrap.1',
        descriptorDigest: digest('native-bootstrap-descriptor'),
        turnIndex: 1,
        invocationId: nativeInvocationId,
        providerRequestDigest: nativeProviderRequestDigest,
        providerResponseDigest: nativeProviderResponseDigest,
        protocolFamily: 'openai-responses',
        providerConfigurationId: provider.providerConfigurationId,
        modelLineageDigest: model.lineageDigest,
        adapterDigest: adapter.adapterDigest,
        dispatchIntentDigest: digest('native-bootstrap-dispatch'),
        transportReceiptDigest: digest('native-bootstrap-transport'),
        resultSpoolReceiptDigest: digest('native-bootstrap-spool'),
        normalizedEventSetDigest: digest('native-bootstrap-normalized'),
        transportCompletedAt: '2026-08-09T02:59:59.000Z',
        runtimeFactSourceAuthority: nativeRuntimeFactSourceAuthority,
        outcome,
        nativeSourceReceipt,
        observedAt: OBSERVED_AT,
      }
    );
  const bootstrapSourceReceipt =
    createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
      nativeProgram,
      {
        sourceRequest: bootstrapSourceRequest,
        sealedAt: '2026-08-09T03:00:01.000Z',
      }
    );
  const bootstrapFact = bootstrapSourceRequest.fact;
  const nativeProviderSourceReceiptDigest =
    nativeSourceReceipt?.receiptDigest ?? null;
  const nativeProviderSourceDigest = nativeSourceReceipt?.sourceDigest ?? null;
  const nativeProviderSourceFactDigest = bootstrapFact?.factDigest ?? null;
  const sourceProjection = Object.freeze({
    kind: nativeRuntimeFactSourceAuthority.sourceKind,
    planDigest: bootstrapSourceRequest.planDigest,
    repositoryCommit: bootstrapSourceRequest.repositoryCommit,
    attemptId: bootstrapSourceRequest.attemptId,
    descriptorDigest: bootstrapSourceRequest.descriptorDigest,
    turnIndex: bootstrapSourceRequest.turnIndex,
    invocationId: bootstrapSourceRequest.invocationId,
    providerRequestDigest: bootstrapSourceRequest.providerRequestDigest,
    responseDigest: bootstrapSourceRequest.providerResponseDigest,
    dispatchIntentDigest: bootstrapSourceRequest.dispatchIntentDigest,
    transportReceiptDigest: bootstrapSourceRequest.transportReceiptDigest,
    resultSpoolReceiptDigest: bootstrapSourceRequest.resultSpoolReceiptDigest,
    normalizedEventSetDigest: bootstrapSourceRequest.normalizedEventSetDigest,
    nativeBootstrapSourceRequestDigest: bootstrapSourceRequest.requestDigest,
    nativeBootstrapSourceReceiptDigest: bootstrapSourceReceipt.receiptDigest,
    ownerStageDigest: bootstrapSourceReceipt.sourceOwnerStageDigest,
    ownerDispatchAckDigest: bootstrapSourceReceipt.sourceOwnerDispatchAckDigest,
    nativeProviderSourceReceiptDigest,
    nativeProviderSourceDigest,
    nativeProviderSourceFactDigest,
    outcome,
  });
  const sourceReceiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt',
    version: 1,
    namespaceId: bootstrapSourceRequest.namespaceId,
    planDigest: bootstrapSourceRequest.planDigest,
    repositoryCommit: bootstrapSourceRequest.repositoryCommit,
    attemptId: bootstrapSourceRequest.attemptId,
    descriptorDigest: bootstrapSourceRequest.descriptorDigest,
    targetId: 'target.release.native-bootstrap',
    targetDigest: digest('native-bootstrap-target'),
    capabilityProfileId: nativeRuntimeFactSourceAuthority.capabilityProfileId,
    capabilityProfileDigest:
      nativeRuntimeFactSourceAuthority.capabilityProfileDigest,
    capabilityDescriptorDigest: digest(
      'native-bootstrap-capability-descriptor'
    ),
    capabilityId: nativeRuntimeFactSourceAuthority.capabilityId,
    supportExpectation: 'required',
    turnIndex: bootstrapSourceRequest.turnIndex,
    invocationId: bootstrapSourceRequest.invocationId,
    protocolFamily: bootstrapSourceRequest.protocolFamily,
    providerConfigurationId: bootstrapSourceRequest.providerConfigurationId,
    modelId: nativeRuntimeFactSourceAuthority.modelId,
    modelLineageDigest: bootstrapSourceRequest.modelLineageDigest,
    adapterDigest: bootstrapSourceRequest.adapterDigest,
    providerRequestDigest: bootstrapSourceRequest.providerRequestDigest,
    responseDigest: bootstrapSourceRequest.providerResponseDigest,
    dispatchIntentDigest: bootstrapSourceRequest.dispatchIntentDigest,
    transportReceiptDigest: bootstrapSourceRequest.transportReceiptDigest,
    resultSpoolReceiptDigest: bootstrapSourceRequest.resultSpoolReceiptDigest,
    normalizedEventSetDigest: bootstrapSourceRequest.normalizedEventSetDigest,
    targetAuthorityDigest: nativeRuntimeFactSourceAuthority.authorityDigest,
    sourceAuthorityId: nativeRuntimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      nativeRuntimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: nativeRuntimeFactSourceAuthority.routeBinding,
    registrationAuthorityIssuerId:
      nativeRuntimeFactSourceAuthority.registrationAuthorityIssuerId,
    registrationReceiptDigest:
      nativeRuntimeFactSourceAuthority.registrationReceiptDigest,
    sourceKind: nativeRuntimeFactSourceAuthority.sourceKind,
    sourceDigest: digestAgentCanonicalValue(sourceProjection),
    sourceRequestDigest: digest('native-bootstrap-outer-source-request'),
    ownerStageDigest: bootstrapSourceReceipt.sourceOwnerStageDigest,
    ownerDispatchAckDigest: bootstrapSourceReceipt.sourceOwnerDispatchAckDigest,
    nativeBootstrapSourceRequestDigest: bootstrapSourceRequest.requestDigest,
    nativeBootstrapSourceReceiptDigest: bootstrapSourceReceipt.receiptDigest,
    nativeProviderSourceReceiptDigest,
    nativeProviderSourceDigest,
    nativeProviderSourceFactDigest,
    outcome,
    observedAt: bootstrapSourceRequest.observedAt,
    sealedAt: '2026-08-09T03:00:02.000Z',
    ...(bootstrapFact === null ? {} : { fact: bootstrapFact }),
  });
  const sourceReceipt = Object.freeze({
    ...sourceReceiptBase,
    sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
  });
  const sourceRecord =
    createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
      attemptId: bootstrapSourceRequest.attemptId,
      turnIndex: bootstrapSourceRequest.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      sourceReceipt,
      bootstrapSourceRequest,
      bootstrapSourceReceipt,
      nativeSourceReceipt,
      bootstrapFact,
      stateVaultSealRequest,
      stateVaultSealReceipt,
      stateVaultResolveRequest: null,
      stateVaultResolveReceipt: null,
      stateVaultRetireRequest,
      stateVaultRetirementReceipt,
    }) as AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord;
  if (bootstrapFact === null) {
    return Object.freeze({
      program: nativeProgram,
      runtimeFactSourceAuthority: nativeRuntimeFactSourceAuthority,
      sourceRecord,
      authorityRecord: null,
    });
  }
  const runtimeFactEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
      nativeProgram,
      bootstrapSourceReceipt
    )!;
  const factAuthority =
    createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
      runtimeFactEnvelope
    );
  const stageRequest = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-authority-stage-request',
    version: 1,
    planDigest: bootstrapSourceRequest.planDigest,
    repositoryCommit: bootstrapSourceRequest.repositoryCommit,
    attemptId: bootstrapSourceRequest.attemptId,
    descriptorDigest: bootstrapSourceRequest.descriptorDigest,
    turnIndex: bootstrapSourceRequest.turnIndex,
    sourceSealDigest: sourceReceipt.sourceSealDigest,
  });
  const authorityRequestDigest = digestAgentCanonicalValue(stageRequest);
  const stageDigest = digest('native-bootstrap-authority-stage');
  const dispatchAckDigest = digest('native-bootstrap-authority-ack');
  const sealedResponseBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-authority-response',
    version: 1,
    outcome: 'observed',
    authorityRequestDigest,
    sourceAuthorityId: nativeRuntimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      nativeRuntimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    stageDigest,
    dispatchAckDigest,
    runtimeFactEnvelopes: Object.freeze([runtimeFactEnvelope]),
    factAuthorities: Object.freeze([factAuthority]),
  });
  const sealedResponse = Object.freeze({
    ...sealedResponseBase,
    resultDigest: digestAgentCanonicalValue(sealedResponseBase),
  });
  const authorityRecord =
    createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
      attemptId: bootstrapSourceRequest.attemptId,
      turnIndex: bootstrapSourceRequest.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      authorityRequestDigest,
      stageDigest,
      dispatchAckDigest,
      resultDigest: sealedResponse.resultDigest,
      stageRequest,
      fact: bootstrapFact,
      runtimeFactEnvelope,
      factAuthority,
      sealedResponse,
    });
  return Object.freeze({
    program: nativeProgram,
    runtimeFactSourceAuthority: nativeRuntimeFactSourceAuthority,
    sourceRecord,
    authorityRecord,
  });
};

describe('qualification authority archive raw records', () => {
  it('exports the canonical 18 admission, 108 reference, 15 registration, and four cleanup V8 preimages', () => {
    const fixture = createV8QualificationAuthorityArchiveFixture();
    expect(fixture.plan.capabilityQualificationTargets).toHaveLength(27);
    expect(fixture.plan.plannedJourneyCount).toBe(14_040);
    expect(fixture.capabilityProbeAdmissions).toHaveLength(18);
    expect(fixture.capabilityProbeReferenceReceipts).toHaveLength(108);
    expect(fixture.runtimeFactSourceOwnerRegistrations).toHaveLength(15);
    expect(fixture.capabilityProbeProviderResourceCleanups).toHaveLength(4);
    expect(
      fixture.capabilityProbeAdmissions.every(
        isAgentEvaluationCapabilityProbeAdmissionArchiveRecord
      )
    ).toBe(true);
    expect(
      fixture.capabilityProbeReferenceReceipts.every(
        isAgentEvaluationCapabilityProbeReferenceArchiveRecord
      )
    ).toBe(true);
    expect(
      fixture.runtimeFactSourceOwnerRegistrations.every(
        isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord
      )
    ).toBe(true);
    expect(
      fixture.capabilityProbeProviderResourceCleanups.every(
        isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord
      )
    ).toBe(true);

    for (const admission of fixture.capabilityProbeAdmissions) {
      const references = fixture.capabilityProbeReferenceReceipts.filter(
        ({ admissionRequestDigest }) =>
          admissionRequestDigest === admission.requestDigest
      );
      expect(references.map(({ ordinal }) => ordinal)).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
      expect(references.map(({ kind }) => kind)).toEqual(
        AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS
      );
    }

    const optionalAuthorities = fixture.plan.capabilityQualificationTargets
      .map(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority
      )
      .filter((authority) => authority !== undefined);
    const planProbeEvidenceDigests = optionalAuthorities
      .map(({ probeEvidence }) => probeEvidence.evidenceDigest)
      .sort(compareUnicodeCodePoints);
    const archiveProbeEvidenceDigests = fixture.capabilityProbeAdmissions
      .map(
        ({ response }) =>
          (
            response.probeEvidence as Readonly<{
              evidenceDigest: string;
            }>
          ).evidenceDigest
      )
      .sort(compareUnicodeCodePoints);
    expect(archiveProbeEvidenceDigests).toEqual(planProbeEvidenceDigests);
    const planRegistrationDigests = optionalAuthorities
      .flatMap(({ runtimeFactSourceAuthority }) =>
        runtimeFactSourceAuthority
          ? [runtimeFactSourceAuthority.registrationReceiptDigest]
          : []
      )
      .sort(compareUnicodeCodePoints);
    expect(
      fixture.runtimeFactSourceOwnerRegistrations
        .map(({ registrationReceiptDigest }) => registrationReceiptDigest)
        .sort(compareUnicodeCodePoints)
    ).toEqual(planRegistrationDigests);
    const planCleanupDigests = optionalAuthorities
      .flatMap(({ probeProviderResourceCleanupReceipt }) =>
        probeProviderResourceCleanupReceipt
          ? [probeProviderResourceCleanupReceipt.cleanupReceiptDigest]
          : []
      )
      .sort(compareUnicodeCodePoints);
    expect(
      fixture.capabilityProbeProviderResourceCleanups
        .map(({ cleanupReceiptDigest }) => cleanupReceiptDigest)
        .sort(compareUnicodeCodePoints)
    ).toEqual(planCleanupDigests);
  });

  it('decodes the exact admission/reference wrappers and rejects chained swaps', () => {
    const { admission, references } = createProbeArchiveFixture();
    const response =
      admission.response as AgentEvaluationCapabilityProbeAdmissionResponse;
    expect(
      isAgentEvaluationCapabilityProbeAdmissionArchiveRecord(admission)
    ).toBe(true);
    expect(response.stageDigest).toBe(
      digestAgentCanonicalValue({
        format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_STAGE_FORMAT,
        version: 1,
        requestDigest: admission.requestDigest,
        ownerImplementationDigest: response.ownerImplementationDigest,
      })
    );
    expect(response.ownerAdmissionDigest).toBe(
      digestAgentCanonicalValue({
        format: AGENT_EVALUATION_CAPABILITY_PROBE_OWNER_ADMISSION_FORMAT,
        version: 1,
        requestDigest: admission.requestDigest,
        evidenceDigest: response.probeEvidence.evidenceDigest,
        ownerImplementationDigest: response.ownerImplementationDigest,
        stageDigest: response.stageDigest,
      })
    );
    expect(response.dispatchAckDigest).toBe(
      digestAgentCanonicalValue({
        format: AGENT_EVALUATION_CAPABILITY_PROBE_DISPATCH_ACK_FORMAT,
        version: 1,
        requestDigest: admission.requestDigest,
        evidenceDigest: response.probeEvidence.evidenceDigest,
        ownerImplementationDigest: response.ownerImplementationDigest,
        ownerAdmissionDigest: response.ownerAdmissionDigest,
        stageDigest: response.stageDigest,
      })
    );
    expect(
      references.every(isAgentEvaluationCapabilityProbeReferenceArchiveRecord)
    ).toBe(true);
    const { requestDigest: _requestDigest, ...requestBase } = admission.request;
    const missingResourceBase = Object.freeze({
      ...requestBase,
      probeProviderResourceAuthority: null,
    });
    expect(
      isAgentEvaluationCapabilityProbeAdmissionRequest(
        Object.freeze({
          ...missingResourceBase,
          requestDigest: digestAgentCanonicalValue(missingResourceBase),
        })
      )
    ).toBe(false);
    const swappedResource = createAgentCapabilityProbeProviderResourceAuthority(
      probeProgram,
      {
        protocolFamily: 'openai-responses',
        providerConfigurationId: 'provider.release.openai-swapped',
        modelId: model.modelId,
        modelLineageDigest: model.lineageDigest,
        adapterDigest: adapter.adapterDigest,
        providerResourceId: 'probe-resource.openai.retrieval-core',
        resourceManifestDigest: digest('probe-resource-manifest'),
        contentUploadReceiptDigest: digest('probe-resource-upload'),
        deletionAuthorityReceiptDigest: digest('probe-resource-delete'),
        registeredAt: '2026-08-09T00:00:00.000Z',
        expiresAt: '2026-08-10T00:00:00.000Z',
      }
    );
    const swappedResourceBase = Object.freeze({
      ...requestBase,
      probeProviderResourceAuthority: swappedResource,
    });
    expect(
      isAgentEvaluationCapabilityProbeAdmissionRequest(
        Object.freeze({
          ...swappedResourceBase,
          requestDigest: digestAgentCanonicalValue(swappedResourceBase),
        })
      )
    ).toBe(false);
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'capabilityProbeAdmissions',
        admission
      )
    ).toBe(canonicalJsonText([admission.requestDigest]));
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'capabilityProbeReferenceReceipts',
        references[5]
      )
    ).toBe(canonicalJsonText([admission.requestDigest, '05']));

    const swappedBundle = Object.freeze([
      admission.referenceBundle[1]!,
      admission.referenceBundle[0]!,
      ...admission.referenceBundle.slice(2),
    ]);
    expect(() =>
      createAgentEvaluationCapabilityProbeAdmissionArchiveRecord({
        ...admission,
        referenceBundle: swappedBundle,
      })
    ).toThrow(/invalid/u);
    expect(() =>
      createAgentEvaluationCapabilityProbeReferenceArchiveRecord({
        ...references[0],
        ordinal: 1,
        kind: 'probe-response',
      })
    ).toThrow(/invalid/u);

    const swappedStageDigest = digest('swapped-probe-stage');
    const swappedOwnerAdmissionDigest = digestAgentCanonicalValue({
      format: AGENT_EVALUATION_CAPABILITY_PROBE_OWNER_ADMISSION_FORMAT,
      version: 1,
      requestDigest: admission.requestDigest,
      evidenceDigest: response.probeEvidence.evidenceDigest,
      ownerImplementationDigest: response.ownerImplementationDigest,
      stageDigest: swappedStageDigest,
    });
    const swappedDispatchAckDigest = digestAgentCanonicalValue({
      format: AGENT_EVALUATION_CAPABILITY_PROBE_DISPATCH_ACK_FORMAT,
      version: 1,
      requestDigest: admission.requestDigest,
      evidenceDigest: response.probeEvidence.evidenceDigest,
      ownerImplementationDigest: response.ownerImplementationDigest,
      ownerAdmissionDigest: swappedOwnerAdmissionDigest,
      stageDigest: swappedStageDigest,
    });
    const {
      admissionReceiptDigest: _admissionReceiptDigest,
      ...swappedResponseInput
    } = Object.freeze({
      ...response,
      stageDigest: swappedStageDigest,
      ownerAdmissionDigest: swappedOwnerAdmissionDigest,
      dispatchAckDigest: swappedDispatchAckDigest,
    });
    const swappedResponse = Object.freeze({
      ...swappedResponseInput,
      admissionReceiptDigest: digestAgentCanonicalValue(swappedResponseInput),
    });
    const { recordDigest: _recordDigest, ...admissionInput } = admission;
    const swappedAdmissionInput = Object.freeze({
      ...admissionInput,
      stageDigest: swappedStageDigest,
      dispatchAckDigest: swappedDispatchAckDigest,
      admissionReceiptDigest: swappedResponse.admissionReceiptDigest,
      response: swappedResponse,
    });
    expect(
      isAgentEvaluationCapabilityProbeAdmissionArchiveRecord({
        ...swappedAdmissionInput,
        recordDigest: digestAgentCanonicalValue(swappedAdmissionInput),
      })
    ).toBe(false);
  });

  it('decodes registered runtime owners and rejects fully rehashed health swaps', () => {
    const registration = createRegistrationArchiveFixture();
    const receipt =
      registration.receipt as AgentEvaluationRuntimeFactSourceRegistrationReceipt;
    expect(
      isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord(registration)
    ).toBe(true);
    expect(receipt.stageDigest).toBe(
      digestAgentCanonicalValue({
        format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT,
        version: 1,
        requestDigest: registration.requestDigest,
        registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
      })
    );
    expect(receipt.ownerAdmissionDigest).toBe(
      digestAgentCanonicalValue({
        format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT,
        version: 1,
        requestDigest: registration.requestDigest,
        ownerHealthDigest: registration.ownerHealthDigest,
        stageDigest: receipt.stageDigest,
      })
    );
    expect(receipt.dispatchAckDigest).toBe(
      digestAgentCanonicalValue({
        format:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT,
        version: 1,
        requestDigest: registration.requestDigest,
        ownerHealthDigest: registration.ownerHealthDigest,
        ownerAdmissionDigest: receipt.ownerAdmissionDigest,
        stageDigest: receipt.stageDigest,
        registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
      })
    );
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'runtimeFactSourceOwnerRegistrations',
        registration
      )
    ).toBe(canonicalJsonText([registration.registrationReceiptDigest]));

    const ownerHealthBase = {
      ...registration.ownerHealth,
      sourceAuthorityId: 'runtime-source.release.swapped',
    };
    delete (ownerHealthBase as Record<string, unknown>).healthDigest;
    const ownerHealth = Object.freeze({
      ...ownerHealthBase,
      healthDigest: digestAgentCanonicalValue(ownerHealthBase),
    });
    expect(() =>
      createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord({
        ...registration,
        ownerHealthDigest: ownerHealth.healthDigest,
        ownerHealth,
      })
    ).toThrow(/invalid/u);

    const swappedStageDigest = digest('swapped-registration-stage');
    const swappedOwnerAdmissionDigest = digestAgentCanonicalValue({
      format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT,
      version: 1,
      requestDigest: registration.requestDigest,
      ownerHealthDigest: registration.ownerHealthDigest,
      stageDigest: swappedStageDigest,
    });
    const swappedDispatchAckDigest = digestAgentCanonicalValue({
      format:
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT,
      version: 1,
      requestDigest: registration.requestDigest,
      ownerHealthDigest: registration.ownerHealthDigest,
      ownerAdmissionDigest: swappedOwnerAdmissionDigest,
      stageDigest: swappedStageDigest,
      registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
    });
    const {
      registrationReceiptDigest: _registrationReceiptDigest,
      ...swappedReceiptInput
    } = Object.freeze({
      ...receipt,
      stageDigest: swappedStageDigest,
      ownerAdmissionDigest: swappedOwnerAdmissionDigest,
      dispatchAckDigest: swappedDispatchAckDigest,
    });
    const swappedReceipt = Object.freeze({
      ...swappedReceiptInput,
      registrationReceiptDigest: digestAgentCanonicalValue(swappedReceiptInput),
    });
    const { recordDigest: _recordDigest, ...registrationInput } = registration;
    const swappedRegistrationInput = Object.freeze({
      ...registrationInput,
      registrationReceiptDigest: swappedReceipt.registrationReceiptDigest,
      receipt: swappedReceipt,
    });
    expect(
      isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord({
        ...swappedRegistrationInput,
        recordDigest: digestAgentCanonicalValue(swappedRegistrationInput),
      })
    ).toBe(false);
  });

  it('rebuilds the four cross-host cleanup lifecycles and rejects fully rehashed stage swaps', () => {
    const fixture = createV8QualificationAuthorityArchiveFixture();
    const record = fixture.capabilityProbeProviderResourceCleanups[0]!;
    expect(
      isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord(
        record
      )
    ).toBe(true);
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'capabilityProbeProviderResourceCleanups',
        record
      )
    ).toBe(
      canonicalJsonText([
        record.repositoryCommit,
        record.resourceRegistrationRequestDigest,
      ])
    );
    expect(
      projectAgentEvaluationQualificationAuthorityArchiveRecord(
        'capabilityProbeProviderResourceCleanups',
        record
      )
    ).toBe(record);

    const { responseDigest: _responseDigest, ...cleanupResponseWithoutDigest } =
      record.cleanupResponse;
    const swappedStageDigest = digest('swapped-cleanup-authority-stage');
    const swappedResponseBase = Object.freeze({
      ...cleanupResponseWithoutDigest,
      stageDigest: swappedStageDigest,
    });
    const swappedResponse = Object.freeze({
      ...swappedResponseBase,
      responseDigest: digestAgentCanonicalValue(swappedResponseBase),
    });
    const { recordDigest: _recordDigest, ...recordWithoutDigest } = record;
    const swappedRecordBase = Object.freeze({
      ...recordWithoutDigest,
      stageDigest: swappedStageDigest,
      cleanupResponse: swappedResponse,
    });
    expect(
      isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord({
        ...swappedRecordBase,
        recordDigest: digestAgentCanonicalValue(swappedRecordBase),
      })
    ).toBe(false);
    expect(() =>
      createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord({
        ...recordWithoutDigest,
        deletionAuthorityReceipt: {
          ...record.deletionAuthorityReceipt,
          deletionRequestProjection: {
            ...record.deletionAuthorityReceipt.deletionRequestProjection,
            auxiliaryResourceIds: Object.freeze([]),
          },
        },
      })
    ).toThrow(/invalid/u);
  });

  it('preserves raw shared effect preimages and rejects source/authority swaps', () => {
    const { sourceRecord, authorityRecord } =
      createOptionalFactArchiveFixture();
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(sourceRecord)
    ).toBe(true);
    expect(
      isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord(
        authorityRecord
      )
    ).toBe(true);
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'optionalCapabilityFactSources',
        sourceRecord
      )
    ).toBe(canonicalJsonText([sourceRecord.attemptId, '000000000002']));
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'optionalCapabilityFactAuthorities',
        authorityRecord
      )
    ).toBe(canonicalJsonText([sourceRecord.attemptId, '000000000002']));

    expect(() =>
      createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
        ...sourceRecord,
        effectSourceFact: null,
      })
    ).toThrow(/invalid/u);
    expect(() =>
      createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
        ...authorityRecord,
        sourceSealDigest: digest('swapped-source-seal'),
      })
    ).toThrow(/invalid/u);
    expect(() =>
      createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
        ...authorityRecord,
        runtimeFactEnvelope: null,
      })
    ).toThrow(/invalid/u);
  });

  it('preserves a native bootstrap preimage chain and joins its source seal to one authority', () => {
    const effect = createOptionalFactArchiveFixture();
    const { sourceRecord, authorityRecord } =
      createNativeBootstrapOptionalFactArchiveFixture();

    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(sourceRecord)
    ).toBe(true);
    expect(authorityRecord).not.toBeNull();
    expect(
      isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord(
        authorityRecord
      )
    ).toBe(true);
    expect(authorityRecord?.sourceSealDigest).toBe(
      sourceRecord.sourceSealDigest
    );
    expect(sourceRecord.bootstrapSourceReceipt.sourceRequestDigest).toBe(
      sourceRecord.bootstrapSourceRequest.requestDigest
    );
    expect(sourceRecord.nativeSourceReceipt?.receiptDigest).toBe(
      sourceRecord.sourceReceipt.nativeProviderSourceReceiptDigest
    );
    expect(sourceRecord.bootstrapFact?.factDigest).toBe(
      sourceRecord.sourceReceipt.nativeProviderSourceFactDigest
    );
    expect(sourceRecord.stateVaultSealReceipt).toMatchObject({
      status: 'sealed',
      opaqueProviderStateRef: expect.stringMatching(/^state-vault-ref\./u),
      retirementRequired: true,
    });
    expect(sourceRecord.stateVaultRetirementReceipt).toMatchObject({
      disposition: 'cancelled',
      resolveReceiptDigest: null,
    });
    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'optionalCapabilityFactSources',
        sourceRecord
      )
    ).toBe(canonicalJsonText([sourceRecord.attemptId, '000000000001']));
    expect(
      projectAgentEvaluationQualificationAuthorityArchiveRecord(
        'optionalCapabilityFactSources',
        sourceRecord
      )
    ).toBe(sourceRecord);
    expect(
      digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
        'optionalCapabilityFactSources',
        sourceRecord
      )
    ).toBe(sourceRecord.recordDigest);
    expect(
      isAgentModelEvaluationEvidenceArchiveRecord(
        createAgentModelEvaluationEvidenceArchiveRecord({
          family: 'optionalCapabilityFactSources',
          recordIndex: 0,
          value: sourceRecord,
        })
      )
    ).toBe(true);

    const forward =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'optionalCapabilityFactSources'
      );
    forward.append(effect.sourceRecord);
    forward.append(sourceRecord);
    const reverse =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'optionalCapabilityFactSources'
      );
    reverse.append(sourceRecord);
    reverse.append(effect.sourceRecord);
    expect(forward.finalize()).toBe(reverse.finalize());
  });

  it('rejects recomputed native bootstrap request, receipt, Provider preimage, fact, and outer authority swaps', () => {
    const { program, sourceRecord } =
      createNativeBootstrapOptionalFactArchiveFixture();
    const recomputeRecord = (
      value: Omit<
        AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord,
        'recordDigest'
      >
    ) =>
      Object.freeze({
        ...value,
        recordDigest: digestAgentCanonicalValue(value),
      });
    const {
      requestDigest: _bootstrapRequestDigest,
      ...bootstrapRequestWithoutDigest
    } = sourceRecord.bootstrapSourceRequest;
    const swappedBootstrapRequestBase = Object.freeze({
      ...bootstrapRequestWithoutDigest,
      planDigest: digest('swapped-bootstrap-plan'),
    });
    const swappedBootstrapRequest = Object.freeze({
      ...swappedBootstrapRequestBase,
      requestDigest: digestAgentCanonicalValue(swappedBootstrapRequestBase),
    });
    const { recordDigest: _recordDigest, ...recordBase } = sourceRecord;
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          stateVaultRetirementReceipt: Object.freeze({
            ...sourceRecord.stateVaultRetirementReceipt!,
            opaqueRecordDeletionReceiptDigest: digest(
              'swapped-native-vault-record-deletion'
            ),
          }),
        })
      )
    ).toBe(false);
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          bootstrapSourceRequest: swappedBootstrapRequest,
        })
      )
    ).toBe(false);

    const swappedBootstrapReceipt =
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        {
          sourceRequest: sourceRecord.bootstrapSourceRequest,
          sealedAt: '2026-08-09T03:00:02.000Z',
        }
      );
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          bootstrapSourceReceipt: swappedBootstrapReceipt,
        })
      )
    ).toBe(false);

    const originalNativeReceipt = sourceRecord.nativeSourceReceipt!;
    const swappedNativeReceipt =
      createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
        protocolFamily: originalNativeReceipt.protocolFamily,
        capabilityProfileDigest: originalNativeReceipt.capabilityProfileDigest,
        invocationId: originalNativeReceipt.invocationId,
        requestDigest: originalNativeReceipt.requestDigest,
        responseDigest: originalNativeReceipt.responseDigest,
        providerConfigurationId: originalNativeReceipt.providerConfigurationId,
        modelLineageDigest: originalNativeReceipt.modelLineageDigest,
        adapterDigest: originalNativeReceipt.adapterDigest,
        executionIdentityAuthority:
          originalNativeReceipt.executionIdentityAuthority,
        source: Object.freeze({
          ...originalNativeReceipt.source,
          providerStateReferenceDigest: digest('swapped-native-job-state'),
        }),
        observedAt: originalNativeReceipt.observedAt,
      });
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          nativeSourceReceipt: swappedNativeReceipt,
        })
      )
    ).toBe(false);

    if (swappedNativeReceipt.fact.factType !== 'provider-job-receipt') {
      throw new TypeError('Expected the background-job fixture fact.');
    }
    const swappedFact = Object.freeze({
      factKind: 'provider-job-receipt' as const,
      factDigest: swappedNativeReceipt.fact.value.receiptDigest,
      value: swappedNativeReceipt.fact.value,
    });
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          bootstrapFact: swappedFact,
        })
      )
    ).toBe(false);

    const sourceReceipt = sourceRecord.sourceReceipt;
    const { sourceSealDigest: _sourceSealDigest, ...sourceReceiptWithoutSeal } =
      sourceReceipt;
    const swappedSourceReceiptBase = Object.freeze({
      ...sourceReceiptWithoutSeal,
      targetAuthorityDigest: digest('swapped-target-authority'),
    });
    const swappedSourceReceipt = Object.freeze({
      ...swappedSourceReceiptBase,
      sourceSealDigest: digestAgentCanonicalValue(swappedSourceReceiptBase),
    });
    expect(
      isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(
        recomputeRecord({
          ...recordBase,
          sourceSealDigest: swappedSourceReceipt.sourceSealDigest,
          sourceReceipt: swappedSourceReceipt,
        })
      )
    ).toBe(false);
  });

  it.each(['unavailable', 'failed'] as const)(
    'archives native bootstrap %s without raw Provider or supported fact preimages',
    (outcome) => {
      const { sourceRecord, authorityRecord } =
        createNativeBootstrapOptionalFactArchiveFixture(outcome);
      expect(
        isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(sourceRecord)
      ).toBe(true);
      expect(authorityRecord).toBeNull();
      expect(sourceRecord.nativeSourceReceipt).toBeNull();
      expect(sourceRecord.bootstrapFact).toBeNull();
      expect(sourceRecord.stateVaultSealRequest).toBeNull();
      expect(sourceRecord.stateVaultSealReceipt).toBeNull();
      expect(sourceRecord.stateVaultResolveRequest).toBeNull();
      expect(sourceRecord.stateVaultResolveReceipt).toBeNull();
      expect(sourceRecord.stateVaultRetireRequest).toBeNull();
      expect(sourceRecord.stateVaultRetirementReceipt).toBeNull();
      expect(
        sourceRecord.sourceReceipt.nativeProviderSourceReceiptDigest
      ).toBeNull();
      expect(sourceRecord.sourceReceipt.nativeProviderSourceDigest).toBeNull();
      expect(
        sourceRecord.sourceReceipt.nativeProviderSourceFactDigest
      ).toBeNull();
      expect(Object.hasOwn(sourceRecord.sourceReceipt, 'fact')).toBe(false);

      const observed = createNativeBootstrapOptionalFactArchiveFixture();
      const { recordDigest: _recordDigest, ...recordBase } = sourceRecord;
      const tamperedBase = Object.freeze({
        ...recordBase,
        nativeSourceReceipt: observed.sourceRecord.nativeSourceReceipt,
      });
      expect(
        isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
          ...tamperedBase,
          recordDigest: digestAgentCanonicalValue(tamperedBase),
        })
      ).toBe(false);
    }
  );

  it('uses Unicode-ordered recordDigest set roots and hard family caps', () => {
    const { admission, references } = createProbeArchiveFixture();
    const forward =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'capabilityProbeReferenceReceipts'
      );
    references.forEach((record) => forward.append(record));
    const reverse =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'capabilityProbeReferenceReceipts'
      );
    [...references].reverse().forEach((record) => reverse.append(record));
    expect(forward.finalize()).toBe(reverse.finalize());
    expect(forward.finalize()).toBe(
      digestAgentCanonicalValue({
        recordDigests: references
          .map(({ recordDigest }) => recordDigest)
          .sort(compareUnicodeCodePoints),
      })
    );
    expect(
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES.every(
        (family) =>
          isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
            family,
            family === 'capabilityProbeAdmissions'
              ? AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount
              : family === 'capabilityProbeReferenceReceipts'
                ? AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount
                : family === 'runtimeFactSourceOwnerRegistrations'
                  ? AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount
                  : family === 'capabilityProbeProviderResourceCleanups'
                    ? AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount
                    : family === 'hostedRetrievalRuntimeResourceCleanups'
                      ? AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount
                      : family === 'capabilityEffectProviderRuntimeJournals'
                        ? AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordCount
                        : family ===
                            'hostedRetrievalRuntimeResourceLifecycleJournals'
                          ? AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumRecordCount
                          : family === 'optionalCapabilityFactSources'
                            ? AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount
                            : AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount,
            0
          )
      )
    ).toBe(true);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'capabilityProbeProviderResourceCleanups',
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount +
          1,
        0
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceCleanups',
        0,
        0
      )
    ).toBe(true);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceCleanups',
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount -
          1,
        0
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceCleanups',
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount +
          1,
        0
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'capabilityProbeProviderResourceCleanups',
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes +
          1
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'optionalCapabilityFactSources',
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount +
          1,
        0
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'optionalCapabilityFactSources',
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount,
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes +
          1
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'optionalCapabilityFactAuthorities',
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount +
          1,
        0
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityProbeAdmissionArchiveRecord({
        ...admission,
        recordDigest: digest('tampered-record'),
      })
    ).toBe(false);
  });
});
