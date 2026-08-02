import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { AgentRun, AgentRunPhase } from '../domain/agent.types';
import { isAgentCanonicalDigest } from '../domain/agentCanonical';
import type {
  AgentControlEvent,
  AgentControlIssue,
  AgentRunAttempt,
  AgentRunPendingOperation,
  AgentRunSnapshot,
  AgentRunTransitionResult,
  AgentTaskRecord,
} from './agentControl.types';
import { controlIssue } from './agentControlValidation';
import {
  createAgentRunAttempt,
  createAgentRunPendingOperation,
  createAgentRunSnapshot,
  isAgentControlEvent,
  isAgentRunSnapshot,
  isAgentRunSuccessProof,
} from './agentRunFacts';
import { isAgentTaskRecord } from './agentTask';

const advancingGeneration = new Set<AgentControlEvent['type']>([
  'run.started',
  'run.cancel-requested',
  'run.timeout-requested',
  'run.retry-started',
  'run.recovery-started',
]);

const phaseTransitions: Readonly<
  Record<Exclude<AgentRunPhase, 'terminal'>, ReadonlySet<AgentRunPhase>>
> = Object.freeze({
  queued: new Set<AgentRunPhase>(['preparing', 'cancelling']),
  preparing: new Set<AgentRunPhase>(['running', 'cancelling']),
  running: new Set<AgentRunPhase>([
    'awaiting-approval',
    'committing',
    'verifying',
    'repairing',
    'cancelling',
  ]),
  'awaiting-approval': new Set<AgentRunPhase>([
    'committing',
    'repairing',
    'cancelling',
  ]),
  committing: new Set<AgentRunPhase>(['verifying', 'cancelling']),
  verifying: new Set<AgentRunPhase>(['repairing', 'cancelling']),
  repairing: new Set<AgentRunPhase>([
    'running',
    'awaiting-approval',
    'committing',
    'verifying',
    'cancelling',
  ]),
  cancelling: new Set<AgentRunPhase>([]),
});

const rejected = (
  state: AgentRunSnapshot,
  issue: AgentControlIssue,
  auditOnly = false
): AgentRunTransitionResult =>
  Object.freeze({
    accepted: false,
    auditOnly,
    state,
    issues: Object.freeze([issue]),
  });

const completeLatestAttempt = (
  attempts: readonly AgentRunAttempt[],
  event: AgentControlEvent
): readonly AgentRunAttempt[] => {
  const latest = attempts.at(-1);
  if (!latest || latest.completedAt !== undefined) return attempts;
  const failureDigest = isAgentCanonicalDigest(event.data.receiptDigest)
    ? event.data.receiptDigest
    : event.requestDigest;
  return Object.freeze([
    ...attempts.slice(0, -1),
    createAgentRunAttempt({
      attemptId: latest.attemptId,
      attempt: latest.attempt,
      generation: latest.generation,
      reason: latest.reason,
      ...(latest.parentAttemptId
        ? { parentAttemptId: latest.parentAttemptId }
        : {}),
      startedAt: latest.startedAt,
      completedAt: event.occurredAt,
      outcome: 'superseded',
      failureDigest,
    }),
  ]);
};

const revokeOperation = (
  operation: AgentRunPendingOperation | undefined,
  event: AgentControlEvent,
  state: AgentRunPendingOperation['state']
): AgentRunPendingOperation | undefined => {
  if (!operation || operation.state !== 'started') return operation;
  return createAgentRunPendingOperation({
    operationId: operation.operationId,
    kind: operation.kind,
    idempotencyKey: operation.idempotencyKey,
    requestDigest: operation.requestDigest,
    generation: operation.generation,
    state,
    callbackAuthority: 'revoked',
    startedAt: operation.startedAt,
    settledAt: event.occurredAt,
    ...(event.data.receiptDigest
      ? { resultDigest: event.data.receiptDigest }
      : {}),
  });
};

const modeSuccessIsSatisfied = (
  task: AgentTaskRecord,
  event: AgentControlEvent
): boolean =>
  event.data.outcome !== 'succeeded' ||
  isAgentRunSuccessProof(event.data.successProof, task.spec.mode);

const budgetEventIsValid = (
  state: AgentRunSnapshot,
  event: AgentControlEvent
): boolean => {
  const ledger = event.data.budgetLedger;
  const reservationId = event.data.reservationId;
  if (!ledger || !reservationId) return false;
  if (!sameCanonicalJson(ledger.budget, state.budgetLedger.budget))
    return false;
  if (ledger.revision !== state.budgetLedger.revision + 1) return false;
  const previousReservations = state.budgetLedger.reservations;
  if (event.type === 'budget.reserved') {
    if (ledger.reservations.length !== previousReservations.length + 1) {
      return false;
    }
    let previousIndex = 0;
    let added = 0;
    for (const reservation of ledger.reservations) {
      const previous = previousReservations[previousIndex];
      if (previous && sameCanonicalJson(previous, reservation)) {
        previousIndex += 1;
        continue;
      }
      if (
        added !== 0 ||
        reservation.reservationId !== reservationId ||
        reservation.status !== 'reserved'
      ) {
        return false;
      }
      added += 1;
    }
    return added === 1 && previousIndex === previousReservations.length;
  }
  if (ledger.reservations.length !== previousReservations.length) return false;
  let changed = 0;
  for (let index = 0; index < previousReservations.length; index += 1) {
    const previous = previousReservations[index];
    const next = ledger.reservations[index];
    if (!previous || !next || previous.reservationId !== next.reservationId) {
      return false;
    }
    if (previous.reservationId !== reservationId) {
      if (!sameCanonicalJson(previous, next)) return false;
      continue;
    }
    if (
      previous.status !== 'reserved' ||
      next.status !== 'settled' ||
      previous.demandDigest !== next.demandDigest ||
      previous.reservedAt !== next.reservedAt ||
      !sameCanonicalJson(previous.demand, next.demand)
    ) {
      return false;
    }
    changed += 1;
  }
  return changed === 1;
};

const appendEvent = (
  state: AgentRunSnapshot,
  event: AgentControlEvent,
  update: Readonly<{
    run?: AgentRun;
    callbackAuthority?: AgentRunSnapshot['callbackAuthority'];
    attempts?: readonly AgentRunAttempt[];
    budgetLedger?: AgentRunSnapshot['budgetLedger'];
    pendingOperation?: AgentRunPendingOperation | null;
    cleanupState?: AgentRunSnapshot['cleanupState'];
  }> = {}
): AgentRunSnapshot => {
  const run = Object.freeze({
    ...(update.run ?? state.run),
    latestEventDigest: event.eventDigest,
    updatedAt: event.occurredAt,
  });
  return createAgentRunSnapshot({
    run,
    taskDigest: state.taskDigest,
    cursor: event.sequence,
    callbackAuthority: update.callbackAuthority ?? state.callbackAuthority,
    attempts: update.attempts ?? state.attempts,
    budgetLedger: update.budgetLedger ?? state.budgetLedger,
    ...(update.pendingOperation === null
      ? {}
      : update.pendingOperation !== undefined
        ? { pendingOperation: update.pendingOperation }
        : state.pendingOperation
          ? { pendingOperation: state.pendingOperation }
          : {}),
    cleanupState: update.cleanupState ?? state.cleanupState,
    processedEvents: Object.freeze([
      ...state.processedEvents,
      Object.freeze({
        eventId: event.eventId,
        idempotencyKey: event.idempotencyKey,
        type: event.type,
        requestDigest: event.requestDigest,
        eventDigest: event.eventDigest,
      }),
    ]),
  });
};

/** Pure event reducer. Durable repositories must enforce the same identities. */
export const reduceAgentRun = (
  task: AgentTaskRecord,
  state: AgentRunSnapshot,
  event: AgentControlEvent
): AgentRunTransitionResult => {
  if (
    !isAgentTaskRecord(task) ||
    !isAgentRunSnapshot(state) ||
    !isAgentControlEvent(event)
  ) {
    return rejected(
      state,
      controlIssue(
        'AI-9001',
        '/',
        'AgentRun snapshot or event failed structural and digest validation.'
      )
    );
  }
  if (
    state.taskDigest !== task.taskDigest ||
    event.taskId !== task.spec.taskId ||
    event.taskId !== state.run.taskId ||
    event.runId !== state.run.runId ||
    event.policyDigest !== state.run.policyDigest ||
    event.grantRef.grantId !== state.run.grantRef.grantId
  ) {
    return rejected(
      state,
      controlIssue(
        'AI-6003',
        '/identity',
        'AgentRun event does not bind the exact task, run, policy, and grant.'
      ),
      true
    );
  }

  const priorIdempotency = state.processedEvents.find(
    ({ idempotencyKey }) => idempotencyKey === event.idempotencyKey
  );
  if (priorIdempotency) {
    return priorIdempotency.requestDigest === event.requestDigest &&
      priorIdempotency.type === event.type
      ? Object.freeze({ accepted: true, replayed: true, state, event })
      : rejected(
          state,
          controlIssue(
            'AI-9001',
            '/idempotencyKey',
            'AgentRun idempotency key was reused with a different request.'
          )
        );
  }
  if (state.processedEvents.some(({ eventId }) => eventId === event.eventId)) {
    return rejected(
      state,
      controlIssue(
        'AI-9001',
        '/eventId',
        'AgentRun event id was reused with a different request.'
      )
    );
  }
  if (
    event.sequence !== state.cursor + 1 ||
    event.previousEventDigest !== state.run.latestEventDigest
  ) {
    return rejected(
      state,
      controlIssue(
        'AI-6004',
        '/sequence',
        'AgentRun event sequence or hash-chain predecessor is stale.'
      )
    );
  }

  const expectedGeneration = advancingGeneration.has(event.type)
    ? state.run.generation + 1
    : state.run.generation;
  if (event.generation !== expectedGeneration) {
    return rejected(
      state,
      controlIssue(
        'AI-6003',
        '/generation',
        'AgentRun callback or command lost generation authority.'
      ),
      true
    );
  }
  if (state.run.phase === 'terminal') {
    return rejected(
      state,
      controlIssue('AI-6003', '/phase', 'AgentRun is already terminal.'),
      true
    );
  }

  let next: AgentRunSnapshot;
  switch (event.type) {
    case 'run.created': {
      if (state.cursor !== 0 || state.run.phase !== 'queued') {
        return rejected(
          state,
          controlIssue('AI-9001', '/type', 'AgentRun was already created.')
        );
      }
      next = appendEvent(state, event);
      break;
    }
    case 'run.started': {
      const attempt = event.data.attempt;
      if (
        state.run.phase !== 'queued' ||
        event.data.phase !== 'preparing' ||
        !attempt ||
        attempt.attempt !== 1 ||
        attempt.generation !== event.generation ||
        attempt.reason !== 'initial'
      ) {
        return rejected(
          state,
          controlIssue('AI-6004', '/data', 'Initial AgentRun start is invalid.')
        );
      }
      next = appendEvent(state, event, {
        run: Object.freeze({
          ...state.run,
          generation: event.generation,
          attempt: 1,
          phase: 'preparing',
        }),
        callbackAuthority: 'active',
        attempts: Object.freeze([attempt]),
        cleanupState: 'not-required',
      });
      break;
    }
    case 'run.phase-changed': {
      const phase = event.data.phase;
      if (
        !phase ||
        phase === 'terminal' ||
        !phaseTransitions[state.run.phase].has(phase)
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6004',
            '/data/phase',
            'AgentRun phase transition is invalid.'
          )
        );
      }
      next = appendEvent(state, event, {
        run: Object.freeze({ ...state.run, phase }),
      });
      break;
    }
    case 'run.cancel-requested':
    case 'run.timeout-requested': {
      const operation = revokeOperation(
        state.pendingOperation,
        event,
        'cancelled'
      );
      next = appendEvent(state, event, {
        run: Object.freeze({
          ...state.run,
          generation: event.generation,
          phase: 'cancelling',
        }),
        callbackAuthority: 'revoked',
        ...(operation ? { pendingOperation: operation } : {}),
        cleanupState: 'pending',
      });
      break;
    }
    case 'run.retry-started':
    case 'run.recovery-started': {
      const attempt = event.data.attempt;
      const priorAttempt = state.attempts.at(-1);
      if (
        state.run.phase === 'queued' ||
        state.run.phase === 'cancelling' ||
        !attempt ||
        attempt.attempt !== state.run.attempt + 1 ||
        attempt.generation !== event.generation ||
        attempt.parentAttemptId !== priorAttempt?.attemptId ||
        (event.type === 'run.retry-started' && attempt.reason !== 'retry') ||
        (event.type === 'run.recovery-started' &&
          attempt.reason !== 'process-recovery' &&
          attempt.reason !== 'provider-disconnect') ||
        !event.data.phase ||
        event.data.phase === 'queued' ||
        event.data.phase === 'terminal' ||
        event.data.phase === 'cancelling'
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6004',
            '/data/attempt',
            'AgentRun retry lineage is invalid.'
          )
        );
      }
      const completedAttempts = completeLatestAttempt(state.attempts, event);
      next = appendEvent(state, event, {
        run: Object.freeze({
          ...state.run,
          generation: event.generation,
          attempt: attempt.attempt,
          phase: event.data.phase,
        }),
        callbackAuthority: 'active',
        attempts: Object.freeze([...completedAttempts, attempt]),
        pendingOperation: null,
        cleanupState: 'not-required',
      });
      break;
    }
    case 'run.terminal': {
      const outcome = event.data.outcome;
      if (
        !outcome ||
        !modeSuccessIsSatisfied(task, event) ||
        (outcome !== 'succeeded' && event.data.successProof !== undefined) ||
        (outcome === 'cancelled' && state.cleanupState !== 'clean') ||
        (outcome === 'succeeded' &&
          (state.callbackAuthority !== 'active' ||
            state.pendingOperation?.state === 'started' ||
            state.budgetLedger.reservations.some(
              ({ status }) => status === 'reserved'
            ))) ||
        (state.cleanupState === 'residual' &&
          outcome !== 'infrastructure-error')
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6004',
            '/data/outcome',
            'AgentRun terminal outcome lacks its mode-specific proof or safe cleanup.'
          )
        );
      }
      const attempts = state.attempts.at(-1)?.completedAt
        ? state.attempts
        : (() => {
            const latest = state.attempts.at(-1);
            if (!latest) return state.attempts;
            return Object.freeze([
              ...state.attempts.slice(0, -1),
              createAgentRunAttempt({
                attemptId: latest.attemptId,
                attempt: latest.attempt,
                generation: latest.generation,
                reason: latest.reason,
                ...(latest.parentAttemptId
                  ? { parentAttemptId: latest.parentAttemptId }
                  : {}),
                startedAt: latest.startedAt,
                completedAt: event.occurredAt,
                outcome,
                ...(outcome === 'succeeded'
                  ? {}
                  : {
                      failureDigest:
                        event.data.receiptDigest ?? event.requestDigest,
                    }),
              }),
            ]);
          })();
      next = appendEvent(state, event, {
        run: Object.freeze({
          ...state.run,
          phase: 'terminal',
          outcome,
        }),
        callbackAuthority: 'revoked',
        attempts,
        pendingOperation: null,
      });
      break;
    }
    case 'budget.reserved':
    case 'budget.settled':
    case 'budget.reconciled': {
      if (!budgetEventIsValid(state, event)) {
        return rejected(
          state,
          controlIssue(
            'AI-6013',
            '/data/budgetLedger',
            'AgentRun budget event is not a valid monotonic ledger transition.'
          )
        );
      }
      next = appendEvent(state, event, {
        budgetLedger: event.data.budgetLedger,
      });
      break;
    }
    case 'model.started':
    case 'tool.started': {
      const operation = event.data.operation;
      const expectedKind =
        event.type === 'model.started' ? 'model-stream' : 'tool-execution';
      if (
        !operation ||
        operation.kind !== expectedKind ||
        operation.generation !== state.run.generation ||
        state.pendingOperation?.state === 'started'
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6004',
            '/data/operation',
            'AgentRun operation start is conflicting or stale.'
          )
        );
      }
      next = appendEvent(state, event, { pendingOperation: operation });
      break;
    }
    case 'model.completed':
    case 'model.failed':
    case 'tool.completed':
    case 'tool.cancelled':
    case 'tool.rejected': {
      const operation = event.data.operation;
      if (
        !operation ||
        !state.pendingOperation ||
        state.pendingOperation.state !== 'started' ||
        operation.operationId !== state.pendingOperation.operationId ||
        operation.requestDigest !== state.pendingOperation.requestDigest ||
        operation.generation !== state.pendingOperation.generation ||
        operation.state === 'started'
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6003',
            '/data/operation',
            'AgentRun operation result lost callback authority.'
          ),
          true
        );
      }
      next = appendEvent(state, event, { pendingOperation: operation });
      break;
    }
    case 'cleanup.acknowledged': {
      const cleanupState = event.data.cleanupState;
      if (
        state.run.phase !== 'cancelling' ||
        (cleanupState !== 'clean' && cleanupState !== 'residual')
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6004',
            '/data/cleanupState',
            'Cleanup acknowledgement is invalid.'
          )
        );
      }
      next = appendEvent(state, event, { cleanupState });
      break;
    }
    case 'callback.rejected': {
      if (
        event.data.callbackGeneration === undefined ||
        event.data.callbackGeneration >= state.run.generation
      ) {
        return rejected(
          state,
          controlIssue(
            'AI-6003',
            '/data/callbackGeneration',
            'Callback rejection must identify an older fenced generation.'
          )
        );
      }
      next = appendEvent(state, event);
      break;
    }
    case 'tool.authorized': {
      next = appendEvent(state, event);
      break;
    }
  }

  if (!isAgentRunSnapshot(next)) {
    return rejected(
      state,
      controlIssue(
        'AI-9001',
        '/snapshotDigest',
        'AgentRun reducer produced an invalid snapshot.'
      )
    );
  }
  return Object.freeze({
    accepted: true,
    replayed: false,
    state: next,
    event,
  });
};
