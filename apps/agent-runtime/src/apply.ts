import {
  digestAgentCanonicalValue,
  transitionAgentRunPhase,
  type AgentApprovalPreflightContext,
  type AgentControlCommandIdentity,
  type AgentRunSnapshot,
  type AgentRunTransitionResult,
  type AgentTaskRecord,
  type AgentWorkspaceMutationReceipt,
} from '@prodivix/ai';
import {
  createWorkspaceAgentApplySuccessProof,
  prepareWorkspaceAgentCommit,
  reconcileWorkspaceAgentCommit,
  createWorkspaceAgentRepairFailure,
  type WorkspaceAgentProposalProjection,
  type WorkspaceOutboxEntry,
  type WorkspaceAgentRepairFailure,
} from '@prodivix/workspace-sync';
import { type WorkspaceSnapshot } from '@prodivix/workspace';
import type {
  VerificationPlan,
  VerificationRunSnapshot,
} from '@prodivix/verification';
import type { AgentRuntimeBinding } from '#src/config.js';
import type { AgentRuntimePorts, RuntimeAuthority } from '#src/ports.js';
import type { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import type { AgentRuntimeVerificationDriver } from '#src/verificationDriver.js';
import { prepareAgentRuntimePreview } from '#src/composition.js';
import {
  checkAgentRuntimeG3Budget,
  reserveAgentRuntimeG3Budget,
} from '#src/g3Budget.js';
import { verifyAgentRuntimeMutation } from '#src/verifyMutation.js';
import { continueAgentRuntimeRollback } from '#src/rollback.js';

export type AgentRuntimeProposalRecord = Readonly<{
  historicalRun: AgentRunSnapshot;
  projection: WorkspaceAgentProposalProjection;
}>;
type CommitRecord = Readonly<{
  entry: WorkspaceOutboxEntry;
  receipt: AgentWorkspaceMutationReceipt;
}>;
type AckRecord = Readonly<{
  snapshot: WorkspaceSnapshot;
  receipt: AgentWorkspaceMutationReceipt;
}>;
export type AgentRuntimeVerificationRecord = Readonly<{
  plan: VerificationPlan;
  runs: readonly VerificationRunSnapshot[];
  startedAt: string;
}>;
const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent.runtime',
});

/** Resumes exact, approved public-owner operations; uncertainty always retains the original Outbox request. */
export const continueAgentRuntimeApply = async (input: {
  task: AgentTaskRecord;
  workspace: WorkspaceSnapshot;
  binding: AgentRuntimeBinding;
  repair?: WorkspaceAgentRepairFailure;
  ports: AgentRuntimePorts;
  journal: AgentRuntimeFileJournal;
  driver: AgentRuntimeVerificationDriver;
  state: () => AgentRunSnapshot;
  authority: () => RuntimeAuthority;
  command: (label: string) => AgentControlCommandIdentity;
  persist: (result: AgentRunTransitionResult) => Promise<void>;
  terminal: (
    outcome: 'blocked' | 'failed' | 'infrastructure-error',
    code: string
  ) => Promise<string>;
  succeed: (
    proof: Extract<
      import('@prodivix/ai').AgentRunSuccessProof,
      { mode: 'apply' }
    >
  ) => Promise<string | void>;
  now: () => string;
  signal?: AbortSignal;
}): Promise<string> => {
  const { task, binding, ports, journal, driver, signal } = input;
  const runId = input.state().run.runId;
  const workspaceId = task.spec.workspaceId;
  const product = await ports.readProduct({ workspaceId, runId }, signal);
  const { proposal, planning, preview, approval: decision } = product.view;
  if (!proposal || !planning || !preview)
    return input.terminal('blocked', 'AI-7006');
  const saved = await journal.read<AgentRuntimeProposalRecord>(
    'proposal',
    proposal.proposalId
  );
  if (!saved) return input.terminal('blocked', 'AI-7006');
  const projection = prepareAgentRuntimePreview({
    task,
    run: saved.historicalRun,
    workspace: saved.projection.actionPlan.baseSnapshot,
    binding,
    proposal,
    at: input.now(),
    frozenPlanning: {
      plannedAt: planning.plannedAt,
      expiresAt: planning.expiresAt,
    },
    ...(input.repair ? { repair: input.repair } : {}),
  });
  if (
    digestAgentCanonicalValue(projection) !==
      digestAgentCanonicalValue(saved.projection) ||
    projection.planning.planningDigest !== planning.planningDigest ||
    projection.preview.previewDigest !== preview.previewDigest
  )
    return input.terminal('blocked', 'AI-7006');
  if (!decision) return 'awaiting-approval';
  if (decision.decision !== 'approved')
    return input.terminal('blocked', 'AI-7004');
  const approval: AgentApprovalPreflightContext = {
    proposal,
    planning,
    preview,
    decision,
    grant: binding.grant,
    policy: binding.policy.layers.find(({ kind }) => kind === 'project')!
      .policy,
    currentRevision: product.currentRevision,
    actorAuthorizationDigest:
      binding.policy.evaluation.actorAuthorizationDigest,
    expectedActorAuthorizationDigest:
      binding.policy.evaluation.actorAuthorizationDigest,
    actorAuthorized: product.actorAuthorized,
    grantUseCount: 0,
    at: input.now(),
  };
  let ack = await journal.read<AckRecord>('commit-ack', proposal.proposalId);
  if (!ack) {
    let started = await journal.read<CommitRecord>(
      'commit',
      proposal.proposalId
    );
    if (!started) {
      // Missing driver admission must block before the first durable authoring request.
      try {
        await driver.preflight(
          {
            binding,
            plan: projection.verificationPlan,
            task,
            workspace: projection.projectedTargetSnapshot,
            agentRunId: runId,
            authority: input.authority(),
          },
          signal
        );
      } catch {
        return input.terminal('blocked', 'AI-6001');
      }
      if (
        !(await reserveAgentRuntimeG3Budget({
          ...input,
          plan: projection.verificationPlan,
          reservationKey: proposal.proposalId,
          transactions: 1,
        }))
      )
        return input.terminal('blocked', 'AI-6002');

      const prepared = prepareWorkspaceAgentCommit({
        projection,
        approval,
        currentSnapshot: input.workspace,
        producer,
        receiptId: `${runId}.commit.started`,
        startedAt: input.now(),
        now: Date.parse(input.now()),
      });
      if (prepared.status !== 'ready')
        return input.terminal('blocked', prepared.issues[0]?.code ?? 'AI-7006');
      await journal.outbox().enqueue(prepared.outboxEntry);
      started = await journal.put('commit', proposal.proposalId, {
        entry: prepared.outboxEntry,
        receipt: prepared.receipt,
      });
    }
    const entry = await journal.outbox().get(started.entry.id);
    if (
      !entry ||
      digestAgentCanonicalValue(entry) !==
        digestAgentCanonicalValue(started.entry)
    )
      return input.terminal('blocked', 'AI-7006');
    if (input.state().run.phase === 'awaiting-approval')
      await input.persist(
        transitionAgentRunPhase(task, input.state(), {
          ...input.command('committing'),
          phase: 'committing',
        })
      );
    // Retry this same exact request after network/ACK uncertainty. Atomic Commit owns idempotency and current authority.
    const response = await ports.commitWorkspace(
      {
        workspaceId,
        runId,
        authority: input.authority(),
        receipt: started.receipt,
        request: entry.request,
      },
      signal
    );
    const reconciled = reconcileWorkspaceAgentCommit({
      outboxEntry: entry,
      startedReceipt: started.receipt,
      response,
      receiptId: `${runId}.commit.acknowledged`,
      completedAt: input.now(),
    });
    if (reconciled.status !== 'acknowledged')
      return 'commit-reconciliation-required';
    ack = await journal.put('commit-ack', proposal.proposalId, {
      snapshot: reconciled.snapshot,
      receipt: reconciled.receipt,
    });
  }
  await ports.publishMutation(
    { workspaceId, runId, authority: input.authority(), receipt: ack.receipt },
    signal
  );
  if (input.state().run.phase === 'committing')
    await input.persist(
      transitionAgentRunPhase(task, input.state(), {
        ...input.command('verifying'),
        phase: 'verifying',
      })
    );
  const failed = await journal.read<WorkspaceAgentRepairFailure>(
    'repair-failure',
    runId
  );
  if (failed) {
    await ports.publishRepairFailure(
      {
        workspaceId,
        runId,
        authority: input.authority(),
        closureReceiptId: failed.closureReceipt.receiptId,
        closure: failed.closure,
      },
      signal
    );
    if (
      decision.rollbackAuthorization === 'on-unsatisfied-closure' &&
      failed.closure.verdict === 'unsatisfied'
    )
      return continueAgentRuntimeRollback({
        ...input,
        projection,
        approval,
        ack,
        failure: failed,
      });
    return input.terminal('failed', 'AI-6001');
  }
  const verified = await verifyAgentRuntimeMutation({
    ...input,
    projection,
    approval,
    ack,
    ...(input.repair
      ? { regressionRequirements: input.repair.counterexamples.requirements }
      : {}),
  });
  if (verified.status === 'pending') return verified.reason;
  if (verified.status === 'blocked')
    return input.terminal(verified.outcome, verified.code);
  if (verified.receipt.verdict !== 'satisfied') {
    const failure = createWorkspaceAgentRepairFailure({
      parentTask: task,
      plan: verified.plan,
      closure: verified.closure,
      closureReceipt: verified.receipt,
      evidence: verified.evidence,
    });
    await journal.put('repair-failure', runId, failure);
    await ports.publishRepairFailure(
      {
        workspaceId,
        runId,
        authority: input.authority(),
        closureReceiptId: failure.closureReceipt.receiptId,
        closure: failure.closure,
      },
      signal
    );
    if (
      decision.rollbackAuthorization === 'on-unsatisfied-closure' &&
      failure.closure.verdict === 'unsatisfied'
    )
      return continueAgentRuntimeRollback({
        ...input,
        projection,
        approval,
        ack,
        failure,
      });
    return input.terminal('failed', 'AI-6001');
  }
  const proof = createWorkspaceAgentApplySuccessProof({
    projection,
    approval,
    mutationReceipt: ack.receipt,
    binding: verified.binding,
    closureReceipt: verified.receipt,
  });
  if (proof.status !== 'ready')
    return input.terminal('failed', proof.issues[0]?.code ?? 'AI-6001');
  if (
    signal?.aborted ||
    !checkAgentRuntimeG3Budget({
      ...input,
      plan: verified.plan,
      reservationKey: proposal.proposalId,
      transactions: 1,
    })
  )
    return input.terminal('blocked', 'AI-6002');
  return (await input.succeed(proof.value)) ?? 'succeeded';
};
