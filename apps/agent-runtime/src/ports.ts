import type {
  AgentActionProposal,
  AgentClaimLease,
  AgentControlEvent,
  AgentProposalPlanningReceipt,
  AgentProposalPreview,
  AgentRunSnapshot,
  AgentTaskRecord,
  AgentProductView,
  AgentWorkspaceRevisionVector,
  AgentTaskOutput,
  AgentWorkspaceMutationReceipt,
  AgentCommittedVerificationPlanBinding,
  AgentVerificationClosureReceipt,
} from '@prodivix/ai';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { WorkspaceOperationCommitRequest } from '@prodivix/workspace-sync';
import type { WorkspaceAgentRepairFailure } from '@prodivix/workspace-sync';
import type {
  VerificationRunSnapshot,
  VerificationRunEvent,
  VerificationEvidence,
  VerificationEvidenceVerifiedView,
  VerificationPlan,
  VerificationClosure,
} from '@prodivix/verification';
import type {
  AgentRuntimeAdmissionChallenge,
  AgentRuntimeAdmissionResult,
} from '#src/admission.js';

export type RuntimeTask = Readonly<{
  workspaceId: string;
  task: AgentTaskRecord;
  run?: AgentRunSnapshot;
}>;
export type RuntimeAuthority = Readonly<{
  leaseId: string;
  holderId: string;
  generation: number;
  observedAt: string;
}>;
export type RuntimeDispatchClaim = Readonly<{
  operationId: string;
  leaseId: string;
  holderId: string;
  generation: number;
  expiresAt: string;
  dispatchState: string;
  reconciliationRequired: boolean;
  replayed: boolean;
}>;

/** Ordinary Task persistence ports. Model execution never acquires evaluation authority. */
export interface AgentRuntimePorts {
  publishRepairFailure(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      closureReceiptId: string;
      closure: VerificationClosure;
    },
    signal?: AbortSignal
  ): Promise<void>;
  publishTaskOutput(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      output: AgentTaskOutput;
    },
    signal?: AbortSignal
  ): Promise<void>;
  listTasks(signal?: AbortSignal): Promise<readonly RuntimeTask[]>;
  listAdmissionChallenges(
    signal?: AbortSignal
  ): Promise<readonly AgentRuntimeAdmissionChallenge[]>;
  completeAdmission(
    input: AgentRuntimeAdmissionResult,
    signal?: AbortSignal
  ): Promise<void>;
  readContext(
    input: RuntimeTask,
    signal?: AbortSignal
  ): Promise<
    Readonly<{
      task: AgentTaskRecord;
      workspace: WorkspaceSnapshot;
      admission?: AgentRuntimeAdmissionResult;
      repair?: WorkspaceAgentRepairFailure;
    }>
  >;
  createRun(
    input: {
      workspaceId: string;
      snapshot: AgentRunSnapshot;
      event: AgentControlEvent;
    },
    signal?: AbortSignal
  ): Promise<AgentRunSnapshot>;
  startRun(
    input: {
      workspaceId: string;
      previous: AgentRunSnapshot;
      snapshot: AgentRunSnapshot;
      event: AgentControlEvent;
    },
    signal?: AbortSignal
  ): Promise<AgentRunSnapshot>;
  consumeCancellation(
    input: {
      workspaceId: string;
      commandId: string;
      previous: AgentRunSnapshot;
      snapshot: AgentRunSnapshot;
      event: AgentControlEvent;
    },
    signal?: AbortSignal
  ): Promise<AgentRunSnapshot>;
  claimLease(
    input: {
      workspaceId: string;
      runId: string;
      leaseId: string;
      holderId: string;
      generation: number;
      observedAt: string;
      expiresAt: string;
    },
    signal?: AbortSignal
  ): Promise<AgentClaimLease>;
  renewLease(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      expiresAt: string;
    },
    signal?: AbortSignal
  ): Promise<AgentClaimLease>;
  transition(
    input: {
      workspaceId: string;
      authority: RuntimeAuthority;
      previous: AgentRunSnapshot;
      snapshot: AgentRunSnapshot;
      event: AgentControlEvent;
    },
    signal?: AbortSignal
  ): Promise<AgentRunSnapshot>;
  claimDispatch(
    input: {
      workspaceId: string;
      runId: string;
      operationId: string;
      authority: RuntimeAuthority;
      expiresAt: string;
    },
    signal?: AbortSignal
  ): Promise<RuntimeDispatchClaim>;
  markDispatched(
    input: {
      workspaceId: string;
      runId: string;
      claim: RuntimeDispatchClaim;
      observedAt: string;
    },
    signal?: AbortSignal
  ): Promise<void>;
  publishProposal(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      proposal: AgentActionProposal;
    },
    signal?: AbortSignal
  ): Promise<void>;
  publishPreview(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      planning: AgentProposalPlanningReceipt;
      preview: AgentProposalPreview;
    },
    signal?: AbortSignal
  ): Promise<void>;
  readProduct(
    input: { workspaceId: string; runId: string },
    signal?: AbortSignal
  ): Promise<
    Readonly<{
      view: AgentProductView;
      currentRevision: AgentWorkspaceRevisionVector;
      actorAuthorized: boolean;
    }>
  >;
  commitWorkspace(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      receipt: AgentWorkspaceMutationReceipt;
      request: WorkspaceOperationCommitRequest;
    },
    signal?: AbortSignal
  ): Promise<unknown>;
  publishMutation(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      receipt: AgentWorkspaceMutationReceipt;
    },
    signal?: AbortSignal
  ): Promise<void>;
  createVerificationRun(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      request: VerificationRunSnapshot;
      plan?: VerificationPlan;
    },
    signal?: AbortSignal
  ): Promise<VerificationRunSnapshot>;
  readVerificationRun(
    input: { workspaceId: string; runId: string; verificationRunId: string },
    signal?: AbortSignal
  ): Promise<VerificationRunSnapshot>;
  appendVerificationEvent(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      verificationRunId: string;
      event: VerificationRunEvent;
    },
    signal?: AbortSignal
  ): Promise<VerificationRunSnapshot>;
  readVerificationEvidence(
    input: {
      workspaceId: string;
      runId: string;
      verificationRunId: string;
      evidenceId: string;
    },
    signal?: AbortSignal
  ): Promise<VerificationEvidence>;
  readVerificationView(
    input: {
      workspaceId: string;
      runId: string;
      workspaceRevision: number;
      planDigest: string;
    },
    signal?: AbortSignal
  ): Promise<VerificationEvidenceVerifiedView>;
  publishVerificationBinding(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      binding: AgentCommittedVerificationPlanBinding;
    },
    signal?: AbortSignal
  ): Promise<void>;
  publishVerificationClosure(
    input: {
      workspaceId: string;
      runId: string;
      authority: RuntimeAuthority;
      receipt: AgentVerificationClosureReceipt;
    },
    signal?: AbortSignal
  ): Promise<void>;
}
