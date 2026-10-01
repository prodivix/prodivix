import {
  digestAgentCanonicalValue,
  type AgentApprovalPreflightContext,
  type AgentCommittedVerificationPlanBinding,
  type AgentRepairRegressionRequirement,
  type AgentRunSnapshot,
  type AgentTaskRecord,
  type AgentVerificationClosureReceipt,
  type AgentWorkspaceMutationReceipt,
  type AgentControlCommandIdentity,
  type AgentRunTransitionResult,
} from '@prodivix/ai';
import {
  createWorkspaceVerificationImpactSet,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceAgentVerificationPlanBinding,
  retainsWorkspaceAgentRollbackVerificationPlan,
  evaluateWorkspaceAgentVerificationClosure,
  type WorkspaceAgentProposalProjection,
} from '@prodivix/workspace-sync';
import {
  createVerificationPlan,
  createVerificationRunSnapshot,
  createVerificationRunEvent,
  evaluateVerificationClosure,
  digestVerificationValue,
  uniqueVerificationText,
  type EvaluateVerificationClosureInput,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationPlan,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import type { AgentRuntimeBinding } from '#src/config.js';
import type { AgentRuntimePorts, RuntimeAuthority } from '#src/ports.js';
import type { AgentRuntimeFileJournal } from '#src/fileJournal.js';
import type { AgentRuntimeVerificationDriver } from '#src/verificationDriver.js';
import type { AgentRuntimeVerificationRecord } from '#src/apply.js';
import {
  checkAgentRuntimeG3ArtifactBudget,
  checkAgentRuntimeG3Budget,
  reserveAgentRuntimeG3Budget,
  settleAgentRuntimeG3Budget,
} from '#src/g3Budget.js';
import { AgentRuntimeServiceError } from '#src/transport.js';

export type AgentRuntimeMutationVerificationResult =
  | Readonly<{
      status: 'pending';
      reason: 'verifying' | 'verification-timeout-cleanup-required';
    }>
  | Readonly<{
      status: 'blocked';
      outcome: 'blocked' | 'infrastructure-error';
      code: string;
    }>
  | Readonly<{
      status: 'closed';
      plan: VerificationPlan;
      runs: readonly VerificationRunSnapshot[];
      evidence: readonly VerificationEvidence[];
      closure: VerificationClosure;
      receipt: AgentVerificationClosureReceipt;
      binding: AgentCommittedVerificationPlanBinding;
    }>;

/** Commit and rollback use the same public G3 Run, promoted Evidence and Closure pipeline. */
export const verifyAgentRuntimeMutation = async (input: {
  task: AgentTaskRecord;
  binding: AgentRuntimeBinding;
  ports: AgentRuntimePorts;
  journal: AgentRuntimeFileJournal;
  driver: AgentRuntimeVerificationDriver;
  projection: WorkspaceAgentProposalProjection;
  approval: AgentApprovalPreflightContext;
  ack: Readonly<{
    snapshot: WorkspaceSnapshot;
    receipt: AgentWorkspaceMutationReceipt;
  }>;
  state: () => AgentRunSnapshot;
  authority: () => RuntimeAuthority;
  now: () => string;
  signal?: AbortSignal;
  persist: (result: AgentRunTransitionResult) => Promise<void>;
  command: (label: string) => AgentControlCommandIdentity;
  regressionRequirements?: readonly AgentRepairRegressionRequirement[];
}): Promise<AgentRuntimeMutationVerificationResult> => {
  const {
    task,
    binding,
    ports,
    journal,
    driver,
    projection,
    approval,
    ack,
    signal,
  } = input;
  const runId = input.state().run.runId;
  const workspaceId = task.spec.workspaceId;
  const proposal = approval.proposal;
  const suffix = ack.receipt.kind === 'rollback' ? '.rollback' : '';
  const mutationKey = proposal.proposalId + suffix;
  const producer = { kind: 'service' as const, principalId: 'agent.runtime' };
  const budgetInput = (plan: VerificationPlan) => ({
    task,
    state: input.state,
    plan,
    binding,
    persist: input.persist,
    command: input.command,
    now: input.now,
    reservationKey: mutationKey,
    transactions: 1,
  });
  let verification = await journal.read<AgentRuntimeVerificationRecord>(
    'verification',
    mutationKey
  );
  if (!verification) {
    const impact = createWorkspaceVerificationImpactSet({
      before:
        ack.receipt.kind === 'rollback'
          ? projection.projectedTargetSnapshot
          : projection.actionPlan.baseSnapshot,
      after: ack.snapshot,
      operationIds: [ack.receipt.operationId],
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
      return { status: 'blocked', outcome: 'blocked', code: 'AI-6001' };
    const actual = createVerificationPlan({
      ...binding.verification!,
      impactSet: impact.impactSet,
    });
    // The current backend admission accepts exact projected/ACK plans. A compatible changed plan needs its owner proof port.
    if (
      actual.status !== 'ready' ||
      (ack.receipt.kind === 'rollback'
        ? !retainsWorkspaceAgentRollbackVerificationPlan(
            projection.verificationPlan,
            actual.plan
          )
        : actual.plan.planDigest !== projection.verificationPlan.planDigest)
    )
      return { status: 'blocked', outcome: 'blocked', code: 'AI-7006' };
    try {
      await driver.preflight(
        {
          binding,
          plan: actual.plan,
          task,
          workspace: ack.snapshot,
          agentRunId: runId,
          authority: input.authority(),
        },
        signal
      );
    } catch {
      return { status: 'blocked', outcome: 'blocked', code: 'AI-6001' };
    }
    const startedAt = input.now();
    const surfaces = [
      ...new Set(
        actual.plan.cells
          .filter(({ requirement }) => requirement === 'required')
          .map(({ surface }) => surface)
      ),
    ];
    const runs = surfaces.map((surface) => {
      const cells = actual.plan.cells.filter(
        (cell) => cell.surface === surface && cell.requirement === 'required'
      );
      const verificationRunId = `verification.runtime.${digestAgentCanonicalValue({ runId, planDigest: actual.plan.planDigest, surface }).slice(7)}`;
      return createVerificationRunSnapshot({
        runId: verificationRunId,
        plan: actual.plan,
        surface,
        scope: 'required',
        origin: 'cli',
        providerId: binding.verificationDriver!.providerId,
        selectedCellIds: cells.map(({ id }) => id),
        attemptIdByCellId: Object.fromEntries(
          cells.map(({ id }) => [
            id,
            `attempt.${digestAgentCanonicalValue({ verificationRunId, cellId: id }).slice(7)}`,
          ])
        ),
        createdAt: startedAt,
      });
    });
    verification = await journal.put('verification', mutationKey, {
      plan: actual.plan,
      runs,
      startedAt,
    });
  }
  const canonicalRuns: VerificationRunSnapshot[] = [];
  if (!(await reserveAgentRuntimeG3Budget(budgetInput(verification.plan)))) {
    let cleanupRequired = false;
    for (const initial of verification.runs) {
      try {
        const current = await ports.readVerificationRun(
          { workspaceId, runId, verificationRunId: initial.runId },
          signal
        );
        if (['queued', 'running', 'cancelling'].includes(current.status)) {
          cleanupRequired = true;
          await driver.cancel(
            {
              binding,
              task,
              plan: verification.plan,
              run: current,
              agentRunId: runId,
              authority: input.authority(),
            },
            signal
          );
        }
      } catch (cause) {
        if (
          !(cause instanceof AgentRuntimeServiceError) ||
          cause.status !== 404
        )
          throw cause;
      }
    }
    return cleanupRequired
      ? { status: 'pending', reason: 'verification-timeout-cleanup-required' }
      : { status: 'blocked', outcome: 'blocked', code: 'AI-6002' };
  }
  for (const initial of verification.runs) {
    const published = await ports.createVerificationRun(
      {
        workspaceId,
        runId,
        authority: input.authority(),
        request: initial,
        plan: verification.plan,
      },
      signal
    );
    if (
      published.runId !== initial.runId ||
      published.planDigest !== verification.plan.planDigest
    )
      return { status: 'blocked', outcome: 'blocked', code: 'AI-7006' };
    canonicalRuns.push(published);
  }
  const createdBinding = createWorkspaceAgentVerificationPlanBinding({
    projection,
    approval,
    mutationReceipt: ack.receipt,
    actualPlan: verification.plan,
    verificationRuns: canonicalRuns,
    bindingId: `${runId}.verification.binding${suffix}`,
    producer,
    boundAt: verification.startedAt,
    ...(input.regressionRequirements
      ? { regressionRequirements: input.regressionRequirements }
      : {}),
  });
  if (createdBinding.status !== 'ready')
    return {
      status: 'blocked',
      outcome: 'blocked',
      code: createdBinding.issues[0]?.code ?? 'AI-6001',
    };
  await ports.publishVerificationBinding(
    {
      workspaceId,
      runId,
      authority: input.authority(),
      binding: createdBinding.value,
    },
    signal
  );
  for (const initial of verification.runs) {
    if (!(await journal.read('driver-dispatch', initial.runId))) {
      await driver.dispatch(
        {
          binding,
          task,
          workspace: ack.snapshot,
          plan: verification.plan,
          run: initial,
          agentRunId: runId,
          authority: input.authority(),
        },
        signal
      );
      await journal.put('driver-dispatch', initial.runId, {
        runId: initial.runId,
        planDigest: verification.plan.planDigest,
      });
    }
  }
  const runs = await Promise.all(
    verification.runs.map(({ runId: verificationRunId }) =>
      ports.readVerificationRun(
        { workspaceId, runId, verificationRunId },
        signal
      )
    )
  );
  if (
    runs.some(({ status }) =>
      ['queued', 'running', 'cancelling'].includes(status)
    )
  ) {
    if (
      Date.parse(input.now()) - Date.parse(verification.startedAt) >=
        binding.verificationDriver!.maximumRuntimeMs ||
      !checkAgentRuntimeG3Budget(budgetInput(verification.plan))
    ) {
      for (const run of runs.filter(({ status }) =>
        ['queued', 'running', 'cancelling'].includes(status)
      ))
        await driver.cancel(
          {
            binding,
            task,
            plan: verification.plan,
            run,
            agentRunId: runId,
            authority: input.authority(),
          },
          signal
        );
      return {
        status: 'pending',
        reason: 'verification-timeout-cleanup-required',
      };
    }
    return { status: 'pending', reason: 'verifying' };
  }
  if (
    Date.parse(input.now()) - Date.parse(verification.startedAt) >=
    binding.verificationDriver!.maximumRuntimeMs
  )
    return {
      status: 'blocked',
      outcome: 'infrastructure-error',
      code: 'AI-6004',
    };
  const evidence = await Promise.all(
    runs.flatMap((run) =>
      run.cells.flatMap(({ evidenceId }) =>
        evidenceId
          ? [
              ports.readVerificationEvidence(
                {
                  workspaceId,
                  runId,
                  verificationRunId: run.runId,
                  evidenceId,
                },
                signal
              ),
            ]
          : []
      )
    )
  );
  const plan = verification.plan;
  if (
    !checkAgentRuntimeG3ArtifactBudget({ ...budgetInput(plan), evidence }) ||
    !checkAgentRuntimeG3Budget(budgetInput(plan))
  )
    return { status: 'blocked', outcome: 'blocked', code: 'AI-6002' };
  const view = await ports.readVerificationView(
    {
      workspaceId,
      runId,
      workspaceRevision: plan.targetRevision,
      planDigest: plan.planDigest,
    },
    signal
  );
  let closureInput: EvaluateVerificationClosureInput = {
    plan,
    evidence,
    verifiedEvidenceView: view,
    closureEvaluationInstant: view.closureEvaluationInstant,
    targetRevision: plan.targetRevision,
    targetPartitionRevisions: plan.targetPartitionRevisions,
    scenarioRegistryDigest: plan.scenarioRegistryDigest,
    semanticSchemaDigest: plan.semanticSchemaDigest,
    providerSetDigest: plan.providerSetDigest,
    adapterRegistryDigest: plan.adapterRegistryDigest,
    impactDigest: plan.impactDigest,
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    compilerDigest: plan.compilerDigest,
    plannerDigest: plan.plannerDigest,
    baselineSetDigests: uniqueVerificationText(
      plan.cells.flatMap(({ baselineSetRef }) =>
        baselineSetRef?.digest ? [baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        plan.cells.flatMap(({ adapter }) =>
          adapter.toolchainDigest ? [adapter.toolchainDigest] : []
        )
      )
    ),
    revocationRecordDigest: view.revocationRecordDigest,
    revokedEvidenceIds: uniqueVerificationText(
      view.records
        .filter(({ trustStatus }) => trustStatus === 'revoked')
        .map(({ evidenceId }) => evidenceId)
    ),
  };
  const frozenClosureInput =
    await journal.read<EvaluateVerificationClosureInput>(
      'verification-closure-material',
      mutationKey
    );
  if (frozenClosureInput) {
    if (
      digestAgentCanonicalValue(frozenClosureInput.plan) !==
        digestAgentCanonicalValue(plan) ||
      digestAgentCanonicalValue(frozenClosureInput.evidence) !==
        digestAgentCanonicalValue(evidence)
    )
      return { status: 'blocked', outcome: 'blocked', code: 'AI-7006' };
    const fresh = evaluateVerificationClosure(closureInput);
    const frozen = evaluateVerificationClosure(frozenClosureInput);
    if (
      fresh.status !== 'ready' ||
      frozen.status !== 'ready' ||
      fresh.closure.verdict !== frozen.closure.verdict ||
      digestAgentCanonicalValue(fresh.closure.cellStatuses) !==
        digestAgentCanonicalValue(frozen.closure.cellStatuses)
    )
      return { status: 'blocked', outcome: 'blocked', code: 'AI-6001' };
    closureInput = frozenClosureInput;
  } else
    await journal.put(
      'verification-closure-material',
      mutationKey,
      closureInput
    );
  const evaluated = evaluateVerificationClosure(closureInput);
  if (evaluated.status !== 'ready')
    return { status: 'blocked', outcome: 'blocked', code: 'AI-6001' };
  const closedRuns: VerificationRunSnapshot[] = [];
  for (const run of runs) {
    if (run.closureDigest) {
      if (
        run.closureDigest !== evaluated.closure.closureDigest ||
        run.closureVerdict !== evaluated.closure.verdict
      )
        return { status: 'blocked', outcome: 'blocked', code: 'AI-7006' };
      closedRuns.push(run);
    } else {
      closedRuns.push(
        await ports.appendVerificationEvent(
          {
            workspaceId,
            runId,
            authority: input.authority(),
            verificationRunId: run.runId,
            event: createVerificationRunEvent({
              eventId: `closure.${evaluated.closure.closureDigest.slice(7)}.${run.cursor + 1}`,
              runId: run.runId,
              cursor: run.cursor + 1,
              kind: 'closure-evaluated',
              closureDigest: evaluated.closure.closureDigest,
              verdict: evaluated.closure.verdict,
              occurredAt: closureInput.closureEvaluationInstant,
            }),
          },
          signal
        )
      );
    }
  }
  const closed = evaluateWorkspaceAgentVerificationClosure({
    binding: createdBinding.value,
    verificationRuns: closedRuns,
    closureInput,
    receiptId: `${runId}.verification.closure${suffix}`,
    producer,
    evaluatedAt: closureInput.closureEvaluationInstant,
  });
  if (closed.status !== 'ready')
    return {
      status: 'blocked',
      outcome: 'blocked',
      code: closed.issues[0]?.code ?? 'AI-6001',
    };
  await ports.publishVerificationClosure(
    {
      workspaceId,
      runId,
      authority: input.authority(),
      receipt: closed.value.receipt,
    },
    signal
  );
  if (
    input.signal?.aborted ||
    !(await settleAgentRuntimeG3Budget({ ...budgetInput(plan), evidence })) ||
    !checkAgentRuntimeG3Budget(budgetInput(plan))
  )
    return { status: 'blocked', outcome: 'blocked', code: 'AI-6002' };
  return {
    status: 'closed',
    plan,
    runs: closedRuns,
    evidence,
    closure: closed.value.closure,
    receipt: closed.value.receipt,
    binding: createdBinding.value,
  };
};
