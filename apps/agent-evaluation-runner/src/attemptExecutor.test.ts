import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationSourceReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  createAnthropicMessagesAgentProviderAdapter,
  createGeminiInteractionsAgentProviderAdapter,
  createOpenAIResponsesAgentProviderAdapter,
  digestAgentCanonicalValue,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  getG4V8PublicEvaluationCaseMaterials,
  normalizeAgentCosts,
  planAgentModelEvaluationAttempts,
  type AgentBudgetDemand,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationProviderResultSpoolDispositionReceipt,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentNativeProviderTransport,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  AgentEvaluationAttemptExecutor,
  createAgentEvaluationAttemptRetryPolicy,
  createAgentEvaluationPreDispatchAttemptFinalizer,
  digestAgentEvaluationAttemptAccounting,
  digestAgentEvaluationAttemptGrading,
  type AgentEvaluationAttemptAccounting,
  type AgentEvaluationAttemptAccountingInput,
  type AgentEvaluationAttemptAdapterSet,
  type AgentEvaluationAttemptClosedTransportTurn,
  type AgentEvaluationAttemptGrading,
  type AgentEvaluationAttemptGradingInput,
  type AgentEvaluationAttemptNativeProtocol,
} from './attemptExecutor';
import { CallbackBoundAgentEvaluationInvocationPayloadRegistry } from './invocationPayload';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';
import type {
  AgentEvaluationCapabilityRuntime,
  AgentEvaluationCapabilityRuntimeAssessmentInput,
} from './capabilityRuntime';

const STARTED_AT = '2026-08-02T01:00:00.000Z';
const COMPLETED_AT = '2026-08-02T01:00:00.001Z';

const verificationGrantFor = (
  plan: AgentModelEvaluationPlan,
  descriptor: AgentModelEvaluationAttemptDescriptor,
  cellSuffix = 'primary'
): AgentEvaluationVerificationAttemptGrantReceipt => {
  const verificationPlanDigest = digestAgentCanonicalValue({
    verificationPlan: descriptor.descriptorDigest,
  });
  const cellId = `cell.${descriptor.samplingIdentityDigest.slice('sha256-'.length, 'sha256-'.length + 24)}.${cellSuffix}`;
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: 'workspace.agent-evaluation.test',
    projectId: 'project.agent-evaluation.test',
    workspaceRevision: 1,
    partitionRevisionsDigest: digestAgentCanonicalValue('partitions.test'),
    policyRevision: 1,
    policyDigest: plan.policyDigest,
    policyEvaluationInstant: STARTED_AT,
    impactDigest: digestAgentCanonicalValue('impact.test'),
    planDigest: verificationPlanDigest,
    cellId,
    checkId: `check.agent-evaluation.test.${cellSuffix}`,
    checkKind: 'integration',
    targetId: descriptor.targetId,
    attemptId: descriptor.attemptId,
    runId: 'run.agent-evaluation.test',
    providerId: 'provider.agent-evaluation.test',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'local-unattested' as const,
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: false,
    }),
    maximumClosureEvidenceRecords: 32,
    issuedBy: 'g4-evaluation.test',
    issuedAt: STARTED_AT,
    expiresAt: '2026-08-02T01:05:00.000Z',
  });
  const grantDigest = digestAgentCanonicalValue(grantBase);
  const grant = Object.freeze({
    grantId: `attempt-grant-${grantDigest.slice('sha256-'.length)}`,
    grantDigest,
    workspaceId: grantBase.workspaceId,
    projectId: grantBase.projectId,
    workspaceRevision: grantBase.workspaceRevision,
    partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
    policyRevision: grantBase.policyRevision,
    policyDigest: grantBase.policyDigest,
    policyEvaluationInstant: grantBase.policyEvaluationInstant,
    impactDigest: grantBase.impactDigest,
    verificationPlanDigest: grantBase.planDigest,
    cellId: grantBase.cellId,
    checkId: grantBase.checkId,
    checkKind: grantBase.checkKind,
    targetId: grantBase.targetId,
    attemptId: grantBase.attemptId,
    runId: grantBase.runId,
    providerId: grantBase.providerId,
    producerId: grantBase.producerId,
    trustCeiling: grantBase.trustCeiling,
    retentionRequest: grantBase.retentionRequest,
    maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
    issuedBy: grantBase.issuedBy,
    issuedAt: grantBase.issuedAt,
    expiresAt: grantBase.expiresAt,
  });
  const identity = Object.freeze({
    namespaceId: 'namespace.agent-evaluation.test',
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation: 1,
    verificationPlanDigest,
    cellId,
  });
  const issuanceBindingDigest = digestAgentCanonicalValue({
    ...identity,
    workspaceId: grant.workspaceId,
    workspaceRevision: grant.workspaceRevision,
    projectId: grant.projectId,
  });
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
    version: 1 as const,
    ...identity,
    requestDigest: digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      grant: 'request',
    }),
    issuanceBindingDigest,
    grant,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const materialFor = (
  plan: AgentModelEvaluationPlan,
  protocolFamily: AgentEvaluationAttemptNativeProtocol = 'openai-responses'
): AgentEvaluationCaseMaterial => {
  const targetIds = new Set(
    plan.capabilityQualificationTargets
      .filter(
        ({ protocolFamily: targetProtocol }) =>
          targetProtocol === protocolFamily
      )
      .map(({ targetId }) => targetId)
  );
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    descriptors.some(
      ({ caseId, capabilityDescriptorDigest, targetId }) =>
        caseId === candidate.caseId &&
        capabilityDescriptorDigest === candidate.capabilityDescriptorDigest &&
        targetIds.has(targetId)
    )
  );
  if (!material) throw new Error('The V8 fixture has no public material.');
  return material;
};

const descriptorFor = (
  plan: AgentModelEvaluationPlan,
  material: AgentEvaluationCaseMaterial,
  protocolFamily: AgentEvaluationAttemptNativeProtocol
): AgentModelEvaluationAttemptDescriptor => {
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    (candidate) =>
      candidate.caseId === material.caseId &&
      candidate.capabilityDescriptorDigest ===
        material.capabilityDescriptorDigest &&
      plan.capabilityQualificationTargets.some(
        ({ targetId, protocolFamily: targetProtocol }) =>
          targetId === candidate.targetId && targetProtocol === protocolFamily
      )
  );
  if (!descriptor) throw new Error(`No ${protocolFamily} descriptor found.`);
  return descriptor;
};

const runtimeConfiguration =
  (): AgentEvaluationControlledRuntimeConfiguration => {
    const base = Object.freeze({
      authorityId: 'authority.agent-evaluation-controlled-runtime.test',
      runtimeImplementationDigest: digestAgentCanonicalValue('runtime.test'),
      artifactResolutionPolicyDigest:
        digestAgentCanonicalValue('artifacts.test'),
      proposalValidationPolicyDigest:
        digestAgentCanonicalValue('proposal.test'),
      isolationPolicyDigest: digestAgentCanonicalValue('isolation.test'),
      g3VerificationPolicyDigest: digestAgentCanonicalValue('g3.test'),
      controlledRenderPolicyDigest: digestAgentCanonicalValue('render.test'),
      loop: Object.freeze({
        domainToolChoice: 'required' as const,
        allowParallelDomainToolCalls: false,
        maximumTurnsPerAttempt: 2,
        maximumToolCallsPerAttempt: 1,
        maximumRepairRoundsPerAttempt: 1,
        maximumToolResultBytes: 65_536,
        maximumAggregateToolResultBytes: 65_536,
        maximumAggregateArtifactBytes: 1_048_576,
        continuationTimeoutMs: 10_000,
        loopPolicyDigest: digestAgentCanonicalValue('loop.test'),
      }),
    });
    return Object.freeze({
      ...base,
      runtimePolicyDigest: digestAgentCanonicalValue(base),
    });
  };

const unusedControlledRuntime: AgentEvaluationControlledRuntime = Object.freeze(
  {
    async executeTool() {
      throw new Error('Controlled tool execution was not expected.');
    },
    async continue() {
      throw new Error('Controlled continuation was not expected.');
    },
    async assessFinal() {
      throw new Error('Controlled final assessment was not expected.');
    },
  }
);

const failedCapabilityRuntime: AgentEvaluationCapabilityRuntime = Object.freeze(
  {
    async executeTool() {
      throw new Error('Capability tool execution was not expected.');
    },
    async assessCapability(
      input: AgentEvaluationCapabilityRuntimeAssessmentInput
    ) {
      const result = Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
      return Object.freeze({
        ...result,
        authorityReceipt: createAgentEvaluationAttemptAuthorityOwnerReceipt({
          serviceKind: 'capability-runtime',
          operation: 'assess-capability',
          namespaceId: input.namespaceId,
          planDigest: input.plan.planDigest,
          repositoryCommit: input.plan.repositoryCommit,
          attemptId: input.descriptor.attemptId,
          descriptorDigest: input.descriptor.descriptorDigest,
          shardLeaseOwnerId: input.shardLeaseOwnerId,
          shardLeaseGeneration: input.shardLeaseGeneration,
          verificationGrantGeneration: input.verificationGrantGeneration,
          verificationAttemptGrantReceiptSetDigest:
            input.verificationAttemptGrantReceiptSetDigest,
          requestDigest: digestAgentCanonicalValue({
            operation: 'assess-capability',
            attemptId: input.descriptor.attemptId,
          }),
          responseProjection:
            createAgentEvaluationAttemptAuthorityResponseProjection(
              'capability-runtime',
              'assess-capability',
              result,
              {
                bindingKind: 'assess-capability',
                terminalTurnIndex: input.terminalTurnIndex,
                terminalInvocationId: input.terminalInvocationId,
                materialDigest: input.material.materialDigest,
                capabilityDescriptorDigest:
                  input.capabilityDescriptor.descriptorDigest,
              }
            ),
          ownerImplementationDigest: digestAgentCanonicalValue(
            'capability-runtime.test'
          ),
          completedAt: COMPLETED_AT,
        }),
      });
    },
  }
);

const estimateFor = (descriptorCount: number): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([]),
    cost: Object.freeze([]),
    modelInvocations: descriptorCount * 2,
    toolCalls: descriptorCount,
    repairRounds: descriptorCount,
    transactions: 0,
    artifactBytes: descriptorCount * 1_048_576,
    elapsedMs: descriptorCount,
  });

const adaptersFor = (
  plan: AgentModelEvaluationPlan,
  transport: AgentNativeProviderTransport
): AgentEvaluationAttemptAdapterSet => {
  const adapterFor = (protocolFamily: AgentEvaluationAttemptNativeProtocol) => {
    const provider = plan.providerConfigurations.find(
      ({ adapter }) => adapter.protocolFamily === protocolFamily
    );
    if (!provider) throw new Error(`Missing ${protocolFamily} provider.`);
    const profileDigests = plan.capabilityQualificationTargets
      .filter(
        ({ providerConfigurationId }) =>
          providerConfigurationId === provider.providerConfigurationId
      )
      .map(({ capabilityProfileDigest }) => capabilityProfileDigest);
    const input = {
      identity: provider.adapter,
      declaredProfileDigests: profileDigests,
      supportedProfileDigests: profileDigests,
      transport,
      now: () => STARTED_AT,
    };
    switch (protocolFamily) {
      case 'openai-responses':
        return createOpenAIResponsesAgentProviderAdapter(input);
      case 'anthropic-messages':
        return createAnthropicMessagesAgentProviderAdapter(input);
      case 'gemini-interactions':
        return createGeminiInteractionsAgentProviderAdapter(input);
    }
  };
  return Object.freeze({
    'openai-responses': adapterFor('openai-responses'),
    'anthropic-messages': adapterFor('anthropic-messages'),
    'gemini-interactions': adapterFor('gemini-interactions'),
  });
};

type PersistenceState = {
  preDispatchFailures: AgentEvaluationPreDispatchFailureReceipt[];
  capabilityExecutions: AgentEvaluationCapabilityExecutionReceipt[];
  capabilitySpecifics: AgentEvaluationCapabilitySpecificReceipt[];
  attemptAuthorityOwners: AgentEvaluationAttemptAuthorityOwnerReceipt[];
  sourceReceipts: AgentEvaluationSourceReceipt[];
  invocationTurns: AgentEvaluationInvocationTurnReceipt[];
  resultSubmissions: AgentEvaluationResultSubmissionReceipt[];
  spoolDispositions: AgentEvaluationProviderResultSpoolDispositionReceipt[];
  executionReceiptCount: number;
};

const persistenceState = (): PersistenceState => ({
  preDispatchFailures: [],
  capabilityExecutions: [],
  capabilitySpecifics: [],
  attemptAuthorityOwners: [],
  sourceReceipts: [],
  invocationTurns: [],
  resultSubmissions: [],
  spoolDispositions: [],
  executionReceiptCount: 0,
});

const grading = async (
  input: AgentEvaluationAttemptGradingInput
): Promise<AgentEvaluationAttemptGrading> => {
  const deterministicGraderId =
    input.plan.graderPlan.deterministicAuthorityGraderIds[0]!;
  const grader = input.plan.graderPlan.graders.find(
    ({ graderId }) => graderId === deterministicGraderId
  )!;
  const observation = createAgentEvaluationMetricObservation({
    metricId: input.plan.thresholds.metrics[0]!.metricId,
    graderId: deterministicGraderId,
    graderKind: grader.kind,
    authority: 'deterministic',
    verdict: input.status === 'completed' ? 'passed' : 'inconclusive',
  });
  const metricObservations = Object.freeze([observation]);
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: input.descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest:
      input.invocationTurnSetReceipt.receiptDigest,
    terminalTurnReceiptDigest: input.terminalTurnReceipt.evidenceDigest,
    capabilityExecutionReceiptDigest:
      input.capabilityExecutionReceipt.receiptDigest,
    ...(input.resultSubmissionReceipt
      ? {
          resultSubmissionReceiptDigest:
            input.resultSubmissionReceipt.receiptDigest,
        }
      : {}),
    ...(input.controlledRuntimeReceipt
      ? {
          controlledRuntimeReceiptDigest:
            input.controlledRuntimeReceipt.receiptDigest,
        }
      : {}),
    metricObservations,
    execution: input.execution,
  });
  const authorityResult = Object.freeze({
    metricObservations,
    gradingDigest,
  });
  return Object.freeze({
    ...authorityResult,
    authorityReceipt: createAgentEvaluationAttemptAuthorityOwnerReceipt({
      serviceKind: 'attempt-grading',
      operation: 'grade-and-persist',
      namespaceId: input.namespaceId,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      shardLeaseOwnerId: input.shardLeaseOwnerId,
      shardLeaseGeneration: input.shardLeaseGeneration,
      verificationGrantGeneration: input.verificationGrantGeneration,
      verificationAttemptGrantReceiptSetDigest:
        input.verificationAttemptGrantReceiptSetDigest,
      requestDigest: digestAgentCanonicalValue({
        operation: 'grade-and-persist',
        attemptId: input.descriptor.attemptId,
      }),
      responseProjection:
        createAgentEvaluationAttemptAuthorityResponseProjection(
          'attempt-grading',
          'grade-and-persist',
          authorityResult
        ),
      ownerImplementationDigest: digestAgentCanonicalValue(
        'attempt-grading.test'
      ),
      completedAt: COMPLETED_AT,
    }),
  });
};

const failureAccounting = async (
  input: AgentEvaluationAttemptAccountingInput
): Promise<AgentEvaluationAttemptAccounting> => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  )!;
  const model = input.plan.modelConfigurations.find(
    ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
  )!;
  const usage = createAgentUsageVector([]);
  const cost = normalizeAgentCosts([]);
  const sourceUri = 'transport-receipt:';
  const failureReceiptDigest = input.transportReceipt.receiptDigest;
  const sourceAuthority = {
    executionFailureAuthorityReceiptDigest: failureReceiptDigest,
    sourceUri,
  } as const;
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.usage.failure.${input.turnIndex}`,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    ...sourceAuthority,
    sourceContentDigest: digestAgentCanonicalValue({
      kind: 'sanitized-provider-usage-unavailable',
      transportReceiptDigest: input.transportReceipt.receiptDigest,
    }),
    inputUsageDigest: usage.vectorDigest,
    observedAt: COMPLETED_AT,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.cost.failure.${input.turnIndex}`,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    sourceKind: 'provider-reported-cost',
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    ...sourceAuthority,
    sourceContentDigest: digestAgentCanonicalValue({
      kind: 'sanitized-provider-cost-unavailable',
      transportReceiptDigest: input.transportReceipt.receiptDigest,
    }),
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: COMPLETED_AT,
  });
  const responseHeaderDigest = digestAgentCanonicalValue({
    transportReceiptDigest: input.transportReceipt.receiptDigest,
    headers: 'unavailable',
  });
  const resolvedModelIdentityDigest =
    digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: input.protocolFamily,
      transportReceiptDigest: input.transportReceipt.receiptDigest,
      frozenModelId: model.modelId,
      ...(model.immutableVersion
        ? { frozenImmutableModelVersion: model.immutableVersion }
        : {}),
    });
  const sourceReceiptDigests = [
    usageSourceReceipt.receiptDigest,
    costSourceReceipt.receiptDigest,
  ];
  return Object.freeze({
    usage,
    dispatchState: 'dispatched' as const,
    costStatus: 'unknown' as const,
    cost,
    usageSourceReceipt,
    costSourceReceipt,
    executionFailureAuthorityReceiptDigest: failureReceiptDigest,
    executionFailureSourceUri: sourceUri,
    transportReceiptDigest: input.transportReceipt.receiptDigest,
    resolvedModelIdentityDigest,
    responseHeaderDigest,
    accountingDigest: digestAgentEvaluationAttemptAccounting({
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: input.turnIndex,
      invocationId: input.invocation.invocationId,
      requestDigest: input.invocation.requestDigest,
      responseDigest: input.responseDigest,
      status: input.status,
      costStatus: 'unknown',
      usageVectorDigest: usage.vectorDigest,
      cost,
      sourceReceiptDigests,
      transportReceiptDigest: input.transportReceipt.receiptDigest,
      resolvedModelIdentityDigest,
      executionFailureAuthorityReceiptDigest: failureReceiptDigest,
      executionFailureSourceUri: sourceUri,
      responseHeaderDigest,
    }),
  });
};

const createClosedUnknownTurn = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    invocationId: string;
    requestDigest: string;
    encodedPayloadDigest: string;
  }>
): AgentEvaluationAttemptClosedTransportTurn => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  )!;
  const provider = input.plan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target.providerConfigurationId
  )!;
  const budgetReservationId = `reservation.${input.descriptor.attemptId}`;
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: `intent.${input.descriptor.attemptId}.${input.turnIndex}`,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    invocationId: input.invocationId,
    budgetReservationId,
    demandDigest: digestAgentCanonicalValue({
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: input.turnIndex,
      kind: 'test-reservation-demand',
    }),
    requestDigest: input.requestDigest,
    endpointId: `endpoint.${provider.providerConfigurationId}`,
    endpointClass: 'first-party-hosted',
    requestBodyDigest: input.encodedPayloadDigest,
    requestBytes: 128,
    createdAt: STARTED_AT,
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: `transport.unknown.${input.descriptor.attemptId}.${input.turnIndex}`,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    invocationId: input.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest: input.requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass: dispatchIntent.endpointClass,
    requestBodyDigest: dispatchIntent.requestBodyDigest,
    requestBytes: dispatchIntent.requestBytes,
    responseBytes: 0,
    sseEventCount: 0,
    dispatchState: 'dispatched',
    outcome: 'post-dispatch-unknown',
    errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
  });
  const base = Object.freeze({
    state: 'closed' as const,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    budgetReservationId,
    dispatchIntent,
    transportReceipt,
    createdAt: STARTED_AT,
    closedAt: COMPLETED_AT,
  });
  return Object.freeze({
    ...base,
    turnDigest: digestAgentCanonicalValue(base),
  });
};

type HarnessOptions = Readonly<{
  plan: AgentModelEvaluationPlan;
  material: AgentEvaluationCaseMaterial;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  materialFailure?: Error;
  accountingFailure?: Error;
  recoveredTurns?: readonly AgentEvaluationAttemptClosedTransportTurn[];
  verificationAttemptGrantReceipts?: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
}>;

const harness = (options: HarnessOptions) => {
  const payloadRegistry =
    new CallbackBoundAgentEvaluationInvocationPayloadRegistry();
  const state = persistenceState();
  const calls: AgentEvaluationAttemptNativeProtocol[] = [];
  const closedTurns: AgentEvaluationAttemptClosedTransportTurn[] = [];
  const classificationErrors: string[] = [];
  const transport: AgentNativeProviderTransport = {
    async *stream(request) {
      payloadRegistry.resolveOnce(request);
      calls.push(
        request.protocolFamily as AgentEvaluationAttemptNativeProtocol
      );
      yield Object.freeze({
        type: 'response.failed',
        response: Object.freeze({ id: 'failed.response' }),
      });
    },
  };
  const executor = new AgentEvaluationAttemptExecutor({
    namespaceId: 'namespace.agent-evaluation.test',
    shardLeaseOwnerId: 'owner.agent-evaluation.test',
    shardLeaseGeneration: 1,
    adapters: adaptersFor(options.plan, transport),
    payloadRegistry,
    materialSource: {
      use: async (input, callback) => {
        if (options.materialFailure) throw options.materialFailure;
        if (input.descriptor.caseId !== options.material.caseId) {
          throw new Error('Material request escaped its case binding.');
        }
        return callback(options.material);
      },
    },
    retryPolicy: createAgentEvaluationAttemptRetryPolicy({
      maximumAttempts: 1,
      retryableStatuses: ['provider-error', 'infrastructure-error'],
    }),
    controlledRuntimeConfiguration: runtimeConfiguration(),
    controlledRuntime: unusedControlledRuntime,
    capabilityRuntime: failedCapabilityRuntime,
    verificationAttemptGrantReceipts:
      options.verificationAttemptGrantReceipts ??
      Object.freeze([verificationGrantFor(options.plan, options.descriptor)]),
    requiresControlledPreview: () => false,
    transportJournal: {
      takeClosedTurn: async ({
        plan,
        descriptor,
        turnIndex,
        invocation,
        encodedPayload,
      }) => {
        const turn = createClosedUnknownTurn({
          plan,
          descriptor,
          turnIndex,
          invocationId: invocation.invocationId,
          requestDigest: invocation.requestDigest,
          encodedPayloadDigest: encodedPayload.payloadDigest,
        });
        closedTurns.push(turn);
        return turn;
      },
      recoverRuntimeTurn: async () => {
        throw new Error(
          'Unknown transport outcome must not replay a response.'
        );
      },
    },
    estimateShard: ({ descriptors }) => estimateFor(descriptors.length),
    classifyPreDispatchFailure: async (input) => {
      if (input.caught instanceof Error) {
        classificationErrors.push(input.caught.message);
      }
      return Object.freeze({
        reasonCode: input.suggestedReasonCode,
        findingDigest: digestAgentCanonicalValue({
          stage: input.stage,
          reasonCode: input.suggestedReasonCode,
          inputDigest: input.inputDigest,
        }),
      });
    },
    resolveAndPersistAccounting: options.accountingFailure
      ? async () => {
          throw options.accountingFailure;
        }
      : failureAccounting,
    gradeAndPersist: grading,
    persistSourceReceipt: async (receipt) => {
      state.sourceReceipts.push(receipt);
      return receipt;
    },
    persistPreDispatchFailureReceipt: async (receipt) => {
      state.preDispatchFailures.push(receipt);
      return receipt;
    },
    persistCapabilityExecutionReceipt: async (receipt) => {
      state.capabilityExecutions.push(receipt);
      return receipt;
    },
    persistCapabilitySpecificReceipt: async (receipt) => {
      state.capabilitySpecifics.push(receipt);
      return receipt;
    },
    persistProviderCapabilityObservationReceipt: async (receipt) => receipt,
    persistAttemptAuthorityOwnerReceipt: async (receipt) => {
      state.attemptAuthorityOwners.push(receipt);
      return receipt;
    },
    persistInvocationTurnReceipt: async (receipt) => {
      state.invocationTurns.push(receipt);
      return receipt;
    },
    persistResultSubmissionReceipt: async (receipt) => {
      state.resultSubmissions.push(receipt);
      return receipt;
    },
    persistControlledRuntimeReceipt: async (receipt) => receipt,
    secretCanaries: () =>
      Object.freeze(['secret-canary-attempt-executor-test']),
    stageResultSpoolDispositionReceipt: async (receipt) => {
      state.spoolDispositions.push(receipt);
      return receipt;
    },
    persistExecutionReceipt: async (receipt) => {
      state.executionReceiptCount += 1;
      return receipt;
    },
    now: () => COMPLETED_AT,
  });
  return Object.freeze({
    executor,
    state,
    calls,
    closedTurns,
    classificationErrors,
  });
};

describe('production agent evaluation attempt executor', () => {
  it('hard-gates transport retry to one invocation per provider turn', () => {
    expect(() =>
      createAgentEvaluationAttemptRetryPolicy({
        maximumAttempts: 2,
        retryableStatuses: ['provider-error'],
      })
    ).toThrow(/one transport attempt/u);
    expect(
      createAgentEvaluationAttemptRetryPolicy({
        maximumAttempts: 1,
        retryableStatuses: ['provider-error', 'infrastructure-error'],
      })
    ).toMatchObject({ maximumAttempts: 1 });
  });

  it('binds the canonical full Verification AttemptGrant cell set', async () => {
    const plan = createV8EvaluationPlan();
    const material = materialFor(plan);
    const descriptor = descriptorFor(plan, material, 'openai-responses');
    const receipts = Object.freeze([
      verificationGrantFor(plan, descriptor, 'diagnostics'),
      verificationGrantFor(plan, descriptor, 'integration'),
    ]);
    const state = harness({
      plan,
      material,
      descriptor,
      materialFailure: new Error('protected material unavailable'),
      verificationAttemptGrantReceipts: receipts,
    });

    const result = await state.executor.execute({ plan, descriptor });

    expect(result.attempt.verificationAttemptGrantReceiptSetDigest).toBe(
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(receipts)
    );
    expect(
      result.executionReceipt.verificationAttemptGrantReceiptSetDigest
    ).toBe(result.attempt.verificationAttemptGrantReceiptSetDigest);
    expect(() =>
      harness({
        plan,
        material,
        descriptor,
        verificationAttemptGrantReceipts: Object.freeze([
          receipts[0]!,
          receipts[0]!,
        ]),
      })
    ).toThrow(/receipts are invalid|identities are duplicated/u);

    const driftedDescriptor = descriptorFor(
      plan,
      material,
      'anthropic-messages'
    );
    const drifted = harness({
      plan,
      material,
      descriptor,
      verificationAttemptGrantReceipts: Object.freeze([
        receipts[0]!,
        verificationGrantFor(plan, driftedDescriptor, 'integration'),
      ]),
    });
    await expect(
      drifted.executor.execute({ plan, descriptor })
    ).rejects.toThrow(/AttemptGrant binding drifted/u);
  }, 30_000);

  it('finalizes a verification grant failure before executor construction', async () => {
    const plan = createV8EvaluationPlan();
    const material = materialFor(plan);
    const descriptor = descriptorFor(plan, material, 'openai-responses');
    const state = persistenceState();
    const classifiedErrors: string[] = [];
    const finalizer = createAgentEvaluationPreDispatchAttemptFinalizer({
      classifyPreDispatchFailure: async (input) => {
        if (input.caught instanceof Error) {
          classifiedErrors.push(input.caught.message);
        }
        return Object.freeze({
          reasonCode: input.suggestedReasonCode,
          findingDigest: digestAgentCanonicalValue({
            stage: input.stage,
            reasonCode: input.suggestedReasonCode,
            inputDigest: input.inputDigest,
          }),
        });
      },
      persistPreDispatchFailureReceipt: async (receipt) => {
        state.preDispatchFailures.push(receipt);
        return receipt;
      },
      persistCapabilityExecutionReceipt: async (receipt) => {
        state.capabilityExecutions.push(receipt);
        return receipt;
      },
      persistInvocationTurnReceipt: async (receipt) => {
        state.invocationTurns.push(receipt);
        return receipt;
      },
      persistExecutionReceipt: async (receipt) => {
        state.executionReceiptCount += 1;
        return receipt;
      },
      now: () => COMPLETED_AT,
    });

    const result = await finalizer.execute({
      plan,
      descriptor,
      stage: 'dispatch-admission',
      suggestedReasonCode: 'verification-attempt-grant-unavailable',
      policyDigest: digestAgentCanonicalValue('grant-admission.test'),
      inputDigest: descriptor.descriptorDigest,
      verificationAttemptGrantReceiptSetDigest:
        digestAgentEvaluationVerificationAttemptGrantReceiptSet([]),
      caught: new Error('private grant backend detail'),
    });

    expect(result.attempt).toMatchObject({
      status: 'infrastructure-error',
      outcome: 'inconclusive',
    });
    expect(result.demand.modelInvocations).toBe(0);
    expect(result.transportDispatchIntents).toEqual([]);
    expect(result.transportReceipts).toEqual([]);
    expect(result.sourceReceipts).toEqual([]);
    expect(result.preDispatchFailureReceipts).toEqual(
      state.preDispatchFailures
    );
    expect(result.capabilityExecutionReceipts).toEqual(
      state.capabilityExecutions
    );
    expect(result.invocationTurnReceipts).toEqual(state.invocationTurns);
    expect(result.preDispatchFailureReceipts[0]).toMatchObject({
      stage: 'dispatch-admission',
      reasonCode: 'verification-attempt-grant-unavailable',
    });
    expect(result.invocationTurnReceipts[0]).toMatchObject({
      dispatchState: 'not-created',
      terminal: true,
      executionFailureAuthorityReceiptDigest:
        result.preDispatchFailureReceipts[0]!.receiptDigest,
    });
    expect(result.capabilityExecutionReceipts[0]).toMatchObject({
      capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
      outcome: 'failed',
      verdict: 'failed',
    });
    expect(result.attempt.capabilityExecutionReceiptSetDigest).toBe(
      result.executionReceipt.capabilityExecutionReceiptSetDigest
    );
    expect(state.executionReceiptCount).toBe(1);
    expect(classifiedErrors).toEqual(['private grant backend detail']);
    expect(JSON.stringify(result)).not.toContain(
      'private grant backend detail'
    );
  }, 30_000);

  it('persists a sanitized not-created denominator when protected material resolution fails', async () => {
    const plan = createV8EvaluationPlan();
    const material = materialFor(plan);
    const descriptor = descriptorFor(plan, material, 'openai-responses');
    const state = harness({
      plan,
      material,
      descriptor,
      materialFailure: new Error('secret backend path and detail'),
    });

    const estimate = state.executor.estimateShard({
      plan,
      descriptors: [descriptor],
    });
    const result = await state.executor.execute({ plan, descriptor });

    expect(estimate).toMatchObject({
      modelInvocations: 2,
      toolCalls: 1,
      repairRounds: 1,
      artifactBytes: 1_048_576,
    });
    expect(state.calls).toEqual([]);
    expect(result.attempt).toMatchObject({
      status: 'infrastructure-error',
      outcome: 'inconclusive',
    });
    expect(result.demand.modelInvocations).toBe(0);
    expect(result.preDispatchFailureReceipts).toHaveLength(1);
    expect(result.capabilityExecutionReceipts).toHaveLength(1);
    expect(result.capabilityExecutionReceipts[0]).toMatchObject({
      capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
      outcome: 'failed',
      verdict: 'failed',
      turnIndex: 0,
    });
    expect(result.attempt.capabilityExecutionReceiptSetDigest).toBe(
      result.executionReceipt.capabilityExecutionReceiptSetDigest
    );
    expect(result.preDispatchFailureReceipts[0]).toMatchObject({
      stage: 'protected-material-resolution',
      reasonCode: 'protected-material-unavailable',
    });
    expect(JSON.stringify(result.preDispatchFailureReceipts)).not.toContain(
      'secret backend path'
    );
    expect(result.invocationTurnReceipts).toHaveLength(1);
    expect(result.invocationTurnReceipts[0]).toMatchObject({
      dispatchState: 'not-created',
      terminal: true,
      executionFailureAuthorityReceiptDigest:
        result.preDispatchFailureReceipts[0]!.receiptDigest,
    });
    expect(result.transportDispatchIntents).toEqual([]);
    expect(result.transportReceipts).toEqual([]);
    expect(result.sourceReceipts).toEqual([]);
    expect(state.state.preDispatchFailures).toEqual(
      result.preDispatchFailureReceipts
    );
    expect(state.state.capabilityExecutions).toEqual(
      result.capabilityExecutionReceipts
    );
    expect(state.state.invocationTurns).toEqual(result.invocationTurnReceipts);
    expect(state.state.executionReceiptCount).toBe(1);
  }, 30_000);

  it('counts a post-dispatch unknown terminal failure and resumes it without provider recall', async () => {
    const plan = createV8EvaluationPlan();
    const material = materialFor(plan);
    const descriptor = descriptorFor(plan, material, 'openai-responses');
    const first = harness({ plan, material, descriptor });

    const result = await first.executor.execute({ plan, descriptor });

    expect(first.calls).toEqual(['openai-responses']);
    expect(first.closedTurns).toHaveLength(1);
    expect(first.classificationErrors).toEqual([]);
    expect(result.preDispatchFailureReceipts).toEqual([]);
    expect(result.attempt).toMatchObject({
      status: 'infrastructure-error',
      outcome: 'inconclusive',
    });
    expect(result.demand.modelInvocations).toBe(1);
    expect(result.transportReceipts).toHaveLength(1);
    expect(result.transportReceipts[0]).toMatchObject({
      dispatchState: 'dispatched',
      outcome: 'post-dispatch-unknown',
    });
    expect(result.invocationTurnReceipts).toHaveLength(1);
    expect(result.invocationTurnReceipts[0]).toMatchObject({
      dispatchState: 'dispatched',
      terminal: true,
      executionFailureAuthorityReceiptDigest:
        result.transportReceipts[0]!.receiptDigest,
    });
    expect(result.invocationTurnSetReceipt.dispatchedInvocationCount).toBe(1);
    expect(result.capabilityExecutionReceipts).toHaveLength(1);
    expect(result.capabilityExecutionReceipts[0]).toMatchObject({
      outcome: 'failed',
      verdict: 'failed',
    });
    expect(result.sourceReceipts).toHaveLength(2);
    expect(result.sourceReceipts).toEqual(first.state.sourceReceipts);
    expect(result.providerResultSpoolReceipts).toEqual([]);

    const resumed = harness({ plan, material, descriptor });
    const replay = await resumed.executor.resume({
      plan,
      descriptor,
      turns: first.closedTurns,
    });

    expect(resumed.calls).toEqual([]);
    expect(resumed.closedTurns).toEqual([]);
    expect(replay.attempt.status).toBe('infrastructure-error');
    expect(replay.demand.modelInvocations).toBe(1);
    expect(replay.transportReceipts).toEqual(
      first.closedTurns.map(({ transportReceipt }) => transportReceipt)
    );
    expect(replay.invocationTurnSetReceipt.dispatchedInvocationCount).toBe(1);
  }, 30_000);

  it('keeps a post-invocation accounting invariant failure out of the pre-dispatch authority path', async () => {
    const plan = createV8EvaluationPlan();
    const material = materialFor(plan);
    const descriptor = descriptorFor(plan, material, 'openai-responses');
    const state = harness({
      plan,
      material,
      descriptor,
      accountingFailure: new Error('accounting persistence failed'),
    });

    await expect(state.executor.execute({ plan, descriptor })).rejects.toThrow(
      'accounting persistence failed'
    );
    expect(state.calls).toEqual(['openai-responses']);
    expect(state.closedTurns).toHaveLength(1);
    expect(state.state.preDispatchFailures).toEqual([]);
    expect(state.classificationErrors).toEqual([]);
  }, 30_000);
});
