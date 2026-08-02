import type {
  AgentAuditEventFamily,
  AgentCapabilityGrantRef,
  AgentJsonValue,
  AgentPrincipalRef,
  AgentRun,
  AgentRunOutcome,
  AgentRunPhase,
  AgentTaskMode,
  AgentTaskSpec,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type { AgentBudgetLedgerState } from '../usage/agentBudgetLedger';

export type AgentControlIssue = Readonly<{
  code: 'AI-6001' | 'AI-6002' | 'AI-6003' | 'AI-6004' | 'AI-6013' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentTaskLineage = Readonly<{
  parentTaskId?: string;
  reason: 'initial' | 'intent-changed' | 'scope-changed' | 'policy-changed';
}>;

export type AgentTaskRecord = Readonly<{
  spec: AgentTaskSpec;
  lineage: AgentTaskLineage;
  taskDigest: CanonicalDigest;
}>;

export type AgentRunAttemptReason =
  'initial' | 'retry' | 'process-recovery' | 'provider-disconnect';

export type AgentRunAttempt = Readonly<{
  attemptId: string;
  attempt: number;
  generation: number;
  reason: AgentRunAttemptReason;
  parentAttemptId?: string;
  startedAt: Instant;
  completedAt?: Instant;
  outcome?: AgentRunOutcome | 'superseded';
  failureDigest?: CanonicalDigest;
  attemptDigest: CanonicalDigest;
}>;

export type AgentRunPendingOperationKind =
  | 'model-stream'
  | 'tool-execution'
  | 'awaiting-approval'
  | 'commit-ack'
  | 'verification';

export type AgentRunPendingOperationState =
  'started' | 'reconciliation-required' | 'settled' | 'cancelled';

export type AgentRunPendingOperation = Readonly<{
  operationId: string;
  kind: AgentRunPendingOperationKind;
  idempotencyKey: string;
  requestDigest: CanonicalDigest;
  generation: number;
  state: AgentRunPendingOperationState;
  callbackAuthority: 'active' | 'revoked';
  startedAt: Instant;
  settledAt?: Instant;
  resultDigest?: CanonicalDigest;
  operationDigest: CanonicalDigest;
}>;

export type AgentRunCleanupState =
  'not-required' | 'pending' | 'clean' | 'residual';

export type AgentRunProcessedEvent = Readonly<{
  eventId: string;
  idempotencyKey: string;
  type: AgentControlEventType;
  requestDigest: CanonicalDigest;
  eventDigest: CanonicalDigest;
}>;

export type AgentRunSnapshot = Readonly<{
  run: AgentRun;
  taskDigest: CanonicalDigest;
  cursor: number;
  callbackAuthority: 'active' | 'revoked';
  attempts: readonly AgentRunAttempt[];
  budgetLedger: AgentBudgetLedgerState;
  pendingOperation?: AgentRunPendingOperation;
  cleanupState: AgentRunCleanupState;
  processedEvents: readonly AgentRunProcessedEvent[];
  snapshotDigest: CanonicalDigest;
}>;

export type AgentRunSuccessProof =
  | Readonly<{
      mode: 'explain';
      answerDigest: CanonicalDigest;
      groundingDigests: readonly CanonicalDigest[];
    }>
  | Readonly<{
      mode: 'plan';
      planDigest: CanonicalDigest;
    }>
  | Readonly<{
      mode: 'propose';
      proposalDigest: CanonicalDigest;
      previewDigest: CanonicalDigest;
    }>
  | Readonly<{
      mode: 'apply';
      proposalDigest: CanonicalDigest;
      approvalDigest: CanonicalDigest;
      transactionDigest: CanonicalDigest;
      commitAckDigest: CanonicalDigest;
      committedPlanDigest: CanonicalDigest;
      actualPlanDigest: CanonicalDigest;
      planCompatibility: 'exact' | 'compatible';
      verificationClosureDigest: CanonicalDigest;
      verificationClosureOutcome: 'satisfied';
    }>;

export type AgentControlEventType =
  | 'run.created'
  | 'run.started'
  | 'run.phase-changed'
  | 'run.cancel-requested'
  | 'run.timeout-requested'
  | 'run.retry-started'
  | 'run.recovery-started'
  | 'run.terminal'
  | 'model.started'
  | 'model.completed'
  | 'model.failed'
  | 'tool.authorized'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.cancelled'
  | 'tool.rejected'
  | 'budget.reserved'
  | 'budget.settled'
  | 'budget.reconciled'
  | 'cleanup.acknowledged'
  | 'callback.rejected';

export type AgentControlEventData = Readonly<{
  phase?: AgentRunPhase;
  outcome?: AgentRunOutcome;
  attempt?: AgentRunAttempt;
  operation?: AgentRunPendingOperation;
  reservationId?: string;
  budgetLedger?: AgentBudgetLedgerState;
  successProof?: AgentRunSuccessProof;
  cleanupState?: AgentRunCleanupState;
  callbackGeneration?: number;
  receiptDigest?: CanonicalDigest;
  diagnosticCode?: string;
  reason?: string;
}>;

export type AgentControlEvent = Readonly<{
  eventId: string;
  taskId: string;
  runId: string;
  generation: number;
  sequence: number;
  family: AgentAuditEventFamily;
  type: AgentControlEventType;
  producer: AgentPrincipalRef;
  occurredAt: Instant;
  previousEventDigest?: CanonicalDigest;
  idempotencyKey: string;
  requestDigest: CanonicalDigest;
  payloadDigest: CanonicalDigest;
  policyDigest: CanonicalDigest;
  grantRef: AgentCapabilityGrantRef;
  data: AgentControlEventData;
  sanitizedPayload: AgentJsonValue;
  eventDigest: CanonicalDigest;
}>;

export type AgentRunTransitionResult =
  | Readonly<{
      accepted: true;
      replayed: boolean;
      state: AgentRunSnapshot;
      event: AgentControlEvent;
    }>
  | Readonly<{
      accepted: false;
      auditOnly: boolean;
      state: AgentRunSnapshot;
      issues: readonly AgentControlIssue[];
    }>;

export type AgentClaimLease = Readonly<{
  leaseId: string;
  holderId: string;
  runId: string;
  generation: number;
  acquiredAt: Instant;
  expiresAt: Instant;
  leaseDigest: CanonicalDigest;
}>;

export type AgentRecoveryPosition =
  | 'model-stream'
  | 'tool-execute'
  | 'awaiting-approval'
  | 'commit-ack'
  | 'verification';

export type AgentRecoveryAction =
  | 'restart-model-invocation'
  | 'reconcile-tool-call'
  | 'resume-approval-wait'
  | 'reconcile-commit-ack'
  | 'resume-verification';

export type AgentRecoveryReceipt = Readonly<{
  taskId: string;
  runId: string;
  fromGeneration: number;
  toGeneration: number;
  position: AgentRecoveryPosition;
  action: AgentRecoveryAction;
  settledReservationIds: readonly string[];
  operationId?: string;
  recoveredAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentAuditExport = Readonly<{
  taskId: string;
  runId: string;
  fromSequence: number;
  toSequence: number;
  eventCount: number;
  events: readonly AgentControlEvent[];
  chainRootDigest: CanonicalDigest;
  chainHeadDigest: CanonicalDigest;
  exportedAt: Instant;
  exportDigest: CanonicalDigest;
}>;

export type AgentControlFact =
  | Readonly<{ factType: 'task-record'; value: AgentTaskRecord }>
  | Readonly<{ factType: 'run-snapshot'; value: AgentRunSnapshot }>
  | Readonly<{ factType: 'run-event'; value: AgentControlEvent }>
  | Readonly<{ factType: 'audit-export'; value: AgentAuditExport }>;

export type AgentModeSuccessRequirement = Readonly<{
  mode: AgentTaskMode;
  description: string;
}>;
