import type {
  AgentActionProposal,
  AgentApprovalDecision,
  AgentCapability,
  AgentContextPack,
  AgentJsonValue,
  AgentPrincipalRef,
  AgentProviderProtocolFamily,
  AgentProposalPreview,
  AgentRisk,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type {
  AgentAuditExport,
  AgentControlEvent,
  AgentRunSnapshot,
  AgentTaskRecord,
} from '../control/agentControl.types';
import type {
  AgentApprovalPreflightContext,
  AgentProposalPlanningReceipt,
  AgentWorkspaceMutationReceipt,
} from '../proposal/agentProposal.types';
import type {
  AgentCommittedVerificationPlanBinding,
  AgentRepairRoundReceipt,
  AgentVerificationClosureReceipt,
} from '../verification/agentVerification.types';
import type {
  AgentCost,
  AgentUsageAmount,
} from '../providers/agentProvider.types';

export type AgentProductDiagnostic = Readonly<{
  code: string;
  severity: 'info' | 'warning' | 'error';
  state: 'active' | 'resolved';
  message: string;
  nextAction?: string;
  identityRefs: readonly string[];
}>;

export type AgentProductModelIdentity = Readonly<{
  invocationId: string;
  providerConfigurationId: string;
  protocolFamily: AgentProviderProtocolFamily;
  providerOperatorId: string;
  modelId: string;
  modelVersion?: string;
  capabilityProfileId: string;
  outcome:
    'running' | 'completed' | 'refused' | 'blocked' | 'failed' | 'cancelled';
  receiptDigest?: CanonicalDigest;
}>;

export type AgentProductToolIdentity = Readonly<{
  callId: string;
  toolId: string;
  executionLocus:
    'client-hosted' | 'prodivix-runtime' | 'provider-hosted' | 'pinned-mcp';
  state: 'authorized' | 'running' | 'completed' | 'rejected' | 'cancelled';
  receiptDigest?: CanonicalDigest;
}>;

export type AgentProductRuntimeSummary = Readonly<{
  models: readonly AgentProductModelIdentity[];
  tools: readonly AgentProductToolIdentity[];
  usage: readonly AgentUsageAmount[];
  costs: readonly AgentCost[];
  usageVectorDigest?: CanonicalDigest;
  budgetLedgerDigest: CanonicalDigest;
}>;

/** Exact review material produced by domain owners, never by model prose. */
export type AgentProductProposalReview = Readonly<{
  proposalId: string;
  previewId: string;
  semanticDiff: AgentJsonValue;
  semanticDiffDigest: CanonicalDigest;
  impact: AgentJsonValue;
  impactDigest: CanonicalDigest;
  verificationPlan: AgentJsonValue;
  verificationPlanDigest: CanonicalDigest;
  permissions: readonly AgentCapability[];
  risks: readonly AgentRisk[];
  rollback: Readonly<{
    reverseTransactionDigest: CanonicalDigest;
    authorization: 'none' | 'on-unsatisfied-closure';
  }>;
  reviewDigest: CanonicalDigest;
}>;

/**
 * Content-addressed product-only material that is not already in a durable
 * Task/Run/proposal/verification ledger. It contains Context metadata but no
 * Context body, private reasoning, Secret value, or unrestricted tool output.
 */
export type AgentProductSupplement = Readonly<{
  supplementId: string;
  taskId: string;
  runId: string;
  generation: number;
  runSnapshotDigest: CanonicalDigest;
  context?: AgentContextPack;
  proposalReview?: AgentProductProposalReview;
  runtime: AgentProductRuntimeSummary;
  diagnostics: readonly AgentProductDiagnostic[];
  producer: AgentPrincipalRef & Readonly<{ kind: 'service' }>;
  projectedAt: Instant;
  supplementDigest: CanonicalDigest;
}>;

export type AgentRunUserCommandKind = 'cancel' | 'recover';

/** User intent to cancel/recover is durable, but is not itself a Run event. */
export type AgentRunUserCommand = Readonly<{
  commandId: string;
  taskId: string;
  runId: string;
  kind: AgentRunUserCommandKind;
  actor: AgentPrincipalRef & Readonly<{ kind: 'user' }>;
  expectedGeneration: number;
  expectedSnapshotDigest: CanonicalDigest;
  idempotencyKey: string;
  reason?: string;
  requestedAt: Instant;
  commandDigest: CanonicalDigest;
}>;

export type AgentProductFact =
  | Readonly<{
      factType: 'product-supplement';
      value: AgentProductSupplement;
    }>
  | Readonly<{
      factType: 'run-user-command';
      value: AgentRunUserCommand;
    }>;

export type AgentProductLedger = Readonly<{
  task: AgentTaskRecord;
  run: AgentRunSnapshot;
  events: readonly AgentControlEvent[];
  proposal?: AgentActionProposal;
  planning?: AgentProposalPlanningReceipt;
  preview?: AgentProposalPreview;
  approval?: AgentApprovalDecision;
  mutations: readonly AgentWorkspaceMutationReceipt[];
  verificationBindings: readonly AgentCommittedVerificationPlanBinding[];
  verificationClosures: readonly AgentVerificationClosureReceipt[];
  repairRounds: readonly AgentRepairRoundReceipt[];
  supplement?: AgentProductSupplement;
  commands: readonly AgentRunUserCommand[];
  audit?: AgentAuditExport;
  currentRevision: AgentWorkspaceRevisionVector;
  actorAuthorized: boolean;
}>;

export type AgentProductTimelineEntry = Readonly<{
  sequence: number;
  eventId: string;
  family: AgentControlEvent['family'];
  type: AgentControlEvent['type'];
  generation: number;
  occurredAt: Instant;
  eventDigest: CanonicalDigest;
  diagnosticCode?: string;
}>;

export type AgentProductAction =
  'approve' | 'reject' | 'cancel' | 'recover' | 'repair' | 'export-audit';

export type AgentProductIdentity = Readonly<{
  projectId: string;
  workspaceId: string;
  taskId: string;
  taskDigest: CanonicalDigest;
  runId: string;
  runSnapshotDigest: CanonicalDigest;
  generation: number;
  attempt: number;
  cursor: number;
  latestEventDigest?: CanonicalDigest;
  contextPackDigest?: CanonicalDigest;
  proposalId?: string;
  proposalDigest?: CanonicalDigest;
  previewId?: string;
  previewDigest?: CanonicalDigest;
  decisionId?: string;
  mutationReceiptId?: string;
  verificationBindingId?: string;
  verificationClosureReceiptId?: string;
  verificationClosureDigest?: CanonicalDigest;
}>;

export type AgentProductView = Readonly<{
  identity: AgentProductIdentity;
  task: AgentTaskRecord['spec'];
  run: AgentRunSnapshot['run'];
  cleanupState: AgentRunSnapshot['cleanupState'];
  budgetLedger: AgentRunSnapshot['budgetLedger'];
  context?: AgentContextPack;
  proposal?: AgentActionProposal;
  planning?: AgentProposalPlanningReceipt;
  preview?: AgentProposalPreview;
  proposalReview?: AgentProductProposalReview;
  approval?: AgentApprovalDecision;
  mutations: readonly AgentWorkspaceMutationReceipt[];
  verificationBindings: readonly AgentCommittedVerificationPlanBinding[];
  verificationClosures: readonly AgentVerificationClosureReceipt[];
  repairRounds: readonly AgentRepairRoundReceipt[];
  runtime: AgentProductRuntimeSummary;
  diagnostics: readonly AgentProductDiagnostic[];
  timeline: readonly AgentProductTimelineEntry[];
  commands: readonly AgentRunUserCommand[];
  availableActions: readonly AgentProductAction[];
  audit?: Readonly<{
    fromSequence: number;
    toSequence: number;
    eventCount: number;
    chainRootDigest: CanonicalDigest;
    chainHeadDigest: CanonicalDigest;
    exportDigest: CanonicalDigest;
  }>;
  viewDigest: CanonicalDigest;
}>;

export type AgentProductApprovalContext = Pick<
  AgentApprovalPreflightContext,
  'decision' | 'proposal' | 'preview' | 'planning'
>;
