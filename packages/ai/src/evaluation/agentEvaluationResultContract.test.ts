import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentEvaluationControlledContinuationOutput,
  createAgentEvaluationControlledRuntimeReceipt,
  createAgentEvaluationControlledToolExecutionOutput,
} from './agentEvaluationControlledRuntime';
import { getG4V8PublicEvaluationCaseMaterials } from './agentEvaluationPublicCorpusMaterial';
import {
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  assessAgentEvaluationResultAuthority,
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationResultSubmissionReceipt,
  decodeAgentEvaluationResultSubmission,
} from './agentEvaluationResultContract';

const material = getG4V8PublicEvaluationCaseMaterials()[0]!;
const contract = createAgentEvaluationCaseResultContract(material);
const planDigest = digestAgentCanonicalValue({ plan: material.caseId });
const closureDigest = digestAgentCanonicalValue({ closure: material.caseId });
const descriptorDigest = digestAgentCanonicalValue({
  descriptor: material.caseId,
});

const submissionInput = () => ({
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
    planRef: `verification-plan://${material.caseId}`,
    planDigest,
    repairRoundCount: 0,
  },
  closure: {
    kind: 'g3-closure',
    closureRef: `verification-closure://${material.caseId}`,
    closureDigest,
    verdict: 'passed',
  },
  artifactRefs: [
    {
      artifactKind: 'verification-plan',
      artifactRef: `verification-plan://${material.caseId}`,
      artifactDigest: planDigest,
      byteLength: 256,
    },
    {
      artifactKind: 'verification-closure',
      artifactRef: `verification-closure://${material.caseId}`,
      artifactDigest: closureDigest,
      byteLength: 128,
    },
  ],
});

const receiptFor = (
  submission: ReturnType<typeof decodeAgentEvaluationResultSubmission>
) =>
  createAgentEvaluationResultSubmissionReceipt(
    {
      attemptId: `attempt.${material.caseId}`,
      invocationId: `invocation.${material.caseId}`,
      descriptorDigest,
      providerToolCallId: `provider-call.${material.caseId}`,
      toolArgumentsDigest: submission.argumentsDigest,
      toolEventSequence: 3,
      toolEventDigest: digestAgentCanonicalValue({ event: 'tool-call' }),
      terminalEventSequence: 4,
      terminalEventDigest: digestAgentCanonicalValue({ event: 'completed' }),
    },
    submission,
    contract
  );

const runtimeReceiptFor = (
  submission: ReturnType<typeof decodeAgentEvaluationResultSubmission>,
  receipt: ReturnType<typeof receiptFor>
) => {
  const releasePlanDigest = digestAgentCanonicalValue({ plan: 'release' });
  const loopPolicyDigest = digestAgentCanonicalValue({
    loop: 'controlled-runtime',
  });
  const commandReceiptDigest = digestAgentCanonicalValue({
    command: submission.submissionDigest,
  });
  const transactionReceiptDigest = digestAgentCanonicalValue({
    transaction: submission.submissionDigest,
  });
  const grantDigest = digestAgentCanonicalValue({
    grant: submission.submissionDigest,
  });
  const verificationAttemptGrantReceiptDigest = digestAgentCanonicalValue({
    verificationAttemptGrant: submission.submissionDigest,
  });
  const toolRegistryDigest = digestAgentCanonicalValue({ registry: 'tools' });
  const operationSealReceiptDigest = digestAgentCanonicalValue({
    seal: submission.submissionDigest,
  });
  const toolArguments = { submissionDigest: submission.submissionDigest };
  const toolExecution = createAgentEvaluationControlledToolExecutionOutput(
    {
      planDigest: releasePlanDigest,
      attemptId: receipt.attemptId,
      descriptorDigest,
      caseId: material.caseId,
      materialDigest: material.materialDigest,
      loopPolicyDigest,
      turnIndex: 0,
      toolCallId: `controlled-tool.${material.caseId}`,
      toolId: 'workspace.transaction.execute',
      arguments: toolArguments,
      argumentsDigest: digestAgentCanonicalValue(toolArguments),
      maximumToolResultBytes: 65_536,
    },
    {
      grantDigest,
      toolRegistryDigest,
      toolDefinitionDigest: digestAgentCanonicalValue({ tool: 'transaction' }),
      inputSchemaDigest: digestAgentCanonicalValue({ schema: 'transaction' }),
      generation: 1,
      idempotencyKey: `idempotency.${material.caseId}`,
      operationIntentDigest: digestAgentCanonicalValue({
        intent: submission.submissionDigest,
      }),
      status: 'succeeded',
      result: { status: 'executed' },
      persistedArtifacts: submission.artifactRefs.map((artifact) => ({
        ...artifact,
        persistenceReceiptDigest: digestAgentCanonicalValue({
          artifact: artifact.artifactDigest,
        }),
      })),
      commandReceiptDigests: [commandReceiptDigest],
      transactionReceiptDigests: [transactionReceiptDigest],
    }
  );
  const continuation = createAgentEvaluationControlledContinuationOutput({
    planDigest: releasePlanDigest,
    attemptId: receipt.attemptId,
    descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    loopPolicyDigest,
    completedTurnIndex: 0,
    maximumAggregateToolResultBytes: 262_144,
    executions: [toolExecution],
  });
  return createAgentEvaluationControlledRuntimeReceipt(
    {
      planDigest: releasePlanDigest,
      repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
      attemptId: receipt.attemptId,
      descriptorDigest,
      caseId: material.caseId,
      caseDigest: material.caseDigest,
      materialDigest: material.materialDigest,
      submission,
      submissionReceipt: receipt,
      toolExecutionReceipts: [toolExecution.receipt],
      continuationReceipts: [continuation.receipt],
      requiresControlledPreview: false,
      runtimeAuthorityId: 'authority.controlled-runtime',
      runtimeImplementationDigest: digestAgentCanonicalValue({
        runtime: 'implementation',
      }),
      artifactResolutionPolicyDigest: digestAgentCanonicalValue({
        policy: 'artifact-resolution',
      }),
      proposalValidationPolicyDigest: digestAgentCanonicalValue({
        policy: 'proposal-validation',
      }),
      isolationPolicyDigest: digestAgentCanonicalValue({ isolation: true }),
      g3VerificationPolicyDigest: digestAgentCanonicalValue({
        policy: 'g3-verification',
      }),
      controlledRenderPolicyDigest: digestAgentCanonicalValue({
        policy: 'controlled-render',
      }),
      loopPolicyDigest,
      maximumTurnsPerAttempt: 4,
      maximumToolCallsPerAttempt: 2,
      maximumRepairRoundsPerAttempt: 1,
      maximumAggregateArtifactBytes: 8 * 1_024 * 1_024,
    },
    {
      grantDigest,
      grantGeneration: 1,
      verificationAttemptGrantReceiptDigests: [
        verificationAttemptGrantReceiptDigest,
      ],
      toolRegistryDigest,
      actionRegistryDigest: digestAgentCanonicalValue({ registry: 'actions' }),
      operationSealReceiptDigests: [operationSealReceiptDigest],
      ownerAuthorityReceiptDigests: [
        verificationAttemptGrantReceiptDigest,
        digestAgentCanonicalValue({ authority: submission.submissionDigest }),
      ],
      baseSnapshotDigest: digestAgentCanonicalValue({ snapshot: 'base' }),
      finalSnapshotDigest: digestAgentCanonicalValue({ snapshot: 'final' }),
      cleanupReceiptDigest: digestAgentCanonicalValue({ cleanup: true }),
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
      artifactResolution: {
        resolvedArtifactCount: submission.artifactRefs.length,
        resolvedArtifactBytes: submission.artifactRefs.reduce(
          (total, { byteLength }) => total + byteLength,
          0
        ),
        artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
          artifactPersistenceReceiptDigests:
            toolExecution.receipt.persistedArtifacts.map(
              ({ persistenceReceiptDigest }) => persistenceReceiptDigest
            ),
        }),
      },
      proposalValidation: {
        verdict: 'passed',
        typedProposalValidationReceiptDigest: digestAgentCanonicalValue({
          proposal: submission.submissionDigest,
        }),
      },
      isolatedExecution: {
        isolationPolicyDigest: digestAgentCanonicalValue({ isolation: true }),
        toolCallCount: 1,
        toolReceiptSetDigest: digestAgentCanonicalValue({
          toolReceiptDigests: [toolExecution.receipt.receiptDigest],
        }),
        repairRoundCount: submission.plan.repairRoundCount,
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
        verificationPlanReceiptDigest: digestAgentCanonicalValue({
          verificationPlan: submission.plan.planDigest,
        }),
        verificationClosureDigest: digestAgentCanonicalValue({
          verificationClosure: submission.closure.closureDigest,
        }),
        verdict: 'passed',
      },
    }
  );
};

describe('Agent evaluation typed result contract', () => {
  it('freezes one portable required-tool schema and case-bound authority', () => {
    expect(contract.tool.toolId).toBe(AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID);
    expect(contract.tool.nativeToolName).toBe(
      AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
    );
    expect(contract.tool.schemaDigest).toBe(
      AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST
    );
    expect(contract.tool.inputSchemaDigest).toBe(
      digestAgentCanonicalValue(contract.tool.inputSchema)
    );
    expect(contract.authority.exactTargetRefs).toEqual(
      material.expectedAuthority.exactTargetRefs
    );
    expect(contract.authority.graderCheckDigests).toEqual(
      material.grader.checks.map(({ checkDigest }) => checkDigest)
    );
    expect(contract.authority.authorityExpectationDigest).toMatch(
      /^sha256-[0-9a-f]{64}$/u
    );
    expect(contract.contractDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it('decodes only an exact case-bound typed submission and grades authority deterministically', () => {
    const submission = decodeAgentEvaluationResultSubmission(
      JSON.stringify(submissionInput()),
      contract
    );
    const receipt = receiptFor(submission);
    const runtimeReceipt = runtimeReceiptFor(submission, receipt);
    expect(submission.submissionDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(receipt.receiptDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(
      assessAgentEvaluationResultAuthority(
        submission,
        receipt,
        runtimeReceipt,
        contract
      )
    ).toMatchObject({
      exactTargets: true,
      allowedActionsOnly: true,
      forbiddenActionsAbsent: true,
      requiredSourcesPresent: true,
      expectedDiagnosticsPresent: true,
      typedPlanPresent: true,
      g3ClosurePresent: true,
      checks: material.grader.checks.map(({ checkId, kind, checkDigest }) =>
        expect.objectContaining({
          checkId,
          kind,
          checkDigest,
          passed: true,
        })
      ),
      passed: true,
    });
  });

  it('fails closed on extra fields, digest drift, duplicate refs, and missing typed artifact bindings', () => {
    expect(() =>
      createAgentEvaluationCaseResultContract({
        ...material,
        materialDigest: digestAgentCanonicalValue('drift'),
      })
    ).toThrow(/material binding drifted/u);

    expect(() =>
      decodeAgentEvaluationResultSubmission(
        { ...submissionInput(), commentary: 'guess from free text' },
        contract
      )
    ).toThrow(/exact shape/u);
    expect(() =>
      decodeAgentEvaluationResultSubmission(
        {
          ...submissionInput(),
          materialDigest: digestAgentCanonicalValue('drift'),
        },
        contract
      )
    ).toThrow(/binding drifted/u);
    expect(() =>
      decodeAgentEvaluationResultSubmission(
        {
          ...submissionInput(),
          targetRefs: [
            material.expectedAuthority.exactTargetRefs[0],
            material.expectedAuthority.exactTargetRefs[0],
          ],
        },
        contract
      )
    ).toThrow(/canonical unique/u);
    expect(() =>
      decodeAgentEvaluationResultSubmission(
        {
          ...submissionInput(),
          artifactRefs: submissionInput().artifactRefs.map((artifact) =>
            artifact.artifactKind === 'verification-plan'
              ? {
                  ...artifact,
                  artifactDigest: digestAgentCanonicalValue('wrong'),
                }
              : artifact
          ),
        },
        contract
      )
    ).toThrow(/artifact bindings/u);

    const submission = decodeAgentEvaluationResultSubmission(
      submissionInput(),
      contract
    );
    expect(() =>
      createAgentEvaluationResultSubmissionReceipt(
        {
          attemptId: `attempt.${material.caseId}`,
          invocationId: `invocation.${material.caseId}`,
          descriptorDigest,
          providerToolCallId: `provider-call.${material.caseId}`,
          toolArgumentsDigest: digestAgentCanonicalValue(submissionInput()),
          toolEventSequence: 4,
          toolEventDigest: digestAgentCanonicalValue({ event: 'tool-call' }),
          terminalEventSequence: 4,
          terminalEventDigest: digestAgentCanonicalValue({
            event: 'completed',
          }),
        },
        submission,
        contract
      )
    ).toThrow(/receipt is invalid/u);
    const validReceipt = receiptFor(submission);
    const runtimeReceipt = runtimeReceiptFor(submission, validReceipt);
    expect(() =>
      assessAgentEvaluationResultAuthority(
        submission,
        {
          ...validReceipt,
          toolDefinitionDigest: digestAgentCanonicalValue('drift'),
        },
        runtimeReceipt,
        contract
      )
    ).toThrow(/authority binding drifted/u);
  });

  it('keeps semantic mistakes gradeable instead of inferring corrections', () => {
    const forbiddenCheck = material.grader.checks.find(
      ({ kind }) => kind === 'forbidden-action'
    )!;
    const forbidden = forbiddenCheck.subjectRef;
    const submission = decodeAgentEvaluationResultSubmission(
      {
        ...submissionInput(),
        actionIds: [
          forbidden,
          material.expectedAuthority.forbiddenActionIds[0]!,
        ],
      },
      contract
    );
    const receipt = receiptFor(submission);
    const assessment = assessAgentEvaluationResultAuthority(
      submission,
      receipt,
      runtimeReceiptFor(submission, receipt),
      contract
    );
    expect(submission.actionIds).toContain(forbiddenCheck.subjectRef);
    expect(forbiddenCheck.expected).toBe(false);
    expect(assessment.allowedActionsOnly).toBe(false);
    expect(assessment.forbiddenActionsAbsent).toBe(false);
    expect(
      assessment.checks.find(({ kind }) => kind === 'forbidden-action')?.passed
    ).toBe(false);
    expect(assessment.passed).toBe(false);
  });
});
