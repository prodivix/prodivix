import { describe, expect, it } from 'vitest';
import {
  V4_TIME,
  createStartedV4Run,
  createV4Demand,
  v4Command,
  v4Digest,
} from '../__tests__/agentV4Fixtures';
import {
  createAgentBudgetLedger,
  isAgentBudgetLedgerState,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
} from '../usage/agentBudgetLedger';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  reserveAgentRunBudget,
  settleAgentRunBudget,
  startAgentRunOperation,
  transitionAgentRunPhase,
} from './agentControlPlane';
import { createAgentControlEvent } from './agentRunFacts';
import { recoverAgentRun } from './agentRecovery';
import { reduceAgentRun } from './agentRunReducer';

describe('AgentRun budget and recovery conformance', () => {
  it('atomically reserves and settles multi-dimensional budget', () => {
    const fixture = createStartedV4Run('explain', 'budget');
    const demand = createV4Demand({
      inputTokens: '1000',
      outputTokens: '200',
      modelInvocations: 1,
      elapsedMs: 5000,
    });
    const reserved = reserveAgentRunBudget(fixture.task, fixture.state, {
      ...v4Command(
        'event.budget.reserve',
        'idempotency.budget.reserve',
        V4_TIME.operation
      ),
      reservationId: 'reservation.model.1',
      demand,
    });
    expect(reserved.accepted).toBe(true);
    if (!reserved.accepted) return;
    expect(reserved.state.budgetLedger.revision).toBe(1);

    const settled = settleAgentRunBudget(fixture.task, reserved.state, {
      ...v4Command(
        'event.budget.settle',
        'idempotency.budget.settle',
        V4_TIME.settle
      ),
      reservationId: 'reservation.model.1',
      actual: createV4Demand({
        inputTokens: '900',
        outputTokens: '180',
        modelInvocations: 1,
        elapsedMs: 4500,
      }),
    });
    expect(settled.accepted).toBe(true);
    if (settled.accepted) {
      expect(settled.state.budgetLedger.reservations[0]).toMatchObject({
        status: 'settled',
        settlement: { requiresReconciliation: false },
      });
    }
  });

  it('rejects a stale parallel reservation and hard-ceiling exhaustion', () => {
    const fixture = createStartedV4Run('explain', 'budget-race');
    const demand = createV4Demand({
      inputTokens: '19000',
      modelInvocations: 1,
    });
    const first = reserveAgentRunBudget(fixture.task, fixture.state, {
      ...v4Command(
        'event.budget.first',
        'idempotency.budget.first',
        V4_TIME.operation
      ),
      reservationId: 'reservation.first',
      demand,
    });
    const competing = reserveAgentRunBudget(fixture.task, fixture.state, {
      ...v4Command(
        'event.budget.competing',
        'idempotency.budget.competing',
        V4_TIME.operation
      ),
      reservationId: 'reservation.competing',
      demand,
    });
    expect(first.accepted).toBe(true);
    expect(competing.accepted).toBe(true);
    if (!first.accepted || !competing.accepted) return;

    // Both were planned from revision 0; only one event can extend that hash chain.
    const stale = reduceAgentRun(fixture.task, first.state, competing.event);
    expect(stale.accepted).toBe(false);

    const exhausted = reserveAgentRunBudget(fixture.task, first.state, {
      ...v4Command(
        'event.budget.exhausted',
        'idempotency.budget.exhausted',
        V4_TIME.settle
      ),
      reservationId: 'reservation.exhausted',
      demand: createV4Demand({ inputTokens: '2000', modelInvocations: 1 }),
    });
    expect(exhausted.accepted).toBe(false);
    if (!exhausted.accepted) {
      expect(exhausted.issues[0]?.code).toBe('AI-6002');
    }
  });

  it('conservatively charges open reservations before recovery', () => {
    const fixture = createStartedV4Run('explain', 'recovery');
    const reserved = reserveAgentRunBudget(fixture.task, fixture.state, {
      ...v4Command(
        'event.recovery.reserve',
        'idempotency.recovery.reserve',
        V4_TIME.operation
      ),
      reservationId: 'reservation.recovery',
      demand: createV4Demand({ inputTokens: '1200', modelInvocations: 1 }),
    });
    expect(reserved.accepted).toBe(true);
    if (!reserved.accepted) return;
    const operating = startAgentRunOperation(fixture.task, reserved.state, {
      ...v4Command(
        'event.recovery.operation',
        'idempotency.recovery.operation',
        V4_TIME.settle
      ),
      operationId: 'invocation.recovery.1',
      kind: 'model-stream',
      request: { contextPackDigest: v4Digest('context') },
    });
    expect(operating.accepted).toBe(true);
    if (!operating.accepted) return;

    const recovered = recoverAgentRun(fixture.task, operating.state, {
      position: 'model-stream',
      attemptId: 'attempt.recovery.2',
      eventIdPrefix: 'event.recovery',
      idempotencyKeyPrefix: 'idempotency.recovery',
      occurredAt: V4_TIME.cancel,
      producer: v4Command('unused', 'unused', V4_TIME.cancel).producer,
    });
    expect(recovered.recovered).toBe(true);
    if (!recovered.recovered) return;
    const settlement = recovered.state.budgetLedger.reservations[0]?.settlement;
    expect(settlement).toMatchObject({
      requiresReconciliation: true,
      reconciliationReason: 'provider-disconnect',
    });
    expect(settlement?.charged).toEqual(
      recovered.state.budgetLedger.reservations[0]?.demand
    );
    expect(recovered.receipt).toMatchObject({
      action: 'restart-model-invocation',
      fromGeneration: 1,
      toGeneration: 2,
      settledReservationIds: ['reservation.recovery'],
    });
    expect(recovered.state.pendingOperation).toBeUndefined();
  });

  it('rejects a valid foreign ledger that skips the current reservation lineage', () => {
    const fixture = createStartedV4Run('explain', 'foreign-ledger');
    const foreignReserved = reserveAgentBudget(
      createAgentBudgetLedger(fixture.task.spec.budget),
      {
        reservationId: 'reservation.foreign',
        expectedRevision: 0,
        demand: createV4Demand({ inputTokens: '1200', modelInvocations: 1 }),
        reservedAt: V4_TIME.operation,
      }
    );
    expect(foreignReserved.ok).toBe(true);
    if (!foreignReserved.ok) return;
    const foreignSettled = reconcileAgentBudgetReservation(
      foreignReserved.state,
      {
        reservationId: 'reservation.foreign',
        expectedRevision: 1,
        reason: 'worker-loss',
        settledAt: V4_TIME.settle,
      }
    );
    expect(foreignSettled.ok).toBe(true);
    if (!foreignSettled.ok) return;
    const forgedEvent = createAgentControlEvent(fixture.state, {
      ...v4Command(
        'event.foreign-ledger',
        'idempotency.foreign-ledger',
        V4_TIME.settle
      ),
      type: 'budget.reconciled',
      data: Object.freeze({
        reservationId: 'reservation.foreign',
        budgetLedger: foreignSettled.state,
      }),
    });
    expect(
      reduceAgentRun(fixture.task, fixture.state, forgedEvent).accepted
    ).toBe(false);
  });

  it('rejects a digest-valid ledger whose accumulated usage exceeds its budget', () => {
    const fixture = createStartedV4Run('explain', 'forged-over-budget');
    const reserved = reserveAgentBudget(
      createAgentBudgetLedger(fixture.task.spec.budget),
      {
        reservationId: 'reservation.over-budget',
        expectedRevision: 0,
        demand: createV4Demand({ inputTokens: '100', modelInvocations: 1 }),
        reservedAt: V4_TIME.operation,
      }
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const base = Object.freeze({
      budget: Object.freeze({
        ...reserved.state.budget,
        maxModelInvocations: 0,
      }),
      revision: reserved.state.revision,
      reservations: reserved.state.reservations,
    });
    const forged = Object.freeze({
      ...base,
      ledgerDigest: digestAgentCanonicalValue(base),
    });
    expect(isAgentBudgetLedgerState(forged)).toBe(false);
  });

  it('preserves lineage when a new reservation sorts before existing entries', () => {
    const fixture = createStartedV4Run(
      'explain',
      'canonical-reservation-insert'
    );
    const first = reserveAgentRunBudget(fixture.task, fixture.state, {
      ...v4Command(
        'event.budget.reserve.z',
        'idempotency.budget.reserve.z',
        V4_TIME.operation
      ),
      reservationId: 'reservation.z',
      demand: createV4Demand({ inputTokens: '100', modelInvocations: 1 }),
    });
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const second = reserveAgentRunBudget(fixture.task, first.state, {
      ...v4Command(
        'event.budget.reserve.a',
        'idempotency.budget.reserve.a',
        V4_TIME.settle
      ),
      reservationId: 'reservation.a',
      demand: createV4Demand({ inputTokens: '100', modelInvocations: 1 }),
    });
    expect(second.accepted).toBe(true);
    if (second.accepted) {
      expect(
        second.state.budgetLedger.reservations.map(
          ({ reservationId }) => reservationId
        )
      ).toEqual(['reservation.a', 'reservation.z']);
    }
  });

  it.each([
    ['awaiting-approval', 'awaiting-approval', 'resume-approval-wait'],
    ['commit-ack', 'committing', 'reconcile-commit-ack'],
    ['verification', 'verifying', 'resume-verification'],
  ] as const)(
    'recovers %s without blindly repeating the prior effect',
    (position, phase, action) => {
      const fixture = createStartedV4Run('apply', `recover-${position}`);
      const phased = transitionAgentRunPhase(fixture.task, fixture.state, {
        ...v4Command(
          `event.${position}.phase`,
          `idempotency.${position}.phase`,
          V4_TIME.operation
        ),
        phase,
      });
      expect(phased.accepted).toBe(true);
      if (!phased.accepted) return;
      const recovered = recoverAgentRun(fixture.task, phased.state, {
        position,
        attemptId: `attempt.${position}.2`,
        eventIdPrefix: `event.${position}.recover`,
        idempotencyKeyPrefix: `idempotency.${position}.recover`,
        occurredAt: V4_TIME.settle,
        producer: v4Command('unused', 'unused', V4_TIME.settle).producer,
      });
      expect(recovered.recovered).toBe(true);
      if (recovered.recovered) {
        expect(recovered.receipt.action).toBe(action);
        expect(recovered.state.run.phase).toBe(phase);
      }
    }
  );
});
