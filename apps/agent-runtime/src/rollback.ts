import {
  digestAgentCanonicalValue,
  sameAgentWorkspaceRevision,
  type AgentApprovalPreflightContext,
  type AgentWorkspaceMutationReceipt,
} from '@prodivix/ai';
import {
  applyWorkspaceTransaction,
  createWorkspaceVerificationImpactSet,
  createAgentWorkspaceRevisionFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  prepareWorkspaceAgentRollback,
  reconcileWorkspaceAgentCommit,
  retainsWorkspaceAgentRollbackVerificationPlan,
  projectWorkspaceAgentCommittedSnapshot,
  type WorkspaceAgentProposalProjection,
  type WorkspaceAgentRepairFailure,
  type WorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import { createVerificationPlan } from '@prodivix/verification';
import type { continueAgentRuntimeApply } from '#src/apply.js';
import { reserveAgentRuntimeG3Budget } from '#src/g3Budget.js';
import { verifyAgentRuntimeMutation } from '#src/verifyMutation.js';

type RollbackCommit = Readonly<{
  entry: WorkspaceOutboxEntry;
  receipt: AgentWorkspaceMutationReceipt;
}>;
type RollbackAck = Readonly<{
  snapshot: WorkspaceSnapshot;
  receipt: AgentWorkspaceMutationReceipt;
}>;
type RollbackInput = Parameters<typeof continueAgentRuntimeApply>[0] &
  Readonly<{
    projection: WorkspaceAgentProposalProjection;
    approval: AgentApprovalPreflightContext;
    ack: RollbackAck;
    failure: WorkspaceAgentRepairFailure;
  }>;

/** The original approval authorizes only its exact reverse after an unsatisfied committed Closure. */
export const continueAgentRuntimeRollback = async (
  input: RollbackInput
): Promise<string> => {
  const {
    task,
    binding,
    ports,
    journal,
    driver,
    projection,
    approval,
    failure,
    signal,
  } = input;
  const workspaceId = task.spec.workspaceId;
  const runId = input.state().run.runId;
  const proposalId = projection.planning.proposalId;
  if (
    approval.decision.rollbackAuthorization !== 'on-unsatisfied-closure' ||
    failure.closure.verdict !== 'unsatisfied'
  )
    return input.terminal('failed', 'AI-6001');
  if (
    failure.parentTask.taskDigest !== task.taskDigest ||
    failure.closureReceipt.runId !== runId ||
    failure.closureReceipt.planDigest !== failure.plan.planDigest ||
    failure.closureReceipt.closureDigest !== failure.closure.closureDigest ||
    failure.closureReceipt.targetRevision.workspaceRev !==
      input.ack.snapshot.workspaceRev
  )
    return input.terminal('blocked', 'AI-7006');
  let ack = await journal.read<RollbackAck>('rollback-ack', proposalId);
  if (!ack) {
    let started = await journal.read<RollbackCommit>('rollback', proposalId);
    if (!started) {
      const current = await ports.readContext(
        { workspaceId, task, run: input.state() },
        signal
      );
      const revision = createAgentWorkspaceRevisionFromSnapshot(
        current.workspace
      );
      if (
        !input.ack.receipt.targetRevision ||
        !sameAgentWorkspaceRevision(revision, input.ack.receipt.targetRevision)
      )
        return input.terminal('blocked', 'AI-7005');
      const product = await ports.readProduct({ workspaceId, runId }, signal);
      const rollbackApproval = {
        ...approval,
        currentRevision: revision,
        actorAuthorized: product.actorAuthorized,
        at: input.now(),
      };
      const prepared = prepareWorkspaceAgentRollback({
        projection,
        approval: rollbackApproval,
        commitReceipt: input.ack.receipt,
        currentSnapshot: current.workspace,
        rollbackPreflight: {
          trigger: 'unsatisfied-closure',
          actorAuthorized: product.actorAuthorized,
          hasInterveningAuthoring: false,
          hasExternalSideEffects: false,
          at: input.now(),
        },
        producer: { kind: 'service', principalId: 'agent.runtime' },
        receiptId: `${runId}.rollback.started`,
        startedAt: input.now(),
        now: Date.parse(input.now()),
      });
      if (prepared.status !== 'ready')
        return input.terminal('blocked', prepared.issues[0]?.code ?? 'AI-8004');
      const projected = applyWorkspaceTransaction(
        current.workspace,
        projection.actionPlan.reverseTransaction
      );
      if (!projected.ok) return input.terminal('blocked', 'AI-8004');
      const projectedTarget = projectWorkspaceAgentCommittedSnapshot(
        current.workspace,
        projected.snapshot
      );
      const impact = createWorkspaceVerificationImpactSet({
        before: current.workspace,
        after: projectedTarget,
        operationIds: [prepared.receipt.operationId],
        frameworkTargets: [
          ...new Set(
            binding.verification!.checks.flatMap(
              ({ frameworkTargets }) => frameworkTargets
            )
          ),
        ],
        runtimeZones: ['browser', 'server'],
      });
      if (impact.status !== 'ready')
        return input.terminal('blocked', 'AI-6001');
      const planned = createVerificationPlan({
        ...binding.verification!,
        impactSet: impact.impactSet,
      });
      if (
        planned.status !== 'ready' ||
        !retainsWorkspaceAgentRollbackVerificationPlan(
          projection.verificationPlan,
          planned.plan
        )
      )
        return input.terminal('blocked', 'AI-7006');
      const budget = {
        task,
        state: input.state,
        plan: planned.plan,
        binding,
        persist: input.persist,
        command: input.command,
        now: input.now,
        reservationKey: proposalId + '.rollback',
        transactions: 1,
      };
      try {
        await driver.preflight(
          {
            binding,
            plan: planned.plan,
            task,
            workspace: projectedTarget,
            agentRunId: runId,
            authority: input.authority(),
          },
          signal
        );
      } catch {
        return input.terminal('blocked', 'AI-6001');
      }
      if (!(await reserveAgentRuntimeG3Budget(budget)))
        return input.terminal('blocked', 'AI-6002');
      await journal.outbox().enqueue(prepared.outboxEntry);
      started = await journal.put('rollback', proposalId, {
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
      receiptId: `${runId}.rollback.acknowledged`,
      completedAt: input.now(),
    });
    if (reconciled.status !== 'acknowledged')
      return 'rollback-reconciliation-required';
    ack = await journal.put('rollback-ack', proposalId, {
      snapshot: reconciled.snapshot,
      receipt: reconciled.receipt,
    });
  }
  await ports.publishMutation(
    { workspaceId, runId, authority: input.authority(), receipt: ack.receipt },
    signal
  );
  const verified = await verifyAgentRuntimeMutation({
    task,
    binding,
    ports,
    journal,
    driver,
    projection,
    approval,
    ack,
    state: input.state,
    authority: input.authority,
    now: input.now,
    signal,
    persist: input.persist,
    command: input.command,
    regressionRequirements: failure.counterexamples.requirements,
  });
  if (verified.status === 'pending') return verified.reason;
  if (verified.status === 'blocked')
    return input.terminal(verified.outcome, verified.code);
  await journal.put('rollback-closure', proposalId, {
    plan: verified.plan,
    receipt: verified.receipt,
    closure: verified.closure,
  });
  return input.terminal(
    'failed',
    verified.closure.verdict === 'satisfied' ? 'AI-6001' : 'AI-8004'
  );
};
