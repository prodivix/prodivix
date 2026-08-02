import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentBudget,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type {
  AgentCost,
  AgentUsageAmount,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  compareAgentDecimals,
  createAgentUsageVector,
  isAgentUsageUnit,
  normalizeAgentCosts,
  normalizeAgentDecimal,
} from './agentUsage';

export type AgentBudgetDemand = Readonly<{
  usage: AgentUsageVector;
  cost: readonly AgentCost[];
  modelInvocations: number;
  toolCalls: number;
  repairRounds: number;
  transactions: number;
  artifactBytes: number;
  elapsedMs: number;
}>;

export type AgentBudgetSettlement = Readonly<{
  actual: AgentBudgetDemand;
  charged: AgentBudgetDemand;
  requiresReconciliation: boolean;
  reconciliationReason?:
    | 'usage-unknown'
    | 'worker-loss'
    | 'timeout'
    | 'provider-disconnect'
    | 'ack-loss';
  settledAt: Instant;
  settlementDigest: CanonicalDigest;
}>;

export type AgentBudgetReservation = Readonly<{
  reservationId: string;
  demand: AgentBudgetDemand;
  demandDigest: CanonicalDigest;
  reservedAt: Instant;
  status: 'reserved' | 'settled';
  settlement?: AgentBudgetSettlement;
}>;

export type AgentBudgetLedgerState = Readonly<{
  budget: AgentBudget;
  revision: number;
  reservations: readonly AgentBudgetReservation[];
  ledgerDigest: CanonicalDigest;
}>;

export type AgentBudgetLedgerIssue = Readonly<{
  code: 'AI-6002' | 'AI-6013' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentBudgetLedgerResult =
  | Readonly<{
      ok: true;
      state: AgentBudgetLedgerState;
      reservation: AgentBudgetReservation;
    }>
  | Readonly<{
      ok: false;
      state: AgentBudgetLedgerState;
      issues: readonly AgentBudgetLedgerIssue[];
    }>;

const issue = (
  code: AgentBudgetLedgerIssue['code'],
  path: string,
  message: string
): AgentBudgetLedgerIssue =>
  Object.freeze({ code, path, message, blocking: true });

const assertCount = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const normalizeDemand = (demand: AgentBudgetDemand): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector(demand.usage.amounts),
    cost: normalizeAgentCosts(demand.cost),
    modelInvocations: assertCount(demand.modelInvocations, 'Model invocations'),
    toolCalls: assertCount(demand.toolCalls, 'Tool calls'),
    repairRounds: assertCount(demand.repairRounds, 'Repair rounds'),
    transactions: assertCount(demand.transactions, 'Transactions'),
    artifactBytes: assertCount(demand.artifactBytes, 'Artifact bytes'),
    elapsedMs: assertCount(demand.elapsedMs, 'Elapsed milliseconds'),
  });

const emptyDemand = (): AgentBudgetDemand =>
  normalizeDemand({
    usage: createAgentUsageVector([]),
    cost: [],
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
  });

const addCosts = (
  left: readonly AgentCost[],
  right: readonly AgentCost[]
): readonly AgentCost[] => normalizeAgentCosts([...left, ...right]);

const addDemand = (
  left: AgentBudgetDemand,
  right: AgentBudgetDemand
): AgentBudgetDemand =>
  normalizeDemand({
    usage: createAgentUsageVector([
      ...left.usage.amounts,
      ...right.usage.amounts,
    ]),
    cost: addCosts(left.cost, right.cost),
    modelInvocations: left.modelInvocations + right.modelInvocations,
    toolCalls: left.toolCalls + right.toolCalls,
    repairRounds: left.repairRounds + right.repairRounds,
    transactions: left.transactions + right.transactions,
    artifactBytes: left.artifactBytes + right.artifactBytes,
    elapsedMs: left.elapsedMs + right.elapsedMs,
  });

const amountCeiling = (amount: AgentUsageAmount): string | undefined => {
  const values = [
    amount.logicalAmount,
    amount.billableAmount,
    amount.cachedAmount,
  ].filter((value): value is string => value !== undefined);
  return values.reduce<string | undefined>(
    (maximum, value) =>
      maximum === undefined || compareAgentDecimals(value, maximum) > 0
        ? value
        : maximum,
    undefined
  );
};

const demandHasUnknown = (demand: AgentBudgetDemand): boolean =>
  demand.usage.amounts.some(
    (amount) =>
      amount.confidence === 'unknown' || amountCeiling(amount) === undefined
  ) ||
  demand.cost.some(
    (cost) => cost.confidence === 'unknown' || cost.amount === undefined
  );

const demandFitsWithin = (
  candidate: AgentBudgetDemand,
  ceiling: AgentBudgetDemand
): boolean => {
  for (const amount of candidate.usage.amounts) {
    const candidateAmount = amountCeiling(amount);
    const ceilingAmount = amountCeiling(
      ceiling.usage.amounts.find(({ unit }) => unit === amount.unit) ?? {
        unit: amount.unit,
        logicalAmount: '0',
        confidence: 'measured',
      }
    );
    if (
      candidateAmount === undefined ||
      ceilingAmount === undefined ||
      compareAgentDecimals(candidateAmount, ceilingAmount) > 0
    ) {
      return false;
    }
  }
  for (const cost of candidate.cost) {
    const ceilingCost = ceiling.cost.find(
      ({ currency }) => currency === cost.currency
    );
    if (
      cost.amount === undefined ||
      ceilingCost?.amount === undefined ||
      compareAgentDecimals(cost.amount, ceilingCost.amount) > 0
    ) {
      return false;
    }
  }
  return (
    candidate.modelInvocations <= ceiling.modelInvocations &&
    candidate.toolCalls <= ceiling.toolCalls &&
    candidate.repairRounds <= ceiling.repairRounds &&
    candidate.transactions <= ceiling.transactions &&
    candidate.artifactBytes <= ceiling.artifactBytes &&
    candidate.elapsedMs <= ceiling.elapsedMs
  );
};

const budgetAllows = (
  budget: AgentBudget,
  demand: AgentBudgetDemand
): boolean => {
  if (
    demand.usage.amounts.some(
      ({ unit }) => !budget.usageLimits.some((limit) => limit.unit === unit)
    ) ||
    demand.cost.some(
      ({ currency }) =>
        !budget.costLimits.some((limit) => limit.currency === currency)
    )
  ) {
    return false;
  }
  for (const limit of budget.usageLimits) {
    const amount = demand.usage.amounts.find(({ unit }) => unit === limit.unit);
    const consumed = amount ? amountCeiling(amount) : '0';
    if (
      consumed === undefined ||
      compareAgentDecimals(consumed, limit.maximum) > 0
    ) {
      return false;
    }
  }
  for (const limit of budget.costLimits) {
    const cost = demand.cost.find(
      ({ currency }) => currency === limit.currency
    );
    if (
      cost &&
      (cost.amount === undefined ||
        compareAgentDecimals(cost.amount, limit.maximum) > 0)
    ) {
      return false;
    }
  }
  return (
    demand.modelInvocations <= budget.maxModelInvocations &&
    demand.toolCalls <= budget.maxToolCalls &&
    demand.repairRounds <= budget.maxRepairRounds &&
    demand.transactions <= budget.maxTransactions &&
    demand.artifactBytes <= budget.maxArtifactBytes &&
    demand.elapsedMs <= budget.maxElapsedMs
  );
};

const utilization = (state: AgentBudgetLedgerState): AgentBudgetDemand =>
  state.reservations.reduce(
    (total, reservation) =>
      addDemand(
        total,
        reservation.status === 'settled'
          ? reservation.settlement!.charged
          : reservation.demand
      ),
    emptyDemand()
  );

const stateBase = (
  budget: AgentBudget,
  revision: number,
  reservations: readonly AgentBudgetReservation[]
) => ({ budget, revision, reservations });

const createState = (
  budget: AgentBudget,
  revision: number,
  reservations: readonly AgentBudgetReservation[]
): AgentBudgetLedgerState => {
  const canonicalReservations = Object.freeze(
    [...reservations].sort((left, right) =>
      compareUnicodeCodePoints(left.reservationId, right.reservationId)
    )
  );
  const base = stateBase(budget, revision, canonicalReservations);
  return Object.freeze({
    ...base,
    ledgerDigest: digestAgentCanonicalValue(base),
  });
};

const stateDigestIsValid = (state: AgentBudgetLedgerState): boolean => {
  try {
    if (!Number.isSafeInteger(state.revision) || state.revision < 0)
      return false;
    if (!sameCanonicalJson(canonicalizeBudget(state.budget), state.budget)) {
      return false;
    }
    const reservationIds = state.reservations.map(
      ({ reservationId }) => reservationId
    );
    if (
      new Set(reservationIds).size !== reservationIds.length ||
      reservationIds.some((id) => !id.trim()) ||
      state.reservations.some(
        (reservation, index) =>
          index > 0 &&
          compareUnicodeCodePoints(
            state.reservations[index - 1]!.reservationId,
            reservation.reservationId
          ) > 0
      )
    ) {
      return false;
    }
    for (const reservation of state.reservations) {
      if (
        !Number.isFinite(Date.parse(reservation.reservedAt)) ||
        !sameCanonicalJson(
          normalizeDemand(reservation.demand),
          reservation.demand
        ) ||
        digestAgentCanonicalValue(reservation.demand) !==
          reservation.demandDigest
      ) {
        return false;
      }
      if (reservation.status === 'reserved') {
        if (reservation.settlement !== undefined) return false;
        continue;
      }
      const settlement = reservation.settlement;
      if (
        !settlement ||
        !Number.isFinite(Date.parse(settlement.settledAt)) ||
        Date.parse(settlement.settledAt) < Date.parse(reservation.reservedAt) ||
        !sameCanonicalJson(
          normalizeDemand(settlement.actual),
          settlement.actual
        ) ||
        !sameCanonicalJson(
          normalizeDemand(settlement.charged),
          settlement.charged
        ) ||
        settlement.requiresReconciliation !==
          (demandHasUnknown(settlement.actual) ||
            settlement.reconciliationReason !== undefined) ||
        (settlement.requiresReconciliation
          ? settlement.reconciliationReason === undefined
          : settlement.reconciliationReason !== undefined) ||
        !sameCanonicalJson(
          settlement.charged,
          settlement.requiresReconciliation
            ? reservation.demand
            : settlement.actual
        ) ||
        (!settlement.requiresReconciliation &&
          !demandFitsWithin(settlement.actual, reservation.demand)) ||
        digestAgentCanonicalValue({
          actual: settlement.actual,
          charged: settlement.charged,
          requiresReconciliation: settlement.requiresReconciliation,
          ...(settlement.reconciliationReason
            ? { reconciliationReason: settlement.reconciliationReason }
            : {}),
          settledAt: settlement.settledAt,
        }) !== settlement.settlementDigest
      ) {
        return false;
      }
    }
    return (
      budgetAllows(state.budget, utilization(state)) &&
      digestAgentCanonicalValue(
        stateBase(state.budget, state.revision, state.reservations)
      ) === state.ledgerDigest
    );
  } catch {
    return false;
  }
};

export const isAgentBudgetLedgerState = stateDigestIsValid;

const validateBudget = (budget: AgentBudget): void => {
  const usageUnits = budget.usageLimits.map(({ unit }) => unit);
  const currencies = budget.costLimits.map(({ currency }) => currency);
  if (
    new Set(usageUnits).size !== usageUnits.length ||
    new Set(currencies).size !== currencies.length ||
    usageUnits.some((unit) => !isAgentUsageUnit(unit)) ||
    budget.costLimits.some(({ currency }) => !/^[A-Z]{3}$/u.test(currency))
  ) {
    throw new TypeError(
      'Agent budget limits must have unique valid identities.'
    );
  }
  for (const { maximum } of [...budget.usageLimits, ...budget.costLimits]) {
    normalizeAgentDecimal(maximum);
  }
  for (const [label, value] of [
    ['maxModelInvocations', budget.maxModelInvocations],
    ['maxToolCalls', budget.maxToolCalls],
    ['maxRepairRounds', budget.maxRepairRounds],
    ['maxTransactions', budget.maxTransactions],
    ['maxArtifactBytes', budget.maxArtifactBytes],
    ['maxElapsedMs', budget.maxElapsedMs],
  ] as const) {
    assertCount(value, label);
  }
};

const canonicalizeBudget = (budget: AgentBudget): AgentBudget => {
  validateBudget(budget);
  return Object.freeze({
    usageLimits: Object.freeze(
      budget.usageLimits
        .map(({ unit, maximum }) =>
          Object.freeze({ unit, maximum: normalizeAgentDecimal(maximum) })
        )
        .sort((left, right) => compareUnicodeCodePoints(left.unit, right.unit))
    ),
    costLimits: Object.freeze(
      budget.costLimits
        .map(({ currency, maximum }) =>
          Object.freeze({ currency, maximum: normalizeAgentDecimal(maximum) })
        )
        .sort((left, right) =>
          compareUnicodeCodePoints(left.currency, right.currency)
        )
    ),
    maxModelInvocations: budget.maxModelInvocations,
    maxToolCalls: budget.maxToolCalls,
    maxRepairRounds: budget.maxRepairRounds,
    maxTransactions: budget.maxTransactions,
    maxArtifactBytes: budget.maxArtifactBytes,
    maxElapsedMs: budget.maxElapsedMs,
  });
};

export const createAgentBudgetLedger = (
  budget: AgentBudget
): AgentBudgetLedgerState => {
  return createState(canonicalizeBudget(budget), 0, []);
};

export const selectAgentBudgetUtilization = utilization;

export const reserveAgentBudget = (
  state: AgentBudgetLedgerState,
  input: Readonly<{
    reservationId: string;
    expectedRevision: number;
    demand: AgentBudgetDemand;
    reservedAt: Instant;
  }>
): AgentBudgetLedgerResult => {
  if (!stateDigestIsValid(state)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/ledgerDigest',
          'Budget ledger state digest or reservation identity has drifted.'
        ),
      ]),
    });
  }
  if (
    !input.reservationId.trim() ||
    !Number.isFinite(Date.parse(input.reservedAt))
  ) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/reservation',
          'Budget reservation identity is invalid.'
        ),
      ]),
    });
  }
  let demand: AgentBudgetDemand;
  try {
    demand = normalizeDemand(input.demand);
  } catch {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-9001', '/demand', 'Budget demand is invalid.'),
      ]),
    });
  }
  if (demandHasUnknown(demand)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-6013',
          '/demand',
          'A hard-budget reservation requires known conservative upper bounds.'
        ),
      ]),
    });
  }
  const demandDigest = digestAgentCanonicalValue(demand);
  const existing = state.reservations.find(
    ({ reservationId }) => reservationId === input.reservationId
  );
  if (existing) {
    return existing.demandDigest === demandDigest &&
      existing.reservedAt === input.reservedAt
      ? Object.freeze({ ok: true, state, reservation: existing })
      : Object.freeze({
          ok: false,
          state,
          issues: Object.freeze([
            issue(
              'AI-9001',
              '/reservationId',
              'Budget reservation id was reused with different demand or time.'
            ),
          ]),
        });
  }
  if (input.expectedRevision !== state.revision) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/expectedRevision',
          'Budget ledger compare-and-swap revision is stale.'
        ),
      ]),
    });
  }
  if (!budgetAllows(state.budget, addDemand(utilization(state), demand))) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-6002',
          '/demand',
          'Budget reservation exceeds a hard ceiling.'
        ),
      ]),
    });
  }
  const reservation: AgentBudgetReservation = Object.freeze({
    reservationId: input.reservationId,
    demand,
    demandDigest,
    reservedAt: input.reservedAt,
    status: 'reserved',
  });
  return Object.freeze({
    ok: true,
    state: createState(state.budget, state.revision + 1, [
      ...state.reservations,
      reservation,
    ]),
    reservation,
  });
};

export const settleAgentBudget = (
  state: AgentBudgetLedgerState,
  input: Readonly<{
    reservationId: string;
    expectedRevision: number;
    actual: AgentBudgetDemand;
    settledAt: Instant;
  }>
): AgentBudgetLedgerResult => {
  if (!stateDigestIsValid(state)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/ledgerDigest',
          'Budget ledger state digest or reservation identity has drifted.'
        ),
      ]),
    });
  }
  const reservation = state.reservations.find(
    ({ reservationId }) => reservationId === input.reservationId
  );
  if (!reservation) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-6013', '/reservationId', 'Budget reservation is missing.'),
      ]),
    });
  }
  let actual: AgentBudgetDemand;
  try {
    actual = normalizeDemand(input.actual);
  } catch {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-6013', '/actual', 'Actual usage is invalid.'),
      ]),
    });
  }
  if (!Number.isFinite(Date.parse(input.settledAt))) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-6013', '/settledAt', 'Budget settlement instant is invalid.'),
      ]),
    });
  }
  if (Date.parse(input.settledAt) < Date.parse(reservation.reservedAt)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-6013',
          '/settledAt',
          'Budget settlement cannot predate its reservation.'
        ),
      ]),
    });
  }
  const actualDigest = digestAgentCanonicalValue(actual);
  if (reservation.status === 'settled') {
    const priorSettlement = reservation.settlement;
    if (!priorSettlement) {
      return Object.freeze({
        ok: false,
        state,
        issues: Object.freeze([
          issue(
            'AI-6013',
            '/settlement',
            'Settled budget reservation is missing its immutable receipt.'
          ),
        ]),
      });
    }
    return sameCanonicalJson(priorSettlement.actual, actual) &&
      priorSettlement.settledAt === input.settledAt
      ? Object.freeze({ ok: true, state, reservation })
      : Object.freeze({
          ok: false,
          state,
          issues: Object.freeze([
            issue(
              'AI-6013',
              '/actual',
              `Budget reservation was already settled with a different receipt (${actualDigest}).`
            ),
          ]),
        });
  }
  if (input.expectedRevision !== state.revision) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/expectedRevision',
          'Budget settlement compare-and-swap revision is stale.'
        ),
      ]),
    });
  }
  const requiresReconciliation = demandHasUnknown(actual);
  const charged = requiresReconciliation ? reservation.demand : actual;
  if (
    !requiresReconciliation &&
    !demandFitsWithin(actual, reservation.demand)
  ) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-6013',
          '/actual',
          'Actual usage exceeds its atomic reservation and requires reconciliation.'
        ),
      ]),
    });
  }
  const settlementBase = {
    actual,
    charged,
    requiresReconciliation,
    ...(requiresReconciliation
      ? ({ reconciliationReason: 'usage-unknown' as const } as const)
      : {}),
    settledAt: input.settledAt,
  } as const;
  const settlement: AgentBudgetSettlement = Object.freeze({
    ...settlementBase,
    settlementDigest: digestAgentCanonicalValue(settlementBase),
  });
  const settledReservation: AgentBudgetReservation = Object.freeze({
    ...reservation,
    status: 'settled',
    settlement,
  });
  const nextReservations = state.reservations.map((entry) =>
    entry.reservationId === reservation.reservationId
      ? settledReservation
      : entry
  );
  return Object.freeze({
    ok: true,
    state: createState(state.budget, state.revision + 1, nextReservations),
    reservation: settledReservation,
  });
};

/**
 * Closes an in-flight reservation after authority loss. The full reserved
 * upper bound remains charged, so restart/timeout recovery can never turn
 * unknown work into zero usage.
 */
export const reconcileAgentBudgetReservation = (
  state: AgentBudgetLedgerState,
  input: Readonly<{
    reservationId: string;
    expectedRevision: number;
    reason: Exclude<
      NonNullable<AgentBudgetSettlement['reconciliationReason']>,
      'usage-unknown'
    >;
    settledAt: Instant;
  }>
): AgentBudgetLedgerResult => {
  if (!stateDigestIsValid(state)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/ledgerDigest',
          'Budget ledger state digest or reservation identity has drifted.'
        ),
      ]),
    });
  }
  const reservation = state.reservations.find(
    ({ reservationId }) => reservationId === input.reservationId
  );
  if (!reservation) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-6013', '/reservationId', 'Budget reservation is missing.'),
      ]),
    });
  }
  if (!Number.isFinite(Date.parse(input.settledAt))) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue('AI-6013', '/settledAt', 'Budget settlement instant is invalid.'),
      ]),
    });
  }
  if (Date.parse(input.settledAt) < Date.parse(reservation.reservedAt)) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-6013',
          '/settledAt',
          'Budget settlement cannot predate its reservation.'
        ),
      ]),
    });
  }
  if (reservation.status === 'settled') {
    const prior = reservation.settlement;
    return prior?.requiresReconciliation === true &&
      prior.reconciliationReason === input.reason &&
      prior.settledAt === input.settledAt
      ? Object.freeze({ ok: true, state, reservation })
      : Object.freeze({
          ok: false,
          state,
          issues: Object.freeze([
            issue(
              'AI-6013',
              '/reservationId',
              'Budget reservation already has a different settlement receipt.'
            ),
          ]),
        });
  }
  if (input.expectedRevision !== state.revision) {
    return Object.freeze({
      ok: false,
      state,
      issues: Object.freeze([
        issue(
          'AI-9001',
          '/expectedRevision',
          'Budget reconciliation compare-and-swap revision is stale.'
        ),
      ]),
    });
  }
  const settlementBase = {
    actual: reservation.demand,
    charged: reservation.demand,
    requiresReconciliation: true,
    reconciliationReason: input.reason,
    settledAt: input.settledAt,
  } as const;
  const settlement: AgentBudgetSettlement = Object.freeze({
    ...settlementBase,
    settlementDigest: digestAgentCanonicalValue(settlementBase),
  });
  const settledReservation: AgentBudgetReservation = Object.freeze({
    ...reservation,
    status: 'settled',
    settlement,
  });
  return Object.freeze({
    ok: true,
    state: createState(
      state.budget,
      state.revision + 1,
      state.reservations.map((entry) =>
        entry.reservationId === input.reservationId ? settledReservation : entry
      )
    ),
    reservation: settledReservation,
  });
};
