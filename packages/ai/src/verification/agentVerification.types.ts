import type {
  AgentPrincipalRef,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';

export type AgentVerificationPlanCompatibility =
  'exact' | 'compatible' | 'post-rollback';

export type AgentVerificationEvidenceOutcome =
  'passed' | 'failed' | 'blocked' | 'cancelled' | 'infrastructure-error';

export type AgentVerificationEvidenceRef = Readonly<{
  evidenceId: string;
  manifestDigest: CanonicalDigest;
  outcome: AgentVerificationEvidenceOutcome;
}>;

export type AgentCommittedVerificationPlanBinding = Readonly<{
  bindingId: string;
  taskId: string;
  runId: string;
  proposalId: string;
  previewId: string;
  decisionId: string;
  mutationReceiptId: string;
  mutationKind: 'commit' | 'rollback';
  verificationRunId: string;
  targetRevision: AgentWorkspaceRevisionVector;
  approvedPlanDigest: CanonicalDigest;
  actualPlanDigest: CanonicalDigest;
  planCompatibility: AgentVerificationPlanCompatibility;
  impactDigest: CanonicalDigest;
  policyDigest: CanonicalDigest;
  approvedRequiredCellSetDigest: CanonicalDigest;
  actualRequiredCellSetDigest: CanonicalDigest;
  regressionRequirementSetDigest: CanonicalDigest;
  producer: AgentPrincipalRef;
  boundAt: Instant;
  bindingDigest: CanonicalDigest;
}>;

export type AgentVerificationClosureReceipt = Readonly<{
  receiptId: string;
  bindingId: string;
  taskId: string;
  runId: string;
  verificationRunId: string;
  targetRevision: AgentWorkspaceRevisionVector;
  planDigest: CanonicalDigest;
  evidenceRefs: readonly AgentVerificationEvidenceRef[];
  evidenceSetDigest: CanonicalDigest;
  verifiedEvidenceViewDigest: CanonicalDigest;
  closureDigest: CanonicalDigest;
  verdict: 'satisfied' | 'unsatisfied' | 'stale';
  producer: AgentPrincipalRef;
  evaluatedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentRepairBlockReason =
  | 'repair-forbidden'
  | 'repair-round-exhausted'
  | 'budget-exhausted'
  | 'permission-denied'
  | 'regression-requirement-missing'
  | 'authority-drift';

type AgentRepairRoundReceiptBase = Readonly<{
  receiptId: string;
  repairRoundId: string;
  taskId: string;
  runId: string;
  round: number;
  failedClosureReceiptId: string;
  failedClosureDigest: CanonicalDigest;
  failedEvidenceManifestDigests: readonly CanonicalDigest[];
  failureContextPackDigest: CanonicalDigest;
  counterexampleSetDigest: CanonicalDigest;
  regressionRequirementSetDigest: CanonicalDigest;
  cumulativeBudgetLedgerDigest: CanonicalDigest;
  producer: AgentPrincipalRef;
  recordedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentRepairRoundReceipt =
  | (AgentRepairRoundReceiptBase &
      Readonly<{
        state: 'started';
      }>)
  | (AgentRepairRoundReceiptBase &
      Readonly<{
        state: 'proposal-bound';
        proposalId: string;
        previewId: string;
        decisionId: string;
        transactionDigest: CanonicalDigest;
        verificationPlanDigest: CanonicalDigest;
      }>)
  | (AgentRepairRoundReceiptBase &
      Readonly<{
        state: 'blocked';
        blockReason: AgentRepairBlockReason;
      }>);

export type AgentRepairRegressionRequirement = Readonly<{
  sourceCellId: string;
  stableCellDigest: CanonicalDigest;
  checkId: string;
  targetId: string;
  evidenceManifestDigests: readonly CanonicalDigest[];
  sourceTraceDigests: readonly CanonicalDigest[];
  diagnosticCodes: readonly string[];
  requirementDigest: CanonicalDigest;
}>;

export type AgentRepairCounterexampleSet = Readonly<{
  failedClosureDigest: CanonicalDigest;
  requirements: readonly AgentRepairRegressionRequirement[];
  counterexampleSetDigest: CanonicalDigest;
  regressionRequirementSetDigest: CanonicalDigest;
}>;

export type AgentVerificationFact =
  | Readonly<{
      factType: 'committed-plan-binding';
      value: AgentCommittedVerificationPlanBinding;
    }>
  | Readonly<{
      factType: 'verification-closure-receipt';
      value: AgentVerificationClosureReceipt;
    }>
  | Readonly<{
      factType: 'repair-round-receipt';
      value: AgentRepairRoundReceipt;
    }>;
