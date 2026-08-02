import type { AgentPrincipalRef } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { reconcileAgentBudgetReservation } from '../usage/agentBudgetLedger';
import type {
  AgentControlEvent,
  AgentControlIssue,
  AgentRecoveryAction,
  AgentRecoveryPosition,
  AgentRecoveryReceipt,
  AgentRunSnapshot,
  AgentTaskRecord,
} from './agentControl.types';
import { controlIssue } from './agentControlValidation';
import {
  createAgentControlEvent,
  createAgentRunAttempt,
} from './agentRunFacts';
import { reduceAgentRun } from './agentRunReducer';

export type AgentRecoveryResult =
  | Readonly<{
      recovered: true;
      state: AgentRunSnapshot;
      events: readonly AgentControlEvent[];
      receipt: AgentRecoveryReceipt;
    }>
  | Readonly<{
      recovered: false;
      state: AgentRunSnapshot;
      issues: readonly AgentControlIssue[];
    }>;

const actionForPosition = (
  position: AgentRecoveryPosition
): AgentRecoveryAction => {
  switch (position) {
    case 'model-stream':
      return 'restart-model-invocation';
    case 'tool-execute':
      return 'reconcile-tool-call';
    case 'awaiting-approval':
      return 'resume-approval-wait';
    case 'commit-ack':
      return 'reconcile-commit-ack';
    case 'verification':
      return 'resume-verification';
  }
};

const phaseForPosition = (
  position: AgentRecoveryPosition
): Exclude<
  AgentRunSnapshot['run']['phase'],
  'queued' | 'terminal' | 'cancelling'
> => {
  switch (position) {
    case 'model-stream':
    case 'tool-execute':
      return 'preparing';
    case 'awaiting-approval':
      return 'awaiting-approval';
    case 'commit-ack':
      return 'committing';
    case 'verification':
      return 'verifying';
  }
};

const reconciliationReason = (
  position: AgentRecoveryPosition
): 'worker-loss' | 'provider-disconnect' | 'ack-loss' => {
  if (position === 'model-stream') return 'provider-disconnect';
  if (position === 'commit-ack') return 'ack-loss';
  return 'worker-loss';
};

const failure = (
  state: AgentRunSnapshot,
  message: string,
  path = '/recovery'
): AgentRecoveryResult =>
  Object.freeze({
    recovered: false,
    state,
    issues: Object.freeze([controlIssue('AI-6004', path, message)]),
  });

/**
 * Reclaims a non-terminal Run after process/provider loss. Every open budget
 * reservation is charged at its conservative upper bound before a new
 * generation is allowed to proceed.
 */
export const recoverAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: Readonly<{
    position: AgentRecoveryPosition;
    attemptId: string;
    eventIdPrefix: string;
    idempotencyKeyPrefix: string;
    occurredAt: string;
    producer: AgentPrincipalRef;
  }>
): AgentRecoveryResult => {
  if (
    state.run.phase === 'queued' ||
    state.run.phase === 'terminal' ||
    state.run.phase === 'cancelling'
  ) {
    return failure(state, 'AgentRun phase cannot be recovered automatically.');
  }
  const events: AgentControlEvent[] = [];
  const settledReservationIds: string[] = [];
  let current = state;
  let reservationIndex = 0;
  for (const reservation of state.budgetLedger.reservations) {
    if (reservation.status !== 'reserved') continue;
    const reconciled = reconcileAgentBudgetReservation(current.budgetLedger, {
      reservationId: reservation.reservationId,
      expectedRevision: current.budgetLedger.revision,
      reason: reconciliationReason(input.position),
      settledAt: input.occurredAt,
    });
    if (!reconciled.ok) {
      return Object.freeze({
        recovered: false,
        state: current,
        issues: reconciled.issues,
      });
    }
    const event = createAgentControlEvent(current, {
      eventId: `${input.eventIdPrefix}.budget.${reservationIndex}`,
      idempotencyKey: `${input.idempotencyKeyPrefix}.budget.${reservationIndex}`,
      occurredAt: input.occurredAt,
      producer: input.producer,
      type: 'budget.reconciled',
      data: Object.freeze({
        reservationId: reservation.reservationId,
        budgetLedger: reconciled.state,
        receiptDigest: reconciled.reservation.settlement?.settlementDigest,
      }),
      payload: Object.freeze({
        reservationId: reservation.reservationId,
        reconciliationReason: reconciliationReason(input.position),
        settlementDigest:
          reconciled.reservation.settlement?.settlementDigest ?? null,
      }),
    });
    const reduced = reduceAgentRun(task, current, event);
    if (!reduced.accepted) {
      return Object.freeze({
        recovered: false,
        state: current,
        issues: reduced.issues,
      });
    }
    current = reduced.state;
    events.push(event);
    settledReservationIds.push(reservation.reservationId);
    reservationIndex += 1;
  }

  const previousAttempt = current.attempts.at(-1);
  if (!previousAttempt) {
    return failure(
      current,
      'AgentRun recovery requires an existing attempt lineage.',
      '/attempts'
    );
  }
  const generation = current.run.generation + 1;
  const attempt = createAgentRunAttempt({
    attemptId: input.attemptId,
    attempt: current.run.attempt + 1,
    generation,
    reason:
      input.position === 'model-stream'
        ? 'provider-disconnect'
        : 'process-recovery',
    parentAttemptId: previousAttempt.attemptId,
    startedAt: input.occurredAt,
  });
  const receiptBase = {
    taskId: current.run.taskId,
    runId: current.run.runId,
    fromGeneration: state.run.generation,
    toGeneration: generation,
    position: input.position,
    action: actionForPosition(input.position),
    settledReservationIds: Object.freeze(settledReservationIds),
    ...(state.pendingOperation
      ? { operationId: state.pendingOperation.operationId }
      : {}),
    recoveredAt: input.occurredAt,
  } as const;
  const receipt: AgentRecoveryReceipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  let event: AgentControlEvent;
  try {
    event = createAgentControlEvent(current, {
      eventId: `${input.eventIdPrefix}.recovery`,
      idempotencyKey: `${input.idempotencyKeyPrefix}.recovery`,
      occurredAt: input.occurredAt,
      producer: input.producer,
      type: 'run.recovery-started',
      generation,
      data: Object.freeze({
        phase: phaseForPosition(input.position),
        attempt,
        receiptDigest: receipt.receiptDigest,
        reason: input.position,
      }),
      payload: receipt,
      requestIdentity: Object.freeze({
        operation: 'recover-run',
        receipt,
      }),
    });
  } catch (error) {
    return failure(
      current,
      error instanceof Error ? error.message : 'Recovery event is invalid.'
    );
  }
  const reduced = reduceAgentRun(task, current, event);
  if (!reduced.accepted) {
    return Object.freeze({
      recovered: false,
      state: current,
      issues: reduced.issues,
    });
  }
  events.push(event);
  return Object.freeze({
    recovered: true,
    state: reduced.state,
    events: Object.freeze(events),
    receipt,
  });
};
