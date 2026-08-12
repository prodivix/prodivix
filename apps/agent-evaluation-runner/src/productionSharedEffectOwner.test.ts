import { readFileSync } from 'node:fs';
import { copyFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  createAgentEvaluationCapabilityEffectProviderJournalHealth,
  createAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultResolveReceipt,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  createAgentProviderJob,
  createAgentProviderJobReceipt,
  decodeAgentNativeProviderCapabilityRuntimeResponse,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityEffectToolArguments,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  digestAgentNativeProviderStateReference,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationRuntimeFactSourceAuthority,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentNativeProviderStateVaultPort,
  type CanonicalDigest,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4Fixture } from '../../../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import type { AgentEvaluationCapabilityRuntimeToolInput } from './capabilityRuntime';
import {
  PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
  assertProductionCapabilityExecuteInput,
  type ProductionCapabilityExecuteResponse,
} from './productionCapabilityAuthority';
import { createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts } from './productionAttemptOwnerAuthorityPorts';
import {
  createProductionAgentEvaluationCapabilityEffectProviderRuntimeTransport,
  type AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport,
} from './productionCapabilityEffectProviderRuntimeTransport';
import {
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
  type AgentEvaluationProductionCapabilityEffectProviderJournalClient,
} from './productionCapabilityEffectProviderJournalClient';
import type { AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher } from './productionCapabilityEffectProviderJournalSpoolCipher';
import type {
  AgentProviderSecretResolver,
  AgentProviderSecretUseRequest,
} from './secretResolver';
import {
  createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt,
  createFileProductionAgentEvaluationSharedEffectDurableRegistry,
  createFileProductionAgentEvaluationSharedEffectOwner,
  type AgentEvaluationProductionSharedEffectExecutionResultInput,
  type AgentEvaluationProductionSharedEffectExecutor,
} from './productionSharedEffectDurableRegistry';
import {
  createProductionAgentEvaluationSharedEffectOwner,
  createAgentEvaluationProductionSharedEffectStage,
  digestAgentEvaluationProductionSharedEffectDispatchAck,
  type AgentEvaluationProductionSharedEffectBinding,
  type AgentEvaluationProductionSharedEffectHealthInput,
  type AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';
import {
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
  createProductionAgentEvaluationSharedEffectExecutor,
} from './productionSharedEffectExecutor';
import { createProductionAgentEvaluationSharedEffectStatefulOwner } from './productionSharedEffectStatefulOwner';
import type { AgentEvaluationProductionSharedEffectHostedResourceContext } from './productionSharedEffectHostedOwner';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
} from './productionNativeProviderStateVaultHealthClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import { createAgentEvaluationRuntimeFactSourceRegistrationRequest } from './runtimeFactSourceRegistration';
import {
  decodeAgentEvaluationFrozenRunConfig,
  decodeAgentEvaluationRunConfigQualificationTemplate,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const NOW = '2026-08-08T08:00:00.000Z';
const namespaceId = 'namespace.shared-effect-owner.test';
const shardLeaseOwnerId = 'worker.shared-effect-owner.test';
const grantSetDigest = digestAgentCanonicalValue({ grants: ['shared-effect'] });
const plan = createV8EvaluationPlan();
const materials = getG4V8PublicEvaluationCaseMaterials();
const descriptors = planAgentModelEvaluationAttempts(plan);
const productionSource = readFileSync(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  ),
  'utf8'
);
const qualificationTemplate =
  decodeAgentEvaluationRunConfigQualificationTemplate(productionSource);
const productionConfig = requireProductionAgentEvaluationFrozenRunConfig(
  decodeAgentEvaluationFrozenRunConfig(
    materializeAgentEvaluationTestProductionRunConfig(
      JSON.parse(productionSource) as Record<string, unknown>
    ),
    {
      clock: () => NOW,
      expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    }
  ),
  '0123456789abcdef0123456789abcdef01234567'
);

type SharedEffectToolInput = Extract<
  AgentEvaluationCapabilityRuntimeToolInput,
  Readonly<{ executionAuthorityKind: 'shared-effect' }>
>;

const caseFixture = (
  predicate: (
    candidate: AgentModelEvaluationPlan['concreteCases'][number]
  ) => boolean,
  protocolFamily?: 'openai-responses'
): Readonly<{
  material: AgentEvaluationCaseMaterial;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  capabilityDescriptor: AgentModelEvaluationPlan['concreteCases'][number]['capabilityDescriptor'];
}> => {
  const concreteCase = plan.concreteCases.find(
    (candidate) =>
      predicate(candidate) &&
      materials.some(({ caseId }) => caseId === candidate.caseId)
  );
  const material = concreteCase
    ? materials.find(({ caseId }) => caseId === concreteCase.caseId)
    : undefined;
  const descriptor = concreteCase
    ? descriptors.find(
        ({ caseId, targetId }) =>
          caseId === concreteCase.caseId &&
          (protocolFamily === undefined ||
            plan.capabilityQualificationTargets.some(
              (target) =>
                target.targetId === targetId &&
                target.protocolFamily === protocolFamily
            ))
      )
    : undefined;
  if (!concreteCase || !material || !descriptor) {
    throw new TypeError(
      `Shared-effect public fixture is unavailable: ${JSON.stringify({
        protocolFamily,
        caseId: concreteCase?.caseId,
        material: material !== undefined,
        descriptorProtocols: concreteCase
          ? descriptors
              .filter(({ caseId }) => caseId === concreteCase.caseId)
              .map(
                ({ targetId }) =>
                  plan.capabilityQualificationTargets.find(
                    (target) => target.targetId === targetId
                  )?.protocolFamily
              )
          : [],
      })}`
    );
  }
  return Object.freeze({
    material,
    descriptor,
    capabilityDescriptor: concreteCase.capabilityDescriptor,
  });
};

const background = caseFixture(
  ({ capabilityDescriptor }) =>
    capabilityDescriptor.expectedReceiptKinds.includes(
      'background-job-receipt'
    ),
  'openai-responses'
);
const hostedRetrieval = caseFixture(
  ({ capabilityDescriptor }) =>
    capabilityDescriptor.expectedToolIds.includes('provider.retrieval.search'),
  'openai-responses'
);

type SharedEffectFixture = Readonly<{
  fixture: ReturnType<typeof caseFixture>;
  bindingKind: 'hosted-retrieval-query' | 'provider-job';
  capabilityId: 'provider.hosted-retrieval' | 'provider.background-job';
  sourceFactKind: 'provider-event' | 'provider-job-receipt';
}>;

const backgroundFixture = Object.freeze({
  fixture: background,
  bindingKind: 'provider-job' as const,
  capabilityId: 'provider.background-job' as const,
  sourceFactKind: 'provider-job-receipt' as const,
});
const hostedRetrievalFixture = Object.freeze({
  fixture: hostedRetrieval,
  bindingKind: 'hosted-retrieval-query' as const,
  capabilityId: 'provider.hosted-retrieval' as const,
  sourceFactKind: 'provider-event' as const,
});

const expectedSourceIdentities =
  (): readonly AgentProductionEvaluationRuntimeFactSourceIdentity[] => {
    const values = new Map<
      CanonicalDigest,
      AgentProductionEvaluationRuntimeFactSourceIdentity
    >();
    for (const target of plan.capabilityQualificationTargets) {
      const authority =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      if (!authority) continue;
      const {
        registrationReceiptDigest: _registrationReceiptDigest,
        authorityDigest: _authorityDigest,
        ...identity
      } = authority;
      values.set(digestAgentCanonicalValue(identity), Object.freeze(identity));
    }
    return Object.freeze([...values.values()]);
  };

const qualificationSourceIdentities =
  (): readonly AgentProductionEvaluationRuntimeFactSourceIdentity[] =>
    Object.freeze(
      qualificationTemplate.nativeIdentities.flatMap((identity) =>
        Object.values(identity.expectedRuntimeFactSourceIdentities)
      )
    );

const sharedToolInput = (
  targetRef = 'request.shared-effect-owner.test',
  selected: SharedEffectFixture = backgroundFixture,
  runtimeAuthorityOverride?: AgentEvaluationRuntimeFactSourceAuthority
): SharedEffectToolInput => {
  const fixture = selected.fixture;
  const turnIndex = 1;
  const invocationId = 'invocation.shared-effect-owner.test';
  const toolId = fixture.capabilityDescriptor.expectedToolIds[0]!;
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === fixture.descriptor.targetId
  );
  const runtimeFactSourceAuthority =
    runtimeAuthorityOverride ??
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (!runtimeFactSourceAuthority) {
    throw new TypeError('Shared-effect source authority is unavailable.');
  }
  const protocolFamily = runtimeFactSourceAuthority.protocolFamily;
  if (
    protocolFamily !== 'anthropic-messages' &&
    protocolFamily !== 'gemini-interactions' &&
    protocolFamily !== 'openai-responses'
  ) {
    throw new TypeError('Shared-effect protocol is unsupported.');
  }
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: fixture.descriptor.attemptId,
      descriptorDigest: fixture.descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      bindingKind: selected.bindingKind,
      capabilityId: selected.capabilityId,
      toolId,
      targetRef,
      protocolFamily,
      providerConfigurationId:
        runtimeFactSourceAuthority.providerConfigurationId,
      modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
      adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest:
        runtimeFactSourceAuthority.authorityDigest,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      issuedAt: NOW,
      expiresAt: new Date(Date.parse(NOW) + 125_000).toISOString(),
    });
  const argumentsValue = Object.freeze({
    requestRef: requestRefAuthority.requestRef,
    targetRef,
  });
  const providerRequestDigest = digestAgentCanonicalValue({
    providerRequest: fixture.descriptor.descriptorDigest,
    requestRef: requestRefAuthority.requestRef,
  });
  const sourceAttemptId = fixture.descriptor.attemptId;
  const sourceInvocationId =
    selected.bindingKind === 'hosted-retrieval-query'
      ? invocationId
      : 'invocation.shared-effect-owner.source';
  const sourceProviderRequestDigest =
    selected.bindingKind === 'hosted-retrieval-query'
      ? providerRequestDigest
      : digestAgentCanonicalValue({ source: 'provider-request' });
  const sourceResponseDigest = digestAgentCanonicalValue({
    source: 'provider-response',
  });
  const callbackLocalProviderStateHandle =
    'response.shared-effect-owner.source';
  const providerStateReferenceDigest =
    selected.bindingKind === 'provider-job'
      ? digestAgentNativeProviderStateReference(
          'response-id',
          callbackLocalProviderStateHandle
        )
      : null;
  const sourceProgram = qualificationTemplate.nativeIdentities.find(
    (identity) =>
      identity.protocolFamily === protocolFamily &&
      identity.providerConfigurationId ===
        runtimeFactSourceAuthority.providerConfigurationId
  )?.capabilityProbePrograms[
    runtimeFactSourceAuthority.capabilityProfileId as keyof (typeof qualificationTemplate.nativeIdentities)[number]['capabilityProbePrograms']
  ];
  if (!sourceProgram) {
    throw new TypeError('Shared-effect source program is unavailable.');
  }
  const stateVaultSealRequest =
    selected.bindingKind === 'provider-job'
      ? createAgentNativeProviderStateVaultSealRequest({
          authorityDigest:
            qualificationTemplate.nativeProviderStateVaultEncryption.authority
              .authorityDigest,
          purpose: 'background-job-state',
          attemptId: sourceAttemptId,
          protocolFamily: protocolFamily as
            'gemini-interactions' | 'openai-responses',
          providerStateReferenceKind: 'response-id',
          providerStateReferenceDigest: providerStateReferenceDigest!,
          probeProgramDigest: sourceProgram.programDigest,
          capabilityProfileDigest:
            runtimeFactSourceAuthority.capabilityProfileDigest,
          invocationId: sourceInvocationId,
          requestDigest: sourceProviderRequestDigest,
          responseDigest: sourceResponseDigest,
          responseBodyDigest: digestAgentCanonicalValue({
            source: 'provider-response-body',
          }),
          sealedResponseJsonDigest: digestAgentCanonicalValue({
            source: 'sealed-provider-response-json',
          }),
          providerConfigurationId:
            runtimeFactSourceAuthority.providerConfigurationId,
          modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
          adapterDigest: runtimeFactSourceAuthority.adapterDigest,
          taskId: 'task.shared-effect-owner.source',
          runId: 'run.shared-effect-owner.source',
          generation: 1,
          observedAt: NOW,
          expiresAt: new Date(Date.parse(NOW) + 125_000).toISOString(),
        })
      : null;
  const stateVaultSealReceipt = stateVaultSealRequest
    ? createAgentNativeProviderStateVaultSealReceipt(stateVaultSealRequest, {
        status: 'sealed',
        stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
          source: 'state-data-key-created',
        }),
        opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
          authorityDigest: stateVaultSealRequest.authorityDigest,
          sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
          stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
            source: 'state-data-key-created',
          }),
        }),
        sealedAt: NOW,
      })
    : null;
  const sourceHandleDigest = (() => {
    if (!stateVaultSealRequest || !stateVaultSealReceipt) {
      return digestAgentCanonicalValue({ source: selected.sourceFactKind });
    }
    const nativeSourceReceipt =
      createAgentNativeProviderOptionalCapabilitySourceReceipt(sourceProgram, {
        protocolFamily: stateVaultSealRequest.protocolFamily,
        capabilityProfileDigest:
          runtimeFactSourceAuthority.capabilityProfileDigest,
        invocationId: sourceInvocationId,
        requestDigest: sourceProviderRequestDigest,
        responseDigest: sourceResponseDigest,
        providerConfigurationId:
          runtimeFactSourceAuthority.providerConfigurationId,
        modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: runtimeFactSourceAuthority.adapterDigest,
        executionIdentityAuthority:
          createAgentNativeProviderExecutionIdentityAuthority({
            invocationId: sourceInvocationId,
            taskId: stateVaultSealRequest.taskId,
            runId: stateVaultSealRequest.runId,
            generation: stateVaultSealRequest.generation,
          }),
        source: Object.freeze({
          sourceKind: 'provider-job-active-status' as const,
          providerStateReferenceDigest:
            stateVaultSealRequest.providerStateReferenceDigest,
          opaqueProviderStateRef: stateVaultSealReceipt.opaqueProviderStateRef!,
          stateVaultAuthorityDigest: stateVaultSealRequest.authorityDigest,
          stateVaultSealRequestDigest: stateVaultSealRequest.sealRequestDigest,
          stateVaultSealReceiptDigest: stateVaultSealReceipt.receiptDigest,
          taskId: stateVaultSealRequest.taskId,
          runId: stateVaultSealRequest.runId,
          generation: stateVaultSealRequest.generation,
          providerStatus: 'in-progress' as const,
        }),
        observedAt: stateVaultSealRequest.observedAt,
      });
    if (nativeSourceReceipt.fact.factType !== 'provider-job-receipt') {
      throw new TypeError('Shared-effect source did not produce a job fact.');
    }
    return nativeSourceReceipt.fact.value.receiptDigest;
  })();
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind: selected.bindingKind,
        capabilityId: selected.capabilityId,
        requestRef: requestRefAuthority.requestRef,
        targetRef,
        requestRefAuthority,
        requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
        sourceAttemptId,
        sourceTurnIndex:
          selected.bindingKind === 'hosted-retrieval-query' ? turnIndex : 0,
        sourceInvocationId,
        sourceProviderRequestDigest,
        sourceResponseDigest,
        sourceDispatchIntentDigest: digestAgentCanonicalValue({
          source: 'dispatch-intent',
        }),
        sourceTransportReceiptDigest: digestAgentCanonicalValue({
          source: 'transport-receipt',
        }),
        sourceResultSpoolReceiptDigest: digestAgentCanonicalValue({
          source: 'result-spool-receipt',
        }),
        sourceNormalizedEventSetDigest: digestAgentCanonicalValue({
          source: 'normalized-event-set',
        }),
        sourceObservationReceiptDigest:
          selected.bindingKind === 'hosted-retrieval-query'
            ? null
            : digestAgentCanonicalValue({
                source: 'provider-capability-observation',
              }),
        sourceFactKind: selected.sourceFactKind,
        sourceProviderEventType:
          selected.bindingKind === 'hosted-retrieval-query'
            ? ('tool-call' as const)
            : null,
        sourceProviderToolCallId:
          selected.bindingKind === 'hosted-retrieval-query'
            ? 'provider-tool-call.shared-effect-owner.test'
            : null,
        sourceToolId:
          selected.bindingKind === 'hosted-retrieval-query'
            ? 'provider.retrieval.search'
            : null,
        sourceArgumentsDigest:
          selected.bindingKind === 'hosted-retrieval-query'
            ? digestAgentEvaluationCapabilityEffectToolArguments(argumentsValue)
            : null,
        sourceHandleDigest,
        stateVaultSealRequest,
        stateVaultSealReceipt,
        protocolFamily,
        providerConfigurationId:
          runtimeFactSourceAuthority.providerConfigurationId,
        modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      })
    );
  const argumentsDigest =
    digestAgentEvaluationCapabilityEffectToolArguments(argumentsValue);
  const intentBinding = Object.freeze({
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: fixture.descriptor.attemptId,
    descriptorDigest: fixture.descriptor.descriptorDigest,
    caseId: fixture.material.caseId,
    materialDigest: fixture.material.materialDigest,
    turnIndex,
    invocationId,
    toolId,
    toolCallId: 'tool-call.shared-effect-owner.test',
    providerToolCallId: 'provider-tool-call.shared-effect-owner.test',
    providerRequestDigest,
    argumentsDigest,
    requestedAt: NOW,
    inputAuthorityBinding,
    runtimeFactSourceAuthority,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
  });
  const ownerRequest =
    createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentBinding);
  const preEffectIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...intentBinding,
    ...ownerRequest,
  });
  return Object.freeze({
    namespaceId,
    shardLeaseOwnerId,
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: fixture.descriptor.attemptId,
    descriptorDigest: fixture.descriptor.descriptorDigest,
    caseId: fixture.material.caseId,
    caseDigest: fixture.material.caseDigest,
    materialDigest: fixture.material.materialDigest,
    capabilityDescriptor: fixture.capabilityDescriptor,
    loopPolicyDigest: plan.promptPolicyDigest,
    turnIndex,
    invocationId,
    toolCallId: intentBinding.toolCallId,
    providerToolCallId: intentBinding.providerToolCallId,
    toolId,
    arguments: argumentsValue,
    argumentsDigest,
    requestDigest: providerRequestDigest,
    executionAuthorityKind: 'shared-effect',
    budgetReservationId: 'budget-reservation.shared-effect-owner.test',
    preEffectIntent,
    maximumToolResultBytes: 65_536,
  });
};

const ownerRequest = (
  payload: SharedEffectToolInput,
  mode: 'execute' | 'reconcile' = 'execute'
): AgentEvaluationOwnerAuthorityRequest => {
  const requestDigest = digestAgentCanonicalValue({
    serviceKind: 'provider-capability',
    operation: 'tool.execute',
    descriptorDigest: payload.descriptorDigest,
    payloadDigest: digestAgentCanonicalValue(payload),
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'provider-capability' as const,
    mode,
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    operation: 'tool.execute' as const,
    routeBinding: '/v1/provider-capability/tool.execute',
    requestDigest,
    attemptId: payload.attemptId,
    descriptorDigest: payload.descriptorDigest,
    shardLeaseOwnerId,
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        Object.freeze([])
      ),
    ownerImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
    claimGeneration: 1,
    payload,
  });
  return Object.freeze({
    ...base,
    stageDigest: createAgentEvaluationAttemptAuthorityDispatchStageDigest(
      base,
      PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST
    ),
  });
};

const effectResult = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage
): AgentEvaluationProductionSharedEffectExecutionResultInput => {
  const input = binding.toolInput;
  const sealRequest =
    input.preEffectIntent.inputAuthorityBinding.stateVaultSealRequest;
  const sealReceipt =
    input.preEffectIntent.inputAuthorityBinding.stateVaultSealReceipt;
  if (!sealRequest || !sealReceipt) {
    throw new TypeError('Shared-effect state vault source is unavailable.');
  }
  const stateVaultResolveRequest =
    createAgentNativeProviderStateVaultResolveRequest({
      sealRequest,
      sealReceipt,
      consumerAttemptId: input.attemptId,
      consumerInvocationId: input.invocationId,
      consumerGeneration: sealRequest.generation,
      requestedAt: NOW,
    });
  const stateVaultResolveReceipt =
    createAgentNativeProviderStateVaultResolveReceipt(
      stateVaultResolveRequest,
      {
        status: 'resolved',
        callbackLocalProviderStateHandle: 'response.shared-effect-owner.source',
        resolvedAt: NOW,
      }
    );
  const stateVaultRetireRequest =
    createAgentNativeProviderStateVaultRetireRequest({
      sealRequest,
      sealReceipt,
      resolveRequest: stateVaultResolveRequest,
      resolveReceipt: stateVaultResolveReceipt,
      disposition: 'consumed',
      requestedAt: NOW,
    });
  const stateVaultRetirementReceipt =
    createAgentNativeProviderStateVaultRetirementReceipt(
      stateVaultRetireRequest,
      sealRequest,
      sealReceipt,
      {
        status: 'retired',
        stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
          source: 'state-data-key-destroyed',
        }),
        opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
          source: 'state-vault-record-deleted',
        }),
        retiredAt: NOW,
      }
    );
  const businessResult = Object.freeze({
    status: 'supported',
    toolId: input.toolId,
    requestDigest: input.requestDigest,
    ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
  });
  const businessResultDigest = digestAgentCanonicalValue(businessResult);
  const providerJob = createAgentProviderJobReceipt(
    createAgentProviderJob({
      providerJobId: `job.shared-effect.${input.invocationId}`,
      taskId: sealRequest.taskId,
      runId: sealRequest.runId,
      generation: sealRequest.generation,
      invocationId: input.invocationId,
      requestDigest: input.requestDigest,
    })
  );
  const effectSourceFact = Object.freeze({
    factKind: 'provider-job-receipt' as const,
    factDigest: providerJob.receiptDigest,
    value: providerJob,
  });
  const sealedAt = NOW;
  const transportReceiptDigest = digestAgentCanonicalValue({
    ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
    transport: 'completed',
  });
  const resultSpoolReceiptDigest = digestAgentCanonicalValue({
    ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
    spool: 'sealed',
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
    factDigest: effectSourceFact.factDigest,
  });
  const dispatchAckDigest =
    digestAgentEvaluationProductionSharedEffectDispatchAck({
      ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
      preEffectIntentDigest: input.preEffectIntent.intentDigest,
      stageDigest: stage.stageDigest,
      effectStatus: 'produced',
      businessResultDigest,
      sourceFactKind: effectSourceFact.factKind,
      sourceFactDigest: effectSourceFact.factDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      sealedAt,
    });
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(input.preEffectIntent, {
      intentDigest: input.preEffectIntent.intentDigest,
      ownerRequestId: input.preEffectIntent.ownerRequestId,
      ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
      runtimeFactSourceAuthority:
        input.preEffectIntent.runtimeFactSourceAuthority,
      registrationReceiptDigest:
        input.preEffectIntent.registrationReceiptDigest,
      effectStatus: 'produced',
      businessResultDigest,
      providerRuntimeJournalResultRecordDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        journalResult: 'sealed',
      }),
      providerRuntimeResultSealReceiptDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        journalResultSeal: 'sealed',
      }),
      sourceFactKind: effectSourceFact.factKind,
      sourceFactDigest: effectSourceFact.factDigest,
      stageDigest: stage.stageDigest,
      dispatchAckDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      stateVaultResolveRequest,
      stateVaultResolveReceipt,
      stateVaultRetireRequest,
      stateVaultRetirementReceipt,
      specificReceiptDigests: Object.freeze([]),
      sealedAt,
    });
  return Object.freeze({
    effectSourceReceipt,
    effectSourceFact,
    businessResult,
  });
};

type ExecutorState = {
  executeCount: number;
  readinessCount: number;
  closeCount: number;
  executeAvailable: boolean;
  readinessAvailable: boolean;
  mutateEffect?: (
    input: AgentEvaluationProductionSharedEffectExecutionResultInput
  ) => AgentEvaluationProductionSharedEffectExecutionResultInput;
  mutateReadiness?: (
    input: ReturnType<
      typeof createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt
    >
  ) => ReturnType<
    typeof createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt
  >;
};

const executor = (
  state: ExecutorState
): AgentEvaluationProductionSharedEffectExecutor =>
  Object.freeze({
    authorityKind:
      'production-provider-metadata-or-hosted-effect-owner' as const,
    async execute(
      binding: AgentEvaluationProductionSharedEffectBinding,
      stage: AgentEvaluationProductionSharedEffectStage
    ) {
      state.executeCount += 1;
      if (!state.executeAvailable) return undefined;
      const value = effectResult(binding, stage);
      return state.mutateEffect?.(value) ?? value;
    },
    async checkReadiness(
      input: AgentEvaluationProductionSharedEffectHealthInput
    ) {
      state.readinessCount += 1;
      if (!state.readinessAvailable) return undefined;
      const value =
        createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt(
          input,
          {
            checkedAt: NOW,
            expiresAt: new Date(
              Date.parse(input.lookup.minimumExpiresAt) + 60_000
            ).toISOString(),
          }
        );
      return state.mutateReadiness?.(value) ?? value;
    },
    async close() {
      state.closeCount += 1;
      return Object.freeze({
        status: 'clean' as const,
        residualResourceIds: Object.freeze([]) as readonly [],
        residualCanaryIds: Object.freeze([]) as readonly [],
      });
    },
  });

const state = (overrides: Partial<ExecutorState> = {}): ExecutorState => ({
  executeCount: 0,
  readinessCount: 0,
  closeCount: 0,
  executeAvailable: true,
  readinessAvailable: true,
  ...overrides,
});

const temporaryRoot = () =>
  mkdtemp(join(tmpdir(), 'prodivix-shared-effect-owner-test-'));

const createOwner = async (
  root: string,
  executorState: ExecutorState,
  clock = () => new Date(NOW)
) => {
  return createFileProductionAgentEvaluationSharedEffectOwner({
    stateDirectory: root,
    executor: executor(executorState),
    expectedSourceIdentities: expectedSourceIdentities(),
    forbiddenCanaries: () => Object.freeze([]),
    allowTemporaryStateDirectory: true,
    clock,
  });
};

const registrationLookup = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity,
  minimumOffsetMs = 60_000
) => {
  const minimumExpiresAt = new Date(
    Date.parse(NOW) + minimumOffsetMs
  ).toISOString();
  const request = createAgentEvaluationRuntimeFactSourceRegistrationRequest({
    namespaceId,
    repositoryCommit: plan.repositoryCommit,
    sourceAuthorityKind: identity.kind,
    sourceKind: identity.sourceKind,
    sourceAuthorityId: identity.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    routeBinding: identity.routeBinding,
    capabilityProfileId:
      identity.capabilityProfileId as AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
    capabilityProfileDigest: identity.capabilityProfileDigest,
    capabilityId: identity.capabilityId,
    protocolFamily:
      identity.protocolFamily as AgentProductionEvaluationNativeProtocolFamily,
    providerConfigurationId: identity.providerConfigurationId,
    modelId: identity.modelId,
    modelLineageDigest: identity.modelLineageDigest,
    adapterDigest: identity.adapterDigest,
    ...(identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
        }
      : {}),
    minimumExpiresAt,
  });
  return Object.freeze({
    namespaceId,
    repositoryCommit: plan.repositoryCommit,
    registrationRequestDigest: request.requestDigest,
    expectedIdentityDigest: digestAgentCanonicalValue(identity),
    minimumExpiresAt,
  });
};

const sharedEffectHealthInput = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity,
  minimumOffsetMs = 60_000
): AgentEvaluationProductionSharedEffectHealthInput => {
  const lookup = registrationLookup(identity, minimumOffsetMs);
  const registrationRequest =
    createAgentEvaluationRuntimeFactSourceRegistrationRequest({
      namespaceId,
      repositoryCommit: plan.repositoryCommit,
      sourceAuthorityKind: identity.kind,
      sourceKind: identity.sourceKind,
      sourceAuthorityId: identity.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        identity.sourceAuthorityImplementationDigest,
      routeBinding: identity.routeBinding,
      capabilityProfileId:
        identity.capabilityProfileId as AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
      capabilityProfileDigest: identity.capabilityProfileDigest,
      capabilityId: identity.capabilityId,
      protocolFamily:
        identity.protocolFamily as AgentProductionEvaluationNativeProtocolFamily,
      providerConfigurationId: identity.providerConfigurationId,
      modelId: identity.modelId,
      modelLineageDigest: identity.modelLineageDigest,
      adapterDigest: identity.adapterDigest,
      ...(identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
        ? {
            hostedRetrievalRuntimeResourceRegistrationIntentDigest:
              identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
          }
        : {}),
      minimumExpiresAt: lookup.minimumExpiresAt,
    });
  expect(registrationRequest.requestDigest).toBe(
    lookup.registrationRequestDigest
  );
  return Object.freeze({
    lookup,
    registrationRequest,
    sourceIdentity: identity,
  });
};

describe('production shared-effect owner and durable health registry', () => {
  it('rejects a shared-effect request without the outer Provider budget reservation', async () => {
    const payload = sharedToolInput();
    const { budgetReservationId: _budgetReservationId, ...missingBudget } =
      payload;
    const request = ownerRequest(payload);
    expect(() =>
      assertProductionCapabilityExecuteInput(
        Object.freeze({
          ...request,
          payload: Object.freeze(missingBudget),
        })
      )
    ).toThrow('G4_PROVIDER_CAPABILITY_AUTHORITY_INVALID');
  });

  it('persists real Hosted and non-Hosted Provider dispatch budget reservations before sealing the journal result', async () => {
    const expiresAt = new Date(Date.parse(NOW) + 125_000).toISOString();
    const ownerInstanceId = 'journal-owner.shared-effect-runtime.test';
    const spoolCipher: AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher =
      Object.freeze({
        authority: Object.freeze({
          keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
          keyVersion:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION,
          keyRefDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
          encryptionProfileDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
        }),
        async encrypt() {
          throw new TypeError(
            'Failed Provider dispatch must not spool a body.'
          );
        },
        async useDecrypted() {
          throw new TypeError(
            'Failed Provider dispatch must not decrypt a body.'
          );
        },
      });
    const journalHealth =
      createAgentEvaluationCapabilityEffectProviderJournalHealth({
        authorityId:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId,
        authorityDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
        ownerInstanceId,
        retentionPolicyDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
        status: 'healthy',
        residualEncryptedSpoolCount: 0,
        expiredEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        overdueUnfinishedOwnerCount: 0,
        abandonedOwnerCount: 0,
        checkedAt: NOW,
        expiresAt,
      });

    const execute = async (
      selected: SharedEffectFixture,
      hostedResourceContext: AgentEvaluationProductionSharedEffectHostedResourceContext | null
    ) => {
      const toolInput = sharedToolInput(
        `request.shared-effect-budget.${selected.bindingKind}`,
        selected
      );
      const runtimeAuthority =
        toolInput.preEffectIntent.runtimeFactSourceAuthority;
      const {
        registrationReceiptDigest: _registrationReceiptDigest,
        authorityDigest: _authorityDigest,
        ...sourceIdentity
      } = runtimeAuthority;
      const binding: AgentEvaluationProductionSharedEffectBinding =
        Object.freeze({
          authorityRequestDigest: digestAgentCanonicalValue({
            budget: toolInput.preEffectIntent.ownerRequestDigest,
          }),
          toolInput,
          sourceIdentity: Object.freeze(sourceIdentity),
          sourceIdentityDigest: digestAgentCanonicalValue(sourceIdentity),
        });
      const outerStage = createAgentEvaluationProductionSharedEffectStage(
        binding,
        NOW
      );
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId:
          runtimeAuthority.capabilityProfileId as AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
        capabilityProfileDigest: runtimeAuthority.capabilityProfileDigest,
      });
      const executionBudgetReservationIds: string[] = [];
      let persistedExecutionRecord:
        | import('@prodivix/ai').AgentEvaluationCapabilityEffectProviderJournalExecutionRecord
        | undefined;
      let persistedStageRecord:
        | import('@prodivix/ai').AgentEvaluationCapabilityEffectProviderJournalStageRecord
        | undefined;
      const journal: AgentEvaluationProductionCapabilityEffectProviderJournalClient =
        Object.freeze({
          async readHealth() {
            return journalHealth;
          },
          async writeStage(stageRecord) {
            return stageRecord;
          },
          async claimStage(stageRecord) {
            persistedStageRecord = stageRecord;
            return Object.freeze({
              stageRecord,
              disposition: 'created' as const,
            });
          },
          async writeExecution({ write }) {
            persistedExecutionRecord = write.executionRecord;
            executionBudgetReservationIds.push(
              write.executionRecord.executionReceipt.dispatchIntent
                .budgetReservationId
            );
            return write.executionRecord;
          },
          async writeResult({ resultRecord }) {
            return resultRecord;
          },
          async readSnapshot() {
            return undefined;
          },
          async cleanup() {
            return undefined;
          },
          async readZeroResidual() {
            return undefined;
          },
        });
      const secrets = Object.freeze({
        async use<T>(
          _request: AgentProviderSecretUseRequest,
          consumer: (material: Uint8Array) => Promise<T>
        ): Promise<T> {
          const credential = new TextEncoder().encode(
            'shared-effect-runtime-test-key'
          );
          try {
            return await consumer(credential);
          } finally {
            credential.fill(0);
          }
        },
      }) satisfies AgentProviderSecretResolver;
      const runtime: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport =
        createProductionAgentEvaluationCapabilityEffectProviderRuntimeTransport(
          {
            environment: (name) =>
              name ===
              PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
                ? ownerInstanceId
                : runtimeAuthority.modelId,
            forbiddenCanaries: () => Object.freeze([]),
            spoolCipher,
            executionEnabled: true,
            journalFor: () => journal,
            journalHealth: Object.freeze({
              async readHealth() {
                return journalHealth;
              },
            }),
            secrets,
            resolveHost: async () => Object.freeze(['8.8.8.8']),
            fetcher: async () => {
              throw new TypeError('simulated-provider-dispatch-failure');
            },
            clock: () => new Date(NOW),
          }
        );
      const inputAuthority = toolInput.preEffectIntent.inputAuthorityBinding;
      const sealRequest = inputAuthority.stateVaultSealRequest;
      const sealReceipt = inputAuthority.stateVaultSealReceipt;
      const stateVaultResolveRequest =
        sealRequest && sealReceipt
          ? createAgentNativeProviderStateVaultResolveRequest({
              sealRequest,
              sealReceipt,
              consumerAttemptId: toolInput.attemptId,
              consumerInvocationId: toolInput.invocationId,
              consumerGeneration: sealRequest.generation,
              requestedAt: NOW,
            })
          : null;
      const callbackLocalProviderStateHandle = stateVaultResolveRequest
        ? 'response.shared-effect-owner.source'
        : null;
      const stateVaultResolveReceipt = stateVaultResolveRequest
        ? createAgentNativeProviderStateVaultResolveReceipt(
            stateVaultResolveRequest,
            {
              status: 'resolved',
              callbackLocalProviderStateHandle:
                callbackLocalProviderStateHandle!,
              resolvedAt: NOW,
            }
          )
        : null;
      const nativeSourceReceipt =
        sealRequest && sealReceipt
          ? createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
              protocolFamily: sealRequest.protocolFamily,
              capabilityProfileDigest: runtimeAuthority.capabilityProfileDigest,
              invocationId: sealRequest.invocationId,
              requestDigest: sealRequest.requestDigest,
              responseDigest: sealRequest.responseDigest,
              providerConfigurationId: sealRequest.providerConfigurationId,
              modelLineageDigest: sealRequest.modelLineageDigest,
              adapterDigest: sealRequest.adapterDigest,
              executionIdentityAuthority:
                createAgentNativeProviderExecutionIdentityAuthority({
                  invocationId: sealRequest.invocationId,
                  taskId: sealRequest.taskId,
                  runId: sealRequest.runId,
                  generation: sealRequest.generation,
                }),
              source: Object.freeze({
                sourceKind: 'provider-job-active-status' as const,
                providerStateReferenceDigest:
                  sealRequest.providerStateReferenceDigest,
                opaqueProviderStateRef: sealReceipt.opaqueProviderStateRef!,
                stateVaultAuthorityDigest: sealRequest.authorityDigest,
                stateVaultSealRequestDigest: sealRequest.sealRequestDigest,
                stateVaultSealReceiptDigest: sealReceipt.receiptDigest,
                taskId: sealRequest.taskId,
                runId: sealRequest.runId,
                generation: sealRequest.generation,
                providerStatus: 'in-progress' as const,
              }),
              observedAt: sealRequest.observedAt,
            })
          : null;
      const material = await runtime.execute({
        binding,
        outerStage,
        program,
        nativeSourceReceipt,
        hostedResourceContext,
        readinessOwnerInstanceId:
          hostedResourceContext?.providerResourceReadRequest
            .readerOwnerInstanceId ?? null,
        callbackLocalProviderStateHandle,
        stateVaultResolveRequest,
        stateVaultResolveReceipt,
        vaultOwnerInstanceId:
          stateVaultResolveReceipt === null
            ? null
            : 'vault-owner.shared-effect-runtime.test',
        vaultHealthDigest:
          stateVaultResolveReceipt === null
            ? null
            : digestAgentCanonicalValue({ vault: 'healthy' }),
        ...(sealRequest && sealReceipt && stateVaultResolveRequest
          ? {
              async completeStateLifecycle() {
                const requestedAt = new Date(
                  Date.parse(NOW) + 20
                ).toISOString();
                const retireRequest =
                  createAgentNativeProviderStateVaultRetireRequest({
                    sealRequest,
                    sealReceipt,
                    resolveRequest: stateVaultResolveRequest,
                    resolveReceipt: stateVaultResolveReceipt!,
                    disposition: 'consumed',
                    requestedAt,
                  });
                const retirementReceipt =
                  createAgentNativeProviderStateVaultRetirementReceipt(
                    retireRequest,
                    sealRequest,
                    sealReceipt,
                    {
                      status: 'retired',
                      stateKeyDestructionReceiptDigest:
                        digestAgentCanonicalValue({ key: 'destroyed' }),
                      opaqueRecordDeletionReceiptDigest:
                        digestAgentCanonicalValue({ record: 'deleted' }),
                      retiredAt: requestedAt,
                    }
                  );
                return Object.freeze({
                  stateVaultRetireRequest: retireRequest,
                  stateVaultRetirementReceipt: retirementReceipt,
                  nextStateVaultSealRequest: null,
                  nextStateVaultSealReceipt: null,
                  sealedAt: requestedAt,
                });
              },
            }
          : {}),
      });
      expect(material).toBeDefined();
      expect(executionBudgetReservationIds).toHaveLength(1);
      if (!persistedExecutionRecord || !persistedStageRecord) {
        throw new TypeError('Provider runtime journal fixture was not sealed.');
      }
      return Object.freeze({
        budgetReservationId: executionBudgetReservationIds[0]!,
        executionRecord: persistedExecutionRecord,
        stageRecord: persistedStageRecord,
        program,
        intent: toolInput.preEffectIntent,
      });
    };

    const nonHosted = await execute(backgroundFixture, null);
    expect(nonHosted.budgetReservationId).toBe(
      'budget-reservation.shared-effect-owner.test'
    );

    const hostedToolInput = sharedToolInput(
      'request.shared-effect-budget.hosted-context',
      hostedRetrievalFixture
    );
    const hostedAuthority =
      hostedToolInput.preEffectIntent.runtimeFactSourceAuthority;
    const registrationIntents: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntent[] =
      Object.freeze(
        plan.capabilityQualificationTargets.flatMap((target) => {
          const source =
            target.optionalCapabilitySupportAuthority
              ?.runtimeFactSourceAuthority;
          if (
            !source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
            (source.protocolFamily !== 'openai-responses' &&
              source.protocolFamily !== 'gemini-interactions') ||
            (source.capabilityProfileId !==
              'g4-provider-hosted-retrieval-core' &&
              source.capabilityProfileId !==
                'g4-provider-hosted-retrieval-document')
          ) {
            return [];
          }
          const program = createAgentCapabilityProbeProgram({
            capabilityProfileId: source.capabilityProfileId,
            capabilityProfileDigest: source.capabilityProfileDigest,
          });
          return [
            createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
              providerConfigurationId: source.providerConfigurationId,
              providerConfigurationDigest: target.providerIdentityDigest,
              protocolFamily: source.protocolFamily,
              modelId: source.modelId,
              modelLineageDigest: source.modelLineageDigest,
              adapterDigest: source.adapterDigest,
              capabilityProfileId: source.capabilityProfileId,
              capabilityProfileDigest: source.capabilityProfileDigest,
              probeProgramDigest: program.programDigest,
              publicResourceDescriptorDigest:
                program.providerRequestIntent.publicProbeResource!
                  .descriptorDigest,
            }),
          ];
        })
      );
    const frozenRunDigest = digestAgentCanonicalValue({ frozen: 'run' });
    const runConfigArtifactBindingDigest = digestAgentCanonicalValue({
      runConfig: 'artifact',
    });
    const exact4 = createAgentHostedRetrievalRuntimeResourceExact4Fixture({
      namespaceId,
      repositoryCommit: plan.repositoryCommit,
      planDigest: plan.planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      runtimeResourceSetId: 'runtime-resource-set.shared-effect-budget.test',
      registeredAt: new Date(Date.parse(NOW) - 60_000).toISOString(),
      expiresAt: new Date(Date.parse(NOW) + 86_400_000).toISOString(),
      registrationIntents,
    });
    const registrationResult = exact4.registrationResults.find(
      ({ authority }) =>
        authority.protocolFamily === hostedAuthority.protocolFamily &&
        authority.capabilityProfileId === hostedAuthority.capabilityProfileId &&
        authority.providerConfigurationId ===
          hostedAuthority.providerConfigurationId
    );
    if (!registrationResult) {
      throw new TypeError('Hosted budget resource fixture is unavailable.');
    }
    const registrationSetLookupRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        namespaceId,
        repositoryCommit: plan.repositoryCommit,
        planDigest: plan.planDigest,
        frozenRunDigest,
        runConfigArtifactBindingDigest,
        registrationIntentBindings: registrationIntents.map((intent) =>
          Object.freeze({
            protocolFamily: intent.protocolFamily,
            capabilityProfileId: intent.capabilityProfileId,
            registrationIntentDigest: intent.intentDigest,
          })
        ),
        requestedAt: NOW,
      });
    const registrationSetLookupReceipt =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
        registrationSetLookupRequest,
        exact4.registrationResults,
        {
          lookupAuthorityIssuerId: 'backend.hosted-runtime-registration-set',
          lookupAuthorityImplementationDigest: digestAgentCanonicalValue({
            implementation: 'lookup',
          }),
          lookupLedgerRevision: 1,
          checkedAt: NOW,
          expiresAt,
        }
      );
    const providerResourceReadRequest =
      createAgentHostedRetrievalRuntimeResourceReadRequest({
        namespaceId,
        repositoryCommit: plan.repositoryCommit,
        planDigest: plan.planDigest,
        runConfigArtifactBindingDigest,
        runtimeResourceSetId: registrationSetLookupReceipt.runtimeResourceSetId,
        authorityDigest: registrationResult.authority.authorityDigest,
        resourceSetCommitmentDigest:
          exact4.resourceSetCommitment.commitmentDigest,
        readerOwnerInstanceId: 'hosted-reader.shared-effect-budget.test',
        readLeaseId: 'hosted-read-lease.shared-effect-budget.test',
        minimumExpiresAt: new Date(Date.parse(NOW) + 155_000).toISOString(),
      });
    const readExpiresAt = new Date(Date.parse(NOW) + 155_000).toISOString();
    const activeState = createAgentHostedRetrievalRuntimeResourceActiveState(
      registrationResult.authority,
      exact4.resourceSetCommitment,
      {
        activeOwnerInstanceId:
          providerResourceReadRequest.readerOwnerInstanceId,
        claimGeneration: 1,
        readLeaseNotAfter: readExpiresAt,
        updatedAt: NOW,
      }
    );
    const providerResourceReadReceipt =
      createAgentHostedRetrievalRuntimeResourceReadReceipt(
        providerResourceReadRequest,
        registrationResult.authority,
        exact4.resourceSetCommitment,
        {
          activeState,
          checkedAt: NOW,
          expiresAt: readExpiresAt,
        }
      );
    const hostedResourceContext = Object.freeze({
      registrationSetLookupRequest,
      registrationSetLookupReceipt,
      registrationResult,
      providerResourceSetCommitment: exact4.resourceSetCommitment,
      providerResourceAuthority: registrationResult.authority,
      providerResourceReadRequest,
      providerResourceReadReceipt,
    });
    const hosted = await execute(hostedRetrievalFixture, hostedResourceContext);
    expect(hosted.budgetReservationId).toBe(
      registrationResult.authority.budgetReservationAuthority.reservationId
    );
    expect(hosted.budgetReservationId).not.toBe(
      hostedToolInput.budgetReservationId
    );
    const originalExecution = hosted.executionRecord.executionReceipt;
    const {
      format: _dispatchFormat,
      version: _dispatchVersion,
      intentDigest: _dispatchDigest,
      ...dispatchInput
    } = originalExecution.dispatchIntent;
    const foreignDispatch = createAgentEvaluationTransportDispatchIntent({
      ...dispatchInput,
      budgetReservationId: 'budget-reservation.foreign-hosted-resource',
    });
    const {
      format: _transportFormat,
      version: _transportVersion,
      receiptDigest: _transportDigest,
      ...transportInput
    } = originalExecution.transportReceipt;
    const foreignTransport = createAgentEvaluationTransportReceipt({
      ...transportInput,
      dispatchIntentDigest: foreignDispatch.intentDigest,
    });
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        hosted.program,
        hosted.intent,
        hosted.stageRecord.stageRequest,
        {
          requestProjection: originalExecution.requestProjection,
          cacheWarmAuthority: originalExecution.cacheWarmAuthority,
          dispatchIntent: foreignDispatch,
          transportReceipt: foreignTransport,
          resultSpoolReceipt: originalExecution.resultSpoolReceipt,
          responseProjection: originalExecution.responseProjection,
          pollSequence: originalExecution.pollSequence,
          priorExecutionReceipt: null,
          executedAt: originalExecution.executedAt,
        }
      )
    ).toThrow(
      'Capability effect Provider execution transport binding drifted.'
    );
  }, 30_000);

  it('keeps hosted retrieval unavailable without a real Provider resource query owner', async () => {
    const root = await temporaryRoot();
    let healthCalls = 0;
    const concreteExecutor =
      createProductionAgentEvaluationSharedEffectExecutor({
        template: qualificationTemplate,
        environment: (name) =>
          name === 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL'
            ? 'http://127.0.0.1:8790'
            : undefined,
        forbiddenCanaries: () => Object.freeze([]),
        fetch: async () => {
          healthCalls += 1;
          return new Response(null, { status: 204 });
        },
        clock: () => new Date(NOW),
      });
    const owner = await createFileProductionAgentEvaluationSharedEffectOwner({
      stateDirectory: root,
      executor: concreteExecutor,
      expectedSourceIdentities: qualificationSourceIdentities(),
      forbiddenCanaries: () => Object.freeze([]),
      allowTemporaryStateDirectory: true,
      clock: () => new Date(NOW),
    });
    const targetRef =
      hostedRetrieval.material.expectedAuthority.exactTargetRefs[0]!;
    const planAuthority = plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === hostedRetrieval.descriptor.targetId
    )?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    const productionProtocolFamily = planAuthority?.protocolFamily;
    if (
      !productionProtocolFamily ||
      !(
        [
          'anthropic-messages',
          'gemini-interactions',
          'openai-responses',
        ] as const
      ).includes(
        productionProtocolFamily as AgentProductionEvaluationNativeProtocolFamily
      )
    ) {
      throw new TypeError(
        'Production hosted retrieval protocol is unavailable.'
      );
    }
    const productionAuthority = Object.values(
      productionConfig.qualificationAuthorityBundle
        .runtimeFactSourceAuthorities[
        productionProtocolFamily as AgentProductionEvaluationNativeProtocolFamily
      ]
    ).find(
      ({ capabilityProfileId }) =>
        capabilityProfileId === planAuthority.capabilityProfileId
    );
    if (!productionAuthority) {
      throw new TypeError(
        'Production hosted retrieval source authority is unavailable.'
      );
    }
    const request = ownerRequest(
      sharedToolInput(targetRef, hostedRetrievalFixture, productionAuthority)
    );
    await owner.observationSource.stage(request);
    await expect(owner.observationSource.resolve(request)).rejects.toThrow(
      'effect-result-unavailable'
    );

    const retrievalIdentity = qualificationSourceIdentities().find(
      ({ capabilityProfileId, protocolFamily }) =>
        capabilityProfileId ===
          (request.payload as SharedEffectToolInput).preEffectIntent
            .runtimeFactSourceAuthority.capabilityProfileId &&
        protocolFamily ===
          (request.payload as SharedEffectToolInput).preEffectIntent
            .runtimeFactSourceAuthority.protocolFamily
    )!;
    await expect(
      owner.healthRegistry.sealReadyHealth(
        registrationLookup(retrievalIdentity)
      )
    ).resolves.toBeUndefined();
    expect(healthCalls).toBe(1);
    await owner.observationSource.close();
  });

  it('uses a bounded live owner health proof to seal the longer plan registration window', async () => {
    const retrievalIdentity = qualificationSourceIdentities().find(
      ({ capabilityId }) => capabilityId === 'provider.hosted-retrieval'
    )!;
    const healthInput = sharedEffectHealthInput(
      retrievalIdentity,
      24 * 60 * 60 * 1_000
    );
    let overlong = false;
    const hostedOwner = Object.freeze({
      lifecycle: 'provider-resource-query-ingress-before-response' as const,
      async execute() {
        return undefined;
      },
      async checkReadiness(
        input: AgentEvaluationProductionSharedEffectHealthInput
      ) {
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
          ownerKind: 'hosted-retrieval-resource' as const,
          sourceIdentityDigest: digestAgentCanonicalValue(input.sourceIdentity),
          status: 'ready' as const,
          readinessMode: 'active-resource' as const,
          registrationSetLookupRequestDigest: digestAgentCanonicalValue({
            hosted: 'lookup-request',
          }),
          registrationSetLookupReceiptDigest: digestAgentCanonicalValue({
            hosted: 'lookup-receipt',
          }),
          registrationResultDigest: digestAgentCanonicalValue({
            hosted: 'registration-result',
          }),
          resourceSetCommitmentDigest: digestAgentCanonicalValue({
            hosted: 'set-commitment',
          }),
          resourceAuthorityDigest: digestAgentCanonicalValue({
            hosted: 'authority',
          }),
          resourceReadRequestDigest: digestAgentCanonicalValue({
            hosted: 'read-request',
          }),
          resourceReadReceiptDigest: digestAgentCanonicalValue({
            hosted: 'read-receipt',
          }),
          activeStateDigest: digestAgentCanonicalValue({
            hosted: 'active-state',
          }),
          providerTransportHealthDigest: digestAgentCanonicalValue({
            hosted: 'transport-health',
          }),
          checkedAt: NOW,
          expiresAt: new Date(
            Date.parse(NOW) + 125_000 + (overlong ? 1 : 0)
          ).toISOString(),
        });
        return Object.freeze({
          ...base,
          healthDigest: digestAgentCanonicalValue(base),
        });
      },
      async close() {
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      },
    });
    const concreteExecutor =
      createProductionAgentEvaluationSharedEffectExecutor({
        template: qualificationTemplate,
        environment: (name) =>
          name === 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL'
            ? 'http://127.0.0.1:8790'
            : undefined,
        forbiddenCanaries: () => Object.freeze([]),
        hostedOwner,
        fetch: async () => new Response(null, { status: 204 }),
        clock: () => new Date(NOW),
      });

    await expect(concreteExecutor.checkReadiness(healthInput)).resolves.toEqual(
      expect.objectContaining({
        checkedAt: NOW,
        expiresAt: healthInput.lookup.minimumExpiresAt,
      })
    );
    overlong = true;
    await expect(
      concreteExecutor.checkReadiness(healthInput)
    ).resolves.toBeUndefined();
    await expect(concreteExecutor.close()).resolves.toEqual(
      expect.objectContaining({ status: 'clean' })
    );
  });

  it('keeps stateful source health unavailable without a callback-bound vault owner', async () => {
    const concreteExecutor =
      createProductionAgentEvaluationSharedEffectExecutor({
        template: qualificationTemplate,
        environment: (name) =>
          name === 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL'
            ? 'http://127.0.0.1:8790'
            : undefined,
        forbiddenCanaries: () => Object.freeze([]),
        fetch: async () => new Response(null, { status: 204 }),
        clock: () => new Date(NOW),
      });
    const root = await temporaryRoot();
    const owner = await createFileProductionAgentEvaluationSharedEffectOwner({
      stateDirectory: root,
      executor: concreteExecutor,
      expectedSourceIdentities: qualificationSourceIdentities(),
      forbiddenCanaries: () => Object.freeze([]),
      allowTemporaryStateDirectory: true,
      clock: () => new Date(NOW),
    });
    const statefulIdentity = qualificationSourceIdentities().find(
      ({ capabilityId }) => capabilityId === 'provider.background-job'
    )!;
    await expect(
      owner.healthRegistry.sealReadyHealth(registrationLookup(statefulIdentity))
    ).resolves.toBeUndefined();
    await owner.observationSource.close();
  });

  it('keeps metadata source membership unavailable without live Provider transport health', async () => {
    const root = await temporaryRoot();
    const concreteExecutor =
      createProductionAgentEvaluationSharedEffectExecutor({
        template: qualificationTemplate,
        environment: (name) =>
          name === 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL'
            ? 'http://127.0.0.1:8790'
            : undefined,
        forbiddenCanaries: () => Object.freeze([]),
        fetch: async () => new Response(null, { status: 204 }),
        clock: () => new Date(NOW),
      });
    const owner = await createFileProductionAgentEvaluationSharedEffectOwner({
      stateDirectory: root,
      executor: concreteExecutor,
      expectedSourceIdentities: qualificationSourceIdentities(),
      forbiddenCanaries: () => Object.freeze([]),
      allowTemporaryStateDirectory: true,
      clock: () => new Date(NOW),
    });
    const cacheIdentity = qualificationSourceIdentities().find(
      ({ capabilityId }) => capabilityId === 'provider.isolated-cache'
    )!;

    await expect(
      owner.healthRegistry.sealReadyHealth(registrationLookup(cacheIdentity))
    ).resolves.toBeUndefined();
    await owner.observationSource.close();
  });

  it('admits cache readiness through the dedicated cold and warm runtime owner', async () => {
    const root = await temporaryRoot();
    let readinessCount = 0;
    let closeCount = 0;
    const metadataOwner = Object.freeze({
      lifecycle: 'native-provider-transport-metadata-source' as const,
      async execute() {
        return undefined;
      },
      async checkReadiness(
        input: AgentEvaluationProductionSharedEffectHealthInput
      ) {
        readinessCount += 1;
        const base = Object.freeze({
          format:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
          version:
            AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
          ownerKind: 'provider-metadata-transport' as const,
          sourceIdentityDigest: digestAgentCanonicalValue(input.sourceIdentity),
          status: 'ready' as const,
          checkedAt: NOW,
          expiresAt: input.lookup.minimumExpiresAt,
        });
        return Object.freeze({
          ...base,
          healthDigest: digestAgentCanonicalValue(base),
        });
      },
      async close() {
        closeCount += 1;
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      },
    });
    const concreteExecutor =
      createProductionAgentEvaluationSharedEffectExecutor({
        template: qualificationTemplate,
        environment: (name) =>
          name === 'PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL'
            ? 'http://127.0.0.1:8790'
            : undefined,
        forbiddenCanaries: () => Object.freeze([]),
        metadataOwner,
        fetch: async () => new Response(null, { status: 204 }),
        clock: () => new Date(NOW),
      });
    const owner = await createFileProductionAgentEvaluationSharedEffectOwner({
      stateDirectory: root,
      executor: concreteExecutor,
      expectedSourceIdentities: qualificationSourceIdentities(),
      forbiddenCanaries: () => Object.freeze([]),
      allowTemporaryStateDirectory: true,
      clock: () => new Date(NOW),
    });
    const cacheIdentity = qualificationSourceIdentities().find(
      ({ capabilityId }) => capabilityId === 'provider.isolated-cache'
    )!;

    await expect(
      owner.healthRegistry.sealReadyHealth(registrationLookup(cacheIdentity))
    ).resolves.toEqual(expect.objectContaining({ status: 'ready' }));
    expect(readinessCount).toBe(1);
    await expect(owner.observationSource.close()).resolves.toEqual(
      expect.objectContaining({ status: 'clean' })
    );
    expect(closeCount).toBe(1);
  });

  it('checks the exact purpose-bound vault health before Provider stateful transport readiness', async () => {
    const expectedVaultAuthority =
      qualificationTemplate.nativeProviderStateVaultEncryption.authority;
    const identity = qualificationSourceIdentities().find(
      ({ capabilityId }) => capabilityId === 'provider.background-job'
    )!;
    const healthInput = sharedEffectHealthInput(identity);
    let vaultHealth:
      | Awaited<
          ReturnType<
            import('./productionNativeProviderStateVaultHealthClient').AgentEvaluationProductionNativeProviderStateVaultHealthReader['readHealth']
          >
        >
      | undefined;
    let providerReadinessCount = 0;
    const statefulOwner =
      createProductionAgentEvaluationSharedEffectStatefulOwner({
        expectedVaultAuthority,
        stateVaultFor() {
          throw new TypeError('Unexpected state-vault execution port read.');
        },
        stateVaultHealth: Object.freeze({
          authority: expectedVaultAuthority,
          async readHealth() {
            return vaultHealth;
          },
        }),
        transport: Object.freeze({
          authorityKind:
            'production-native-provider-state-shared-effect' as const,
          readinessAuthority: 'state-vault-and-provider-effect-owner' as const,
          async execute() {
            throw new TypeError('Unexpected Provider effect execution.');
          },
          async checkReadiness(input) {
            providerReadinessCount += 1;
            const base = Object.freeze({
              format:
                AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
              version:
                AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
              ownerKind: 'provider-state-vault' as const,
              sourceIdentityDigest: digestAgentCanonicalValue(
                input.sourceIdentity
              ),
              status: 'ready' as const,
              checkedAt: NOW,
              expiresAt: input.lookup.minimumExpiresAt,
            });
            return Object.freeze({
              ...base,
              healthDigest: digestAgentCanonicalValue(base),
            });
          },
          async close() {
            return Object.freeze({
              status: 'clean' as const,
              residualResourceIds: Object.freeze([]) as readonly [],
              residualCanaryIds: Object.freeze([]) as readonly [],
            });
          },
        }),
        forbiddenCanaries: () => Object.freeze([]),
        clock: () => new Date(NOW),
      });

    await expect(statefulOwner.checkReadiness(healthInput)).resolves.toBe(
      undefined
    );
    expect(providerReadinessCount).toBe(0);

    const healthBase = Object.freeze({
      format:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
      version:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
      authority: expectedVaultAuthority,
      vaultOwnerInstanceId: 'run.123.attempt.1.shard.0',
      status: 'ready' as const,
      maximumRecords:
        PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
      sealedRecordCount: 1,
      activeEncryptedRecordCount: 1,
      retiredRecordCount: 0,
      retirementCounts: Object.freeze({
        cancelled: 0,
        consumed: 0,
        expired: 0,
      }),
      overdueActiveRecordCount: 0,
      forcedExpiryTombstoneCount: 0,
      checkedAt: NOW,
    });
    const forcedExpiryHealthBase = Object.freeze({
      ...healthBase,
      status: 'unavailable' as const,
      sealedRecordCount: 2,
      forcedExpiryTombstoneCount: 1,
    });
    vaultHealth = Object.freeze({
      ...forcedExpiryHealthBase,
      healthDigest: digestAgentCanonicalValue(forcedExpiryHealthBase),
    });
    await expect(statefulOwner.checkReadiness(healthInput)).resolves.toBe(
      undefined
    );
    expect(providerReadinessCount).toBe(0);

    vaultHealth = Object.freeze({
      ...healthBase,
      healthDigest: digestAgentCanonicalValue(healthBase),
    });

    await expect(statefulOwner.checkReadiness(healthInput)).resolves.toEqual(
      expect.objectContaining({
        ownerKind: 'provider-state-vault',
        sourceIdentityDigest: digestAgentCanonicalValue(identity),
      })
    );
    expect(providerReadinessCount).toBe(1);
    await expect(statefulOwner.close()).resolves.toEqual(
      expect.objectContaining({ status: 'clean' })
    );
  });

  it.each([
    { loseRetirementAck: false, effectFails: false },
    { loseRetirementAck: true, effectFails: false },
    { loseRetirementAck: false, effectFails: true },
    { loseRetirementAck: true, effectFails: true },
  ])(
    'retires one resolved Provider state as consumed before return (ACK loss=$loseRetirementAck, effect failure=$effectFails)',
    async ({ loseRetirementAck, effectFails }) => {
      const toolInput = sharedToolInput();
      const runtimeAuthority =
        toolInput.preEffectIntent.runtimeFactSourceAuthority;
      const {
        registrationReceiptDigest: _registrationReceiptDigest,
        authorityDigest: _authorityDigest,
        ...sourceIdentity
      } = runtimeAuthority;
      const binding: AgentEvaluationProductionSharedEffectBinding =
        Object.freeze({
          authorityRequestDigest: digestAgentCanonicalValue({
            stateful: toolInput.preEffectIntent.ownerRequestDigest,
          }),
          toolInput,
          sourceIdentity: Object.freeze(sourceIdentity),
          sourceIdentityDigest: digestAgentCanonicalValue(sourceIdentity),
        });
      const stage = createAgentEvaluationProductionSharedEffectStage(
        binding,
        NOW
      );
      const inputAuthority = toolInput.preEffectIntent.inputAuthorityBinding;
      const sealRequest = inputAuthority.stateVaultSealRequest;
      const sealReceipt = inputAuthority.stateVaultSealReceipt;
      if (!sealRequest || !sealReceipt) {
        throw new TypeError('Stateful source seal fixture is unavailable.');
      }
      if (
        runtimeAuthority.capabilityProfileId !== 'g4-provider-background-job'
      ) {
        throw new TypeError('Stateful source program fixture is unavailable.');
      }
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId: runtimeAuthority.capabilityProfileId,
        capabilityProfileDigest: runtimeAuthority.capabilityProfileDigest,
      });
      const nativeSourceReceipt =
        createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
          protocolFamily: sealRequest.protocolFamily,
          capabilityProfileDigest: runtimeAuthority.capabilityProfileDigest,
          invocationId: sealRequest.invocationId,
          requestDigest: sealRequest.requestDigest,
          responseDigest: sealRequest.responseDigest,
          providerConfigurationId: sealRequest.providerConfigurationId,
          modelLineageDigest: sealRequest.modelLineageDigest,
          adapterDigest: sealRequest.adapterDigest,
          executionIdentityAuthority:
            createAgentNativeProviderExecutionIdentityAuthority({
              invocationId: sealRequest.invocationId,
              taskId: sealRequest.taskId,
              runId: sealRequest.runId,
              generation: sealRequest.generation,
            }),
          source: Object.freeze({
            sourceKind: 'provider-job-active-status' as const,
            providerStateReferenceDigest:
              sealRequest.providerStateReferenceDigest,
            opaqueProviderStateRef: sealReceipt.opaqueProviderStateRef!,
            stateVaultAuthorityDigest: sealRequest.authorityDigest,
            stateVaultSealRequestDigest: sealRequest.sealRequestDigest,
            stateVaultSealReceiptDigest: sealReceipt.receiptDigest,
            taskId: sealRequest.taskId,
            runId: sealRequest.runId,
            generation: sealRequest.generation,
            providerStatus: 'in-progress' as const,
          }),
          observedAt: sealRequest.observedAt,
        });
      let retireRequest:
        | Parameters<AgentNativeProviderStateVaultPort['retire']>[0]['request']
        | undefined;
      let effectCalls = 0;
      let closeCalls = 0;
      const stateVault: AgentNativeProviderStateVaultPort = Object.freeze({
        authority:
          qualificationTemplate.nativeProviderStateVaultEncryption.authority,
        seal() {
          throw new TypeError('Unexpected state-vault seal.');
        },
        resolve() {
          return Object.freeze({
            status: 'resolved' as const,
            callbackLocalProviderStateHandle:
              'response.shared-effect-owner.source',
            resolvedAt: NOW,
          });
        },
        retire({ request }) {
          retireRequest = request;
          if (loseRetirementAck) {
            throw new TypeError('simulated-retirement-ack-loss');
          }
          return Object.freeze({
            status: 'retired' as const,
            stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
              stateful: 'key-destroyed',
            }),
            opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
              stateful: 'record-deleted',
            }),
            retiredAt: NOW,
          });
        },
        lookupRetirementReceipt(retireRequestDigest) {
          if (!loseRetirementAck) return null;
          if (
            !retireRequest ||
            retireRequest.retireRequestDigest !== retireRequestDigest
          ) {
            throw new TypeError('Retirement lookup binding drifted.');
          }
          return createAgentNativeProviderStateVaultRetirementReceipt(
            retireRequest,
            sealRequest,
            sealReceipt,
            {
              status: 'retired',
              stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
                stateful: 'key-destroyed',
              }),
              opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
                stateful: 'record-deleted',
              }),
              retiredAt: NOW,
            }
          );
        },
      });
      const statefulOwner =
        createProductionAgentEvaluationSharedEffectStatefulOwner({
          expectedVaultAuthority:
            qualificationTemplate.nativeProviderStateVaultEncryption.authority,
          stateVaultFor: () => stateVault,
          stateVaultHealth: Object.freeze({
            authority:
              qualificationTemplate.nativeProviderStateVaultEncryption
                .authority,
            async readHealth() {
              const healthBase = Object.freeze({
                format:
                  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
                version:
                  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
                authority:
                  qualificationTemplate.nativeProviderStateVaultEncryption
                    .authority,
                vaultOwnerInstanceId: 'vault-owner.shared-effect.test',
                status: 'ready' as const,
                maximumRecords:
                  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
                sealedRecordCount: 1,
                activeEncryptedRecordCount: 1,
                retiredRecordCount: 0,
                retirementCounts: Object.freeze({
                  cancelled: 0,
                  consumed: 0,
                  expired: 0,
                }),
                overdueActiveRecordCount: 0,
                forcedExpiryTombstoneCount: 0,
                checkedAt: NOW,
              });
              return Object.freeze({
                ...healthBase,
                healthDigest: digestAgentCanonicalValue(healthBase),
              });
            },
          }),
          forbiddenCanaries: () => Object.freeze([]),
          clock: () => new Date(NOW),
          transport: Object.freeze({
            authorityKind:
              'production-native-provider-state-shared-effect' as const,
            readinessAuthority:
              'state-vault-and-provider-effect-owner' as const,
            async execute({
              callbackLocalProviderStateHandle,
              completeStateLifecycle,
            }) {
              effectCalls += 1;
              expect(callbackLocalProviderStateHandle).toBe(
                'response.shared-effect-owner.source'
              );
              if (effectFails) {
                throw new TypeError('simulated-provider-effect-failure');
              }
              const completed = effectResult(binding, stage);
              const resultSpoolReceiptDigest =
                completed.effectSourceReceipt.resultSpoolReceiptDigest;
              if (
                !completed.effectSourceFact ||
                resultSpoolReceiptDigest === null
              ) {
                throw new TypeError('Stateful effect fact is unavailable.');
              }
              const requestMaterial =
                createAgentNativeProviderCapabilityRuntimeRequestMaterial(
                  program,
                  {
                    operation: 'background-poll',
                    protocolFamily: sealRequest.protocolFamily,
                    providerConfigurationId:
                      runtimeAuthority.providerConfigurationId,
                    modelId: runtimeAuthority.modelId,
                    modelLineageDigest: runtimeAuthority.modelLineageDigest,
                    adapterDigest: runtimeAuthority.adapterDigest,
                    callbackLocalBaseRequestBody: null,
                    callbackLocalProviderStateHandle,
                    providerResourceAuthority: null,
                    providerResourceReadRequest: null,
                    providerResourceReadReceipt: null,
                    cacheKeyDigest: null,
                    observedAt: NOW,
                  }
                );
              const response =
                decodeAgentNativeProviderCapabilityRuntimeResponse(
                  program,
                  requestMaterial.projection,
                  {
                    transportOutcome: 'failed',
                    httpStatus: null,
                    responseBodyDigest: null,
                    sealedResponseJson: null,
                    observedAt: NOW,
                  }
                );
              const lifecycle = await completeStateLifecycle({
                requestMaterial,
                response,
                executionStatus: 'failed',
              });
              return Object.freeze({
                businessResult: completed.businessResult,
                effectSourceFact: completed.effectSourceFact,
                providerRuntimeJournalResultRecordDigest:
                  completed.effectSourceReceipt
                    .providerRuntimeJournalResultRecordDigest,
                providerRuntimeResultSealReceiptDigest:
                  completed.effectSourceReceipt
                    .providerRuntimeResultSealReceiptDigest,
                transportReceiptDigest:
                  completed.effectSourceReceipt.transportReceiptDigest,
                resultSpoolReceiptDigest,
                normalizedEventSetDigest:
                  completed.effectSourceReceipt.normalizedEventSetDigest,
                stateVaultRetireRequest: lifecycle.stateVaultRetireRequest,
                stateVaultRetirementReceipt:
                  lifecycle.stateVaultRetirementReceipt,
                sealedAt: lifecycle.sealedAt,
              });
            },
            async checkReadiness() {
              return undefined;
            },
            async close() {
              closeCalls += 1;
              return Object.freeze({
                status: 'clean' as const,
                residualResourceIds: Object.freeze([]) as readonly [],
                residualCanaryIds: Object.freeze([]) as readonly [],
              });
            },
          }),
        });

      const execution = statefulOwner.execute({
        binding,
        stage,
        program,
        nativeSourceReceipt,
      });
      const material = effectFails
        ? await execution.catch((caught: unknown) => {
            expect(caught).toEqual(
              expect.objectContaining({
                message: 'simulated-provider-effect-failure',
              })
            );
            return undefined;
          })
        : await execution;

      expect(effectCalls).toBe(1);
      expect(retireRequest?.disposition).toBe('consumed');
      if (!effectFails) {
        expect(material?.stateVaultResolveReceipt?.status).toBe('resolved');
        expect(material?.stateVaultRetireRequest?.disposition).toBe('consumed');
        expect(material?.stateVaultRetirementReceipt?.disposition).toBe(
          'consumed'
        );
        expect(JSON.stringify(material)).not.toContain(
          'response.shared-effect-owner.source'
        );
      }
      await expect(statefulOwner.close()).resolves.toEqual(
        expect.objectContaining({ status: 'clean' })
      );
      expect(closeCalls).toBe(1);
    }
  );

  it('injects into the production attempt owner port and returns the sealed business result', async () => {
    const root = await temporaryRoot();
    const executorState = state();
    const owner = await createOwner(join(root, 'shared'), executorState);
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: join(root, 'attempt'),
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: owner.observationSource,
        allowTemporaryStateDirectory: true,
      });
    const payload = sharedToolInput('request.attempt-port');
    const request = ownerRequest(payload);
    await ports.providerCapability.stage(request);
    const response = (await ports.providerCapability.execute(
      request
    )) as ProductionCapabilityExecuteResponse;
    expect(response).toMatchObject({
      executionAuthorityKind: 'shared-effect',
      outcome: 'supported',
      result: {
        ownerRequestDigest: payload.preEffectIntent.ownerRequestDigest,
      },
      effectSourceFact: { factKind: 'provider-job-receipt' },
    });
    expect(executorState.executeCount).toBe(1);
    await expect(ports.close()).resolves.toMatchObject({ status: 'clean' });
    expect(executorState.closeCount).toBe(1);
  });

  it('seals a real effect once and reconciles both result and readiness from another host without execution', async () => {
    const root = await temporaryRoot();
    const firstState = state();
    const first = await createOwner(root, firstState);
    const request = ownerRequest(sharedToolInput());

    const stageDigest = await first.observationSource.stage(request);
    const observation = await first.observationSource.resolve(request);
    expect(observation).toMatchObject({
      sourceStageReceiptDigest: stageDigest,
      response: {
        executionAuthorityKind: 'shared-effect',
        outcome: 'supported',
        effectSourceFact: { factKind: 'provider-job-receipt' },
      },
    });
    expect(firstState.executeCount).toBe(1);

    const identity = expectedSourceIdentities().find(
      (candidate) =>
        candidate.protocolFamily ===
          (request.payload as SharedEffectToolInput).preEffectIntent
            .runtimeFactSourceAuthority.protocolFamily &&
        candidate.capabilityProfileId ===
          (request.payload as SharedEffectToolInput).preEffectIntent
            .runtimeFactSourceAuthority.capabilityProfileId
    )!;
    const lookup = registrationLookup(identity);
    const sealedHealth = await first.healthRegistry.sealReadyHealth(lookup);
    expect(sealedHealth).toMatchObject({
      status: 'ready',
      expectedIdentityDigest: lookup.expectedIdentityDigest,
      effectOwnerAuthorityId: identity.sourceAuthorityId,
      effectOwnerImplementationDigest:
        identity.sourceAuthorityImplementationDigest,
    });
    expect(firstState.readinessCount).toBe(1);

    const secondState = state({
      executeAvailable: false,
      readinessAvailable: false,
    });
    const second = await createOwner(root, secondState);
    const reconciled = await second.observationSource.reconcile(
      ownerRequest(request.payload as SharedEffectToolInput, 'reconcile')
    );
    expect(reconciled).toEqual(observation);
    expect(await second.healthRegistry.readSealedHealth(lookup)).toEqual(
      sealedHealth
    );
    expect(secondState.executeCount).toBe(0);
    expect(secondState.readinessCount).toBe(0);

    await expect(first.observationSource.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    await expect(second.observationSource.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    const files = await readdir(root, { recursive: true });
    expect(files.some((path) => String(path).endsWith('.tmp'))).toBe(false);
    expect(firstState.closeCount).toBe(1);
    expect(secondState.closeCount).toBe(1);
  });

  it('keeps an ambiguous claimed effect fail-closed and never executes during cross-host reconciliation', async () => {
    const root = await temporaryRoot();
    const firstState = state({ executeAvailable: false });
    const first = await createOwner(root, firstState);
    const request = ownerRequest(sharedToolInput('request.effect-unavailable'));
    await first.observationSource.stage(request);
    await expect(first.observationSource.resolve(request)).rejects.toThrow(
      'effect-result-unavailable'
    );
    expect(firstState.executeCount).toBe(1);

    const secondState = state();
    const second = await createOwner(root, secondState);
    await expect(
      second.observationSource.reconcile(
        ownerRequest(request.payload as SharedEffectToolInput, 'reconcile')
      )
    ).resolves.toBeUndefined();
    expect(secondState.executeCount).toBe(0);
    await first.observationSource.close();
    await second.observationSource.close();
  });

  it('rejects effect ACK swaps, readiness swaps, and persisted cross-request result swaps', async () => {
    const effectSwapRoot = await temporaryRoot();
    const effectSwap = state({
      mutateEffect: (value) =>
        Object.freeze({
          ...value,
          effectSourceReceipt: Object.freeze({
            ...value.effectSourceReceipt,
            dispatchAckDigest: digestAgentCanonicalValue({ swapped: 'ack' }),
          }) as AgentEvaluationCapabilityEffectSourceReceipt,
        }),
    });
    const effectOwner = await createOwner(effectSwapRoot, effectSwap);
    const effectRequest = ownerRequest(sharedToolInput('request.effect-swap'));
    await effectOwner.observationSource.stage(effectRequest);
    await expect(
      effectOwner.observationSource.resolve(effectRequest)
    ).rejects.toThrow('result-binding');
    await effectOwner.observationSource.close();

    const readinessSwapRoot = await temporaryRoot();
    const readinessSwap = state({
      mutateReadiness: (value) =>
        Object.freeze({
          ...value,
          routeBinding: 'owner.route.swapped',
        }),
    });
    const readinessOwner = await createOwner(readinessSwapRoot, readinessSwap);
    const identity = expectedSourceIdentities()[0]!;
    await expect(
      readinessOwner.healthRegistry.sealReadyHealth(
        registrationLookup(identity)
      )
    ).rejects.toThrow('owner-readiness-binding');
    await readinessOwner.observationSource.close();

    const persistedSwapRoot = await temporaryRoot();
    const persistedState = state();
    const persistedOwner = await createOwner(persistedSwapRoot, persistedState);
    const firstRequest = ownerRequest(
      sharedToolInput('request.persisted.first')
    );
    const secondRequest = ownerRequest(
      sharedToolInput('request.persisted.second')
    );
    await persistedOwner.observationSource.stage(firstRequest);
    await persistedOwner.observationSource.resolve(firstRequest);
    await persistedOwner.observationSource.stage(secondRequest);
    const resultsDirectory = join(
      persistedSwapRoot,
      'shared-effect-owner-v1',
      'results'
    );
    const firstResultPath = join(
      resultsDirectory,
      `${firstRequest.requestDigest.slice('sha256-'.length)}.json`
    );
    const secondResultPath = join(
      resultsDirectory,
      `${secondRequest.requestDigest.slice('sha256-'.length)}.json`
    );
    await copyFile(firstResultPath, secondResultPath);
    await expect(
      persistedOwner.observationSource.reconcile(
        ownerRequest(
          secondRequest.payload as SharedEffectToolInput,
          'reconcile'
        )
      )
    ).rejects.toThrow('result-binding');
    expect(persistedState.executeCount).toBe(1);
    await persistedOwner.observationSource.close();
  });

  it('rejects expired execution and health and requires all fifteen exact source identities', async () => {
    const root = await temporaryRoot();
    const lateClock = () => new Date(Date.parse(NOW) + 126_000);
    const lateState = state();
    const late = await createOwner(root, lateState, lateClock);
    await expect(
      late.observationSource.stage(
        ownerRequest(sharedToolInput('request.expired'))
      )
    ).rejects.toThrow('stage-binding');
    await expect(
      late.healthRegistry.sealReadyHealth(
        registrationLookup(expectedSourceIdentities()[0]!)
      )
    ).rejects.toThrow('owner-readiness-binding');
    expect(lateState.executeCount).toBe(0);
    await late.observationSource.close();

    const registry =
      await createFileProductionAgentEvaluationSharedEffectDurableRegistry({
        stateDirectory: await temporaryRoot(),
        executor: executor(state()),
        forbiddenCanaries: () => Object.freeze([]),
        allowTemporaryStateDirectory: true,
        clock: () => new Date(NOW),
      });
    expect(() =>
      createProductionAgentEvaluationSharedEffectOwner({
        expectedSourceIdentities: expectedSourceIdentities().slice(0, 14),
        registry,
        forbiddenCanaries: () => Object.freeze([]),
        clock: () => new Date(NOW),
      })
    ).toThrow('expected-identity-count');
    await registry.close();
  });

  it('bounds durable readiness to the exact fifteen production source identities', async () => {
    const root = await temporaryRoot();
    const executorState = state();
    const owner = await createOwner(root, executorState);
    const identities = expectedSourceIdentities();
    for (const identity of identities) {
      await expect(
        owner.healthRegistry.sealReadyHealth(registrationLookup(identity))
      ).resolves.toMatchObject({ status: 'ready' });
    }
    expect(executorState.readinessCount).toBe(15);
    await expect(
      owner.healthRegistry.sealReadyHealth(
        registrationLookup(identities[0]!, 60_001)
      )
    ).rejects.toThrow('readiness-capacity');
    expect(executorState.readinessCount).toBe(15);
    await owner.observationSource.close();
  });
});
