import {
  createAgentProposalPlanningReceipt,
  createAgentProposalPreview,
  createAgentWorkspaceMutationReceipt,
  digestAgentCanonicalValue,
  preflightAgentApproval,
  preflightAgentRollback,
  proposalIssue,
  sameAgentWorkspaceRevision,
  type AgentApprovalPreflightContext,
  type AgentPrincipalRef,
  type AgentProposalIssue,
  type AgentProposalPlanningReceipt,
  type AgentProposalPreview,
  type AgentRollbackPreflightContext,
  type AgentWorkspaceMutationReceipt,
} from '@prodivix/ai';
import type {
  VerificationImpactContribution,
  VerificationImpactSet,
  VerificationPlan,
  VerificationPlanResult,
} from '@prodivix/verification';
import {
  applyWorkspaceMutation,
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceAgentActionTransactionPlan,
  createWorkspaceTransactionOperation,
  createWorkspaceVerificationImpactSet,
  type CreateWorkspaceAgentActionTransactionPlanInput,
  type WorkspaceAgentActionTransactionPlan,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import { decodeWorkspaceOperationCommitResponse } from '../workspaceOperationCommitResponse';
import {
  createWorkspaceOutboxEntry,
  type WorkspaceOutboxEntry,
} from '../workspaceOutbox';
import {
  diffWorkspaceSnapshots,
  type WorkspaceChangeSet,
} from '../workspaceSemanticDiff';

export type AgentProposalVerificationPlanner = (
  impactSet: VerificationImpactSet
) => VerificationPlanResult;

export type WorkspaceAgentProposalProjection = Readonly<{
  actionPlan: WorkspaceAgentActionTransactionPlan;
  projectedTargetSnapshot: WorkspaceSnapshot;
  semanticDiff: WorkspaceChangeSet;
  impactSet: VerificationImpactSet;
  verificationPlan: VerificationPlan;
  planning: AgentProposalPlanningReceipt;
  preview: AgentProposalPreview;
}>;

export type CreateWorkspaceAgentProposalProjectionInput =
  CreateWorkspaceAgentActionTransactionPlanInput &
    Readonly<{
      previewId: string;
      plannedAt: string;
      expiresAt: string;
      frameworkTargets: readonly string[];
      runtimeZones: readonly string[];
      verificationImpactContributions?: readonly VerificationImpactContribution[];
      diagnosticRefs?: readonly string[];
      verificationPlanner: AgentProposalVerificationPlanner;
    }>;

export type WorkspaceAgentProposalProjectionResult =
  | Readonly<{
      status: 'ready';
      projection: WorkspaceAgentProposalProjection;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentProposalIssue[];
    }>;

export type PrepareWorkspaceAgentCommitInput = Readonly<{
  projection: WorkspaceAgentProposalProjection;
  approval: AgentApprovalPreflightContext;
  currentSnapshot: WorkspaceSnapshot;
  producer: AgentPrincipalRef;
  receiptId: string;
  startedAt: string;
  now: number;
}>;

export type PrepareWorkspaceAgentMutationResult =
  | Readonly<{
      status: 'ready';
      outboxEntry: WorkspaceOutboxEntry;
      receipt: AgentWorkspaceMutationReceipt;
    }>
  | Readonly<{
      status: 'rejected' | 'stale' | 'invalidated' | 'blocked';
      issues: readonly AgentProposalIssue[];
    }>;

export type WorkspaceAgentCommitReconciliationResult =
  | Readonly<{
      status: 'acknowledged';
      snapshot: WorkspaceSnapshot;
      receipt: AgentWorkspaceMutationReceipt;
    }>
  | Readonly<{
      status: 'reconciliation-required';
      receipt: AgentWorkspaceMutationReceipt;
      issues: readonly AgentProposalIssue[];
    }>;

export type WorkspaceAgentConflictResult = Readonly<{
  status: 'new-proposal-required';
  receipt: AgentWorkspaceMutationReceipt;
  issues: readonly AgentProposalIssue[];
}>;

const sameValue = (left: unknown, right: unknown): boolean =>
  digestAgentCanonicalValue(left) === digestAgentCanonicalValue(right);

const documentMetadata = (
  document: WorkspaceSnapshot['docsById'][string]
): unknown => ({
  type: document.type,
  ...(document.name === undefined ? {} : { name: document.name }),
  path: document.path,
  ...(document.capabilities === undefined
    ? {}
    : { capabilities: document.capabilities }),
});

/** Projects the exact revision increments produced by one Atomic Commit ACK. */
const projectCommittedSnapshot = (
  before: WorkspaceSnapshot,
  candidate: WorkspaceSnapshot
): WorkspaceSnapshot => {
  const docsById = Object.fromEntries(
    Object.entries(candidate.docsById).map(([documentId, document]) => {
      const previous = before.docsById[documentId];
      if (!previous) return [documentId, document] as const;
      return [
        documentId,
        {
          ...document,
          contentRev:
            previous.contentRev +
            (sameValue(previous.content, document.content) ? 0 : 1),
          metaRev:
            previous.metaRev +
            (sameValue(documentMetadata(previous), documentMetadata(document))
              ? 0
              : 1),
        },
      ] as const;
    })
  );
  const documentsAddedOrRemoved =
    Object.keys(before.docsById).length !==
      Object.keys(candidate.docsById).length ||
    Object.keys(before.docsById).some(
      (documentId) => !Object.hasOwn(candidate.docsById, documentId)
    );
  const metadataChanged = Object.entries(candidate.docsById).some(
    ([documentId, document]) => {
      const previous = before.docsById[documentId];
      return (
        previous !== undefined &&
        !sameValue(documentMetadata(previous), documentMetadata(document))
      );
    }
  );
  const routeChanged = !sameValue(
    before.routeManifest,
    candidate.routeManifest
  );
  const treeChanged = !sameValue(
    { treeRootId: before.treeRootId, treeById: before.treeById },
    { treeRootId: candidate.treeRootId, treeById: candidate.treeById }
  );
  return Object.freeze({
    ...candidate,
    workspaceRev:
      before.workspaceRev +
      (documentsAddedOrRemoved || metadataChanged || routeChanged || treeChanged
        ? 1
        : 0),
    routeRev: before.routeRev + (routeChanged ? 1 : 0),
    opSeq: before.opSeq + 1,
    docsById: Object.freeze(docsById),
  });
};

const blocked = (
  code: AgentProposalIssue['code'],
  path: string,
  message: string
): WorkspaceAgentProposalProjectionResult =>
  Object.freeze({
    status: 'blocked',
    issues: Object.freeze([proposalIssue(code, path, message)]),
  });

/**
 * Materializes a read-only proposal projection. The model-provided action
 * values cross domain decoders before any Workspace Command exists.
 */
export const createWorkspaceAgentProposalProjection = (
  input: CreateWorkspaceAgentProposalProjectionInput
): WorkspaceAgentProposalProjectionResult => {
  const actionPlanResult = createWorkspaceAgentActionTransactionPlan(input);
  if (actionPlanResult.status === 'blocked') return actionPlanResult;
  const actionPlan = actionPlanResult.plan;
  const projectedTargetSnapshot = projectCommittedSnapshot(
    actionPlan.baseSnapshot,
    actionPlan.candidateSnapshot
  );
  const semanticDiffResult = diffWorkspaceSnapshots(
    actionPlan.baseSnapshot,
    projectedTargetSnapshot
  );
  if (!semanticDiffResult.ok) {
    return blocked(
      'AI-5001',
      '/semanticDiff',
      'Proposal semantic diff could not bind one Workspace.'
    );
  }
  const impactResult = createWorkspaceVerificationImpactSet({
    before: actionPlan.baseSnapshot,
    after: projectedTargetSnapshot,
    operationIds: [actionPlan.transaction.id],
    frameworkTargets: input.frameworkTargets,
    runtimeZones: input.runtimeZones,
    ...(input.verificationImpactContributions
      ? {
          additionalContributions: input.verificationImpactContributions,
        }
      : {}),
  });
  if (impactResult.status === 'blocked') {
    return blocked(
      'AI-6001',
      '/impact',
      `Proposal Impact is blocked: ${impactResult.message}`
    );
  }
  const verificationResult = input.verificationPlanner(impactResult.impactSet);
  if (
    verificationResult.status !== 'ready' ||
    verificationResult.plan.status !== 'ready' ||
    verificationResult.plan.impactDigest !== impactResult.impactSet.impactDigest
  ) {
    return blocked(
      'AI-6001',
      '/verificationPlan',
      'Proposal VerificationPlan is blocked or does not bind exact Impact.'
    );
  }
  const semanticDiffDigest = digestAgentCanonicalValue(
    semanticDiffResult.changeSet
  );
  const planning = createAgentProposalPlanningReceipt({
    proposalId: input.proposal.proposalId,
    baseRevision: input.proposal.baseRevision,
    proposedSnapshotDigest: digestAgentCanonicalValue(
      actionPlan.candidateSnapshot
    ),
    transactionDigest: digestAgentCanonicalValue(actionPlan.transaction),
    reverseTransactionDigest: digestAgentCanonicalValue(
      actionPlan.reverseTransaction
    ),
    semanticDiffDigest,
    impactSetRef: `impact:${impactResult.impactSet.impactDigest}`,
    impactDigest: impactResult.impactSet.impactDigest,
    verificationPlanRef: `verification-plan:${verificationResult.plan.planDigest}`,
    verificationPlanDigest: verificationResult.plan.planDigest,
    sourceTraceDigest: digestAgentCanonicalValue(actionPlan.sourceTrace),
    requiredCapabilities: actionPlan.requiredCapabilities,
    risks: actionPlan.risks,
    diagnosticRefs: input.diagnosticRefs ?? [],
    plannedAt: input.plannedAt,
    expiresAt: input.expiresAt,
  });
  const preview = createAgentProposalPreview({
    previewId: input.previewId,
    proposal: input.proposal,
    planning,
  });
  return Object.freeze({
    status: 'ready',
    projection: Object.freeze({
      actionPlan,
      projectedTargetSnapshot,
      semanticDiff: semanticDiffResult.changeSet,
      impactSet: impactResult.impactSet,
      verificationPlan: verificationResult.plan,
      planning,
      preview,
    }),
  });
};

const projectionIntegrityIssues = (
  projection: WorkspaceAgentProposalProjection
): readonly AgentProposalIssue[] => {
  const { actionPlan, planning, preview } = projection;
  const checks: readonly Readonly<{
    actual: string;
    expected: string;
    path: string;
  }>[] = Object.freeze([
    {
      actual: digestAgentCanonicalValue(actionPlan.candidateSnapshot),
      expected: planning.proposedSnapshotDigest,
      path: '/candidateSnapshot',
    },
    {
      actual: digestAgentCanonicalValue(actionPlan.transaction),
      expected: planning.transactionDigest,
      path: '/transaction',
    },
    {
      actual: digestAgentCanonicalValue(actionPlan.reverseTransaction),
      expected: planning.reverseTransactionDigest,
      path: '/reverseTransaction',
    },
    {
      actual: digestAgentCanonicalValue(projection.semanticDiff),
      expected: planning.semanticDiffDigest,
      path: '/semanticDiff',
    },
    {
      actual: projection.impactSet.impactDigest,
      expected: planning.impactDigest,
      path: '/impact',
    },
    {
      actual: projection.verificationPlan.planDigest,
      expected: planning.verificationPlanDigest,
      path: '/verificationPlan',
    },
    {
      actual: digestAgentCanonicalValue(actionPlan.sourceTrace),
      expected: planning.sourceTraceDigest,
      path: '/sourceTrace',
    },
  ]);
  const issues = checks
    .filter(({ actual, expected }) => actual !== expected)
    .map(({ path }) =>
      proposalIssue(
        'AI-7006',
        path,
        'Proposal projection drifted after preview creation.'
      )
    );
  if (
    preview.transactionDigest !== planning.transactionDigest ||
    preview.previewId.length === 0
  ) {
    issues.push(
      proposalIssue(
        'AI-7006',
        '/preview',
        'Proposal preview no longer binds the exact planning receipt.'
      )
    );
  }
  return Object.freeze(issues);
};

/** Revalidates exact approval and creates the sole Durable Outbox write. */
export const prepareWorkspaceAgentCommit = (
  input: PrepareWorkspaceAgentCommitInput
): PrepareWorkspaceAgentMutationResult => {
  const currentRevision = createAgentWorkspaceRevisionFromSnapshot(
    input.currentSnapshot
  );
  const approval = preflightAgentApproval({
    ...input.approval,
    currentRevision,
  });
  if (approval.status !== 'ready') return approval;
  const integrityIssues = projectionIntegrityIssues(input.projection);
  if (integrityIssues.length > 0) {
    return Object.freeze({
      status: 'invalidated',
      issues: integrityIssues,
    });
  }
  if (
    input.currentSnapshot.id !== input.projection.actionPlan.baseSnapshot.id ||
    !sameAgentWorkspaceRevision(
      currentRevision,
      input.projection.planning.baseRevision
    )
  ) {
    return Object.freeze({
      status: 'stale',
      issues: Object.freeze([
        proposalIssue(
          'AI-7005',
          '/currentRevision',
          'Workspace revision drift requires a new proposal and approval.'
        ),
      ]),
    });
  }
  const operation = createWorkspaceTransactionOperation(
    input.projection.actionPlan.transaction
  );
  const outbox = createWorkspaceOutboxEntry({
    baseSnapshot: input.currentSnapshot,
    operation,
    now: input.now,
  });
  if (!outbox.ok) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(
        outbox.issues.map((issue) =>
          proposalIssue('AI-5001', issue.path, issue.message)
        )
      ),
    });
  }
  const { proposal, decision } = input.approval;
  const receipt = createAgentWorkspaceMutationReceipt({
    receiptId: input.receiptId,
    kind: 'commit',
    state: 'started',
    taskId: proposal.taskId,
    runId: proposal.runId,
    proposalId: proposal.proposalId,
    previewId: input.projection.preview.previewId,
    decisionId: decision.decisionId,
    operationId: outbox.entry.id,
    baseRevision: currentRevision,
    transactionDigest: input.projection.planning.transactionDigest,
    reverseTransactionDigest:
      input.projection.planning.reverseTransactionDigest,
    requestDigest: digestAgentCanonicalValue(outbox.entry.request),
    producer: input.producer,
    startedAt: input.startedAt,
  });
  return Object.freeze({
    status: 'ready',
    outboxEntry: outbox.entry,
    receipt,
  });
};

const replacementReceipt = (
  receipt: AgentWorkspaceMutationReceipt,
  changes: Partial<
    Omit<AgentWorkspaceMutationReceipt, 'receiptDigest' | 'receiptId'>
  > & { receiptId: string }
): AgentWorkspaceMutationReceipt =>
  createAgentWorkspaceMutationReceipt({
    receiptId: changes.receiptId,
    kind: changes.kind ?? receipt.kind,
    state: changes.state ?? receipt.state,
    taskId: changes.taskId ?? receipt.taskId,
    runId: changes.runId ?? receipt.runId,
    proposalId: changes.proposalId ?? receipt.proposalId,
    previewId: changes.previewId ?? receipt.previewId,
    decisionId: changes.decisionId ?? receipt.decisionId,
    operationId: changes.operationId ?? receipt.operationId,
    baseRevision: changes.baseRevision ?? receipt.baseRevision,
    transactionDigest: changes.transactionDigest ?? receipt.transactionDigest,
    reverseTransactionDigest:
      changes.reverseTransactionDigest ?? receipt.reverseTransactionDigest,
    requestDigest: changes.requestDigest ?? receipt.requestDigest,
    producer: changes.producer ?? receipt.producer,
    startedAt: changes.startedAt ?? receipt.startedAt,
    ...(changes.completedAt ? { completedAt: changes.completedAt } : {}),
    ...(changes.targetRevision
      ? { targetRevision: changes.targetRevision }
      : {}),
    ...(changes.mutationDigest
      ? { mutationDigest: changes.mutationDigest }
      : {}),
    ...(changes.conflictDigest
      ? { conflictDigest: changes.conflictDigest }
      : {}),
  });

/** Strict ACK reconciliation; malformed success is never treated as commit. */
export const reconcileWorkspaceAgentCommit = (input: {
  outboxEntry: WorkspaceOutboxEntry;
  startedReceipt: AgentWorkspaceMutationReceipt;
  response: unknown;
  receiptId: string;
  completedAt: string;
}): WorkspaceAgentCommitReconciliationResult => {
  try {
    if (
      input.startedReceipt.state !== 'started' ||
      input.startedReceipt.operationId !== input.outboxEntry.id ||
      input.startedReceipt.requestDigest !==
        digestAgentCanonicalValue(input.outboxEntry.request)
    ) {
      throw new TypeError(
        'Commit receipt does not bind the exact outbox request.'
      );
    }
    const mutation = decodeWorkspaceOperationCommitResponse(
      input.response,
      input.outboxEntry.baseSnapshot,
      input.outboxEntry.operation
    );
    const snapshot = applyWorkspaceMutation(
      input.outboxEntry.baseSnapshot,
      mutation
    );
    return Object.freeze({
      status: 'acknowledged',
      snapshot,
      receipt: replacementReceipt(input.startedReceipt, {
        receiptId: input.receiptId,
        state: 'acknowledged',
        completedAt: input.completedAt,
        targetRevision: createAgentWorkspaceRevisionFromSnapshot(snapshot),
        mutationDigest: digestAgentCanonicalValue(mutation),
      }),
    });
  } catch (error) {
    return Object.freeze({
      status: 'reconciliation-required',
      receipt: replacementReceipt(input.startedReceipt, {
        receiptId: input.receiptId,
        state: 'reconciliation-required',
        completedAt: input.completedAt,
      }),
      issues: Object.freeze([
        proposalIssue(
          'AI-9001',
          '/commitResponse',
          error instanceof Error
            ? error.message
            : 'Commit ACK reconciliation failed.'
        ),
      ]),
    });
  }
};

/** A 409 expires the approval path; callers must create a fresh proposal. */
export const rejectWorkspaceAgentCommitConflict = (input: {
  startedReceipt: AgentWorkspaceMutationReceipt;
  conflict: unknown;
  receiptId: string;
  completedAt: string;
}): WorkspaceAgentConflictResult =>
  Object.freeze({
    status: 'new-proposal-required',
    receipt: replacementReceipt(input.startedReceipt, {
      receiptId: input.receiptId,
      state: 'conflicted',
      completedAt: input.completedAt,
      conflictDigest: digestAgentCanonicalValue(input.conflict),
    }),
    issues: Object.freeze([
      proposalIssue(
        'AI-7005',
        '/commitResponse',
        'Atomic Commit returned a revision conflict; automatic rebase is forbidden for approved proposals.'
      ),
    ]),
  });

/** Uses only the previewed reverse Transaction after explicit rollback preflight. */
export const prepareWorkspaceAgentRollback = (input: {
  projection: WorkspaceAgentProposalProjection;
  approval: AgentApprovalPreflightContext;
  commitReceipt: AgentWorkspaceMutationReceipt;
  currentSnapshot: WorkspaceSnapshot;
  rollbackPreflight: Omit<
    AgentRollbackPreflightContext,
    'commit' | 'approval' | 'currentRevision' | 'reverseTransactionDigest'
  >;
  producer: AgentPrincipalRef;
  receiptId: string;
  startedAt: string;
  now: number;
}): PrepareWorkspaceAgentMutationResult => {
  const currentRevision = createAgentWorkspaceRevisionFromSnapshot(
    input.currentSnapshot
  );
  const preflight = preflightAgentRollback({
    ...input.rollbackPreflight,
    commit: input.commitReceipt,
    approval: input.approval,
    currentRevision,
    reverseTransactionDigest:
      input.projection.planning.reverseTransactionDigest,
  });
  if (preflight.status === 'blocked') {
    return Object.freeze({ status: 'blocked', issues: preflight.issues });
  }
  const reverseTransaction: WorkspaceTransactionEnvelope =
    input.projection.actionPlan.reverseTransaction;
  if (
    digestAgentCanonicalValue(reverseTransaction) !==
    input.projection.planning.reverseTransactionDigest
  ) {
    return Object.freeze({
      status: 'invalidated',
      issues: Object.freeze([
        proposalIssue(
          'AI-8004',
          '/reverseTransaction',
          'Previewed reverse Transaction drifted.'
        ),
      ]),
    });
  }
  const outbox = createWorkspaceOutboxEntry({
    baseSnapshot: input.currentSnapshot,
    operation: createWorkspaceTransactionOperation(reverseTransaction),
    now: input.now,
  });
  if (!outbox.ok) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(
        outbox.issues.map((issue) =>
          proposalIssue('AI-8004', issue.path, issue.message)
        )
      ),
    });
  }
  const { proposal, decision } = input.approval;
  return Object.freeze({
    status: 'ready',
    outboxEntry: outbox.entry,
    receipt: createAgentWorkspaceMutationReceipt({
      receiptId: input.receiptId,
      kind: 'rollback',
      state: 'started',
      taskId: proposal.taskId,
      runId: proposal.runId,
      proposalId: proposal.proposalId,
      previewId: input.projection.preview.previewId,
      decisionId: decision.decisionId,
      operationId: outbox.entry.id,
      baseRevision: currentRevision,
      transactionDigest: input.projection.planning.transactionDigest,
      reverseTransactionDigest:
        input.projection.planning.reverseTransactionDigest,
      requestDigest: digestAgentCanonicalValue(outbox.entry.request),
      producer: input.producer,
      startedAt: input.startedAt,
    }),
  });
};
