import { describe, expect, it } from 'vitest';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  createAgentCapabilityEffectProviderRuntimeJournalFixture,
  createAgentHostedRetrievalProviderResponseFixture,
  finalizeAgentCapabilityEffectProviderRuntimeJournalFixture,
} from '../__tests__/agentCapabilityEffectProviderRuntimeFixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
  resolveAgentCapabilityProbePublicResource,
} from '../providers/agentCapabilityProbeProgram';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceAuthority,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from '../providers/agentHostedRetrievalRuntimeResource';
import {
  createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  decodeAgentNativeProviderCapabilityRuntimeResponse,
} from '../providers/agentNativeProviderCapabilityRuntime';
import { createAgentOpaqueContinuation } from '../providers/agentInvocationFacts';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import {
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultResolveReceipt,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  digestAgentNativeProviderStateReference,
} from '../providers/agentNativeProviderStateVault';
import {
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_COMPOSITION_BYTES,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_COMPOSITION_BYTES,
  createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  createAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord,
  createAgentEvaluationCapabilityEffectProviderJournalResultRecord,
  createAgentEvaluationCapabilityEffectProviderJournalStageRecord,
  createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
  isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget,
  isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
} from './agentEvaluationCapabilityEffectProviderJournal';
import {
  createAgentEvaluationCapabilityEffectProviderJournalSnapshot,
  isAgentEvaluationCapabilityEffectProviderJournalSnapshot,
} from './agentEvaluationCapabilityEffectProviderJournalTransport';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectProviderSpoolAad,
  createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
  createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  createAgentEvaluationCapabilityEffectProviderSpoolReceipt,
  createAgentEvaluationCapabilityEffectProviderSpoolRef,
  digestAgentEvaluationCapabilityEffectProviderSpoolAad,
} from './agentEvaluationCapabilityEffectProviderJournalSpool';
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
  createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
  matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource,
  type AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord,
} from './agentEvaluationEvidenceArchiveAuthorityRecords';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES,
  createAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  createAgentEvaluationCapabilityEffectProviderReadinessReceipt,
  createAgentEvaluationCapabilityEffectProviderRuntimeResult,
  createAgentEvaluationCapabilityEffectProviderStageRequest,
  doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource,
  assertAgentEvaluationCapabilityEffectInputSourceAvailable,
  isAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  isAgentEvaluationCapabilityEffectProviderBusinessResultByteCapacity,
  isAgentEvaluationCapabilityEffectProviderExecutionReceiptByteCapacity,
  isAgentEvaluationCapabilityEffectProviderReadinessReceipt,
  isAgentEvaluationCapabilityEffectProviderResultSealReceipt,
  isAgentEvaluationCapabilityEffectProviderStageRequest,
  reconcileAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  reconcileAgentEvaluationCapabilityEffectProviderResultSealReceipt,
  reconcileAgentEvaluationCapabilityEffectProviderStageRequest,
  resolveAgentEvaluationCapabilityEffectPriorSourceDisposition,
  type AgentEvaluationCapabilityEffectProviderBusinessResult,
} from './agentEvaluationCapabilityEffectProviderRuntime';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt,
  isAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
} from './agentEvaluationProviderCapabilityObservation';
import { createAgentUsageVector } from '../usage/agentUsage';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const repositoryCommit = '1234567890abcdef1234567890abcdef12345678';
const checkedAt = '2026-08-09T07:00:00.000Z';
const readinessExpiresAt = '2026-08-09T07:02:05.000Z';
const maximumIdentity = (prefix: string): string =>
  `${prefix}.${'x'.repeat(255 - prefix.length)}`;

const commitmentFor = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority
): AgentHostedRetrievalRuntimeResourceSetCommitment => {
  const keys = Object.freeze([
    ['gemini-interactions', 'g4-provider-hosted-retrieval-core'],
    ['gemini-interactions', 'g4-provider-hosted-retrieval-document'],
    ['openai-responses', 'g4-provider-hosted-retrieval-core'],
    ['openai-responses', 'g4-provider-hosted-retrieval-document'],
  ] as const);
  const authorityBindings = Object.freeze(
    keys.map(([protocolFamily, capabilityProfileId]) =>
      protocolFamily === authority.protocolFamily &&
      capabilityProfileId === authority.capabilityProfileId
        ? Object.freeze({
            authorityDigest: authority.authorityDigest,
            registrationIntentDigest: authority.registrationIntentDigest,
            protocolFamily,
            capabilityProfileId,
            providerConfigurationDigest: authority.providerConfigurationDigest,
            budgetReservationId:
              authority.budgetReservationAuthority.reservationId,
            budgetReservationAuthorityDigest:
              authority.budgetReservationAuthorityDigest,
            networkPolicyAuthorityDigest:
              authority.networkPolicyAuthorityDigest,
          })
        : Object.freeze({
            authorityDigest: digest(
              `foreign-authority.${protocolFamily}.${capabilityProfileId}`
            ),
            registrationIntentDigest: digest(
              `foreign-registration-intent.${protocolFamily}.${capabilityProfileId}`
            ),
            protocolFamily,
            capabilityProfileId,
            providerConfigurationDigest: digest(
              `foreign-provider.${protocolFamily}.${capabilityProfileId}`
            ),
            budgetReservationId: `foreign-budget.${protocolFamily}.${capabilityProfileId}`,
            budgetReservationAuthorityDigest: digest(
              `foreign-budget-authority.${protocolFamily}.${capabilityProfileId}`
            ),
            networkPolicyAuthorityDigest: digest(
              `foreign-network-policy.${protocolFamily}.${capabilityProfileId}`
            ),
          })
    )
  );
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    planDigest: authority.planDigest,
    frozenRunDigest: authority.frozenRunDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authoritySetDigest: digest('runtime-authority-set'),
    authorityBindings,
  });
  return Object.freeze({
    ...base,
    commitmentDigest: digestAgentCanonicalValue(base),
  });
};

const program = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-hosted-retrieval-core',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-hosted-retrieval-core'
  ),
});
const publicResource = resolveAgentCapabilityProbePublicResource(program);
if (publicResource === null) {
  throw new TypeError('Hosted retrieval fixture resource is missing.');
}

const hostedNamespaceId = maximumIdentity('namespace');
const providerConfigurationId = maximumIdentity('provider');
const providerConfigurationDigest = digest('provider-configuration');
const providerModelId = maximumIdentity('model');
const providerModelLineageDigest = digest('model-lineage');
const providerAdapterDigest = digest('adapter');
const planDigest = digest('plan');
const frozenRunDigest = digest('frozen-run');
const runConfigArtifactBindingDigest = digest('run-config-binding');
const budgetReservationAuthority =
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
    namespaceId: hostedNamespaceId,
    planDigest,
    reservePolicyDigest: digest('budget-reserve-policy'),
    budgetDigest: digest('budget'),
    reservationId: maximumIdentity('budget'),
    ledgerRevision: 7,
    demandDigest: digest('budget-demand'),
    demandBytesDigest: digest('budget-demand-bytes'),
    reservedAt: '2026-08-09T06:58:00.000Z',
  });
const networkPolicyAuthority =
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
    namespaceId: hostedNamespaceId,
    repositoryCommit,
    planDigest,
    frozenRunDigest,
    runConfigArtifactBindingDigest,
    providerConfigurationId,
    providerConfigurationDigest,
    protocolFamily: 'openai-responses',
  });
const runtimeResourceRegistrationIntent =
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
    providerConfigurationId,
    providerConfigurationDigest,
    protocolFamily: 'openai-responses',
    modelId: providerModelId,
    modelLineageDigest: providerModelLineageDigest,
    adapterDigest: providerAdapterDigest,
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    probeProgramDigest: program.programDigest,
    publicResourceDescriptorDigest: publicResource.descriptor.descriptorDigest,
  });
const runtimeResourceRegistrationRequest =
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
    namespaceId: hostedNamespaceId,
    repositoryCommit,
    planDigest,
    frozenRunDigest,
    runConfigArtifactBindingDigest,
    runtimeResourceSetId: maximumIdentity('resource-set'),
    registrationIntent: runtimeResourceRegistrationIntent,
    registrationIntentDigest: runtimeResourceRegistrationIntent.intentDigest,
    protocolFamily: 'openai-responses',
    providerConfigurationId,
    providerConfigurationDigest,
    modelId: providerModelId,
    modelLineageDigest: providerModelLineageDigest,
    adapterDigest: providerAdapterDigest,
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    probeProgramDigest: program.programDigest,
    publicResourceDescriptorDigest: publicResource.descriptor.descriptorDigest,
    budgetReservationAuthority,
    budgetReservationAuthorityDigest:
      budgetReservationAuthority.authorityDigest,
    networkPolicyAuthority,
    networkPolicyAuthorityDigest: networkPolicyAuthority.authorityDigest,
    minimumExpiresAt: '2026-08-09T08:00:00.000Z',
  });
const runtimeResourceDeletionProjection =
  createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection({
    registrationRequestDigest: runtimeResourceRegistrationRequest.requestDigest,
    runtimeResourceSetId:
      runtimeResourceRegistrationRequest.runtimeResourceSetId,
    protocolFamily: runtimeResourceRegistrationRequest.protocolFamily,
    providerResourceId: maximumIdentity('provider-resource'),
    auxiliaryResourceIds: Object.freeze(
      Array.from(
        {
          length: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS,
        },
        (_, index) => maximumIdentity(`aux-${String(index).padStart(2, '0')}`)
      )
    ),
  });
const runtimeResourceDeletionAuthority =
  createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt({
    registrationRequest: runtimeResourceRegistrationRequest,
    resourceManifestDigest: digest('resource-manifest'),
    deletionRequestProjection: runtimeResourceDeletionProjection,
    registeredAt: '2026-08-09T06:59:00.000Z',
    expiresAt: '2026-08-09T08:00:00.000Z',
  });
const resourceAuthority = createAgentHostedRetrievalRuntimeResourceAuthority(
  runtimeResourceRegistrationRequest,
  {
    providerResourceId: runtimeResourceDeletionProjection.providerResourceId,
    auxiliaryResourceIds:
      runtimeResourceDeletionProjection.auxiliaryResourceIds,
    resourceManifestDigest: digest('resource-manifest'),
    contentUploadReceiptDigest: digest('content-upload'),
    creationDispatchIntentSetDigest: digest('creation-dispatch-set'),
    creationTransportReceiptSetDigest: digest('creation-transport-set'),
    creationResultSpoolReceiptSetDigest: digest('creation-spool-set'),
    deletionAuthorityReceipt: runtimeResourceDeletionAuthority,
    registeredAt: '2026-08-09T06:59:00.000Z',
    expiresAt: '2026-08-09T08:00:00.000Z',
  }
);
const runtimeResourceSetCommitment = commitmentFor(resourceAuthority);
const runtimeResourceReadRequest =
  createAgentHostedRetrievalRuntimeResourceReadRequest({
    namespaceId: hostedNamespaceId,
    repositoryCommit,
    planDigest: resourceAuthority.planDigest,
    runConfigArtifactBindingDigest:
      resourceAuthority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: resourceAuthority.runtimeResourceSetId,
    authorityDigest: resourceAuthority.authorityDigest,
    resourceSetCommitmentDigest: runtimeResourceSetCommitment.commitmentDigest,
    readerOwnerInstanceId: maximumIdentity('owner'),
    readLeaseId: maximumIdentity('read-lease'),
    minimumExpiresAt: '2026-08-09T07:02:35.000Z',
  });
const runtimeResourceActiveState =
  createAgentHostedRetrievalRuntimeResourceActiveState(
    resourceAuthority,
    runtimeResourceSetCommitment,
    {
      activeOwnerInstanceId: runtimeResourceReadRequest.readerOwnerInstanceId,
      claimGeneration: 1,
      readLeaseNotAfter: '2026-08-09T07:03:00.000Z',
      updatedAt: checkedAt,
    }
  );
const runtimeResourceReadReceipt =
  createAgentHostedRetrievalRuntimeResourceReadReceipt(
    runtimeResourceReadRequest,
    resourceAuthority,
    runtimeResourceSetCommitment,
    {
      activeState: runtimeResourceActiveState,
      checkedAt,
      expiresAt: '2026-08-09T07:02:40.000Z',
    }
  );

const runtimeAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
  kind: 'shared-durable-capability',
  sourceKind: 'sealed-hosted-owner-result',
  sourceAuthorityId: maximumIdentity('source'),
  sourceAuthorityImplementationDigest: digest('source-implementation'),
  routeBinding: maximumIdentity('route'),
  capabilityProfileId: program.profileProjection.capabilityProfileId,
  capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
  capabilityId: program.profileProjection.capabilityId,
  protocolFamily: 'openai-responses',
  providerConfigurationId,
  modelId: providerModelId,
  modelLineageDigest: providerModelLineageDigest,
  adapterDigest: providerAdapterDigest,
  registrationAuthorityIssuerId: maximumIdentity('issuer'),
  registrationReceiptDigest: digest('registration'),
  hostedRetrievalRuntimeResourceRegistrationIntentDigest:
    runtimeResourceRegistrationIntent.intentDigest,
});

const requestRefAuthority =
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
    namespaceId: hostedNamespaceId,
    planDigest: digest('plan'),
    repositoryCommit,
    attemptId: maximumIdentity('attempt'),
    descriptorDigest: digest('descriptor'),
    turnIndex: 2,
    invocationId: maximumIdentity('invocation'),
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    toolId: 'provider.retrieval.search',
    targetRef: maximumIdentity('target'),
    protocolFamily: 'openai-responses',
    providerConfigurationId: runtimeAuthority.providerConfigurationId,
    modelLineageDigest: runtimeAuthority.modelLineageDigest,
    adapterDigest: runtimeAuthority.adapterDigest,
    runtimeFactSourceAuthorityDigest: runtimeAuthority.authorityDigest,
    registrationReceiptDigest: runtimeAuthority.registrationReceiptDigest,
    issuedAt: checkedAt,
    expiresAt: readinessExpiresAt,
  });

const argumentsDigest = digestAgentEvaluationCapabilityEffectToolArguments({
  requestRef: requestRefAuthority.requestRef,
  targetRef: requestRefAuthority.targetRef,
});

const registryReceipt =
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    requestRef: requestRefAuthority.requestRef,
    targetRef: requestRefAuthority.targetRef,
    requestRefAuthority,
    requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
    sourceAttemptId: requestRefAuthority.attemptId,
    sourceTurnIndex: 2,
    sourceInvocationId: requestRefAuthority.invocationId,
    sourceProviderRequestDigest: digest('source-provider-request'),
    sourceResponseDigest: digest('source-provider-response'),
    sourceDispatchIntentDigest: digest('source-dispatch'),
    sourceTransportReceiptDigest: digest('source-transport'),
    sourceResultSpoolReceiptDigest: digest('source-spool'),
    sourceNormalizedEventSetDigest: digest('source-events'),
    sourceObservationReceiptDigest: null,
    sourceFactKind: 'provider-event',
    sourceProviderEventType: 'tool-call',
    sourceProviderToolCallId: maximumIdentity('provider-tool-call'),
    sourceToolId: 'provider.retrieval.search',
    sourceArgumentsDigest: argumentsDigest,
    sourceHandleDigest: digest('source-tool-call-event'),
    stateVaultSealRequest: null,
    stateVaultSealReceipt: null,
    protocolFamily: 'openai-responses',
    providerConfigurationId: runtimeAuthority.providerConfigurationId,
    modelLineageDigest: runtimeAuthority.modelLineageDigest,
    adapterDigest: runtimeAuthority.adapterDigest,
  });

const inputAuthorityBinding =
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
    registryReceipt
  );

const intentInput = Object.freeze({
  namespaceId: requestRefAuthority.namespaceId,
  planDigest: requestRefAuthority.planDigest,
  repositoryCommit,
  attemptId: requestRefAuthority.attemptId,
  descriptorDigest: requestRefAuthority.descriptorDigest,
  caseId: maximumIdentity('case'),
  materialDigest: digest('material'),
  turnIndex: 2,
  invocationId: requestRefAuthority.invocationId,
  toolId: 'provider.retrieval.search',
  toolCallId: maximumIdentity('tool-call'),
  providerToolCallId: registryReceipt.sourceProviderToolCallId!,
  providerRequestDigest: digest('source-provider-request'),
  argumentsDigest,
  requestedAt: checkedAt,
  inputAuthorityBinding,
  runtimeFactSourceAuthority: runtimeAuthority,
  registrationReceiptDigest: runtimeAuthority.registrationReceiptDigest,
});

const intent = createAgentEvaluationCapabilityPreEffectIntent({
  ...intentInput,
  ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentInput),
});

const responseId = maximumIdentity('response');
const responseJson = createAgentHostedRetrievalProviderResponseFixture({
  protocolFamily: 'openai-responses',
  responseId,
  citationResourceId: resourceAuthority.auxiliaryResourceIds[0]!,
});

const fixture = (fixtureResponseJson = responseJson) => {
  const readiness =
    createAgentEvaluationCapabilityEffectProviderReadinessReceipt(intent, {
      ownerInstanceId: maximumIdentity('owner'),
      transportOwnerInstanceId: maximumIdentity('transport-owner'),
      transportHealthDigest: digest('transport-health'),
      vaultOwnerInstanceId: null,
      vaultHealthDigest: null,
      status: 'healthy',
      unavailableReason: null,
      checkedAt,
      expiresAt: readinessExpiresAt,
    });
  const request = createAgentNativeProviderCapabilityRuntimeRequestMaterial(
    program,
    {
      operation: 'hosted-retrieval-query',
      protocolFamily: 'openai-responses',
      providerConfigurationId: runtimeAuthority.providerConfigurationId,
      modelId: runtimeAuthority.modelId,
      modelLineageDigest: runtimeAuthority.modelLineageDigest,
      adapterDigest: runtimeAuthority.adapterDigest,
      callbackLocalBaseRequestBody: null,
      callbackLocalProviderStateHandle: null,
      providerResourceAuthority: resourceAuthority,
      providerResourceReadRequest: runtimeResourceReadRequest,
      providerResourceReadReceipt: runtimeResourceReadReceipt,
      cacheKeyDigest: null,
      observedAt: '2026-08-09T07:00:01.000Z',
    }
  );
  const stage = createAgentEvaluationCapabilityEffectProviderStageRequest(
    program,
    intent,
    {
      readinessReceipt: readiness,
      requestProjection: request.projection,
      nativeSourceReceipt: null,
      stateVaultResolveRequest: null,
      stateVaultResolveReceipt: null,
      providerResourceSetCommitment: runtimeResourceSetCommitment,
      providerResourceAuthority: resourceAuthority,
      providerResourceReadRequest: runtimeResourceReadRequest,
      providerResourceReadReceipt: runtimeResourceReadReceipt,
      stagedAt: '2026-08-09T07:00:01.000Z',
      expiresAt: readinessExpiresAt,
    }
  );
  const response = decodeAgentNativeProviderCapabilityRuntimeResponse(
    program,
    request.projection,
    {
      transportOutcome: 'received',
      httpStatus: 200,
      responseBodyDigest: digestAgentCanonicalValue(fixtureResponseJson),
      sealedResponseJson: fixtureResponseJson,
      observedAt: '2026-08-09T07:00:02.300Z',
    }
  );
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: maximumIdentity('dispatch'),
    planDigest: intent.planDigest,
    repositoryCommit: intent.repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: intent.turnIndex,
    protocolFamily: request.projection.protocolFamily,
    providerConfigurationId: request.projection.providerConfigurationId,
    modelLineageDigest: request.projection.modelLineageDigest,
    inferenceConfigurationDigest: digest('inference-configuration'),
    invocationId: intent.invocationId,
    budgetReservationId: budgetReservationAuthority.reservationId,
    demandDigest: intent.ownerRequestDigest,
    requestDigest: request.projection.requestDigest,
    endpointId: maximumIdentity('endpoint'),
    endpointClass: 'first-party-hosted',
    requestBodyDigest: request.projection.requestBodyDigest,
    requestBytes: request.projection.requestBytes,
    createdAt: '2026-08-09T07:00:02.000Z',
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: maximumIdentity('transport'),
    protocolFamily: dispatchIntent.protocolFamily,
    providerConfigurationId: dispatchIntent.providerConfigurationId,
    invocationId: dispatchIntent.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest: dispatchIntent.requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass: dispatchIntent.endpointClass,
    requestBodyDigest: dispatchIntent.requestBodyDigest,
    requestBytes: dispatchIntent.requestBytes,
    responseBytes: JSON.stringify(fixtureResponseJson).length,
    sseEventCount: 0,
    dispatchState: 'dispatched',
    outcome: 'completed',
    httpStatus: 200,
    responseHeaderDigest: digest('response-headers'),
    responseBodyDigest: digestAgentCanonicalValue(fixtureResponseJson),
    providerRequestId: maximumIdentity('provider-request'),
    providerIdentityKind: 'response-id',
    providerResponseId: responseId,
    resolvedModelId: maximumIdentity('resolved-model'),
    resolvedModelVersion: maximumIdentity('resolved-version'),
    startedAt: '2026-08-09T07:00:02.100Z',
    completedAt: '2026-08-09T07:00:02.200Z',
  });
  const aad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
    namespaceDigest: digestAgentCanonicalValue({
      namespaceId: intent.namespaceId,
    }),
    planDigest: intent.planDigest,
    repositoryCommit: intent.repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    ownerRequestDigest: intent.ownerRequestDigest,
    stageDigest: stage.stageDigest,
    executionSequence: 0,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    responseBodyDigest: response.projection.responseBodyDigest!,
    responseProjectionDigest: response.projection.projectionDigest,
    responseDigest: response.projection.responseDigest,
    normalizedEventSetDigest: response.projection.normalizedEventSetDigest,
  });
  const spoolId = createAgentEvaluationCapabilityEffectProviderSpoolRef(aad);
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId,
    algorithm: 'aes-256-gcm',
    keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
    keyVersion: 1,
    keyRefDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
    encryptionProfileDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
  });
  const spoolEnvelopeAuthority =
    createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
      envelope
    );
  const spoolReceipt =
    createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
      aad,
      envelopeAuthority: spoolEnvelopeAuthority,
      retentionPolicyDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
      createdAt: '2026-08-09T07:00:02.300Z',
      expiresAt: readinessExpiresAt,
    });
  const execution =
    createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
      program,
      intent,
      stage,
      {
        requestProjection: request.projection,
        cacheWarmAuthority: null,
        dispatchIntent,
        transportReceipt,
        resultSpoolReceipt: spoolReceipt,
        responseProjection: response.projection,
        pollSequence: 0,
        priorExecutionReceipt: null,
        executedAt: '2026-08-09T07:00:02.400Z',
      }
    );
  const result = createAgentEvaluationCapabilityEffectProviderRuntimeResult(
    program,
    intent,
    stage,
    execution,
    {
      response,
      priorExecutionReceipt: null,
      stateVaultRetireRequest: null,
      stateVaultRetirementReceipt: null,
      nextStateVaultSealRequest: null,
      nextStateVaultSealReceipt: null,
      sealedAt: '2026-08-09T07:00:02.500Z',
    }
  );
  return Object.freeze({
    readiness,
    request,
    stage,
    response,
    dispatchIntent,
    transportReceipt,
    spoolAad: aad,
    spoolEnvelope: envelope,
    spoolEnvelopeAuthority,
    spoolReceipt,
    execution,
    result,
  });
};

const createBackgroundSetup = (maximumIdentities = false) => {
  const identity = (value: string, prefix: string): string =>
    maximumIdentities ? maximumIdentity(prefix) : value;
  const backgroundProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: 'g4-provider-background-job',
    capabilityProfileDigest: digestAgentCapabilityProbeProfile(
      'g4-provider-background-job'
    ),
  });
  const backgroundAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-provider-response-metadata',
    sourceAuthorityId: identity(
      'runtime-source.release.background-job',
      'source'
    ),
    sourceAuthorityImplementationDigest: digest(
      'background-source-implementation'
    ),
    routeBinding: identity('runtime-fact-source.background-job', 'route'),
    capabilityProfileId:
      backgroundProgram.profileProjection.capabilityProfileId,
    capabilityProfileDigest:
      backgroundProgram.profileProjection.capabilityProfileDigest,
    capabilityId: backgroundProgram.profileProjection.capabilityId,
    protocolFamily: 'gemini-interactions',
    providerConfigurationId: identity(
      'provider.release.gemini-interactions',
      'provider'
    ),
    modelId: identity('model.release.gemini-interactions', 'model'),
    modelLineageDigest: digest('background-model-lineage'),
    adapterDigest: digest('background-adapter'),
    registrationAuthorityIssuerId: identity(
      'authority.release.runtime-registration',
      'issuer'
    ),
    registrationReceiptDigest: digest('background-registration'),
  });
  const vaultAuthority = createAgentNativeProviderStateVaultAuthority({
    authorityId: identity('provider-state-vault.release.background', 'vault'),
    authorityImplementationDigest: digest('background-vault-implementation'),
    algorithm: 'aes-256-gcm',
    keyReferenceDigest: digest('background-vault-key-reference'),
    keyVersion: 1,
    encryptionProfileDigest: digest('background-vault-profile'),
    retentionPolicyDigest: digest('background-vault-retention'),
    deletionReceiptPolicyDigest: digest('background-vault-deletion'),
  });
  const callbackLocalProviderStateHandle = identity(
    'interaction_runtime_background',
    'state'
  );
  const sourceInvocationId = identity(
    'invocation.release.background.source.1',
    'source-invocation'
  );
  const sourceRequestDigest = digest('background-source-request');
  const sourceResponseDigest = digest('background-source-response');
  const stateVaultSealRequest = createAgentNativeProviderStateVaultSealRequest({
    authorityDigest: vaultAuthority.authorityDigest,
    purpose: 'background-job-state',
    attemptId: identity('attempt.release.background.1', 'attempt'),
    protocolFamily: 'gemini-interactions',
    providerStateReferenceKind: 'interaction-id',
    providerStateReferenceDigest: digestAgentNativeProviderStateReference(
      'interaction-id',
      callbackLocalProviderStateHandle
    ),
    probeProgramDigest: backgroundProgram.programDigest,
    capabilityProfileDigest:
      backgroundProgram.profileProjection.capabilityProfileDigest,
    invocationId: sourceInvocationId,
    requestDigest: sourceRequestDigest,
    responseDigest: sourceResponseDigest,
    responseBodyDigest: digest('background-source-response-body'),
    sealedResponseJsonDigest: digest('background-source-json'),
    providerConfigurationId: backgroundAuthority.providerConfigurationId,
    modelLineageDigest: backgroundAuthority.modelLineageDigest,
    adapterDigest: backgroundAuthority.adapterDigest,
    taskId: identity('task.release.background.1', 'task'),
    runId: identity('run.release.background.1', 'run'),
    generation: 1,
    observedAt: '2026-08-09T07:00:00.000Z',
    expiresAt: readinessExpiresAt,
  });
  const stateKeyCreationReceiptDigest = digest('background-state-key-created');
  const stateVaultSealReceipt = createAgentNativeProviderStateVaultSealReceipt(
    stateVaultSealRequest,
    {
      status: 'sealed',
      opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
        authorityDigest: vaultAuthority.authorityDigest,
        sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
        stateKeyCreationReceiptDigest,
      }),
      stateKeyCreationReceiptDigest,
      sealedAt: '2026-08-09T07:00:00.250Z',
    }
  );
  const executionIdentityAuthority =
    createAgentNativeProviderExecutionIdentityAuthority({
      invocationId: sourceInvocationId,
      taskId: stateVaultSealRequest.taskId,
      runId: stateVaultSealRequest.runId,
      generation: stateVaultSealRequest.generation,
    });
  const nativeSourceReceipt =
    createAgentNativeProviderOptionalCapabilitySourceReceipt(
      backgroundProgram,
      {
        protocolFamily: 'gemini-interactions',
        capabilityProfileDigest:
          backgroundProgram.profileProjection.capabilityProfileDigest,
        invocationId: sourceInvocationId,
        requestDigest: sourceRequestDigest,
        responseDigest: sourceResponseDigest,
        providerConfigurationId: backgroundAuthority.providerConfigurationId,
        modelLineageDigest: backgroundAuthority.modelLineageDigest,
        adapterDigest: backgroundAuthority.adapterDigest,
        executionIdentityAuthority,
        observedAt: '2026-08-09T07:00:00.300Z',
        source: Object.freeze({
          sourceKind: 'provider-job-active-status' as const,
          providerStateReferenceDigest:
            stateVaultSealRequest.providerStateReferenceDigest,
          opaqueProviderStateRef: stateVaultSealReceipt.opaqueProviderStateRef!,
          stateVaultAuthorityDigest: vaultAuthority.authorityDigest,
          stateVaultSealRequestDigest: stateVaultSealRequest.sealRequestDigest,
          stateVaultSealReceiptDigest: stateVaultSealReceipt.receiptDigest,
          taskId: stateVaultSealRequest.taskId,
          runId: stateVaultSealRequest.runId,
          generation: stateVaultSealRequest.generation,
          providerStatus: 'in-progress' as const,
        }),
      }
    );
  if (nativeSourceReceipt.fact.factType !== 'provider-job-receipt') {
    throw new TypeError('Background fixture did not produce a job fact.');
  }
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId: identity('namespace.release', 'namespace'),
      planDigest: digest('background-plan'),
      repositoryCommit,
      attemptId: stateVaultSealRequest.attemptId,
      descriptorDigest: digest('background-descriptor'),
      turnIndex: 1,
      invocationId: identity(
        'invocation.release.background.consumer.1',
        'consumer-invocation'
      ),
      bindingKind: 'provider-job',
      capabilityId: 'provider.background-job',
      toolId: 'provider.background-job.poll',
      targetRef: identity('target.release.background', 'target'),
      protocolFamily: 'gemini-interactions',
      providerConfigurationId: backgroundAuthority.providerConfigurationId,
      modelLineageDigest: backgroundAuthority.modelLineageDigest,
      adapterDigest: backgroundAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest: backgroundAuthority.authorityDigest,
      registrationReceiptDigest: backgroundAuthority.registrationReceiptDigest,
      issuedAt: '2026-08-09T07:00:00.500Z',
      expiresAt: readinessExpiresAt,
    });
  const backgroundArgumentsDigest =
    digestAgentEvaluationCapabilityEffectToolArguments({
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
    });
  const registryReceipt =
    createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
      bindingKind: 'provider-job',
      capabilityId: 'provider.background-job',
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
      requestRefAuthority,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      sourceAttemptId: stateVaultSealRequest.attemptId,
      sourceTurnIndex: 0,
      sourceInvocationId,
      sourceProviderRequestDigest: sourceRequestDigest,
      sourceResponseDigest,
      sourceDispatchIntentDigest: digest('background-source-dispatch'),
      sourceTransportReceiptDigest: digest('background-source-transport'),
      sourceResultSpoolReceiptDigest: digest('background-source-spool'),
      sourceNormalizedEventSetDigest: digest('background-source-events'),
      sourceObservationReceiptDigest: digest('background-source-observation'),
      sourceFactKind: 'provider-job-receipt',
      sourceProviderEventType: null,
      sourceProviderToolCallId: null,
      sourceToolId: null,
      sourceArgumentsDigest: null,
      sourceHandleDigest: nativeSourceReceipt.fact.value.receiptDigest,
      stateVaultSealRequest,
      stateVaultSealReceipt,
      protocolFamily: 'gemini-interactions',
      providerConfigurationId: backgroundAuthority.providerConfigurationId,
      modelLineageDigest: backgroundAuthority.modelLineageDigest,
      adapterDigest: backgroundAuthority.adapterDigest,
    });
  const backgroundBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      registryReceipt
    );
  const backgroundIntentInput = Object.freeze({
    namespaceId: requestRefAuthority.namespaceId,
    planDigest: requestRefAuthority.planDigest,
    repositoryCommit,
    attemptId: requestRefAuthority.attemptId,
    descriptorDigest: requestRefAuthority.descriptorDigest,
    caseId: identity('case.release.background', 'case'),
    materialDigest: digest('background-material'),
    turnIndex: 1,
    invocationId: requestRefAuthority.invocationId,
    toolId: requestRefAuthority.toolId,
    toolCallId: identity('tool-call.release.background.1', 'tool-call'),
    providerToolCallId: identity(
      'provider-tool-call.release.background.1',
      'provider-tool-call'
    ),
    providerRequestDigest: digest('background-consumer-request'),
    argumentsDigest: backgroundArgumentsDigest,
    requestedAt: '2026-08-09T07:00:00.750Z',
    inputAuthorityBinding: backgroundBinding,
    runtimeFactSourceAuthority: backgroundAuthority,
    registrationReceiptDigest: backgroundAuthority.registrationReceiptDigest,
  });
  const backgroundIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...backgroundIntentInput,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(
      backgroundIntentInput
    ),
  });
  const stateVaultResolveRequest =
    createAgentNativeProviderStateVaultResolveRequest({
      sealRequest: stateVaultSealRequest,
      sealReceipt: stateVaultSealReceipt,
      consumerAttemptId: backgroundIntent.attemptId,
      consumerInvocationId: backgroundIntent.invocationId,
      consumerGeneration: stateVaultSealRequest.generation,
      requestedAt: '2026-08-09T07:00:01.000Z',
    });
  const stateVaultResolveReceipt =
    createAgentNativeProviderStateVaultResolveReceipt(
      stateVaultResolveRequest,
      {
        status: 'resolved',
        callbackLocalProviderStateHandle,
        resolvedAt: '2026-08-09T07:00:01.250Z',
      }
    );
  const readiness =
    createAgentEvaluationCapabilityEffectProviderReadinessReceipt(
      backgroundIntent,
      {
        ownerInstanceId: identity('owner-instance.background.1', 'owner'),
        transportOwnerInstanceId: identity(
          'transport-instance.gemini.1',
          'transport-owner'
        ),
        transportHealthDigest: digest('background-transport-health'),
        vaultOwnerInstanceId: identity(
          'vault-instance.background.1',
          'vault-owner'
        ),
        vaultHealthDigest: digest('background-vault-health'),
        status: 'healthy',
        unavailableReason: null,
        checkedAt: '2026-08-09T07:00:01.300Z',
        expiresAt: readinessExpiresAt,
      }
    );
  const request = createAgentNativeProviderCapabilityRuntimeRequestMaterial(
    backgroundProgram,
    {
      operation: 'background-poll',
      protocolFamily: 'gemini-interactions',
      providerConfigurationId: backgroundAuthority.providerConfigurationId,
      modelId: backgroundAuthority.modelId,
      modelLineageDigest: backgroundAuthority.modelLineageDigest,
      adapterDigest: backgroundAuthority.adapterDigest,
      callbackLocalBaseRequestBody: null,
      callbackLocalProviderStateHandle,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      cacheKeyDigest: null,
      observedAt: '2026-08-09T07:00:01.400Z',
    }
  );
  const stage = createAgentEvaluationCapabilityEffectProviderStageRequest(
    backgroundProgram,
    backgroundIntent,
    {
      readinessReceipt: readiness,
      requestProjection: request.projection,
      nativeSourceReceipt,
      stateVaultResolveRequest,
      stateVaultResolveReceipt,
      providerResourceSetCommitment: null,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      stagedAt: '2026-08-09T07:00:01.500Z',
      expiresAt: readinessExpiresAt,
    }
  );
  const sourceFact = Object.freeze({
    factKind: 'provider-job-receipt' as const,
    factDigest: nativeSourceReceipt.fact.value.receiptDigest,
    value: nativeSourceReceipt.fact.value,
  });
  return Object.freeze({
    maximumIdentities,
    program: backgroundProgram,
    authority: backgroundAuthority,
    intent: backgroundIntent,
    registryReceipt,
    nativeSourceReceipt,
    sourceFact,
    stage,
    request,
    callbackLocalProviderStateHandle,
    stateVaultSealRequest,
    stateVaultSealReceipt,
    stateVaultResolveRequest,
    stateVaultResolveReceipt,
  });
};

const geminiBackgroundResponse = (
  status: 'completed' | 'in_progress' | 'queued',
  id = 'interaction_runtime_background'
) =>
  Object.freeze({
    id,
    status,
    steps: Object.freeze(
      status === 'completed'
        ? [
            Object.freeze({
              type: 'model_output',
              text: 'bounded terminal background result',
            }),
          ]
        : []
    ),
    usage: Object.freeze({
      total_input_tokens: 64,
      total_output_tokens: status === 'completed' ? 8 : 0,
      total_cached_tokens: 0,
    }),
  });

const openAiCacheResponse = (id: string, cachedTokens: number) =>
  Object.freeze({
    object: 'response',
    id,
    status: 'completed',
    output: Object.freeze([]),
    usage: Object.freeze({
      input_tokens: 4_200,
      output_tokens: 8,
      input_tokens_details: Object.freeze({ cached_tokens: cachedTokens }),
    }),
  });

const createCacheSetup = (maximumIdentities = false) => {
  const identity = (value: string, prefix: string): string =>
    maximumIdentities ? maximumIdentity(prefix) : value;
  const cacheProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: 'g4-provider-isolated-cache',
    capabilityProfileDigest: digestAgentCapabilityProbeProfile(
      'g4-provider-isolated-cache'
    ),
  });
  const cacheAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-provider-response-metadata',
    sourceAuthorityId: identity('runtime-source.release.cache', 'source'),
    sourceAuthorityImplementationDigest: digest('cache-source-implementation'),
    routeBinding: identity('runtime-fact-source.cache', 'route'),
    capabilityProfileId: cacheProgram.profileProjection.capabilityProfileId,
    capabilityProfileDigest:
      cacheProgram.profileProjection.capabilityProfileDigest,
    capabilityId: cacheProgram.profileProjection.capabilityId,
    protocolFamily: 'openai-responses',
    providerConfigurationId: identity(
      'provider.release.openai-cache',
      'provider'
    ),
    modelId: identity('model.release.openai-cache', 'model'),
    modelLineageDigest: digest('cache-model-lineage'),
    adapterDigest: digest('cache-adapter'),
    registrationAuthorityIssuerId: identity(
      'authority.release.runtime-registration',
      'issuer'
    ),
    registrationReceiptDigest: digest('cache-registration'),
  });
  const cacheKeyDigest = digest('cache-runtime-key');
  const sourceInvocationId = identity(
    'invocation.release.cache.source.1',
    'source-invocation'
  );
  const sourceRequestDigest = digest('cache-source-request');
  const sourceResponseDigest = digest('cache-source-response');
  const cacheUsage = createAgentUsageVector([
    Object.freeze({
      unit: 'cache-read-token',
      logicalAmount: '4096',
      billableAmount: '4096',
      confidence: 'reported',
    }),
  ]);
  const nativeSourceReceipt =
    createAgentNativeProviderOptionalCapabilitySourceReceipt(cacheProgram, {
      protocolFamily: 'openai-responses',
      capabilityProfileDigest:
        cacheProgram.profileProjection.capabilityProfileDigest,
      invocationId: sourceInvocationId,
      requestDigest: sourceRequestDigest,
      responseDigest: sourceResponseDigest,
      providerConfigurationId: cacheAuthority.providerConfigurationId,
      modelLineageDigest: cacheAuthority.modelLineageDigest,
      adapterDigest: cacheAuthority.adapterDigest,
      executionIdentityAuthority:
        createAgentNativeProviderExecutionIdentityAuthority({
          invocationId: sourceInvocationId,
          taskId: identity('task.release.cache.1', 'task'),
          runId: identity('run.release.cache.1', 'run'),
          generation: 1,
        }),
      source: Object.freeze({
        sourceKind: 'provider-cache-usage' as const,
        cacheIsolationAuthorityDigest: digest('cache-isolation-authority'),
        cacheKeyDigest,
        prefixDescriptorDigest:
          cacheProgram.providerRequestIntent.cachePrefixResource!
            .descriptorDigest,
        usageVector: cacheUsage,
        cachedTokenCount: 4_096,
        cacheScope: 'task' as const,
        provenIsolation: 'task' as const,
        providerRegion: identity('us-east-1', 'region'),
      }),
      observedAt: checkedAt,
    });
  if (nativeSourceReceipt.fact.factType !== 'provider-cache-receipt') {
    throw new TypeError('Cache fixture did not produce a cache fact.');
  }
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId: identity('namespace.release', 'namespace'),
      planDigest: digest('cache-plan'),
      repositoryCommit,
      attemptId: identity('attempt.release.cache.1', 'attempt'),
      descriptorDigest: digest('cache-descriptor'),
      turnIndex: 1,
      invocationId: identity(
        'invocation.release.cache.consumer.1',
        'consumer-invocation'
      ),
      bindingKind: 'provider-cache',
      capabilityId: 'provider.isolated-cache',
      toolId: 'provider.cache.inspect',
      targetRef: identity('target.release.cache', 'target'),
      protocolFamily: 'openai-responses',
      providerConfigurationId: cacheAuthority.providerConfigurationId,
      modelLineageDigest: cacheAuthority.modelLineageDigest,
      adapterDigest: cacheAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest: cacheAuthority.authorityDigest,
      registrationReceiptDigest: cacheAuthority.registrationReceiptDigest,
      issuedAt: checkedAt,
      expiresAt: readinessExpiresAt,
    });
  const cacheArgumentsDigest =
    digestAgentEvaluationCapabilityEffectToolArguments({
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
    });
  const registryReceipt =
    createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
      bindingKind: 'provider-cache',
      capabilityId: 'provider.isolated-cache',
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
      requestRefAuthority,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      sourceAttemptId: requestRefAuthority.attemptId,
      sourceTurnIndex: 0,
      sourceInvocationId,
      sourceProviderRequestDigest: sourceRequestDigest,
      sourceResponseDigest,
      sourceDispatchIntentDigest: digest('cache-source-dispatch'),
      sourceTransportReceiptDigest: digest('cache-source-transport'),
      sourceResultSpoolReceiptDigest: digest('cache-source-spool'),
      sourceNormalizedEventSetDigest: digest('cache-source-events'),
      sourceObservationReceiptDigest: digest('cache-source-observation'),
      sourceFactKind: 'provider-cache-receipt',
      sourceProviderEventType: null,
      sourceProviderToolCallId: null,
      sourceToolId: null,
      sourceArgumentsDigest: null,
      sourceHandleDigest: nativeSourceReceipt.fact.value.receiptDigest,
      stateVaultSealRequest: null,
      stateVaultSealReceipt: null,
      protocolFamily: 'openai-responses',
      providerConfigurationId: cacheAuthority.providerConfigurationId,
      modelLineageDigest: cacheAuthority.modelLineageDigest,
      adapterDigest: cacheAuthority.adapterDigest,
    });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      registryReceipt
    );
  const intentInput = Object.freeze({
    namespaceId: requestRefAuthority.namespaceId,
    planDigest: requestRefAuthority.planDigest,
    repositoryCommit,
    attemptId: requestRefAuthority.attemptId,
    descriptorDigest: requestRefAuthority.descriptorDigest,
    caseId: identity('case.release.cache', 'case'),
    materialDigest: digest('cache-material'),
    turnIndex: 1,
    invocationId: requestRefAuthority.invocationId,
    toolId: requestRefAuthority.toolId,
    toolCallId: identity('tool-call.release.cache.1', 'tool-call'),
    providerToolCallId: identity(
      'provider-tool-call.release.cache.1',
      'provider-tool-call'
    ),
    providerRequestDigest: digest('cache-consumer-request'),
    argumentsDigest: cacheArgumentsDigest,
    requestedAt: checkedAt,
    inputAuthorityBinding,
    runtimeFactSourceAuthority: cacheAuthority,
    registrationReceiptDigest: cacheAuthority.registrationReceiptDigest,
  });
  const cacheIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...intentInput,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentInput),
  });
  const readiness =
    createAgentEvaluationCapabilityEffectProviderReadinessReceipt(cacheIntent, {
      ownerInstanceId: identity('owner-instance.cache.1', 'owner'),
      transportOwnerInstanceId: identity(
        'transport-instance.openai-cache.1',
        'transport-owner'
      ),
      transportHealthDigest: digest('cache-transport-health'),
      vaultOwnerInstanceId: null,
      vaultHealthDigest: null,
      status: 'healthy',
      unavailableReason: null,
      checkedAt: '2026-08-09T07:00:00.250Z',
      expiresAt: readinessExpiresAt,
    });
  const requestInput = Object.freeze({
    protocolFamily: 'openai-responses' as const,
    providerConfigurationId: cacheAuthority.providerConfigurationId,
    modelId: cacheAuthority.modelId,
    modelLineageDigest: cacheAuthority.modelLineageDigest,
    adapterDigest: cacheAuthority.adapterDigest,
    callbackLocalBaseRequestBody: null,
    callbackLocalProviderStateHandle: null,
    providerResourceAuthority: null,
    providerResourceReadRequest: null,
    providerResourceReadReceipt: null,
    cacheKeyDigest,
    observedAt: '2026-08-09T07:00:00.500Z',
  });
  const coldRequest = createAgentNativeProviderCapabilityRuntimeRequestMaterial(
    cacheProgram,
    { ...requestInput, operation: 'cache-cold' }
  );
  const warmRequest = createAgentNativeProviderCapabilityRuntimeRequestMaterial(
    cacheProgram,
    { ...requestInput, operation: 'cache-warm' }
  );
  const stage = createAgentEvaluationCapabilityEffectProviderStageRequest(
    cacheProgram,
    cacheIntent,
    {
      readinessReceipt: readiness,
      requestProjection: coldRequest.projection,
      nativeSourceReceipt,
      stateVaultResolveRequest: null,
      stateVaultResolveReceipt: null,
      providerResourceSetCommitment: null,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      stagedAt: '2026-08-09T07:00:00.750Z',
      expiresAt: readinessExpiresAt,
    }
  );
  return Object.freeze({
    maximumIdentities,
    program: cacheProgram,
    authority: cacheAuthority,
    intent: cacheIntent,
    registryReceipt,
    nativeSourceReceipt,
    coldRequest,
    warmRequest,
    stage,
  });
};

const createCacheExecution = (
  setup: ReturnType<typeof createCacheSetup>,
  input: Readonly<{
    sequence: 0 | 1;
    request: ReturnType<
      typeof createAgentNativeProviderCapabilityRuntimeRequestMaterial
    >;
    responseJson: ReturnType<typeof openAiCacheResponse>;
    priorExecutionReceipt: ReturnType<
      typeof createAgentEvaluationCapabilityEffectProviderExecutionReceipt
    > | null;
    cacheWarmAuthority: ReturnType<
      typeof createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority
    > | null;
  }>
) => {
  const identity = (value: string, prefix: string): string =>
    setup.maximumIdentities ? maximumIdentity(prefix) : value;
  const second = input.sequence === 1;
  const dispatchCreatedAt = second
    ? '2026-08-09T07:00:03.000Z'
    : '2026-08-09T07:00:01.000Z';
  const transportStartedAt = second
    ? '2026-08-09T07:00:03.100Z'
    : '2026-08-09T07:00:01.100Z';
  const transportCompletedAt = second
    ? '2026-08-09T07:00:03.500Z'
    : '2026-08-09T07:00:01.500Z';
  const observedAt = second
    ? '2026-08-09T07:00:03.600Z'
    : '2026-08-09T07:00:01.600Z';
  const executedAt = second
    ? '2026-08-09T07:00:03.700Z'
    : '2026-08-09T07:00:01.700Z';
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: identity(
      `dispatch.cache.${input.sequence}`,
      `dispatch-${input.sequence}`
    ),
    planDigest: setup.intent.planDigest,
    repositoryCommit: setup.intent.repositoryCommit,
    attemptId: setup.intent.attemptId,
    descriptorDigest: setup.intent.descriptorDigest,
    turnIndex: setup.intent.turnIndex,
    protocolFamily: 'openai-responses',
    providerConfigurationId: setup.authority.providerConfigurationId,
    modelLineageDigest: setup.authority.modelLineageDigest,
    inferenceConfigurationDigest: digest('cache-inference-configuration'),
    invocationId: setup.intent.invocationId,
    budgetReservationId: identity('budget-reservation.cache.1', 'budget'),
    demandDigest: setup.intent.ownerRequestDigest,
    requestDigest: input.request.projection.requestDigest,
    endpointId: identity('provider-endpoint.openai-cache.1', 'endpoint'),
    endpointClass: 'first-party-hosted',
    requestBodyDigest: input.request.projection.requestBodyDigest,
    requestBytes: input.request.projection.requestBytes,
    createdAt: dispatchCreatedAt,
  });
  const responseBodyDigest = digestAgentCanonicalValue(input.responseJson);
  const response = decodeAgentNativeProviderCapabilityRuntimeResponse(
    setup.program,
    input.request.projection,
    {
      transportOutcome: 'received',
      httpStatus: 200,
      responseBodyDigest,
      sealedResponseJson: input.responseJson,
      observedAt,
    }
  );
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: identity(
      `transport.cache.${input.sequence}`,
      `transport-${input.sequence}`
    ),
    protocolFamily: 'openai-responses',
    providerConfigurationId: setup.authority.providerConfigurationId,
    invocationId: setup.intent.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest: input.request.projection.requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass: dispatchIntent.endpointClass,
    requestBodyDigest: input.request.projection.requestBodyDigest,
    requestBytes: input.request.projection.requestBytes,
    responseBytes: new TextEncoder().encode(
      canonicalJsonText(input.responseJson)
    ).byteLength,
    httpStatus: 200,
    responseHeaderDigest: digest('cache-response-headers'),
    responseBodyDigest,
    providerRequestId: input.responseJson.id,
    ...(setup.maximumIdentities
      ? {
          providerIdentityKind: 'response-id' as const,
          providerResponseId: input.responseJson.id,
          resolvedModelId: maximumIdentity('resolved-model'),
          resolvedModelVersion: maximumIdentity('resolved-version'),
        }
      : {}),
    sseEventCount: 0,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: transportStartedAt,
    completedAt: transportCompletedAt,
  });
  const aad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
    namespaceDigest: digestAgentCanonicalValue({
      namespaceId: setup.intent.namespaceId,
    }),
    planDigest: setup.intent.planDigest,
    repositoryCommit: setup.intent.repositoryCommit,
    attemptId: setup.intent.attemptId,
    descriptorDigest: setup.intent.descriptorDigest,
    turnIndex: setup.intent.turnIndex,
    invocationId: setup.intent.invocationId,
    ownerRequestDigest: setup.intent.ownerRequestDigest,
    stageDigest: setup.stage.stageDigest,
    executionSequence: input.sequence,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    responseBodyDigest,
    responseProjectionDigest: response.projection.projectionDigest,
    responseDigest: response.projection.responseDigest,
    normalizedEventSetDigest: response.projection.normalizedEventSetDigest,
  });
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationCapabilityEffectProviderSpoolRef(aad),
    algorithm: 'aes-256-gcm',
    keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
    keyVersion: 1,
    keyRefDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
    encryptionProfileDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
    nonceBase64Url:
      input.sequence === 0 ? 'AAAAAAAAAAAAAAAA' : 'AAAAAAAAAAAAAAAB',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
  });
  const envelopeAuthority =
    createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
      envelope
    );
  const spoolReceipt =
    createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
      aad,
      envelopeAuthority,
      retentionPolicyDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
      createdAt: observedAt,
      expiresAt: readinessExpiresAt,
    });
  const execution =
    createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
      setup.program,
      setup.intent,
      setup.stage,
      {
        requestProjection: input.request.projection,
        cacheWarmAuthority: input.cacheWarmAuthority,
        dispatchIntent,
        transportReceipt,
        resultSpoolReceipt: spoolReceipt,
        responseProjection: response.projection,
        pollSequence: input.sequence,
        priorExecutionReceipt: input.priorExecutionReceipt,
        executedAt,
      }
    );
  return Object.freeze({
    request: input.request,
    response,
    dispatchIntent,
    transportReceipt,
    aad,
    envelope,
    envelopeAuthority,
    spoolReceipt,
    execution,
  });
};

const createContinuationSetup = (maximumIdentities = false) => {
  const identity = (value: string, prefix: string): string =>
    maximumIdentities ? maximumIdentity(prefix) : value;
  const continuationProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: 'g4-provider-reasoning-continuation',
    capabilityProfileDigest: digestAgentCapabilityProbeProfile(
      'g4-provider-reasoning-continuation'
    ),
  });
  const continuationAuthority = createAgentEvaluationRuntimeFactSourceAuthority(
    {
      kind: 'shared-durable-capability',
      sourceKind: 'sealed-provider-response-metadata',
      sourceAuthorityId: identity(
        'runtime-source.release.continuation',
        'source'
      ),
      sourceAuthorityImplementationDigest: digest(
        'continuation-source-implementation'
      ),
      routeBinding: identity('runtime-fact-source.continuation', 'route'),
      capabilityProfileId:
        continuationProgram.profileProjection.capabilityProfileId,
      capabilityProfileDigest:
        continuationProgram.profileProjection.capabilityProfileDigest,
      capabilityId: continuationProgram.profileProjection.capabilityId,
      protocolFamily: 'openai-responses',
      providerConfigurationId: identity(
        'provider.release.openai-continuation',
        'provider'
      ),
      modelId: identity('model.release.openai-continuation', 'model'),
      modelLineageDigest: digest('continuation-model-lineage'),
      adapterDigest: digest('continuation-adapter'),
      registrationAuthorityIssuerId: identity(
        'authority.release.runtime-registration',
        'issuer'
      ),
      registrationReceiptDigest: digest('continuation-registration'),
    }
  );
  const vaultAuthority = createAgentNativeProviderStateVaultAuthority({
    authorityId: identity('provider-state-vault.release.continuation', 'vault'),
    authorityImplementationDigest: digest('continuation-vault-implementation'),
    algorithm: 'aes-256-gcm',
    keyReferenceDigest: digest('continuation-vault-key-reference'),
    keyVersion: 1,
    encryptionProfileDigest: digest('continuation-vault-profile'),
    retentionPolicyDigest: digest('continuation-vault-retention'),
    deletionReceiptPolicyDigest: digest('continuation-vault-deletion'),
  });
  const sourceProviderStateHandle = identity(
    'resp_continuation_source',
    'state'
  );
  const sourceInvocationId = identity(
    'invocation.release.continuation.source.1',
    'source-invocation'
  );
  const sourceRequestDigest = digest('continuation-source-request');
  const sourceResponseDigest = digest('continuation-source-response');
  const stateVaultSealRequest = createAgentNativeProviderStateVaultSealRequest({
    authorityDigest: vaultAuthority.authorityDigest,
    purpose: 'reasoning-continuation-state',
    attemptId: identity('attempt.release.continuation.1', 'attempt'),
    protocolFamily: 'openai-responses',
    providerStateReferenceKind: 'response-id',
    providerStateReferenceDigest: digestAgentNativeProviderStateReference(
      'response-id',
      sourceProviderStateHandle
    ),
    probeProgramDigest: continuationProgram.programDigest,
    capabilityProfileDigest:
      continuationProgram.profileProjection.capabilityProfileDigest,
    invocationId: sourceInvocationId,
    requestDigest: sourceRequestDigest,
    responseDigest: sourceResponseDigest,
    responseBodyDigest: digest('continuation-source-response-body'),
    sealedResponseJsonDigest: digest('continuation-source-json'),
    providerConfigurationId: continuationAuthority.providerConfigurationId,
    modelLineageDigest: continuationAuthority.modelLineageDigest,
    adapterDigest: continuationAuthority.adapterDigest,
    taskId: identity('task.release.continuation.1', 'task'),
    runId: identity('run.release.continuation.1', 'run'),
    generation: 1,
    observedAt: checkedAt,
    expiresAt: readinessExpiresAt,
  });
  const sourceStateKeyCreationReceiptDigest = digest(
    'continuation-source-key-created'
  );
  const stateVaultSealReceipt = createAgentNativeProviderStateVaultSealReceipt(
    stateVaultSealRequest,
    {
      status: 'sealed',
      opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
        authorityDigest: vaultAuthority.authorityDigest,
        sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
        stateKeyCreationReceiptDigest: sourceStateKeyCreationReceiptDigest,
      }),
      stateKeyCreationReceiptDigest: sourceStateKeyCreationReceiptDigest,
      sealedAt: '2026-08-09T07:00:00.100Z',
    }
  );
  const nativeSourceReceipt =
    createAgentNativeProviderOptionalCapabilitySourceReceipt(
      continuationProgram,
      {
        protocolFamily: 'openai-responses',
        capabilityProfileDigest:
          continuationProgram.profileProjection.capabilityProfileDigest,
        invocationId: sourceInvocationId,
        requestDigest: sourceRequestDigest,
        responseDigest: sourceResponseDigest,
        providerConfigurationId: continuationAuthority.providerConfigurationId,
        modelLineageDigest: continuationAuthority.modelLineageDigest,
        adapterDigest: continuationAuthority.adapterDigest,
        executionIdentityAuthority:
          createAgentNativeProviderExecutionIdentityAuthority({
            invocationId: sourceInvocationId,
            taskId: stateVaultSealRequest.taskId,
            runId: stateVaultSealRequest.runId,
            generation: stateVaultSealRequest.generation,
          }),
        source: Object.freeze({
          sourceKind: 'provider-stored-continuation' as const,
          providerStateReferenceDigest:
            stateVaultSealRequest.providerStateReferenceDigest,
          opaqueProviderStateRef: stateVaultSealReceipt.opaqueProviderStateRef!,
          stateVaultAuthorityDigest: vaultAuthority.authorityDigest,
          stateVaultSealRequestDigest: stateVaultSealRequest.sealRequestDigest,
          stateVaultSealReceiptDigest: stateVaultSealReceipt.receiptDigest,
          taskId: stateVaultSealRequest.taskId,
          runId: stateVaultSealRequest.runId,
          generation: stateVaultSealRequest.generation,
          expiresAt: readinessExpiresAt,
        }),
        observedAt: '2026-08-09T07:00:00.200Z',
      }
    );
  if (nativeSourceReceipt.fact.factType !== 'opaque-continuation') {
    throw new TypeError(
      'Continuation fixture did not produce a continuation fact.'
    );
  }
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId: identity('namespace.release', 'namespace'),
      planDigest: digest('continuation-plan'),
      repositoryCommit,
      attemptId: stateVaultSealRequest.attemptId,
      descriptorDigest: digest('continuation-descriptor'),
      turnIndex: 1,
      invocationId: identity(
        'invocation.release.continuation.consumer.1',
        'consumer-invocation'
      ),
      bindingKind: 'opaque-continuation',
      capabilityId: 'provider.reasoning-continuation',
      toolId: 'provider.continuation.resume',
      targetRef: identity('target.release.continuation', 'target'),
      protocolFamily: 'openai-responses',
      providerConfigurationId: continuationAuthority.providerConfigurationId,
      modelLineageDigest: continuationAuthority.modelLineageDigest,
      adapterDigest: continuationAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest: continuationAuthority.authorityDigest,
      registrationReceiptDigest:
        continuationAuthority.registrationReceiptDigest,
      issuedAt: '2026-08-09T07:00:00.300Z',
      expiresAt: readinessExpiresAt,
    });
  const continuationArgumentsDigest =
    digestAgentEvaluationCapabilityEffectToolArguments({
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
    });
  const registryReceipt =
    createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
      bindingKind: 'opaque-continuation',
      capabilityId: 'provider.reasoning-continuation',
      requestRef: requestRefAuthority.requestRef,
      targetRef: requestRefAuthority.targetRef,
      requestRefAuthority,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      sourceAttemptId: stateVaultSealRequest.attemptId,
      sourceTurnIndex: 0,
      sourceInvocationId,
      sourceProviderRequestDigest: sourceRequestDigest,
      sourceResponseDigest,
      sourceDispatchIntentDigest: digest('continuation-source-dispatch'),
      sourceTransportReceiptDigest: digest('continuation-source-transport'),
      sourceResultSpoolReceiptDigest: digest('continuation-source-spool'),
      sourceNormalizedEventSetDigest: digest('continuation-source-events'),
      sourceObservationReceiptDigest: digest('continuation-source-observation'),
      sourceFactKind: 'opaque-continuation',
      sourceProviderEventType: null,
      sourceProviderToolCallId: null,
      sourceToolId: null,
      sourceArgumentsDigest: null,
      sourceHandleDigest: nativeSourceReceipt.fact.value.continuationDigest,
      stateVaultSealRequest,
      stateVaultSealReceipt,
      protocolFamily: 'openai-responses',
      providerConfigurationId: continuationAuthority.providerConfigurationId,
      modelLineageDigest: continuationAuthority.modelLineageDigest,
      adapterDigest: continuationAuthority.adapterDigest,
    });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      registryReceipt
    );
  const intentInput = Object.freeze({
    namespaceId: requestRefAuthority.namespaceId,
    planDigest: requestRefAuthority.planDigest,
    repositoryCommit,
    attemptId: requestRefAuthority.attemptId,
    descriptorDigest: requestRefAuthority.descriptorDigest,
    caseId: identity('case.release.continuation', 'case'),
    materialDigest: digest('continuation-material'),
    turnIndex: 1,
    invocationId: requestRefAuthority.invocationId,
    toolId: requestRefAuthority.toolId,
    toolCallId: identity('tool-call.release.continuation.1', 'tool-call'),
    providerToolCallId: identity(
      'provider-tool-call.release.continuation.1',
      'provider-tool-call'
    ),
    providerRequestDigest: digest('continuation-consumer-request'),
    argumentsDigest: continuationArgumentsDigest,
    requestedAt: '2026-08-09T07:00:00.400Z',
    inputAuthorityBinding,
    runtimeFactSourceAuthority: continuationAuthority,
    registrationReceiptDigest: continuationAuthority.registrationReceiptDigest,
  });
  const continuationIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...intentInput,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentInput),
  });
  const stateVaultResolveRequest =
    createAgentNativeProviderStateVaultResolveRequest({
      sealRequest: stateVaultSealRequest,
      sealReceipt: stateVaultSealReceipt,
      consumerAttemptId: continuationIntent.attemptId,
      consumerInvocationId: continuationIntent.invocationId,
      consumerGeneration: stateVaultSealRequest.generation,
      requestedAt: '2026-08-09T07:00:00.500Z',
    });
  const stateVaultResolveReceipt =
    createAgentNativeProviderStateVaultResolveReceipt(
      stateVaultResolveRequest,
      {
        status: 'resolved',
        callbackLocalProviderStateHandle: sourceProviderStateHandle,
        resolvedAt: '2026-08-09T07:00:00.600Z',
      }
    );
  const readiness =
    createAgentEvaluationCapabilityEffectProviderReadinessReceipt(
      continuationIntent,
      {
        ownerInstanceId: identity('owner-instance.continuation.1', 'owner'),
        transportOwnerInstanceId: identity(
          'transport-instance.continuation.1',
          'transport-owner'
        ),
        transportHealthDigest: digest('continuation-transport-health'),
        vaultOwnerInstanceId: identity(
          'vault-instance.continuation.1',
          'vault-owner'
        ),
        vaultHealthDigest: digest('continuation-vault-health'),
        status: 'healthy',
        unavailableReason: null,
        checkedAt: '2026-08-09T07:00:00.700Z',
        expiresAt: readinessExpiresAt,
      }
    );
  const request = createAgentNativeProviderCapabilityRuntimeRequestMaterial(
    continuationProgram,
    {
      operation: 'continuation-resume',
      protocolFamily: 'openai-responses',
      providerConfigurationId: continuationAuthority.providerConfigurationId,
      modelId: continuationAuthority.modelId,
      modelLineageDigest: continuationAuthority.modelLineageDigest,
      adapterDigest: continuationAuthority.adapterDigest,
      callbackLocalBaseRequestBody: null,
      callbackLocalProviderStateHandle: sourceProviderStateHandle,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      cacheKeyDigest: null,
      observedAt: '2026-08-09T07:00:00.800Z',
    }
  );
  const stage = createAgentEvaluationCapabilityEffectProviderStageRequest(
    continuationProgram,
    continuationIntent,
    {
      readinessReceipt: readiness,
      requestProjection: request.projection,
      nativeSourceReceipt,
      stateVaultResolveRequest,
      stateVaultResolveReceipt,
      providerResourceSetCommitment: null,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      stagedAt: '2026-08-09T07:00:00.900Z',
      expiresAt: readinessExpiresAt,
    }
  );
  return Object.freeze({
    program: continuationProgram,
    authority: continuationAuthority,
    vaultAuthority,
    intent: continuationIntent,
    registryReceipt,
    nativeSourceReceipt,
    stateVaultSealRequest,
    stateVaultSealReceipt,
    stateVaultResolveRequest,
    stateVaultResolveReceipt,
    request,
    stage,
  });
};

const createBackgroundExecution = (
  setup: ReturnType<typeof createBackgroundSetup>,
  input: Readonly<{
    pollSequence: number;
    priorExecutionReceipt: ReturnType<
      typeof createAgentEvaluationCapabilityEffectProviderExecutionReceipt
    > | null;
    providerStatus: 'completed' | 'in_progress' | 'queued';
    failureMode?: 'provider-denied' | 'timed-out';
    offsetMs: number;
    requestMaterial?: ReturnType<
      typeof createAgentNativeProviderCapabilityRuntimeRequestMaterial
    >;
    providerResponseId?: string;
  }>
) => {
  const identity = (value: string, prefix: string): string =>
    setup.maximumIdentities ? maximumIdentity(prefix) : value;
  const request = input.requestMaterial ?? setup.request;
  const rawResponse =
    input.failureMode === 'timed-out'
      ? null
      : input.failureMode === 'provider-denied'
        ? Object.freeze({
            error: Object.freeze({
              type: 'invalid_request_error',
              message: 'The bounded background request was denied.',
            }),
          })
        : geminiBackgroundResponse(
            input.providerStatus,
            input.providerResponseId ?? setup.callbackLocalProviderStateHandle
          );
  const transportOutcome =
    input.failureMode === 'timed-out'
      ? ('timed-out' as const)
      : ('received' as const);
  const httpStatus =
    input.failureMode === 'timed-out'
      ? null
      : input.failureMode === 'provider-denied'
        ? 403
        : 200;
  const responseBodyDigest =
    rawResponse === null ? null : digestAgentCanonicalValue(rawResponse);
  const observedAt = new Date(
    Date.parse('2026-08-09T07:00:02.000Z') + input.offsetMs + 300
  ).toISOString();
  const response = decodeAgentNativeProviderCapabilityRuntimeResponse(
    setup.program,
    request.projection,
    {
      transportOutcome,
      httpStatus,
      responseBodyDigest,
      sealedResponseJson: rawResponse,
      observedAt,
    }
  );
  const createdAt = new Date(
    Date.parse('2026-08-09T07:00:02.000Z') + input.offsetMs
  ).toISOString();
  const startedAt = new Date(Date.parse(createdAt) + 100).toISOString();
  const completedAt = new Date(Date.parse(createdAt) + 200).toISOString();
  const executedAt = new Date(Date.parse(createdAt) + 400).toISOString();
  const suffix = String(input.pollSequence).padStart(2, '0');
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: identity(
      `dispatch-intent.background.${suffix}`,
      `dispatch-${suffix}`
    ),
    planDigest: setup.intent.planDigest,
    repositoryCommit: setup.intent.repositoryCommit,
    attemptId: setup.intent.attemptId,
    descriptorDigest: setup.intent.descriptorDigest,
    turnIndex: setup.intent.turnIndex,
    protocolFamily: request.projection.protocolFamily,
    providerConfigurationId: request.projection.providerConfigurationId,
    modelLineageDigest: request.projection.modelLineageDigest,
    inferenceConfigurationDigest: digest('background-inference-configuration'),
    invocationId: setup.intent.invocationId,
    budgetReservationId: identity(
      `budget-reservation.background.${suffix}`,
      `budget-${suffix}`
    ),
    demandDigest: setup.intent.ownerRequestDigest,
    requestDigest: request.projection.requestDigest,
    endpointId: identity('endpoint.gemini.interactions', 'endpoint'),
    endpointClass: 'first-party-hosted',
    requestBodyDigest: request.projection.requestBodyDigest,
    requestBytes: request.projection.requestBytes,
    createdAt,
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: identity(
      `transport-receipt.background.${suffix}`,
      `transport-${suffix}`
    ),
    protocolFamily: dispatchIntent.protocolFamily,
    providerConfigurationId: dispatchIntent.providerConfigurationId,
    invocationId: dispatchIntent.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest: dispatchIntent.requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass: dispatchIntent.endpointClass,
    requestBodyDigest: dispatchIntent.requestBodyDigest,
    requestBytes: dispatchIntent.requestBytes,
    responseBytes:
      rawResponse === null ? 0 : JSON.stringify(rawResponse).length,
    sseEventCount: 0,
    dispatchState: 'dispatched',
    outcome: input.failureMode === undefined ? 'completed' : 'failed',
    ...(httpStatus === null
      ? {}
      : {
          httpStatus,
          responseHeaderDigest: digest(`background-response-headers.${suffix}`),
          responseBodyDigest: responseBodyDigest!,
          providerRequestId: identity(
            `provider-request.background.${suffix}`,
            `provider-request-${suffix}`
          ),
          ...(setup.maximumIdentities &&
          rawResponse !== null &&
          'id' in rawResponse
            ? {
                providerIdentityKind: 'interaction-id' as const,
                providerResponseId: rawResponse.id,
                resolvedModelId: maximumIdentity('resolved-model'),
                resolvedModelVersion: maximumIdentity('resolved-version'),
              }
            : {}),
        }),
    ...(input.failureMode === undefined
      ? {}
      : {
          errorCategory:
            input.failureMode === 'provider-denied'
              ? ('G4_RUNNER_PROVIDER_REJECTED' as const)
              : ('G4_RUNNER_TRANSPORT_FAILED' as const),
        }),
    startedAt,
    completedAt,
  });
  const aad =
    response.projection.responseBodyDigest === null
      ? null
      : createAgentEvaluationCapabilityEffectProviderSpoolAad({
          namespaceDigest: digestAgentCanonicalValue({
            namespaceId: setup.intent.namespaceId,
          }),
          planDigest: setup.intent.planDigest,
          repositoryCommit: setup.intent.repositoryCommit,
          attemptId: setup.intent.attemptId,
          descriptorDigest: setup.intent.descriptorDigest,
          turnIndex: setup.intent.turnIndex,
          invocationId: setup.intent.invocationId,
          ownerRequestDigest: setup.intent.ownerRequestDigest,
          stageDigest: setup.stage.stageDigest,
          executionSequence: input.pollSequence,
          dispatchIntentDigest: dispatchIntent.intentDigest,
          transportReceiptDigest: transportReceipt.receiptDigest,
          responseBodyDigest: response.projection.responseBodyDigest,
          responseProjectionDigest: response.projection.projectionDigest,
          responseDigest: response.projection.responseDigest,
          normalizedEventSetDigest:
            response.projection.normalizedEventSetDigest,
        });
  const envelope =
    aad === null
      ? null
      : createAgentEvaluationProviderResultSpoolEnvelope({
          spoolId: createAgentEvaluationCapabilityEffectProviderSpoolRef(aad),
          algorithm: 'aes-256-gcm',
          keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
          keyVersion: 1,
          keyRefDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
          encryptionProfileDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
          nonceBase64Url: `AAAAAAAAAAAAAA${suffix}`,
          authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
          ciphertextBase64Url: 'AQ',
          aadDigest: digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
        });
  const envelopeAuthority =
    envelope === null
      ? null
      : createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
          envelope
        );
  const spoolReceipt =
    aad === null || envelopeAuthority === null
      ? null
      : createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
          aad,
          envelopeAuthority,
          retentionPolicyDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
          createdAt: observedAt,
          expiresAt: readinessExpiresAt,
        });
  const execution =
    createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
      setup.program,
      setup.intent,
      setup.stage,
      {
        requestProjection: request.projection,
        cacheWarmAuthority: null,
        dispatchIntent,
        transportReceipt,
        resultSpoolReceipt: spoolReceipt,
        responseProjection: response.projection,
        pollSequence: input.pollSequence,
        priorExecutionReceipt: input.priorExecutionReceipt,
        executedAt,
      }
    );
  return Object.freeze({
    request,
    response,
    dispatchIntent,
    transportReceipt,
    aad,
    envelope,
    envelopeAuthority,
    spoolReceipt,
    execution,
  });
};

describe('capability effect Provider runtime authority', () => {
  it('seals one hosted retrieval through readiness, stage, dispatch, spool, and result fences', () => {
    const value = fixture();
    expect(
      isAgentEvaluationCapabilityEffectProviderReadinessReceipt(
        value.readiness,
        intent
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderStageRequest(
        value.stage,
        program,
        intent
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        value.execution,
        program,
        intent,
        value.stage
      )
    ).toBe(true);
    expect(value.result).toMatchObject({
      businessResult: { status: 'completed' },
      fact: { factKind: 'retrieval-query-receipt' },
      resultSealReceipt: {
        resultStatus: 'produced',
        consumedInputSourceFactDigest: null,
      },
    });
    expect(value.result.fact?.value).toMatchObject({
      sourceResultRefs: [expect.stringMatching(/^provider-citation\./u)],
      sourceResultDigests: [expect.stringMatching(/^sha256-/u)],
      queryDigest: publicResource.descriptor.queryDigest,
      indexDigest: publicResource.descriptor.indexDigest,
    });
    expect(value.response.projection.retrievalCitationResourceId).toBe(
      resourceAuthority.auxiliaryResourceIds[0]
    );
    expect(value.result.fact?.value).not.toHaveProperty(
      'retrievalConfigurationDigest'
    );
    expect(
      isAgentEvaluationCapabilityEffectProviderResultSealReceipt(
        value.result.resultSealReceipt,
        value.stage,
        value.execution,
        value.result.fact
      )
    ).toBe(true);
    expect(
      reconcileAgentEvaluationCapabilityEffectProviderStageRequest(
        value.stage,
        value.stage,
        program,
        intent
      )
    ).toBe(value.stage);
    expect(
      reconcileAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        value.execution,
        value.execution,
        program,
        intent,
        value.stage
      )
    ).toBe(value.execution);
    expect(
      reconcileAgentEvaluationCapabilityEffectProviderResultSealReceipt(
        value.result.resultSealReceipt,
        value.result.resultSealReceipt,
        value.stage,
        value.execution,
        value.result.fact
      )
    ).toBe(value.result.resultSealReceipt);
  });

  it('keeps a citation-free hosted response on the freshness-only receipt path', () => {
    const value = fixture(
      createAgentHostedRetrievalProviderResponseFixture({
        protocolFamily: 'openai-responses',
        responseId,
        citationResourceId: null,
      })
    );
    expect(value.response.projection.retrievalCitationResourceId).toBeNull();
    expect(value.result.fact?.value).toMatchObject({
      sourceResultRefs: [],
      sourceResultDigests: [],
      retrievalConfigurationDigest: resourceAuthority.authorityDigest,
    });
  });

  it('rejects a fully recomputed hosted citation outside the exact resource authority', () => {
    expect(() =>
      fixture(
        createAgentHostedRetrievalProviderResponseFixture({
          protocolFamily: 'openai-responses',
          responseId,
          citationResourceId: 'provider-resource.foreign',
        })
      )
    ).toThrow(/citation resource is foreign/u);
  });

  it('seals the full runtime journal preimage and omits ciphertext from the bounded archive', () => {
    const value = fixture();
    const sharedFixture =
      createAgentCapabilityEffectProviderRuntimeJournalFixture({
        program,
        intent,
        readiness: {
          ownerInstanceId: maximumIdentity('owner'),
          transportOwnerInstanceId: maximumIdentity('transport-owner'),
          transportHealthDigest: digest('transport-health'),
          vaultOwnerInstanceId: null,
          vaultHealthDigest: null,
          status: 'healthy',
          unavailableReason: null,
          checkedAt,
          expiresAt: readinessExpiresAt,
        },
        stage: {
          nativeSourceReceipt: null,
          stateVaultResolveRequest: null,
          stateVaultResolveReceipt: null,
          providerResourceSetCommitment: runtimeResourceSetCommitment,
          providerResourceAuthority: resourceAuthority,
          providerResourceReadRequest: runtimeResourceReadRequest,
          providerResourceReadReceipt: runtimeResourceReadReceipt,
          stagedAt: '2026-08-09T07:00:01.000Z',
          expiresAt: readinessExpiresAt,
        },
        executions: Object.freeze([
          {
            requestMaterial: value.request,
            cacheWarmAuthority: null,
            transportOutcome: 'received',
            httpStatus: 200,
            sealedResponseJson: responseJson,
            pollSequence: 0,
            createdAt: '2026-08-09T07:00:02.000Z',
            startedAt: '2026-08-09T07:00:02.100Z',
            completedAt: '2026-08-09T07:00:02.200Z',
            observedAt: '2026-08-09T07:00:02.300Z',
            executedAt: '2026-08-09T07:00:02.400Z',
            providerRequestId: maximumIdentity('provider-request'),
          },
        ]),
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        sealedAt: '2026-08-09T07:00:02.500Z',
      });
    expect(sharedFixture.resultRecord.recordDigest).toMatch(/^sha256-/u);
    expect(
      finalizeAgentCapabilityEffectProviderRuntimeJournalFixture(
        sharedFixture,
        digest('shared-hosted-effect-source-receipt')
      ).executionRecords
    ).toHaveLength(1);
    const stageRecord =
      createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        intent,
        value.stage
      );
    const executionRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: value.execution,
        priorExecutionRecord: null,
        spoolAad: value.spoolAad,
        spoolEnvelopeAuthority: value.spoolEnvelopeAuthority,
      });
    const executionWrite =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite(
        executionRecord,
        value.spoolEnvelope
      );
    const resumableSnapshot =
      createAgentEvaluationCapabilityEffectProviderJournalSnapshot({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord: null,
        abandonmentRecord: null,
        resumableSpoolEnvelopes: Object.freeze([value.spoolEnvelope]),
        readAt: value.execution.executedAt,
      });
    expect(
      isAgentEvaluationCapabilityEffectProviderJournalSnapshot(
        resumableSnapshot
      )
    ).toBe(true);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalSnapshot({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord: null,
        abandonmentRecord: null,
        resumableSpoolEnvelopes: Object.freeze([value.spoolEnvelope]),
        readAt: value.stage.expiresAt,
      })
    ).toThrow(/snapshot lifetime drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalSnapshot({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord: null,
        abandonmentRecord: null,
        resumableSpoolEnvelopes: Object.freeze([value.spoolEnvelope]),
        readAt: '2026-08-09T07:00:02.399Z',
      })
    ).toThrow(/snapshot lifetime drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord({
        stageRecord,
        executionRecords: Object.freeze([]),
        reason: 'stage-expired',
        spoolDispositionReceipts: Object.freeze([]),
        abandonedAt: '2026-08-09T07:02:04.999Z',
      })
    ).toThrow(/abandonment dispositions drifted/u);
    expect(
      createAgentEvaluationCapabilityEffectProviderJournalAbandonmentRecord({
        stageRecord,
        executionRecords: Object.freeze([]),
        reason: 'stage-expired',
        spoolDispositionReceipts: Object.freeze([]),
        abandonedAt: value.stage.expiresAt,
      }).reason
    ).toBe('stage-expired');
    const disposition =
      createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt({
        spoolRef: value.spoolReceipt.spoolRef,
        spoolReceiptDigest: value.spoolReceipt.receiptDigest,
        planDigest: intent.planDigest,
        repositoryCommit: intent.repositoryCommit,
        attemptId: intent.attemptId,
        descriptorDigest: intent.descriptorDigest,
        turnIndex: intent.turnIndex,
        invocationId: intent.invocationId,
        ownerRequestDigest: intent.ownerRequestDigest,
        stageDigest: value.stage.stageDigest,
        executionSequence: 0,
        disposition: 'consumed-and-destroyed',
        resultSealReceiptDigest: value.result.resultSealReceipt.receiptDigest,
        abandonmentReason: null,
        retentionPolicyDigest: value.spoolReceipt.retentionPolicyDigest,
        disposedAt: value.result.resultSealReceipt.sealedAt,
      });
    const resultRecordInput = Object.freeze({
      stageRecord,
      executionRecords: Object.freeze([executionRecord]),
      businessResult: value.result.businessResult,
      effectSourceFact: value.result.fact,
      stateVaultRetireRequest: null,
      stateVaultRetirementReceipt: null,
      nextStateVaultSealRequest: null,
      nextStateVaultSealReceipt: null,
      resultSealReceipt: value.result.resultSealReceipt,
      spoolDispositionReceipts: Object.freeze([disposition]),
    });
    const resultRecord =
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord(
        resultRecordInput
      );
    const expectBusinessResultTamperRejected = (
      overrides: Partial<
        Pick<
          AgentEvaluationCapabilityEffectProviderBusinessResult,
          'status' | 'providerStatus' | 'outputText'
        >
      >
    ) => {
      const { resultDigest: _businessResultDigest, ...businessResultBase } =
        value.result.businessResult;
      const tamperedBusinessResultBase = Object.freeze({
        ...businessResultBase,
        ...overrides,
      });
      const tamperedBusinessResult = Object.freeze({
        ...tamperedBusinessResultBase,
        resultDigest: digestAgentCanonicalValue(tamperedBusinessResultBase),
      });
      const { receiptDigest: _resultSealReceiptDigest, ...resultSealBase } =
        value.result.resultSealReceipt;
      const tamperedResultSealBase = Object.freeze({
        ...resultSealBase,
        businessResultDigest: tamperedBusinessResult.resultDigest,
      });
      const tamperedResultSealReceipt = Object.freeze({
        ...tamperedResultSealBase,
        receiptDigest: digestAgentCanonicalValue(tamperedResultSealBase),
      });
      expect(() =>
        createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
          ...resultRecordInput,
          businessResult: tamperedBusinessResult,
          resultSealReceipt: tamperedResultSealReceipt,
        })
      ).toThrow(/result preimages drifted/u);
    };
    expectBusinessResultTamperRejected({ status: 'failed' });
    expectBusinessResultTamperRejected({ providerStatus: 'queued' });
    expectBusinessResultTamperRejected({ outputText: 'tampered-output' });
    const { receiptDigest: _earlyResultSealDigest, ...earlyResultSealBase } =
      value.result.resultSealReceipt;
    const earlyResultSealPreimage = Object.freeze({
      ...earlyResultSealBase,
      sealedAt: '2026-08-09T07:00:02.000Z',
    });
    const earlyResultSeal = Object.freeze({
      ...earlyResultSealPreimage,
      receiptDigest: digestAgentCanonicalValue(earlyResultSealPreimage),
    });
    const earlyDisposition =
      createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt({
        spoolRef: value.spoolReceipt.spoolRef,
        spoolReceiptDigest: value.spoolReceipt.receiptDigest,
        planDigest: intent.planDigest,
        repositoryCommit: intent.repositoryCommit,
        attemptId: intent.attemptId,
        descriptorDigest: intent.descriptorDigest,
        turnIndex: intent.turnIndex,
        invocationId: intent.invocationId,
        ownerRequestDigest: intent.ownerRequestDigest,
        stageDigest: value.stage.stageDigest,
        executionSequence: 0,
        disposition: 'consumed-and-destroyed',
        resultSealReceiptDigest: earlyResultSeal.receiptDigest,
        abandonmentReason: null,
        retentionPolicyDigest: value.spoolReceipt.retentionPolicyDigest,
        disposedAt: earlyResultSeal.sealedAt,
      });
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        ...resultRecordInput,
        resultSealReceipt: earlyResultSeal,
        spoolDispositionReceipts: Object.freeze([earlyDisposition]),
      })
    ).toThrow(/result preimages drifted/u);
    if (value.result.fact?.factKind !== 'retrieval-query-receipt') {
      throw new TypeError('Hosted fixture omitted its retrieval fact.');
    }
    const { receiptDigest: _retrievalReceiptDigest, ...retrievalReceiptBase } =
      value.result.fact.value;
    const tamperedRetrievalReceiptBase = Object.freeze({
      ...retrievalReceiptBase,
      networkPolicyDigest: digest('foreign-hosted-network-policy'),
    });
    const tamperedRetrievalReceipt = Object.freeze({
      ...tamperedRetrievalReceiptBase,
      receiptDigest: digestAgentCanonicalValue(tamperedRetrievalReceiptBase),
    });
    const tamperedRetrievalFact = Object.freeze({
      factKind: 'retrieval-query-receipt' as const,
      factDigest: tamperedRetrievalReceipt.receiptDigest,
      value: tamperedRetrievalReceipt,
    });
    const {
      receiptDigest: _retrievalResultSealDigest,
      ...retrievalResultSealBase
    } = value.result.resultSealReceipt;
    const tamperedRetrievalResultSealBase = Object.freeze({
      ...retrievalResultSealBase,
      sourceFactDigest: tamperedRetrievalFact.factDigest,
    });
    const tamperedRetrievalResultSeal = Object.freeze({
      ...tamperedRetrievalResultSealBase,
      receiptDigest: digestAgentCanonicalValue(tamperedRetrievalResultSealBase),
    });
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        ...resultRecordInput,
        effectSourceFact: tamperedRetrievalFact,
        resultSealReceipt: tamperedRetrievalResultSeal,
      })
    ).toThrow(/result preimages drifted/u);
    expect(
      createAgentEvaluationCapabilityEffectProviderJournalSnapshot({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord,
        abandonmentRecord: null,
        resumableSpoolEnvelopes: Object.freeze([]),
        readAt: '2026-08-09T08:00:00.000Z',
      }).resumableSpools
    ).toEqual([]);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderRuntimeResult(
        program,
        intent,
        value.stage,
        value.execution,
        {
          response: value.response,
          priorExecutionReceipt: null,
          stateVaultRetireRequest: null,
          stateVaultRetirementReceipt: null,
          nextStateVaultSealRequest: null,
          nextStateVaultSealReceipt: null,
          sealedAt: value.stage.expiresAt,
        }
      )
    ).toThrow(/result seal input is invalid/u);
    const outerStageDigest = digest('outer-controlled-owner-stage');
    const outerDispatchAckDigest = digest(
      'outer-controlled-owner-dispatch-ack'
    );
    const effectSourceReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
        intentDigest: intent.intentDigest,
        ownerRequestId: intent.ownerRequestId,
        ownerRequestDigest: intent.ownerRequestDigest,
        runtimeFactSourceAuthority: intent.runtimeFactSourceAuthority,
        registrationReceiptDigest: intent.registrationReceiptDigest,
        effectStatus: 'produced',
        businessResultDigest: value.result.businessResult.resultDigest,
        providerRuntimeJournalResultRecordDigest: resultRecord.recordDigest,
        providerRuntimeResultSealReceiptDigest:
          value.result.resultSealReceipt.receiptDigest,
        sourceFactKind: value.result.fact!.factKind,
        sourceFactDigest: value.result.fact!.factDigest,
        stageDigest: outerStageDigest,
        dispatchAckDigest: outerDispatchAckDigest,
        transportReceiptDigest: value.transportReceipt.receiptDigest,
        resultSpoolReceiptDigest: value.spoolReceipt.receiptDigest,
        normalizedEventSetDigest:
          value.response.projection.normalizedEventSetDigest,
        stateVaultResolveRequest: null,
        stateVaultResolveReceipt: null,
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        specificReceiptDigests: Object.freeze([]),
        sealedAt: value.result.resultSealReceipt.sealedAt,
      });
    const archiveRecord =
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord,
        effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
      });
    const sourceRecordFor = (
      receipt: typeof effectSourceReceipt
    ): AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord => {
      const sourceReceiptBase = Object.freeze({
        format:
          'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt' as const,
        version: 1 as const,
        namespaceId: intent.namespaceId,
        planDigest: intent.planDigest,
        repositoryCommit: intent.repositoryCommit,
        attemptId: intent.attemptId,
        descriptorDigest: intent.descriptorDigest,
        targetId: requestRefAuthority.targetRef,
        targetDigest: digest('hosted-target'),
        capabilityProfileId:
          intent.runtimeFactSourceAuthority.capabilityProfileId,
        capabilityProfileDigest:
          intent.runtimeFactSourceAuthority.capabilityProfileDigest,
        capabilityDescriptorDigest: digest('hosted-capability-descriptor'),
        capabilityId: intent.runtimeFactSourceAuthority.capabilityId,
        supportExpectation: 'required' as const,
        turnIndex: intent.turnIndex,
        invocationId: intent.invocationId,
        protocolFamily: intent.runtimeFactSourceAuthority.protocolFamily,
        providerConfigurationId:
          intent.runtimeFactSourceAuthority.providerConfigurationId,
        modelId: intent.runtimeFactSourceAuthority.modelId,
        modelLineageDigest:
          intent.runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: intent.runtimeFactSourceAuthority.adapterDigest,
        providerRequestDigest: intent.providerRequestDigest,
        responseDigest: value.response.projection.responseDigest,
        dispatchIntentDigest: value.dispatchIntent.intentDigest,
        transportReceiptDigest: receipt.transportReceiptDigest,
        resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
        normalizedEventSetDigest: receipt.normalizedEventSetDigest,
        targetAuthorityDigest:
          intent.runtimeFactSourceAuthority.authorityDigest,
        sourceAuthorityId: intent.runtimeFactSourceAuthority.sourceAuthorityId,
        sourceAuthorityImplementationDigest:
          intent.runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
        sourceAuthorityRouteBinding:
          intent.runtimeFactSourceAuthority.routeBinding,
        registrationAuthorityIssuerId:
          intent.runtimeFactSourceAuthority.registrationAuthorityIssuerId,
        registrationReceiptDigest: intent.registrationReceiptDigest,
        sourceKind: intent.runtimeFactSourceAuthority.sourceKind,
        sourceDigest: digestAgentCanonicalValue(value.result.fact),
        sourceRequestDigest: digest('hosted-outer-source-request'),
        outcome: 'observed' as const,
        observedAt: receipt.sealedAt,
        sealedAt: receipt.sealedAt,
        ownerRequestDigest: receipt.ownerRequestDigest,
        ownerReceiptDigest: receipt.receiptDigest,
        ownerStageDigest: receipt.stageDigest,
        ownerDispatchAckDigest: receipt.dispatchAckDigest,
        preEffectIntentDigest: intent.intentDigest,
        effectSourceReceiptDigest: receipt.receiptDigest,
        providerRuntimeJournalResultRecordDigest:
          receipt.providerRuntimeJournalResultRecordDigest,
        providerRuntimeResultSealReceiptDigest:
          receipt.providerRuntimeResultSealReceiptDigest,
        effectSourceFactDigest: value.result.fact!.factDigest,
        businessResultDigest: receipt.businessResultDigest,
        fact: value.result.fact!,
      });
      const sourceReceipt = Object.freeze({
        ...sourceReceiptBase,
        sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
      });
      return createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
        attemptId: intent.attemptId,
        turnIndex: intent.turnIndex,
        sourceSealDigest: sourceReceipt.sourceSealDigest,
        sourceReceipt,
        preEffectIntent: intent,
        effectSourceReceipt: receipt,
        effectSourceFact: value.result.fact,
      }) as AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord;
    };
    const sourceRecord = sourceRecordFor(effectSourceReceipt);
    const canonicalBytes = (candidate: unknown): number =>
      new TextEncoder().encode(canonicalJsonText(candidate)).byteLength;
    expect(
      Object.freeze({
        stageRecord: canonicalBytes(stageRecord),
        archiveRecord: canonicalBytes(archiveRecord),
      })
    ).toEqual({
      stageRecord: 38_679,
      archiveRecord: 63_991,
    });
    expect(canonicalBytes(stageRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumStageRecordBytes
    );
    expect(resourceAuthority.auxiliaryResourceIds).toHaveLength(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS
    );
    expect(
      [
        runtimeResourceRegistrationRequest.namespaceId,
        resourceAuthority.runtimeResourceSetId,
        resourceAuthority.providerConfigurationId,
        resourceAuthority.modelId,
        resourceAuthority.providerResourceId,
        runtimeResourceReadRequest.readerOwnerInstanceId,
        runtimeResourceReadRequest.readLeaseId,
        ...resourceAuthority.auxiliaryResourceIds,
      ].every((value) => value.length === 256)
    ).toBe(true);
    expect(value.stage.stageDigest).not.toBe(effectSourceReceipt.stageDigest);
    expect(value.execution.dispatchAckDigest).not.toBe(
      effectSourceReceipt.dispatchAckDigest
    );
    expect(
      matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource(
        archiveRecord,
        sourceRecord
      )
    ).toBe(true);
    const {
      format: _sourceReceiptFormat,
      version: _sourceReceiptVersion,
      receiptDigest: _sourceReceiptDigest,
      ...effectSourceReceiptInput
    } = effectSourceReceipt;
    const foreignJournalReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
        ...effectSourceReceiptInput,
        providerRuntimeJournalResultRecordDigest: digest(
          'foreign-provider-runtime-result-record'
        ),
      });
    expect(
      matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource(
        archiveRecord,
        sourceRecordFor(foreignJournalReceipt)
      )
    ).toBe(false);

    expect(executionWrite.spoolEnvelope?.ciphertextBase64Url).toBe('AQ');
    expect(JSON.stringify(archiveRecord)).not.toContain('ciphertextBase64Url');
    expect(
      isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord(
        archiveRecord
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget(
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget(
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes +
          1
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget(
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive +
          1,
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        ...archiveRecord,
        executionRecords: Object.freeze([
          {
            ...executionRecord,
            spoolEnvelopeAuthority: {
              ...value.spoolEnvelopeAuthority,
              ciphertextDigest: digest('swapped-ciphertext'),
            },
          },
        ]),
      })
    ).toBe(false);
  });

  it('rejects owner health, resource, stage, transport, and spool swaps', () => {
    const value = fixture();
    expect(
      isAgentEvaluationCapabilityEffectProviderReadinessReceipt(
        {
          ...value.readiness,
          transportHealthDigest: digest('swapped-transport-health'),
        },
        intent
      )
    ).toBe(false);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderStageRequest(
        program,
        intent,
        {
          readinessReceipt: value.readiness,
          requestProjection: value.request.projection,
          nativeSourceReceipt: null,
          stateVaultResolveRequest: null,
          stateVaultResolveReceipt: null,
          providerResourceSetCommitment: runtimeResourceSetCommitment,
          providerResourceAuthority: {
            ...resourceAuthority,
            providerResourceId: 'vs_swapped',
          },
          providerResourceReadRequest: runtimeResourceReadRequest,
          providerResourceReadReceipt: runtimeResourceReadReceipt,
          stagedAt: value.stage.stagedAt,
          expiresAt: value.stage.expiresAt,
        }
      )
    ).toThrow(/resource authority drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        program,
        intent,
        value.stage,
        {
          requestProjection: value.request.projection,
          cacheWarmAuthority: null,
          dispatchIntent: value.dispatchIntent,
          transportReceipt: {
            ...value.transportReceipt,
            requestDigest: digest('swapped-request'),
          },
          resultSpoolReceipt: value.spoolReceipt,
          responseProjection: value.response.projection,
          pollSequence: 0,
          priorExecutionReceipt: null,
          executedAt: value.execution.executedAt,
        }
      )
    ).toThrow(/invalid|drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        program,
        intent,
        value.stage,
        {
          requestProjection: value.request.projection,
          cacheWarmAuthority: null,
          dispatchIntent: value.dispatchIntent,
          transportReceipt: value.transportReceipt,
          resultSpoolReceipt: {
            ...value.spoolReceipt,
            normalizedEventSetDigest: digest('swapped-events'),
          },
          responseProjection: value.response.projection,
          pollSequence: 0,
          priorExecutionReceipt: null,
          executedAt: value.execution.executedAt,
        }
      )
    ).toThrow(/invalid|drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderRuntimeResult(
        program,
        intent,
        value.stage,
        value.execution,
        {
          response: Object.freeze({
            ...value.response,
            usageVector: createAgentUsageVector([]),
          }),
          priorExecutionReceipt: null,
          stateVaultRetireRequest: null,
          stateVaultRetirementReceipt: null,
          nextStateVaultSealRequest: null,
          nextStateVaultSealReceipt: null,
          sealedAt: '2026-08-09T07:00:02.500Z',
        }
      )
    ).toThrow(/business result projection drifted/u);
    const { receiptDigest: _receiptDigest, ...resourceDriftedResultSealBase } =
      value.result.resultSealReceipt;
    const resourceDriftedResultSeal = Object.freeze({
      ...resourceDriftedResultSealBase,
      providerResourceAuthorityDigest: digest('swapped-resource-authority'),
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderResultSealReceipt(
        Object.freeze({
          ...resourceDriftedResultSeal,
          receiptDigest: digestAgentCanonicalValue(resourceDriftedResultSeal),
        }),
        value.stage,
        value.execution,
        value.result.fact
      )
    ).toBe(false);
  });

  it('dispatches one exact cache cold/warm pair, journals both preimages, and consumes the selected source', () => {
    const setup = createCacheSetup(true);
    const coldResponseJson = openAiCacheResponse(
      maximumIdentity('cold-response'),
      0
    );
    const cold = createCacheExecution(setup, {
      sequence: 0,
      request: setup.coldRequest,
      responseJson: coldResponseJson,
      priorExecutionReceipt: null,
      cacheWarmAuthority: null,
    });
    expect(cold.execution.executionStatus).toBe('in-progress');
    const warmAuthority =
      createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
        setup.program,
        {
          coldRequest: setup.coldRequest.projection,
          coldResponse: cold.response.projection,
          warmRequest: setup.warmRequest.projection,
          preparedAt: '2026-08-09T07:00:02.000Z',
          expiresAt: readinessExpiresAt,
        }
      );
    const warmResponseJson = openAiCacheResponse(
      maximumIdentity('warm-response'),
      4_096
    );
    const warm = createCacheExecution(setup, {
      sequence: 1,
      request: setup.warmRequest,
      responseJson: warmResponseJson,
      priorExecutionReceipt: cold.execution,
      cacheWarmAuthority: warmAuthority,
    });
    expect(warm.execution.executionStatus).toBe('completed');
    const result = createAgentEvaluationCapabilityEffectProviderRuntimeResult(
      setup.program,
      setup.intent,
      setup.stage,
      warm.execution,
      {
        response: warm.response,
        priorExecutionReceipt: cold.execution,
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        sealedAt: '2026-08-09T07:00:04.000Z',
      }
    );
    expect(result).toMatchObject({
      fact: {
        factKind: 'provider-cache-receipt',
        value: { provenIsolation: 'task' },
      },
      resultSealReceipt: {
        resultStatus: 'produced',
        consumedInputSourceFactDigest: setup.registryReceipt.sourceHandleDigest,
      },
    });
    const sharedFixture =
      createAgentCapabilityEffectProviderRuntimeJournalFixture({
        program: setup.program,
        intent: setup.intent,
        readiness: {
          ownerInstanceId: maximumIdentity('owner'),
          transportOwnerInstanceId: maximumIdentity('transport-owner'),
          transportHealthDigest: digest('cache-transport-health'),
          vaultOwnerInstanceId: null,
          vaultHealthDigest: null,
          status: 'healthy',
          unavailableReason: null,
          checkedAt: '2026-08-09T07:00:00.250Z',
          expiresAt: readinessExpiresAt,
        },
        stage: {
          nativeSourceReceipt: setup.nativeSourceReceipt,
          stateVaultResolveRequest: null,
          stateVaultResolveReceipt: null,
          providerResourceSetCommitment: null,
          providerResourceAuthority: null,
          providerResourceReadRequest: null,
          providerResourceReadReceipt: null,
          stagedAt: '2026-08-09T07:00:00.750Z',
          expiresAt: readinessExpiresAt,
        },
        executions: Object.freeze([
          {
            requestMaterial: setup.coldRequest,
            cacheWarmAuthority: null,
            transportOutcome: 'received',
            httpStatus: 200,
            sealedResponseJson: coldResponseJson,
            pollSequence: 0,
            createdAt: '2026-08-09T07:00:01.000Z',
            startedAt: '2026-08-09T07:00:01.100Z',
            completedAt: '2026-08-09T07:00:01.500Z',
            observedAt: '2026-08-09T07:00:01.600Z',
            executedAt: '2026-08-09T07:00:01.700Z',
          },
          {
            requestMaterial: setup.warmRequest,
            cacheWarmAuthority: warmAuthority,
            transportOutcome: 'received',
            httpStatus: 200,
            sealedResponseJson: warmResponseJson,
            pollSequence: 1,
            createdAt: '2026-08-09T07:00:03.000Z',
            startedAt: '2026-08-09T07:00:03.100Z',
            completedAt: '2026-08-09T07:00:03.500Z',
            observedAt: '2026-08-09T07:00:03.600Z',
            executedAt: '2026-08-09T07:00:03.700Z',
          },
        ]),
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        sealedAt: '2026-08-09T07:00:04.000Z',
      });
    expect(sharedFixture.executionRecords).toHaveLength(2);
    expect(sharedFixture.runtimeResult.fact?.factKind).toBe(
      'provider-cache-receipt'
    );

    const stageRecord =
      createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        setup.intent,
        setup.stage
      );
    const coldRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: cold.execution,
        priorExecutionRecord: null,
        spoolAad: cold.aad,
        spoolEnvelopeAuthority: cold.envelopeAuthority,
      });
    const warmRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: warm.execution,
        priorExecutionRecord: coldRecord,
        spoolAad: warm.aad,
        spoolEnvelopeAuthority: warm.envelopeAuthority,
      });
    const dispositions = Object.freeze(
      [cold, warm].map((value) =>
        createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt({
          spoolRef: value.spoolReceipt.spoolRef,
          spoolReceiptDigest: value.spoolReceipt.receiptDigest,
          planDigest: setup.intent.planDigest,
          repositoryCommit: setup.intent.repositoryCommit,
          attemptId: setup.intent.attemptId,
          descriptorDigest: setup.intent.descriptorDigest,
          turnIndex: setup.intent.turnIndex,
          invocationId: setup.intent.invocationId,
          ownerRequestDigest: setup.intent.ownerRequestDigest,
          stageDigest: setup.stage.stageDigest,
          executionSequence: value.execution.pollSequence,
          disposition: 'consumed-and-destroyed',
          resultSealReceiptDigest: result.resultSealReceipt.receiptDigest,
          abandonmentReason: null,
          retentionPolicyDigest: value.spoolReceipt.retentionPolicyDigest,
          disposedAt: result.resultSealReceipt.sealedAt,
        })
      )
    );
    const resultRecord =
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        stageRecord,
        executionRecords: Object.freeze([coldRecord, warmRecord]),
        businessResult: result.businessResult,
        effectSourceFact: result.fact,
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        resultSealReceipt: result.resultSealReceipt,
        spoolDispositionReceipts: dispositions,
      });
    expect(resultRecord).toMatchObject({
      terminalExecutionRecordDigest: warmRecord.recordDigest,
    });
    const archiveRecord =
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord,
        executionRecords: Object.freeze([coldRecord, warmRecord]),
        resultRecord,
        effectSourceReceiptDigest: digest('cache-effect-source-receipt'),
      });
    const { executionReceipt: _warmExecutionReceipt, ...warmEnvelope } =
      warmRecord;
    const canonicalBytes = (value: unknown): number =>
      new TextEncoder().encode(canonicalJsonText(value)).byteLength;
    const maximumCacheShapeBytes = Object.freeze({
      stageRecord: canonicalBytes(stageRecord),
      warmExecutionReceipt: canonicalBytes(warm.execution),
      warmExecutionEnvelope: canonicalBytes(warmEnvelope),
      warmExecutionRecord: canonicalBytes(warmRecord),
      resultRecord: canonicalBytes(resultRecord),
      archiveRecord: canonicalBytes(archiveRecord),
    });
    expect(maximumCacheShapeBytes).toEqual({
      stageRecord: 22_539,
      warmExecutionReceipt: 14_748,
      warmExecutionEnvelope: 4_630,
      warmExecutionRecord: 19_398,
      resultRecord: 7_812,
      archiveRecord: 67_988,
    });
    expect(canonicalBytes(warm.execution)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    );
    expect(canonicalBytes(warmEnvelope)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes
    );
    expect(canonicalBytes(warmRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
    );
    expect(canonicalBytes(archiveRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
    );

    const { authorityDigest: _authorityDigest, ...warmAuthorityBase } =
      warmAuthority;
    const swappedBase = Object.freeze({
      ...warmAuthorityBase,
      coldResponseProjectionDigest: digest('foreign-cold-response'),
    });
    expect(() =>
      createCacheExecution(setup, {
        sequence: 1,
        request: setup.warmRequest,
        responseJson: openAiCacheResponse('resp_cache_warm_swap', 4_096),
        priorExecutionReceipt: cold.execution,
        cacheWarmAuthority: Object.freeze({
          ...swappedBase,
          authorityDigest: digestAgentCanonicalValue(swappedBase),
        }),
      })
    ).toThrow(/binding drifted|input is invalid/u);
    expect(
      doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource(
        result.resultSealReceipt,
        setup.registryReceipt
      )
    ).toBe(true);
  });

  it('rotates a consumed continuation into one newly sealed generation and archives both vault lifecycles', () => {
    const setup = createContinuationSetup(true);
    const nextProviderStateHandle = maximumIdentity('response');
    const responseJson = Object.freeze({
      object: 'response',
      id: nextProviderStateHandle,
      status: 'completed',
      output: Object.freeze([
        Object.freeze({
          type: 'message',
          content: Object.freeze([
            Object.freeze({
              type: 'output_text',
              text: 'x'.repeat(8_192),
            }),
          ]),
        }),
      ]),
      usage: Object.freeze({
        input_tokens: 64,
        output_tokens: 8,
        input_tokens_details: Object.freeze({ cached_tokens: 0 }),
      }),
    });
    const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
      intentId: maximumIdentity('dispatch'),
      planDigest: setup.intent.planDigest,
      repositoryCommit: setup.intent.repositoryCommit,
      attemptId: setup.intent.attemptId,
      descriptorDigest: setup.intent.descriptorDigest,
      turnIndex: setup.intent.turnIndex,
      protocolFamily: 'openai-responses',
      providerConfigurationId: setup.authority.providerConfigurationId,
      modelLineageDigest: setup.authority.modelLineageDigest,
      inferenceConfigurationDigest: digest(
        'continuation-inference-configuration'
      ),
      invocationId: setup.intent.invocationId,
      budgetReservationId: maximumIdentity('budget'),
      demandDigest: setup.intent.ownerRequestDigest,
      requestDigest: setup.request.projection.requestDigest,
      endpointId: maximumIdentity('endpoint'),
      endpointClass: 'first-party-hosted',
      requestBodyDigest: setup.request.projection.requestBodyDigest,
      requestBytes: setup.request.projection.requestBytes,
      createdAt: '2026-08-09T07:00:01.000Z',
    });
    const responseBodyDigest = digestAgentCanonicalValue(responseJson);
    const response = decodeAgentNativeProviderCapabilityRuntimeResponse(
      setup.program,
      setup.request.projection,
      {
        transportOutcome: 'received',
        httpStatus: 200,
        responseBodyDigest,
        sealedResponseJson: responseJson,
        observedAt: '2026-08-09T07:00:02.000Z',
      }
    );
    const transportReceipt = createAgentEvaluationTransportReceipt({
      receiptId: maximumIdentity('transport'),
      protocolFamily: 'openai-responses',
      providerConfigurationId: setup.authority.providerConfigurationId,
      invocationId: setup.intent.invocationId,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      requestDigest: setup.request.projection.requestDigest,
      endpointId: dispatchIntent.endpointId,
      endpointClass: dispatchIntent.endpointClass,
      requestBodyDigest: setup.request.projection.requestBodyDigest,
      requestBytes: setup.request.projection.requestBytes,
      responseBytes: new TextEncoder().encode(canonicalJsonText(responseJson))
        .byteLength,
      httpStatus: 200,
      responseHeaderDigest: digest('continuation-response-headers'),
      responseBodyDigest,
      providerRequestId: maximumIdentity('provider-request'),
      providerIdentityKind: 'response-id',
      providerResponseId: responseJson.id,
      resolvedModelId: maximumIdentity('resolved-model'),
      resolvedModelVersion: maximumIdentity('resolved-version'),
      sseEventCount: 0,
      dispatchState: 'dispatched',
      outcome: 'completed',
      startedAt: '2026-08-09T07:00:01.100Z',
      completedAt: '2026-08-09T07:00:01.900Z',
    });
    const aad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
      namespaceDigest: digestAgentCanonicalValue({
        namespaceId: setup.intent.namespaceId,
      }),
      planDigest: setup.intent.planDigest,
      repositoryCommit: setup.intent.repositoryCommit,
      attemptId: setup.intent.attemptId,
      descriptorDigest: setup.intent.descriptorDigest,
      turnIndex: setup.intent.turnIndex,
      invocationId: setup.intent.invocationId,
      ownerRequestDigest: setup.intent.ownerRequestDigest,
      stageDigest: setup.stage.stageDigest,
      executionSequence: 0,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      transportReceiptDigest: transportReceipt.receiptDigest,
      responseBodyDigest,
      responseProjectionDigest: response.projection.projectionDigest,
      responseDigest: response.projection.responseDigest,
      normalizedEventSetDigest: response.projection.normalizedEventSetDigest,
    });
    const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
      spoolId: createAgentEvaluationCapabilityEffectProviderSpoolRef(aad),
      algorithm: 'aes-256-gcm',
      keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
      keyVersion: 1,
      keyRefDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
      encryptionProfileDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
      nonceBase64Url: 'AAAAAAAAAAAAAAAA',
      authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
      ciphertextBase64Url: 'AQ',
      aadDigest: digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
    });
    const envelopeAuthority =
      createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        envelope
      );
    const spoolReceipt =
      createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
        aad,
        envelopeAuthority,
        retentionPolicyDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
        createdAt: response.projection.observedAt,
        expiresAt: readinessExpiresAt,
      });
    const execution =
      createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        setup.program,
        setup.intent,
        setup.stage,
        {
          requestProjection: setup.request.projection,
          cacheWarmAuthority: null,
          dispatchIntent,
          transportReceipt,
          resultSpoolReceipt: spoolReceipt,
          responseProjection: response.projection,
          pollSequence: 0,
          priorExecutionReceipt: null,
          executedAt: '2026-08-09T07:00:02.100Z',
        }
      );
    const nextStateVaultSealRequest =
      createAgentNativeProviderStateVaultSealRequest({
        authorityDigest: setup.vaultAuthority.authorityDigest,
        purpose: 'reasoning-continuation-state',
        attemptId: setup.intent.attemptId,
        protocolFamily: 'openai-responses',
        providerStateReferenceKind: 'response-id',
        providerStateReferenceDigest:
          response.projection.providerStateReferenceDigest!,
        probeProgramDigest: setup.program.programDigest,
        capabilityProfileDigest:
          setup.program.profileProjection.capabilityProfileDigest,
        invocationId: setup.intent.invocationId,
        requestDigest: setup.request.projection.requestDigest,
        responseDigest: response.projection.responseDigest,
        responseBodyDigest: response.projection.responseBodyDigest!,
        sealedResponseJsonDigest: response.projection.sealedResponseJsonDigest!,
        providerConfigurationId: setup.authority.providerConfigurationId,
        modelLineageDigest: setup.authority.modelLineageDigest,
        adapterDigest: setup.authority.adapterDigest,
        taskId: setup.stateVaultSealRequest.taskId,
        runId: setup.stateVaultSealRequest.runId,
        generation: setup.stateVaultSealRequest.generation + 1,
        observedAt: response.projection.observedAt,
        expiresAt: '2026-08-09T07:02:07.000Z',
      });
    const nextStateKeyCreationReceiptDigest = digest(
      'continuation-next-key-created'
    );
    const nextStateVaultSealReceipt =
      createAgentNativeProviderStateVaultSealReceipt(
        nextStateVaultSealRequest,
        {
          status: 'sealed',
          opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
            authorityDigest: setup.vaultAuthority.authorityDigest,
            sealRequestDigest: nextStateVaultSealRequest.sealRequestDigest,
            stateKeyCreationReceiptDigest: nextStateKeyCreationReceiptDigest,
          }),
          stateKeyCreationReceiptDigest: nextStateKeyCreationReceiptDigest,
          sealedAt: '2026-08-09T07:00:02.200Z',
        }
      );
    const retireRequest = createAgentNativeProviderStateVaultRetireRequest({
      sealRequest: setup.stateVaultSealRequest,
      sealReceipt: setup.stateVaultSealReceipt,
      resolveRequest: setup.stateVaultResolveRequest,
      resolveReceipt: setup.stateVaultResolveReceipt,
      disposition: 'consumed',
      requestedAt: '2026-08-09T07:00:02.300Z',
    });
    const retirementReceipt =
      createAgentNativeProviderStateVaultRetirementReceipt(
        retireRequest,
        setup.stateVaultSealRequest,
        setup.stateVaultSealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest: digest(
            'continuation-old-key-destroyed'
          ),
          opaqueRecordDeletionReceiptDigest: digest(
            'continuation-old-row-deleted'
          ),
          retiredAt: '2026-08-09T07:00:02.400Z',
        }
      );
    const result = createAgentEvaluationCapabilityEffectProviderRuntimeResult(
      setup.program,
      setup.intent,
      setup.stage,
      execution,
      {
        response,
        priorExecutionReceipt: null,
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest,
        nextStateVaultSealReceipt,
        sealedAt: '2026-08-09T07:00:02.500Z',
      }
    );
    expect(result.fact).toMatchObject({
      factKind: 'opaque-continuation',
      value: {
        generation: 2,
        parentInvocationId: setup.intent.invocationId,
        encryptedBlobRef: nextStateVaultSealReceipt.opaqueProviderStateRef,
      },
    });
    expect(result.fact?.factDigest).not.toBe(
      setup.registryReceipt.sourceHandleDigest
    );
    expect(result.resultSealReceipt).toMatchObject({
      consumedInputSourceFactDigest: setup.registryReceipt.sourceHandleDigest,
      nextStateVaultSealRequestDigest:
        nextStateVaultSealRequest.sealRequestDigest,
      nextStateVaultSealReceiptDigest: nextStateVaultSealReceipt.receiptDigest,
    });
    const sharedFixture =
      createAgentCapabilityEffectProviderRuntimeJournalFixture({
        program: setup.program,
        intent: setup.intent,
        readiness: {
          ownerInstanceId: maximumIdentity('owner'),
          transportOwnerInstanceId: maximumIdentity('transport-owner'),
          transportHealthDigest: digest('continuation-transport-health'),
          vaultOwnerInstanceId: maximumIdentity('vault-owner'),
          vaultHealthDigest: digest('continuation-vault-health'),
          status: 'healthy',
          unavailableReason: null,
          checkedAt: '2026-08-09T07:00:00.700Z',
          expiresAt: readinessExpiresAt,
        },
        stage: {
          nativeSourceReceipt: setup.nativeSourceReceipt,
          stateVaultResolveRequest: setup.stateVaultResolveRequest,
          stateVaultResolveReceipt: setup.stateVaultResolveReceipt,
          providerResourceSetCommitment: null,
          providerResourceAuthority: null,
          providerResourceReadRequest: null,
          providerResourceReadReceipt: null,
          stagedAt: '2026-08-09T07:00:00.900Z',
          expiresAt: readinessExpiresAt,
        },
        executions: Object.freeze([
          {
            requestMaterial: setup.request,
            cacheWarmAuthority: null,
            transportOutcome: 'received',
            httpStatus: 200,
            sealedResponseJson: responseJson,
            pollSequence: 0,
            createdAt: '2026-08-09T07:00:01.000Z',
            startedAt: '2026-08-09T07:00:01.100Z',
            completedAt: '2026-08-09T07:00:01.900Z',
            observedAt: '2026-08-09T07:00:02.000Z',
            executedAt: '2026-08-09T07:00:02.100Z',
            providerRequestId: maximumIdentity('provider-request'),
          },
        ]),
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest,
        nextStateVaultSealReceipt,
        sealedAt: '2026-08-09T07:00:02.500Z',
      });
    expect(sharedFixture.executionRecords).toHaveLength(1);
    expect(sharedFixture.runtimeResult.fact).toMatchObject({
      factKind: 'opaque-continuation',
      value: { generation: 2 },
    });

    const stageRecord =
      createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        setup.intent,
        setup.stage
      );
    const executionRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: execution,
        priorExecutionRecord: null,
        spoolAad: aad,
        spoolEnvelopeAuthority: envelopeAuthority,
      });
    const disposition =
      createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt({
        spoolRef: spoolReceipt.spoolRef,
        spoolReceiptDigest: spoolReceipt.receiptDigest,
        planDigest: setup.intent.planDigest,
        repositoryCommit: setup.intent.repositoryCommit,
        attemptId: setup.intent.attemptId,
        descriptorDigest: setup.intent.descriptorDigest,
        turnIndex: setup.intent.turnIndex,
        invocationId: setup.intent.invocationId,
        ownerRequestDigest: setup.intent.ownerRequestDigest,
        stageDigest: setup.stage.stageDigest,
        executionSequence: 0,
        disposition: 'consumed-and-destroyed',
        resultSealReceiptDigest: result.resultSealReceipt.receiptDigest,
        abandonmentReason: null,
        retentionPolicyDigest: spoolReceipt.retentionPolicyDigest,
        disposedAt: result.resultSealReceipt.sealedAt,
      });
    const resultRecord =
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        businessResult: result.businessResult,
        effectSourceFact: result.fact,
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest,
        nextStateVaultSealReceipt,
        resultSealReceipt: result.resultSealReceipt,
        spoolDispositionReceipts: Object.freeze([disposition]),
      });
    expect(resultRecord).toMatchObject({
      nextStateVaultSealRequest,
      nextStateVaultSealReceipt,
    });
    if (result.fact?.factKind !== 'opaque-continuation') {
      throw new TypeError('Rotated continuation runtime fact is missing.');
    }
    const effectSourceReceiptInput = Object.freeze({
      intentDigest: setup.intent.intentDigest,
      ownerRequestId: setup.intent.ownerRequestId,
      ownerRequestDigest: setup.intent.ownerRequestDigest,
      runtimeFactSourceAuthority: setup.authority,
      registrationReceiptDigest: setup.authority.registrationReceiptDigest,
      effectStatus: 'produced' as const,
      businessResultDigest: result.businessResult.resultDigest,
      providerRuntimeJournalResultRecordDigest: resultRecord.recordDigest,
      providerRuntimeResultSealReceiptDigest:
        result.resultSealReceipt.receiptDigest,
      sourceFactKind: result.fact.factKind,
      sourceFactDigest: result.fact.factDigest,
      stageDigest: digest('continuation-outer-stage'),
      dispatchAckDigest: digest('continuation-outer-dispatch-ack'),
      transportReceiptDigest: execution.transportReceipt.receiptDigest,
      resultSpoolReceiptDigest: spoolReceipt.receiptDigest,
      normalizedEventSetDigest:
        execution.responseProjection.normalizedEventSetDigest,
      stateVaultResolveRequest: setup.stateVaultResolveRequest,
      stateVaultResolveReceipt: setup.stateVaultResolveReceipt,
      stateVaultRetireRequest: retireRequest,
      stateVaultRetirementReceipt: retirementReceipt,
      specificReceiptDigests: Object.freeze([] as const),
      sealedAt: result.resultSealReceipt.sealedAt,
    });
    const effectSourceReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(
        setup.intent,
        effectSourceReceiptInput
      );
    const runtimeEnvelopeInput = Object.freeze({
      planDigest: setup.intent.planDigest,
      repositoryCommit: setup.intent.repositoryCommit,
      attemptId: setup.intent.attemptId,
      descriptorDigest: setup.intent.descriptorDigest,
      turnIndex: setup.intent.turnIndex,
      invocationId: setup.intent.invocationId,
      requestDigest: setup.intent.providerRequestDigest,
      responseDigest: response.projection.responseDigest,
      protocolFamily: 'openai-responses' as const,
      providerConfigurationId: setup.authority.providerConfigurationId,
      modelLineageDigest: setup.authority.modelLineageDigest,
      adapterDigest: setup.authority.adapterDigest,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      observedAt: result.resultSealReceipt.sealedAt,
      fact: result.fact,
    });
    const runtimeEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        setup.intent,
        effectSourceReceipt,
        runtimeEnvelopeInput
      );
    expect(runtimeEnvelope).toMatchObject({
      invocationId: setup.intent.invocationId,
      fact: {
        value: { parentInvocationId: setup.intent.invocationId },
      },
    });
    expect(
      isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(runtimeEnvelope)
    ).toBe(true);
    const { continuationDigest: _continuationDigest, ...continuationInput } =
      result.fact.value;
    const foreignContinuation = createAgentOpaqueContinuation({
      ...continuationInput,
      parentInvocationId: setup.intent.inputAuthorityBinding.sourceInvocationId,
    });
    const foreignFact = Object.freeze({
      factKind: 'opaque-continuation' as const,
      factDigest: foreignContinuation.continuationDigest,
      value: foreignContinuation,
    });
    const foreignEffectSourceReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(setup.intent, {
        ...effectSourceReceiptInput,
        sourceFactDigest: foreignFact.factDigest,
      });
    expect(() =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        setup.intent,
        foreignEffectSourceReceipt,
        { ...runtimeEnvelopeInput, fact: foreignFact }
      )
    ).toThrow(/runtime fact drifted/u);
    const archiveRecord =
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord,
        executionRecords: Object.freeze([executionRecord]),
        resultRecord,
        effectSourceReceiptDigest: digest('continuation-effect-source-receipt'),
      });
    const { executionReceipt: _executionReceipt, ...executionEnvelope } =
      executionRecord;
    const { businessResult: _businessResult, ...resultEnvelope } = resultRecord;
    const canonicalBytes = (value: unknown): number =>
      new TextEncoder().encode(canonicalJsonText(value)).byteLength;
    const maximumContinuationShapeBytes = Object.freeze({
      stageRecord: canonicalBytes(stageRecord),
      executionReceipt: canonicalBytes(execution),
      executionEnvelope: canonicalBytes(executionEnvelope),
      executionRecord: canonicalBytes(executionRecord),
      businessResult: canonicalBytes(result.businessResult),
      resultEnvelope: canonicalBytes(resultEnvelope),
      resultRecord: canonicalBytes(resultRecord),
      archiveRecord: canonicalBytes(archiveRecord),
    });
    expect(maximumContinuationShapeBytes).toEqual({
      stageRecord: 31_000,
      executionReceipt: 12_863,
      executionEnvelope: 4_561,
      executionRecord: 17_444,
      businessResult: 8_439,
      resultEnvelope: 13_733,
      resultRecord: 22_190,
      archiveRecord: 71_456,
    });
    expect(
      [
        setup.intent.namespaceId,
        setup.intent.attemptId,
        setup.intent.invocationId,
        setup.intent.caseId,
        setup.intent.toolCallId,
        setup.intent.providerToolCallId,
        dispatchIntent.intentId,
        dispatchIntent.budgetReservationId,
        dispatchIntent.endpointId,
        transportReceipt.receiptId,
        transportReceipt.providerRequestId,
        transportReceipt.providerResponseId,
        transportReceipt.resolvedModelId,
        transportReceipt.resolvedModelVersion,
      ].every((value) => value?.length === 256)
    ).toBe(true);
    expect(envelope.keyId).toBe(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID
    );
    expect(canonicalBytes(result.businessResult.outputText)).toBe(8_194);
    expect(canonicalBytes(execution)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    );
    expect(canonicalBytes(executionEnvelope)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes
    );
    expect(canonicalBytes(executionRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
    );
    expect(canonicalBytes(result.businessResult)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES
    );
    expect(canonicalBytes(resultEnvelope)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordEnvelopeBytes
    );
    expect(canonicalBytes(resultRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes
    );
    expect(canonicalBytes(archiveRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
    );
    const {
      format: _dispatchFormat,
      version: _dispatchVersion,
      intentDigest: _intentDigest,
      ...dispatchInput
    } = dispatchIntent;
    expect(() =>
      createAgentEvaluationTransportDispatchIntent({
        ...dispatchInput,
        intentId: `${dispatchIntent.intentId}x`,
      })
    ).toThrow(/transport dispatch intent is invalid/u);
    const oversizedResponseJson = Object.freeze({
      ...responseJson,
      output: Object.freeze([
        Object.freeze({
          type: 'message',
          content: Object.freeze([
            Object.freeze({
              type: 'output_text',
              text: 'x'.repeat(8_193),
            }),
          ]),
        }),
      ]),
    });
    expect(
      decodeAgentNativeProviderCapabilityRuntimeResponse(
        setup.program,
        setup.request.projection,
        {
          transportOutcome: 'received',
          httpStatus: 200,
          responseBodyDigest: digestAgentCanonicalValue(oversizedResponseJson),
          sealedResponseJson: oversizedResponseJson,
          observedAt: response.projection.observedAt,
        }
      )
    ).toMatchObject({
      callbackLocalOutputText: null,
      projection: {
        denialKind: 'response-invalid',
        outputTextDigest: null,
      },
    });

    const foreignHandle = 'resp_continuation_foreign';
    const {
      format: _format,
      version: _version,
      sealRequestDigest: _sealRequestDigest,
      ...nextStateVaultSealRequestInput
    } = nextStateVaultSealRequest;
    const foreignNextRequest = createAgentNativeProviderStateVaultSealRequest({
      ...nextStateVaultSealRequestInput,
      providerStateReferenceDigest: digestAgentNativeProviderStateReference(
        'response-id',
        foreignHandle
      ),
    });
    const foreignKeyReceiptDigest = digest('continuation-foreign-key-created');
    const foreignNextReceipt = createAgentNativeProviderStateVaultSealReceipt(
      foreignNextRequest,
      {
        status: 'sealed',
        opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
          authorityDigest: setup.vaultAuthority.authorityDigest,
          sealRequestDigest: foreignNextRequest.sealRequestDigest,
          stateKeyCreationReceiptDigest: foreignKeyReceiptDigest,
        }),
        stateKeyCreationReceiptDigest: foreignKeyReceiptDigest,
        sealedAt: '2026-08-09T07:00:02.200Z',
      }
    );
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderRuntimeResult(
        setup.program,
        setup.intent,
        setup.stage,
        execution,
        {
          response,
          priorExecutionReceipt: null,
          stateVaultRetireRequest: retireRequest,
          stateVaultRetirementReceipt: retirementReceipt,
          nextStateVaultSealRequest: foreignNextRequest,
          nextStateVaultSealReceipt: foreignNextReceipt,
          sealedAt: '2026-08-09T07:00:02.500Z',
        }
      )
    ).toThrow(/rotation authority drifted/u);
  });

  it('keeps byte predicates and journal composition arithmetic exact', () => {
    const exactSized = (maximumBytes: number) => {
      const empty = Object.freeze({ payload: '' });
      const overhead = new TextEncoder().encode(
        canonicalJsonText(empty)
      ).byteLength;
      return Object.freeze({ payload: 'x'.repeat(maximumBytes - overhead) });
    };
    const executionExact = exactSized(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
    );
    const businessExact = exactSized(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_BUSINESS_RESULT_MAXIMUM_BYTES
    );
    expect(
      isAgentEvaluationCapabilityEffectProviderExecutionReceiptByteCapacity(
        executionExact
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderExecutionReceiptByteCapacity({
        ...executionExact,
        payload: `${executionExact.payload}x`,
      })
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilityEffectProviderBusinessResultByteCapacity(
        businessExact
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderBusinessResultByteCapacity({
        ...businessExact,
        payload: `${businessExact.payload}x`,
      })
    ).toBe(false);
    expect(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_EXECUTION_COMPOSITION_BYTES
    ).toBe(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
    );
    expect(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_RESULT_COMPOSITION_BYTES
    ).toBe(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes
    );
  });

  it('polls a background job to terminal, consumes its vault state on every outcome, and blocks reissue', () => {
    const setup = createBackgroundSetup(true);
    expect(
      resolveAgentEvaluationCapabilityEffectPriorSourceDisposition(
        setup.registryReceipt,
        setup.sourceFact,
        null
      )
    ).toBe('active');

    const foreignRequest =
      createAgentNativeProviderCapabilityRuntimeRequestMaterial(setup.program, {
        operation: 'background-poll',
        protocolFamily: 'gemini-interactions',
        providerConfigurationId: setup.authority.providerConfigurationId,
        modelId: setup.authority.modelId,
        modelLineageDigest: setup.authority.modelLineageDigest,
        adapterDigest: setup.authority.adapterDigest,
        callbackLocalBaseRequestBody: null,
        callbackLocalProviderStateHandle: 'interaction_runtime_foreign',
        providerResourceAuthority: null,
        providerResourceReadRequest: null,
        providerResourceReadReceipt: null,
        cacheKeyDigest: null,
        observedAt: '2026-08-09T07:00:01.400Z',
      });
    expect(() =>
      createBackgroundExecution(setup, {
        pollSequence: 1,
        priorExecutionReceipt: null,
        providerStatus: 'queued',
        offsetMs: 0,
        requestMaterial: foreignRequest,
        providerResponseId: 'interaction_runtime_foreign',
      })
    ).toThrow(/execution transport binding drifted/u);
    expect(() =>
      createBackgroundExecution(setup, {
        pollSequence: 1,
        priorExecutionReceipt: null,
        providerStatus: 'queued',
        offsetMs: 122_600,
      })
    ).toThrow(/execution transport binding drifted/u);

    const first = createBackgroundExecution(setup, {
      pollSequence: 1,
      priorExecutionReceipt: null,
      providerStatus: 'queued',
      offsetMs: 0,
    });
    const second = createBackgroundExecution(setup, {
      pollSequence: 2,
      priorExecutionReceipt: first.execution,
      providerStatus: 'in_progress',
      offsetMs: 1_000,
    });
    const third = createBackgroundExecution(setup, {
      pollSequence: 3,
      priorExecutionReceipt: second.execution,
      providerStatus: 'in_progress',
      offsetMs: 2_000,
    });
    const terminal = createBackgroundExecution(setup, {
      pollSequence: 4,
      priorExecutionReceipt: third.execution,
      providerStatus: 'completed',
      offsetMs: 3_000,
    });
    expect(first.execution.executionStatus).toBe('in-progress');
    expect(second.execution.executionStatus).toBe('in-progress');
    expect(third.execution.executionStatus).toBe('in-progress');
    expect(terminal.execution.executionStatus).toBe('completed');
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderRuntimeResult(
        setup.program,
        setup.intent,
        setup.stage,
        first.execution,
        {
          response: first.response,
          priorExecutionReceipt: null,
          stateVaultRetireRequest: null,
          stateVaultRetirementReceipt: null,
          nextStateVaultSealRequest: null,
          nextStateVaultSealReceipt: null,
          sealedAt: '2026-08-09T07:00:02.500Z',
        }
      )
    ).toThrow(/result seal input is invalid/u);

    const retireRequest = createAgentNativeProviderStateVaultRetireRequest({
      sealRequest: setup.stateVaultSealRequest,
      sealReceipt: setup.stateVaultSealReceipt,
      resolveRequest: setup.stateVaultResolveRequest,
      resolveReceipt: setup.stateVaultResolveReceipt,
      disposition: 'consumed',
      requestedAt: '2026-08-09T07:00:05.500Z',
    });
    const retirementReceipt =
      createAgentNativeProviderStateVaultRetirementReceipt(
        retireRequest,
        setup.stateVaultSealRequest,
        setup.stateVaultSealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest: digest(
            'background-consumed-key-destroyed'
          ),
          opaqueRecordDeletionReceiptDigest: digest(
            'background-consumed-row-deleted'
          ),
          retiredAt: '2026-08-09T07:00:05.750Z',
        }
      );
    const result = createAgentEvaluationCapabilityEffectProviderRuntimeResult(
      setup.program,
      setup.intent,
      setup.stage,
      terminal.execution,
      {
        response: terminal.response,
        priorExecutionReceipt: third.execution,
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        sealedAt: '2026-08-09T07:00:06.000Z',
      }
    );
    expect(result).toMatchObject({
      businessResult: { status: 'completed' },
      fact: {
        factKind: 'provider-job-receipt',
        value: {
          phase: 'terminal',
          outcome: 'completed',
          callbackAuthority: 'revoked',
        },
      },
      resultSealReceipt: {
        resultStatus: 'produced',
        consumedInputSourceFactDigest: setup.sourceFact.factDigest,
      },
    });
    const backgroundExecutionInput = (
      providerStatus: 'completed' | 'in_progress' | 'queued',
      pollSequence: number,
      offsetMs: number
    ) => {
      const createdAt = new Date(
        Date.parse('2026-08-09T07:00:02.000Z') + offsetMs
      ).toISOString();
      return Object.freeze({
        requestMaterial: setup.request,
        cacheWarmAuthority: null,
        transportOutcome: 'received' as const,
        httpStatus: 200,
        sealedResponseJson: geminiBackgroundResponse(
          providerStatus,
          setup.callbackLocalProviderStateHandle
        ),
        pollSequence,
        createdAt,
        startedAt: new Date(Date.parse(createdAt) + 100).toISOString(),
        completedAt: new Date(Date.parse(createdAt) + 200).toISOString(),
        observedAt: new Date(Date.parse(createdAt) + 300).toISOString(),
        executedAt: new Date(Date.parse(createdAt) + 400).toISOString(),
      });
    };
    const sharedFixture =
      createAgentCapabilityEffectProviderRuntimeJournalFixture({
        program: setup.program,
        intent: setup.intent,
        readiness: {
          ownerInstanceId: maximumIdentity('owner'),
          transportOwnerInstanceId: maximumIdentity('transport-owner'),
          transportHealthDigest: digest('background-transport-health'),
          vaultOwnerInstanceId: maximumIdentity('vault-owner'),
          vaultHealthDigest: digest('background-vault-health'),
          status: 'healthy',
          unavailableReason: null,
          checkedAt: '2026-08-09T07:00:01.300Z',
          expiresAt: readinessExpiresAt,
        },
        stage: {
          nativeSourceReceipt: setup.nativeSourceReceipt,
          stateVaultResolveRequest: setup.stateVaultResolveRequest,
          stateVaultResolveReceipt: setup.stateVaultResolveReceipt,
          providerResourceSetCommitment: null,
          providerResourceAuthority: null,
          providerResourceReadRequest: null,
          providerResourceReadReceipt: null,
          stagedAt: '2026-08-09T07:00:01.500Z',
          expiresAt: readinessExpiresAt,
        },
        executions: Object.freeze([
          backgroundExecutionInput('queued', 1, 0),
          backgroundExecutionInput('in_progress', 2, 1_000),
          backgroundExecutionInput('in_progress', 3, 2_000),
          backgroundExecutionInput('completed', 4, 3_000),
        ]),
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        sealedAt: '2026-08-09T07:00:06.000Z',
      });
    expect(sharedFixture.executionRecords).toHaveLength(4);
    expect(sharedFixture.runtimeResult.fact).toMatchObject({
      factKind: 'provider-job-receipt',
      value: { callbackAuthority: 'revoked' },
    });
    expect(
      doesAgentEvaluationCapabilityEffectProviderResultConsumeInputSource(
        result.resultSealReceipt,
        setup.registryReceipt
      )
    ).toBe(true);
    const stageRecord =
      createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
        setup.intent,
        setup.stage
      );
    const firstRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: first.execution,
        priorExecutionRecord: null,
        spoolAad: first.aad,
        spoolEnvelopeAuthority: first.envelopeAuthority,
      });
    const secondRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: second.execution,
        priorExecutionRecord: firstRecord,
        spoolAad: second.aad,
        spoolEnvelopeAuthority: second.envelopeAuthority,
      });
    const thirdRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: third.execution,
        priorExecutionRecord: secondRecord,
        spoolAad: third.aad,
        spoolEnvelopeAuthority: third.envelopeAuthority,
      });
    const terminalRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt: terminal.execution,
        priorExecutionRecord: thirdRecord,
        spoolAad: terminal.aad,
        spoolEnvelopeAuthority: terminal.envelopeAuthority,
      });
    const executionRecords = Object.freeze([
      firstRecord,
      secondRecord,
      thirdRecord,
      terminalRecord,
    ]);
    const dispositions = Object.freeze(
      [first, second, third, terminal].map((value) => {
        if (value.spoolReceipt === null) {
          throw new TypeError(
            'Background maximum-shape fixture omitted its received spool.'
          );
        }
        return createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt(
          {
            spoolRef: value.spoolReceipt.spoolRef,
            spoolReceiptDigest: value.spoolReceipt.receiptDigest,
            planDigest: setup.intent.planDigest,
            repositoryCommit: setup.intent.repositoryCommit,
            attemptId: setup.intent.attemptId,
            descriptorDigest: setup.intent.descriptorDigest,
            turnIndex: setup.intent.turnIndex,
            invocationId: setup.intent.invocationId,
            ownerRequestDigest: setup.intent.ownerRequestDigest,
            stageDigest: setup.stage.stageDigest,
            executionSequence: value.execution.pollSequence,
            disposition: 'consumed-and-destroyed',
            resultSealReceiptDigest: result.resultSealReceipt.receiptDigest,
            abandonmentReason: null,
            retentionPolicyDigest: value.spoolReceipt.retentionPolicyDigest,
            disposedAt: result.resultSealReceipt.sealedAt,
          }
        );
      })
    );
    const resultRecord =
      createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
        stageRecord,
        executionRecords,
        businessResult: result.businessResult,
        effectSourceFact: result.fact,
        stateVaultRetireRequest: retireRequest,
        stateVaultRetirementReceipt: retirementReceipt,
        nextStateVaultSealRequest: null,
        nextStateVaultSealReceipt: null,
        resultSealReceipt: result.resultSealReceipt,
        spoolDispositionReceipts: dispositions,
      });
    const archiveRecord =
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord,
        executionRecords,
        resultRecord,
        effectSourceReceiptDigest: digest('background-effect-source-receipt'),
      });
    const canonicalBytes = (candidate: unknown): number =>
      new TextEncoder().encode(canonicalJsonText(candidate)).byteLength;
    const executionEnvelopeBytes = executionRecords.map((record) => {
      const { executionReceipt: _executionReceipt, ...envelope } = record;
      return canonicalBytes(envelope);
    });
    const maximumBackgroundShapeBytes = Object.freeze({
      stageRecord: canonicalBytes(stageRecord),
      executionReceipts: executionRecords.map(({ executionReceipt }) =>
        canonicalBytes(executionReceipt)
      ),
      executionEnvelopes: executionEnvelopeBytes,
      executionRecords: executionRecords.map(canonicalBytes),
      resultRecord: canonicalBytes(resultRecord),
      archiveRecord: canonicalBytes(archiveRecord),
    });
    expect(maximumBackgroundShapeBytes).toEqual({
      stageRecord: 30_281,
      executionReceipts: [12_746, 12_820, 12_820, 12_892],
      executionEnvelopes: [4_561, 4_630, 4_630, 4_630],
      executionRecords: [17_327, 17_470, 17_470, 17_542],
      resultRecord: 14_933,
      archiveRecord: 115_848,
    });
    expect(
      maximumBackgroundShapeBytes.executionReceipts.every(
        (bytes) =>
          bytes <=
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_EXECUTION_RECEIPT_MAXIMUM_BYTES
      )
    ).toBe(true);
    expect(
      executionEnvelopeBytes.every(
        (bytes) =>
          bytes <=
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordEnvelopeBytes
      )
    ).toBe(true);
    expect(
      maximumBackgroundShapeBytes.executionRecords.every(
        (bytes) =>
          bytes <=
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes
      )
    ).toBe(true);
    expect(canonicalBytes(archiveRecord)).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
    );
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
        stageRecord,
        executionRecords: Object.freeze([...executionRecords, terminalRecord]),
        resultRecord,
        effectSourceReceiptDigest: digest('background-effect-source-receipt'),
      })
    ).toThrow(/archive input is invalid|drifted or is unbounded/u);
    const { receiptDigest: _receiptDigest, ...unretiredResultSealBase } =
      result.resultSealReceipt;
    const unretiredResultSeal = Object.freeze({
      ...unretiredResultSealBase,
      stateVaultRetireRequestDigest: null,
      stateVaultRetirementReceiptDigest: null,
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderResultSealReceipt(
        Object.freeze({
          ...unretiredResultSeal,
          receiptDigest: digestAgentCanonicalValue(unretiredResultSeal),
        }),
        setup.stage,
        terminal.execution,
        result.fact
      )
    ).toBe(false);
    expect(
      resolveAgentEvaluationCapabilityEffectPriorSourceDisposition(
        setup.registryReceipt,
        setup.sourceFact,
        result.resultSealReceipt
      )
    ).toBe('consumed');
    expect(() =>
      assertAgentEvaluationCapabilityEffectInputSourceAvailable(
        setup.registryReceipt,
        result.resultSealReceipt
      )
    ).toThrow(/already consumed/u);

    const thirdQueued = createBackgroundExecution(setup, {
      pollSequence: 3,
      priorExecutionReceipt: second.execution,
      providerStatus: 'queued',
      offsetMs: 2_100,
    });
    const exhausted = createBackgroundExecution(setup, {
      pollSequence: 4,
      priorExecutionReceipt: thirdQueued.execution,
      providerStatus: 'queued',
      offsetMs: 3_100,
    });
    expect(thirdQueued.execution.executionStatus).toBe('in-progress');
    expect(exhausted.execution.executionStatus).toBe('failed');
    const exhaustedRetireRequest =
      createAgentNativeProviderStateVaultRetireRequest({
        sealRequest: setup.stateVaultSealRequest,
        sealReceipt: setup.stateVaultSealReceipt,
        resolveRequest: setup.stateVaultResolveRequest,
        resolveReceipt: setup.stateVaultResolveReceipt,
        disposition: 'consumed',
        requestedAt: '2026-08-09T07:00:05.600Z',
      });
    const exhaustedRetirementReceipt =
      createAgentNativeProviderStateVaultRetirementReceipt(
        exhaustedRetireRequest,
        setup.stateVaultSealRequest,
        setup.stateVaultSealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest: digest(
            'background-exhausted-key-destroyed'
          ),
          opaqueRecordDeletionReceiptDigest: digest(
            'background-exhausted-row-deleted'
          ),
          retiredAt: '2026-08-09T07:00:05.850Z',
        }
      );
    expect(
      createAgentEvaluationCapabilityEffectProviderRuntimeResult(
        setup.program,
        setup.intent,
        setup.stage,
        exhausted.execution,
        {
          response: exhausted.response,
          priorExecutionReceipt: thirdQueued.execution,
          stateVaultRetireRequest: exhaustedRetireRequest,
          stateVaultRetirementReceipt: exhaustedRetirementReceipt,
          nextStateVaultSealRequest: null,
          nextStateVaultSealReceipt: null,
          sealedAt: '2026-08-09T07:00:06.000Z',
        }
      )
    ).toMatchObject({
      businessResult: { status: 'failed' },
      fact: null,
      resultSealReceipt: {
        resultStatus: 'failed',
        consumedInputSourceFactDigest: setup.sourceFact.factDigest,
      },
    });
  });

  it.each([
    Object.freeze({
      failureMode: 'provider-denied' as const,
      expectedStatus: 'unavailable' as const,
      offsetMs: 0,
      requestedAt: '2026-08-09T07:00:02.500Z',
      retiredAt: '2026-08-09T07:00:02.750Z',
      sealedAt: '2026-08-09T07:00:03.000Z',
    }),
    Object.freeze({
      failureMode: 'timed-out' as const,
      expectedStatus: 'failed' as const,
      offsetMs: 1_000,
      requestedAt: '2026-08-09T07:00:03.500Z',
      retiredAt: '2026-08-09T07:00:03.750Z',
      sealedAt: '2026-08-09T07:00:04.000Z',
    }),
  ])(
    'retires a resolved Provider handle as consumed after $failureMode',
    ({
      failureMode,
      expectedStatus,
      offsetMs,
      requestedAt,
      retiredAt,
      sealedAt,
    }) => {
      const setup = createBackgroundSetup();
      const failedExecution = createBackgroundExecution(setup, {
        pollSequence: 1,
        priorExecutionReceipt: null,
        providerStatus: 'queued',
        failureMode,
        offsetMs,
      });
      expect(failedExecution.execution.executionStatus).toBe(expectedStatus);
      const retireRequest = createAgentNativeProviderStateVaultRetireRequest({
        sealRequest: setup.stateVaultSealRequest,
        sealReceipt: setup.stateVaultSealReceipt,
        resolveRequest: setup.stateVaultResolveRequest,
        resolveReceipt: setup.stateVaultResolveReceipt,
        disposition: 'consumed',
        requestedAt,
      });
      const retirementReceipt =
        createAgentNativeProviderStateVaultRetirementReceipt(
          retireRequest,
          setup.stateVaultSealRequest,
          setup.stateVaultSealReceipt,
          {
            status: 'retired',
            stateKeyDestructionReceiptDigest: digest(
              `${failureMode}.key-destroyed`
            ),
            opaqueRecordDeletionReceiptDigest: digest(
              `${failureMode}.row-deleted`
            ),
            retiredAt,
          }
        );
      expect(
        createAgentEvaluationCapabilityEffectProviderRuntimeResult(
          setup.program,
          setup.intent,
          setup.stage,
          failedExecution.execution,
          {
            response: failedExecution.response,
            priorExecutionReceipt: null,
            stateVaultRetireRequest: retireRequest,
            stateVaultRetirementReceipt: retirementReceipt,
            nextStateVaultSealRequest: null,
            nextStateVaultSealReceipt: null,
            sealedAt,
          }
        )
      ).toMatchObject({
        businessResult: { status: expectedStatus },
        fact: null,
        resultSealReceipt: {
          resultStatus: expectedStatus,
          consumedInputSourceFactDigest: setup.sourceFact.factDigest,
        },
      });
    }
  );
});
