import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG,
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  createAgentEvaluationControlledToolExecutionOutput,
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentProviderEvent,
  createAgentProviderJob,
  createAgentProviderJobReceipt,
  createAgentModelEvaluationPlan,
  createAgentModelEvaluationThresholds,
  createAgentExternalSourceResult,
  createAgentRetrievalQueryReceipt,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityEffectToolArguments,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  getG4V8PublicEvaluationCaseMaterials,
  isAgentEvaluationControlledToolExecutionCapabilityFact,
  planAgentModelEvaluationAttempts,
  resolveAgentEvaluationCapabilityDescriptor,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationMetricObservation,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import type { AgentEvaluationAttemptGradingInput } from './attemptExecutor';
import {
  createAgentEvaluationFailedCapabilityExecutionReceipt,
  type AgentEvaluationCapabilityRuntimeAssessmentInput,
  type AgentEvaluationCapabilityRuntimeToolInput,
} from './capabilityRuntime';
import {
  PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
  createSealedProductionCapabilityAuthorityObservationSource,
  validateProductionCapabilityAuthorityObservation,
  validateProductionCapabilityAuthorityResponse,
  type ProductionCapabilityAuthorityObservation,
  type ProductionCapabilityAuthorityObservationSource,
  type ProductionCapabilityAssessmentResponse,
  type ProductionCapabilityExecuteResponse,
} from './productionCapabilityAuthority';
import {
  PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST,
  gradeProductionAgentEvaluationAttempt,
  validateProductionAttemptGradingResponse,
} from './productionAttemptGradingAuthority';
import { createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts } from './productionAttemptOwnerAuthorityPorts';
import {
  createAgentEvaluationTestStateVaultConsumedLifecycle,
  createAgentEvaluationTestStateVaultSeal,
} from './stateVault.fixture';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationAttemptAuthorityDispatchAckDigest,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';

const NOW = '2026-08-08T08:00:00.000Z';
const namespaceId = 'namespace.attempt-owner.test';
const shardLeaseOwnerId = 'worker.attempt-owner.test';
const grantSetDigest = digestAgentCanonicalValue({ grants: ['test'] });
const sourceAuthorityId = 'provider.lifecycle.observation.test';
const sourceImplementationDigest = digestAgentCanonicalValue({
  implementation: sourceAuthorityId,
});

const plan = createV8EvaluationPlan();
const materials = getG4V8PublicEvaluationCaseMaterials();
const descriptors = planAgentModelEvaluationAttempts(plan);

const caseFixture = (
  predicate: (
    candidate: AgentModelEvaluationPlan['concreteCases'][number]
  ) => boolean,
  protocolFamily?: 'openai-responses'
): Readonly<{
  material: AgentEvaluationCaseMaterial;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  concreteCase: AgentModelEvaluationPlan['concreteCases'][number];
  capabilityDescriptor: AgentModelEvaluationPlan['concreteCases'][number]['capabilityDescriptor'];
}> => {
  const concreteCase = plan.concreteCases.find(
    (candidate) =>
      predicate(candidate) &&
      materials.some(({ caseId }) => caseId === candidate.caseId)
  );
  if (!concreteCase)
    throw new Error('Required public case fixture is missing.');
  const material = materials.find(
    ({ caseId }) => caseId === concreteCase.caseId
  );
  const descriptor = descriptors.find(
    ({ caseId, capabilityDescriptorDigest, targetId }) =>
      caseId === concreteCase.caseId &&
      capabilityDescriptorDigest ===
        concreteCase.capabilityDescriptor.descriptorDigest &&
      (protocolFamily === undefined ||
        plan.capabilityQualificationTargets.some(
          (target) =>
            target.targetId === targetId &&
            target.protocolFamily === protocolFamily
        ))
  );
  if (!material || !descriptor) throw new Error('Attempt fixture is missing.');
  return Object.freeze({
    concreteCase,
    material,
    descriptor,
    capabilityDescriptor: concreteCase.capabilityDescriptor,
  });
};

const retrieval = caseFixture(({ capabilityDescriptor }) =>
  capabilityDescriptor.expectedToolIds.includes('provider.retrieval.search')
);
const background = caseFixture(
  ({ capabilityDescriptor }) =>
    capabilityDescriptor.expectedReceiptKinds.includes(
      'background-job-receipt'
    ),
  'openai-responses'
);
const parallel = caseFixture(
  ({ capabilityDescriptor }) =>
    capabilityDescriptor.capabilityId === 'provider.parallel-tool'
);
const optionalBlockedCaseFixture = () => {
  for (const target of plan.capabilityQualificationTargets) {
    const authority = target.optionalCapabilitySupportAuthority;
    if (!authority || authority.supportExpectation !== 'expected-blocked') {
      continue;
    }
    const concreteCase = plan.concreteCases.find(
      ({ capabilityProfileId, caseId }) =>
        capabilityProfileId === target.capabilityProfileId &&
        materials.some((material) => material.caseId === caseId)
    );
    if (!concreteCase) continue;
    const capabilityDescriptor = resolveAgentEvaluationCapabilityDescriptor(
      concreteCase,
      target
    );
    const descriptor = descriptors.find(
      ({ caseId, targetId, capabilityDescriptorDigest }) =>
        caseId === concreteCase.caseId &&
        targetId === target.targetId &&
        capabilityDescriptorDigest === capabilityDescriptor.descriptorDigest
    );
    const material = materials.find(
      ({ caseId }) => caseId === concreteCase.caseId
    );
    if (descriptor && material) {
      return Object.freeze({
        concreteCase,
        material,
        descriptor,
        capabilityDescriptor,
      });
    }
  }
  throw new Error('Optional expected-blocked fixture is missing.');
};

const blocked = optionalBlockedCaseFixture();

const retrievalObservationFact = (
  fixture: typeof retrieval | typeof background | typeof blocked,
  invocationId: string,
  requestDigest: CanonicalDigest
) => {
  const suffix = requestDigest.slice('sha256-'.length, 'sha256-'.length + 24);
  const external = createAgentExternalSourceResult({
    sourceResultId: `source-result.external-observation.${suffix}`,
    canonicalUrl: 'https://authority.invalid/observation/test',
    retrievedAt: NOW,
    contentDigest: digestAgentCanonicalValue({ content: 'observed' }),
    snapshotRef: `snapshot.external-observation.${suffix}`,
    providerCitationRef: `citation.external-observation.${suffix}`,
    availability: 'snapshotted',
  });
  return createAgentRetrievalQueryReceipt({
    queryId: `query.external-observation.${suffix}`,
    toolDescriptorDigest: fixture.capabilityDescriptor.descriptorDigest,
    queryDigest: digestAgentCanonicalValue({ requestDigest, invocationId }),
    purpose: 'authorized-project-retrieval',
    networkPolicyDigest: digestAgentCanonicalValue({ network: 'authority' }),
    sources: Object.freeze([external]),
    retrievalConfigurationDigest: fixture.capabilityDescriptor.descriptorDigest,
    usageRef: `usage.external-observation.${suffix}`,
    startedAt: NOW,
    completedAt: NOW,
  });
};

const providerCapabilityObservation = (
  fixture: ReturnType<typeof caseFixture>,
  invocationId: string,
  requestDigest: CanonicalDigest
): AgentEvaluationProviderCapabilityObservationReceipt => {
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === fixture.descriptor.targetId
  );
  const provider = plan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target?.providerConfigurationId
  );
  if (!target || !provider || target.protocolFamily === 'openai-compatible') {
    throw new Error('Native provider observation fixture is unavailable.');
  }
  const protocolFamily = target.protocolFamily as Exclude<
    typeof target.protocolFamily,
    'openai-compatible'
  >;
  const suffix = digestAgentCanonicalValue({
    descriptorDigest: fixture.descriptor.descriptorDigest,
    invocationId,
  }).slice('sha256-'.length, 'sha256-'.length + 24);
  const terminal = createAgentProviderEvent({
    eventId: `event.provider-capability.${suffix}`,
    invocationId,
    sequence: 1,
    type: 'completed',
    payloadDigest: digestAgentCanonicalValue({
      descriptorDigest: fixture.descriptor.descriptorDigest,
      terminal: 'completed',
    }),
    occurredAt: NOW,
  });
  const retrievalFact = fixture.capabilityDescriptor.expectedReceiptKinds.some(
    (receiptKind) =>
      receiptKind === 'retrieval-citation-receipt' ||
      receiptKind === 'source-freshness-receipt'
  )
    ? retrievalObservationFact(fixture, invocationId, requestDigest)
    : undefined;
  const providerJobFact =
    fixture.capabilityDescriptor.expectedReceiptKinds.includes(
      'background-job-receipt'
    )
      ? createAgentProviderJobReceipt(
          createAgentProviderJob({
            providerJobId: `job.provider-capability.${suffix}`,
            taskId: `task.provider-capability.${suffix}`,
            runId: `run.provider-capability.${suffix}`,
            generation: 1,
            invocationId,
            requestDigest,
          })
        )
      : undefined;
  const responseDigest = digestAgentCanonicalValue({
    descriptorDigest: fixture.descriptor.descriptorDigest,
    providerResponse: 'completed',
  });
  const dispatchIntentDigest = digestAgentCanonicalValue({
    descriptorDigest: fixture.descriptor.descriptorDigest,
    dispatch: invocationId,
  });
  const transportReceiptDigest = digestAgentCanonicalValue({
    descriptorDigest: fixture.descriptor.descriptorDigest,
    transport: invocationId,
  });
  const resultSpoolReceiptDigest = digestAgentCanonicalValue({
    descriptorDigest: fixture.descriptor.descriptorDigest,
    spool: invocationId,
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    eventDigests: [terminal.eventDigest],
    ...(retrievalFact
      ? { retrievalQueryReceiptDigest: retrievalFact.receiptDigest }
      : {}),
    ...(providerJobFact
      ? { providerJobReceiptDigest: providerJobFact.receiptDigest }
      : {}),
  });
  const facts = Object.freeze([
    Object.freeze({
      factKind: 'provider-event' as const,
      factDigest: terminal.eventDigest,
      value: terminal,
    }),
    ...(retrievalFact
      ? [
          Object.freeze({
            factKind: 'retrieval-query-receipt' as const,
            factDigest: retrievalFact.receiptDigest,
            value: retrievalFact,
          }),
        ]
      : []),
    ...(providerJobFact
      ? [
          Object.freeze({
            factKind: 'provider-job-receipt' as const,
            factDigest: providerJobFact.receiptDigest,
            value: providerJobFact,
          }),
        ]
      : []),
  ]);
  const sanitization = Object.freeze({
    protectedMaterialCanaries: Object.freeze([
      'protected-observation-canary-owner-test',
    ]),
    secretCanaries: Object.freeze(['secret-observation-canary-owner-test']),
  });
  const factAuthorities = Object.freeze(
    facts.map((fact) => {
      const native = fact.factKind === 'provider-event';
      const runtimeFactSourceAuthority =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      if (!native && !runtimeFactSourceAuthority) {
        throw new TypeError(
          'Shared provider observation fixture has no frozen source authority.'
        );
      }
      const envelope =
        createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
          {
            sourceAuthorityKind: native
              ? 'native-provider-transport'
              : 'shared-durable-capability',
            sourceAuthorityId: native
              ? target.providerConfigurationId
              : runtimeFactSourceAuthority!.sourceAuthorityId,
            sourceAuthorityImplementationDigest: native
              ? provider.adapter.adapterDigest
              : runtimeFactSourceAuthority!.sourceAuthorityImplementationDigest,
            ...(native
              ? {}
              : {
                  sourceKind: runtimeFactSourceAuthority!.sourceKind,
                  routeBinding: runtimeFactSourceAuthority!.routeBinding,
                  registrationAuthorityIssuerId:
                    runtimeFactSourceAuthority!.registrationAuthorityIssuerId,
                  registrationReceiptDigest:
                    runtimeFactSourceAuthority!.registrationReceiptDigest,
                  runtimeFactSourceAuthorityDigest:
                    runtimeFactSourceAuthority!.authorityDigest,
                }),
            stageDigest: native
              ? dispatchIntentDigest
              : digestAgentCanonicalValue({
                  descriptorDigest: fixture.descriptor.descriptorDigest,
                  factKind: fact.factKind,
                  stage: 'sealed',
                }),
            dispatchAckDigest: native
              ? transportReceiptDigest
              : digestAgentCanonicalValue({
                  descriptorDigest: fixture.descriptor.descriptorDigest,
                  factKind: fact.factKind,
                  dispatchAck: 'sealed',
                }),
            planDigest: plan.planDigest,
            repositoryCommit: plan.repositoryCommit,
            attemptId: fixture.descriptor.attemptId,
            descriptorDigest: fixture.descriptor.descriptorDigest,
            turnIndex: 0,
            invocationId,
            requestDigest,
            responseDigest,
            protocolFamily,
            providerConfigurationId: target.providerConfigurationId,
            modelLineageDigest: target.modelLineageDigest,
            adapterDigest: provider.adapter.adapterDigest,
            dispatchIntentDigest,
            transportReceiptDigest,
            resultSpoolReceiptDigest,
            normalizedEventSetDigest,
            observedAt: NOW,
            fact,
          },
          sanitization
        );
      return createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        envelope,
        sanitization
      );
    })
  );
  return createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: `observation.provider-capability.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: fixture.descriptor.attemptId,
      descriptorDigest: fixture.descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId,
      requestDigest,
      responseDigest,
      protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      facts,
      factAuthorities,
      observedAt: NOW,
    },
    sanitization
  );
};

type SharedEffectToolInput = Extract<
  AgentEvaluationCapabilityRuntimeToolInput,
  Readonly<{ executionAuthorityKind: 'shared-effect' }>
>;

const sharedEffectToolInput = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): SharedEffectToolInput => {
  if (input.executionAuthorityKind !== 'shared-effect') {
    throw new TypeError('Shared-effect tool input is required.');
  }
  return input;
};

const toolInput = (
  fixture = background,
  targetRef = 'request.external-observation.test'
): SharedEffectToolInput => {
  const turnIndex = 1;
  const invocationId = 'invocation.provider-capability.test';
  const toolId = fixture.capabilityDescriptor.expectedToolIds[0]!;
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === fixture.descriptor.targetId
  );
  const runtimeFactSourceAuthority =
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (!runtimeFactSourceAuthority) {
    throw new TypeError('Shared-effect fixture source authority is missing.');
  }
  const protocolFamily = runtimeFactSourceAuthority.protocolFamily;
  if (
    protocolFamily !== 'anthropic-messages' &&
    protocolFamily !== 'gemini-interactions' &&
    protocolFamily !== 'openai-responses'
  ) {
    throw new TypeError('Shared-effect fixture protocol is unsupported.');
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
      bindingKind: 'provider-job',
      capabilityId: 'provider.background-job',
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
  const requestDigest = digestAgentCanonicalValue({
    providerRequest: fixture.descriptor.descriptorDigest,
    requestRef: requestRefAuthority.requestRef,
  });
  const sourceProviderRequestDigest = digestAgentCanonicalValue({
    source: 'provider-request',
  });
  const sourceResponseDigest = digestAgentCanonicalValue({
    source: 'provider-response',
  });
  const stateVault = createAgentEvaluationTestStateVaultSeal({
    purpose: 'background-job-state',
    attemptId: fixture.descriptor.attemptId,
    protocolFamily: 'openai-responses',
    invocationId: 'invocation.provider-capability.source',
    requestDigest: sourceProviderRequestDigest,
    responseDigest: sourceResponseDigest,
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    capabilityProfileDigest: runtimeFactSourceAuthority.capabilityProfileDigest,
    taskId: 'task.provider-capability.source',
    runId: 'run.provider-capability.source',
    generation: 1,
    observedAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + 125_000).toISOString(),
  });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind: 'provider-job',
        capabilityId: 'provider.background-job',
        requestRef: requestRefAuthority.requestRef,
        targetRef,
        requestRefAuthority,
        requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
        sourceAttemptId: fixture.descriptor.attemptId,
        sourceTurnIndex: 0,
        sourceInvocationId: 'invocation.provider-capability.source',
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
        sourceObservationReceiptDigest: digestAgentCanonicalValue({
          source: 'provider-capability-observation',
        }),
        sourceFactKind: 'provider-job-receipt',
        sourceProviderEventType: null,
        sourceProviderToolCallId: null,
        sourceToolId: null,
        sourceArgumentsDigest: null,
        sourceHandleDigest: stateVault.sealRequest.providerStateReferenceDigest,
        stateVaultSealRequest: stateVault.sealRequest,
        stateVaultSealReceipt: stateVault.sealReceipt,
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
    toolCallId: 'tool-call.provider-capability.test',
    providerToolCallId: 'provider-tool-call.provider-capability.test',
    providerRequestDigest: requestDigest,
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
    toolCallId: 'tool-call.provider-capability.test',
    providerToolCallId: 'provider-tool-call.provider-capability.test',
    toolId,
    arguments: argumentsValue,
    argumentsDigest,
    requestDigest,
    executionAuthorityKind: 'shared-effect',
    budgetReservationId: 'budget-reservation.attempt-owner.test',
    preEffectIntent,
    maximumToolResultBytes: 65_536,
  });
};

const assessmentInput = (
  fixture: ReturnType<typeof caseFixture>
): AgentEvaluationCapabilityRuntimeAssessmentInput => {
  const terminalInvocationId = 'invocation.capability-assessment.test';
  const observation = providerCapabilityObservation(
    fixture,
    terminalInvocationId,
    digestAgentCanonicalValue({
      descriptorDigest: fixture.descriptor.descriptorDigest,
      assessment: 'terminal',
    })
  );
  return Object.freeze({
    namespaceId,
    shardLeaseOwnerId,
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
    plan,
    descriptor: fixture.descriptor,
    material: fixture.material,
    capabilityDescriptor: fixture.capabilityDescriptor,
    terminalTurnIndex: 0,
    terminalInvocationId,
    terminalStatus: 'completed',
    observedAt: NOW,
    providerCapabilityObservationReceipts: Object.freeze([observation]),
    capabilityToolExecutions: Object.freeze([]),
    controlledToolExecutionReceipts: Object.freeze([]),
  });
};

const parallelControlledReceipts = () =>
  Object.freeze(
    parallel.capabilityDescriptor.expectedToolIds.map((toolId, index) => {
      const argumentsValue = Object.freeze({
        operation: `parallel-${index + 1}`,
        toolId,
      });
      return createAgentEvaluationControlledToolExecutionOutput(
        {
          planDigest: plan.planDigest,
          attemptId: parallel.descriptor.attemptId,
          descriptorDigest: parallel.descriptor.descriptorDigest,
          caseId: parallel.material.caseId,
          materialDigest: parallel.material.materialDigest,
          loopPolicyDigest: plan.promptPolicyDigest,
          turnIndex: 0,
          toolCallId: `tool-call.parallel.${index + 1}`,
          toolId,
          arguments: argumentsValue,
          argumentsDigest: digestAgentCanonicalValue(argumentsValue),
          maximumToolResultBytes: 4_096,
        },
        {
          grantDigest: digestAgentCanonicalValue('parallel-grant'),
          toolRegistryDigest: digestAgentCanonicalValue(
            'parallel-tool-registry'
          ),
          toolDefinitionDigest: digestAgentCanonicalValue({ toolId }),
          inputSchemaDigest: digestAgentCanonicalValue({
            toolId,
            schema: 'parallel-test',
          }),
          generation: 1,
          idempotencyKey: `parallel.idempotency.${index + 1}`,
          operationIntentDigest: digestAgentCanonicalValue({
            toolId,
            operation: index + 1,
          }),
          status: 'succeeded',
          result: Object.freeze({ completed: true, toolId }),
          persistedArtifacts: Object.freeze([]),
          commandReceiptDigests: Object.freeze([]),
          transactionReceiptDigests: Object.freeze([]),
        }
      ).receipt;
    })
  );

const ownerRequest = (
  serviceKind: 'provider-capability' | 'attempt-grading',
  operation: 'tool.execute' | 'capability.assess' | 'grade-and-persist',
  descriptor: AgentModelEvaluationAttemptDescriptor,
  payload: unknown,
  mode: 'execute' | 'reconcile' = 'execute',
  authorityPlan: AgentModelEvaluationPlan = plan
): AgentEvaluationOwnerAuthorityRequest => {
  const providerCapabilityObservationReceipts =
    operation === 'tool.execute'
      ? (payload as AgentEvaluationCapabilityRuntimeToolInput)
          .executionAuthorityKind === 'observation-control'
        ? Object.freeze([
            (
              payload as Extract<
                AgentEvaluationCapabilityRuntimeToolInput,
                { executionAuthorityKind: 'observation-control' }
              >
            ).providerCapabilityObservationReceipt,
          ])
        : Object.freeze([])
      : operation === 'capability.assess'
        ? (payload as AgentEvaluationCapabilityRuntimeAssessmentInput)
            .providerCapabilityObservationReceipts
        : Object.freeze([]);
  const requestDigest = digestAgentCanonicalValue({
    serviceKind,
    operation,
    descriptorDigest: descriptor.descriptorDigest,
    payloadDigest: digestAgentCanonicalValue(payload),
  });
  const ownerImplementationDigest =
    serviceKind === 'provider-capability'
      ? PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST
      : PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST;
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind,
    mode,
    namespaceId,
    planDigest: authorityPlan.planDigest,
    repositoryCommit: authorityPlan.repositoryCommit,
    operation,
    routeBinding: `/v1/${serviceKind}/${operation}`,
    requestDigest,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId,
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        providerCapabilityObservationReceipts
      ),
    ownerImplementationDigest,
    claimGeneration: 1,
    payload,
  });
  return Object.freeze({
    ...base,
    stageDigest: createAgentEvaluationAttemptAuthorityDispatchStageDigest(
      base,
      ownerImplementationDigest
    ),
  });
};

const reconcileOwnerRequest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: unknown
): AgentEvaluationOwnerAuthorityRequest => {
  const base = Object.freeze({ ...request, mode: 'reconcile' as const });
  return Object.freeze({
    ...base,
    dispatchAckDigest: createAgentEvaluationAttemptAuthorityDispatchAckDigest(
      base,
      response,
      request.ownerImplementationDigest!
    ),
  });
};

const supportedResponse = (
  request: AgentEvaluationOwnerAuthorityRequest
): ProductionCapabilityExecuteResponse => {
  const input = sharedEffectToolInput(
    request.payload as AgentEvaluationCapabilityRuntimeToolInput
  );
  const result = Object.freeze({
    status: 'supported' as const,
    toolId: input.toolId,
    requestDigest: input.requestDigest,
    ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
  });
  const resultDigest = digestAgentCanonicalValue(result);
  const stateVaultSealRequest =
    input.preEffectIntent.inputAuthorityBinding.stateVaultSealRequest;
  const stateVaultSealReceipt =
    input.preEffectIntent.inputAuthorityBinding.stateVaultSealReceipt;
  if (!stateVaultSealRequest || !stateVaultSealReceipt) {
    throw new TypeError('Shared-effect state vault fixture is missing.');
  }
  const stateVaultLifecycle =
    createAgentEvaluationTestStateVaultConsumedLifecycle(
      Object.freeze({
        callbackLocalProviderStateHandle:
          'provider-state.invocation.provider-capability.source',
        sealRequest: stateVaultSealRequest,
        sealReceipt: stateVaultSealReceipt,
      }),
      {
        consumerAttemptId: input.attemptId,
        consumerInvocationId: input.invocationId,
        requestedAt: NOW,
      }
    );
  const providerJobFact = createAgentProviderJobReceipt(
    createAgentProviderJob({
      providerJobId: `job.shared-effect.${input.invocationId}`,
      taskId: stateVaultSealRequest.taskId,
      runId: stateVaultSealRequest.runId,
      generation: stateVaultSealRequest.generation,
      invocationId: input.invocationId,
      requestDigest: input.requestDigest,
    })
  );
  const effectSourceFact = Object.freeze({
    factKind: 'provider-job-receipt' as const,
    factDigest: providerJobFact.receiptDigest,
    value: providerJobFact,
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
      businessResultDigest: resultDigest,
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
      stageDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        stage: 'sealed',
      }),
      dispatchAckDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        dispatchAck: 'sealed',
      }),
      transportReceiptDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        transport: 'completed',
      }),
      resultSpoolReceiptDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        spool: 'sealed',
      }),
      normalizedEventSetDigest: digestAgentCanonicalValue({
        ownerRequestDigest: input.preEffectIntent.ownerRequestDigest,
        factDigest: effectSourceFact.factDigest,
      }),
      ...stateVaultLifecycle,
      specificReceiptDigests: Object.freeze([]),
      sealedAt: NOW,
    });
  return Object.freeze({
    executionAuthorityKind: 'shared-effect',
    outcome: 'supported',
    result,
    resultDigest,
    continuationReceiptDigest: digestAgentCanonicalValue({
      format: 'prodivix.agent-evaluation-provider-tool-continuation',
      version: 1,
      requestDigest: input.requestDigest,
      resultDigest,
      specificReceiptDigests: Object.freeze([]),
    }),
    effectSourceReceipt,
    effectSourceFact,
    specificReceipts: Object.freeze([]) as readonly [],
  });
};

type SourceState = {
  readonly observations: Map<string, ProductionCapabilityAuthorityObservation>;
  effectCount: number;
  resolveCount: number;
  reconcileCount: number;
};

const observationSource = (
  state: SourceState,
  crashAfterEffect = false
): ProductionCapabilityAuthorityObservationSource => {
  let shouldCrash = crashAfterEffect;
  return Object.freeze({
    sourceAuthorityId,
    sourceImplementationDigest,
    sourceDurability: 'shared-durable' as const,
    async stage(request: AgentEvaluationOwnerAuthorityRequest) {
      return digestAgentCanonicalValue({
        stage: request.requestDigest,
        sourceImplementationDigest,
      });
    },
    async resolve(request: AgentEvaluationOwnerAuthorityRequest) {
      state.resolveCount += 1;
      let observation = state.observations.get(request.requestDigest);
      if (!observation) {
        state.effectCount += 1;
        const observationBase = Object.freeze({
          sourceAuthorityId,
          sourceImplementationDigest,
          sourceDurability: 'shared-durable' as const,
          authorityRequestDigest: request.requestDigest,
          sourceStageReceiptDigest: digestAgentCanonicalValue({
            stage: request.requestDigest,
            sourceImplementationDigest,
          }),
          response: supportedResponse(request),
          observedAt: NOW,
        });
        observation = Object.freeze({
          ...observationBase,
          observationDigest: digestAgentCanonicalValue(observationBase),
        });
        state.observations.set(request.requestDigest, observation);
      }
      if (shouldCrash) {
        shouldCrash = false;
        throw new Error('simulated owner crash after durable effect');
      }
      return observation;
    },
    async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
      state.reconcileCount += 1;
      return state.observations.get(request.requestDigest);
    },
    async close() {
      return Object.freeze({
        status: 'clean' as const,
        residualResourceIds: Object.freeze([]) as readonly [],
        residualCanaryIds: Object.freeze([]) as readonly [],
      });
    },
  });
};

const emptyState = (): SourceState => ({
  observations: new Map(),
  effectCount: 0,
  resolveCount: 0,
  reconcileCount: 0,
});

const tempRoot = () => mkdtemp(join(tmpdir(), 'prodivix-attempt-owner-'));

const readAllStateText = async (root: string): Promise<string> => {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  };
  await visit(root);
  return (await Promise.all(files.map((path) => readFile(path, 'utf8')))).join(
    '\n'
  );
};

const gradingFixture = (): Readonly<{
  input: AgentEvaluationAttemptGradingInput;
  request: AgentEvaluationOwnerAuthorityRequest;
}> => {
  const fixture = retrieval;
  const metricDefinition = AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG.find(
    ({ metricId }) => metricId === 'invocation.count-receipt-completeness'
  );
  if (!metricDefinition) throw new Error('Grading metric fixture is missing.');
  const { planDigest: _planDigest, ...planBase } = plan;
  const gradingPlan = createAgentModelEvaluationPlan({
    ...planBase,
    thresholds: createAgentModelEvaluationThresholds({
      metrics: Object.freeze([
        Object.freeze({
          metricId: metricDefinition.metricId,
          requiredAuthority: 'deterministic' as const,
          maximumObservedFailureRate:
            metricDefinition.maximumObservedFailureRate,
          maximumUpperConfidenceBound:
            metricDefinition.maximumUpperConfidenceBound,
          minimumSampleCount: metricDefinition.minimumSampleCount,
        }),
      ]),
      multipleComparisonPolicyDigest:
        plan.thresholds.multipleComparisonPolicyDigest,
      slicePolicyDigest: plan.thresholds.slicePolicyDigest,
    }),
  });
  const gradingDescriptor = planAgentModelEvaluationAttempts(gradingPlan).find(
    ({ caseId, targetId }) =>
      caseId === fixture.descriptor.caseId &&
      targetId === fixture.descriptor.targetId
  );
  if (!gradingDescriptor) throw new Error('Grading descriptor is missing.');
  const turn = createAgentEvaluationInvocationTurnReceipt({
    planDigest: gradingPlan.planDigest,
    repositoryCommit: gradingPlan.repositoryCommit,
    attemptId: gradingDescriptor.attemptId,
    descriptorDigest: gradingDescriptor.descriptorDigest,
    turnIndex: 0,
    invocationId: 'invocation.grading.test',
    status: 'infrastructure-error',
    dispatchState: 'not-created',
    terminal: true,
    caseDefinitionDigest: fixture.material.caseDefinitionDigest,
    contextPackDigest: digestAgentCanonicalValue({ context: 'grading' }),
    executionFailureAuthorityReceiptDigest: digestAgentCanonicalValue({
      failure: 'grading',
    }),
  });
  const turnSet = createAgentEvaluationInvocationTurnSetReceipt({
    planDigest: gradingPlan.planDigest,
    repositoryCommit: gradingPlan.repositoryCommit,
    attemptId: gradingDescriptor.attemptId,
    descriptorDigest: gradingDescriptor.descriptorDigest,
    turns: [turn],
  });
  const capability = createAgentEvaluationFailedCapabilityExecutionReceipt({
    plan: gradingPlan,
    descriptor: gradingDescriptor,
    turnIndex: 0,
    invocationId: turn.invocationId,
    observedAt: NOW,
  });
  const execution = Object.freeze({
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    capabilityExecutionReceiptSetDigest:
      digestAgentEvaluationCapabilityExecutionReceiptSet([capability]),
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
  });
  const input = Object.freeze({
    namespaceId,
    shardLeaseOwnerId,
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: grantSetDigest,
    plan: gradingPlan,
    descriptor: gradingDescriptor,
    material: fixture.material,
    protocolFamily: 'openai-responses' as const,
    status: 'infrastructure-error' as const,
    invocationTurnSetReceipt: turnSet,
    terminalTurnReceipt: turn,
    execution,
    capabilityExecutionReceipt: capability,
  });
  return Object.freeze({
    input,
    request: ownerRequest(
      'attempt-grading',
      'grade-and-persist',
      gradingDescriptor,
      input,
      'execute',
      gradingPlan
    ),
  });
};

describe('production attempt owner authority ports', () => {
  it('binds a parallel join to the exact two-tool leaf set and fails closed on dropped or swapped receipts', async () => {
    const root = await tempRoot();
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource:
          createSealedProductionCapabilityAuthorityObservationSource(),
        allowTemporaryStateDirectory: true,
      });
    const controlledToolExecutionReceipts = parallelControlledReceipts();
    expect(controlledToolExecutionReceipts).toHaveLength(2);
    expect(
      controlledToolExecutionReceipts.map(
        isAgentEvaluationControlledToolExecutionCapabilityFact
      )
    ).toEqual([true, true]);
    const executeAssessment = async (
      receipts: AgentEvaluationCapabilityRuntimeAssessmentInput['controlledToolExecutionReceipts']
    ) => {
      const payload = Object.freeze({
        ...assessmentInput(parallel),
        controlledToolExecutionReceipts: Object.freeze([...receipts]),
      });
      const request = ownerRequest(
        'provider-capability',
        'capability.assess',
        parallel.descriptor,
        payload
      );
      await ports.providerCapability.stage(request);
      return ports.providerCapability.execute(request);
    };

    const supported = (await executeAssessment(
      controlledToolExecutionReceipts
    )) as ProductionCapabilityAssessmentResponse;
    expect(supported.outcome).toBe('supported');
    const join = supported.specificReceipts.find(
      ({ authority }) => authority.authorityKind === 'parallel-tool-join'
    );
    expect(join?.authority.authorityKind).toBe('parallel-tool-join');
    if (join?.authority.authorityKind !== 'parallel-tool-join') {
      throw new TypeError('Parallel join specific is unavailable.');
    }
    expect(join.authority.fact.controlledToolExecutionReceiptDigests).toEqual(
      controlledToolExecutionReceipts
        .map(({ receiptDigest }) => receiptDigest)
        .sort(compareUnicodeCodePoints)
    );

    await expect(
      executeAssessment(controlledToolExecutionReceipts.slice(0, 1))
    ).resolves.toMatchObject({ outcome: 'failed', specificReceipts: [] });
    const swapped = Object.freeze([
      controlledToolExecutionReceipts[0]!,
      Object.freeze({
        ...controlledToolExecutionReceipts[1]!,
        receiptDigest: controlledToolExecutionReceipts[0]!.receiptDigest,
      }),
    ]);
    await expect(executeAssessment(swapped)).resolves.toMatchObject({
      outcome: 'failed',
      specificReceipts: [],
    });
    await ports.close();
  });

  it('fails a required capability and binds an expected-blocked capability to one exact observed unavailable receipt', async () => {
    const root = await tempRoot();
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([]),
        allowTemporaryStateDirectory: true,
      });
    const executePayload = toolInput();
    const executeRequest = ownerRequest(
      'provider-capability',
      'tool.execute',
      background.descriptor,
      executePayload
    );
    await ports.providerCapability.stage(executeRequest);
    await expect(
      ports.providerCapability.execute(executeRequest)
    ).rejects.toThrow('shared-effect-owner-unavailable');

    for (const [fixture, expected, specificCount] of [
      [retrieval, 'failed', 0],
      [blocked, 'unsupported', 1],
    ] as const) {
      const payload = assessmentInput(fixture);
      const request = ownerRequest(
        'provider-capability',
        'capability.assess',
        fixture.descriptor,
        payload
      );
      await ports.providerCapability.stage(request);
      await expect(
        ports.providerCapability.execute(request)
      ).resolves.toMatchObject({
        outcome: expected,
        specificReceipts:
          specificCount === 0
            ? []
            : [
                {
                  receiptKind: 'capability-unavailable-receipt',
                  providerCapabilityObservationReceiptDigest:
                    payload.providerCapabilityObservationReceipts[0]!
                      .receiptDigest,
                },
              ],
      });
    }
    await expect(ports.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: { providerCapability: [], attemptGrading: [] },
      residualCanaryIds: [],
    });
  });

  it('accepts one sealed shared effect and persists its sanitized canonical response', async () => {
    const root = await tempRoot();
    const state = emptyState();
    const canary = 'credential-canary-owner-test';
    const source = observationSource(state);
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([canary]),
        capabilityObservationSource: source,
        allowTemporaryStateDirectory: true,
      });
    const payload = toolInput(background, canary);
    const request = ownerRequest(
      'provider-capability',
      'tool.execute',
      background.descriptor,
      payload
    );
    await ports.providerCapability.stage(request);
    const first = (await ports.providerCapability.execute(
      request
    )) as ProductionCapabilityExecuteResponse;
    const replay = await ports.providerCapability.execute(request);
    expect(first.outcome).toBe('supported');
    expect(first).toMatchObject({
      executionAuthorityKind: 'shared-effect',
      effectSourceFact: { factKind: 'provider-job-receipt' },
      specificReceipts: [],
    });
    expect(replay).toEqual(first);
    expect(state.effectCount).toBe(1);
    const persisted = await readAllStateText(root);
    expect(persisted).not.toContain(canary);
    expect(persisted).not.toContain('"arguments"');
    expect(persisted).toContain('"effectSourceReceipt"');
    expect(persisted).toContain('"effectSourceFact"');
    await ports.close();
  });

  it('recovers a staged real effect across hosts from the sealed durable observation without applying it twice', async () => {
    const sharedRoot = await tempRoot();
    const otherHostRoot = await tempRoot();
    const state = emptyState();
    const source = observationSource(state, true);
    const first =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: sharedRoot,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: source,
        allowTemporaryStateDirectory: true,
      });
    const payload = toolInput();
    const request = ownerRequest(
      'provider-capability',
      'tool.execute',
      background.descriptor,
      payload
    );
    await first.providerCapability.stage(request);
    await expect(first.providerCapability.execute(request)).rejects.toThrow(
      'simulated owner crash'
    );

    const restarted =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: sharedRoot,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: source,
        allowTemporaryStateDirectory: true,
      });
    await expect(
      restarted.providerCapability.reconcile(
        reconcileOwnerRequest(request, supportedResponse(request))
      )
    ).resolves.toMatchObject({
      reconciled: true,
      response: { outcome: 'supported' },
    });
    expect(state.effectCount).toBe(1);
    expect(state.resolveCount).toBe(1);
    expect(state.reconcileCount).toBe(1);

    const otherHost =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: otherHostRoot,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: source,
        allowTemporaryStateDirectory: true,
      });
    const otherHostRequest = reconcileOwnerRequest(
      request,
      supportedResponse(request)
    );
    await expect(
      otherHost.providerCapability.reconcile({
        ...otherHostRequest,
        stageDigest: digestAgentCanonicalValue({ forged: 'stage' }),
      })
    ).rejects.toThrow('stage-digest-drift');
    await expect(
      otherHost.providerCapability.reconcile({
        ...otherHostRequest,
        ownerImplementationDigest: digestAgentCanonicalValue({
          forged: 'owner',
        }),
      })
    ).rejects.toThrow('owner-implementation-digest-drift');
    await expect(
      otherHost.providerCapability.reconcile({
        ...otherHostRequest,
        dispatchAckDigest: digestAgentCanonicalValue({ forged: 'ack' }),
      })
    ).rejects.toThrow('dispatch-ack-digest-drift');
    await expect(
      otherHost.providerCapability.reconcile(otherHostRequest)
    ).resolves.toMatchObject({
      response: { outcome: 'supported' },
      reconciled: true,
    });
    expect(state.resolveCount).toBe(1);
    expect(state.effectCount).toBe(1);
    expect(state.reconcileCount).toBe(3);
    await Promise.all([first.close(), restarted.close(), otherHost.close()]);
  });

  it('rejects forged source durability, source identity, request/result binding, and continuation swaps', async () => {
    const payload = toolInput();
    const request = ownerRequest(
      'provider-capability',
      'tool.execute',
      background.descriptor,
      payload
    );
    const validResponse = supportedResponse(request);
    expect(
      validateProductionCapabilityAuthorityResponse(request, validResponse)
        .specificReceipts
    ).toHaveLength(0);
    expect(() =>
      validateProductionCapabilityAuthorityObservation(request, {
        sourceAuthorityId,
        sourceImplementationDigest,
        sourceDurability: 'process-local',
        authorityRequestDigest: request.requestDigest,
        sourceStageReceiptDigest: digestAgentCanonicalValue({
          stage: request.requestDigest,
        }),
        response: validResponse,
        observedAt: NOW,
        observationDigest: digestAgentCanonicalValue({ invalid: true }),
      })
    ).toThrow('observation-source');
    const swappedResult = Object.freeze({
      ...validResponse,
      resultDigest: digestAgentCanonicalValue({ forged: 'result' }),
    });
    expect(() =>
      validateProductionCapabilityAuthorityResponse(request, swappedResult)
    ).toThrow('shared-effect-response-binding');

    const wrongSourceRoot = await tempRoot();
    const wrongState = emptyState();
    const exactButMislabeled = observationSource(wrongState);
    const wrongSource = Object.freeze({
      ...exactButMislabeled,
      async resolve(sourceRequest: AgentEvaluationOwnerAuthorityRequest) {
        const observation = await exactButMislabeled.resolve(sourceRequest);
        return observation
          ? (() => {
              const mislabeledBase = Object.freeze({
                ...observation,
                sourceAuthorityId: 'provider.lifecycle.observation.wrong',
              });
              const { observationDigest: _observationDigest, ...digestBase } =
                mislabeledBase;
              return Object.freeze({
                ...digestBase,
                observationDigest: digestAgentCanonicalValue(digestBase),
              });
            })()
          : undefined;
      },
    });
    const wrongPorts =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: wrongSourceRoot,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: wrongSource,
        allowTemporaryStateDirectory: true,
      });
    await wrongPorts.providerCapability.stage(request);
    await expect(
      wrongPorts.providerCapability.execute(request)
    ).rejects.toThrow('source-observation-identity');
    await wrongPorts.close();

    const root = await tempRoot();
    const state = emptyState();
    const exactSource = observationSource(state);
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([]),
        capabilityObservationSource: exactSource,
        allowTemporaryStateDirectory: true,
      });
    await ports.providerCapability.stage(request);
    await ports.providerCapability.execute(request);
    const completedPath = join(
      root,
      'attempt-authorities-v1',
      'provider-capability',
      request.requestDigest,
      'completed.json'
    );
    const completed = JSON.parse(
      await readFile(completedPath, 'utf8')
    ) as Record<string, unknown>;
    const projection = completed.responseProjection as Record<string, unknown>;
    const capabilityResponse = completed.capabilityResponse as Record<
      string,
      unknown
    >;
    const swappedContinuationReceiptDigest = digestAgentCanonicalValue({
      swapped: 'continuation',
    });
    completed.responseProjection = {
      ...projection,
      continuationReceiptDigest: swappedContinuationReceiptDigest,
    };
    completed.capabilityResponse = {
      ...capabilityResponse,
      continuationReceiptDigest: swappedContinuationReceiptDigest,
    };
    const { recordDigest: _recordDigest, ...base } = completed;
    completed.recordDigest = digestAgentCanonicalValue(base);
    await writeFile(completedPath, canonicalJsonText(completed), 'utf8');
    await expect(ports.providerCapability.execute(request)).rejects.toThrow(
      'shared-effect-response-binding'
    );
    await ports.close();
  });

  it('recomputes and persists grading observations, rejects grader tamper, and reconciles an exact staged grading request', async () => {
    const root = await tempRoot();
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([]),
        allowTemporaryStateDirectory: true,
      });
    const fixture = gradingFixture();
    await ports.attemptGrading.stage(fixture.request);
    const expected = gradeProductionAgentEvaluationAttempt(fixture.request);
    const reconciled = await ports.attemptGrading.reconcile(
      reconcileOwnerRequest(fixture.request, expected)
    );
    expect(reconciled.reconciled).toBe(true);
    const response = reconciled.response as Readonly<{
      metricObservations: readonly AgentEvaluationMetricObservation[];
      gradingDigest: CanonicalDigest;
    }>;
    expect(response.metricObservations).toHaveLength(1);
    expect(
      response.metricObservations.every(
        ({ verdict }) => verdict === 'inconclusive'
      )
    ).toBe(true);
    const first = response.metricObservations[0]!;
    const { observationDigest: _observationDigest, ...observationBase } = first;
    const tamperedBase = Object.freeze({
      ...observationBase,
      verdict: 'passed' as const,
    });
    const tamperedObservation = Object.freeze({
      ...tamperedBase,
      observationDigest: digestAgentCanonicalValue(tamperedBase),
    });
    expect(() =>
      validateProductionAttemptGradingResponse(fixture.request, {
        metricObservations: Object.freeze([
          tamperedObservation,
          ...response.metricObservations.slice(1),
        ]),
        gradingDigest: response.gradingDigest,
      })
    ).toThrow('response-tamper');
    await expect(
      ports.attemptGrading.execute(fixture.request)
    ).resolves.toEqual(response);
    await ports.close();
  });

  it('uses RUNNER_TEMP only as a local cache and closes with exact zero residuals', async () => {
    const root = await tempRoot();
    const ports =
      await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
        stateDirectory: root,
        forbiddenCanaries: () => Object.freeze([]),
        allowTemporaryStateDirectory: true,
        runnerTemporaryDirectory: root,
      });
    await expect(ports.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: { providerCapability: [], attemptGrading: [] },
      residualCanaryIds: [],
    });
  });
});
