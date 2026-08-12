import { readFileSync } from 'node:fs';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
  createAgentBudgetLedger,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationCapabilityExecutionReceipt,
  createAgentEvaluationExecutionReceipt,
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationPreDispatchFailureReceipt,
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
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  encodeAgentEvaluationFact,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationResultSubmissionReceipt,
  normalizeAgentCosts,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationShardCheckpoint,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  HttpAgentEvaluationDurableShardLedger,
  decodeAgentEvaluationDurableBudget,
} from './durableShardLedgerAdapter';
import {
  isAgentEvaluationDurableAttemptEvidence,
  type AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import { AgentEvaluationRunnerError } from './errors';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  facts: {
    plan: unknown & { value: AgentModelEvaluationPlan };
    attempt: unknown & {
      value: { descriptor: AgentModelEvaluationAttemptDescriptor };
    };
    checkpoint: unknown & { value: AgentEvaluationShardCheckpoint };
  };
};

const plan = vector.facts.plan.value;
const descriptor = vector.facts.attempt.value.descriptor;
const RESERVED_AT = '2026-08-02T01:00:00.000Z';
const SETTLED_AT = '2026-08-02T01:00:01.000Z';

const demand = (): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([]),
    cost: normalizeAgentCosts([]),
    modelInvocations: 1,
    toolCalls: 1,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 1_000,
  });

const emptyBudgetResponse = () =>
  Object.freeze({
    planDigest: plan.planDigest,
    revision: 0,
    updatedAt: plan.plannedAt,
    reservations: Object.freeze([]),
    settlements: Object.freeze([]),
    unsettledReservationIds: Object.freeze([]),
  });

const reservedBudget = () => {
  const result = reserveAgentBudget(
    createAgentBudgetLedger(plan.budget.budget),
    {
      reservationId: 'reservation.atomic-test',
      expectedRevision: 0,
      demand: demand(),
      reservedAt: RESERVED_AT,
    }
  );
  if (!result.ok) throw new Error('test reservation failed');
  return result;
};

const reservedBudgetResponse = () => {
  const result = reservedBudget();
  return Object.freeze({
    planDigest: plan.planDigest,
    revision: result.state.revision,
    updatedAt: RESERVED_AT,
    reservations: Object.freeze([
      Object.freeze({
        reservationId: result.reservation.reservationId,
        ledgerRevision: result.state.revision,
        demandDigest: result.reservation.demandDigest,
        demand: result.reservation.demand,
        reservedAt: result.reservation.reservedAt,
      }),
    ]),
    settlements: Object.freeze([]),
    unsettledReservationIds: Object.freeze([result.reservation.reservationId]),
  });
};

const receiptDigest = <T extends Readonly<Record<string, unknown>>>(base: T) =>
  Object.freeze({ ...base, receiptDigest: digestAgentCanonicalValue(base) });

const verificationAttemptGrantReceipt =
  (): AgentEvaluationVerificationAttemptGrantReceipt => {
    const namespaceId = 'evaluation-test';
    const generation = 1;
    const workspaceId = 'workspace-evaluation-test';
    const workspaceRevision = 1;
    const projectId = 'project-evaluation-test';
    const verificationPlanDigest = digestAgentCanonicalValue(
      'verification-plan.atomic-test'
    );
    const cellId = 'cell-evaluation-test';
    const issuanceBindingDigest = digestAgentCanonicalValue({
      namespaceId,
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      evaluationAttemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
      caseId: descriptor.caseId,
      generation,
      workspaceId,
      workspaceRevision,
      projectId,
      verificationPlanDigest,
      cellId,
    });
    const grantFields = Object.freeze({
      workspaceId,
      projectId,
      workspaceRevision,
      partitionRevisionsDigest: digestAgentCanonicalValue(
        'partition-revisions.atomic-test'
      ),
      policyRevision: 1,
      policyDigest: digestAgentCanonicalValue(
        'verification-policy.atomic-test'
      ),
      policyEvaluationInstant: RESERVED_AT,
      impactDigest: digestAgentCanonicalValue(
        'verification-impact.atomic-test'
      ),
      verificationPlanDigest,
      cellId,
      checkId: 'check-evaluation-test',
      checkKind: 'integration',
      targetId: 'target-evaluation-test',
      attemptId: descriptor.attemptId,
      runId: 'verification-run-evaluation-test',
      providerId: 'verification-provider-evaluation-test',
      producerId: 'prodivix.g4-evaluation-controlled-runtime' as const,
      trustCeiling: 'ci-attested' as const,
      retentionRequest: Object.freeze({
        successful: 'release' as const,
        failed: 'release' as const,
        protectReleaseEvidence: true,
      }),
      maximumClosureEvidenceRecords: 1,
      issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
      issuedAt: RESERVED_AT,
      expiresAt: plan.expiresAt,
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
      format:
        'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
      version: 1 as const,
      namespaceId,
      evaluationPlanDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      evaluationAttemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
      caseId: descriptor.caseId,
      generation,
      verificationPlanDigest,
      cellId,
      requestDigest: digestAgentCanonicalValue({
        issuanceBindingDigest,
        request: 'atomic-test',
      }),
      issuanceBindingDigest,
      grant,
    });
    return Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
  };

const atomicFixture = () => {
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  )!;
  const provider = plan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target.providerConfigurationId
  )!;
  const model = plan.modelConfigurations.find(
    ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
  )!;
  const concreteCase = plan.concreteCases.find(
    ({ caseId }) => caseId === descriptor.caseId
  )!;
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const verificationAttemptGrant = verificationAttemptGrantReceipt();
  const providerRequestId = `provider-request.${suffix}`;
  const usage = createAgentUsageVector([]);
  const cost = normalizeAgentCosts([]);
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.a-usage.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: digestAgentCanonicalValue({
      providerRequestId,
      usage,
    }),
    inputUsageDigest: usage.vectorDigest,
    observedAt: SETTLED_AT,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.b-cost.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-cost',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: digestAgentCanonicalValue({ providerRequestId, cost }),
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: SETTLED_AT,
  });
  const requestDigest = digestAgentCanonicalValue({ descriptor, request: 1 });
  const responseDigest = digestAgentCanonicalValue({ descriptor, response: 1 });
  const invocationReceipt = receiptDigest({
    invocationId: `invocation.${suffix}`,
    taskId: plan.evaluationPlanId,
    runId: `run.${suffix}`,
    generation: 0,
    attempt: 1,
    provider,
    model,
    capabilityQualificationDigest: target.qualificationSliceDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    contextPackDigest: digestAgentCanonicalValue({ descriptor, context: 1 }),
    requestDigest,
    responseDigest,
    outcome: 'completed' as const,
    usage,
    costStatus: 'priced' as const,
    cost,
    startedAt: RESERVED_AT,
    completedAt: SETTLED_AT,
  });
  const reservationId = 'reservation.atomic-test';
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: `intent.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    invocationId: invocationReceipt.invocationId,
    budgetReservationId: reservationId,
    demandDigest: digestAgentCanonicalValue(demand()),
    requestDigest,
    endpointId: `endpoint.${provider.providerConfigurationId}`,
    endpointClass:
      target.protocolFamily === 'openai-compatible'
        ? 'local'
        : 'first-party-hosted',
    requestBodyDigest: digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      body: 'provider-request',
    }),
    requestBytes: 1,
    createdAt: RESERVED_AT,
  });
  const responseHeaderDigest = digestAgentCanonicalValue({ headers: 'safe' });
  const responseBodyDigest = digestAgentCanonicalValue({
    descriptorDigest: descriptor.descriptorDigest,
    body: 'provider-response',
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: `transport.${suffix}`,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    invocationId: invocationReceipt.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass: dispatchIntent.endpointClass,
    requestBodyDigest: dispatchIntent.requestBodyDigest,
    requestBytes: dispatchIntent.requestBytes,
    responseBytes: 1,
    httpStatus: 200,
    responseHeaderDigest,
    responseBodyDigest,
    providerRequestId,
    providerIdentityKind:
      target.protocolFamily === 'anthropic-messages'
        ? 'message-id'
        : target.protocolFamily === 'gemini-interactions'
          ? 'interaction-id'
          : 'response-id',
    providerResponseId: `provider-response.${suffix}`,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    sseEventCount: 2,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: RESERVED_AT,
    completedAt: SETTLED_AT,
  });
  const spoolNamespaceDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-model-evaluation-response-spool-namespace',
    version: 1,
    namespaceId: 'evaluation-test',
  });
  const spoolAad = createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: spoolNamespaceDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId: invocationReceipt.invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    responseBodyDigest,
    normalizedEventSetDigest: digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      events: ['created', 'completed'],
    }),
  });
  const spoolEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationProviderResultSpoolId(spoolAad),
    algorithm: 'aes-256-gcm',
    keyId: 'key.g4-model-eval.result-spool.test',
    keyVersion: 1,
    keyRefDigest: digestAgentCanonicalValue('spool-key-ref.atomic-test'),
    encryptionProfileDigest: digestAgentCanonicalValue(
      'spool-encryption-profile.atomic-test'
    ),
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQID',
    aadDigest: digestAgentEvaluationProviderResultSpoolAad(spoolAad),
  });
  const providerResultSpoolReceipt =
    createAgentEvaluationProviderResultSpoolReceipt({
      aad: spoolAad,
      envelope: spoolEnvelope,
      responseDigest,
      retentionClass: 'attempt-resume-only',
      retentionPolicyDigest: digestAgentCanonicalValue(
        'attempt-resume-only.atomic-test'
      ),
      createdAt: SETTLED_AT,
      expiresAt: '2026-08-03T01:00:01.000Z',
    });
  const providerResultSpoolDispositionReceipt =
    createAgentEvaluationProviderResultSpoolDispositionReceipt({
      spoolRef: providerResultSpoolReceipt.spoolRef,
      spoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId: invocationReceipt.invocationId,
      disposition: 'consumed-and-destroyed',
      retentionPolicyDigest: providerResultSpoolReceipt.retentionPolicyDigest,
      disposedAt: SETTLED_AT,
    });
  const materialDigest = digestAgentCanonicalValue({
    caseId: concreteCase.caseId,
    material: 'atomic-test',
  });
  const resultSubmissionReceipt: AgentEvaluationResultSubmissionReceipt =
    receiptDigest({
      format: 'prodivix.agent-evaluation-result-submission-receipt' as const,
      version: 1 as const,
      attemptId: descriptor.attemptId,
      invocationId: invocationReceipt.invocationId,
      descriptorDigest: descriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
      nativeToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
      toolVersion: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
      schemaDigest: digestAgentCanonicalValue('result-schema.atomic-test'),
      inputSchemaDigest: digestAgentCanonicalValue('result-input.atomic-test'),
      toolDefinitionDigest: digestAgentCanonicalValue(
        'result-tool-definition.atomic-test'
      ),
      providerToolCallId: `provider-tool-call.${suffix}`,
      toolArgumentsDigest: digestAgentCanonicalValue(
        'result-arguments.atomic-test'
      ),
      toolEventSequence: 1,
      toolEventDigest: digestAgentCanonicalValue(
        'result-tool-event.atomic-test'
      ),
      terminalEventSequence: 2,
      terminalEventDigest: digestAgentCanonicalValue(
        'terminal-event.atomic-test'
      ),
      submissionDigest: digestAgentCanonicalValue('submission.atomic-test'),
    });
  const isolationPolicyDigest = digestAgentCanonicalValue(
    'runtime-isolation.atomic-test'
  );
  const ownerAuthorityReceiptDigests = Object.freeze(
    [
      digestAgentCanonicalValue('owner-authority.atomic-test'),
      verificationAttemptGrant.receiptDigest,
    ].sort(compareUnicodeCodePoints)
  );
  const operationSealReceiptDigests = Object.freeze([
    digestAgentCanonicalValue('operation-seal.atomic-test'),
  ]);
  const toolReceiptSetDigest = digestAgentCanonicalValue(
    'tool-receipt-set.atomic-test'
  );
  const verificationClosureDigest = digestAgentCanonicalValue(
    'verification-closure.atomic-test'
  );
  const verificationAttemptGrantReceiptDigests = Object.freeze([
    verificationAttemptGrant.receiptDigest,
  ]);
  const controlledRuntimeReceipt: AgentEvaluationControlledRuntimeReceipt =
    receiptDigest({
      format: 'prodivix.agent-evaluation-controlled-runtime-receipt' as const,
      version: 1 as const,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      submissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
      runtimeAuthorityId: 'controlled-runtime.atomic-test',
      runtimeImplementationDigest: digestAgentCanonicalValue(
        'controlled-runtime.atomic-test'
      ),
      artifactResolutionPolicyDigest: digestAgentCanonicalValue(
        'artifact-resolution.atomic-test'
      ),
      proposalValidationPolicyDigest: digestAgentCanonicalValue(
        'proposal-validation.atomic-test'
      ),
      isolationPolicyDigest,
      g3VerificationPolicyDigest: digestAgentCanonicalValue(
        'g3-verification.atomic-test'
      ),
      controlledRenderPolicyDigest: digestAgentCanonicalValue(
        'controlled-render.atomic-test'
      ),
      loopPolicyDigest: digestAgentCanonicalValue('loop-policy.atomic-test'),
      maximumTurnsPerAttempt: 4,
      maximumToolCallsPerAttempt: 2,
      maximumRepairRoundsPerAttempt: 1,
      maximumAggregateArtifactBytes: 1,
      verificationAttemptGrantReceiptDigests,
      verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests,
      }),
      grantDigest: digestAgentCanonicalValue('runtime-grant.atomic-test'),
      grantGeneration: 1,
      toolRegistryDigest: digestAgentCanonicalValue(
        'tool-registry.atomic-test'
      ),
      actionRegistryDigest: digestAgentCanonicalValue(
        'action-registry.atomic-test'
      ),
      operationSealReceiptDigests,
      ownerAuthorityReceiptDigests,
      baseSnapshotDigest: digestAgentCanonicalValue(
        'base-snapshot.atomic-test'
      ),
      finalSnapshotDigest: digestAgentCanonicalValue(
        'final-snapshot.atomic-test'
      ),
      cleanupReceiptDigest: digestAgentCanonicalValue('cleanup.atomic-test'),
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      toolExecutionReceiptSetDigest: digestAgentCanonicalValue(
        'tool-execution-receipt-set.atomic-test'
      ),
      continuationReceiptSetDigest: digestAgentCanonicalValue(
        'continuation-receipt-set.atomic-test'
      ),
      operationIntentSetDigest: digestAgentCanonicalValue(
        'operation-intent-set.atomic-test'
      ),
      operationSealSetDigest: digestAgentCanonicalValue({
        operationSealReceiptDigests,
      }),
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
          'typed-proposal-validation.atomic-test'
        ),
      }),
      isolatedExecution: Object.freeze({
        isolationPolicyDigest,
        toolCallCount: 1,
        toolReceiptSetDigest,
        repairRoundCount: 0,
        commandCount: 0,
        commandReceiptSetDigest: digestAgentCanonicalValue({
          commandReceiptDigests: [],
        }),
        transactionCount: 0,
      }),
      g3Verification: Object.freeze({
        verificationPlanReceiptDigest: digestAgentCanonicalValue(
          'verification-plan.atomic-test'
        ),
        verificationClosureDigest,
        verdict: 'passed' as const,
      }),
    });
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest,
    status: 'completed',
    retryable: false,
    invocationReceiptDigest: invocationReceipt.receiptDigest,
    responseDigest,
    startedAt: RESERVED_AT,
    completedAt: SETTLED_AT,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digestAgentCanonicalValue('single-turn.atomic-test'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: false,
  });
  const invocationTurnReceipt = createAgentEvaluationInvocationTurnReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId: invocationReceipt.invocationId,
    status: 'completed',
    dispatchState: 'dispatched',
    terminal: true,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    contextPackDigest: invocationReceipt.contextPackDigest,
    requestArtifactDigest: requestDigest,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    transportRetryReceipt,
    invocationReceipt,
    providerRequestId,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    resolvedModelIdentityDigest: digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: target.protocolFamily,
      transportReceiptDigest: transportReceipt.receiptDigest,
      frozenModelId: model.modelId,
      ...(model.immutableVersion
        ? { frozenImmutableModelVersion: model.immutableVersion }
        : {}),
      resolvedModelId: model.modelId,
      ...(model.immutableVersion
        ? { resolvedModelVersion: model.immutableVersion }
        : {}),
    }),
    responseHeaderDigest,
    responseArtifactDigest: responseDigest,
    providerResultSpoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
    usageSourceReceiptDigest: usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: costSourceReceipt.receiptDigest,
    resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    controlledRuntimeReceiptDigest: controlledRuntimeReceipt.receiptDigest,
  });
  const capability = concreteCase.capabilityDescriptor;
  const capabilityExecutionReceipt =
    createAgentEvaluationCapabilityExecutionReceipt({
      capabilityExecutionReceiptId: `capability-execution.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: invocationTurnReceipt.turnIndex,
      invocationId: invocationTurnReceipt.invocationId,
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
      policyDigest: plan.policyDigest,
      toolRegistryDigest: plan.toolRegistryDigest,
      observedAt: SETTLED_AT,
    });
  const capabilityExecutionReceiptSetDigest =
    digestAgentEvaluationCapabilityExecutionReceiptSet([
      capabilityExecutionReceipt,
    ]);
  const verificationAttemptGrantReceipts = Object.freeze([
    verificationAttemptGrant,
  ]);
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationVerificationAttemptGrantReceiptSet(
      verificationAttemptGrantReceipts
    );
  const invocationTurnSetReceipt =
    createAgentEvaluationInvocationTurnSetReceipt({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turns: Object.freeze([invocationTurnReceipt]),
    });
  const executionReceipt = createAgentEvaluationExecutionReceipt({
    executionReceiptId: `execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    modelInvocations: 1,
    toolCalls: 1,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 1_000,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    toolReceiptSetDigest,
    verificationClosureDigest,
  });
  const attempt = createAgentModelEvaluationAttempt({
    descriptor,
    independentRunId: invocationReceipt.runId,
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet([
      dispatchIntent,
    ]),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet([
      transportReceipt,
    ]),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet([invocationTurnReceipt]),
    invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    responseDigest,
    status: 'completed',
    outcome: 'passed',
    metricObservations: Object.freeze([
      createAgentEvaluationMetricObservation({
        metricId: plan.thresholds.metrics[0]!.metricId,
        graderId: plan.graderPlan.deterministicAuthorityGraderIds[0]!,
        graderKind: 'deterministic-rule',
        authority: 'deterministic',
        verdict: 'passed',
      }),
    ]),
    usage: invocationTurnSetReceipt.aggregateUsage,
    cost: invocationTurnSetReceipt.aggregateCost,
    startedAt: RESERVED_AT,
    completedAt: SETTLED_AT,
  });
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
    terminalTurnReceiptDigest: invocationTurnReceipt.evidenceDigest,
    capabilityExecutionReceiptDigest: capabilityExecutionReceipt.receiptDigest,
    resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    controlledRuntimeReceiptDigest: controlledRuntimeReceipt.receiptDigest,
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
  const gradingOwnerReceipt = createAgentEvaluationAttemptAuthorityOwnerReceipt(
    {
      serviceKind: 'attempt-grading',
      operation: 'grade-and-persist',
      namespaceId: verificationAttemptGrant.namespaceId,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      shardLeaseOwnerId: 'evaluation-worker.atomic-test',
      shardLeaseGeneration: verificationAttemptGrant.generation,
      verificationGrantGeneration: verificationAttemptGrant.generation,
      verificationAttemptGrantReceiptSetDigest,
      requestDigest: digestAgentCanonicalValue({
        operation: 'grade-and-persist',
        descriptorDigest: descriptor.descriptorDigest,
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
        'attempt-grading.atomic-test'
      ),
      completedAt: SETTLED_AT,
    }
  );
  return Object.freeze({
    encryptedResultSpool: Object.freeze({
      aad: spoolAad,
      envelope: spoolEnvelope,
      responseDigest,
      retentionPolicyDigest: providerResultSpoolReceipt.retentionPolicyDigest,
      expiresAt: providerResultSpoolReceipt.expiresAt,
    }),
    transportDispatchIntents: Object.freeze([dispatchIntent]),
    transportReceipts: Object.freeze([transportReceipt]),
    providerResultSpoolReceipts: Object.freeze([providerResultSpoolReceipt]),
    providerResultSpoolDispositionReceipts: Object.freeze([
      providerResultSpoolDispositionReceipt,
    ]),
    preDispatchFailureReceipts: Object.freeze([]),
    capabilityExecutionReceipts: Object.freeze([capabilityExecutionReceipt]),
    capabilitySpecificReceipts: Object.freeze([]),
    providerCapabilityObservationReceipts: Object.freeze([]),
    attemptAuthorityOwnerReceipts: Object.freeze([gradingOwnerReceipt]),
    verificationAttemptGrantReceipts,
    invocationTurnReceipts: Object.freeze([invocationTurnReceipt]),
    invocationTurnSetReceipt,
    sourceReceipts: Object.freeze([usageSourceReceipt, costSourceReceipt]),
    resultSubmissionReceipt,
    controlledRuntimeReceipt,
    executionReceipt,
    attempt,
  });
};

const durableTurnFixture = () => {
  const evidence = atomicFixture();
  const dispatchIntent = evidence.transportDispatchIntents[0]!;
  const transportReceipt = evidence.transportReceipts[0]!;
  const resultSpoolReceipt = evidence.providerResultSpoolReceipts[0]!;
  const dispatchedBase = Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    budgetReservationId: dispatchIntent.budgetReservationId,
    dispatchIntent,
    createdAt: dispatchIntent.createdAt,
    state: 'dispatched' as const,
  });
  const dispatched: AgentEvaluationDurableTurnRecord = Object.freeze({
    ...dispatchedBase,
    turnDigest: digestAgentCanonicalValue(dispatchedBase),
  });
  const closedBase = Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    budgetReservationId: dispatchIntent.budgetReservationId,
    dispatchIntent,
    createdAt: dispatchIntent.createdAt,
    state: 'closed' as const,
    transportReceipt,
    resultSpoolReceipt,
    closedAt: transportReceipt.completedAt,
  });
  const closed: AgentEvaluationDurableTurnRecord = Object.freeze({
    ...closedBase,
    turnDigest: digestAgentCanonicalValue(closedBase),
  });
  return Object.freeze({ evidence, dispatched, closed });
};

const scope = Object.freeze({
  namespace: 'evaluation-test',
  planDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
});

const client = (overrides: Readonly<Record<string, unknown>> = {}) =>
  ({
    scope,
    listAttempts: vi.fn(async () => ({ facts: [] })),
    getLatestCheckpoint: vi.fn(async () => {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
        404
      );
    }),
    getBudget: vi.fn(async () => emptyBudgetResponse()),
    claimLease: vi.fn(async () => {
      throw new Error('unused');
    }),
    renewLease: vi.fn(async () => {
      throw new Error('unused');
    }),
    reserveBudget: vi.fn(async () => {
      throw new Error('unused');
    }),
    reconcileBudget: vi.fn(async () => {
      throw new Error('unused');
    }),
    listAttemptTurns: vi.fn(async () => {
      throw new Error('unused');
    }),
    listPreDispatchFailureReceipts: vi.fn(async () => ({ facts: [] })),
    putPreDispatchFailureReceipt: vi.fn(async () => {
      throw new Error('unused');
    }),
    putTurnDispatchIntent: vi.fn(async () => {
      throw new Error('unused');
    }),
    closeTurnTransport: vi.fn(async () => {
      throw new Error('unused');
    }),
    getTurnResultSpool: vi.fn(async () => {
      throw new Error('unused');
    }),
    putCheckpoint: vi.fn(async () => {
      throw new Error('unused');
    }),
    putAttemptCommit: vi.fn(async () => {
      throw new Error('unused');
    }),
    ...overrides,
  }) as never;

const adapter = (overrides: Readonly<Record<string, unknown>> = {}) =>
  new HttpAgentEvaluationDurableShardLedger(client(overrides), plan);

describe('HttpAgentEvaluationDurableShardLedger', () => {
  it('strictly replays budget exports and rejects extra fields', () => {
    expect(
      decodeAgentEvaluationDurableBudget(emptyBudgetResponse(), plan)
    ).toEqual(createAgentBudgetLedger(plan.budget.budget));
    expect(() =>
      decodeAgentEvaluationDurableBudget(
        { ...emptyBudgetResponse(), unexpected: true },
        plan
      )
    ).toThrow('Evaluation durable shard ledger response is invalid.');
  });

  it('decodes canonical attempt, checkpoint, and lease acknowledgements', async () => {
    const knownAttempt = atomicFixture().attempt;
    const acquiredAt = RESERVED_AT;
    const expiresAt = '2026-08-02T01:05:00.000Z';
    const leaseBase = Object.freeze({
      planDigest: plan.planDigest,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.test',
      generation: 1,
      acquiredAt,
      expiresAt,
    });
    const lease = Object.freeze({
      ...leaseBase,
      leaseDigest: digestAgentCanonicalValue(leaseBase),
    });
    const subject = adapter({
      listAttempts: vi.fn(async () => ({
        facts: [
          encodeAgentEvaluationFact({
            factType: 'evaluation-attempt',
            value: knownAttempt,
          }),
        ],
      })),
      getLatestCheckpoint: vi.fn(async () => ({
        fact: vector.facts.checkpoint,
      })),
      claimLease: vi.fn(async () => ({ ...lease, replayed: false })),
      renewLease: vi.fn(async () => lease),
    });

    await expect(subject.listAttempts()).resolves.toHaveLength(1);
    await expect(
      subject.getLatestCheckpoint(descriptor.shardId)
    ).resolves.toEqual(vector.facts.checkpoint.value);
    await expect(
      subject.claimLease({
        planDigest: plan.planDigest,
        shardId: descriptor.shardId,
        ownerId: lease.ownerId,
        acquiredAt,
        expiresAt,
      })
    ).resolves.toMatchObject({ ok: true, value: lease });
    await expect(
      subject.renewLease({
        planDigest: plan.planDigest,
        shardId: descriptor.shardId,
        ownerId: lease.ownerId,
        generation: 1,
        renewedAt: SETTLED_AT,
        expiresAt,
      })
    ).resolves.toMatchObject({ ok: true, value: lease });
  });

  it('reserves and reconciles through exact budget CAS acknowledgements', async () => {
    const reservation = reservedBudget();
    const reserveSubject = adapter({
      reserveBudget: vi.fn(async () => ({
        reservationId: reservation.reservation.reservationId,
        ledgerRevision: reservation.state.revision,
        demandDigest: reservation.reservation.demandDigest,
        demand: reservation.reservation.demand,
        reservedAt: reservation.reservation.reservedAt,
        replayed: false,
      })),
    });
    await expect(
      reserveSubject.reserveBudget({
        reservationId: reservation.reservation.reservationId,
        expectedRevision: 0,
        demand: reservation.reservation.demand,
        reservedAt: reservation.reservation.reservedAt,
      })
    ).resolves.toEqual(reservation);

    const reconciled = reconcileAgentBudgetReservation(reservation.state, {
      reservationId: reservation.reservation.reservationId,
      expectedRevision: 1,
      reason: 'worker-loss',
      settledAt: SETTLED_AT,
    });
    if (!reconciled.ok || !reconciled.reservation.settlement) {
      throw new Error('test reconciliation failed');
    }
    const reconcileSubject = adapter({
      getBudget: vi.fn(async () => reservedBudgetResponse()),
      reconcileBudget: vi.fn(async () => ({
        reservationId: reconciled.reservation.reservationId,
        ledgerRevision: reconciled.state.revision,
        settlementDigest: reconciled.reservation.settlement!.settlementDigest,
        settlement: reconciled.reservation.settlement,
        settledAt: SETTLED_AT,
        replayed: false,
      })),
    });
    await expect(
      reconcileSubject.reconcileBudget({
        reservationId: reservation.reservation.reservationId,
        expectedRevision: 1,
        reason: 'worker-loss',
        settledAt: SETTLED_AT,
      })
    ).resolves.toEqual(reconciled);
  }, 20_000);

  it('strictly lists and exact-replays standalone pre-dispatch failure receipts', async () => {
    const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
    const receipt = createAgentEvaluationPreDispatchFailureReceipt({
      failureReceiptId: `pre-dispatch-failure.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId: `invocation.pre-dispatch.${suffix}`,
      stage: 'dispatch-admission',
      reasonCode: 'verification-attempt-grant-unavailable',
      policyDigest: plan.policyDigest,
      inputDigest: descriptor.descriptorDigest,
      findingDigest: digestAgentCanonicalValue('grant-unavailable.test'),
      occurredAt: RESERVED_AT,
    });
    const putPreDispatchFailureReceipt = vi.fn(
      async (attemptId: string, turnIndex: number, body: unknown) => {
        expect({ attemptId, turnIndex, body }).toEqual({
          attemptId: descriptor.attemptId,
          turnIndex: 0,
          body: receipt,
        });
        return { fact: receipt, replayed: true };
      }
    );
    const subject = adapter({
      listPreDispatchFailureReceipts: vi.fn(async () => ({
        facts: [receipt],
      })),
      putPreDispatchFailureReceipt,
    });

    await expect(subject.listPreDispatchFailureReceipts()).resolves.toEqual([
      receipt,
    ]);
    await expect(
      subject.putPreDispatchFailureReceipt(receipt)
    ).resolves.toEqual({ ok: true, value: receipt, replayed: true });
    expect(putPreDispatchFailureReceipt).toHaveBeenCalledTimes(1);

    const drifted = adapter({
      listPreDispatchFailureReceipts: vi.fn(async () => ({
        facts: [receipt],
        unexpected: true,
      })),
    });
    await expect(drifted.listPreDispatchFailureReceipts()).rejects.toThrow(
      'Evaluation durable shard ledger response is invalid.'
    );

    const laterReceipt = createAgentEvaluationPreDispatchFailureReceipt({
      failureReceiptId: `pre-dispatch-failure.${suffix}.1`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 1,
      invocationId: `invocation.pre-dispatch.${suffix}.1`,
      stage: 'dispatch-admission',
      reasonCode: 'verification-attempt-grant-unavailable',
      policyDigest: plan.policyDigest,
      inputDigest: descriptor.descriptorDigest,
      findingDigest: digestAgentCanonicalValue('grant-unavailable-1.test'),
      occurredAt: SETTLED_AT,
    });
    const outOfOrder = adapter({
      listPreDispatchFailureReceipts: vi.fn(async () => ({
        facts: [laterReceipt, receipt],
      })),
    });
    await expect(outOfOrder.listPreDispatchFailureReceipts()).rejects.toThrow(
      'Evaluation durable shard ledger response is invalid.'
    );
  }, 20_000);

  it('strictly persists and closes the descriptor-bound transport journal', async () => {
    const fixture = durableTurnFixture();
    const putTurnDispatchIntent = vi.fn(
      async (attemptId: string, turnIndex: number, body: unknown) => {
        expect({ attemptId, turnIndex, body }).toEqual({
          attemptId: descriptor.attemptId,
          turnIndex: 0,
          body: {
            descriptor,
            budgetReservationId: fixture.dispatched.budgetReservationId,
            dispatchIntent: fixture.dispatched.dispatchIntent,
          },
        });
        return { turn: fixture.dispatched, replayed: false };
      }
    );
    const closeTurnTransport = vi.fn(
      async (attemptId: string, turnIndex: number, body: unknown) => {
        expect({ attemptId, turnIndex, body }).toEqual({
          attemptId: descriptor.attemptId,
          turnIndex: 0,
          body: {
            descriptorDigest: descriptor.descriptorDigest,
            budgetReservationId: fixture.closed.budgetReservationId,
            expectedIntentDigest: fixture.closed.dispatchIntent.intentDigest,
            transportReceipt: fixture.closed.transportReceipt,
            encryptedResultSpool: fixture.evidence.encryptedResultSpool,
            closedAt: fixture.closed.closedAt,
          },
        });
        return { turn: fixture.closed, replayed: false };
      }
    );
    const subject = adapter({
      listAttemptTurns: vi.fn(async () => ({ turns: [fixture.closed] })),
      putTurnDispatchIntent,
      closeTurnTransport,
    });

    await expect(
      subject.listAttemptTurns(descriptor.attemptId)
    ).resolves.toEqual([fixture.closed]);
    await expect(
      subject.putTurnDispatchIntent({
        descriptor,
        turnIndex: 0,
        budgetReservationId: fixture.dispatched.budgetReservationId,
        dispatchIntent: fixture.dispatched.dispatchIntent,
      })
    ).resolves.toMatchObject({ ok: true, value: fixture.dispatched });
    await expect(
      subject.closeTurnTransport({
        descriptor,
        turnIndex: 0,
        budgetReservationId: fixture.closed.budgetReservationId,
        expectedIntentDigest: fixture.closed.dispatchIntent.intentDigest,
        transportReceipt: fixture.closed.transportReceipt,
        encryptedResultSpool: fixture.evidence.encryptedResultSpool,
        closedAt: fixture.closed.closedAt,
      })
    ).resolves.toMatchObject({ ok: true, value: fixture.closed });
  });

  it('reads encrypted result spools through the exact lease fence and rejects extras', async () => {
    const fixture = durableTurnFixture();
    if (!fixture.closed.resultSpoolReceipt) {
      throw new Error('spool fixture is missing');
    }
    const accessBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-provider-result-spool-access-receipt' as const,
      version: 1 as const,
      spoolRef: fixture.closed.resultSpoolReceipt.spoolRef,
      spoolReceiptDigest: fixture.closed.resultSpoolReceipt.receiptDigest,
      attemptId: descriptor.attemptId,
      turnIndex: 0,
      expectedTurnDigest: fixture.closed.turnDigest,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.test',
      leaseGeneration: 2,
      accessedAt: SETTLED_AT,
    });
    const accessReceipt = Object.freeze({
      ...accessBase,
      receiptDigest: digestAgentCanonicalValue(accessBase),
    });
    const response = Object.freeze({
      ...fixture.evidence.encryptedResultSpool,
      resultSpoolReceipt: fixture.closed.resultSpoolReceipt,
      accessReceipt,
    });
    const getTurnResultSpool = vi.fn(
      async (attemptId: string, turnIndex: number, query: unknown) => {
        expect({ attemptId, turnIndex, query }).toEqual({
          attemptId: descriptor.attemptId,
          turnIndex: 0,
          query: {
            shardId: descriptor.shardId,
            ownerId: 'evaluation-worker.test',
            leaseGeneration: 2,
            expectedTurnDigest: fixture.closed.turnDigest,
          },
        });
        return response;
      }
    );
    const input = {
      descriptor,
      turnIndex: 0,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.test',
      leaseGeneration: 2,
      expectedTurnDigest: fixture.closed.turnDigest,
    } as const;

    await expect(
      adapter({ getTurnResultSpool }).getTurnResultSpool(input)
    ).resolves.toEqual(response);
    await expect(
      adapter({
        getTurnResultSpool: vi.fn(async () => ({
          ...response,
          extra: true,
        })),
      }).getTurnResultSpool(input)
    ).rejects.toThrow('Evaluation durable shard ledger response is invalid.');
  }, 30_000);

  it('atomically acknowledges the complete receipt join, attempt, and settlement', async () => {
    const { encryptedResultSpool: _encryptedResultSpool, ...fixture } =
      atomicFixture();
    void _encryptedResultSpool;
    const reservation = reservedBudget();
    const expectedSettlement = settleAgentBudget(reservation.state, {
      reservationId: reservation.reservation.reservationId,
      expectedRevision: reservation.state.revision,
      actual: demand(),
      settledAt: SETTLED_AT,
    });
    if (!expectedSettlement.ok || !expectedSettlement.reservation.settlement) {
      throw new Error('test settlement failed');
    }
    const putAttemptCommit = vi.fn(async (_attemptId, body: unknown) => {
      const request = body as Record<string, unknown>;
      expect(Object.keys(request)).toEqual([
        'transportDispatchIntents',
        'transportReceipts',
        'providerResultSpoolReceipts',
        'providerResultSpoolDispositionReceipts',
        'preDispatchFailureReceipts',
        'capabilityExecutionReceipts',
        'capabilitySpecificReceipts',
        'providerCapabilityObservationReceipts',
        'attemptAuthorityOwnerReceipts',
        'verificationAttemptGrantReceipts',
        'invocationTurnReceipts',
        'invocationTurnSetReceipt',
        'sourceReceipts',
        'resultSubmissionReceipt',
        'controlledRuntimeReceipt',
        'executionReceipt',
        'attemptFact',
        'budgetSettlement',
      ]);
      expect(request.attemptFact).toEqual(
        encodeAgentEvaluationFact({
          factType: 'evaluation-attempt',
          value: fixture.attempt,
        })
      );
      const { budgetSettlement: _budgetSettlement, ...evidence } = request;
      void _budgetSettlement;
      return Object.freeze({
        ...evidence,
        budgetSettlement: Object.freeze({
          reservationId: reservation.reservation.reservationId,
          ledgerRevision: expectedSettlement.state.revision,
          settlementDigest:
            expectedSettlement.reservation.settlement!.settlementDigest,
          settlement: expectedSettlement.reservation.settlement,
          settledAt: SETTLED_AT,
        }),
        replayed: false,
      });
    });
    const subject = adapter({
      getBudget: vi.fn(async () => reservedBudgetResponse()),
      putAttemptCommit,
    });

    expect({
      result: isAgentEvaluationResultSubmissionReceipt(
        fixture.resultSubmissionReceipt
      ),
      runtime: isAgentEvaluationControlledRuntimeReceipt(
        fixture.controlledRuntimeReceipt
      ),
      turn: isAgentEvaluationInvocationTurnReceipt(
        fixture.invocationTurnReceipts[0]
      ),
      evidence: isAgentEvaluationDurableAttemptEvidence({
        plan,
        descriptor,
        demand: demand(),
        ...fixture,
      }),
    }).toEqual({ result: true, runtime: true, turn: true, evidence: true });

    const committed = await subject.commitAttemptEvidence({
      reservationId: reservation.reservation.reservationId,
      expectedRevision: reservation.state.revision,
      actual: demand(),
      settledAt: SETTLED_AT,
      ...fixture,
    });

    expect(committed.attempt).toEqual(fixture.attempt);
    expect(committed.budgetLedger).toEqual(expectedSettlement.state);
    expect(putAttemptCommit).toHaveBeenCalledTimes(1);

    const drifted = adapter({
      getBudget: vi.fn(async () => reservedBudgetResponse()),
      putAttemptCommit: vi.fn(async (_attemptId, body: unknown) => {
        const request = body as Record<string, unknown>;
        const { budgetSettlement: _budgetSettlement, ...evidence } = request;
        void _budgetSettlement;
        return Object.freeze({
          ...evidence,
          preDispatchFailureReceipts: Object.freeze([
            Object.freeze({ unexpected: true }),
          ]),
          budgetSettlement: Object.freeze({
            reservationId: reservation.reservation.reservationId,
            ledgerRevision: expectedSettlement.state.revision,
            settlementDigest:
              expectedSettlement.reservation.settlement!.settlementDigest,
            settlement: expectedSettlement.reservation.settlement,
            settledAt: SETTLED_AT,
          }),
          replayed: false,
        });
      }),
    });
    await expect(
      drifted.commitAttemptEvidence({
        reservationId: reservation.reservation.reservationId,
        expectedRevision: reservation.state.revision,
        actual: demand(),
        settledAt: SETTLED_AT,
        ...fixture,
      })
    ).rejects.toThrow('Evaluation durable shard ledger response is invalid.');
  }, 30_000);

  it('encodes checkpoint facts and fails closed on response extras', async () => {
    const checkpoint = vector.facts.checkpoint.value;
    const putCheckpoint = vi.fn(
      async (
        _shardId: string,
        _revision: number,
        _expected: number,
        fact: unknown
      ) => ({ fact, replayed: false })
    );
    const subject = adapter({ putCheckpoint });
    await expect(
      subject.putCheckpoint(checkpoint, checkpoint.revision - 1)
    ).resolves.toMatchObject({ ok: true, value: checkpoint });
    expect(putCheckpoint.mock.calls[0]?.[3]).toEqual(
      encodeAgentEvaluationFact({
        factType: 'evaluation-checkpoint',
        value: checkpoint,
      })
    );

    const unsafe = adapter({
      listAttempts: vi.fn(async () => ({ facts: [], extra: true })),
    });
    await expect(unsafe.listAttempts()).rejects.toThrow(
      'Evaluation durable shard ledger response is invalid.'
    );
  }, 30_000);

  it('treats an exact HTTP 404 as an absent initial checkpoint', async () => {
    await expect(
      adapter().getLatestCheckpoint(descriptor.shardId)
    ).resolves.toBe(undefined);
  });
});
