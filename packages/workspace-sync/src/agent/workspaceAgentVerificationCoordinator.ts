import {
  compareAgentCanonicalText,
  createAgentCommittedVerificationPlanBinding,
  createAgentRepairRoundReceipt,
  createAgentVerificationClosureReceipt,
  digestAgentCanonicalValue,
  sameAgentWorkspaceRevision,
  type AgentApprovalPreflightContext,
  type AgentCommittedVerificationPlanBinding,
  type AgentContextPack,
  type AgentPolicy,
  type AgentPrincipalRef,
  type AgentRepairBlockReason,
  type AgentRepairCounterexampleSet,
  type AgentRepairRegressionRequirement,
  type AgentRepairRoundReceipt,
  type AgentRunSnapshot,
  type AgentRunSuccessProof,
  type AgentTaskRecord,
  type AgentVerificationClosureReceipt,
  type AgentWorkspaceMutationReceipt,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  digestVerificationValue,
  evaluateVerificationClosure,
  type EvaluateVerificationClosureInput,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationPlan,
  type VerificationPlanCell,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import type { WorkspaceAgentProposalProjection } from './workspaceAgentProposalCoordinator';

export type WorkspaceAgentVerificationIssue = Readonly<{
  code: 'AI-6001' | 'AI-6002' | 'AI-6010' | 'AI-7006' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type WorkspaceAgentVerificationResult<T> =
  | Readonly<{ status: 'ready'; value: T }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceAgentVerificationIssue[];
    }>;

const issue = (
  code: WorkspaceAgentVerificationIssue['code'],
  path: string,
  message: string
): WorkspaceAgentVerificationIssue =>
  Object.freeze({ code, path, message, blocking: true });

const blocked = <T>(
  code: WorkspaceAgentVerificationIssue['code'],
  path: string,
  message: string
): WorkspaceAgentVerificationResult<T> =>
  Object.freeze({
    status: 'blocked',
    issues: Object.freeze([issue(code, path, message)]),
  });

const ready = <T>(value: T): WorkspaceAgentVerificationResult<T> =>
  Object.freeze({ status: 'ready', value });

const canonicalText = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort(compareAgentCanonicalText));

const revisionForPlan = (plan: VerificationPlan) =>
  Object.freeze({
    workspaceRev: plan.targetPartitionRevisions.workspaceRev,
    routeRev: plan.targetPartitionRevisions.routeRev,
    opSeq: plan.targetPartitionRevisions.opSeq,
    documents: Object.freeze(
      Object.entries(plan.targetPartitionRevisions.documentRevisions)
        .sort(([left], [right]) => compareAgentCanonicalText(left, right))
        .map(([documentId, revision]) =>
          Object.freeze({ documentId, ...revision })
        )
    ),
  });

/** Stable across a new target revision while retaining the same required check. */
const stableCellValue = (cell: VerificationPlanCell): unknown => ({
  checkId: cell.checkId,
  checkKind: cell.checkKind,
  ...(cell.scenarioId === undefined ? {} : { scenarioId: cell.scenarioId }),
  targetId: cell.targetId,
  targetPolicy: cell.targetPolicy,
  frameworkTarget: cell.frameworkTarget,
  surface: cell.surface,
  ...(cell.browserEngine === undefined
    ? {}
    : { browserEngine: cell.browserEngine }),
  viewport: cell.viewport,
  colorScheme: cell.colorScheme,
  motion: cell.motion,
  locale: cell.locale,
  controlProfileRef: cell.controlProfileRef,
  ...(cell.fixtureSetRef === undefined
    ? {}
    : { fixtureSetRef: cell.fixtureSetRef }),
  ...(cell.baselineSetRef === undefined
    ? {}
    : { baselineSetRef: cell.baselineSetRef }),
  adapter: cell.adapter,
  requirement: cell.requirement,
  policyRuleIds: canonicalText(cell.policyRuleIds),
  appliedExemptionIds: canonicalText(cell.appliedExemptionIds),
  retryPolicy: cell.retryPolicy,
  evidenceRequirements: cell.evidenceRequirements,
  resources: cell.resources,
  inputKinds: canonicalText(cell.inputKinds),
  artifactKinds: canonicalText(cell.artifactKinds),
  preflight: cell.preflight,
});

export const digestWorkspaceAgentStableVerificationCell = (
  cell: VerificationPlanCell
): CanonicalDigest => digestAgentCanonicalValue(stableCellValue(cell));

const requiredCells = (
  plan: VerificationPlan
): readonly VerificationPlanCell[] =>
  Object.freeze(
    plan.cells.filter(({ requirement }) => requirement === 'required')
  );

const requiredCellSetDigest = (plan: VerificationPlan): CanonicalDigest =>
  digestAgentCanonicalValue(
    canonicalText(
      requiredCells(plan).map(digestWorkspaceAgentStableVerificationCell)
    )
  );

const samePlanCore = (
  approved: VerificationPlan,
  actual: VerificationPlan
): boolean =>
  approved.workspaceId === actual.workspaceId &&
  approved.targetRevision === actual.targetRevision &&
  digestAgentCanonicalValue(approved.targetPartitionRevisions) ===
    digestAgentCanonicalValue(actual.targetPartitionRevisions) &&
  approved.scenarioRegistryDigest === actual.scenarioRegistryDigest &&
  approved.policyRevision === actual.policyRevision &&
  approved.policyDigest === actual.policyDigest &&
  approved.policyEvaluationInstant === actual.policyEvaluationInstant &&
  approved.impactDigest === actual.impactDigest &&
  approved.semanticSchemaDigest === actual.semanticSchemaDigest &&
  approved.providerSetDigest === actual.providerSetDigest &&
  approved.compilerDigest === actual.compilerDigest &&
  approved.plannerDigest === actual.plannerDigest &&
  approved.adapterRegistryDigest === actual.adapterRegistryDigest;

const retainsApprovedRequiredCells = (
  approved: VerificationPlan,
  actual: VerificationPlan
): boolean => {
  const actualCells = new Set(
    requiredCells(actual).map(digestWorkspaceAgentStableVerificationCell)
  );
  return requiredCells(approved).every((cell) =>
    actualCells.has(digestWorkspaceAgentStableVerificationCell(cell))
  );
};

const retainsRegressionRequirements = (
  actual: VerificationPlan,
  requirements: readonly AgentRepairRegressionRequirement[]
): boolean => {
  const actualCells = new Set(
    requiredCells(actual).map(digestWorkspaceAgentStableVerificationCell)
  );
  return requirements.every(({ stableCellDigest }) =>
    actualCells.has(stableCellDigest)
  );
};

const runSelectsRequiredCells = (
  plan: VerificationPlan,
  run: VerificationRunSnapshot
): boolean => {
  const selected = new Set(run.selectedCellIds);
  return (
    run.workspaceId === plan.workspaceId &&
    run.workspaceRevision === plan.targetRevision &&
    run.planDigest === plan.planDigest &&
    run.selectedCellIds.length === run.cells.length &&
    requiredCells(plan).every((cell) => selected.has(cell.id))
  );
};

export type CreateWorkspaceAgentVerificationPlanBindingInput = Readonly<{
  projection: WorkspaceAgentProposalProjection;
  approval: AgentApprovalPreflightContext;
  mutationReceipt: AgentWorkspaceMutationReceipt;
  actualPlan: VerificationPlan;
  verificationRun: VerificationRunSnapshot;
  regressionRequirements?: readonly AgentRepairRegressionRequirement[];
  bindingId: string;
  producer: AgentPrincipalRef;
  boundAt: string;
}>;

/**
 * Replans after the ACK and binds the actual committed revision. A changed
 * policy, required cell, baseline, toolchain, or target never counts as green.
 */
export const createWorkspaceAgentVerificationPlanBinding = (
  input: CreateWorkspaceAgentVerificationPlanBindingInput
): WorkspaceAgentVerificationResult<AgentCommittedVerificationPlanBinding> => {
  const { projection, approval, mutationReceipt, actualPlan, verificationRun } =
    input;
  if (
    mutationReceipt.state !== 'acknowledged' ||
    !mutationReceipt.targetRevision ||
    !mutationReceipt.mutationDigest
  ) {
    return blocked(
      'AI-7006',
      '/mutationReceipt',
      'Verification requires an acknowledged Atomic Commit or rollback receipt.'
    );
  }
  if (
    mutationReceipt.taskId !== approval.proposal.taskId ||
    mutationReceipt.runId !== approval.proposal.runId ||
    mutationReceipt.proposalId !== approval.proposal.proposalId ||
    mutationReceipt.previewId !== approval.preview.previewId ||
    mutationReceipt.decisionId !== approval.decision.decisionId ||
    approval.decision.decision !== 'approved'
  ) {
    return blocked(
      'AI-7006',
      '/approval',
      'Mutation and verification lost the exact approved proposal lineage.'
    );
  }
  if (
    actualPlan.status !== 'ready' ||
    actualPlan.targetRevision !==
      actualPlan.targetPartitionRevisions.workspaceRev ||
    !sameAgentWorkspaceRevision(
      mutationReceipt.targetRevision,
      revisionForPlan(actualPlan)
    )
  ) {
    return blocked(
      'AI-6001',
      '/actualPlan',
      'Actual VerificationPlan does not bind the acknowledged target revision.'
    );
  }
  if (!runSelectsRequiredCells(actualPlan, verificationRun)) {
    return blocked(
      'AI-6001',
      '/verificationRun',
      'VerificationRun must bind the actual Plan and select every required cell.'
    );
  }
  const requirements = input.regressionRequirements ?? Object.freeze([]);
  if (!retainsRegressionRequirements(actualPlan, requirements)) {
    return blocked(
      'AI-6010',
      '/actualPlan/cells',
      'Actual Plan dropped a failure-grounded regression requirement.'
    );
  }
  let planCompatibility: AgentCommittedVerificationPlanBinding['planCompatibility'];
  if (mutationReceipt.kind === 'rollback') {
    planCompatibility = 'post-rollback';
  } else if (projection.verificationPlan.planDigest === actualPlan.planDigest) {
    planCompatibility = 'exact';
  } else if (
    samePlanCore(projection.verificationPlan, actualPlan) &&
    retainsApprovedRequiredCells(projection.verificationPlan, actualPlan)
  ) {
    planCompatibility = 'compatible';
  } else {
    return blocked(
      'AI-7006',
      '/actualPlan',
      'Actual committed Plan is incompatible with the approved Plan.'
    );
  }
  try {
    return ready(
      createAgentCommittedVerificationPlanBinding({
        bindingId: input.bindingId,
        taskId: mutationReceipt.taskId,
        runId: mutationReceipt.runId,
        proposalId: mutationReceipt.proposalId,
        previewId: mutationReceipt.previewId,
        decisionId: mutationReceipt.decisionId,
        mutationReceiptId: mutationReceipt.receiptId,
        mutationKind: mutationReceipt.kind,
        verificationRunId: verificationRun.runId,
        targetRevision: mutationReceipt.targetRevision,
        approvedPlanDigest: projection.verificationPlan.planDigest,
        actualPlanDigest: actualPlan.planDigest,
        planCompatibility,
        impactDigest: actualPlan.impactDigest,
        policyDigest: actualPlan.policyDigest,
        approvedRequiredCellSetDigest: requiredCellSetDigest(
          projection.verificationPlan
        ),
        actualRequiredCellSetDigest: requiredCellSetDigest(actualPlan),
        regressionRequirementSetDigest: digestAgentCanonicalValue(
          canonicalText(
            requirements.map(({ requirementDigest }) => requirementDigest)
          )
        ),
        producer: input.producer,
        boundAt: input.boundAt,
      })
    );
  } catch (error) {
    return blocked(
      'AI-9001',
      '/binding',
      error instanceof Error
        ? error.message
        : 'Verification Plan binding is invalid.'
    );
  }
};

export type EvaluateWorkspaceAgentVerificationClosureInput = Readonly<{
  binding: AgentCommittedVerificationPlanBinding;
  verificationRun: VerificationRunSnapshot;
  closureInput: EvaluateVerificationClosureInput;
  receiptId: string;
  producer: AgentPrincipalRef;
  evaluatedAt: string;
}>;

export type WorkspaceAgentVerificationClosure = Readonly<{
  closure: VerificationClosure;
  receipt: AgentVerificationClosureReceipt;
}>;

/** Uses the real G3 evaluator and accepts only Backend-verified Evidence view. */
export const evaluateWorkspaceAgentVerificationClosure = (
  input: EvaluateWorkspaceAgentVerificationClosureInput
): WorkspaceAgentVerificationResult<WorkspaceAgentVerificationClosure> => {
  const { binding, verificationRun, closureInput } = input;
  if (
    !closureInput.verifiedEvidenceView ||
    binding.verificationRunId !== verificationRun.runId ||
    binding.actualPlanDigest !== closureInput.plan.planDigest ||
    !sameAgentWorkspaceRevision(
      binding.targetRevision,
      revisionForPlan(closureInput.plan)
    )
  ) {
    return blocked(
      'AI-6001',
      '/closure',
      'Closure input is not bound to the committed Plan, Run, revision, and verified Evidence view.'
    );
  }
  const evaluated = evaluateVerificationClosure(closureInput);
  if (evaluated.status !== 'ready') {
    return blocked('AI-6001', '/closure', evaluated.message);
  }
  const { closure } = evaluated;
  if (
    verificationRun.closureDigest !== closure.closureDigest ||
    verificationRun.closureVerdict !== closure.verdict
  ) {
    return blocked(
      'AI-6001',
      '/verificationRun/closure',
      'VerificationRun must durably attach the exact evaluated Closure before Agent completion.'
    );
  }
  const promotedEvidenceIds = new Set(
    verificationRun.cells.flatMap(({ evidenceId }) =>
      evidenceId ? [evidenceId] : []
    )
  );
  if (closureInput.evidence.some(({ id }) => !promotedEvidenceIds.has(id))) {
    return blocked(
      'AI-6001',
      '/closure/evidence',
      'Closure referenced Evidence that was not promoted by the bound VerificationRun.'
    );
  }
  try {
    const receipt = createAgentVerificationClosureReceipt({
      receiptId: input.receiptId,
      bindingId: binding.bindingId,
      taskId: binding.taskId,
      runId: binding.runId,
      verificationRunId: binding.verificationRunId,
      targetRevision: binding.targetRevision,
      planDigest: binding.actualPlanDigest,
      evidenceRefs: closureInput.evidence.map(
        ({ id, manifestDigest, result }) =>
          Object.freeze({
            evidenceId: id,
            manifestDigest,
            outcome: result.outcome,
          })
      ),
      evidenceSetDigest: closure.evidenceSetDigest,
      verifiedEvidenceViewDigest: closureInput.verifiedEvidenceView.viewDigest,
      closureDigest: closure.closureDigest,
      verdict: closure.verdict,
      producer: input.producer,
      evaluatedAt: input.evaluatedAt,
    });
    return ready(Object.freeze({ closure, receipt }));
  } catch (error) {
    return blocked(
      'AI-9001',
      '/closureReceipt',
      error instanceof Error
        ? error.message
        : 'Verification Closure receipt is invalid.'
    );
  }
};

export const createWorkspaceAgentApplySuccessProof = (
  input: Readonly<{
    projection: WorkspaceAgentProposalProjection;
    approval: AgentApprovalPreflightContext;
    mutationReceipt: AgentWorkspaceMutationReceipt;
    binding: AgentCommittedVerificationPlanBinding;
    closureReceipt: AgentVerificationClosureReceipt;
  }>
): WorkspaceAgentVerificationResult<
  Extract<AgentRunSuccessProof, { mode: 'apply' }>
> => {
  const { projection, approval, mutationReceipt, binding, closureReceipt } =
    input;
  if (
    mutationReceipt.kind !== 'commit' ||
    mutationReceipt.state !== 'acknowledged' ||
    approval.decision.decision !== 'approved' ||
    binding.mutationReceiptId !== mutationReceipt.receiptId ||
    binding.planCompatibility === 'post-rollback' ||
    closureReceipt.bindingId !== binding.bindingId ||
    closureReceipt.verdict !== 'satisfied' ||
    closureReceipt.planDigest !== binding.actualPlanDigest ||
    closureReceipt.targetRevision.opSeq !== binding.targetRevision.opSeq
  ) {
    return blocked(
      'AI-6001',
      '/successProof',
      'Apply success requires exact approval, commit ACK, compatible actual Plan, and satisfied Closure.'
    );
  }
  return ready(
    Object.freeze({
      mode: 'apply',
      proposalDigest: approval.proposal.proposalDigest,
      approvalDigest: digestAgentCanonicalValue(approval.decision),
      transactionDigest: projection.planning.transactionDigest,
      commitAckDigest: mutationReceipt.receiptDigest,
      committedPlanDigest: binding.approvedPlanDigest,
      actualPlanDigest: binding.actualPlanDigest,
      planCompatibility: binding.planCompatibility,
      verificationClosureDigest: closureReceipt.closureDigest,
      verificationClosureOutcome: 'satisfied',
    })
  );
};

export const deriveWorkspaceAgentRepairCounterexamples = (
  input: Readonly<{
    plan: VerificationPlan;
    closure: VerificationClosure;
    evidence: readonly VerificationEvidence[];
  }>
): WorkspaceAgentVerificationResult<AgentRepairCounterexampleSet> => {
  if (
    input.closure.verdict === 'satisfied' ||
    input.closure.planDigest !== input.plan.planDigest
  ) {
    return blocked(
      'AI-6010',
      '/closure',
      'Repair requires an unsatisfied or stale Closure for the exact Plan.'
    );
  }
  const requirements = requiredCells(input.plan)
    .filter((cell) => input.closure.cellStatuses[cell.id] !== 'passed')
    .map((cell): AgentRepairRegressionRequirement => {
      const evidence = input.evidence.filter(
        ({ cellId }) => cellId === cell.id
      );
      const base = Object.freeze({
        sourceCellId: cell.id,
        stableCellDigest: digestWorkspaceAgentStableVerificationCell(cell),
        checkId: cell.checkId,
        targetId: cell.targetId,
        evidenceManifestDigests: canonicalText(
          evidence.map(({ manifestDigest }) => manifestDigest)
        ),
        sourceTraceDigests: canonicalText(
          evidence.map(({ sourceTraceDigest }) => sourceTraceDigest)
        ),
        diagnosticCodes: canonicalText([
          ...evidence.flatMap(({ result }) => result.diagnosticCodes),
          ...input.closure.issues
            .filter(({ cellId }) => cellId === cell.id)
            .map(({ status }) => `closure:${status}`),
        ]),
      });
      return Object.freeze({
        ...base,
        requirementDigest: digestAgentCanonicalValue(base),
      });
    })
    .sort((left, right) =>
      compareAgentCanonicalText(left.stableCellDigest, right.stableCellDigest)
    );
  if (requirements.length === 0) {
    return blocked(
      'AI-6010',
      '/closure/cellStatuses',
      'Failed Closure produced no required-cell counterexample.'
    );
  }
  const requirementDigests = requirements.map(
    ({ requirementDigest }) => requirementDigest
  );
  const counterexampleBase = Object.freeze({
    failedClosureDigest: input.closure.closureDigest,
    requirements: Object.freeze(requirements),
  });
  return ready(
    Object.freeze({
      ...counterexampleBase,
      counterexampleSetDigest: digestAgentCanonicalValue(counterexampleBase),
      regressionRequirementSetDigest: digestAgentCanonicalValue(
        canonicalText(requirementDigests)
      ),
    })
  );
};

const utilizedBudget = (
  run: AgentRunSnapshot
): Readonly<{
  repairRounds: number;
  transactions: number;
}> =>
  run.budgetLedger.reservations.reduce(
    (total, reservation) => {
      const demand =
        reservation.status === 'settled'
          ? (reservation.settlement?.charged ?? reservation.demand)
          : reservation.demand;
      return {
        repairRounds: total.repairRounds + demand.repairRounds,
        transactions: total.transactions + demand.transactions,
      };
    },
    { repairRounds: 0, transactions: 0 }
  );

const contextContainsFailure = (
  pack: AgentContextPack,
  closureReceipt: AgentVerificationClosureReceipt
): boolean => {
  const closure = pack.items.some(
    ({ kind, contentDigest }) =>
      kind === 'verification-closure' &&
      contentDigest === closureReceipt.closureDigest
  );
  const evidence = new Set(
    pack.items
      .filter(({ kind }) => kind === 'verification-evidence')
      .map(({ contentDigest }) => contentDigest)
  );
  return (
    closure &&
    closureReceipt.evidenceRefs
      .filter(({ outcome }) => outcome !== 'passed')
      .every(({ manifestDigest }) => evidence.has(manifestDigest))
  );
};

const createBlockedRepairReceipt = (
  input: Readonly<{
    receiptId: string;
    repairRoundId: string;
    taskId: string;
    runId: string;
    round: number;
    closureReceipt: AgentVerificationClosureReceipt;
    contextPackDigest: CanonicalDigest;
    counterexamples: AgentRepairCounterexampleSet;
    budgetLedgerDigest: CanonicalDigest;
    producer: AgentPrincipalRef;
    recordedAt: string;
    reason: AgentRepairBlockReason;
  }>
): AgentRepairRoundReceipt =>
  createAgentRepairRoundReceipt({
    receiptId: input.receiptId,
    repairRoundId: input.repairRoundId,
    state: 'blocked',
    taskId: input.taskId,
    runId: input.runId,
    round: input.round,
    failedClosureReceiptId: input.closureReceipt.receiptId,
    failedClosureDigest: input.closureReceipt.closureDigest,
    failedEvidenceManifestDigests: input.closureReceipt.evidenceRefs
      .filter(({ outcome }) => outcome !== 'passed')
      .map(({ manifestDigest }) => manifestDigest),
    failureContextPackDigest: input.contextPackDigest,
    counterexampleSetDigest: input.counterexamples.counterexampleSetDigest,
    regressionRequirementSetDigest:
      input.counterexamples.regressionRequirementSetDigest,
    cumulativeBudgetLedgerDigest: input.budgetLedgerDigest,
    producer: input.producer,
    recordedAt: input.recordedAt,
    blockReason: input.reason,
  });

export type PrepareWorkspaceAgentRepairRoundInput = Readonly<{
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  policy: AgentPolicy;
  failedClosureReceipt: AgentVerificationClosureReceipt;
  failedClosure: VerificationClosure;
  failedPlan: VerificationPlan;
  failedEvidence: readonly VerificationEvidence[];
  failureContextPack: AgentContextPack;
  previousRepairReceipts: readonly AgentRepairRoundReceipt[];
  receiptId: string;
  repairRoundId: string;
  producer: AgentPrincipalRef;
  recordedAt: string;
}>;

export type WorkspaceAgentRepairRoundPreparation = Readonly<{
  receipt: AgentRepairRoundReceipt;
  counterexamples: AgentRepairCounterexampleSet;
}>;

/** Opens at most one new, failure-grounded repair round; blocked is durable. */
export const prepareWorkspaceAgentRepairRound = (
  input: PrepareWorkspaceAgentRepairRoundInput
): WorkspaceAgentVerificationResult<WorkspaceAgentRepairRoundPreparation> => {
  const counterexamples = deriveWorkspaceAgentRepairCounterexamples({
    plan: input.failedPlan,
    closure: input.failedClosure,
    evidence: input.failedEvidence,
  });
  if (counterexamples.status === 'blocked') return counterexamples;
  const round =
    input.previousRepairReceipts.reduce(
      (maximum, receipt) => Math.max(maximum, receipt.round),
      0
    ) + 1;
  const receiptBase = {
    receiptId: input.receiptId,
    repairRoundId: input.repairRoundId,
    taskId: input.task.spec.taskId,
    runId: input.run.run.runId,
    round,
    closureReceipt: input.failedClosureReceipt,
    contextPackDigest: input.failureContextPack.manifestDigest,
    counterexamples: counterexamples.value,
    budgetLedgerDigest: input.run.budgetLedger.ledgerDigest,
    producer: input.producer,
    recordedAt: input.recordedAt,
  } as const;
  let reason: AgentRepairBlockReason | undefined;
  const used = utilizedBudget(input.run);
  const repairLimit = Math.min(
    input.task.spec.budget.maxRepairRounds,
    input.policy.budgetCeiling.maxRepairRounds,
    input.run.budgetLedger.budget.maxRepairRounds
  );
  const transactionLimit = Math.min(
    input.task.spec.budget.maxTransactions,
    input.policy.budgetCeiling.maxTransactions,
    input.run.budgetLedger.budget.maxTransactions
  );
  if (input.policy.verificationRules.repair !== 'approval-bound')
    reason = 'repair-forbidden';
  else if (round > repairLimit) reason = 'repair-round-exhausted';
  else if (
    used.repairRounds + 1 > repairLimit ||
    used.transactions + 1 > transactionLimit
  )
    reason = 'budget-exhausted';
  else if (
    input.run.run.taskId !== input.task.spec.taskId ||
    input.failedClosureReceipt.taskId !== input.task.spec.taskId ||
    input.failedClosureReceipt.runId !== input.run.run.runId ||
    !['verifying', 'repairing'].includes(input.run.run.phase)
  )
    reason = 'authority-drift';
  else if (
    input.failureContextPack.taskId !== input.task.spec.taskId ||
    input.failureContextPack.runId !== input.run.run.runId ||
    input.failureContextPack.policyDigest !== input.task.spec.policyDigest ||
    !contextContainsFailure(
      input.failureContextPack,
      input.failedClosureReceipt
    )
  )
    reason = 'regression-requirement-missing';
  try {
    const receipt = reason
      ? createBlockedRepairReceipt({ ...receiptBase, reason })
      : createAgentRepairRoundReceipt({
          receiptId: input.receiptId,
          repairRoundId: input.repairRoundId,
          state: 'started',
          taskId: input.task.spec.taskId,
          runId: input.run.run.runId,
          round,
          failedClosureReceiptId: input.failedClosureReceipt.receiptId,
          failedClosureDigest: input.failedClosureReceipt.closureDigest,
          failedEvidenceManifestDigests: input.failedClosureReceipt.evidenceRefs
            .filter(({ outcome }) => outcome !== 'passed')
            .map(({ manifestDigest }) => manifestDigest),
          failureContextPackDigest: input.failureContextPack.manifestDigest,
          counterexampleSetDigest:
            counterexamples.value.counterexampleSetDigest,
          regressionRequirementSetDigest:
            counterexamples.value.regressionRequirementSetDigest,
          cumulativeBudgetLedgerDigest: input.run.budgetLedger.ledgerDigest,
          producer: input.producer,
          recordedAt: input.recordedAt,
        });
    return ready(
      Object.freeze({ receipt, counterexamples: counterexamples.value })
    );
  } catch (error) {
    return blocked(
      'AI-9001',
      '/repairReceipt',
      error instanceof Error ? error.message : 'Repair receipt is invalid.'
    );
  }
};

export const bindWorkspaceAgentRepairProposal = (
  input: Readonly<{
    started: Extract<AgentRepairRoundReceipt, { state: 'started' }>;
    failedBinding: AgentCommittedVerificationPlanBinding;
    failedClosureReceipt: AgentVerificationClosureReceipt;
    failedTransactionDigest: CanonicalDigest;
    projection: WorkspaceAgentProposalProjection;
    approval: AgentApprovalPreflightContext;
    counterexamples: AgentRepairCounterexampleSet;
    receiptId: string;
    producer: AgentPrincipalRef;
    recordedAt: string;
  }>
): WorkspaceAgentVerificationResult<
  Extract<AgentRepairRoundReceipt, { state: 'proposal-bound' }>
> => {
  const {
    started,
    failedBinding,
    failedClosureReceipt,
    projection,
    approval,
    counterexamples,
  } = input;
  if (
    started.counterexampleSetDigest !==
      counterexamples.counterexampleSetDigest ||
    started.regressionRequirementSetDigest !==
      counterexamples.regressionRequirementSetDigest ||
    started.failedClosureReceiptId !== failedClosureReceipt.receiptId ||
    started.failedClosureDigest !== failedClosureReceipt.closureDigest ||
    failedClosureReceipt.bindingId !== failedBinding.bindingId ||
    approval.proposal.taskId !== started.taskId ||
    approval.proposal.runId !== started.runId ||
    approval.decision.decision !== 'approved' ||
    approval.preview.previewId !== projection.preview.previewId ||
    approval.planning.transactionDigest !==
      projection.planning.transactionDigest ||
    approval.proposal.proposalId === failedBinding.proposalId ||
    projection.preview.previewId === failedBinding.previewId ||
    approval.decision.decisionId === failedBinding.decisionId ||
    projection.planning.transactionDigest === input.failedTransactionDigest ||
    projection.verificationPlan.planDigest === failedBinding.actualPlanDigest ||
    !retainsRegressionRequirements(
      projection.verificationPlan,
      counterexamples.requirements
    )
  ) {
    return blocked(
      'AI-6010',
      '/repairProposal',
      'Repair proposal lost approval lineage or required counterexamples.'
    );
  }
  try {
    const receipt = createAgentRepairRoundReceipt({
      receiptId: input.receiptId,
      repairRoundId: started.repairRoundId,
      state: 'proposal-bound',
      taskId: started.taskId,
      runId: started.runId,
      round: started.round,
      failedClosureReceiptId: started.failedClosureReceiptId,
      failedClosureDigest: started.failedClosureDigest,
      failedEvidenceManifestDigests: started.failedEvidenceManifestDigests,
      failureContextPackDigest: started.failureContextPackDigest,
      counterexampleSetDigest: started.counterexampleSetDigest,
      regressionRequirementSetDigest: started.regressionRequirementSetDigest,
      cumulativeBudgetLedgerDigest: started.cumulativeBudgetLedgerDigest,
      producer: input.producer,
      recordedAt: input.recordedAt,
      proposalId: approval.proposal.proposalId,
      previewId: projection.preview.previewId,
      decisionId: approval.decision.decisionId,
      transactionDigest: projection.planning.transactionDigest,
      verificationPlanDigest: projection.verificationPlan.planDigest,
    });
    return ready(
      receipt as Extract<AgentRepairRoundReceipt, { state: 'proposal-bound' }>
    );
  } catch (error) {
    return blocked(
      'AI-9001',
      '/repairProposalReceipt',
      error instanceof Error
        ? error.message
        : 'Repair proposal receipt is invalid.'
    );
  }
};

export const digestWorkspaceAgentVerificationRun = (
  run: VerificationRunSnapshot
): CanonicalDigest => digestVerificationValue(run);
