import {
  createAgentProductSupplement,
  productJson,
  projectAgentProductReviewArtifacts,
  type AgentContextPack,
  type AgentJsonValue,
  type AgentProductDiagnostic,
  type AgentProductProposalReview,
  type AgentProductRuntimeSummary,
  type AgentProductSupplement,
  type AgentRunSnapshot,
  type AgentTaskRecord,
} from '@prodivix/ai';
import type { WorkspaceAgentProposalProjection } from './workspaceAgentProposalCoordinator';

export type CreateWorkspaceAgentProductSupplementInput = Readonly<{
  supplementId: string;
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  context?: AgentContextPack;
  proposalProjection?: WorkspaceAgentProposalProjection;
  rollbackAuthorization?: AgentProductProposalReview['rollback']['authorization'];
  runtime?: AgentProductRuntimeSummary;
  diagnostics?: readonly AgentProductDiagnostic[];
  producerId: string;
  projectedAt: string;
}>;

const asProductJson = (value: unknown): AgentJsonValue =>
  productJson(value as AgentJsonValue);

/**
 * Projects domain-owner artifacts for Web/CLI without inventing a second
 * semantic diff, Impact, VerificationPlan, or approval surface.
 */
export const createWorkspaceAgentProductSupplement = (
  input: CreateWorkspaceAgentProductSupplementInput
): AgentProductSupplement => {
  if (
    input.run.run.taskId !== input.task.spec.taskId ||
    input.run.taskDigest !== input.task.taskDigest
  ) {
    throw new TypeError('Workspace Agent product Task and Run drifted.');
  }
  const projection = input.proposalProjection;
  if (projection && input.rollbackAuthorization === undefined) {
    throw new TypeError(
      'Workspace Agent product proposal requires explicit rollback authorization.'
    );
  }
  const proposalReview = projection
    ? (() => {
        // Domain self-digests are stored beside their canonical preimages in
        // the product review. Excluding the self field preserves the exact
        // bytes each domain owner originally hashed.
        const { impactDigest: _impactDigest, ...impact } = projection.impactSet;
        const { planDigest: _planDigest, ...verificationPlan } =
          projection.verificationPlan;
        return projectAgentProductReviewArtifacts({
          proposalId: projection.preview.proposalId,
          previewId: projection.preview.previewId,
          semanticDiff: asProductJson(projection.semanticDiff),
          impact: asProductJson(impact),
          verificationPlan: asProductJson(verificationPlan),
          permissions: projection.planning.requiredCapabilities,
          risks: projection.planning.risks,
          reverseTransactionDigest:
            projection.planning.reverseTransactionDigest,
          rollbackAuthorization: input.rollbackAuthorization!,
        });
      })()
    : undefined;
  if (
    projection &&
    (proposalReview?.semanticDiffDigest !==
      projection.planning.semanticDiffDigest ||
      proposalReview.impactDigest !== projection.planning.impactDigest ||
      proposalReview.verificationPlanDigest !==
        projection.planning.verificationPlanDigest)
  ) {
    throw new TypeError(
      'Workspace Agent product review does not bind domain-owner artifacts.'
    );
  }
  return createAgentProductSupplement({
    supplementId: input.supplementId,
    taskId: input.task.spec.taskId,
    runId: input.run.run.runId,
    generation: input.run.run.generation,
    runSnapshotDigest: input.run.snapshotDigest,
    ...(input.context ? { context: input.context } : {}),
    ...(proposalReview ? { proposalReview } : {}),
    runtime:
      input.runtime ??
      Object.freeze({
        models: Object.freeze([]),
        tools: Object.freeze([]),
        usage: Object.freeze([]),
        costs: Object.freeze([]),
        budgetLedgerDigest: input.run.budgetLedger.ledgerDigest,
      }),
    diagnostics: input.diagnostics ?? Object.freeze([]),
    producer: Object.freeze({
      kind: 'service' as const,
      principalId: input.producerId,
    }),
    projectedAt: input.projectedAt,
  });
};
