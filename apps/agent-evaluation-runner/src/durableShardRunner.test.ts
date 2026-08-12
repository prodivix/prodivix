import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  createAgentBudgetLedger,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationCapabilityExecutionReceipt,
  createAgentEvaluationExecutionReceipt,
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolDispositionReceipt,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationProviderResultSpoolId,
  createAgentEvaluationProviderResultSpoolReceipt,
  createAgentEvaluationSourceReceipt,
  createAgentEvaluationTransportAttemptReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  createAgentEvaluationTransportRetryReceipt,
  createAgentModelEvaluationAttempt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  digestAgentEvaluationAttemptGrading,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationProviderResultSpoolAad,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  normalizeAgentCosts,
  planAgentModelEvaluationAttempts,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationProviderResultSpoolDispositionReceipt,
  type AgentEvaluationRepositoryWriteResult,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationShardCheckpoint,
  type AgentEvaluationShardLease,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationTransportReceipt,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentModelInvocationReceipt,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  encodeVerificationPlan,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  V8_TIME,
  createPassingV8Attempts,
  createV8EvaluationPlan,
} from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  AgentEvaluationDurableShardRunner,
  type AgentEvaluationDurableAttemptExecutorFactory,
  type AgentEvaluationDurableAttemptExecutorResult,
  type AgentEvaluationDurableEncryptedResultSpool,
  type AgentEvaluationDurableReceiptPersistence,
  type AgentEvaluationDurableResultSpoolRead,
  type AgentEvaluationDurableShardLedger,
  type AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import {
  createAgentEvaluationPreDispatchAttemptFinalizer,
  type AgentEvaluationPreDispatchAttemptFinalizer,
} from './attemptExecutor';
import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_ISSUE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  type AgentEvaluationVerificationAttemptGrantIssueInput,
  type AgentEvaluationVerificationAttemptGrantIssuer,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from './verificationAttemptGrantClient';

const plan = createV8EvaluationPlan();
const allDescriptors = planAgentModelEvaluationAttempts(plan);
const descriptor = allDescriptors.find((candidate) =>
  plan.concreteCases
    .find(({ caseId }) => caseId === candidate.caseId)
    ?.capabilityDescriptor.capabilityId.startsWith('provider.')
)!;
const shardDescriptors = allDescriptors.filter(
  ({ shardId }) => shardId === descriptor.shardId
);
const seededAttempts = createPassingV8Attempts(plan).filter(
  ({ descriptor: candidate }) =>
    candidate.shardId === descriptor.shardId &&
    candidate.attemptId !== descriptor.attemptId
);

const ATTEMPT_AT = V8_TIME.started;
const DISPOSED_AT = V8_TIME.completed;
const NAMESPACE_ID = 'evaluation-runner-test';
const namespaceDigest = digestAgentCanonicalValue({
  format: 'prodivix.g4-model-evaluation-response-spool-namespace',
  version: 1,
  namespaceId: NAMESPACE_ID,
});
const toolReceiptSetDigestFor = (toolCallCount: number) =>
  digestAgentCanonicalValue({
    fixture: 'tool-receipt-set.test',
    toolCallCount,
  });

const reservationIdFor = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor
) =>
  `evaluation-reservation.${digestAgentCanonicalValue({
    planDigest: currentPlan.planDigest,
    shardId: currentDescriptor.shardId,
    descriptorDigest: currentDescriptor.descriptorDigest,
  }).slice('sha256-'.length)}`;

const accountingFor = (
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  kind: 'completed' | 'provider-error' | 'post-dispatch-unknown'
) => {
  if (kind !== 'completed') {
    return Object.freeze({
      usage: createAgentUsageVector([]),
      cost: normalizeAgentCosts([]),
    });
  }
  const usageSourceDigest = digestAgentCanonicalValue({
    descriptorDigest: currentDescriptor.descriptorDigest,
    source: 'usage',
  });
  const costSourceDigest = digestAgentCanonicalValue({
    descriptorDigest: currentDescriptor.descriptorDigest,
    source: 'cost',
  });
  return Object.freeze({
    usage: createAgentUsageVector([
      Object.freeze({
        unit: 'text-token-input',
        logicalAmount: '1',
        billableAmount: '1',
        confidence: 'reported',
        sourceDigest: usageSourceDigest,
      }),
    ]),
    cost: normalizeAgentCosts([
      Object.freeze({
        currency: 'USD',
        amount: '0.000001',
        confidence: 'reported',
        sourceDigest: costSourceDigest,
      }),
    ]),
  });
};

type ExecutionKind = 'completed' | 'provider-error' | 'post-dispatch-unknown';

const demandFor = (
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  kind: ExecutionKind,
  completedToolCallCount = 2
): AgentBudgetDemand => {
  const accounting = accountingFor(currentDescriptor, kind);
  return Object.freeze({
    usage: accounting.usage,
    cost: accounting.cost,
    modelInvocations: kind === 'provider-error' ? 0 : 1,
    toolCalls: kind === 'completed' ? completedToolCallCount : 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
  });
};

const withReceiptDigest = <T extends Readonly<Record<string, unknown>>>(
  base: T
) => Object.freeze({ ...base, receiptDigest: digestAgentCanonicalValue(base) });

const contextFor = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor
) => {
  const target = currentPlan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === currentDescriptor.targetId
  )!;
  const provider = currentPlan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target.providerConfigurationId
  )!;
  const model = currentPlan.modelConfigurations.find(
    ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
  )!;
  const concreteCase = currentPlan.concreteCases.find(
    ({ caseId }) => caseId === currentDescriptor.caseId
  )!;
  const suffix = currentDescriptor.samplingIdentityDigest.slice(
    'sha256-'.length
  );
  return { target, provider, model, concreteCase, suffix };
};

const capabilityFixtureFor = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor
) => {
  const concreteCase = currentPlan.concreteCases.find(
    ({ caseId }) => caseId === currentDescriptor.caseId
  );
  const capability = concreteCase?.capabilityDescriptor;
  if (!capability) {
    throw new Error('Durable capability fixture is unavailable.');
  }
  return capability;
};

const createCapabilityExecutionReceipt = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  turn: AgentEvaluationInvocationTurnReceipt
): AgentEvaluationCapabilityExecutionReceipt => {
  const { target, concreteCase, suffix } = contextFor(
    currentPlan,
    currentDescriptor
  );
  const capability = capabilityFixtureFor(currentPlan, currentDescriptor);
  return createAgentEvaluationCapabilityExecutionReceipt({
    capabilityExecutionReceiptId: `capability-execution.${suffix}`,
    planDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    attemptId: currentDescriptor.attemptId,
    descriptorDigest: currentDescriptor.descriptorDigest,
    turnIndex: turn.turnIndex,
    invocationId: turn.invocationId,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    targetId: target.targetId,
    targetDigest: target.targetDigest,
    capabilityProfileId: concreteCase.capabilityProfileId,
    capabilityId: capability.capabilityId,
    supportExpectation: capability.supportExpectation,
    expectedToolIds: capability.expectedToolIds,
    expectedReceiptKinds: capability.expectedReceiptKinds,
    capabilityDescriptorDigest: capability.descriptorDigest,
    toolBindings: Object.freeze([]),
    outcome: 'failed',
    verdict: 'failed',
    specificReceiptDigests: Object.freeze([]),
    attemptAuthorityOwnerReceiptDigests: Object.freeze([]),
    policyDigest: currentPlan.policyDigest,
    toolRegistryDigest: currentPlan.toolRegistryDigest,
    observedAt: ATTEMPT_AT,
  });
};

const createDispatchIntent = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  kind: ExecutionKind,
  completedToolCallCount = 2,
  turnIndex = 0
): AgentEvaluationTransportDispatchIntent => {
  const { target, provider, model, suffix } = contextFor(
    currentPlan,
    currentDescriptor
  );
  const turnSuffix = turnIndex === 0 ? '' : `.turn-${turnIndex}`;
  return createAgentEvaluationTransportDispatchIntent({
    intentId: `intent.${suffix}${turnSuffix}`,
    planDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    attemptId: currentDescriptor.attemptId,
    descriptorDigest: currentDescriptor.descriptorDigest,
    turnIndex,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    invocationId: `invocation.${suffix}${turnSuffix}`,
    budgetReservationId: reservationIdFor(currentPlan, currentDescriptor),
    demandDigest: digestAgentCanonicalValue(
      demandFor(currentDescriptor, kind, completedToolCallCount)
    ),
    requestDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      turnIndex,
      artifact: 'request',
    }),
    endpointId: `endpoint.${provider.providerConfigurationId}`,
    endpointClass:
      target.protocolFamily === 'openai-compatible'
        ? 'local'
        : 'first-party-hosted',
    requestBodyDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      turnIndex,
      body: 'provider-request',
    }),
    requestBytes: 128,
    createdAt: ATTEMPT_AT,
  });
};

const createTransport = (
  intent: AgentEvaluationTransportDispatchIntent,
  kind: ExecutionKind
): AgentEvaluationTransportReceipt => {
  if (kind === 'provider-error') {
    return createAgentEvaluationTransportReceipt({
      receiptId: `transport.failed.${intent.invocationId}`,
      protocolFamily: intent.protocolFamily,
      providerConfigurationId: intent.providerConfigurationId,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: intent.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseBytes: 0,
      sseEventCount: 0,
      dispatchState: 'not-dispatched',
      outcome: 'failed',
      errorCategory: 'G4_RUNNER_PROVIDER_AUTH_REJECTED',
      startedAt: ATTEMPT_AT,
      completedAt: ATTEMPT_AT,
    });
  }
  if (kind === 'post-dispatch-unknown') {
    return createAgentEvaluationTransportReceipt({
      receiptId: `transport.unknown.${intent.invocationId}`,
      protocolFamily: intent.protocolFamily,
      providerConfigurationId: intent.providerConfigurationId,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: intent.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseBytes: 0,
      sseEventCount: 0,
      dispatchState: 'dispatched',
      outcome: 'post-dispatch-unknown',
      errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
      startedAt: ATTEMPT_AT,
      completedAt: ATTEMPT_AT,
    });
  }
  return createAgentEvaluationTransportReceipt({
    receiptId: `transport.completed.${intent.invocationId}`,
    protocolFamily: intent.protocolFamily,
    providerConfigurationId: intent.providerConfigurationId,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    requestDigest: intent.requestDigest,
    endpointId: intent.endpointId,
    endpointClass: intent.endpointClass,
    requestBodyDigest: intent.requestBodyDigest,
    requestBytes: intent.requestBytes,
    responseBytes: 256,
    httpStatus: 200,
    responseHeaderDigest: digestAgentCanonicalValue({
      invocationId: intent.invocationId,
      headers: 'sanitized',
    }),
    responseBodyDigest: digestAgentCanonicalValue({
      invocationId: intent.invocationId,
      body: 'provider-response',
    }),
    providerRequestId: `provider-request.${intent.invocationId}`,
    providerIdentityKind:
      intent.protocolFamily === 'anthropic-messages'
        ? 'message-id'
        : intent.protocolFamily === 'gemini-interactions'
          ? 'interaction-id'
          : 'response-id',
    providerResponseId: `provider-response.${intent.invocationId}`,
    resolvedModelId: 'resolved-model.test',
    resolvedModelVersion: '2026-08-01',
    sseEventCount: 2,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: ATTEMPT_AT,
    completedAt: ATTEMPT_AT,
  });
};

const createEncryptedSpool = (
  persistence: AgentEvaluationDurableReceiptPersistence,
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  intent: AgentEvaluationTransportDispatchIntent,
  transport: AgentEvaluationTransportReceipt
): AgentEvaluationDurableEncryptedResultSpool => {
  if (!transport.responseBodyDigest) {
    throw new Error('Completed transport fixture is missing a body digest.');
  }
  const aad = createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: persistence.namespaceDigest,
    planDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    attemptId: currentDescriptor.attemptId,
    descriptorDigest: currentDescriptor.descriptorDigest,
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    responseBodyDigest: transport.responseBodyDigest,
    normalizedEventSetDigest: digestAgentCanonicalValue({
      invocationId: intent.invocationId,
      events: ['created', 'completed'],
    }),
  });
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationProviderResultSpoolId(aad),
    algorithm: 'aes-256-gcm',
    keyId: 'key.g4-model-eval.result-spool.test',
    keyVersion: 1,
    keyRefDigest: digestAgentCanonicalValue('spool-key-ref.test'),
    encryptionProfileDigest: digestAgentCanonicalValue(
      'spool-encryption-profile.test'
    ),
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQID',
    aadDigest: digestAgentEvaluationProviderResultSpoolAad(aad),
  });
  return Object.freeze({
    aad,
    envelope,
    responseDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      artifact: 'response',
    }),
    retentionPolicyDigest: digestAgentCanonicalValue(
      'attempt-resume-only.test'
    ),
    expiresAt: V8_TIME.expires,
  });
};

const createSourceReceipts = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  providerRequestId: string,
  usage: ReturnType<typeof createAgentUsageVector>,
  cost: ReturnType<typeof normalizeAgentCosts>
): readonly AgentEvaluationSourceReceipt[] => {
  const { provider, model, suffix } = contextFor(
    currentPlan,
    currentDescriptor
  );
  const usageContentDigest = usage.amounts[0]?.sourceDigest;
  const costContentDigest = cost[0]?.sourceDigest;
  if (!usageContentDigest || !costContentDigest) {
    throw new Error('Completed accounting fixture is missing source digests.');
  }
  return Object.freeze([
    createAgentEvaluationSourceReceipt({
      sourceReceiptId: `source.usage.${suffix}`,
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      sourceKind: 'provider-reported-usage',
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: model.lineageDigest,
      providerRequestId,
      sourceContentDigest: usageContentDigest,
      inputUsageDigest: usage.vectorDigest,
      observedAt: ATTEMPT_AT,
    }),
    createAgentEvaluationSourceReceipt({
      sourceReceiptId: `source.cost.${suffix}`,
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      sourceKind: 'provider-reported-cost',
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: model.lineageDigest,
      providerRequestId,
      sourceContentDigest: costContentDigest,
      outputCostDigest: digestAgentEvaluationCostValues(cost),
      observedAt: ATTEMPT_AT,
    }),
  ]);
};

const createSubmissionAndRuntime = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  invocationId: string,
  verificationClosureDigest: string,
  toolCallCount: number,
  verificationAttemptGrantReceiptDigests: readonly string[]
) => {
  const { concreteCase, suffix } = contextFor(currentPlan, currentDescriptor);
  const materialDigest = digestAgentCanonicalValue({
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    material: 'durable-runner-test',
  });
  const resultSubmissionReceipt: AgentEvaluationResultSubmissionReceipt =
    withReceiptDigest({
      format: 'prodivix.agent-evaluation-result-submission-receipt' as const,
      version: 1 as const,
      attemptId: currentDescriptor.attemptId,
      invocationId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
      nativeToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
      toolVersion: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
      schemaDigest: digestAgentCanonicalValue('result-schema.test'),
      inputSchemaDigest: digestAgentCanonicalValue('result-input.test'),
      toolDefinitionDigest: digestAgentCanonicalValue(
        'result-tool-definition.test'
      ),
      providerToolCallId: `provider-tool-call.${suffix}`,
      toolArgumentsDigest: digestAgentCanonicalValue('result-arguments.test'),
      toolEventSequence: 1,
      toolEventDigest: digestAgentCanonicalValue('result-tool-event.test'),
      terminalEventSequence: 2,
      terminalEventDigest: digestAgentCanonicalValue('terminal-event.test'),
      submissionDigest: digestAgentCanonicalValue('submission.test'),
    });
  const isolationPolicyDigest = digestAgentCanonicalValue(
    'runtime-isolation.test'
  );
  const ownerAuthorityReceiptDigests = Object.freeze(
    [
      digestAgentCanonicalValue('owner-authority.test'),
      ...verificationAttemptGrantReceiptDigests,
    ].sort(compareUnicodeCodePoints)
  );
  const operationSealReceiptDigests = Object.freeze(
    Array.from({ length: toolCallCount }, (_, index) =>
      digestAgentCanonicalValue({
        fixture: 'operation-seal.test',
        index,
      })
    ).sort(compareUnicodeCodePoints)
  );
  const canonicalVerificationAttemptGrantReceiptDigests = Object.freeze(
    [...verificationAttemptGrantReceiptDigests].sort(compareUnicodeCodePoints)
  );
  const controlledRuntimeReceipt: AgentEvaluationControlledRuntimeReceipt =
    withReceiptDigest({
      format: 'prodivix.agent-evaluation-controlled-runtime-receipt' as const,
      version: 1 as const,
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      submissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
      runtimeAuthorityId: 'controlled-runtime.durable-test',
      runtimeImplementationDigest: digestAgentCanonicalValue(
        'controlled-runtime.test'
      ),
      artifactResolutionPolicyDigest: digestAgentCanonicalValue(
        'artifact-resolution.test'
      ),
      proposalValidationPolicyDigest: digestAgentCanonicalValue(
        'proposal-validation.test'
      ),
      isolationPolicyDigest,
      g3VerificationPolicyDigest: digestAgentCanonicalValue(
        'g3-verification.test'
      ),
      controlledRenderPolicyDigest: digestAgentCanonicalValue(
        'controlled-render.test'
      ),
      loopPolicyDigest: digestAgentCanonicalValue('loop-policy.test'),
      maximumTurnsPerAttempt: 4,
      maximumToolCallsPerAttempt: 2,
      maximumRepairRoundsPerAttempt: 1,
      maximumAggregateArtifactBytes: 1,
      verificationAttemptGrantReceiptDigests:
        canonicalVerificationAttemptGrantReceiptDigests,
      verificationAttemptGrantReceiptSetDigest:
        digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet(
          canonicalVerificationAttemptGrantReceiptDigests
        )!,
      grantDigest: digestAgentCanonicalValue('runtime-grant.test'),
      grantGeneration: 1,
      toolRegistryDigest: digestAgentCanonicalValue('tool-registry.test'),
      actionRegistryDigest: digestAgentCanonicalValue('action-registry.test'),
      operationSealReceiptDigests,
      ownerAuthorityReceiptDigests,
      baseSnapshotDigest: digestAgentCanonicalValue('base-snapshot.test'),
      finalSnapshotDigest: digestAgentCanonicalValue('final-snapshot.test'),
      cleanupReceiptDigest: digestAgentCanonicalValue('cleanup.test'),
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      ...(toolCallCount > 0
        ? {
            toolExecutionReceiptSetDigest: digestAgentCanonicalValue({
              fixture: 'tool-execution-receipt-set.test',
              toolCallCount,
            }),
            continuationReceiptSetDigest: digestAgentCanonicalValue({
              fixture: 'continuation-receipt-set.test',
              toolCallCount,
            }),
            operationIntentSetDigest: digestAgentCanonicalValue({
              fixture: 'operation-intent-set.test',
              toolCallCount,
            }),
            operationSealSetDigest: digestAgentCanonicalValue({
              operationSealReceiptDigests,
            }),
          }
        : {}),
      ownerAuthoritySetDigest: digestAgentCanonicalValue({
        ownerAuthorityReceiptDigests,
      }),
      artifactResolution: Object.freeze({
        resolvedArtifactCount: 0,
        resolvedArtifactBytes: 0,
        artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
          artifactPersistenceReceiptDigests: [],
        }),
      }),
      proposalValidation: Object.freeze({
        verdict: 'passed' as const,
        typedProposalValidationReceiptDigest: digestAgentCanonicalValue(
          'typed-proposal-validation.test'
        ),
      }),
      isolatedExecution: Object.freeze({
        isolationPolicyDigest,
        toolCallCount,
        ...(toolCallCount > 0
          ? { toolReceiptSetDigest: toolReceiptSetDigestFor(toolCallCount) }
          : {}),
        repairRoundCount: 0,
        commandCount: 0,
        commandReceiptSetDigest: digestAgentCanonicalValue({
          commandReceiptDigests: [],
        }),
        transactionCount: 0,
      }),
      g3Verification: Object.freeze({
        verificationPlanReceiptDigest: digestAgentCanonicalValue(
          'verification-plan.test'
        ),
        verificationClosureDigest,
        verdict: 'passed' as const,
      }),
    });
  return { resultSubmissionReceipt, controlledRuntimeReceipt };
};

const stageEvidence = async (
  persistence: AgentEvaluationDurableReceiptPersistence,
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  turnRecord: Extract<AgentEvaluationDurableTurnRecord, { state: 'closed' }>,
  kind: ExecutionKind,
  stopAfterFirstSource = false,
  completedToolCallCount = 2,
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[],
  shardLeaseOwnerId = 'evaluation-worker.test'
): Promise<AgentEvaluationDurableAttemptExecutorResult> => {
  const { target, provider, model, concreteCase, suffix } = contextFor(
    currentPlan,
    currentDescriptor
  );
  const intent = turnRecord.dispatchIntent;
  const transport = turnRecord.transportReceipt;
  const accounting = accountingFor(currentDescriptor, kind);
  const completed = kind === 'completed';
  const dispatched = transport.dispatchState === 'dispatched';
  const independentRunId = `run.${suffix}`;
  const responseDigest = completed
    ? turnRecord.resultSpoolReceipt?.responseDigest
    : undefined;
  const invocationReceipt: AgentModelInvocationReceipt | undefined = dispatched
    ? withReceiptDigest({
        invocationId: intent.invocationId,
        taskId: currentPlan.evaluationPlanId,
        runId: independentRunId,
        generation: 0,
        attempt: 1,
        provider,
        model,
        capabilityQualificationDigest: target.qualificationSliceDigest,
        inferenceConfigurationDigest: target.inferenceConfigurationDigest,
        contextPackDigest: digestAgentCanonicalValue({
          descriptorDigest: currentDescriptor.descriptorDigest,
          context: 'durable-test',
        }),
        requestDigest: intent.requestDigest,
        ...(responseDigest ? { responseDigest } : {}),
        outcome: completed
          ? ('completed' as const)
          : ('provider-error' as const),
        usage: accounting.usage,
        costStatus: completed ? ('priced' as const) : ('unknown' as const),
        cost: accounting.cost,
        startedAt: ATTEMPT_AT,
        completedAt: ATTEMPT_AT,
      })
    : undefined;
  const sourceReceipts =
    completed && transport.providerRequestId
      ? createSourceReceipts(
          currentPlan,
          currentDescriptor,
          transport.providerRequestId,
          accounting.usage,
          accounting.cost
        )
      : Object.freeze([]);
  const verificationClosureDigest = digestAgentCanonicalValue({
    descriptorDigest: currentDescriptor.descriptorDigest,
    closure: 'g3-test',
  });
  const completionReceipts = completed
    ? createSubmissionAndRuntime(
        currentPlan,
        currentDescriptor,
        intent.invocationId,
        verificationClosureDigest,
        completedToolCallCount,
        verificationAttemptGrantReceipts.map(
          ({ receiptDigest }) => receiptDigest
        )
      )
    : undefined;
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest: intent.requestDigest,
    status:
      kind === 'completed'
        ? 'completed'
        : kind === 'provider-error'
          ? 'provider-error'
          : 'infrastructure-error',
    retryable: !completed,
    ...(invocationReceipt
      ? { invocationReceiptDigest: invocationReceipt.receiptDigest }
      : {}),
    ...(responseDigest ? { responseDigest } : {}),
    startedAt: ATTEMPT_AT,
    completedAt: ATTEMPT_AT,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digestAgentCanonicalValue('single-turn-retry.test'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: !completed,
  });
  const resolvedModelIdentityDigest = dispatched
    ? digestAgentEvaluationResolvedModelIdentity({
        protocolFamily: target.protocolFamily,
        transportReceiptDigest: transport.receiptDigest,
        frozenModelId: model.modelId,
        ...(model.immutableVersion
          ? { frozenImmutableModelVersion: model.immutableVersion }
          : {}),
        ...(transport.resolvedModelId
          ? { resolvedModelId: transport.resolvedModelId }
          : {}),
        ...(transport.resolvedModelVersion
          ? { resolvedModelVersion: transport.resolvedModelVersion }
          : {}),
      })
    : undefined;
  let invocationTurnReceipt: AgentEvaluationInvocationTurnReceipt;
  if (completed) {
    if (
      !invocationReceipt ||
      !transport.providerRequestId ||
      !transport.responseHeaderDigest ||
      !responseDigest ||
      !turnRecord.resultSpoolReceipt ||
      !completionReceipts
    ) {
      throw new Error('Completed durable turn fixture is incomplete.');
    }
    invocationTurnReceipt = createAgentEvaluationInvocationTurnReceipt({
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      turnIndex: intent.turnIndex,
      invocationId: intent.invocationId,
      status: 'completed',
      dispatchState: 'dispatched',
      terminal: true,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      contextPackDigest: invocationReceipt.contextPackDigest,
      requestArtifactDigest: intent.requestDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      transportRetryReceipt,
      invocationReceipt,
      providerRequestId: transport.providerRequestId,
      ...(transport.resolvedModelId
        ? { resolvedModelId: transport.resolvedModelId }
        : {}),
      ...(transport.resolvedModelVersion
        ? { resolvedModelVersion: transport.resolvedModelVersion }
        : {}),
      resolvedModelIdentityDigest: resolvedModelIdentityDigest!,
      responseHeaderDigest: transport.responseHeaderDigest,
      responseArtifactDigest: responseDigest,
      providerResultSpoolReceiptDigest:
        turnRecord.resultSpoolReceipt.receiptDigest,
      usageSourceReceiptDigest: sourceReceipts[0]!.receiptDigest,
      costSourceReceiptDigest: sourceReceipts[1]!.receiptDigest,
      resultSubmissionReceiptDigest:
        completionReceipts.resultSubmissionReceipt.receiptDigest,
      controlledRuntimeReceiptDigest:
        completionReceipts.controlledRuntimeReceipt.receiptDigest,
    });
  } else if (dispatched && invocationReceipt && resolvedModelIdentityDigest) {
    invocationTurnReceipt = createAgentEvaluationInvocationTurnReceipt({
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      turnIndex: intent.turnIndex,
      invocationId: intent.invocationId,
      status: 'infrastructure-error',
      dispatchState: 'dispatched',
      terminal: true,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      contextPackDigest: invocationReceipt.contextPackDigest,
      requestArtifactDigest: intent.requestDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      transportRetryReceipt,
      invocationReceipt,
      resolvedModelIdentityDigest,
      executionFailureAuthorityReceiptDigest: digestAgentCanonicalValue({
        intentDigest: intent.intentDigest,
        outcome: 'post-dispatch-unknown',
      }),
    });
  } else {
    invocationTurnReceipt = createAgentEvaluationInvocationTurnReceipt({
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      turnIndex: intent.turnIndex,
      invocationId: intent.invocationId,
      status: 'provider-error',
      dispatchState: 'not-dispatched',
      terminal: true,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      contextPackDigest: digestAgentCanonicalValue({
        descriptorDigest: currentDescriptor.descriptorDigest,
        context: 'durable-test',
      }),
      requestArtifactDigest: intent.requestDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      transportRetryReceipt,
      executionFailureAuthorityReceiptDigest: digestAgentCanonicalValue({
        intentDigest: intent.intentDigest,
        outcome: 'provider-error',
      }),
    });
  }
  const capabilityExecutionReceipt = createCapabilityExecutionReceipt(
    currentPlan,
    currentDescriptor,
    invocationTurnReceipt
  );
  const capabilityExecutionReceiptSetDigest =
    digestAgentEvaluationCapabilityExecutionReceiptSet([
      capabilityExecutionReceipt,
    ]);
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationVerificationAttemptGrantReceiptSet(
      verificationAttemptGrantReceipts
    );
  const invocationTurnSetReceipt =
    createAgentEvaluationInvocationTurnSetReceipt({
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      turns: Object.freeze([invocationTurnReceipt]),
    });
  const status = invocationTurnReceipt.status;
  const executionReceipt = createAgentEvaluationExecutionReceipt({
    executionReceiptId: `execution.${suffix}`,
    planDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    attemptId: currentDescriptor.attemptId,
    descriptorDigest: currentDescriptor.descriptorDigest,
    modelInvocations: invocationTurnSetReceipt.dispatchedInvocationCount,
    toolCalls: completed ? completedToolCallCount : 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    ...(completed && completedToolCallCount > 0
      ? {
          toolReceiptSetDigest: toolReceiptSetDigestFor(completedToolCallCount),
        }
      : {}),
    ...(completed ? { verificationClosureDigest } : {}),
  });
  const attempt = createAgentModelEvaluationAttempt({
    descriptor: currentDescriptor,
    independentRunId,
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet([
      intent,
    ]),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet([
      transport,
    ]),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet([invocationTurnReceipt]),
    invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    ...(responseDigest ? { responseDigest } : {}),
    status,
    outcome: completed ? 'passed' : 'inconclusive',
    metricObservations: Object.freeze([
      createAgentEvaluationMetricObservation({
        metricId: currentPlan.thresholds.metrics[0]!.metricId,
        graderId: currentPlan.graderPlan.deterministicAuthorityGraderIds[0]!,
        graderKind: 'deterministic-rule',
        authority: 'deterministic',
        verdict: completed ? 'passed' : 'inconclusive',
      }),
    ]),
    usage: invocationTurnSetReceipt.aggregateUsage,
    cost: invocationTurnSetReceipt.aggregateCost,
    startedAt: ATTEMPT_AT,
    completedAt: ATTEMPT_AT,
  });
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: currentDescriptor.descriptorDigest,
    invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
    terminalTurnReceiptDigest: invocationTurnReceipt.evidenceDigest,
    capabilityExecutionReceiptDigest: capabilityExecutionReceipt.receiptDigest,
    ...(completionReceipts
      ? {
          resultSubmissionReceiptDigest:
            completionReceipts.resultSubmissionReceipt.receiptDigest,
          controlledRuntimeReceiptDigest:
            completionReceipts.controlledRuntimeReceipt.receiptDigest,
        }
      : {}),
    metricObservations: attempt.metricObservations,
    execution: Object.freeze({
      modelInvocations: executionReceipt.modelInvocations,
      toolCalls: executionReceipt.toolCalls,
      repairRounds: executionReceipt.repairRounds,
      transactions: executionReceipt.transactions,
      artifactBytes: executionReceipt.artifactBytes,
      capabilityExecutionReceiptSetDigest:
        executionReceipt.capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        executionReceipt.verificationAttemptGrantReceiptSetDigest,
      ...(executionReceipt.toolReceiptSetDigest
        ? { toolReceiptSetDigest: executionReceipt.toolReceiptSetDigest }
        : {}),
      ...(executionReceipt.transactionReceiptSetDigest
        ? {
            transactionReceiptSetDigest:
              executionReceipt.transactionReceiptSetDigest,
          }
        : {}),
      ...(executionReceipt.verificationClosureDigest
        ? {
            verificationClosureDigest:
              executionReceipt.verificationClosureDigest,
          }
        : {}),
    }),
  });
  const verificationAttemptGrant = verificationAttemptGrantReceipts[0];
  if (!verificationAttemptGrant) {
    throw new Error('Verification attempt grant fixture is unavailable.');
  }
  const gradingOwnerReceipt = createAgentEvaluationAttemptAuthorityOwnerReceipt(
    {
      serviceKind: 'attempt-grading',
      operation: 'grade-and-persist',
      namespaceId: verificationAttemptGrant.namespaceId,
      planDigest: currentPlan.planDigest,
      repositoryCommit: currentPlan.repositoryCommit,
      attemptId: currentDescriptor.attemptId,
      descriptorDigest: currentDescriptor.descriptorDigest,
      shardLeaseOwnerId,
      shardLeaseGeneration: verificationAttemptGrant.generation,
      verificationGrantGeneration: verificationAttemptGrant.generation,
      verificationAttemptGrantReceiptSetDigest,
      requestDigest: digestAgentCanonicalValue({
        operation: 'grade-and-persist',
        descriptorDigest: currentDescriptor.descriptorDigest,
      }),
      responseProjection:
        createAgentEvaluationAttemptAuthorityResponseProjection(
          'attempt-grading',
          'grade-and-persist',
          Object.freeze({
            metricObservations: attempt.metricObservations,
            gradingDigest,
          })
        ),
      ownerImplementationDigest: digestAgentCanonicalValue(
        'attempt-grading.test'
      ),
      completedAt: ATTEMPT_AT,
    }
  );
  const disposition:
    AgentEvaluationProviderResultSpoolDispositionReceipt | undefined =
    turnRecord.resultSpoolReceipt
      ? createAgentEvaluationProviderResultSpoolDispositionReceipt({
          spoolRef: turnRecord.resultSpoolReceipt.spoolRef,
          spoolReceiptDigest: turnRecord.resultSpoolReceipt.receiptDigest,
          planDigest: currentPlan.planDigest,
          repositoryCommit: currentPlan.repositoryCommit,
          attemptId: currentDescriptor.attemptId,
          descriptorDigest: currentDescriptor.descriptorDigest,
          turnIndex: intent.turnIndex,
          invocationId: intent.invocationId,
          disposition: 'consumed-and-destroyed',
          retentionPolicyDigest:
            turnRecord.resultSpoolReceipt.retentionPolicyDigest,
          disposedAt: DISPOSED_AT,
        })
      : undefined;

  for (const [index, receipt] of sourceReceipts.entries()) {
    await persistence.persistSourceReceipt(receipt);
    if (stopAfterFirstSource && index === 0) {
      throw new Error('local material projection failed');
    }
  }
  await persistence.persistInvocationTurnReceipt(invocationTurnReceipt);
  await persistence.persistCapabilityExecutionReceipt(
    capabilityExecutionReceipt
  );
  await persistence.persistAttemptAuthorityOwnerReceipt(gradingOwnerReceipt);
  if (disposition) {
    await persistence.stageResultSpoolDispositionReceipt(disposition);
  }
  if (completionReceipts) {
    await persistence.persistResultSubmissionReceipt(
      completionReceipts.resultSubmissionReceipt
    );
    await persistence.persistControlledRuntimeReceipt(
      completionReceipts.controlledRuntimeReceipt
    );
  }
  await persistence.persistExecutionReceipt(executionReceipt);

  return Object.freeze({
    attempt,
    demand: demandFor(currentDescriptor, kind, completedToolCallCount),
    sourceReceipts,
    transportDispatchIntents: Object.freeze([intent]),
    transportReceipts: Object.freeze([transport]),
    providerResultSpoolReceipts: Object.freeze(
      turnRecord.resultSpoolReceipt ? [turnRecord.resultSpoolReceipt] : []
    ),
    providerResultSpoolDispositionReceipts: Object.freeze(
      disposition ? [disposition] : []
    ),
    preDispatchFailureReceipts: Object.freeze([]),
    capabilityExecutionReceipts: Object.freeze([capabilityExecutionReceipt]),
    capabilitySpecificReceipts: Object.freeze([]),
    providerCapabilityObservationReceipts: Object.freeze([]),
    attemptAuthorityOwnerReceipts: Object.freeze([gradingOwnerReceipt]),
    invocationTurnReceipts: Object.freeze([invocationTurnReceipt]),
    invocationTurnSetReceipt,
    ...(completionReceipts
      ? {
          resultSubmissionReceipt: completionReceipts.resultSubmissionReceipt,
          controlledRuntimeReceipt: completionReceipts.controlledRuntimeReceipt,
        }
      : {}),
    executionReceipt,
    accountingDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      accounting: 'test',
    }),
    gradingDigest,
    payloadDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      payload: 'test',
    }),
    providerToolBindings: Object.freeze([]),
    providerToolResultBindings: Object.freeze([]),
  });
};

const stagePreDispatchFailureEvidence = async (
  persistence: AgentEvaluationDurableReceiptPersistence,
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  verificationAttemptGrantReceiptDigests: readonly string[]
): Promise<AgentEvaluationDurableAttemptExecutorResult> =>
  preDispatchAttemptFinalizer(persistence, () => ATTEMPT_AT).execute({
    plan: currentPlan,
    descriptor: currentDescriptor,
    stage: 'protected-material-resolution',
    suggestedReasonCode: 'protected-material-leak-blocked',
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet(
        verificationAttemptGrantReceiptDigests
      ),
    policyDigest: digestAgentCanonicalValue('protected-material-policy.test'),
    inputDigest: digestAgentCanonicalValue('protected-material-input.test'),
  });

const stageRecoveredContinuation = async (
  persistence: AgentEvaluationDurableReceiptPersistence,
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  turnRecord: Extract<AgentEvaluationDurableTurnRecord, { state: 'closed' }>
): Promise<AgentEvaluationInvocationTurnReceipt> => {
  const { target, provider, model, concreteCase, suffix } = contextFor(
    currentPlan,
    currentDescriptor
  );
  const intent = turnRecord.dispatchIntent;
  const transport = turnRecord.transportReceipt;
  const accounting = accountingFor(currentDescriptor, 'completed');
  if (
    transport.outcome !== 'completed' ||
    !transport.providerRequestId ||
    !transport.responseHeaderDigest ||
    !transport.responseBodyDigest ||
    !turnRecord.resultSpoolReceipt
  ) {
    throw new Error('Recovered continuation fixture is incomplete.');
  }
  const invocationReceipt: AgentModelInvocationReceipt = withReceiptDigest({
    invocationId: intent.invocationId,
    taskId: currentPlan.evaluationPlanId,
    runId: `run.recovered-continuation.${suffix}`,
    generation: 0,
    attempt: 1,
    provider,
    model,
    capabilityQualificationDigest: target.qualificationSliceDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    contextPackDigest: digestAgentCanonicalValue({
      descriptorDigest: currentDescriptor.descriptorDigest,
      context: 'recovered-continuation.test',
    }),
    requestDigest: intent.requestDigest,
    responseDigest: turnRecord.resultSpoolReceipt.responseDigest,
    outcome: 'completed' as const,
    usage: accounting.usage,
    costStatus: 'priced' as const,
    cost: accounting.cost,
    startedAt: ATTEMPT_AT,
    completedAt: ATTEMPT_AT,
  });
  const sourceReceipts = createSourceReceipts(
    currentPlan,
    currentDescriptor,
    transport.providerRequestId,
    accounting.usage,
    accounting.cost
  );
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest: intent.requestDigest,
    status: 'completed',
    retryable: false,
    invocationReceiptDigest: invocationReceipt.receiptDigest,
    responseDigest: turnRecord.resultSpoolReceipt.responseDigest,
    startedAt: ATTEMPT_AT,
    completedAt: ATTEMPT_AT,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digestAgentCanonicalValue('single-turn-retry.test'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: false,
  });
  const resolvedModelIdentityDigest =
    digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: target.protocolFamily,
      transportReceiptDigest: transport.receiptDigest,
      frozenModelId: model.modelId,
      ...(model.immutableVersion
        ? { frozenImmutableModelVersion: model.immutableVersion }
        : {}),
      ...(transport.resolvedModelId
        ? { resolvedModelId: transport.resolvedModelId }
        : {}),
      ...(transport.resolvedModelVersion
        ? { resolvedModelVersion: transport.resolvedModelVersion }
        : {}),
    });
  const receipt = createAgentEvaluationInvocationTurnReceipt({
    planDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    attemptId: currentDescriptor.attemptId,
    descriptorDigest: currentDescriptor.descriptorDigest,
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    status: 'completed',
    dispatchState: 'dispatched',
    terminal: false,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    contextPackDigest: invocationReceipt.contextPackDigest,
    requestArtifactDigest: intent.requestDigest,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    transportRetryReceipt,
    invocationReceipt,
    providerRequestId: transport.providerRequestId,
    ...(transport.resolvedModelId
      ? { resolvedModelId: transport.resolvedModelId }
      : {}),
    ...(transport.resolvedModelVersion
      ? { resolvedModelVersion: transport.resolvedModelVersion }
      : {}),
    resolvedModelIdentityDigest,
    responseHeaderDigest: transport.responseHeaderDigest,
    responseArtifactDigest: turnRecord.resultSpoolReceipt.responseDigest,
    providerResultSpoolReceiptDigest:
      turnRecord.resultSpoolReceipt.receiptDigest,
    usageSourceReceiptDigest: sourceReceipts[0]!.receiptDigest,
    costSourceReceiptDigest: sourceReceipts[1]!.receiptDigest,
    continuationReceiptDigest: digestAgentCanonicalValue({
      attemptId: currentDescriptor.attemptId,
      turnIndex: intent.turnIndex,
      continuation: 'test',
    }),
  });
  for (const sourceReceipt of sourceReceipts) {
    await persistence.persistSourceReceipt(sourceReceipt);
  }
  await persistence.persistInvocationTurnReceipt(receipt);
  return receipt;
};

const success = <T>(
  value: T,
  replayed = false
): AgentEvaluationRepositoryWriteResult<T> =>
  Object.freeze({ ok: true, value, replayed });

class MemoryLedger implements AgentEvaluationDurableShardLedger {
  readonly namespaceId = NAMESPACE_ID;
  readonly namespaceDigest = namespaceDigest;
  budget: AgentBudgetLedgerState = createAgentBudgetLedger(plan.budget.budget);
  attempts = [...seededAttempts];
  latestCheckpoint?: AgentEvaluationShardCheckpoint;
  lease?: AgentEvaluationShardLease;
  readonly turns = new Map<string, AgentEvaluationDurableTurnRecord[]>();
  readonly encryptedSpools = new Map<
    string,
    AgentEvaluationDurableEncryptedResultSpool
  >();
  readonly sourceReceipts: AgentEvaluationSourceReceipt[] = [];
  readonly preDispatchFailureReceipts: AgentEvaluationPreDispatchFailureReceipt[] =
    [];
  readonly capabilityExecutionReceipts: AgentEvaluationCapabilityExecutionReceipt[] =
    [];
  readonly capabilitySpecificReceipts: AgentEvaluationCapabilitySpecificReceipt[] =
    [];
  readonly attemptAuthorityOwnerReceipts: AgentEvaluationAttemptAuthorityOwnerReceipt[] =
    [];
  readonly verificationAttemptGrantReceipts: AgentEvaluationVerificationAttemptGrantReceipt[] =
    [];
  readonly executionReceipts: AgentEvaluationExecutionReceipt[] = [];
  readonly resultSubmissionReceipts: AgentEvaluationResultSubmissionReceipt[] =
    [];
  readonly controlledRuntimeReceipts: AgentEvaluationControlledRuntimeReceipt[] =
    [];
  readonly checkpoints: AgentEvaluationShardCheckpoint[] = [];
  readonly calls: string[] = [];
  failAtomicCommit = false;
  loseAtomicCommitAcknowledgement = false;
  lastDispatchDescriptor?: AgentModelEvaluationAttemptDescriptor;

  async listAttempts(): Promise<readonly AgentModelEvaluationAttempt[]> {
    return this.attempts;
  }

  async listAttemptTurns(
    attemptId: string
  ): Promise<readonly AgentEvaluationDurableTurnRecord[]> {
    this.calls.push('list-turns');
    return Object.freeze([...(this.turns.get(attemptId) ?? [])]);
  }

  async listPreDispatchFailureReceipts(): Promise<
    readonly AgentEvaluationPreDispatchFailureReceipt[]
  > {
    this.calls.push('list-pre-dispatch-failures');
    return Object.freeze([...this.preDispatchFailureReceipts]);
  }

  async getLatestCheckpoint(): Promise<
    AgentEvaluationShardCheckpoint | undefined
  > {
    return this.latestCheckpoint;
  }

  async getBudgetLedger(): Promise<AgentBudgetLedgerState> {
    return this.budget;
  }

  async claimLease(
    input: Parameters<AgentEvaluationDurableShardLedger['claimLease']>[0]
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>> {
    if (
      this.lease &&
      Date.parse(this.lease.expiresAt) > Date.parse(input.acquiredAt)
    ) {
      return this.lease.ownerId === input.ownerId
        ? success(this.lease, true)
        : Object.freeze({ ok: false, reason: 'fenced' });
    }
    const generation = (this.lease?.generation ?? 0) + 1;
    const base = Object.freeze({
      planDigest: input.planDigest,
      shardId: input.shardId,
      ownerId: input.ownerId,
      generation,
      acquiredAt: input.acquiredAt,
      expiresAt: input.expiresAt,
    });
    this.lease = Object.freeze({
      ...base,
      leaseDigest: digestAgentCanonicalValue(base),
    });
    return success(this.lease);
  }

  async renewLease(
    input: Parameters<AgentEvaluationDurableShardLedger['renewLease']>[0]
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>> {
    if (!this.lease || this.lease.generation !== input.generation) {
      return Object.freeze({ ok: false, reason: 'fenced' });
    }
    const base = Object.freeze({
      planDigest: input.planDigest,
      shardId: input.shardId,
      ownerId: input.ownerId,
      generation: input.generation,
      acquiredAt: this.lease.acquiredAt,
      expiresAt: input.expiresAt,
    });
    this.lease = Object.freeze({
      ...base,
      leaseDigest: digestAgentCanonicalValue(base),
    });
    return success(this.lease);
  }

  async reserveBudget(
    input: Parameters<AgentEvaluationDurableShardLedger['reserveBudget']>[0]
  ) {
    this.calls.push('reserve');
    const result = reserveAgentBudget(this.budget, input);
    if (result.ok) this.budget = result.state;
    return result;
  }

  async reconcileBudget(
    input: Parameters<AgentEvaluationDurableShardLedger['reconcileBudget']>[0]
  ) {
    this.calls.push(`reconcile:${input.reason}`);
    const result = reconcileAgentBudgetReservation(this.budget, input);
    if (result.ok) this.budget = result.state;
    return result;
  }

  async putPreDispatchFailureReceipt(
    receipt: AgentEvaluationPreDispatchFailureReceipt
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationPreDispatchFailureReceipt>
  > {
    this.calls.push('pre-dispatch-failure');
    const existing = this.preDispatchFailureReceipts.find(
      ({ attemptId, turnIndex }) =>
        attemptId === receipt.attemptId && turnIndex === receipt.turnIndex
    );
    if (existing) {
      return success(existing, true);
    }
    this.preDispatchFailureReceipts.push(receipt);
    return success(receipt);
  }

  async putTurnDispatchIntent(
    input: Parameters<
      AgentEvaluationDurableShardLedger['putTurnDispatchIntent']
    >[0]
  ) {
    this.calls.push('dispatch-intent');
    this.lastDispatchDescriptor = input.descriptor;
    const current = this.turns.get(input.descriptor.attemptId) ?? [];
    const replay = current[input.turnIndex];
    if (replay) return success(replay, true);
    const base = Object.freeze({
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: input.turnIndex,
      budgetReservationId: input.budgetReservationId,
      dispatchIntent: input.dispatchIntent,
      createdAt: input.dispatchIntent.createdAt,
      state: 'dispatched' as const,
    });
    const turn: AgentEvaluationDurableTurnRecord = Object.freeze({
      ...base,
      turnDigest: digestAgentCanonicalValue(base),
    });
    this.turns.set(input.descriptor.attemptId, [...current, turn]);
    return success(turn);
  }

  async closeTurnTransport(
    input: Parameters<
      AgentEvaluationDurableShardLedger['closeTurnTransport']
    >[0]
  ) {
    this.calls.push(`close:${input.transportReceipt.outcome}`);
    const current = this.turns.get(input.descriptor.attemptId) ?? [];
    const open = current[input.turnIndex];
    if (!open) throw new Error('missing durable dispatch intent');
    if (open.state === 'closed') return success(open, true);
    const resultSpoolReceipt = input.encryptedResultSpool
      ? createAgentEvaluationProviderResultSpoolReceipt({
          aad: input.encryptedResultSpool.aad,
          envelope: input.encryptedResultSpool.envelope,
          responseDigest: input.encryptedResultSpool.responseDigest,
          retentionClass: 'attempt-resume-only',
          retentionPolicyDigest:
            input.encryptedResultSpool.retentionPolicyDigest,
          createdAt: input.closedAt,
          expiresAt: input.encryptedResultSpool.expiresAt,
        })
      : undefined;
    const base = Object.freeze({
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: input.turnIndex,
      budgetReservationId: input.budgetReservationId,
      dispatchIntent: open.dispatchIntent,
      createdAt: open.createdAt,
      state: 'closed' as const,
      transportReceipt: input.transportReceipt,
      ...(resultSpoolReceipt ? { resultSpoolReceipt } : {}),
      closedAt: input.closedAt,
    });
    const closed: AgentEvaluationDurableTurnRecord = Object.freeze({
      ...base,
      turnDigest: digestAgentCanonicalValue(base),
    });
    current[input.turnIndex] = closed;
    this.turns.set(input.descriptor.attemptId, current);
    if (input.encryptedResultSpool) {
      this.encryptedSpools.set(
        `${input.descriptor.attemptId}:${input.turnIndex}`,
        input.encryptedResultSpool
      );
    }
    return success(closed);
  }

  async getTurnResultSpool(
    input: Parameters<
      AgentEvaluationDurableShardLedger['getTurnResultSpool']
    >[0]
  ): Promise<AgentEvaluationDurableResultSpoolRead> {
    this.calls.push('read-spool');
    const turn = this.turns.get(input.descriptor.attemptId)?.[input.turnIndex];
    const encrypted = this.encryptedSpools.get(
      `${input.descriptor.attemptId}:${input.turnIndex}`
    );
    if (turn?.state !== 'closed' || !turn.resultSpoolReceipt || !encrypted) {
      throw new Error('missing encrypted result spool');
    }
    const accessBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-provider-result-spool-access-receipt' as const,
      version: 1 as const,
      spoolRef: turn.resultSpoolReceipt.spoolRef,
      spoolReceiptDigest: turn.resultSpoolReceipt.receiptDigest,
      attemptId: input.descriptor.attemptId,
      turnIndex: input.turnIndex,
      expectedTurnDigest: input.expectedTurnDigest,
      shardId: input.shardId,
      ownerId: input.ownerId,
      leaseGeneration: input.leaseGeneration,
      accessedAt: ATTEMPT_AT,
    });
    return Object.freeze({
      ...encrypted,
      resultSpoolReceipt: turn.resultSpoolReceipt,
      accessReceipt: Object.freeze({
        ...accessBase,
        receiptDigest: digestAgentCanonicalValue(accessBase),
      }),
    });
  }

  async commitAttemptEvidence(
    input: Parameters<
      AgentEvaluationDurableShardLedger['commitAttemptEvidence']
    >[0]
  ) {
    this.calls.push('atomic-commit');
    if (this.failAtomicCommit) throw new Error('atomic join failed');
    const settlement = settleAgentBudget(this.budget, {
      reservationId: input.reservationId,
      expectedRevision: input.expectedRevision,
      actual: input.actual,
      settledAt: input.settledAt,
    });
    if (!settlement.ok) throw new Error('budget settlement conflict');
    this.calls.push(
      'commit:intents',
      'commit:transports',
      'commit:spools',
      'commit:dispositions',
      'commit:pre-dispatch-failures',
      'commit:capability-executions',
      'commit:capability-specifics',
      'commit:attempt-authority-owners',
      'commit:verification-grants',
      'commit:turns',
      'commit:turn-set',
      'commit:sources'
    );
    this.sourceReceipts.push(...input.sourceReceipts);
    for (const receipt of input.preDispatchFailureReceipts) {
      const existing = this.preDispatchFailureReceipts.find(
        ({ attemptId, turnIndex }) =>
          attemptId === receipt.attemptId && turnIndex === receipt.turnIndex
      );
      if (!existing) this.preDispatchFailureReceipts.push(receipt);
      else if (existing.receiptDigest !== receipt.receiptDigest) {
        throw new Error('pre-dispatch failure receipt conflict');
      }
    }
    this.capabilityExecutionReceipts.push(...input.capabilityExecutionReceipts);
    this.capabilitySpecificReceipts.push(...input.capabilitySpecificReceipts);
    this.attemptAuthorityOwnerReceipts.push(
      ...input.attemptAuthorityOwnerReceipts
    );
    const currentVerificationGrantGeneration =
      input.verificationAttemptGrantReceipts[0]?.generation;
    const issuedVerificationGrants =
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        this.verificationAttemptGrantReceipts.filter(
          ({ evaluationAttemptId, generation }) =>
            evaluationAttemptId === input.attempt.descriptor.attemptId &&
            generation === currentVerificationGrantGeneration
        )
      );
    if (
      !sameCanonicalJson(
        issuedVerificationGrants,
        input.verificationAttemptGrantReceipts
      )
    ) {
      throw new Error('verification attempt grant receipt join conflict');
    }
    if (input.resultSubmissionReceipt) {
      this.calls.push('commit:result-submission');
      this.resultSubmissionReceipts.push(input.resultSubmissionReceipt);
    }
    if (input.controlledRuntimeReceipt) {
      this.calls.push('commit:controlled-runtime');
      this.controlledRuntimeReceipts.push(input.controlledRuntimeReceipt);
    }
    this.calls.push('commit:execution', 'commit:attempt');
    this.executionReceipts.push(input.executionReceipt);
    this.attempts.push(input.attempt);
    this.budget = settlement.state;
    if (this.loseAtomicCommitAcknowledgement) {
      throw new Error('atomic join acknowledgement lost');
    }
    return Object.freeze({
      transportDispatchIntents: input.transportDispatchIntents,
      transportReceipts: input.transportReceipts,
      providerResultSpoolReceipts: input.providerResultSpoolReceipts,
      providerResultSpoolDispositionReceipts:
        input.providerResultSpoolDispositionReceipts,
      preDispatchFailureReceipts: input.preDispatchFailureReceipts,
      capabilityExecutionReceipts: input.capabilityExecutionReceipts,
      capabilitySpecificReceipts: input.capabilitySpecificReceipts,
      providerCapabilityObservationReceipts:
        input.providerCapabilityObservationReceipts,
      attemptAuthorityOwnerReceipts: input.attemptAuthorityOwnerReceipts,
      verificationAttemptGrantReceipts: input.verificationAttemptGrantReceipts,
      invocationTurnReceipts: input.invocationTurnReceipts,
      invocationTurnSetReceipt: input.invocationTurnSetReceipt,
      sourceReceipts: input.sourceReceipts,
      ...(input.resultSubmissionReceipt
        ? { resultSubmissionReceipt: input.resultSubmissionReceipt }
        : {}),
      ...(input.controlledRuntimeReceipt
        ? { controlledRuntimeReceipt: input.controlledRuntimeReceipt }
        : {}),
      executionReceipt: input.executionReceipt,
      attempt: input.attempt,
      budgetLedger: settlement.state,
      replayed: false,
    });
  }

  async putCheckpoint(
    checkpoint: AgentEvaluationShardCheckpoint,
    expectedPreviousRevision: number
  ) {
    this.calls.push(`checkpoint:${checkpoint.state}`);
    if ((this.latestCheckpoint?.revision ?? -1) !== expectedPreviousRevision) {
      return Object.freeze({ ok: false, reason: 'conflict' } as const);
    }
    this.latestCheckpoint = checkpoint;
    this.checkpoints.push(checkpoint);
    return success(checkpoint);
  }
}

const verificationGrantIssueInputFor = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  generation: number
): AgentEvaluationVerificationAttemptGrantIssueInput => {
  const policyDigest = digestAgentCanonicalValue('verification-policy.test');
  const cell = Object.freeze({
    id: 'cell.evaluation-test',
    checkId: 'check.evaluation-test',
    checkKind: 'integration' as const,
    targetId: 'target.evaluation-test',
    targetPolicy: Object.freeze({
      authority: 'verification-policy' as const,
      policyDigest,
      semanticTargetId: 'target.evaluation-test',
      capture: 'allowed' as const,
    }),
    frameworkTarget: 'react-vite',
    surface: 'ci' as const,
    browserEngine: 'chromium' as const,
    viewport: Object.freeze({
      id: 'desktop',
      width: 1280,
      height: 720,
    }),
    colorScheme: 'light' as const,
    motion: 'full' as const,
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset' as const,
      presetId: 'controlled',
      digest: digestAgentCanonicalValue('control-profile.test'),
    }),
    adapter: Object.freeze({
      adapterId: 'adapter.integration.test',
      descriptorDigest: digestAgentCanonicalValue('adapter-descriptor.test'),
      toolchainDigest: digestAgentCanonicalValue('adapter-toolchain.test'),
      capabilityDigest: digestAgentCanonicalValue('adapter-capability.test'),
    }),
    requirement: 'required' as const,
    policyRuleIds: Object.freeze(['rule.evaluation-test']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry.once.test',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['ci-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze([]),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze([]),
    estimatedCost: Object.freeze({
      durationMs: 100,
      artifactBytes: 0,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' as const }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: digestAgentCanonicalValue('verification-input.test'),
  });
  const verificationPlanBase = Object.freeze({
    status: 'ready' as const,
    workspaceId: 'workspace.evaluation-test',
    targetRevision: 1,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      documentRevisions: Object.freeze({}),
    }),
    scenarioRegistryDigest: digestAgentCanonicalValue('scenario-registry.test'),
    policyRevision: 1,
    policyDigest,
    retentionRequest: Object.freeze({
      successful: 'release' as const,
      failed: 'release' as const,
      protectReleaseEvidence: true,
    }),
    policyEvaluationInstant: ATTEMPT_AT,
    impactDigest: digestAgentCanonicalValue('verification-impact.test'),
    semanticSchemaDigest: digestAgentCanonicalValue(
      'verification-semantic-schema.test'
    ),
    providerSetDigest: digestAgentCanonicalValue(
      'verification-provider-set.test'
    ),
    compilerDigest: digestAgentCanonicalValue('verification-compiler.test'),
    plannerDigest: digestAgentCanonicalValue('verification-planner.test'),
    adapterRegistryDigest: digestAgentCanonicalValue(
      'verification-adapter-registry.test'
    ),
    cells: Object.freeze([cell]),
    issues: Object.freeze([]),
    explanations: Object.freeze([
      Object.freeze({
        cellId: cell.id,
        checkId: cell.checkId,
        targetId: cell.targetId,
        status: 'selected' as const,
        impactPathIds: Object.freeze([]),
        policyRuleIds: cell.policyRuleIds,
        messages: Object.freeze(['Required by policy.']),
      }),
    ]),
    budget: Object.freeze({
      cells: 1,
      cellsByCheckKind: Object.freeze({
        diagnostics: 0,
        build: 0,
        unit: 0,
        integration: 1,
        e2e: 0,
        visual: 0,
        accessibility: 0,
        performance: 0,
        security: 0,
      }),
      targetExpansions: 1,
      browserExpansions: 1,
      closureEvidenceRecords: 1,
      totalMs: 100,
      artifactBytes: 0,
      estimatedComputeUnits: 1,
      maximumParallelism: 1,
      overBudgetDimensions: Object.freeze([]),
    }),
  });
  const verificationPlan = Object.freeze({
    ...verificationPlanBase,
    planDigest: digestVerificationValue(verificationPlanBase),
  });
  const run = Object.freeze({
    runId: `verification-run.${currentDescriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    providerId: 'verification-provider.test',
    parentAttemptId: currentDescriptor.attemptId,
    surface: cell.surface,
    frameworkTarget: cell.frameworkTarget,
    runtimeZone: 'sandbox',
    browserEngine: cell.browserEngine,
    viewport: cell.viewport,
    devicePixelRatio: 1,
    colorScheme: cell.colorScheme,
    motion: cell.motion,
    locale: cell.locale,
    timezone: 'UTC',
    fontSetDigest: digestAgentCanonicalValue('verification-font-set.test'),
  });
  return Object.freeze({
    namespaceId: NAMESPACE_ID,
    evaluationPlanDigest: currentPlan.planDigest,
    repositoryCommit: currentPlan.repositoryCommit,
    descriptor: currentDescriptor,
    generation,
    projectId: 'project.evaluation-test',
    verificationPlan,
    cellId: 'cell.evaluation-test',
    run,
    trustCeiling: 'ci-attested',
    expiresAt: currentPlan.expiresAt,
  });
};

const verificationGrantIssueInputsFor = (
  currentPlan: AgentModelEvaluationPlan,
  currentDescriptor: AgentModelEvaluationAttemptDescriptor,
  generation: number,
  cellCount = 1
): readonly AgentEvaluationVerificationAttemptGrantIssueInput[] => {
  const first = verificationGrantIssueInputFor(
    currentPlan,
    currentDescriptor,
    generation
  );
  if (cellCount === 1) return Object.freeze([first]);
  if (cellCount !== 2) {
    throw new Error('Unsupported verification grant cell fixture count.');
  }
  const firstCell = first.verificationPlan.cells[0]!;
  const secondCell = Object.freeze({
    ...firstCell,
    id: 'cell.evaluation-test.2',
    checkId: 'check.evaluation-test.2',
    targetId: 'target.evaluation-test.2',
    targetPolicy: Object.freeze({
      ...firstCell.targetPolicy,
      semanticTargetId: 'target.evaluation-test.2',
    }),
    inputDigest: digestAgentCanonicalValue('verification-input-2.test'),
  });
  const { planDigest: _firstPlanDigest, ...firstPlanBase } =
    first.verificationPlan;
  if (!_firstPlanDigest)
    throw new Error('Verification plan digest is missing.');
  const verificationPlanBase = Object.freeze({
    ...firstPlanBase,
    cells: Object.freeze([firstCell, secondCell]),
    explanations: Object.freeze([
      ...first.verificationPlan.explanations,
      Object.freeze({
        cellId: secondCell.id,
        checkId: secondCell.checkId,
        targetId: secondCell.targetId,
        status: 'selected' as const,
        impactPathIds: Object.freeze([]),
        policyRuleIds: secondCell.policyRuleIds,
        messages: Object.freeze(['Required by policy.']),
      }),
    ]),
    budget: Object.freeze({
      ...first.verificationPlan.budget,
      cells: 2,
      cellsByCheckKind: Object.freeze({
        ...first.verificationPlan.budget.cellsByCheckKind,
        integration: 2,
      }),
      targetExpansions: 2,
      browserExpansions: 1,
      closureEvidenceRecords: 2,
      totalMs: 200,
      estimatedComputeUnits: 2,
      maximumParallelism: 2,
    }),
  });
  const verificationPlan = Object.freeze({
    ...verificationPlanBase,
    planDigest: digestVerificationValue(verificationPlanBase),
  });
  return Object.freeze(
    [firstCell, secondCell].map((cell, index) =>
      Object.freeze({
        ...first,
        verificationPlan,
        cellId: cell.id,
        run: Object.freeze({
          ...first.run,
          runId: `${first.run.runId}.cell-${index + 1}`,
          surface: cell.surface,
          frameworkTarget: cell.frameworkTarget,
          browserEngine: cell.browserEngine,
          viewport: cell.viewport,
          colorScheme: cell.colorScheme,
          motion: cell.motion,
          locale: cell.locale,
        }),
      })
    )
  );
};

const verificationGrantReceiptFor = (
  input: AgentEvaluationVerificationAttemptGrantIssueInput
): AgentEvaluationVerificationAttemptGrantReceipt => {
  const cell = input.verificationPlan.cells.find(
    ({ id }) => id === input.cellId
  );
  if (!cell) throw new Error('Verification grant fixture cell is missing.');
  const encodedVerificationPlan = encodeVerificationPlan(
    input.verificationPlan
  );
  const issueBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_ISSUE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    descriptor: Object.freeze({ ...input.descriptor }),
    generation: input.generation,
    workspaceId: input.verificationPlan.workspaceId,
    workspaceRevision: input.verificationPlan.targetRevision,
    projectId: input.projectId,
    verificationPlanDigest: input.verificationPlan.planDigest,
    verificationPlan: encodedVerificationPlan,
    cellId: input.cellId,
    run: input.run,
    trustCeiling: input.trustCeiling,
    expiresAt: input.expiresAt,
  });
  const bindingBase = Object.freeze({
    namespaceId: issueBase.namespaceId,
    evaluationPlanDigest: issueBase.evaluationPlanDigest,
    repositoryCommit: issueBase.repositoryCommit,
    evaluationAttemptId: issueBase.evaluationAttemptId,
    descriptorDigest: issueBase.descriptorDigest,
    capabilityDescriptorDigest: issueBase.capabilityDescriptorDigest,
    caseId: issueBase.caseId,
    generation: issueBase.generation,
    workspaceId: issueBase.workspaceId,
    workspaceRevision: issueBase.workspaceRevision,
    projectId: issueBase.projectId,
    verificationPlanDigest: issueBase.verificationPlanDigest,
    cellId: issueBase.cellId,
  });
  const issuanceBindingDigest = digestAgentCanonicalValue(bindingBase);
  const grantFields = Object.freeze({
    workspaceId: input.verificationPlan.workspaceId,
    projectId: input.projectId,
    workspaceRevision: input.verificationPlan.targetRevision,
    partitionRevisionsDigest: digestVerificationValue(
      input.verificationPlan.targetPartitionRevisions
    ),
    policyRevision: input.verificationPlan.policyRevision,
    policyDigest: input.verificationPlan.policyDigest,
    policyEvaluationInstant: input.verificationPlan.policyEvaluationInstant,
    impactDigest: input.verificationPlan.impactDigest,
    verificationPlanDigest: input.verificationPlan.planDigest,
    cellId: input.cellId,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    targetId: cell.targetId,
    attemptId: input.descriptor.attemptId,
    runId: input.run.runId,
    providerId: input.run.providerId,
    ...(input.run.jobId ? { jobId: input.run.jobId } : {}),
    ...(input.run.sessionId ? { sessionId: input.run.sessionId } : {}),
    producerId: 'prodivix.g4-evaluation-controlled-runtime' as const,
    trustCeiling: input.trustCeiling,
    retentionRequest: input.verificationPlan.retentionRequest,
    maximumClosureEvidenceRecords:
      input.verificationPlan.budget.closureEvidenceRecords,
    issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
    issuedAt: ATTEMPT_AT,
    expiresAt: input.expiresAt,
  });
  const grantDigest = digestAgentCanonicalValue({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: grantFields.workspaceId,
    projectId: grantFields.projectId,
    workspaceRevision: grantFields.workspaceRevision,
    partitionRevisionsDigest: grantFields.partitionRevisionsDigest,
    policyRevision: grantFields.policyRevision,
    policyDigest: grantFields.policyDigest,
    policyEvaluationInstant: grantFields.policyEvaluationInstant,
    impactDigest: grantFields.impactDigest,
    planDigest: grantFields.verificationPlanDigest,
    cellId: grantFields.cellId,
    checkId: grantFields.checkId,
    checkKind: grantFields.checkKind,
    targetId: grantFields.targetId,
    attemptId: grantFields.attemptId,
    runId: grantFields.runId,
    providerId: grantFields.providerId,
    producerId: grantFields.producerId,
    trustCeiling: grantFields.trustCeiling,
    retentionRequest: grantFields.retentionRequest,
    maximumClosureEvidenceRecords: grantFields.maximumClosureEvidenceRecords,
    issuedBy: grantFields.issuedBy,
    issuedAt: grantFields.issuedAt,
    expiresAt: grantFields.expiresAt,
  });
  const grant = Object.freeze({
    grantId: `attempt-grant-${grantDigest.slice(7)}`,
    grantDigest,
    ...grantFields,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
    namespaceId: issueBase.namespaceId,
    evaluationPlanDigest: issueBase.evaluationPlanDigest,
    repositoryCommit: issueBase.repositoryCommit,
    evaluationAttemptId: issueBase.evaluationAttemptId,
    descriptorDigest: issueBase.descriptorDigest,
    capabilityDescriptorDigest: issueBase.capabilityDescriptorDigest,
    caseId: issueBase.caseId,
    generation: issueBase.generation,
    verificationPlanDigest: issueBase.verificationPlanDigest,
    cellId: issueBase.cellId,
    requestDigest: digestAgentCanonicalValue(issueBase),
    issuanceBindingDigest,
    grant,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const verificationGrantIssuer = (
  ledger: MemoryLedger
): AgentEvaluationVerificationAttemptGrantIssuer =>
  Object.freeze({
    list: async (
      input: Parameters<
        AgentEvaluationVerificationAttemptGrantIssuer['list']
      >[0]
    ) => {
      ledger.calls.push('grant-list');
      const { descriptor: current, generation, verificationPlanDigest } = input;
      return canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        ledger.verificationAttemptGrantReceipts.filter(
          (receipt) =>
            receipt.evaluationAttemptId === current.attemptId &&
            receipt.descriptorDigest === current.descriptorDigest &&
            receipt.generation === generation &&
            receipt.verificationPlanDigest === verificationPlanDigest
        )
      );
    },
    issue: async (input: AgentEvaluationVerificationAttemptGrantIssueInput) => {
      ledger.calls.push('grant-issue');
      const receipt = verificationGrantReceiptFor(input);
      const existing = ledger.verificationAttemptGrantReceipts.find(
        (candidate) =>
          candidate.evaluationAttemptId === receipt.evaluationAttemptId &&
          candidate.generation === receipt.generation &&
          candidate.cellId === receipt.cellId
      );
      if (existing) {
        if (!sameCanonicalJson(existing, receipt)) {
          throw new Error('verification attempt grant receipt conflict');
        }
        return existing;
      }
      ledger.verificationAttemptGrantReceipts.push(receipt);
      return receipt;
    },
  });

const preDispatchAttemptFinalizer = (
  persistence: AgentEvaluationDurableReceiptPersistence,
  now: () => string
): AgentEvaluationPreDispatchAttemptFinalizer =>
  createAgentEvaluationPreDispatchAttemptFinalizer({
    classifyPreDispatchFailure: (input) =>
      Object.freeze({
        reasonCode: input.suggestedReasonCode,
        findingDigest: digestAgentCanonicalValue({
          reasonCode: input.suggestedReasonCode,
          policyDigest: input.policyDigest,
          inputDigest: input.inputDigest,
        }),
      }),
    persistPreDispatchFailureReceipt:
      persistence.persistPreDispatchFailureReceipt,
    persistCapabilityExecutionReceipt:
      persistence.persistCapabilityExecutionReceipt,
    persistInvocationTurnReceipt: persistence.persistInvocationTurnReceipt,
    persistExecutionReceipt: persistence.persistExecutionReceipt,
    now,
  });

type ExecutorMode =
  | 'completed'
  | 'completed-zero-tool'
  | 'pre-dispatch-failure'
  | 'provider-error'
  | 'worker-loss-after-source'
  | 'post-dispatch-unknown';

const executorFactory = (
  ledger: MemoryLedger,
  mode: ExecutorMode,
  verificationGrantCellCount = 1,
  shardLeaseOwnerId = 'evaluation-worker.test'
): AgentEvaluationDurableAttemptExecutorFactory => {
  const completedToolCallCount = mode === 'completed-zero-tool' ? 0 : 2;
  return {
    estimateShard: ({ descriptors }) =>
      demandFor(
        descriptors[0]!,
        mode === 'provider-error' || mode === 'pre-dispatch-failure'
          ? 'provider-error'
          : mode === 'post-dispatch-unknown'
            ? 'post-dispatch-unknown'
            : 'completed',
        completedToolCallCount
      ),
    prepareVerificationAttemptGrants: async (input) => {
      ledger.calls.push('grant-prepare');
      return verificationGrantIssueInputsFor(
        input.plan,
        input.descriptor,
        input.leaseGeneration,
        verificationGrantCellCount
      );
    },
    createPreDispatchAttemptFinalizer: preDispatchAttemptFinalizer,
    create: (
      persistence: AgentEvaluationDurableReceiptPersistence,
      verificationAttemptGrantReceipts
    ) => {
      ledger.calls.push('executor-create');
      const verificationAttemptGrant = verificationAttemptGrantReceipts[0];
      if (!verificationAttemptGrant?.grant.attemptId) {
        throw new Error('verification attempt grant is missing');
      }
      return {
        execute: async ({ plan: currentPlan, descriptor: current }) => {
          ledger.calls.push('execute');
          if (mode === 'pre-dispatch-failure') {
            return stagePreDispatchFailureEvidence(
              persistence,
              currentPlan,
              current,
              verificationAttemptGrantReceipts.map(
                ({ receiptDigest }) => receiptDigest
              )
            );
          }
          const kind: ExecutionKind =
            mode === 'provider-error' ? 'provider-error' : 'completed';
          const intent = createDispatchIntent(
            currentPlan,
            current,
            kind,
            completedToolCallCount
          );
          await persistence.persistTransportDispatchIntent({
            turnIndex: 0,
            dispatchIntent: intent,
          });
          ledger.calls.push('provider-invoke');
          const transport = createTransport(intent, kind);
          const encryptedResultSpool =
            kind === 'completed'
              ? createEncryptedSpool(
                  persistence,
                  currentPlan,
                  current,
                  intent,
                  transport
                )
              : undefined;
          const closed = await persistence.closeTransportTurn({
            turnIndex: 0,
            expectedIntentDigest: intent.intentDigest,
            transportReceipt: transport,
            ...(encryptedResultSpool ? { encryptedResultSpool } : {}),
            closedAt: transport.completedAt,
          });
          if (closed.state !== 'closed') throw new Error('turn did not close');
          return stageEvidence(
            persistence,
            currentPlan,
            current,
            closed,
            kind,
            mode === 'worker-loss-after-source',
            completedToolCallCount,
            verificationAttemptGrantReceipts,
            shardLeaseOwnerId
          );
        },
        resume: async ({ plan: currentPlan, descriptor: current, turns }) => {
          ledger.calls.push('resume');
          const closed = turns.at(-1);
          if (closed?.state !== 'closed')
            throw new Error('resume turn is open');
          const kind: ExecutionKind =
            closed.transportReceipt.outcome === 'completed'
              ? 'completed'
              : closed.transportReceipt.outcome === 'post-dispatch-unknown'
                ? 'post-dispatch-unknown'
                : 'provider-error';
          if (closed.resultSpoolReceipt) {
            await persistence.readEncryptedResultSpool({
              turnIndex: closed.turnIndex,
              expectedTurnDigest: closed.turnDigest,
            });
          }
          return stageEvidence(
            persistence,
            currentPlan,
            current,
            closed,
            kind,
            false,
            completedToolCallCount,
            verificationAttemptGrantReceipts,
            shardLeaseOwnerId
          );
        },
      };
    },
  };
};

type RecoveryAppendMode =
  'append-next' | 'append-after-terminal' | 'append-gap' | 'append-duplicate';

const recoveryAppendExecutorFactory = (
  ledger: MemoryLedger,
  mode: RecoveryAppendMode
): AgentEvaluationDurableAttemptExecutorFactory => ({
  estimateShard: ({ descriptors }) =>
    demandFor(descriptors[0]!, 'completed', 2),
  prepareVerificationAttemptGrants: async (input) => {
    ledger.calls.push('grant-prepare');
    return verificationGrantIssueInputsFor(
      input.plan,
      input.descriptor,
      input.leaseGeneration
    );
  },
  createPreDispatchAttemptFinalizer: preDispatchAttemptFinalizer,
  create: (persistence, verificationAttemptGrantReceipts) => {
    ledger.calls.push('executor-create');
    const verificationAttemptGrant = verificationAttemptGrantReceipts[0];
    if (!verificationAttemptGrant?.grant.attemptId) {
      throw new Error('verification attempt grant is missing');
    }
    return {
      execute: async () => {
        throw new Error('Recovery boundary executor requires durable turns.');
      },
      resume: async ({ plan: currentPlan, descriptor: current, turns }) => {
        ledger.calls.push(`resume-boundary:${mode}`);
        const closed = turns.at(-1);
        if (closed?.state !== 'closed' || !closed.resultSpoolReceipt) {
          throw new Error('Recovery boundary fixture requires a closed spool.');
        }
        await persistence.readEncryptedResultSpool({
          turnIndex: closed.turnIndex,
          expectedTurnDigest: closed.turnDigest,
        });
        if (mode === 'append-after-terminal') {
          await stageEvidence(
            persistence,
            currentPlan,
            current,
            closed,
            'completed',
            false,
            2,
            verificationAttemptGrantReceipts
          );
        } else {
          await stageRecoveredContinuation(
            persistence,
            currentPlan,
            current,
            closed
          );
        }
        const turnIndex =
          mode === 'append-gap'
            ? closed.turnIndex + 2
            : mode === 'append-duplicate'
              ? closed.turnIndex
              : closed.turnIndex + 1;
        const nextIntent = createDispatchIntent(
          currentPlan,
          current,
          'completed',
          2,
          turnIndex
        );
        let rejected = false;
        try {
          await persistence.persistTransportDispatchIntent({
            turnIndex,
            dispatchIntent: nextIntent,
          });
        } catch {
          rejected = true;
        }
        if (mode === 'append-next') {
          if (rejected) throw new Error('Recovered next turn was rejected.');
          ledger.calls.push('append-next-accepted');
          throw new Error('simulated worker loss after next-turn dispatch');
        }
        if (!rejected) {
          ledger.calls.push('append-boundary-unexpectedly-accepted');
        } else {
          ledger.calls.push(`append-boundary-rejected:${mode}`);
        }
        throw new Error('expected recovery append boundary');
      },
    };
  },
});

const runner = (
  ledger: MemoryLedger,
  mode: ExecutorMode = 'completed',
  input: Readonly<{
    completedAttemptInterval?: number;
    maximumIntervalMs?: number;
    now?: () => string;
    ownerId?: string;
    executorFactoryOverride?: AgentEvaluationDurableAttemptExecutorFactory;
    verificationAttemptGrantIssuer?: AgentEvaluationVerificationAttemptGrantIssuer;
  }> = {}
) =>
  new AgentEvaluationDurableShardRunner({
    ledger,
    executorFactory:
      input.executorFactoryOverride ??
      executorFactory(
        ledger,
        mode,
        1,
        input.ownerId ?? 'evaluation-worker.test'
      ),
    verificationAttemptGrantIssuer:
      input.verificationAttemptGrantIssuer ?? verificationGrantIssuer(ledger),
    settings: Object.freeze({
      ownerId: input.ownerId ?? 'evaluation-worker.test',
      leaseDurationMs: 300_000,
      checkpoint: Object.freeze({
        completedAttemptInterval: input.completedAttemptInterval ?? 100,
        maximumIntervalMs: input.maximumIntervalMs ?? 30_000,
      }),
    }),
    now: input.now ?? (() => ATTEMPT_AT),
  });

describe('AgentEvaluationDurableShardRunner', () => {
  it('reserves exact demand and durably fences dispatch before provider invocation', async () => {
    const ledger = new MemoryLedger();

    await runner(ledger).run({ plan, shardId: descriptor.shardId });

    expect(ledger.calls.indexOf('reserve')).toBeLessThan(
      ledger.calls.indexOf('grant-prepare')
    );
    expect(ledger.calls.indexOf('grant-prepare')).toBeLessThan(
      ledger.calls.indexOf('grant-issue')
    );
    expect(ledger.calls.indexOf('grant-issue')).toBeLessThan(
      ledger.calls.indexOf('executor-create')
    );
    expect(ledger.calls.indexOf('executor-create')).toBeLessThan(
      ledger.calls.indexOf('dispatch-intent')
    );
    expect(ledger.calls.indexOf('dispatch-intent')).toBeLessThan(
      ledger.calls.indexOf('provider-invoke')
    );
    expect(ledger.lastDispatchDescriptor).toEqual(descriptor);
  }, 60_000);

  it('seals every canonical G3 plan cell grant before dispatch and commits the full set', async () => {
    const ledger = new MemoryLedger();

    const result = await runner(ledger, 'completed', {
      executorFactoryOverride: executorFactory(ledger, 'completed', 2),
    }).run({ plan, shardId: descriptor.shardId });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(
      ledger.calls.filter((entry) => entry === 'grant-issue')
    ).toHaveLength(2);
    expect(ledger.calls.filter((entry) => entry === 'grant-list')).toHaveLength(
      2
    );
    expect(ledger.verificationAttemptGrantReceipts).toHaveLength(2);
    const finalGrantRead = ledger.calls.lastIndexOf('grant-list');
    expect(finalGrantRead).toBeLessThan(
      ledger.calls.indexOf('executor-create')
    );
    expect(finalGrantRead).toBeLessThan(
      ledger.calls.indexOf('dispatch-intent')
    );
    const verificationAttemptGrantReceiptSetDigest =
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        ledger.verificationAttemptGrantReceipts
      );
    expect(ledger.executionReceipts[0]).toMatchObject({
      verificationAttemptGrantReceiptSetDigest,
    });
    expect(
      ledger.attempts.find(
        ({ descriptor: current }) => current.attemptId === descriptor.attemptId
      )
    ).toMatchObject({ verificationAttemptGrantReceiptSetDigest });
    const grantDigests = ledger.verificationAttemptGrantReceipts
      .map(({ receiptDigest }) => receiptDigest)
      .sort(compareUnicodeCodePoints);
    expect(
      ledger.controlledRuntimeReceipts[0]
        ?.verificationAttemptGrantReceiptDigests
    ).toEqual(grantDigests);
    expect(
      ledger.controlledRuntimeReceipts[0]?.ownerAuthorityReceiptDigests
    ).toEqual(expect.arrayContaining(grantDigests));
  }, 60_000);

  it('commits a pre-dispatch denominator with every grant sealed before a later cell issue failure', async () => {
    const ledger = new MemoryLedger();
    const durableIssuer = verificationGrantIssuer(ledger);
    const failingIssuer: AgentEvaluationVerificationAttemptGrantIssuer =
      Object.freeze({
        list: durableIssuer.list.bind(durableIssuer),
        issue: async (
          input: AgentEvaluationVerificationAttemptGrantIssueInput
        ) => {
          if (input.cellId === 'cell.evaluation-test.2') {
            ledger.calls.push('grant-issue');
            throw new Error('verification grant service unavailable');
          }
          return durableIssuer.issue(input);
        },
      });

    const result = await runner(ledger, 'completed', {
      executorFactoryOverride: executorFactory(ledger, 'completed', 2),
      verificationAttemptGrantIssuer: failingIssuer,
    }).run({ plan, shardId: descriptor.shardId });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.calls).not.toContain('executor-create');
    expect(ledger.calls).not.toContain('dispatch-intent');
    expect(ledger.calls).not.toContain('provider-invoke');
    expect(ledger.verificationAttemptGrantReceipts).toHaveLength(1);
    expect(ledger.preDispatchFailureReceipts).toEqual([
      expect.objectContaining({
        reasonCode: 'verification-attempt-grant-unavailable',
      }),
    ]);
    const verificationAttemptGrantReceiptSetDigest =
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        ledger.verificationAttemptGrantReceipts
      );
    expect(ledger.executionReceipts[0]).toMatchObject({
      verificationAttemptGrantReceiptSetDigest,
      modelInvocations: 0,
    });
    expect(
      ledger.attempts.find(
        ({ descriptor: current }) => current.attemptId === descriptor.attemptId
      )
    ).toMatchObject({
      status: 'infrastructure-error',
      outcome: 'inconclusive',
      verificationAttemptGrantReceiptSetDigest,
    });
  }, 60_000);

  it('resumes an exact standalone grant-failure receipt without issuing or dispatching again', async () => {
    const ledger = new MemoryLedger();
    const durableIssuer = verificationGrantIssuer(ledger);
    const unavailableIssuer: AgentEvaluationVerificationAttemptGrantIssuer =
      Object.freeze({
        list: durableIssuer.list.bind(durableIssuer),
        issue: async () => {
          ledger.calls.push('grant-issue');
          throw new Error('verification grant service unavailable');
        },
      });
    const baseFactory = executorFactory(ledger, 'completed');
    let interruptAfterReceipt = true;
    const interruptedFactory: AgentEvaluationDurableAttemptExecutorFactory =
      Object.freeze({
        ...baseFactory,
        createPreDispatchAttemptFinalizer: (
          persistence: AgentEvaluationDurableReceiptPersistence,
          now: () => string
        ) =>
          preDispatchAttemptFinalizer(
            Object.freeze({
              ...persistence,
              persistPreDispatchFailureReceipt: async (
                receipt: AgentEvaluationPreDispatchFailureReceipt
              ) => {
                const acknowledged =
                  await persistence.persistPreDispatchFailureReceipt(receipt);
                if (interruptAfterReceipt) {
                  interruptAfterReceipt = false;
                  throw new Error('worker lost after standalone receipt ACK');
                }
                return acknowledged;
              },
            }),
            now
          ),
      });

    const first = await runner(ledger, 'completed', {
      executorFactoryOverride: interruptedFactory,
      verificationAttemptGrantIssuer: unavailableIssuer,
    }).run({ plan, shardId: descriptor.shardId });

    expect(first).toMatchObject({ ok: false, reason: 'executor-failed' });
    expect(ledger.preDispatchFailureReceipts).toHaveLength(1);
    expect(ledger.calls).not.toContain('reconcile:worker-loss');
    expect(
      ledger.attempts.some(
        ({ descriptor: current }) => current.attemptId === descriptor.attemptId
      )
    ).toBe(false);
    const issueCount = ledger.calls.filter(
      (entry) => entry === 'grant-issue'
    ).length;

    ledger.latestCheckpoint = undefined;
    const resumed = await runner(ledger, 'completed', {
      executorFactoryOverride: baseFactory,
      verificationAttemptGrantIssuer: unavailableIssuer,
    }).run({ plan, shardId: descriptor.shardId });

    expect(resumed).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.preDispatchFailureReceipts).toHaveLength(1);
    expect(
      ledger.calls.filter((entry) => entry === 'grant-issue')
    ).toHaveLength(issueCount);
    expect(ledger.calls).not.toContain('dispatch-intent');
    expect(ledger.calls).not.toContain('provider-invoke');
  }, 60_000);

  it('atomically joins ordered turn, spool, terminal, execution, and attempt facts', async () => {
    const ledger = new MemoryLedger();

    const result = await runner(ledger).run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    const committed = ledger.calls.filter((entry) =>
      entry.startsWith('commit:')
    );
    expect(committed).toEqual([
      'commit:intents',
      'commit:transports',
      'commit:spools',
      'commit:dispositions',
      'commit:pre-dispatch-failures',
      'commit:capability-executions',
      'commit:capability-specifics',
      'commit:attempt-authority-owners',
      'commit:verification-grants',
      'commit:turns',
      'commit:turn-set',
      'commit:sources',
      'commit:result-submission',
      'commit:controlled-runtime',
      'commit:execution',
      'commit:attempt',
    ]);
    expect(ledger.turns.get(descriptor.attemptId)?.[0]).toMatchObject({
      state: 'closed',
      resultSpoolReceipt: expect.any(Object),
    });
    expect(ledger.executionReceipts[0]).toMatchObject({ toolCalls: 2 });
    expect(
      ledger.controlledRuntimeReceipts[0]?.isolatedExecution
    ).toMatchObject({ toolCallCount: 2 });
  }, 60_000);

  it('atomically commits a completed zero-tool controlled runtime transcript', async () => {
    const ledger = new MemoryLedger();

    const result = await runner(ledger, 'completed-zero-tool').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.executionReceipts[0]).toMatchObject({ toolCalls: 0 });
    expect(ledger.executionReceipts[0]).not.toHaveProperty(
      'toolReceiptSetDigest'
    );
    const runtime = ledger.controlledRuntimeReceipts[0];
    expect(runtime?.isolatedExecution).toMatchObject({ toolCallCount: 0 });
    expect(runtime).not.toHaveProperty('toolExecutionReceiptSetDigest');
    expect(runtime).not.toHaveProperty('operationIntentSetDigest');
    expect(runtime).not.toHaveProperty('operationSealSetDigest');
  }, 60_000);

  it('recovers an atomic commit acknowledgement loss by exact attempt replay', async () => {
    const ledger = new MemoryLedger();
    ledger.loseAtomicCommitAcknowledgement = true;

    const result = await runner(ledger).run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(
      ledger.attempts.filter(
        ({ descriptor: candidate }) =>
          candidate.attemptId === descriptor.attemptId
      )
    ).toHaveLength(1);
    expect(
      ledger.budget.reservations.find(
        ({ reservationId }) =>
          reservationId === reservationIdFor(plan, descriptor)
      )
    ).toMatchObject({ status: 'settled' });
    expect(
      ledger.calls.filter((entry) => entry === 'atomic-commit')
    ).toHaveLength(1);
  }, 60_000);

  it('leaves the descriptor missing and reconciles after an atomic ledger failure', async () => {
    const ledger = new MemoryLedger();
    ledger.failAtomicCommit = true;

    const result = await runner(ledger).run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: { state: 'incomplete' },
    });
    expect(
      ledger.attempts.some(
        ({ descriptor: candidate }) =>
          candidate.attemptId === descriptor.attemptId
      )
    ).toBe(false);
    expect(ledger.latestCheckpoint?.missingAttemptRefs).toContainEqual(
      expect.objectContaining({ attemptId: descriptor.attemptId })
    );
    expect(ledger.sourceReceipts).toHaveLength(0);
    expect(ledger.calls).toContain('reconcile:ack-loss');
  }, 60_000);

  it('persists a provider terminal failure as a denominator attempt', async () => {
    const ledger = new MemoryLedger();

    const result = await runner(ledger, 'provider-error').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(
      ledger.attempts.find(
        ({ descriptor: candidate }) =>
          candidate.attemptId === descriptor.attemptId
      )
    ).toMatchObject({
      status: 'provider-error',
      outcome: 'inconclusive',
    });
    expect(ledger.resultSubmissionReceipts).toHaveLength(0);
    expect(ledger.controlledRuntimeReceipts).toHaveLength(0);
    expect(ledger.turns.get(descriptor.attemptId)?.[0]).toMatchObject({
      state: 'closed',
      transportReceipt: { outcome: 'failed' },
    });
  }, 60_000);

  it('atomically binds a pre-dispatch failure receipt to a not-created denominator turn', async () => {
    const ledger = new MemoryLedger();

    const result = await runner(ledger, 'pre-dispatch-failure').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.calls).not.toContain('dispatch-intent');
    expect(ledger.calls).not.toContain('provider-invoke');
    expect(ledger.preDispatchFailureReceipts).toHaveLength(1);
    expect(
      ledger.attempts.find(
        ({ descriptor: candidate }) =>
          candidate.attemptId === descriptor.attemptId
      )
    ).toMatchObject({
      status: 'blocked',
      outcome: 'inconclusive',
    });
  }, 60_000);

  it('keeps a no-call reservation resumable after atomic commit failure', async () => {
    const ledger = new MemoryLedger();
    ledger.failAtomicCommit = true;

    const first = await runner(ledger, 'pre-dispatch-failure').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(first).toMatchObject({ ok: false, reason: 'executor-failed' });
    expect(ledger.preDispatchFailureReceipts).toHaveLength(1);
    expect(ledger.calls).not.toContain('reconcile:ack-loss');
    expect(
      ledger.attempts.some(
        ({ descriptor: current }) => current.attemptId === descriptor.attemptId
      )
    ).toBe(false);

    ledger.failAtomicCommit = false;
    ledger.latestCheckpoint = undefined;
    const resumed = await runner(ledger, 'pre-dispatch-failure').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(resumed).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.preDispatchFailureReceipts).toHaveLength(1);
    expect(ledger.calls).not.toContain('dispatch-intent');
    expect(ledger.calls).not.toContain('provider-invoke');
    expect(
      ledger.attempts.find(
        ({ descriptor: current }) => current.attemptId === descriptor.attemptId
      )
    ).toMatchObject({ status: 'blocked', outcome: 'inconclusive' });
  }, 60_000);

  it('reconciles worker loss, then resumes the encrypted spool without reinvoking provider', async () => {
    const ledger = new MemoryLedger();

    const first = await runner(ledger, 'worker-loss-after-source').run({
      plan,
      shardId: descriptor.shardId,
    });
    expect(first).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: { state: 'incomplete' },
    });
    expect(ledger.calls).toContain('reconcile:worker-loss');
    const providerCalls = ledger.calls.filter(
      (entry) => entry === 'provider-invoke'
    ).length;
    const dispatchCalls = ledger.calls.filter(
      (entry) => entry === 'dispatch-intent'
    ).length;

    ledger.latestCheckpoint = undefined;
    const resumed = await runner(ledger, 'completed').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(resumed).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.calls).toContain('resume');
    expect(ledger.calls).toContain('read-spool');
    expect(
      ledger.calls.filter((entry) => entry === 'provider-invoke')
    ).toHaveLength(providerCalls);
    expect(
      ledger.calls.filter((entry) => entry === 'dispatch-intent')
    ).toHaveLength(dispatchCalls);
  }, 60_000);

  it('resumes a prior run-attempt checkpoint under a new owner and lease generation', async () => {
    const ledger = new MemoryLedger();
    const attemptOneOwner = `g4.eval.123456789.1.full_shards.${descriptor.shardId}`;
    const attemptTwoOwner = `g4.eval.123456789.2.full_shards.${descriptor.shardId}`;

    const first = await runner(ledger, 'worker-loss-after-source', {
      ownerId: attemptOneOwner,
    }).run({ plan, shardId: descriptor.shardId });
    expect(first).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: { state: 'incomplete' },
    });
    expect(ledger.latestCheckpoint).toMatchObject({ state: 'incomplete' });
    expect(ledger.lease).toMatchObject({
      ownerId: attemptOneOwner,
      generation: 1,
    });
    const providerCalls = ledger.calls.filter(
      (entry) => entry === 'provider-invoke'
    ).length;
    const dispatchCalls = ledger.calls.filter(
      (entry) => entry === 'dispatch-intent'
    ).length;

    const resumed = await runner(ledger, 'completed', {
      ownerId: attemptTwoOwner,
      now: () => '2026-08-02T01:06:00.000Z',
    }).run({ plan, shardId: descriptor.shardId });

    expect(resumed).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.lease).toMatchObject({
      ownerId: attemptTwoOwner,
      generation: 2,
    });
    expect(ledger.calls).toContain('resume');
    expect(ledger.calls).toContain('read-spool');
    expect(
      ledger.calls.filter((entry) => entry === 'provider-invoke')
    ).toHaveLength(providerCalls);
    expect(
      ledger.calls.filter((entry) => entry === 'dispatch-intent')
    ).toHaveLength(dispatchCalls);
  }, 60_000);

  it('replays a closed continuation and appends exactly the next durable turn', async () => {
    const ledger = new MemoryLedger();
    const first = await runner(ledger, 'worker-loss-after-source').run({
      plan,
      shardId: descriptor.shardId,
    });
    expect(first).toMatchObject({ ok: false, reason: 'executor-failed' });
    const providerCalls = ledger.calls.filter(
      (entry) => entry === 'provider-invoke'
    ).length;
    const dispatchCalls = ledger.calls.filter(
      (entry) => entry === 'dispatch-intent'
    ).length;
    ledger.latestCheckpoint = undefined;

    const resumed = await runner(ledger, 'completed', {
      executorFactoryOverride: recoveryAppendExecutorFactory(
        ledger,
        'append-next'
      ),
    }).run({ plan, shardId: descriptor.shardId });

    expect(resumed).toMatchObject({ ok: false, reason: 'executor-failed' });
    expect(ledger.calls).toContain('append-next-accepted');
    expect(ledger.turns.get(descriptor.attemptId)).toHaveLength(2);
    expect(ledger.turns.get(descriptor.attemptId)?.[1]).toMatchObject({
      state: 'dispatched',
      turnIndex: 1,
    });
    expect(
      ledger.calls.filter((entry) => entry === 'provider-invoke')
    ).toHaveLength(providerCalls);
    expect(
      ledger.calls.filter((entry) => entry === 'dispatch-intent')
    ).toHaveLength(dispatchCalls + 1);
  }, 60_000);

  it.each<readonly [RecoveryAppendMode, string]>([
    ['append-after-terminal', 'closed terminal'],
    ['append-gap', 'turn gap'],
    ['append-duplicate', 'duplicate turn'],
  ])(
    'fails closed when recovery attempts %s (%s)',
    async (mode) => {
      const ledger = new MemoryLedger();
      await runner(ledger, 'worker-loss-after-source').run({
        plan,
        shardId: descriptor.shardId,
      });
      const dispatchCalls = ledger.calls.filter(
        (entry) => entry === 'dispatch-intent'
      ).length;
      ledger.latestCheckpoint = undefined;

      const resumed = await runner(ledger, 'completed', {
        executorFactoryOverride: recoveryAppendExecutorFactory(ledger, mode),
      }).run({ plan, shardId: descriptor.shardId });

      expect(resumed).toMatchObject({
        ok: false,
        reason: 'executor-failed',
      });
      expect(ledger.calls).toContain(`append-boundary-rejected:${mode}`);
      expect(ledger.calls).not.toContain(
        'append-boundary-unexpectedly-accepted'
      );
      expect(ledger.turns.get(descriptor.attemptId)).toHaveLength(1);
      expect(
        ledger.calls.filter((entry) => entry === 'dispatch-intent')
      ).toHaveLength(dispatchCalls);
    },
    60_000
  );

  it('seals an open dispatched intent as post-dispatch-unknown and never redispatches', async () => {
    const ledger = new MemoryLedger();
    const demand = demandFor(descriptor, 'post-dispatch-unknown');
    const reservationId = reservationIdFor(plan, descriptor);
    const reserved = await ledger.reserveBudget({
      reservationId,
      expectedRevision: 0,
      demand,
      reservedAt: ATTEMPT_AT,
    });
    if (!reserved.ok) throw new Error('open-turn reservation failed');
    const intent = createDispatchIntent(
      plan,
      descriptor,
      'post-dispatch-unknown'
    );
    await ledger.putTurnDispatchIntent({
      descriptor,
      turnIndex: 0,
      budgetReservationId: reservationId,
      dispatchIntent: intent,
    });
    const dispatchCalls = ledger.calls.filter(
      (entry) => entry === 'dispatch-intent'
    ).length;

    const result = await runner(ledger, 'post-dispatch-unknown').run({
      plan,
      shardId: descriptor.shardId,
    });

    expect(result).toMatchObject({ ok: true, executedAttemptCount: 1 });
    expect(ledger.calls).toContain('close:post-dispatch-unknown');
    expect(ledger.calls).toContain('resume');
    expect(ledger.calls).not.toContain('provider-invoke');
    expect(
      ledger.calls.filter((entry) => entry === 'dispatch-intent')
    ).toHaveLength(dispatchCalls);
    expect(
      ledger.attempts.find(
        ({ descriptor: candidate }) =>
          candidate.attemptId === descriptor.attemptId
      )
    ).toMatchObject({
      status: 'infrastructure-error',
      outcome: 'inconclusive',
    });
  }, 60_000);

  it('uses both completed-count and elapsed-time checkpoint thresholds', async () => {
    const intervalLedger = new MemoryLedger();
    await runner(intervalLedger, 'completed', {
      completedAttemptInterval: 1,
    }).run({ plan, shardId: descriptor.shardId });
    expect(
      intervalLedger.checkpoints.map(({ revision, state }) => ({
        revision,
        state,
      }))
    ).toEqual([
      { revision: 0, state: 'running' },
      { revision: 1, state: 'completed' },
    ]);

    const elapsedLedger = new MemoryLedger();
    let nowIndex = 0;
    const now = () =>
      new Date(Date.parse(ATTEMPT_AT) + nowIndex++ * 10_000).toISOString();
    await runner(elapsedLedger, 'completed', {
      completedAttemptInterval: 100,
      maximumIntervalMs: 1_000,
      now,
    }).run({ plan, shardId: descriptor.shardId });
    expect(
      elapsedLedger.checkpoints.map(({ revision, state }) => ({
        revision,
        state,
      }))
    ).toEqual([
      { revision: 0, state: 'running' },
      { revision: 1, state: 'completed' },
    ]);
    expect(elapsedLedger.latestCheckpoint?.completedAttemptRefs).toHaveLength(
      shardDescriptors.length
    );
  }, 60_000);
});
