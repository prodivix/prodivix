import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentRetrievalQueryReceipt } from '../hosted/agentRetrieval';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
} from '../providers/agentCapabilityProbeProgram';
import { createAgentNativeProviderCapabilityRuntimeRequestMaterial } from '../providers/agentNativeProviderCapabilityRuntime';
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
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES,
  createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial,
  createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  digestAgentEvaluationCapabilityEffectToolArguments,
  isAgentEvaluationCapabilityEffectSourceReceipt,
  isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
  isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority,
  isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  matchAgentEvaluationCapabilityEffectSourceReceipt,
  reconcileAgentEvaluationCapabilityEffectSourceReceipt,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt,
  matchAgentEvaluationProviderCapabilityRuntimeFactEnvelopeSourceAuthority,
  selectAgentEvaluationProviderCapabilityObservationFacts,
} from './agentEvaluationProviderCapabilityObservation';

const digest = (label: string) => digestAgentCanonicalValue({ label });

const backgroundProgram = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-background-job',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  ),
});

const backgroundBootstrapRequestProjection = () =>
  createAgentNativeProviderCapabilityRuntimeRequestMaterial(backgroundProgram, {
    operation: 'background-submit',
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.release.openai-responses',
    modelId: 'model.release.openai-responses',
    modelLineageDigest: digest('model-lineage'),
    adapterDigest: digest('adapter'),
    callbackLocalBaseRequestBody: Object.freeze({
      model: 'model.release.openai-responses',
      input: 'Create one bounded background result.',
    }),
    callbackLocalProviderStateHandle: null,
    providerResourceAuthority: null,
    providerResourceReadRequest: null,
    providerResourceReadReceipt: null,
    cacheKeyDigest: null,
    observedAt: '2026-08-09T03:00:00.000Z',
  }).projection;

const runtimeFactSourceAuthority =
  createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-hosted-owner-result',
    sourceAuthorityId: 'runtime-source.release.retrieval-core',
    sourceAuthorityImplementationDigest: digest('source-implementation'),
    routeBinding: 'runtime-fact-source.retrieval-core',
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: digest('profile'),
    capabilityId: 'provider.hosted-retrieval',
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.release.openai-responses',
    modelId: 'model.release.openai-responses',
    modelLineageDigest: digest('model-lineage'),
    adapterDigest: digest('adapter'),
    registrationAuthorityIssuerId: 'authority.release.runtime-registration',
    registrationReceiptDigest: digest('registration'),
    hostedRetrievalRuntimeResourceRegistrationIntentDigest: digest(
      'runtime-resource-registration-intent'
    ),
  });

const sourceHandleDigest = digest('retrieval-source-handle');
const targetRef = 'target.release.retrieval';
const requestRefAuthority =
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
    namespaceId: 'namespace.release',
    planDigest: digest('plan'),
    repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
    attemptId: 'attempt.release.1',
    descriptorDigest: digest('descriptor'),
    turnIndex: 2,
    invocationId: 'invocation.release.3',
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    toolId: 'provider.retrieval.search',
    targetRef,
    protocolFamily: 'openai-responses',
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
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
const inputAuthorityRegistryReceipt =
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
    sourceDispatchIntentDigest: digest('source-dispatch-intent'),
    sourceTransportReceiptDigest: digest('source-transport'),
    sourceResultSpoolReceiptDigest: digest('source-result-spool'),
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
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
  });
const inputAuthorityBinding =
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
    inputAuthorityRegistryReceipt
  );

const intentBinding = Object.freeze({
  namespaceId: 'namespace.release',
  planDigest: digest('plan'),
  repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
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
const ownerRequestIdentity =
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentBinding);
const intent = createAgentEvaluationCapabilityPreEffectIntent({
  ...intentBinding,
  ...ownerRequestIdentity,
});

const receiptFor = (
  businessResultDigest = digest('business-result'),
  effectStatus: 'produced' | 'unavailable' = 'produced',
  sourceFactDigest = digest('source-fact')
) =>
  createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
    intentDigest: intent.intentDigest,
    ownerRequestId: intent.ownerRequestId,
    ownerRequestDigest: intent.ownerRequestDigest,
    runtimeFactSourceAuthority,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
    effectStatus,
    businessResultDigest,
    providerRuntimeJournalResultRecordDigest: digest(
      'provider-runtime-result-record'
    ),
    providerRuntimeResultSealReceiptDigest: digest(
      'provider-runtime-result-seal'
    ),
    sourceFactKind:
      effectStatus === 'produced' ? 'retrieval-query-receipt' : null,
    sourceFactDigest: effectStatus === 'produced' ? sourceFactDigest : null,
    stageDigest: digest('stage'),
    dispatchAckDigest: digest('dispatch-ack'),
    transportReceiptDigest: digest('transport'),
    resultSpoolReceiptDigest: digest('spool'),
    normalizedEventSetDigest: digest('normalized-events'),
    stateVaultResolveRequest: null,
    stateVaultResolveReceipt: null,
    stateVaultRetireRequest: null,
    stateVaultRetirementReceipt: null,
    specificReceiptDigests: Object.freeze([]),
    sealedAt: '2026-08-09T03:00:00.000Z',
  });

describe('capability effect two-phase authority', () => {
  it('resolves a prior sealed Provider state only for the effect callback and retires its per-state key', () => {
    const jobRuntimeAuthority = createAgentEvaluationRuntimeFactSourceAuthority(
      {
        kind: 'shared-durable-capability',
        sourceKind: 'sealed-provider-response-metadata',
        sourceAuthorityId: 'runtime-source.release.background-job',
        sourceAuthorityImplementationDigest: digest(
          'background-source-implementation'
        ),
        routeBinding: 'runtime-fact-source.background-job',
        capabilityProfileId: 'g4-provider-background-job',
        capabilityProfileDigest: digest('background-profile'),
        capabilityId: 'provider.background-job',
        protocolFamily: 'openai-responses',
        providerConfigurationId: 'provider.release.openai-responses',
        modelId: 'model.release.openai-responses',
        modelLineageDigest: digest('background-model-lineage'),
        adapterDigest: digest('background-adapter'),
        registrationAuthorityIssuerId: 'authority.release.runtime-registration',
        registrationReceiptDigest: digest('background-registration'),
      }
    );
    const stateVaultAuthority = createAgentNativeProviderStateVaultAuthority({
      authorityId: 'provider-state-vault.release.1',
      authorityImplementationDigest: digest('vault-implementation'),
      algorithm: 'aes-256-gcm',
      keyReferenceDigest: digest('vault-wrapping-key'),
      keyVersion: 1,
      encryptionProfileDigest: digest('vault-encryption-profile'),
      retentionPolicyDigest: digest('vault-retention-policy'),
      deletionReceiptPolicyDigest: digest('vault-deletion-policy'),
    });
    const callbackHandle = 'resp.background-state.1';
    const stateVaultSealRequest =
      createAgentNativeProviderStateVaultSealRequest({
        authorityDigest: stateVaultAuthority.authorityDigest,
        purpose: 'background-job-state',
        attemptId: 'attempt.release.job.1',
        protocolFamily: 'openai-responses',
        providerStateReferenceKind: 'response-id',
        providerStateReferenceDigest: digestAgentNativeProviderStateReference(
          'response-id',
          callbackHandle
        ),
        probeProgramDigest: digest('background-probe-program'),
        capabilityProfileDigest: jobRuntimeAuthority.capabilityProfileDigest,
        invocationId: 'invocation.release.job.source.1',
        requestDigest: digest('background-source-request'),
        responseDigest: digest('background-source-response'),
        responseBodyDigest: digest('background-source-response-body'),
        sealedResponseJsonDigest: digest('background-source-json'),
        providerConfigurationId: jobRuntimeAuthority.providerConfigurationId,
        modelLineageDigest: jobRuntimeAuthority.modelLineageDigest,
        adapterDigest: jobRuntimeAuthority.adapterDigest,
        taskId: 'task.release.job.1',
        runId: 'run.release.job.1',
        generation: 1,
        observedAt: '2026-08-09T03:00:00.000Z',
        expiresAt: '2026-08-09T03:02:05.000Z',
      });
    const stateKeyCreationReceiptDigest = digest(
      'background-state-key-created'
    );
    const stateVaultSealReceipt =
      createAgentNativeProviderStateVaultSealReceipt(stateVaultSealRequest, {
        status: 'sealed',
        opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
          authorityDigest: stateVaultAuthority.authorityDigest,
          sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
          stateKeyCreationReceiptDigest,
        }),
        stateKeyCreationReceiptDigest,
        sealedAt: '2026-08-09T03:00:00.250Z',
      });
    const jobRequestRefAuthority =
      createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
        namespaceId: 'namespace.release',
        planDigest: digest('job-plan'),
        repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
        attemptId: 'attempt.release.job.1',
        descriptorDigest: digest('job-descriptor'),
        turnIndex: 1,
        invocationId: 'invocation.release.job.consumer.1',
        bindingKind: 'provider-job',
        capabilityId: 'provider.background-job',
        toolId: 'provider.background-job.poll',
        targetRef: 'target.release.job',
        protocolFamily: 'openai-responses',
        providerConfigurationId: jobRuntimeAuthority.providerConfigurationId,
        modelLineageDigest: jobRuntimeAuthority.modelLineageDigest,
        adapterDigest: jobRuntimeAuthority.adapterDigest,
        runtimeFactSourceAuthorityDigest: jobRuntimeAuthority.authorityDigest,
        registrationReceiptDigest:
          jobRuntimeAuthority.registrationReceiptDigest,
        issuedAt: '2026-08-09T03:00:00.500Z',
        expiresAt: '2026-08-09T03:02:05.000Z',
      });
    const jobBinding =
      createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
        createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
          bindingKind: 'provider-job',
          capabilityId: 'provider.background-job',
          requestRef: jobRequestRefAuthority.requestRef,
          targetRef: jobRequestRefAuthority.targetRef,
          requestRefAuthority: jobRequestRefAuthority,
          requestRefAuthorityReceiptDigest:
            jobRequestRefAuthority.receiptDigest,
          sourceAttemptId: 'attempt.release.job.1',
          sourceTurnIndex: 0,
          sourceInvocationId: 'invocation.release.job.source.1',
          sourceProviderRequestDigest: stateVaultSealRequest.requestDigest,
          sourceResponseDigest: stateVaultSealRequest.responseDigest,
          sourceDispatchIntentDigest: digest('background-dispatch'),
          sourceTransportReceiptDigest: digest('background-transport'),
          sourceResultSpoolReceiptDigest: digest('background-spool'),
          sourceNormalizedEventSetDigest: digest('background-events'),
          sourceObservationReceiptDigest: digest('background-observation'),
          sourceFactKind: 'provider-job-receipt',
          sourceProviderEventType: null,
          sourceProviderToolCallId: null,
          sourceToolId: null,
          sourceArgumentsDigest: null,
          sourceHandleDigest:
            stateVaultSealRequest.providerStateReferenceDigest,
          stateVaultSealRequest,
          stateVaultSealReceipt,
          protocolFamily: 'openai-responses',
          providerConfigurationId: jobRuntimeAuthority.providerConfigurationId,
          modelLineageDigest: jobRuntimeAuthority.modelLineageDigest,
          adapterDigest: jobRuntimeAuthority.adapterDigest,
        })
      );
    const jobArgumentsDigest =
      digestAgentEvaluationCapabilityEffectToolArguments({
        requestRef: jobBinding.requestRef,
        targetRef: jobBinding.targetRef,
      });
    const jobIntentInput = Object.freeze({
      namespaceId: 'namespace.release',
      planDigest: digest('job-plan'),
      repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
      attemptId: 'attempt.release.job.1',
      descriptorDigest: digest('job-descriptor'),
      caseId: 'case.release.job',
      materialDigest: digest('job-material'),
      turnIndex: 1,
      invocationId: 'invocation.release.job.consumer.1',
      toolId: 'provider.background-job.poll',
      toolCallId: 'tool-call.release.job.1',
      providerToolCallId: 'provider-tool-call.release.job.1',
      providerRequestDigest: digest('background-consumer-request'),
      argumentsDigest: jobArgumentsDigest,
      requestedAt: '2026-08-09T03:00:01.000Z',
      inputAuthorityBinding: jobBinding,
      runtimeFactSourceAuthority: jobRuntimeAuthority,
      registrationReceiptDigest: jobRuntimeAuthority.registrationReceiptDigest,
    });
    const jobIntent = createAgentEvaluationCapabilityPreEffectIntent({
      ...jobIntentInput,
      ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(
        jobIntentInput
      ),
    });
    const stateVaultResolveRequest =
      createAgentNativeProviderStateVaultResolveRequest({
        sealRequest: stateVaultSealRequest,
        sealReceipt: stateVaultSealReceipt,
        consumerAttemptId: jobIntent.attemptId,
        consumerInvocationId: jobIntent.invocationId,
        consumerGeneration: 1,
        requestedAt: '2026-08-09T03:00:01.250Z',
      });
    const stateVaultResolveReceipt =
      createAgentNativeProviderStateVaultResolveReceipt(
        stateVaultResolveRequest,
        {
          status: 'resolved',
          callbackLocalProviderStateHandle: callbackHandle,
          resolvedAt: '2026-08-09T03:00:01.500Z',
        }
      );
    const stateVaultRetireRequest =
      createAgentNativeProviderStateVaultRetireRequest({
        sealRequest: stateVaultSealRequest,
        sealReceipt: stateVaultSealReceipt,
        resolveRequest: stateVaultResolveRequest,
        resolveReceipt: stateVaultResolveReceipt,
        disposition: 'consumed',
        requestedAt: '2026-08-09T03:00:02.000Z',
      });
    const stateVaultRetirementReceipt =
      createAgentNativeProviderStateVaultRetirementReceipt(
        stateVaultRetireRequest,
        stateVaultSealRequest,
        stateVaultSealReceipt,
        {
          status: 'retired',
          stateKeyDestructionReceiptDigest: digest(
            'background-state-key-destroyed'
          ),
          opaqueRecordDeletionReceiptDigest: digest(
            'background-state-record-deleted'
          ),
          retiredAt: '2026-08-09T03:00:02.250Z',
        }
      );
    const providerJobBase = Object.freeze({
      providerJobId: 'job.release.background.1',
      taskId: 'task.release.job.1',
      runId: 'run.release.job.1',
      generation: 1,
      invocationId: jobBinding.sourceInvocationId,
      phase: 'terminal' as const,
      outcome: 'completed' as const,
      callbackAuthority: 'revoked' as const,
    });
    const providerJob = Object.freeze({
      ...providerJobBase,
      receiptDigest: digestAgentCanonicalValue(providerJobBase),
    });
    const providerJobFact = Object.freeze({
      factKind: 'provider-job-receipt' as const,
      factDigest: providerJob.receiptDigest,
      value: providerJob,
    });
    const effectReceipt = createAgentEvaluationCapabilityEffectSourceReceipt(
      jobIntent,
      {
        intentDigest: jobIntent.intentDigest,
        ownerRequestId: jobIntent.ownerRequestId,
        ownerRequestDigest: jobIntent.ownerRequestDigest,
        runtimeFactSourceAuthority: jobRuntimeAuthority,
        registrationReceiptDigest:
          jobRuntimeAuthority.registrationReceiptDigest,
        effectStatus: 'produced',
        businessResultDigest: digest('background-business-result'),
        providerRuntimeJournalResultRecordDigest: digest(
          'background-provider-runtime-result-record'
        ),
        providerRuntimeResultSealReceiptDigest: digest(
          'background-provider-runtime-result-seal'
        ),
        sourceFactKind: 'provider-job-receipt',
        sourceFactDigest: providerJob.receiptDigest,
        stageDigest: digest('background-effect-stage'),
        dispatchAckDigest: digest('background-effect-ack'),
        transportReceiptDigest: digest('background-effect-transport'),
        resultSpoolReceiptDigest: digest('background-effect-spool'),
        normalizedEventSetDigest: digest('background-effect-events'),
        stateVaultResolveRequest,
        stateVaultResolveReceipt,
        stateVaultRetireRequest,
        stateVaultRetirementReceipt,
        specificReceiptDigests: Object.freeze([]),
        sealedAt: '2026-08-09T03:00:02.500Z',
      }
    );
    expect(
      isAgentEvaluationCapabilityEffectSourceReceipt(effectReceipt, jobIntent)
    ).toBe(true);
    expect(JSON.stringify(effectReceipt)).not.toContain(callbackHandle);
    const runtimeEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        jobIntent,
        effectReceipt,
        {
          planDigest: jobIntent.planDigest,
          repositoryCommit: jobIntent.repositoryCommit,
          attemptId: jobIntent.attemptId,
          descriptorDigest: jobIntent.descriptorDigest,
          turnIndex: jobIntent.turnIndex,
          invocationId: jobIntent.invocationId,
          requestDigest: jobIntent.providerRequestDigest,
          responseDigest: digest('background-consumer-response'),
          protocolFamily: 'openai-responses',
          providerConfigurationId: jobRuntimeAuthority.providerConfigurationId,
          modelLineageDigest: jobRuntimeAuthority.modelLineageDigest,
          adapterDigest: jobRuntimeAuthority.adapterDigest,
          dispatchIntentDigest: digest('background-consumer-dispatch'),
          observedAt: '2026-08-09T03:00:03.000Z',
          fact: providerJobFact,
        }
      );
    expect(runtimeEnvelope).toMatchObject({
      invocationId: jobIntent.invocationId,
      fact: {
        value: { invocationId: jobBinding.sourceInvocationId },
      },
    });
    const factAuthority =
      createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        runtimeEnvelope!
      );
    expect(
      createAgentEvaluationProviderCapabilityObservationReceipt(
        {
          observationReceiptId: 'observation.release.background.consumer.1',
          planDigest: runtimeEnvelope!.planDigest,
          repositoryCommit: runtimeEnvelope!.repositoryCommit,
          attemptId: runtimeEnvelope!.attemptId,
          descriptorDigest: runtimeEnvelope!.descriptorDigest,
          turnIndex: runtimeEnvelope!.turnIndex,
          invocationId: runtimeEnvelope!.invocationId,
          requestDigest: runtimeEnvelope!.requestDigest,
          responseDigest: runtimeEnvelope!.responseDigest,
          protocolFamily: runtimeEnvelope!.protocolFamily,
          providerConfigurationId: runtimeEnvelope!.providerConfigurationId,
          modelLineageDigest: runtimeEnvelope!.modelLineageDigest,
          adapterDigest: runtimeEnvelope!.adapterDigest,
          dispatchIntentDigest: runtimeEnvelope!.dispatchIntentDigest,
          transportReceiptDigest: runtimeEnvelope!.transportReceiptDigest,
          resultSpoolReceiptDigest: runtimeEnvelope!.resultSpoolReceiptDigest,
          normalizedEventSetDigest: runtimeEnvelope!.normalizedEventSetDigest,
          facts: Object.freeze([providerJobFact]),
          factAuthorities: Object.freeze([factAuthority]),
          observedAt: runtimeEnvelope!.observedAt,
        },
        {
          protectedMaterialCanaries: Object.freeze([
            'PROTECTED-BACKGROUND-CANARY-0001',
          ]),
          secretCanaries: Object.freeze(['SECRET-BACKGROUND-CANARY-0001']),
        }
      ).facts
    ).toEqual([providerJobFact]);
    const {
      format: _effectFormat,
      version: _effectVersion,
      receiptDigest: _effectReceiptDigest,
      ...effectReceiptInput
    } = effectReceipt;
    const foreignProviderJobBase = Object.freeze({
      ...providerJobBase,
      invocationId: 'invocation.release.job.foreign.1',
    });
    const foreignProviderJob = Object.freeze({
      ...foreignProviderJobBase,
      receiptDigest: digestAgentCanonicalValue(foreignProviderJobBase),
    });
    const foreignEffectReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(jobIntent, {
        ...effectReceiptInput,
        sourceFactDigest: foreignProviderJob.receiptDigest,
      });
    expect(() =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        jobIntent,
        foreignEffectReceipt,
        {
          ...runtimeEnvelope!,
          fact: Object.freeze({
            factKind: 'provider-job-receipt' as const,
            factDigest: foreignProviderJob.receiptDigest,
            value: foreignProviderJob,
          }),
        }
      )
    ).toThrow(/runtime fact drifted/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectSourceReceipt(jobIntent, {
        ...effectReceiptInput,
        stateVaultRetirementReceipt: Object.freeze({
          ...stateVaultRetirementReceipt,
          opaqueRecordDeletionReceiptDigest: digest('swapped-deletion'),
        }),
      })
    ).toThrow(/invalid|drift/u);
  });

  it('bootstraps prior-source effects and exposes retrieval refs on the current closed turn', () => {
    const retrieval =
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'hosted-retrieval-query',
        turnIndex: 0,
        priorSourceTurnIndex: null,
        priorSourceObservationReceiptDigest: null,
        priorSourceDisposition: null,
        priorEffectResultSealReceiptDigest: null,
      });
    expect(retrieval).toMatchObject({
      sourceLifecycle: 'current-closed-provider-transport',
      disposition: 'issue-request-ref',
      zeroToolCallDisposition: 'schema-failed',
    });
    expect(
      isAgentEvaluationCapabilityEffectRequestRefIssuanceDecision(retrieval)
    ).toBe(true);

    const bootstrap =
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-job',
        turnIndex: 0,
        priorSourceTurnIndex: null,
        priorSourceObservationReceiptDigest: null,
        priorSourceDisposition: null,
        priorEffectResultSealReceiptDigest: null,
      });
    expect(bootstrap).toMatchObject({
      sourceLifecycle: 'prior-sealed-provider-observation',
      disposition: 'bootstrap-provider-source',
      zeroToolCallDisposition: 'seal-observation-and-continue',
    });
    const issued =
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-job',
        turnIndex: 1,
        priorSourceTurnIndex: 0,
        priorSourceObservationReceiptDigest: digest('prior-source-observation'),
        priorSourceDisposition: 'active',
        priorEffectResultSealReceiptDigest: null,
      });
    expect(issued.disposition).toBe('issue-request-ref');
    const consumed =
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-job',
        turnIndex: 2,
        priorSourceTurnIndex: 0,
        priorSourceObservationReceiptDigest: digest(
          'consumed-source-observation'
        ),
        priorSourceDisposition: 'consumed',
        priorEffectResultSealReceiptDigest: digest(
          'consumed-effect-result-seal'
        ),
      });
    expect(consumed).toMatchObject({
      disposition: 'continue-after-consumed-effect',
      zeroToolCallDisposition: 'continue-without-shared-tool',
    });
    expect(
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-job',
        turnIndex: 2,
        priorSourceTurnIndex: 0,
        priorSourceObservationReceiptDigest: digest(
          'terminal-source-observation'
        ),
        priorSourceDisposition: 'unavailable-or-terminal',
        priorEffectResultSealReceiptDigest: null,
      })
    ).toMatchObject({
      disposition: 'source-unavailable',
      zeroToolCallDisposition: 'grade-unavailable',
    });
    expect(() =>
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'opaque-continuation',
        turnIndex: 2,
        priorSourceTurnIndex: 0,
        priorSourceObservationReceiptDigest: digest(
          'consumed-without-result-observation'
        ),
        priorSourceDisposition: 'consumed',
        priorEffectResultSealReceiptDigest: null,
      })
    ).toThrow(/issuance input is invalid/u);
    expect(
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-cache',
        turnIndex: 1,
        priorSourceTurnIndex: null,
        priorSourceObservationReceiptDigest: null,
        priorSourceDisposition: null,
        priorEffectResultSealReceiptDigest: null,
      })
    ).toMatchObject({
      disposition: 'source-unavailable',
      zeroToolCallDisposition: 'grade-unavailable',
    });
    expect(() =>
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'opaque-continuation',
        turnIndex: 1,
        priorSourceTurnIndex: 1,
        priorSourceObservationReceiptDigest: digest(
          'current-turn-source-observation'
        ),
        priorSourceDisposition: 'active',
        priorEffectResultSealReceiptDigest: null,
      })
    ).toThrow(/issuance input is invalid/u);
    expect(() =>
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'hosted-retrieval-query',
        turnIndex: 1,
        priorSourceTurnIndex: 0,
        priorSourceObservationReceiptDigest: digest(
          'forbidden-prior-retrieval-source'
        ),
        priorSourceDisposition: 'active',
        priorEffectResultSealReceiptDigest: null,
      })
    ).toThrow(/issuance input is invalid/u);
  });

  it('specializes turn-zero bootstrap material to a real zero-tool Provider request', () => {
    const decision =
      createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
        bindingKind: 'provider-job',
        turnIndex: 0,
        priorSourceTurnIndex: null,
        priorSourceObservationReceiptDigest: null,
        priorSourceDisposition: null,
        priorEffectResultSealReceiptDigest: null,
      });
    const invocation = Object.freeze({
      blocks: Object.freeze([
        Object.freeze({
          kind: 'text' as const,
          blockId: 'block.bootstrap.1',
          role: 'user' as const,
          authority: 'user-provided' as const,
          instructionBoundary: 'data-only' as const,
          text: 'Prepare the provider background source.',
        }),
      ]),
      contextItems: Object.freeze([
        Object.freeze({
          contextItemId: 'context.bootstrap.1',
          sourceRef: 'context://bootstrap',
          authority: 'canonical-workspace' as const,
          instructionBoundary: 'data-only' as const,
          content: 'Public bootstrap context.',
          contentDigest: digest('bootstrap-context'),
        }),
      ]),
      tools: Object.freeze([
        Object.freeze({
          toolId: 'provider.background-job.poll',
          description: 'Poll one sealed provider background job.',
          effect: 'read-only' as const,
          inputSchema: Object.freeze({
            type: 'object',
            additionalProperties: false,
          }),
          definitionDigest: digest('background-job-poll-tool'),
        }),
        Object.freeze({
          toolId: 'verification.plan.request',
          description: 'Verify a completed result.',
          effect: 'verification-only' as const,
          inputSchema: Object.freeze({
            type: 'object',
            additionalProperties: false,
          }),
          definitionDigest: digest('verification-plan-tool'),
        }),
      ]),
    });
    const specialized =
      createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial({
        invocation,
        decision,
      });
    expect(specialized.invocation.tools).toEqual([]);
    expect(specialized.authority).toMatchObject({
      omittedToolIds: [
        'provider.background-job.poll',
        'verification.plan.request',
      ],
      remainingToolIds: [],
      providerToolEncoding: 'omit-tools-and-tool-choice',
      decisionDigest: decision.decisionDigest,
    });
    expect(
      isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority(
        specialized.authority
      )
    ).toBe(true);

    const requestAuthority =
      createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority(
        backgroundProgram,
        {
          invocationAuthority: specialized.authority,
          providerRequestProjection: backgroundBootstrapRequestProjection(),
          cacheWarmAuthority: null,
        }
      );
    expect(
      isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority(
        requestAuthority
      )
    ).toBe(true);
    expect(requestAuthority).toMatchObject({
      decisionDigest: decision.decisionDigest,
      invocationMaterialAuthorityDigest: specialized.authority.authorityDigest,
    });
    expect(
      isAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority({
        ...requestAuthority,
        requestBodyDigest: digest('swapped-provider-body'),
      })
    ).toBe(false);
    expect(() =>
      createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial({
        invocation,
        decision:
          createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
            bindingKind: 'hosted-retrieval-query',
            turnIndex: 0,
            priorSourceTurnIndex: null,
            priorSourceObservationReceiptDigest: null,
            priorSourceDisposition: null,
            priorEffectResultSealReceiptDigest: null,
          }),
      })
    ).toThrow(/bootstrap invocation material is invalid/u);
  });

  it('binds pre-effect intent to one sealed shared fact and leaves specifics empty', () => {
    const receipt = receiptFor();
    expect(ownerRequestIdentity.ownerRequestId).toMatch(
      /^capability-effect-owner-request\.[0-9a-f]{64}$/u
    );
    expect(
      matchAgentEvaluationCapabilityEffectSourceReceipt(intent, receipt)
    ).toBe(true);
    expect(receipt).toMatchObject({
      intentDigest: intent.intentDigest,
      effectStatus: 'produced',
      sourceFactKind: 'retrieval-query-receipt',
      specificReceiptDigests: [],
    });
    expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(
      AGENT_EVALUATION_CAPABILITY_EFFECT_AUTHORITY_MAXIMUM_BYTES
    );
    expect(() =>
      createAgentEvaluationCapabilityPreEffectIntent({
        ...intentBinding,
        ownerRequestId: 'owner-request.self-authored',
        ownerRequestDigest: digest('self-authored-owner-request'),
      })
    ).toThrow(/registration authority drifted/u);
  });

  it('joins retrieval to the current closed provider tool-call registry record', () => {
    expect(intent.inputAuthorityBinding).toEqual(inputAuthorityBinding);
    expect(inputAuthorityBinding.requestRef).toBe(requestRef);
    expect(inputAuthorityBinding.sourceTurnIndex).toBe(intent.turnIndex);
    expect(inputAuthorityBinding.sourceObservationReceiptDigest).toBeNull();
    expect(inputAuthorityBinding.sourceRegistryReceiptDigest).toBe(
      inputAuthorityRegistryReceipt.receiptDigest
    );

    const {
      format: _format,
      version: _version,
      receiptDigest: _receiptDigest,
      ...registryInput
    } = inputAuthorityRegistryReceipt;
    const previousTurnBinding =
      createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
        createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
          ...registryInput,
          sourceTurnIndex: intent.turnIndex - 1,
        })
      );
    expect(() =>
      createAgentEvaluationCapabilityEffectOwnerRequestIdentity({
        ...intentBinding,
        inputAuthorityBinding: previousTurnBinding,
      })
    ).toThrow(/authority binding drifted/u);

    const swappedCallBinding =
      createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
        createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
          ...registryInput,
          sourceProviderToolCallId: 'provider-tool-call.release.swapped',
        })
      );
    expect(() =>
      createAgentEvaluationCapabilityEffectOwnerRequestIdentity({
        ...intentBinding,
        inputAuthorityBinding: swappedCallBinding,
      })
    ).toThrow(/authority binding drifted/u);

    expect(() =>
      createAgentEvaluationCapabilityEffectOwnerRequestIdentity({
        ...intentBinding,
        argumentsDigest: digest('swapped-arguments'),
      })
    ).toThrow(/authority binding drifted/u);
  });

  it('accepts sealed unavailable without prewriting an optional fact', () => {
    expect(
      receiptFor(digest('unavailable-result'), 'unavailable')
    ).toMatchObject({
      effectStatus: 'unavailable',
      sourceFactKind: null,
      sourceFactDigest: null,
      specificReceiptDigests: [],
    });
    expect(() =>
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
        ...receiptFor(),
        effectStatus: 'unavailable',
        receiptDigest: undefined,
      } as never)
    ).toThrow();
  });

  it('defers the shared envelope until the real effect fact is sealed', () => {
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
      completedAt: '2026-08-09T03:00:00.000Z',
    });
    const observedFact = Object.freeze({
      factKind: 'retrieval-query-receipt' as const,
      factDigest: retrieval.receiptDigest,
      value: retrieval,
    });
    const receipt = receiptFor(
      digest('retrieval-business-result'),
      'produced',
      retrieval.receiptDigest
    );
    const envelopeInput = Object.freeze({
      planDigest: intent.planDigest,
      repositoryCommit: intent.repositoryCommit,
      attemptId: intent.attemptId,
      descriptorDigest: intent.descriptorDigest,
      turnIndex: intent.turnIndex,
      invocationId: intent.invocationId,
      requestDigest: intent.providerRequestDigest,
      responseDigest: digest('provider-response'),
      protocolFamily: 'openai-responses' as const,
      providerConfigurationId:
        runtimeFactSourceAuthority.providerConfigurationId,
      modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
      adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      dispatchIntentDigest: digest('provider-dispatch-intent'),
      observedAt: '2026-08-09T03:00:01.000Z',
      fact: observedFact,
    });
    const envelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        intent,
        receipt,
        envelopeInput
      );
    expect(envelope).not.toBeNull();
    expect(
      matchAgentEvaluationProviderCapabilityRuntimeFactEnvelopeSourceAuthority(
        envelope!,
        runtimeFactSourceAuthority
      )
    ).toBe(true);
    expect(
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes: Object.freeze([envelope!]),
        requiredFactKinds: Object.freeze(['retrieval-query-receipt']),
        admittedSourceAuthorities: Object.freeze([
          Object.freeze({
            sourceAuthorityKind: 'shared-durable-capability' as const,
            runtimeFactSourceAuthority,
          }),
        ]),
      }).facts
    ).toEqual([observedFact]);

    expect(
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        intent,
        receiptFor(digest('unavailable'), 'unavailable'),
        Object.freeze({ ...envelopeInput, fact: null })
      )
    ).toBeNull();
    expect(() =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        intent,
        receipt,
        Object.freeze({
          ...envelopeInput,
          requestDigest: digest('swapped-provider-request'),
        })
      )
    ).toThrow(/binding drifted/u);

    const {
      format: _format,
      version: _version,
      envelopeDigest: _envelopeDigest,
      ...envelopeBase
    } = envelope!;
    const swappedLineageEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope({
        ...envelopeBase,
        modelLineageDigest: digest('swapped-model-lineage'),
      });
    expect(
      matchAgentEvaluationProviderCapabilityRuntimeFactEnvelopeSourceAuthority(
        swappedLineageEnvelope,
        runtimeFactSourceAuthority
      )
    ).toBe(false);
    expect(() =>
      selectAgentEvaluationProviderCapabilityObservationFacts({
        envelopes: Object.freeze([swappedLineageEnvelope]),
        requiredFactKinds: Object.freeze(['retrieval-query-receipt']),
        admittedSourceAuthorities: Object.freeze([
          Object.freeze({
            sourceAuthorityKind: 'shared-durable-capability' as const,
            runtimeFactSourceAuthority,
          }),
        ]),
      })
    ).toThrow(/selection is invalid/u);
  });

  it('reconciles ACK loss only when the persisted source receipt bytes are exact', () => {
    const persisted = receiptFor();
    expect(
      reconcileAgentEvaluationCapabilityEffectSourceReceipt(
        intent,
        persisted,
        receiptFor()
      )
    ).toBe(persisted);
    expect(() =>
      reconcileAgentEvaluationCapabilityEffectSourceReceipt(
        intent,
        persisted,
        receiptFor(digest('drifted-business-result'))
      )
    ).toThrow(/ACK-loss reconciliation detected receipt drift/u);
  });

  it('rejects specific receipts, registration swaps, owner drift, and recomputed tampering', () => {
    expect(() =>
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
        ...(() => {
          const {
            format: _format,
            version: _version,
            receiptDigest: _digest,
            ...base
          } = receiptFor();
          return base;
        })(),
        specificReceiptDigests: [digest('forbidden-specific')],
      } as never)
    ).toThrow(/input is invalid/u);

    const swappedAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
      ...(() => {
        const { authorityDigest: _authorityDigest, ...base } =
          runtimeFactSourceAuthority;
        return base;
      })(),
      registrationReceiptDigest: digest('swapped-registration'),
    });
    const receipt = receiptFor();
    const {
      format: _format,
      version: _version,
      receiptDigest: _receiptDigest,
      ...receiptInput
    } = receipt;
    expect(() =>
      createAgentEvaluationCapabilityEffectSourceReceipt(intent, {
        ...receiptInput,
        runtimeFactSourceAuthority: swappedAuthority,
        registrationReceiptDigest: swappedAuthority.registrationReceiptDigest,
      })
    ).toThrow(/drifted from its pre-effect intent/u);

    const { intentDigest: _intentDigest, ...intentBase } = intent;
    const tamperedIntentBase = Object.freeze({
      ...intentBase,
      ownerRequestId: 'Bearer-secret-material',
    });
    const tamperedIntent = Object.freeze({
      ...tamperedIntentBase,
      intentDigest: digestAgentCanonicalValue(tamperedIntentBase),
    });
    expect(
      isAgentEvaluationCapabilityEffectSourceReceipt(receipt, tamperedIntent)
    ).toBe(false);
  });
});
