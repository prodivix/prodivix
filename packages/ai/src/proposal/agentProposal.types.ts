import type {
  AgentActionProposal,
  AgentApprovalDecision,
  AgentCapability,
  AgentCapabilityGrant,
  AgentJsonValue,
  AgentPolicy,
  AgentPrincipalRef,
  AgentProposalPreview,
  AgentRisk,
  AgentTargetRef,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';

export type AgentProposalIssueCode =
  | 'AI-5001'
  | 'AI-5002'
  | 'AI-5003'
  | 'AI-5004'
  | 'AI-5005'
  | 'AI-5006'
  | 'AI-6001'
  | 'AI-7001'
  | 'AI-7005'
  | 'AI-7006'
  | 'AI-8004'
  | 'AI-9001';

export type AgentProposalIssue = Readonly<{
  code: AgentProposalIssueCode;
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentActionDescriptor = Readonly<{
  descriptorId: string;
  ownerId: string;
  actionType: string;
  inputSchemaId: string;
  requiredCapabilities: readonly AgentCapability[];
  allowedTargetKinds: readonly AgentTargetRef['kind'][];
  maximumInputBytes: number;
  risk: AgentRisk;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentActionRegistrySnapshot = Readonly<{
  registryId: string;
  descriptors: readonly AgentActionDescriptor[];
  registryDigest: CanonicalDigest;
}>;

export type AgentProposalPlanningReceipt = Readonly<{
  proposalId: string;
  baseRevision: AgentWorkspaceRevisionVector;
  proposedSnapshotDigest: CanonicalDigest;
  transactionDigest: CanonicalDigest;
  reverseTransactionDigest: CanonicalDigest;
  semanticDiffDigest: CanonicalDigest;
  impactSetRef: string;
  impactDigest: CanonicalDigest;
  verificationPlanRef: string;
  verificationPlanDigest: CanonicalDigest;
  sourceTraceDigest: CanonicalDigest;
  requiredCapabilities: readonly AgentCapability[];
  risks: readonly AgentRisk[];
  diagnosticRefs: readonly string[];
  plannedAt: Instant;
  expiresAt: Instant;
  planningDigest: CanonicalDigest;
}>;

export type AgentApprovalPreflightContext = Readonly<{
  proposal: AgentActionProposal;
  preview: AgentProposalPreview;
  planning: AgentProposalPlanningReceipt;
  decision: AgentApprovalDecision;
  grant: AgentCapabilityGrant;
  policy: AgentPolicy;
  currentRevision: AgentWorkspaceRevisionVector;
  actorAuthorizationDigest: CanonicalDigest;
  expectedActorAuthorizationDigest: CanonicalDigest;
  actorAuthorized: boolean;
  grantUseCount: number;
  at: Instant;
}>;

export type AgentApprovalPreflightResult =
  | Readonly<{
      status: 'ready';
      decision: AgentApprovalDecision;
      preview: AgentProposalPreview;
      planning: AgentProposalPlanningReceipt;
    }>
  | Readonly<{
      status: 'rejected' | 'stale' | 'invalidated';
      issues: readonly AgentProposalIssue[];
    }>;

export type AgentWorkspaceMutationKind = 'commit' | 'rollback';

export type AgentWorkspaceMutationState =
  'started' | 'acknowledged' | 'conflicted' | 'reconciliation-required';

export type AgentWorkspaceMutationReceipt = Readonly<{
  receiptId: string;
  kind: AgentWorkspaceMutationKind;
  state: AgentWorkspaceMutationState;
  taskId: string;
  runId: string;
  proposalId: string;
  previewId: string;
  decisionId: string;
  operationId: string;
  baseRevision: AgentWorkspaceRevisionVector;
  transactionDigest: CanonicalDigest;
  reverseTransactionDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  producer: AgentPrincipalRef;
  startedAt: Instant;
  completedAt?: Instant;
  targetRevision?: AgentWorkspaceRevisionVector;
  mutationDigest?: CanonicalDigest;
  conflictDigest?: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentRollbackPreflightContext = Readonly<{
  commit: AgentWorkspaceMutationReceipt;
  approval: AgentApprovalPreflightContext;
  trigger: 'unsatisfied-closure';
  currentRevision: AgentWorkspaceRevisionVector;
  reverseTransactionDigest: CanonicalDigest;
  actorAuthorized: boolean;
  hasInterveningAuthoring: boolean;
  hasExternalSideEffects: boolean;
  at: Instant;
}>;

export type AgentRollbackPreflightResult =
  | Readonly<{
      status: 'ready';
      reverseTransactionDigest: CanonicalDigest;
      currentRevision: AgentWorkspaceRevisionVector;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentProposalIssue[];
    }>;

export type AgentProposalFact =
  | Readonly<{ factType: 'proposal'; value: AgentActionProposal }>
  | Readonly<{ factType: 'preview'; value: AgentProposalPreview }>
  | Readonly<{ factType: 'planning'; value: AgentProposalPlanningReceipt }>
  | Readonly<{ factType: 'approval'; value: AgentApprovalDecision }>
  | Readonly<{
      factType: 'workspace-mutation-receipt';
      value: AgentWorkspaceMutationReceipt;
    }>;

export type AgentProposalAuditPayload = AgentJsonValue;
