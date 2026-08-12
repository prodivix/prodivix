import { readFileSync } from 'node:fs';
import {
  createAgentBudgetLedger,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationBlindReviewMappingRefSet,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  encodeAgentEvaluationFact,
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { decodeAgentEvaluationLedgerSnapshot } from './coordinatorLedgerAdapter';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as { facts: { plan: { value: AgentModelEvaluationPlan } } };
const plan = vector.facts.plan.value;
const partition = Object.freeze({
  planDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
});

const snapshot = (budgetLedger: unknown) =>
  Object.freeze({
    exportType: 'agent-evaluation-repository-snapshot',
    value: Object.freeze({
      namespaceId: 'evaluation.test',
      partition,
      planFact: encodeAgentEvaluationFact({
        factType: 'evaluation-plan',
        value: plan,
      }),
      attemptFacts: Object.freeze([]),
      checkpointFacts: Object.freeze([]),
      artifactFacts: Object.freeze([]),
      endpointSmokeDispatchIntents: Object.freeze([]),
      endpointSmokeTransportReceipts: Object.freeze([]),
      endpointSmokeResultSpoolReceipts: Object.freeze([]),
      endpointSmokeResultSpoolDispositionReceipts: Object.freeze([]),
      endpointSmokeValidationFailureReceipts: Object.freeze([]),
      endpointSmokeReceipts: Object.freeze([]),
      preDispatchFailureReceipts: Object.freeze([]),
      transportDispatchIntents: Object.freeze([]),
      transportReceipts: Object.freeze([]),
      providerResultSpoolReceipts: Object.freeze([]),
      providerResultSpoolDispositionReceipts: Object.freeze([]),
      invocationTurnReceipts: Object.freeze([]),
      invocationTurnSetReceipts: Object.freeze([]),
      resultSubmissionReceipts: Object.freeze([]),
      controlledRuntimeReceipts: Object.freeze([]),
      capabilityExecutionReceipts: Object.freeze([]),
      capabilitySpecificReceipts: Object.freeze([]),
      providerCapabilityObservationReceipts: Object.freeze([]),
      attemptAuthorityOwnerReceipts: Object.freeze([]),
      verificationAttemptGrantReceipts: Object.freeze([]),
      sourceReceipts: Object.freeze([]),
      executionReceipts: Object.freeze([]),
      reviewRasterScanReceipts: Object.freeze([]),
      reviewCandidateRefs: Object.freeze([]),
      blindReviewMappingRefs: Object.freeze([]),
      blindReviewMappingSetDigest:
        digestAgentEvaluationBlindReviewMappingRefSet([]),
      validatedHumanReviewArtifact: null,
      validatedHumanMetricObservations: Object.freeze([]),
      validatedHumanMetricObservationSetDigest:
        digestAgentEvaluationValidatedHumanMetricObservationSet([]),
      authorityAttestation: null,
      evidenceRoot: null,
      budgetLedger,
    }),
  });

describe('decodeAgentEvaluationLedgerSnapshot', () => {
  it('rebuilds the exact domain budget ledger from ordered durable events', () => {
    const demand: AgentBudgetDemand = Object.freeze({
      usage: createAgentUsageVector([]),
      cost: Object.freeze([]),
      modelInvocations: 1,
      toolCalls: 0,
      repairRounds: 0,
      transactions: 0,
      artifactBytes: 0,
      elapsedMs: 1,
    });
    const reservedAt = plan.plannedAt;
    const settledAt = new Date(Date.parse(reservedAt) + 1).toISOString();
    const reserved = reserveAgentBudget(
      createAgentBudgetLedger(plan.budget.budget),
      {
        reservationId: 'reservation.test',
        expectedRevision: 0,
        demand,
        reservedAt,
      }
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) throw new Error('test setup failed');
    const settled = settleAgentBudget(reserved.state, {
      reservationId: 'reservation.test',
      expectedRevision: 1,
      actual: demand,
      settledAt,
    });
    expect(settled.ok).toBe(true);
    if (!settled.ok || !settled.reservation.settlement) {
      throw new Error('test setup failed');
    }
    const decoded = decodeAgentEvaluationLedgerSnapshot(
      snapshot({
        revision: 2,
        reservations: [
          {
            reservationId: 'reservation.test',
            demand,
            demandDigest: reserved.reservation.demandDigest,
            ledgerRevision: 1,
            reservedAt,
          },
        ],
        settlements: [
          {
            reservationId: 'reservation.test',
            ledgerRevision: 2,
            settlement: settled.reservation.settlement,
            settlementDigest: settled.reservation.settlement.settlementDigest,
            settledAt,
          },
        ],
        unsettledReservationIds: [],
        updatedAt: settledAt,
      }),
      partition
    );

    expect(decoded.budgetLedger).toEqual(settled.state);
    expect(decoded.attempts).toEqual([]);
    expect(decoded.plan).toEqual(plan);
  });

  it('fails closed when the exported partition differs from the requested one', () => {
    expect(() =>
      decodeAgentEvaluationLedgerSnapshot(
        snapshot({
          revision: 0,
          reservations: [],
          settlements: [],
          unsettledReservationIds: [],
          updatedAt: plan.plannedAt,
        }),
        { ...partition, repositoryCommit: 'f'.repeat(40) }
      )
    ).toThrow('snapshot is invalid');
  });

  it('rejects a Backend blind mapping set digest that drifted from its refs', () => {
    const source = snapshot({
      revision: 0,
      reservations: [],
      settlements: [],
      unsettledReservationIds: [],
      updatedAt: plan.plannedAt,
    });
    expect(() =>
      decodeAgentEvaluationLedgerSnapshot(
        {
          ...source,
          value: {
            ...source.value,
            blindReviewMappingSetDigest: digestAgentCanonicalValue(
              'drifted-mapping-set'
            ),
          },
        },
        partition
      )
    ).toThrow('snapshot is invalid');
  });

  it('rejects a malformed endpoint-smoke validation-failure receipt', () => {
    const source = snapshot({
      revision: 0,
      reservations: [],
      settlements: [],
      unsettledReservationIds: [],
      updatedAt: plan.plannedAt,
    });
    expect(() =>
      decodeAgentEvaluationLedgerSnapshot(
        {
          ...source,
          value: {
            ...source.value,
            endpointSmokeValidationFailureReceipts: [{}],
          },
        },
        partition
      )
    ).toThrow('snapshot is invalid');
  });
});
