import { describe, expect, it } from 'vitest';
import {
  createV4Task,
  createV4Demand,
  V4_TIME,
  v4Command,
} from '../__tests__/agentV4Fixtures';
import { createAgentTaskRecord } from '../control/agentTask';
import {
  createAgentRunControl,
  startAgentRun,
  transitionAgentRunPhase,
  reserveAgentRunBudget,
  settleAgentRunBudget,
  finalizeAgentRun,
} from '../control/agentControlPlane';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import { createAgentVerificationClosureReceipt } from './agentVerification';
import {
  createAgentRepairTaskRequest,
  decodeAgentRepairTaskRequest,
  encodeAgentRepairTaskRequest,
  selectAgentRepairRemainingBudget,
} from './agentRepairTask';
import type {
  AgentRunSnapshot,
  AgentRunTransitionResult,
} from '../control/agentControl.types';
import type { AgentRepairCounterexampleSet } from './agentVerification.types';

const parent = (settled = true) => {
  const original = createV4Task('apply', 'repair');
  const task = createAgentTaskRecord({
    ...original.spec,
    budget: { ...original.spec.budget, maxTransactions: 6 },
  });
  const accept = (result: AgentRunTransitionResult) => {
    if (!result.accepted)
      throw new Error(result.issues.map(({ message }) => message).join(';'));
    return result.state;
  };
  let run = accept(
    createAgentRunControl(task, {
      runId: 'run.repair.parent',
      command: v4Command('created', 'created', V4_TIME.run),
    })
  );
  run = accept(
    startAgentRun(task, run, {
      ...v4Command('started', 'started', V4_TIME.start),
      attemptId: 'attempt.repair.parent',
    })
  );
  run = accept(
    transitionAgentRunPhase(task, run, {
      ...v4Command('running', 'running', V4_TIME.running),
      phase: 'running',
    })
  );
  const demand = {
    ...createV4Demand({ modelInvocations: 1 }),
    usage: createAgentUsageVector([
      {
        unit: 'text-token-input',
        logicalAmount: '80',
        billableAmount: '100.5',
        cachedAmount: '20',
        confidence: 'measured',
      },
    ]),
    cost: [
      { currency: 'USD', amount: '0.125', confidence: 'measured' as const },
    ],
    transactions: 1,
    artifactBytes: 64,
  };
  run = accept(
    reserveAgentRunBudget(task, run, {
      ...v4Command('reserved', 'reserved', V4_TIME.operation),
      reservationId: 'budget.repair.parent',
      demand,
    })
  );
  if (settled)
    run = accept(
      settleAgentRunBudget(task, run, {
        ...v4Command('settled', 'settled', V4_TIME.settle),
        reservationId: 'budget.repair.parent',
        actual: demand,
      })
    );
  run = accept(
    finalizeAgentRun(task, run, {
      ...v4Command('failed', 'failed', V4_TIME.terminal),
      outcome: 'failed',
    })
  );
  const closure = createAgentVerificationClosureReceipt({
    receiptId: 'closure.repair.parent',
    bindingId: 'binding.repair.parent',
    taskId: task.spec.taskId,
    runId: run.run.runId,
    verificationRuns: [
      {
        verificationRunId: 'verification.repair.parent',
        surface: 'preview',
        selectedCellSetDigest: digestAgentCanonicalValue('cells'),
        snapshotDigest: digestAgentCanonicalValue('snapshot'),
      },
    ],
    targetRevision: task.spec.baseRevision,
    planDigest: digestAgentCanonicalValue('plan'),
    evidenceRefs: [],
    evidenceSetDigest: digestAgentCanonicalValue([]),
    verifiedEvidenceViewDigest: digestAgentCanonicalValue('view'),
    closureDigest: digestAgentCanonicalValue('closure'),
    verdict: 'unsatisfied',
    producer: { kind: 'service', principalId: 'agent.runtime' },
    evaluatedAt: V4_TIME.terminal,
  });
  const body = {
    sourceCellId: 'cell.repair',
    stableCellDigest: digestAgentCanonicalValue('stable-cell'),
    checkId: 'check.repair',
    targetId: 'target.repair',
    evidenceManifestDigests: [],
    sourceTraceDigests: [],
    diagnosticCodes: ['VER-2001'],
  };
  const requirements = [
    { ...body, requirementDigest: digestAgentCanonicalValue(body) },
  ];
  const counterexamples: AgentRepairCounterexampleSet = {
    failedClosureDigest: closure.closureDigest,
    requirements,
    counterexampleSetDigest: digestAgentCanonicalValue({
      failedClosureDigest: closure.closureDigest,
      requirements,
    }),
    regressionRequirementSetDigest: digestAgentCanonicalValue(
      requirements.map(({ requirementDigest }) => requirementDigest)
    ),
  };
  const input = {
    requestId: 'request.repair.parent',
    parentTask: task,
    parentRun: run,
    failedClosureReceipt: closure,
    counterexamples,
    currentRevision: {
      ...task.spec.baseRevision,
      opSeq: task.spec.baseRevision.opSeq + 2,
    },
    usageFacts: {
      acknowledgedCommits: 2,
      promotedArtifactBytes: 128,
      openedRepairRounds: 0,
    },
    requestedAt: V4_TIME.export,
  };
  return { task, run, input };
};

describe('failure-derived ordinary repair Task', () => {
  it('delegates remaining decimal, transaction, artifact, round and whole wall-time budgets without resetting parent usage', () => {
    const { task, run, input } = parent();
    const request = createAgentRepairTaskRequest(input);
    expect(request.requestedTask.spec.budget).toMatchObject({
      maxModelInvocations: 7,
      maxTransactions: 4,
      maxArtifactBytes: 1_048_448,
      maxRepairRounds: 1,
      maxElapsedMs: 592_000,
    });
    expect(
      request.requestedTask.spec.budget.usageLimits.find(
        ({ unit }) => unit === 'text-token-input'
      )?.maximum
    ).toBe('19899.5');
    expect(request.requestedTask.spec.budget.costLimits[0]?.maximum).toBe(
      '24.875'
    );
    expect(request.requestedTask.lineage).toEqual({
      reason: 'intent-changed',
      parentTaskId: task.spec.taskId,
    });
    expect(request.requestedTask.spec.baseRevision).toEqual(
      input.currentRevision
    );
    expect(request.requestedTask.spec.policyDigest).toBe(
      task.spec.policyDigest
    );
    expect(request.requestedTask.spec.initialGrantRef.grantId).not.toBe(
      task.spec.initialGrantRef.grantId
    );
    expect(request.expectedParentLedgerDigest).toBe(
      run.budgetLedger.ledgerDigest
    );
    expect(
      decodeAgentRepairTaskRequest(encodeAgentRepairTaskRequest(request))
    ).toEqual({ ok: true, value: request });
  });
  it('produces the same immutable child identity for an exact request replay', () => {
    const { input } = parent();
    expect(createAgentRepairTaskRequest(input)).toEqual(
      createAgentRepairTaskRequest(input)
    );
    expect(
      createAgentRepairTaskRequest({
        ...input,
        requestId: 'request.repair.other',
      }).requestedTask.spec.taskId
    ).not.toBe(createAgentRepairTaskRequest(input).requestedTask.spec.taskId);
  });
  it('rejects unsettled reservations, exhausted wall time, actual transaction lower bounds and exhausted repair rounds', () => {
    expect(() => createAgentRepairTaskRequest(parent(false).input)).toThrow(
      /reconciliation/
    );
    const { input } = parent();
    expect(() =>
      createAgentRepairTaskRequest({
        ...input,
        requestedAt: '2026-08-01T08:10:02.000Z',
      })
    ).toThrow(/exhausted/);
    expect(() =>
      createAgentRepairTaskRequest({
        ...input,
        usageFacts: { ...input.usageFacts, acknowledgedCommits: 6 },
      })
    ).toThrow(/exhausted/);
    expect(() =>
      createAgentRepairTaskRequest({
        ...input,
        usageFacts: { ...input.usageFacts, openedRepairRounds: 2 },
      })
    ).toThrow(/exhausted/);
  });
  it('rejects authority and counterexample drift even when the caller recomputes wrapper digests', () => {
    const { input } = parent();
    expect(() =>
      createAgentRepairTaskRequest({
        ...input,
        failedClosureReceipt: {
          ...input.failedClosureReceipt,
          taskId: 'task.foreign',
        },
      })
    ).toThrow();
    expect(() =>
      createAgentRepairTaskRequest({
        ...input,
        counterexamples: {
          ...input.counterexamples,
          failedClosureDigest: digestAgentCanonicalValue('other'),
        },
      })
    ).toThrow();
    const request = createAgentRepairTaskRequest(input);
    const wire = encodeAgentRepairTaskRequest(request);
    expect(
      decodeAgentRepairTaskRequest({
        ...wire,
        value: { ...wire.value, unknown: true },
      }).ok
    ).toBe(false);
    expect(
      decodeAgentRepairTaskRequest({
        ...wire,
        value: {
          ...wire.value,
          expectedParentLedgerDigest: digestAgentCanonicalValue('different'),
        },
      }).ok
    ).toBe(false);
    const { snapshotDigest: _digest, ...runBody } = input.parentRun;
    const foreign: AgentRunSnapshot = {
      ...runBody,
      run: {
        ...runBody.run,
        policyDigest: digestAgentCanonicalValue('different-policy'),
      },
      snapshotDigest: '',
    };
    const { snapshotDigest: _foreignDigest, ...foreignBody } = foreign;
    const changed = {
      ...foreignBody,
      snapshotDigest: digestAgentCanonicalValue(foreignBody),
    };
    expect(() =>
      selectAgentRepairRemainingBudget(
        input.parentTask,
        changed,
        input.usageFacts,
        input.requestedAt
      )
    ).toThrow(/reconciliation/);
  });
});
