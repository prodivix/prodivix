import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentEvaluationControlledContinuationOutput,
  createAgentEvaluationControlledRuntimeReceipt,
  createAgentEvaluationControlledToolExecutionOutput,
  validateAgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationControlledRuntimeInput,
  type AgentEvaluationControlledRuntimeResult,
} from './agentEvaluationControlledRuntime';
import { getG4V8PublicEvaluationCaseMaterials } from './agentEvaluationPublicCorpusMaterial';
import {
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationResultSubmissionReceipt,
  decodeAgentEvaluationResultSubmission,
} from './agentEvaluationResultContract';

const material = getG4V8PublicEvaluationCaseMaterials()[0]!;
const resultContract = createAgentEvaluationCaseResultContract(material);
const valueDigest = (value: string) => digestAgentCanonicalValue({ value });
const planDigest = valueDigest('claimed-plan');
const closureDigest = valueDigest('claimed-closure');
const resultArguments = {
  resultSchemaVersion: 1,
  resultSchemaDigest: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  caseId: material.caseId,
  caseDigest: material.caseDigest,
  materialDigest: material.materialDigest,
  caseDefinitionDigest: material.caseDefinitionDigest,
  expectedAuthorityDigest: material.expectedAuthorityDigest,
  gradingPolicyDigest: material.gradingPolicyDigest,
  graderMaterialDigest: material.grader.graderMaterialDigest,
  targetRefs: [...material.expectedAuthority.exactTargetRefs],
  actionIds: [...material.expectedAuthority.allowedActionIds],
  contextSourceRefs: [...material.expectedAuthority.requiredContextSourceRefs],
  diagnosticCodes: [...material.expectedAuthority.expectedDiagnosticCodes],
  plan: {
    kind: 'typed-plan',
    planRef: 'claim://verification-plan',
    planDigest,
    repairRoundCount: 0,
  },
  closure: {
    kind: 'g3-closure',
    closureRef: 'claim://verification-closure',
    closureDigest,
    verdict: 'passed',
  },
  artifactRefs: [
    {
      artifactKind: 'verification-closure',
      artifactRef: 'claim://verification-closure',
      artifactDigest: closureDigest,
      byteLength: 128,
    },
    {
      artifactKind: 'verification-plan',
      artifactRef: 'claim://verification-plan',
      artifactDigest: planDigest,
      byteLength: 128,
    },
  ],
};
const submission = decodeAgentEvaluationResultSubmission(
  resultArguments,
  resultContract
);
const descriptorDigest = valueDigest('descriptor');
const submissionReceipt = createAgentEvaluationResultSubmissionReceipt(
  {
    attemptId: 'attempt.controlled-runtime.1',
    invocationId: 'invocation.controlled-runtime.1',
    descriptorDigest,
    providerToolCallId: 'provider-call.controlled-runtime.1',
    toolArgumentsDigest: submission.argumentsDigest,
    toolEventSequence: 2,
    toolEventDigest: valueDigest('tool-event'),
    terminalEventSequence: 3,
    terminalEventDigest: valueDigest('terminal-event'),
  },
  submission,
  resultContract
);
const loopPolicyDigest = valueDigest('loop-policy');
const commandReceiptDigest = valueDigest('command-receipt');
const transactionReceiptDigest = valueDigest('transaction-receipt');
const grantDigest = valueDigest('grant');
const toolRegistryDigest = valueDigest('tool-registry');
const toolDefinitionDigest = valueDigest('tool-definition');
const inputSchemaDigest = valueDigest('input-schema');
const operationIntentDigest = valueDigest('operation-intent');
const operationSealReceiptDigest = valueDigest('operation-seal');
const ownerAuthorityReceiptDigest = valueDigest('owner-authority');
const verificationAttemptGrantReceiptDigest = valueDigest(
  'verification-attempt-grant-receipt'
);
const producedCapabilityExecutionReceiptSetDigest = valueDigest(
  'produced-capability-execution-receipt-set'
);
const baseSnapshotDigest = valueDigest('base-snapshot');
const finalSnapshotDigest = valueDigest('final-snapshot');
const cleanupReceiptDigest = valueDigest('cleanup');
const toolArguments = { operation: 'execute-proposal' } as const;
const toolExecution = createAgentEvaluationControlledToolExecutionOutput(
  {
    planDigest: valueDigest('release-plan'),
    attemptId: submissionReceipt.attemptId,
    descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    loopPolicyDigest,
    turnIndex: 0,
    toolCallId: 'tool-call.controlled-runtime.1',
    toolId: 'workspace.transaction.execute',
    arguments: toolArguments,
    argumentsDigest: digestAgentCanonicalValue(toolArguments),
    maximumToolResultBytes: 65_536,
  },
  {
    grantDigest,
    toolRegistryDigest,
    toolDefinitionDigest,
    inputSchemaDigest,
    generation: 1,
    idempotencyKey: 'idempotency.controlled-runtime.1',
    operationIntentDigest,
    status: 'succeeded',
    result: { status: 'executed' },
    persistedArtifacts: submission.artifactRefs.map((artifact) => ({
      ...artifact,
      persistenceReceiptDigest: valueDigest(
        `persisted:${artifact.artifactKind}`
      ),
    })),
    commandReceiptDigests: [commandReceiptDigest],
    transactionReceiptDigests: [transactionReceiptDigest],
  }
);
const continuation = createAgentEvaluationControlledContinuationOutput({
  planDigest: valueDigest('release-plan'),
  attemptId: submissionReceipt.attemptId,
  descriptorDigest,
  caseId: material.caseId,
  materialDigest: material.materialDigest,
  loopPolicyDigest,
  completedTurnIndex: 0,
  maximumAggregateToolResultBytes: 262_144,
  executions: [toolExecution],
});

const runtimeInput = (): AgentEvaluationControlledRuntimeInput => ({
  planDigest: valueDigest('release-plan'),
  repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  attemptId: submissionReceipt.attemptId,
  descriptorDigest,
  caseId: material.caseId,
  caseDigest: material.caseDigest,
  materialDigest: material.materialDigest,
  submission,
  submissionReceipt,
  toolExecutionReceipts: [toolExecution.receipt],
  continuationReceipts: [continuation.receipt],
  requiresControlledPreview: true,
  runtimeAuthorityId: 'authority.evaluation-controlled-runtime',
  runtimeImplementationDigest: valueDigest('runtime-implementation'),
  artifactResolutionPolicyDigest: valueDigest('artifact-policy'),
  proposalValidationPolicyDigest: valueDigest('proposal-policy'),
  isolationPolicyDigest: valueDigest('isolation-policy'),
  g3VerificationPolicyDigest: valueDigest('g3-policy'),
  controlledRenderPolicyDigest: valueDigest('render-policy'),
  loopPolicyDigest,
  maximumTurnsPerAttempt: 4,
  maximumToolCallsPerAttempt: 2,
  maximumRepairRoundsPerAttempt: 1,
  maximumAggregateArtifactBytes: 8 * 1_024 * 1_024,
});

const runtimeResult = (): AgentEvaluationControlledRuntimeResult => ({
  grantDigest,
  grantGeneration: 1,
  toolRegistryDigest,
  actionRegistryDigest: valueDigest('action-registry'),
  operationSealReceiptDigests: [operationSealReceiptDigest],
  ownerAuthorityReceiptDigests: [
    ownerAuthorityReceiptDigest,
    verificationAttemptGrantReceiptDigest,
  ],
  verificationAttemptGrantReceiptDigests: [
    verificationAttemptGrantReceiptDigest,
  ],
  producedCapabilityExecutionReceiptSetDigest,
  baseSnapshotDigest,
  finalSnapshotDigest,
  cleanupReceiptDigest,
  sourceReferencesRevoked: true,
  sandboxDestroyed: true,
  artifactResolution: {
    resolvedArtifactCount: submission.artifactRefs.length,
    resolvedArtifactBytes: 256,
    artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
      artifactPersistenceReceiptDigests:
        toolExecution.receipt.persistedArtifacts.map(
          ({ persistenceReceiptDigest }) => persistenceReceiptDigest
        ),
    }),
  },
  proposalValidation: {
    verdict: 'passed',
    typedProposalValidationReceiptDigest: valueDigest('proposal-validation'),
  },
  isolatedExecution: {
    isolationPolicyDigest: runtimeInput().isolationPolicyDigest,
    toolCallCount: 1,
    toolReceiptSetDigest: digestAgentCanonicalValue({
      toolReceiptDigests: [toolExecution.receipt.receiptDigest],
    }),
    repairRoundCount: 0,
    commandCount: 1,
    commandReceiptSetDigest: digestAgentCanonicalValue({
      commandReceiptDigests: [commandReceiptDigest],
    }),
    transactionCount: 1,
    transactionReceiptSetDigest: digestAgentCanonicalValue({
      transactionReceiptDigests: [transactionReceiptDigest],
    }),
  },
  g3Verification: {
    verificationPlanReceiptDigest: valueDigest('g3-plan'),
    verificationClosureDigest: valueDigest('g3-closure'),
    verdict: 'passed',
  },
  controlledPreview: {
    artifactRef: 'blind-preview://controlled-runtime-1',
    artifactDigest: valueDigest('preview'),
    mediaType: 'image/png',
    width: 1280,
    height: 720,
    byteLength: 4096,
    renderPolicyDigest: runtimeInput().controlledRenderPolicyDigest,
  },
});

describe('Agent evaluation controlled runtime contract', () => {
  it('binds resolved artifacts, typed proposal validation, isolated execution, G3 verification, and preview', () => {
    const input = runtimeInput();
    const receipt = createAgentEvaluationControlledRuntimeReceipt(
      input,
      runtimeResult()
    );
    expect(
      validateAgentEvaluationControlledRuntimeReceipt(input, receipt)
    ).toEqual(receipt);
    expect(receipt.g3Verification.verdict).toBe('passed');
    expect(receipt.verificationAttemptGrantReceiptSetDigest).toBe(
      digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests: [
          verificationAttemptGrantReceiptDigest,
        ],
      })
    );
    expect(receipt.producedCapabilityExecutionReceiptSetDigest).toBe(
      producedCapabilityExecutionReceiptSetDigest
    );
    expect(receipt.controlledPreview?.mediaType).toBe('image/png');
    expect(receipt.receiptDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(JSON.stringify(receipt)).not.toContain('targetRefs');
  });

  it('fails closed when required execution authority or preview evidence is incomplete', () => {
    const missingPreview = runtimeResult();
    delete (missingPreview as { controlledPreview?: unknown })
      .controlledPreview;
    expect(() =>
      createAgentEvaluationControlledRuntimeReceipt(
        runtimeInput(),
        missingPreview
      )
    ).toThrow(/result is invalid/u);

    expect(() =>
      createAgentEvaluationControlledRuntimeReceipt(runtimeInput(), {
        ...runtimeResult(),
        artifactResolution: {
          ...runtimeResult().artifactResolution,
          resolvedArtifactCount: 1,
        },
      })
    ).toThrow(/result is invalid/u);

    expect(() =>
      createAgentEvaluationControlledRuntimeReceipt(runtimeInput(), {
        ...runtimeResult(),
        proposalValidation: {
          ...runtimeResult().proposalValidation,
          verdict: 'failed',
        },
      })
    ).toThrow(/result is invalid/u);
  });

  it('creates bounded tool and continuation receipts and rejects digest drift', () => {
    expect(toolExecution.receipt).toMatchObject({
      planDigest: runtimeInput().planDigest,
      loopPolicyDigest,
      status: 'succeeded',
    });
    expect(continuation.toolResults).toEqual([
      expect.objectContaining({
        toolCallId: toolExecution.receipt.toolCallId,
        resultDigest: toolExecution.receipt.resultDigest,
      }),
    ]);
    expect(() =>
      createAgentEvaluationControlledToolExecutionOutput(
        {
          planDigest: runtimeInput().planDigest,
          attemptId: submissionReceipt.attemptId,
          descriptorDigest,
          caseId: material.caseId,
          materialDigest: material.materialDigest,
          loopPolicyDigest,
          turnIndex: 0,
          toolCallId: 'tool-call.controlled-runtime.drift',
          toolId: 'workspace.transaction.execute',
          arguments: toolArguments,
          argumentsDigest: valueDigest('wrong-arguments'),
          maximumToolResultBytes: 65_536,
        },
        {
          grantDigest,
          toolRegistryDigest,
          toolDefinitionDigest,
          inputSchemaDigest,
          generation: 1,
          idempotencyKey: 'idempotency.controlled-runtime.drift',
          operationIntentDigest: valueDigest('operation-intent-drift'),
          status: 'succeeded',
          result: { status: 'executed' },
          persistedArtifacts: [],
          commandReceiptDigests: [],
          transactionReceiptDigests: [],
        }
      )
    ).toThrow(/execution is invalid/u);
  });

  it('uses absent receipt-set digests for zero-count failed execution facts', () => {
    const failedInput: AgentEvaluationControlledRuntimeInput = {
      ...runtimeInput(),
      toolExecutionReceipts: [],
      continuationReceipts: [],
      requiresControlledPreview: false,
    };
    const failedResult: AgentEvaluationControlledRuntimeResult = {
      grantDigest,
      grantGeneration: 1,
      toolRegistryDigest,
      actionRegistryDigest: valueDigest('action-registry'),
      operationSealReceiptDigests: [],
      ownerAuthorityReceiptDigests: [ownerAuthorityReceiptDigest],
      verificationAttemptGrantReceiptDigests: [],
      baseSnapshotDigest,
      finalSnapshotDigest: baseSnapshotDigest,
      cleanupReceiptDigest,
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
      artifactResolution: {
        resolvedArtifactCount: 0,
        resolvedArtifactBytes: 0,
        artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
          artifactPersistenceReceiptDigests: [],
        }),
      },
      proposalValidation: {
        verdict: 'failed',
        typedProposalValidationReceiptDigest: valueDigest(
          'failed-proposal-validation'
        ),
      },
      isolatedExecution: {
        isolationPolicyDigest: failedInput.isolationPolicyDigest,
        toolCallCount: 0,
        repairRoundCount: 0,
        commandCount: 0,
        commandReceiptSetDigest: digestAgentCanonicalValue({
          commandReceiptDigests: [],
        }),
        transactionCount: 0,
      },
      g3Verification: {
        verificationPlanReceiptDigest: valueDigest('failed-g3-plan'),
        verificationClosureDigest: valueDigest('failed-g3-closure'),
        verdict: 'failed',
      },
    };
    const failedReceipt = createAgentEvaluationControlledRuntimeReceipt(
      failedInput,
      failedResult
    );
    expect(
      validateAgentEvaluationControlledRuntimeReceipt(
        failedInput,
        failedReceipt
      )
    ).toEqual(failedReceipt);
    expect(failedReceipt.isolatedExecution).not.toHaveProperty(
      'toolReceiptSetDigest'
    );
    expect(failedReceipt.isolatedExecution).not.toHaveProperty(
      'transactionReceiptSetDigest'
    );
    expect(() =>
      createAgentEvaluationControlledRuntimeReceipt(failedInput, {
        ...failedResult,
        isolatedExecution: {
          ...failedResult.isolatedExecution,
          toolReceiptSetDigest: valueDigest('forbidden-empty-set'),
        },
      })
    ).toThrow(/result is invalid/u);
  });
});
