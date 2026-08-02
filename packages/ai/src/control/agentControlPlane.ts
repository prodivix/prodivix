import type {
  AgentPrincipalRef,
  AgentRunOutcome,
  AgentRunPhase,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentToolCallReceipt } from '../hosted/agentHosted.types';
import {
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
} from '../usage/agentBudgetLedger';
import type {
  AgentControlEventData,
  AgentControlEventType,
  AgentRunPendingOperationKind,
  AgentRunSnapshot,
  AgentRunSuccessProof,
  AgentRunTransitionResult,
  AgentTaskRecord,
} from './agentControl.types';
import { controlIssue } from './agentControlValidation';
import {
  createAgentControlEvent,
  createAgentRunAttempt,
  createAgentRunPendingOperation,
  createInitialAgentRunSnapshot,
} from './agentRunFacts';
import { reduceAgentRun } from './agentRunReducer';

export type AgentControlCommandIdentity = Readonly<{
  eventId: string;
  idempotencyKey: string;
  occurredAt: string;
  producer: AgentPrincipalRef;
}>;

const reject = (
  state: AgentRunSnapshot,
  code: Parameters<typeof controlIssue>[0],
  path: string,
  message: string,
  auditOnly = false
): AgentRunTransitionResult =>
  Object.freeze({
    accepted: false,
    auditOnly,
    state,
    issues: Object.freeze([controlIssue(code, path, message)]),
  });

const dispatch = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  command: AgentControlCommandIdentity &
    Readonly<{
      type: AgentControlEventType;
      data?: AgentControlEventData;
      payload?: unknown;
      requestIdentity?: unknown;
      generation?: number;
      secretCanaries?: readonly string[];
    }>
): AgentRunTransitionResult => {
  try {
    return reduceAgentRun(task, state, createAgentControlEvent(state, command));
  } catch (error) {
    return reject(
      state,
      'AI-9001',
      '/',
      error instanceof Error ? error.message : 'Agent control command failed.'
    );
  }
};

export const createAgentRunControl = (
  task: AgentTaskRecord,
  input: Readonly<{
    runId: string;
    command: AgentControlCommandIdentity;
  }>
): AgentRunTransitionResult => {
  const initial = createInitialAgentRunSnapshot(task, {
    runId: input.runId,
    createdAt: input.command.occurredAt,
  });
  return dispatch(task, initial, {
    ...input.command,
    type: 'run.created',
    payload: Object.freeze({ taskDigest: task.taskDigest }),
    requestIdentity: Object.freeze({
      operation: 'create-run',
      taskDigest: task.taskDigest,
      runId: input.runId,
    }),
  });
};

export const startAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity & Readonly<{ attemptId: string }>
): AgentRunTransitionResult => {
  const generation = state.run.generation + 1;
  const attempt = createAgentRunAttempt({
    attemptId: input.attemptId,
    attempt: 1,
    generation,
    reason: 'initial',
    startedAt: input.occurredAt,
  });
  return dispatch(task, state, {
    ...input,
    type: 'run.started',
    generation,
    data: Object.freeze({ phase: 'preparing', attempt }),
    payload: Object.freeze({ attemptDigest: attempt.attemptDigest }),
  });
};

export const transitionAgentRunPhase = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity & Readonly<{ phase: AgentRunPhase }>
): AgentRunTransitionResult =>
  dispatch(task, state, {
    ...input,
    type: 'run.phase-changed',
    data: Object.freeze({ phase: input.phase }),
    payload: Object.freeze({ phase: input.phase }),
  });

export const retryAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{
      attemptId: string;
      reason?: 'retry' | 'provider-disconnect';
    }>
): AgentRunTransitionResult => {
  const generation = state.run.generation + 1;
  const previous = state.attempts.at(-1);
  if (!previous) {
    return reject(
      state,
      'AI-6004',
      '/attempt',
      'AgentRun retry requires an existing attempt.'
    );
  }
  const reason = input.reason ?? 'retry';
  const attempt = createAgentRunAttempt({
    attemptId: input.attemptId,
    attempt: state.run.attempt + 1,
    generation,
    reason,
    parentAttemptId: previous.attemptId,
    startedAt: input.occurredAt,
  });
  return dispatch(task, state, {
    ...input,
    type: reason === 'retry' ? 'run.retry-started' : 'run.recovery-started',
    generation,
    data: Object.freeze({
      phase: 'preparing',
      attempt,
      reason,
    }),
    payload: Object.freeze({
      attemptDigest: attempt.attemptDigest,
      parentAttemptDigest: previous.attemptDigest,
      reason,
    }),
  });
};

export const startAgentRunOperation = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{
      operationId: string;
      kind: Extract<
        AgentRunPendingOperationKind,
        'model-stream' | 'tool-execution'
      >;
      request: unknown;
    }>
): AgentRunTransitionResult => {
  const requestDigest = digestAgentCanonicalValue(input.request);
  const operation = createAgentRunPendingOperation({
    operationId: input.operationId,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey,
    requestDigest,
    generation: state.run.generation,
    state: 'started',
    callbackAuthority: 'active',
    startedAt: input.occurredAt,
  });
  return dispatch(task, state, {
    ...input,
    type: input.kind === 'model-stream' ? 'model.started' : 'tool.started',
    data: Object.freeze({ operation }),
    payload: Object.freeze({
      operationId: operation.operationId,
      operationDigest: operation.operationDigest,
    }),
    requestIdentity: Object.freeze({
      operation: 'start-operation',
      operationId: input.operationId,
      kind: input.kind,
      requestDigest,
    }),
  });
};

export const settleAgentRunOperation = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{
      status: 'completed' | 'failed' | 'cancelled' | 'reconciliation-required';
      resultDigest?: string;
    }>
): AgentRunTransitionResult => {
  const pending = state.pendingOperation;
  if (!pending || pending.state !== 'started') {
    return reject(
      state,
      'AI-6003',
      '/pendingOperation',
      'AgentRun has no current operation to settle.',
      true
    );
  }
  let operation;
  try {
    operation = createAgentRunPendingOperation({
      operationId: pending.operationId,
      kind: pending.kind,
      idempotencyKey: pending.idempotencyKey,
      requestDigest: pending.requestDigest,
      generation: pending.generation,
      state:
        input.status === 'completed'
          ? 'settled'
          : input.status === 'reconciliation-required'
            ? 'reconciliation-required'
            : 'cancelled',
      callbackAuthority: 'revoked',
      startedAt: pending.startedAt,
      settledAt: input.occurredAt,
      ...(input.resultDigest ? { resultDigest: input.resultDigest } : {}),
    });
  } catch (error) {
    return reject(
      state,
      'AI-6003',
      '/operation',
      error instanceof Error ? error.message : 'Operation receipt is invalid.',
      true
    );
  }
  const type: AgentControlEventType =
    pending.kind === 'model-stream'
      ? input.status === 'completed'
        ? 'model.completed'
        : 'model.failed'
      : input.status === 'completed'
        ? 'tool.completed'
        : input.status === 'cancelled'
          ? 'tool.cancelled'
          : 'tool.rejected';
  return dispatch(task, state, {
    ...input,
    type,
    data: Object.freeze({ operation }),
    payload: Object.freeze({
      operationId: operation.operationId,
      operationDigest: operation.operationDigest,
    }),
    requestIdentity: Object.freeze({
      operation: 'settle-operation',
      operationId: operation.operationId,
      status: input.status,
      resultDigest: input.resultDigest ?? null,
    }),
  });
};

export const reserveAgentRunBudget = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{ reservationId: string; demand: AgentBudgetDemand }>
): AgentRunTransitionResult => {
  const reserved = reserveAgentBudget(state.budgetLedger, {
    reservationId: input.reservationId,
    expectedRevision: state.budgetLedger.revision,
    demand: input.demand,
    reservedAt: input.occurredAt,
  });
  if (!reserved.ok) {
    return Object.freeze({
      accepted: false,
      auditOnly: false,
      state,
      issues: reserved.issues,
    });
  }
  return dispatch(task, state, {
    ...input,
    type: 'budget.reserved',
    data: Object.freeze({
      reservationId: input.reservationId,
      budgetLedger: reserved.state,
    }),
    payload: Object.freeze({
      reservationId: input.reservationId,
      demandDigest: reserved.reservation.demandDigest,
      ledgerDigest: reserved.state.ledgerDigest,
    }),
    requestIdentity: Object.freeze({
      operation: 'reserve-budget',
      reservationId: input.reservationId,
      demandDigest: reserved.reservation.demandDigest,
    }),
  });
};

export const settleAgentRunBudget = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{ reservationId: string; actual: AgentBudgetDemand }>
): AgentRunTransitionResult => {
  const settled = settleAgentBudget(state.budgetLedger, {
    reservationId: input.reservationId,
    expectedRevision: state.budgetLedger.revision,
    actual: input.actual,
    settledAt: input.occurredAt,
  });
  if (!settled.ok) {
    return Object.freeze({
      accepted: false,
      auditOnly: false,
      state,
      issues: settled.issues,
    });
  }
  return dispatch(task, state, {
    ...input,
    type: 'budget.settled',
    data: Object.freeze({
      reservationId: input.reservationId,
      budgetLedger: settled.state,
    }),
    payload: Object.freeze({
      reservationId: input.reservationId,
      settlementDigest: settled.reservation.settlement?.settlementDigest ?? '',
      ledgerDigest: settled.state.ledgerDigest,
    }),
    requestIdentity: Object.freeze({
      operation: 'settle-budget',
      reservationId: input.reservationId,
      settlementDigest: settled.reservation.settlement?.settlementDigest ?? '',
    }),
  });
};

export const cancelAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{ reason: string; timeout?: boolean }>
): AgentRunTransitionResult =>
  dispatch(task, state, {
    ...input,
    type: input.timeout ? 'run.timeout-requested' : 'run.cancel-requested',
    generation: state.run.generation + 1,
    data: Object.freeze({ reason: input.reason }),
    payload: Object.freeze({ reason: input.reason }),
    requestIdentity: Object.freeze({
      operation: input.timeout ? 'timeout-run' : 'cancel-run',
      reason: input.reason,
    }),
  });

export const acknowledgeAgentRunCleanup = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{ cleanupState: 'clean' | 'residual'; receiptDigest: string }>
): AgentRunTransitionResult =>
  dispatch(task, state, {
    ...input,
    type: 'cleanup.acknowledged',
    data: Object.freeze({
      cleanupState: input.cleanupState,
      receiptDigest: input.receiptDigest,
    }),
    payload: Object.freeze({
      cleanupState: input.cleanupState,
      receiptDigest: input.receiptDigest,
    }),
  });

export const finalizeAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{
      outcome: AgentRunOutcome;
      successProof?: AgentRunSuccessProof;
      receiptDigest?: string;
      diagnosticCode?: string;
    }>
): AgentRunTransitionResult =>
  dispatch(task, state, {
    ...input,
    type: 'run.terminal',
    data: Object.freeze({
      outcome: input.outcome,
      ...(input.successProof ? { successProof: input.successProof } : {}),
      ...(input.receiptDigest ? { receiptDigest: input.receiptDigest } : {}),
      ...(input.diagnosticCode ? { diagnosticCode: input.diagnosticCode } : {}),
    }),
    payload: Object.freeze({
      outcome: input.outcome,
      proofDigest: input.successProof
        ? digestAgentCanonicalValue(input.successProof)
        : null,
      receiptDigest: input.receiptDigest ?? null,
      diagnosticCode: input.diagnosticCode ?? null,
    }),
  });

export const recordFencedAgentCallback = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{
      callbackGeneration: number;
      reason: string;
      receiptDigest?: string;
    }>
): AgentRunTransitionResult =>
  dispatch(task, state, {
    ...input,
    type: 'callback.rejected',
    data: Object.freeze({
      callbackGeneration: input.callbackGeneration,
      reason: input.reason,
      ...(input.receiptDigest ? { receiptDigest: input.receiptDigest } : {}),
    }),
    payload: Object.freeze({
      callbackGeneration: input.callbackGeneration,
      reason: input.reason,
      receiptDigest: input.receiptDigest ?? null,
    }),
  });

/** Bridges a completed V3 tool receipt into the V4 event-sourced Run. */
export const recordAgentToolCallReceipt = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  input: AgentControlCommandIdentity &
    Readonly<{ receipt: AgentToolCallReceipt }>
): AgentRunTransitionResult => {
  const { receipt } = input;
  const pending = state.pendingOperation;
  if (
    !pending ||
    pending.kind !== 'tool-execution' ||
    receipt.identity.taskId !== state.run.taskId ||
    receipt.identity.runId !== state.run.runId ||
    receipt.identity.generation !== state.run.generation ||
    receipt.identity.callId !== pending.operationId ||
    receipt.lifecycle.at(-1) !== 'cleaned'
  ) {
    return reject(
      state,
      'AI-6003',
      '/receipt',
      'Tool receipt lost exact Run generation or cleanup authority.',
      true
    );
  }
  return settleAgentRunOperation(task, state, {
    ...input,
    status:
      receipt.terminalStatus === 'succeeded'
        ? 'completed'
        : receipt.terminalStatus === 'cancelled'
          ? 'cancelled'
          : 'reconciliation-required',
    resultDigest: receipt.receiptDigest,
  });
};
