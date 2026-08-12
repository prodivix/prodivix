import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';
import { createAgentEvaluationBlindReviewPreviewProjection } from './agentEvaluationBlindReviewProjection';

const digest = (value: string) => digestAgentCanonicalValue({ value });

const runtimeReceipt = (): AgentEvaluationControlledRuntimeReceipt => {
  const base = {
    format: 'prodivix.agent-evaluation-controlled-runtime-receipt' as const,
    version: 1 as const,
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    attemptId: 'attempt.g4-subjective-visual.1',
    descriptorDigest: digest('descriptor'),
    caseId: 'g4-v8.subjective-visual.1',
    caseDigest: digest('case'),
    materialDigest: digest('material'),
    submissionReceiptDigest: digest('submission-receipt'),
    runtimeAuthorityId: 'authority.controlled-runtime',
    runtimeImplementationDigest: digest('runtime'),
    artifactResolutionPolicyDigest: digest('artifact-policy'),
    proposalValidationPolicyDigest: digest('proposal-policy'),
    isolationPolicyDigest: digest('isolated-execution'),
    g3VerificationPolicyDigest: digest('g3-policy'),
    controlledRenderPolicyDigest: digest('render-policy'),
    loopPolicyDigest: digest('loop-policy'),
    maximumTurnsPerAttempt: 4,
    maximumToolCallsPerAttempt: 2,
    maximumRepairRoundsPerAttempt: 1,
    maximumAggregateArtifactBytes: 8 * 1_024 * 1_024,
    grantDigest: digest('grant'),
    grantGeneration: 1,
    verificationAttemptGrantReceiptDigests: [],
    toolRegistryDigest: digest('tool-registry'),
    actionRegistryDigest: digest('action-registry'),
    operationSealReceiptDigests: [digest('operation-seal')],
    ownerAuthorityReceiptDigests: [digest('owner-authority')],
    baseSnapshotDigest: digest('base-snapshot'),
    finalSnapshotDigest: digest('final-snapshot'),
    cleanupReceiptDigest: digest('cleanup'),
    sourceReferencesRevoked: true as const,
    sandboxDestroyed: true as const,
    toolExecutionReceiptSetDigest: digest('tool-receipts'),
    operationIntentSetDigest: digest('operation-intents'),
    operationSealSetDigest: digest('operation-seals'),
    ownerAuthoritySetDigest: digest('owner-authorities'),
    artifactResolution: {
      resolvedArtifactCount: 2,
      resolvedArtifactBytes: 8192,
      artifactResolutionReceiptSetDigest: digest('artifact-resolution'),
    },
    proposalValidation: {
      verdict: 'passed' as const,
      typedProposalValidationReceiptDigest: digest('proposal-validation'),
    },
    isolatedExecution: {
      isolationPolicyDigest: digest('isolated-execution'),
      toolCallCount: 1,
      toolReceiptSetDigest: digest('tool-receipts'),
      repairRoundCount: 0,
      commandCount: 1,
      commandReceiptSetDigest: digest('command-receipts'),
      transactionCount: 1,
      transactionReceiptSetDigest: digest('transaction-receipts'),
    },
    g3Verification: {
      verificationPlanReceiptDigest: digest('g3-plan'),
      verificationClosureDigest: digest('g3-closure'),
      verdict: 'passed' as const,
    },
    controlledPreview: {
      artifactRef: 'blind-preview://0001',
      artifactDigest: digest('preview-raster'),
      mediaType: 'image/png' as const,
      width: 1280,
      height: 720,
      byteLength: 4096,
      renderPolicyDigest: digest('render-policy'),
    },
  };
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const input = () => ({
  runtimeReceipt: runtimeReceipt(),
  blindPresentationPolicyDigest: digest('blind-presentation'),
});

describe('Agent evaluation blind-review preview projection', () => {
  it('separates preview-only review material from execution authority', () => {
    const projection =
      createAgentEvaluationBlindReviewPreviewProjection(input());
    expect(projection.preview).toMatchObject({
      mediaType: 'image/png',
      width: 1280,
      height: 720,
    });
    expect(projection).not.toHaveProperty('candidate');
    expect(projection.authorityBinding.previewArtifactDigest).toBe(
      projection.preview.artifactDigest
    );
    expect(projection.projectionDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(JSON.stringify(projection.preview)).not.toMatch(
      /targetRefs|sourceRefs|actionIds|contextRefs|rawSubmission|rawResponse/iu
    );
  });

  it('requires a passed G3 closure and a controlled raster preview', () => {
    const failed = runtimeReceipt();
    const failedBase = {
      ...failed,
      g3Verification: { ...failed.g3Verification, verdict: 'failed' as const },
    };
    const { receiptDigest: _, ...failedWithoutDigest } = failedBase;
    expect(() =>
      createAgentEvaluationBlindReviewPreviewProjection({
        ...input(),
        runtimeReceipt: {
          ...failedWithoutDigest,
          receiptDigest: digestAgentCanonicalValue(failedWithoutDigest),
        },
      })
    ).toThrow(/authority is invalid/u);

    const withoutPreview = runtimeReceipt();
    const {
      controlledPreview: __,
      receiptDigest: ___,
      ...previewlessBase
    } = withoutPreview;
    expect(() =>
      createAgentEvaluationBlindReviewPreviewProjection({
        ...input(),
        runtimeReceipt: {
          ...previewlessBase,
          receiptDigest: digestAgentCanonicalValue(previewlessBase),
        },
      } as ReturnType<typeof input>)
    ).toThrow(/authority is invalid/u);
  });

  it('rejects raw result or authority fields at the exact projection boundary', () => {
    expect(() =>
      createAgentEvaluationBlindReviewPreviewProjection({
        ...input(),
        targetRefs: ['target://protected-canary'],
      } as ReturnType<typeof input>)
    ).toThrow(/projection is invalid/u);
  });
});
