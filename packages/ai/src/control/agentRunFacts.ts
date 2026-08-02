import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentPrincipalRef,
  AgentRun,
  AgentRunOutcome,
  AgentRunPhase,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
} from '../domain/agentCanonical';
import {
  createAgentBudgetLedger,
  isAgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';
import { sanitizeAgentAuditPayload } from './agentAuditSanitizer';
import type {
  AgentControlEvent,
  AgentControlEventData,
  AgentControlEventType,
  AgentRunAttempt,
  AgentRunAttemptReason,
  AgentRunPendingOperation,
  AgentRunPendingOperationKind,
  AgentRunSnapshot,
  AgentRunSuccessProof,
  AgentTaskRecord,
} from './agentControl.types';
import {
  AGENT_CONTROL_MAXIMUM_EVENTS,
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from './agentControlValidation';
import { isAgentTaskRecord } from './agentTask';

const runPhases = new Set<AgentRunPhase>([
  'queued',
  'preparing',
  'running',
  'awaiting-approval',
  'committing',
  'verifying',
  'repairing',
  'cancelling',
  'terminal',
]);
const runOutcomes = new Set<AgentRunOutcome>([
  'succeeded',
  'failed',
  'blocked',
  'cancelled',
  'budget-exhausted',
  'infrastructure-error',
]);
const attemptReasons = new Set<AgentRunAttemptReason>([
  'initial',
  'retry',
  'process-recovery',
  'provider-disconnect',
]);
const operationKinds = new Set<AgentRunPendingOperationKind>([
  'model-stream',
  'tool-execution',
  'awaiting-approval',
  'commit-ack',
  'verification',
]);
const operationStates = new Set([
  'started',
  'reconciliation-required',
  'settled',
  'cancelled',
]);
const eventTypes = new Set<AgentControlEventType>([
  'run.created',
  'run.started',
  'run.phase-changed',
  'run.cancel-requested',
  'run.timeout-requested',
  'run.retry-started',
  'run.recovery-started',
  'run.terminal',
  'model.started',
  'model.completed',
  'model.failed',
  'tool.authorized',
  'tool.started',
  'tool.completed',
  'tool.cancelled',
  'tool.rejected',
  'budget.reserved',
  'budget.settled',
  'budget.reconciled',
  'cleanup.acknowledged',
  'callback.rejected',
]);

const eventFamily = (
  type: AgentControlEventType
): AgentControlEvent['family'] => {
  if (type.startsWith('model.')) return 'model';
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('budget.')) return 'budget';
  if (type === 'callback.rejected') return 'security';
  return 'run';
};

const attemptBase = (
  value: Omit<AgentRunAttempt, 'attemptDigest'>
): Omit<AgentRunAttempt, 'attemptDigest'> => Object.freeze({ ...value });

export const createAgentRunAttempt = (
  value: Omit<AgentRunAttempt, 'attemptDigest'>
): AgentRunAttempt => {
  if (
    !isAgentControlIdentity(value.attemptId) ||
    !Number.isSafeInteger(value.attempt) ||
    value.attempt < 1 ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !attemptReasons.has(value.reason) ||
    (value.parentAttemptId !== undefined &&
      !isAgentControlIdentity(value.parentAttemptId)) ||
    (value.reason === 'initial' && value.parentAttemptId !== undefined) ||
    (value.reason !== 'initial' && value.parentAttemptId === undefined) ||
    !isAgentControlInstant(value.startedAt) ||
    (value.completedAt !== undefined &&
      (!isAgentControlInstant(value.completedAt) ||
        Date.parse(value.completedAt) < Date.parse(value.startedAt))) ||
    (value.outcome !== undefined &&
      !new Set([
        'succeeded',
        'failed',
        'blocked',
        'cancelled',
        'budget-exhausted',
        'infrastructure-error',
        'superseded',
      ]).has(value.outcome)) ||
    (value.failureDigest !== undefined &&
      !isAgentCanonicalDigest(value.failureDigest)) ||
    (value.completedAt === undefined) !== (value.outcome === undefined)
  ) {
    throw new TypeError('AgentRun attempt identity or lifecycle is invalid.');
  }
  const base = attemptBase(value);
  return Object.freeze({
    ...base,
    attemptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentRunAttempt = (value: unknown): value is AgentRunAttempt => {
  try {
    if (
      !hasExactAgentControlKeys(
        value,
        [
          'attemptId',
          'attempt',
          'generation',
          'reason',
          'startedAt',
          'attemptDigest',
        ],
        ['parentAttemptId', 'completedAt', 'outcome', 'failureDigest']
      ) ||
      !isAgentCanonicalDigest(value.attemptDigest)
    ) {
      return false;
    }
    const { attemptDigest, ...base } = value;
    return (
      createAgentRunAttempt(base as Omit<AgentRunAttempt, 'attemptDigest'>)
        .attemptDigest === attemptDigest
    );
  } catch {
    return false;
  }
};

const operationBase = (
  value: Omit<AgentRunPendingOperation, 'operationDigest'>
): Omit<AgentRunPendingOperation, 'operationDigest'> =>
  Object.freeze({ ...value });

export const createAgentRunPendingOperation = (
  value: Omit<AgentRunPendingOperation, 'operationDigest'>
): AgentRunPendingOperation => {
  if (
    !isAgentControlIdentity(value.operationId) ||
    !operationKinds.has(value.kind) ||
    !isAgentControlIdentity(value.idempotencyKey) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !operationStates.has(value.state) ||
    (value.callbackAuthority !== 'active' &&
      value.callbackAuthority !== 'revoked') ||
    !isAgentControlInstant(value.startedAt) ||
    (value.settledAt !== undefined &&
      (!isAgentControlInstant(value.settledAt) ||
        Date.parse(value.settledAt) < Date.parse(value.startedAt))) ||
    (value.resultDigest !== undefined &&
      !isAgentCanonicalDigest(value.resultDigest)) ||
    (value.state === 'started'
      ? value.settledAt !== undefined ||
        value.resultDigest !== undefined ||
        value.callbackAuthority !== 'active'
      : value.settledAt === undefined || value.callbackAuthority !== 'revoked')
  ) {
    throw new TypeError('AgentRun pending operation is invalid.');
  }
  const base = operationBase(value);
  return Object.freeze({
    ...base,
    operationDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentRunPendingOperation = (
  value: unknown
): value is AgentRunPendingOperation => {
  try {
    if (
      !hasExactAgentControlKeys(
        value,
        [
          'operationId',
          'kind',
          'idempotencyKey',
          'requestDigest',
          'generation',
          'state',
          'callbackAuthority',
          'startedAt',
          'operationDigest',
        ],
        ['settledAt', 'resultDigest']
      ) ||
      !isAgentCanonicalDigest(value.operationDigest)
    ) {
      return false;
    }
    const { operationDigest, ...base } = value;
    return (
      createAgentRunPendingOperation(
        base as Omit<AgentRunPendingOperation, 'operationDigest'>
      ).operationDigest === operationDigest
    );
  } catch {
    return false;
  }
};

export const isAgentRunSuccessProof = (
  value: unknown,
  expectedMode?: AgentTaskRecord['spec']['mode']
): value is AgentRunSuccessProof => {
  if (!value || typeof value !== 'object' || !('mode' in value)) return false;
  const record = value as Record<string, unknown>;
  const mode = record.mode;
  if (mode !== expectedMode && expectedMode !== undefined) return false;
  switch (mode) {
    case 'explain':
      return (
        hasExactAgentControlKeys(value, [
          'mode',
          'answerDigest',
          'groundingDigests',
        ]) &&
        isAgentCanonicalDigest(record.answerDigest) &&
        Array.isArray(record.groundingDigests) &&
        record.groundingDigests.length > 0 &&
        record.groundingDigests.length <= 512 &&
        record.groundingDigests.every(isAgentCanonicalDigest) &&
        new Set(record.groundingDigests).size === record.groundingDigests.length
      );
    case 'plan':
      return (
        hasExactAgentControlKeys(value, ['mode', 'planDigest']) &&
        isAgentCanonicalDigest(record.planDigest)
      );
    case 'propose':
      return (
        hasExactAgentControlKeys(value, [
          'mode',
          'proposalDigest',
          'previewDigest',
        ]) &&
        isAgentCanonicalDigest(record.proposalDigest) &&
        isAgentCanonicalDigest(record.previewDigest)
      );
    case 'apply':
      return (
        hasExactAgentControlKeys(value, [
          'mode',
          'proposalDigest',
          'approvalDigest',
          'transactionDigest',
          'commitAckDigest',
          'committedPlanDigest',
          'actualPlanDigest',
          'planCompatibility',
          'verificationClosureDigest',
          'verificationClosureOutcome',
        ]) &&
        [
          record.proposalDigest,
          record.approvalDigest,
          record.transactionDigest,
          record.commitAckDigest,
          record.committedPlanDigest,
          record.actualPlanDigest,
          record.verificationClosureDigest,
        ].every(isAgentCanonicalDigest) &&
        (record.planCompatibility === 'exact' ||
          record.planCompatibility === 'compatible') &&
        record.verificationClosureOutcome === 'satisfied'
      );
    default:
      return false;
  }
};

const snapshotBase = (
  value: Omit<AgentRunSnapshot, 'snapshotDigest'>
): Omit<AgentRunSnapshot, 'snapshotDigest'> => Object.freeze({ ...value });

export const createInitialAgentRunSnapshot = (
  task: AgentTaskRecord,
  input: Readonly<{ runId: string; createdAt: string }>
): AgentRunSnapshot => {
  if (
    !isAgentTaskRecord(task) ||
    !isAgentControlIdentity(input.runId) ||
    !isAgentControlInstant(input.createdAt) ||
    Date.parse(input.createdAt) < Date.parse(task.spec.createdAt)
  ) {
    throw new TypeError('Initial AgentRun identity is invalid.');
  }
  const run: AgentRun = Object.freeze({
    runId: input.runId,
    taskId: task.spec.taskId,
    generation: 0,
    attempt: 0,
    phase: 'queued',
    baseRevision: task.spec.baseRevision,
    policyDigest: task.spec.policyDigest,
    grantRef: task.spec.initialGrantRef,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
  return createAgentRunSnapshot({
    run,
    taskDigest: task.taskDigest,
    cursor: 0,
    callbackAuthority: 'revoked',
    attempts: Object.freeze([]),
    budgetLedger: createAgentBudgetLedger(task.spec.budget),
    cleanupState: 'not-required',
    processedEvents: Object.freeze([]),
  });
};

export const createAgentRunSnapshot = (
  value: Omit<AgentRunSnapshot, 'snapshotDigest'>
): AgentRunSnapshot => {
  const base = snapshotBase(value);
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentRun = (value: unknown): value is AgentRun => {
  if (
    !hasExactAgentControlKeys(
      value,
      [
        'runId',
        'taskId',
        'generation',
        'attempt',
        'phase',
        'baseRevision',
        'policyDigest',
        'grantRef',
        'createdAt',
        'updatedAt',
      ],
      ['outcome', 'contextPackDigest', 'latestEventDigest']
    ) ||
    !isAgentControlIdentity(value.runId) ||
    !isAgentControlIdentity(value.taskId) ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 0 ||
    !Number.isSafeInteger(value.attempt) ||
    Number(value.attempt) < 0 ||
    !runPhases.has(value.phase as AgentRunPhase) ||
    !isAgentWorkspaceRevisionVector(value.baseRevision) ||
    !sameCanonicalJson(
      canonicalizeAgentWorkspaceRevision(value.baseRevision),
      value.baseRevision
    ) ||
    !isAgentCanonicalDigest(value.policyDigest) ||
    !hasExactAgentControlKeys(value.grantRef, ['grantId']) ||
    !isAgentControlIdentity(value.grantRef.grantId) ||
    !isAgentControlInstant(value.createdAt) ||
    !isAgentControlInstant(value.updatedAt) ||
    Date.parse(value.updatedAt) < Date.parse(value.createdAt) ||
    (value.contextPackDigest !== undefined &&
      !isAgentCanonicalDigest(value.contextPackDigest)) ||
    (value.latestEventDigest !== undefined &&
      !isAgentCanonicalDigest(value.latestEventDigest))
  ) {
    return false;
  }
  return value.phase === 'terminal'
    ? runOutcomes.has(value.outcome as AgentRunOutcome)
    : value.outcome === undefined;
};

export const isAgentRunSnapshot = (
  value: unknown
): value is AgentRunSnapshot => {
  if (
    inspectAgentControlJson(value).length > 0 ||
    !hasExactAgentControlKeys(
      value,
      [
        'run',
        'taskDigest',
        'cursor',
        'callbackAuthority',
        'attempts',
        'budgetLedger',
        'cleanupState',
        'processedEvents',
        'snapshotDigest',
      ],
      ['pendingOperation']
    ) ||
    !isAgentRun(value.run) ||
    !isAgentCanonicalDigest(value.taskDigest) ||
    !Number.isSafeInteger(value.cursor) ||
    Number(value.cursor) < 0 ||
    (value.callbackAuthority !== 'active' &&
      value.callbackAuthority !== 'revoked') ||
    !Array.isArray(value.attempts) ||
    !value.attempts.every(isAgentRunAttempt) ||
    !isAgentBudgetLedgerState(
      value.budgetLedger as AgentRunSnapshot['budgetLedger']
    ) ||
    (value.pendingOperation !== undefined &&
      !isAgentRunPendingOperation(value.pendingOperation)) ||
    !new Set(['not-required', 'pending', 'clean', 'residual']).has(
      String(value.cleanupState)
    ) ||
    !Array.isArray(value.processedEvents) ||
    value.processedEvents.length > AGENT_CONTROL_MAXIMUM_EVENTS ||
    !isAgentCanonicalDigest(value.snapshotDigest)
  ) {
    return false;
  }
  const attempts = value.attempts as readonly AgentRunAttempt[];
  if (
    attempts.some(
      (attempt, index) =>
        attempt.attempt !== index + 1 ||
        (index > 0 &&
          attempt.parentAttemptId !== attempts[index - 1]?.attemptId)
    ) ||
    value.run.attempt !== attempts.length ||
    value.run.generation < (attempts.at(-1)?.generation ?? 0)
  ) {
    return false;
  }
  const processed =
    value.processedEvents as AgentRunSnapshot['processedEvents'];
  if (
    processed.length !== value.cursor ||
    new Set(processed.map(({ eventId }) => eventId)).size !==
      processed.length ||
    new Set(processed.map(({ idempotencyKey }) => idempotencyKey)).size !==
      processed.length ||
    processed.some(
      (entry) =>
        !hasExactAgentControlKeys(entry, [
          'eventId',
          'idempotencyKey',
          'type',
          'requestDigest',
          'eventDigest',
        ]) ||
        !isAgentControlIdentity(entry.eventId) ||
        !isAgentControlIdentity(entry.idempotencyKey) ||
        !eventTypes.has(entry.type) ||
        !isAgentCanonicalDigest(entry.requestDigest) ||
        !isAgentCanonicalDigest(entry.eventDigest)
    ) ||
    value.run.latestEventDigest !== processed.at(-1)?.eventDigest ||
    (value.cursor === 0 && value.run.latestEventDigest !== undefined)
  ) {
    return false;
  }
  const { snapshotDigest, ...base } = value;
  return digestAgentCanonicalValue(base) === snapshotDigest;
};

const validateEventData = (
  type: AgentControlEventType,
  data: AgentControlEventData
): boolean => {
  if (
    !hasExactAgentControlKeys(
      data,
      [],
      [
        'phase',
        'outcome',
        'attempt',
        'operation',
        'reservationId',
        'budgetLedger',
        'successProof',
        'cleanupState',
        'callbackGeneration',
        'receiptDigest',
        'diagnosticCode',
        'reason',
      ]
    ) ||
    (data.phase !== undefined && !runPhases.has(data.phase)) ||
    (data.outcome !== undefined && !runOutcomes.has(data.outcome)) ||
    (data.attempt !== undefined && !isAgentRunAttempt(data.attempt)) ||
    (data.operation !== undefined &&
      !isAgentRunPendingOperation(data.operation)) ||
    (data.reservationId !== undefined &&
      !isAgentControlIdentity(data.reservationId)) ||
    (data.budgetLedger !== undefined &&
      !isAgentBudgetLedgerState(data.budgetLedger)) ||
    (data.successProof !== undefined &&
      !isAgentRunSuccessProof(data.successProof)) ||
    (data.cleanupState !== undefined &&
      !new Set(['not-required', 'pending', 'clean', 'residual']).has(
        data.cleanupState
      )) ||
    (data.callbackGeneration !== undefined &&
      (!Number.isSafeInteger(data.callbackGeneration) ||
        data.callbackGeneration < 0)) ||
    (data.receiptDigest !== undefined &&
      !isAgentCanonicalDigest(data.receiptDigest)) ||
    (data.diagnosticCode !== undefined &&
      !/^AI-[0-9]{4}$/u.test(data.diagnosticCode)) ||
    (data.reason !== undefined &&
      (typeof data.reason !== 'string' ||
        data.reason.length > 512 ||
        containsAgentControlCredentialLikeText(data.reason)))
  ) {
    return false;
  }
  switch (type) {
    case 'run.started':
    case 'run.retry-started':
    case 'run.recovery-started':
      return data.attempt !== undefined && data.phase !== undefined;
    case 'run.phase-changed':
      return data.phase !== undefined;
    case 'run.cancel-requested':
    case 'run.timeout-requested':
      return data.reason !== undefined;
    case 'run.terminal':
      return data.outcome !== undefined;
    case 'model.started':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'model-stream' &&
        data.operation.state === 'started'
      );
    case 'tool.started':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'tool-execution' &&
        data.operation.state === 'started'
      );
    case 'model.completed':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'model-stream' &&
        data.operation.state === 'settled'
      );
    case 'model.failed':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'model-stream' &&
        (data.operation.state === 'cancelled' ||
          data.operation.state === 'reconciliation-required')
      );
    case 'tool.completed':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'tool-execution' &&
        data.operation.state === 'settled'
      );
    case 'tool.cancelled':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'tool-execution' &&
        data.operation.state === 'cancelled'
      );
    case 'tool.rejected':
      return (
        data.operation !== undefined &&
        data.operation.kind === 'tool-execution' &&
        (data.operation.state === 'cancelled' ||
          data.operation.state === 'reconciliation-required')
      );
    case 'budget.reserved':
    case 'budget.settled':
    case 'budget.reconciled':
      return (
        data.reservationId !== undefined && data.budgetLedger !== undefined
      );
    case 'cleanup.acknowledged':
      return data.cleanupState === 'clean' || data.cleanupState === 'residual';
    case 'callback.rejected':
      return data.callbackGeneration !== undefined && data.reason !== undefined;
    case 'run.created':
    case 'tool.authorized':
      return true;
  }
};

const eventBase = (
  event: Omit<AgentControlEvent, 'eventDigest'>
): Omit<AgentControlEvent, 'eventDigest'> => Object.freeze({ ...event });

export const createAgentControlEvent = (
  state: AgentRunSnapshot,
  input: Readonly<{
    eventId: string;
    type: AgentControlEventType;
    producer: AgentPrincipalRef;
    occurredAt: string;
    idempotencyKey: string;
    data?: AgentControlEventData;
    payload?: unknown;
    requestIdentity?: unknown;
    generation?: number;
    secretCanaries?: readonly string[];
  }>
): AgentControlEvent => {
  if (!isAgentRunSnapshot(state)) {
    throw new TypeError(
      'Cannot append an event to an invalid AgentRun snapshot.'
    );
  }
  const data = Object.freeze({ ...(input.data ?? {}) });
  if (
    !isAgentControlIdentity(input.eventId) ||
    !eventTypes.has(input.type) ||
    !hasExactAgentControlKeys(input.producer, ['kind', 'principalId']) ||
    (input.producer.kind !== 'user' && input.producer.kind !== 'service') ||
    !isAgentControlIdentity(input.producer.principalId) ||
    !isAgentControlInstant(input.occurredAt) ||
    Date.parse(input.occurredAt) < Date.parse(state.run.updatedAt) ||
    !isAgentControlIdentity(input.idempotencyKey) ||
    !validateEventData(input.type, data) ||
    (data.reason !== undefined &&
      input.secretCanaries?.some(
        (canary) => canary.length > 0 && data.reason!.includes(canary)
      ))
  ) {
    throw new TypeError('Agent control event input is invalid.');
  }
  const generation = input.generation ?? state.run.generation;
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError('Agent control event generation is invalid.');
  }
  const sanitizedPayload = sanitizeAgentAuditPayload(
    input.payload ?? {},
    input.secretCanaries
  );
  const requestDigest = digestAgentCanonicalValue(
    input.requestIdentity ?? {
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      data,
    }
  );
  const base = eventBase({
    eventId: input.eventId,
    taskId: state.run.taskId,
    runId: state.run.runId,
    generation,
    sequence: state.cursor + 1,
    family: eventFamily(input.type),
    type: input.type,
    producer: Object.freeze({ ...input.producer }),
    occurredAt: input.occurredAt,
    ...(state.run.latestEventDigest
      ? { previousEventDigest: state.run.latestEventDigest }
      : {}),
    idempotencyKey: input.idempotencyKey,
    requestDigest,
    payloadDigest: digestAgentCanonicalValue(sanitizedPayload),
    policyDigest: state.run.policyDigest,
    grantRef: Object.freeze({ ...state.run.grantRef }),
    data,
    sanitizedPayload,
  });
  return Object.freeze({
    ...base,
    eventDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentControlEvent = (
  value: unknown
): value is AgentControlEvent => {
  if (
    inspectAgentControlJson(value, 1_048_576).length > 0 ||
    !hasExactAgentControlKeys(
      value,
      [
        'eventId',
        'taskId',
        'runId',
        'generation',
        'sequence',
        'family',
        'type',
        'producer',
        'occurredAt',
        'idempotencyKey',
        'requestDigest',
        'payloadDigest',
        'policyDigest',
        'grantRef',
        'data',
        'sanitizedPayload',
        'eventDigest',
      ],
      ['previousEventDigest']
    ) ||
    !isAgentControlIdentity(value.eventId) ||
    !isAgentControlIdentity(value.taskId) ||
    !isAgentControlIdentity(value.runId) ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 0 ||
    !Number.isSafeInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    !eventTypes.has(value.type as AgentControlEventType) ||
    value.family !== eventFamily(value.type as AgentControlEventType) ||
    !hasExactAgentControlKeys(value.producer, ['kind', 'principalId']) ||
    (value.producer.kind !== 'user' && value.producer.kind !== 'service') ||
    !isAgentControlIdentity(value.producer.principalId) ||
    !isAgentControlInstant(value.occurredAt) ||
    !isAgentControlIdentity(value.idempotencyKey) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.payloadDigest) ||
    !isAgentCanonicalDigest(value.policyDigest) ||
    !hasExactAgentControlKeys(value.grantRef, ['grantId']) ||
    !isAgentControlIdentity(value.grantRef.grantId) ||
    !validateEventData(
      value.type as AgentControlEventType,
      value.data as AgentControlEventData
    ) ||
    digestAgentCanonicalValue(value.sanitizedPayload) !== value.payloadDigest ||
    (value.previousEventDigest !== undefined &&
      !isAgentCanonicalDigest(value.previousEventDigest)) ||
    !isAgentCanonicalDigest(value.eventDigest)
  ) {
    return false;
  }
  const { eventDigest, ...base } = value;
  return digestAgentCanonicalValue(base) === eventDigest;
};

export const sameAgentControlEvent = (
  left: AgentControlEvent,
  right: AgentControlEvent
): boolean => sameCanonicalJson(left, right);

export const canonicalAgentControlEventOrder = (
  events: readonly AgentControlEvent[]
): readonly AgentControlEvent[] =>
  Object.freeze(
    [...events].sort(
      (left, right) =>
        left.sequence - right.sequence ||
        compareUnicodeCodePoints(left.eventId, right.eventId)
    )
  );
