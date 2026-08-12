import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { inspectAgentControlJson } from '../control/agentControlValidation';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentEvaluationControlledPreviewRaster,
  AgentEvaluationControlledRuntimeReceipt,
} from './agentEvaluationControlledRuntime';

const projectionFormat =
  'prodivix.agent-evaluation-blind-review-preview-projection' as const;
const maximumProjectionBytes = 2_097_152;

export type AgentEvaluationBlindReviewAuthorityBinding = Readonly<{
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  resultSubmissionReceiptDigest: CanonicalDigest;
  controlledRuntimeReceiptDigest: CanonicalDigest;
  commandReceiptSetDigest: CanonicalDigest;
  transactionReceiptSetDigest: CanonicalDigest;
  verificationClosureDigest: CanonicalDigest;
  isolationPolicyDigest: CanonicalDigest;
  blindPresentationPolicyDigest: CanonicalDigest;
  previewArtifactDigest: CanonicalDigest;
  authorityBindingDigest: CanonicalDigest;
}>;

/** Narrow authority projection consumed by the durable AgentEvaluationReviewCandidate owner. */
export type AgentEvaluationBlindReviewPreviewProjection = Readonly<{
  format: typeof projectionFormat;
  version: 1;
  preview: AgentEvaluationControlledPreviewRaster;
  authorityBinding: AgentEvaluationBlindReviewAuthorityBinding;
  projectionDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationBlindReviewPreviewProjectionInput = Readonly<{
  runtimeReceipt: AgentEvaluationControlledRuntimeReceipt;
  blindPresentationPolicyDigest: CanonicalDigest;
}>;

/** Admits only a verified controlled raster; candidate identity stays with the durable review-candidate owner. */
export const createAgentEvaluationBlindReviewPreviewProjection = (
  input: CreateAgentEvaluationBlindReviewPreviewProjectionInput
): AgentEvaluationBlindReviewPreviewProjection => {
  if (
    !isPlainObject(input) ||
    Object.getOwnPropertySymbols(input).length > 0 ||
    Object.keys(input).some(isUnsafeObjectKey) ||
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, 'runtimeReceipt') ||
    !Object.hasOwn(input, 'blindPresentationPolicyDigest') ||
    inspectAgentControlJson(input, maximumProjectionBytes).length > 0 ||
    !isAgentCanonicalDigest(input.blindPresentationPolicyDigest)
  ) {
    throw new TypeError(
      'Evaluation blind-review preview projection is invalid.'
    );
  }
  const runtime = input.runtimeReceipt;
  const { receiptDigest, ...runtimeBase } = runtime;
  const preview = runtime.controlledPreview;
  if (
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(runtimeBase) ||
    runtime.proposalValidation.verdict !== 'passed' ||
    runtime.g3Verification.verdict !== 'passed' ||
    !isAgentCanonicalDigest(
      runtime.isolatedExecution.transactionReceiptSetDigest
    ) ||
    preview === undefined ||
    !['image/png', 'image/webp'].includes(preview.mediaType)
  ) {
    throw new TypeError(
      'Evaluation blind-review preview authority is invalid.'
    );
  }
  const authorityBase = Object.freeze({
    attemptId: runtime.attemptId,
    descriptorDigest: runtime.descriptorDigest,
    resultSubmissionReceiptDigest: runtime.submissionReceiptDigest,
    controlledRuntimeReceiptDigest: runtime.receiptDigest,
    commandReceiptSetDigest: runtime.isolatedExecution.commandReceiptSetDigest,
    transactionReceiptSetDigest:
      runtime.isolatedExecution.transactionReceiptSetDigest,
    verificationClosureDigest: runtime.g3Verification.verificationClosureDigest,
    isolationPolicyDigest: runtime.isolatedExecution.isolationPolicyDigest,
    blindPresentationPolicyDigest: input.blindPresentationPolicyDigest,
    previewArtifactDigest: preview.artifactDigest,
  });
  const authorityBinding = Object.freeze({
    ...authorityBase,
    authorityBindingDigest: digestAgentCanonicalValue(authorityBase),
  });
  const base = Object.freeze({
    format: projectionFormat,
    version: 1 as const,
    preview,
    authorityBinding,
  });
  return Object.freeze({
    ...base,
    projectionDigest: digestAgentCanonicalValue(base),
  });
};
