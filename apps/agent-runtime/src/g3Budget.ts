import {
  createAgentUsageVector,
  digestAgentCanonicalValue,
  reserveAgentRunBudget,
  selectAgentBudgetUtilization,
  settleAgentRunBudget,
  type AgentControlCommandIdentity,
  type AgentRunSnapshot,
  type AgentRunTransitionResult,
  type AgentTaskRecord,
} from '@prodivix/ai';
import type {
  VerificationEvidence,
  VerificationPlan,
} from '@prodivix/verification';
import type { AgentRuntimeBinding } from '#src/config.js';

export type AgentRuntimeG3BudgetInput = Readonly<{
  task: AgentTaskRecord;
  state: () => AgentRunSnapshot;
  plan: VerificationPlan;
  binding: AgentRuntimeBinding;
  persist: (result: AgentRunTransitionResult) => Promise<void>;
  command: (label: string) => AgentControlCommandIdentity;
  now: () => string;
  reservationKey: string;
  transactions?: number;
}>;

const reservationId = (input: AgentRuntimeG3BudgetInput) =>
  `budget.g3.${digestAgentCanonicalValue({ runId: input.state().run.runId, key: input.reservationKey }).slice(7)}`;
const elapsed = (input: AgentRuntimeG3BudgetInput) =>
  Math.max(
    0,
    Date.parse(input.now()) - Date.parse(input.state().run.createdAt)
  );
const demand = (
  artifactBytes: number,
  elapsedMs: number,
  transactions: number
) => ({
  usage: createAgentUsageVector([]),
  cost: [],
  modelInvocations: 0,
  toolCalls: 0,
  repairRounds: 0,
  transactions,
  artifactBytes,
  elapsedMs,
});

const artifactCeiling = (
  input: AgentRuntimeG3BudgetInput
): number | undefined => {
  let total = 0;
  for (const cell of input.plan.cells.filter(
    ({ requirement }) => requirement === 'required'
  )) {
    const adapter = input.binding.verification?.adapters.find(
      ({ identity }) =>
        digestAgentCanonicalValue(identity) ===
        digestAgentCanonicalValue(cell.adapter)
    );
    if (!adapter) return undefined;
    const maximum =
      adapter.descriptor.budgets.maximumArtifactBytes *
      cell.retryPolicy.maximumAttempts *
      cell.retryPolicy.stabilitySamples;
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 0 ||
      !Number.isSafeInteger(total + maximum)
    )
      return undefined;
    total += maximum;
  }
  return total;
};

/** Approval waiting consumes the same wall-time ceiling; dispatch requires a durable resource reservation. */
export const reserveAgentRuntimeG3Budget = async (
  input: AgentRuntimeG3BudgetInput
): Promise<boolean> => {
  const state = input.state();
  const artifactBytes = artifactCeiling(input);
  if (artifactBytes === undefined) return false;
  const existing = state.budgetLedger.reservations.find(
    (entry) => entry.reservationId === reservationId(input)
  );
  if (existing)
    return (
      !existing.settlement?.requiresReconciliation &&
      existing.demand.artifactBytes >= artifactBytes &&
      existing.demand.transactions >= (input.transactions ?? 0) &&
      checkAgentRuntimeG3Budget(input)
    );
  if (!input.binding.verificationDriver) return false;
  const used = selectAgentBudgetUtilization(state.budgetLedger);
  const runtime = input.binding.verificationDriver.maximumRuntimeMs;
  const elapsedMs = Math.max(0, elapsed(input) - used.elapsedMs) + runtime;
  if (
    !Number.isSafeInteger(artifactBytes) ||
    artifactBytes < 0 ||
    used.artifactBytes + artifactBytes >
      input.binding.policy.budgetCeiling.maxArtifactBytes ||
    used.elapsedMs + elapsedMs >
      input.binding.policy.budgetCeiling.maxElapsedMs ||
    used.transactions + (input.transactions ?? 0) >
      input.binding.policy.budgetCeiling.maxTransactions
  )
    return false;
  const reserved = reserveAgentRunBudget(input.task, state, {
    ...input.command(`g3-reserve.${input.reservationKey}`),
    reservationId: reservationId(input),
    demand: demand(artifactBytes, elapsedMs, input.transactions ?? 0),
  });
  if (!reserved.accepted) return false;
  await input.persist(reserved);
  return true;
};

export const checkAgentRuntimeG3Budget = (
  input: AgentRuntimeG3BudgetInput
): boolean => {
  const state = input.state();
  const used = selectAgentBudgetUtilization(state.budgetLedger);
  return (
    Number.isFinite(elapsed(input)) &&
    elapsed(input) <=
      Math.min(
        input.task.spec.budget.maxElapsedMs,
        input.binding.policy.budgetCeiling.maxElapsedMs
      ) &&
    used.artifactBytes <=
      Math.min(
        input.task.spec.budget.maxArtifactBytes,
        input.binding.policy.budgetCeiling.maxArtifactBytes
      )
  );
};

/** Settlement uses promoted manifests and total elapsed time, keeping already charged reservations disjoint. */
export const checkAgentRuntimeG3ArtifactBudget = (
  input: AgentRuntimeG3BudgetInput & {
    evidence: readonly VerificationEvidence[];
  }
): boolean => {
  const reservation = input
    .state()
    .budgetLedger.reservations.find(
      (entry) => entry.reservationId === reservationId(input)
    );
  const artifactBytes = input.evidence.reduce(
    (total, item) =>
      total + item.artifacts.reduce((sum, artifact) => sum + artifact.size, 0),
    0
  );
  return (
    !!reservation &&
    Number.isSafeInteger(artifactBytes) &&
    artifactBytes >= 0 &&
    artifactBytes <= reservation.demand.artifactBytes
  );
};

/** Settlement includes all Closure owner round trips and remains immutable after an acknowledged settlement. */
export const settleAgentRuntimeG3Budget = async (
  input: AgentRuntimeG3BudgetInput & {
    evidence: readonly VerificationEvidence[];
  }
): Promise<boolean> => {
  const state = input.state();
  const reservation = state.budgetLedger.reservations.find(
    (entry) => entry.reservationId === reservationId(input)
  );
  if (!reservation) return false;
  if (!checkAgentRuntimeG3ArtifactBudget(input)) return false;
  if (reservation.status === 'settled')
    return (
      !reservation.settlement?.requiresReconciliation &&
      checkAgentRuntimeG3Budget(input)
    );
  const used = selectAgentBudgetUtilization(state.budgetLedger);
  const otherElapsed = Math.max(
    0,
    used.elapsedMs - reservation.demand.elapsedMs
  );
  const artifactBytes = input.evidence.reduce(
    (total, item) =>
      total + item.artifacts.reduce((sum, artifact) => sum + artifact.size, 0),
    0
  );
  const actual = demand(
    artifactBytes,
    Math.max(0, elapsed(input) - otherElapsed),
    reservation.demand.transactions
  );
  const settled = settleAgentRunBudget(input.task, state, {
    ...input.command(`g3-settle.${input.reservationKey}`),
    reservationId: reservation.reservationId,
    actual,
  });
  if (!settled.accepted) return false;
  await input.persist(settled);
  return checkAgentRuntimeG3Budget(input);
};
