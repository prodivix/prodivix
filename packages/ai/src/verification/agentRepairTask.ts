import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { createAgentTaskRecord, isAgentTaskRecord } from '../control/agentTask';
import { isAgentRunSnapshot } from '../control/agentRunFacts';
import {
  decodeAgentControlFact,
  encodeAgentControlFact,
} from '../control/agentControlCodec';
import { selectAgentBudgetUtilization } from '../usage/agentBudgetLedger';
import {
  compareAgentDecimals,
  subtractAgentDecimals,
} from '../usage/agentUsage';
import { isAgentVerificationClosureReceipt } from './agentVerification';
import type {
  AgentBudget,
  AgentWorkspaceRevisionVector,
} from '../domain/agent.types';
import type {
  AgentRunSnapshot,
  AgentTaskRecord,
} from '../control/agentControl.types';
import type {
  AgentRepairCounterexampleSet,
  AgentVerificationClosureReceipt,
} from './agentVerification.types';

export type AgentRepairTaskUsageFacts = Readonly<{
  acknowledgedCommits: number;
  promotedArtifactBytes: number;
  openedRepairRounds: number;
}>;
export type AgentRepairTaskRequest = Readonly<{
  requestId: string;
  parentTaskId: string;
  parentTaskDigest: string;
  parentRunId: string;
  failedClosureReceiptId: string;
  failedClosureDigest: string;
  counterexamples: AgentRepairCounterexampleSet;
  expectedParentSnapshotDigest: string;
  expectedParentLedgerDigest: string;
  currentRevision: AgentWorkspaceRevisionVector;
  requestedAt: string;
  requestedTask: AgentTaskRecord;
  requestDigest: string;
}>;
export type AgentRepairTaskRequestWire = Readonly<{
  wireVersion: 1;
  factType: 'repair-task-request';
  value: Omit<AgentRepairTaskRequest, 'requestedTask'> & {
    requestedTask: ReturnType<typeof encodeAgentControlFact>;
  };
}>;

export const isAgentRepairCounterexampleSet = (
  value: unknown
): value is AgentRepairCounterexampleSet => {
  try {
    if (
      inspectAgentControlJson(value).length ||
      !hasExactAgentControlKeys(value, [
        'failedClosureDigest',
        'requirements',
        'counterexampleSetDigest',
        'regressionRequirementSetDigest',
      ]) ||
      ![
        value.failedClosureDigest,
        value.counterexampleSetDigest,
        value.regressionRequirementSetDigest,
      ].every(isAgentCanonicalDigest) ||
      !Array.isArray(value.requirements) ||
      !value.requirements.length ||
      value.requirements.length > 1_024
    )
      return false;
    const requirements = value.requirements;
    for (const requirement of requirements) {
      if (
        !hasExactAgentControlKeys(requirement, [
          'sourceCellId',
          'stableCellDigest',
          'checkId',
          'targetId',
          'evidenceManifestDigests',
          'sourceTraceDigests',
          'diagnosticCodes',
          'requirementDigest',
        ]) ||
        ![
          requirement.sourceCellId,
          requirement.checkId,
          requirement.targetId,
        ].every(isAgentControlIdentity) ||
        ![requirement.stableCellDigest, requirement.requirementDigest].every(
          isAgentCanonicalDigest
        )
      )
        return false;
      for (const key of [
        'evidenceManifestDigests',
        'sourceTraceDigests',
        'diagnosticCodes',
      ] as const) {
        const entries = requirement[key];
        if (
          !Array.isArray(entries) ||
          entries.length > 1_024 ||
          new Set(entries).size !== entries.length ||
          !entries.every(
            key === 'diagnosticCodes'
              ? isAgentControlIdentity
              : isAgentCanonicalDigest
          ) ||
          entries.some(
            (entry, index) =>
              index > 0 &&
              compareUnicodeCodePoints(entries[index - 1], entry) >= 0
          )
        )
          return false;
      }
      const { requirementDigest, ...body } = requirement;
      if (digestAgentCanonicalValue(body) !== requirementDigest) return false;
    }
    if (
      requirements.some(
        (entry, index) =>
          index > 0 &&
          compareUnicodeCodePoints(
            requirements[index - 1].stableCellDigest,
            entry.stableCellDigest
          ) >= 0
      )
    )
      return false;
    return (
      digestAgentCanonicalValue({
        failedClosureDigest: value.failedClosureDigest,
        requirements,
      }) === value.counterexampleSetDigest &&
      digestAgentCanonicalValue(
        requirements
          .map(({ requirementDigest }) => requirementDigest)
          .sort(compareUnicodeCodePoints)
      ) === value.regressionRequirementSetDigest
    );
  } catch {
    return false;
  }
};

/** Parent delegation is conservative across usage, actual ACKs, artifact bytes and total wall time. */
export const selectAgentRepairRemainingBudget = (
  task: AgentTaskRecord,
  run: AgentRunSnapshot,
  facts: AgentRepairTaskUsageFacts,
  at: string
): AgentBudget => {
  if (
    !isAgentTaskRecord(task) ||
    !isAgentRunSnapshot(run) ||
    run.run.taskId !== task.spec.taskId ||
    run.run.policyDigest !== task.spec.policyDigest ||
    digestAgentCanonicalValue(run.run.baseRevision) !==
      digestAgentCanonicalValue(task.spec.baseRevision) ||
    digestAgentCanonicalValue(run.run.grantRef) !==
      digestAgentCanonicalValue(task.spec.initialGrantRef) ||
    digestAgentCanonicalValue(run.budgetLedger.budget) !==
      digestAgentCanonicalValue(task.spec.budget) ||
    !isAgentControlInstant(at) ||
    Date.parse(at) < Date.parse(run.run.updatedAt) ||
    !hasExactAgentControlKeys(facts, [
      'acknowledgedCommits',
      'promotedArtifactBytes',
      'openedRepairRounds',
    ]) ||
    !Object.values(facts).every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ) ||
    run.budgetLedger.reservations.some(
      ({ status, settlement }) =>
        status !== 'settled' || settlement?.requiresReconciliation
    )
  )
    throw new TypeError('Repair parent budget requires reconciliation.');
  const used = selectAgentBudgetUtilization(run.budgetLedger);
  const ceiling = task.spec.budget;
  const subtract = (maximum: number, consumed: number) => {
    if (consumed > maximum)
      throw new RangeError('Repair parent budget is exhausted.');
    return maximum - consumed;
  };
  const result = {
    usageLimits: ceiling.usageLimits.map((limit) => {
      const amount = used.usage.amounts.find(({ unit }) => unit === limit.unit);
      const consumed = amount
        ? [amount.logicalAmount, amount.billableAmount, amount.cachedAmount]
            .filter((value): value is string => value !== undefined)
            .reduce(
              (maximum, value) =>
                compareAgentDecimals(value, maximum) > 0 ? value : maximum,
              '0'
            )
        : '0';
      return {
        ...limit,
        maximum: subtractAgentDecimals(limit.maximum, consumed),
      };
    }),
    costLimits: ceiling.costLimits.map((limit) => ({
      ...limit,
      maximum: subtractAgentDecimals(
        limit.maximum,
        used.cost.find(({ currency }) => currency === limit.currency)?.amount ??
          '0'
      ),
    })),
    maxModelInvocations: subtract(
      ceiling.maxModelInvocations,
      used.modelInvocations
    ),
    maxToolCalls: subtract(ceiling.maxToolCalls, used.toolCalls),
    maxRepairRounds: subtract(
      ceiling.maxRepairRounds,
      Math.max(used.repairRounds, facts.openedRepairRounds) + 1
    ),
    maxTransactions: subtract(
      ceiling.maxTransactions,
      Math.max(used.transactions, facts.acknowledgedCommits)
    ),
    maxArtifactBytes: subtract(
      ceiling.maxArtifactBytes,
      Math.max(used.artifactBytes, facts.promotedArtifactBytes)
    ),
    maxElapsedMs: subtract(
      ceiling.maxElapsedMs,
      Math.max(used.elapsedMs, Date.parse(at) - Date.parse(run.run.createdAt))
    ),
  };
  if (
    result.maxModelInvocations < 1 ||
    result.maxTransactions < 1 ||
    result.maxElapsedMs < 1
  )
    throw new RangeError('Repair parent budget is exhausted.');
  return Object.freeze(cloneAgentControlJson(result));
};

export const createAgentRepairTaskRequest = (
  input: Readonly<{
    requestId: string;
    parentTask: AgentTaskRecord;
    parentRun: AgentRunSnapshot;
    failedClosureReceipt: AgentVerificationClosureReceipt;
    counterexamples: AgentRepairCounterexampleSet;
    currentRevision: AgentWorkspaceRevisionVector;
    usageFacts: AgentRepairTaskUsageFacts;
    requestedAt: string;
  }>
): AgentRepairTaskRequest => {
  const {
    parentTask: task,
    parentRun: run,
    failedClosureReceipt: closure,
    counterexamples,
    requestedAt,
  } = input;
  if (
    !isAgentControlIdentity(input.requestId) ||
    !isAgentVerificationClosureReceipt(closure) ||
    !isAgentRepairCounterexampleSet(counterexamples) ||
    closure.verdict === 'satisfied' ||
    closure.taskId !== task.spec.taskId ||
    closure.runId !== run.run.runId ||
    counterexamples.failedClosureDigest !== closure.closureDigest ||
    task.spec.mode !== 'apply' ||
    run.run.phase !== 'terminal' ||
    run.run.outcome !== 'failed'
  )
    throw new TypeError('Repair request does not bind a failed parent Task.');
  const budget = selectAgentRepairRemainingBudget(
    task,
    run,
    input.usageFacts,
    requestedAt
  );
  const identity = digestAgentCanonicalValue({
    requestId: input.requestId,
    parentTaskDigest: task.taskDigest,
    failedClosureDigest: closure.closureDigest,
  }).slice(7);
  const intent = `Repair the failed verification of task ${task.spec.taskId}. Preserve its original intent and all required counterexamples. Failed closure: ${closure.closureDigest}.`;
  const currentRevision = canonicalizeAgentWorkspaceRevision(
    input.currentRevision
  );
  const requestedTask = createAgentTaskRecord(
    {
      ...task.spec,
      taskId: `task.repair.${identity}`,
      baseRevision: currentRevision,
      intent,
      intentDigest: digestAgentCanonicalValue(intent),
      initialGrantRef: { grantId: `grant.pending.repair.${identity}` },
      budget,
      createdAt: requestedAt,
      idempotencyKey: `repair.${identity}`,
    },
    { lineage: { reason: 'intent-changed', parentTaskId: task.spec.taskId } }
  );
  const body = cloneAgentControlJson({
    requestId: input.requestId,
    parentTaskId: task.spec.taskId,
    parentTaskDigest: task.taskDigest,
    parentRunId: run.run.runId,
    failedClosureReceiptId: closure.receiptId,
    failedClosureDigest: closure.closureDigest,
    counterexamples,
    expectedParentSnapshotDigest: run.snapshotDigest,
    expectedParentLedgerDigest: run.budgetLedger.ledgerDigest,
    currentRevision,
    requestedAt,
    requestedTask,
  });
  return Object.freeze({
    ...body,
    requestDigest: digestAgentCanonicalValue(body),
  });
};

export const decodeAgentRepairTaskRequest = (
  wire: unknown
): Readonly<
  { ok: true; value: AgentRepairTaskRequest } | { ok: false; message: string }
> => {
  try {
    if (
      inspectAgentControlJson(wire).length ||
      !hasExactAgentControlKeys(wire, ['wireVersion', 'factType', 'value']) ||
      wire.wireVersion !== 1 ||
      wire.factType !== 'repair-task-request' ||
      !hasExactAgentControlKeys(wire.value, [
        'requestId',
        'parentTaskId',
        'parentTaskDigest',
        'parentRunId',
        'failedClosureReceiptId',
        'failedClosureDigest',
        'counterexamples',
        'expectedParentSnapshotDigest',
        'expectedParentLedgerDigest',
        'currentRevision',
        'requestedAt',
        'requestedTask',
        'requestDigest',
      ])
    )
      throw new TypeError();
    const value = wire.value;
    const task = decodeAgentControlFact(value.requestedTask);
    if (
      !task.ok ||
      task.value.factType !== 'task-record' ||
      ![
        value.requestId,
        value.parentTaskId,
        value.parentRunId,
        value.failedClosureReceiptId,
      ].every(isAgentControlIdentity) ||
      ![
        value.parentTaskDigest,
        value.failedClosureDigest,
        value.expectedParentSnapshotDigest,
        value.expectedParentLedgerDigest,
        value.requestDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentRepairCounterexampleSet(value.counterexamples) ||
      value.counterexamples.failedClosureDigest !== value.failedClosureDigest ||
      !isAgentControlInstant(value.requestedAt) ||
      task.value.value.lineage.reason !== 'intent-changed' ||
      task.value.value.lineage.parentTaskId !== value.parentTaskId ||
      task.value.value.spec.mode !== 'apply' ||
      task.value.value.spec.createdAt !== value.requestedAt ||
      digestAgentCanonicalValue(task.value.value.spec.baseRevision) !==
        digestAgentCanonicalValue(value.currentRevision)
    )
      throw new TypeError();
    const current = cloneAgentControlJson({
      ...value,
      currentRevision: canonicalizeAgentWorkspaceRevision(
        value.currentRevision as AgentWorkspaceRevisionVector
      ),
      requestedTask: task.value.value,
    }) as AgentRepairTaskRequest;
    const { requestDigest, ...body } = current;
    if (digestAgentCanonicalValue(body) !== requestDigest)
      throw new TypeError();
    return { ok: true, value: current };
  } catch {
    return { ok: false, message: 'Agent repair Task request wire is invalid.' };
  }
};

export const encodeAgentRepairTaskRequest = (
  request: AgentRepairTaskRequest
): AgentRepairTaskRequestWire => {
  const wire = {
    wireVersion: 1 as const,
    factType: 'repair-task-request' as const,
    value: {
      ...request,
      requestedTask: encodeAgentControlFact({
        factType: 'task-record',
        value: request.requestedTask,
      }),
    },
  };
  const decoded = decodeAgentRepairTaskRequest(wire);
  if (!decoded.ok) throw new TypeError(decoded.message);
  return wire;
};
