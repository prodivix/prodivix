import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  acknowledgeAgentRunCleanup,
  cancelAgentRun,
  createAgentAuditExport,
  createAgentRunControl,
  encodeAgentControlFact,
  finalizeAgentRun,
  recoverAgentRun,
  reserveAgentRunBudget,
  settleAgentRunBudget,
  settleAgentRunOperation,
  startAgentRun,
  startAgentRunOperation,
  transitionAgentRunPhase,
} from '../packages/ai/src/index.ts';
import {
  V4_TIME,
  createV4Demand,
  createV4Task,
  v4Command,
  v4Digest,
} from '../packages/ai/src/__tests__/agentV4Fixtures.ts';

const accepted = (result) => {
  if (!result.accepted) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result;
};

/** Shared TypeScript/Go/PostgreSQL control-plane identity vector. */
export const createG4AgentControlCanonicalVector = () => {
  const task = createV4Task('explain', 'canonical-vector');
  const created = accepted(
    createAgentRunControl(task, {
      runId: 'run.g4-v4.canonical-vector',
      command: v4Command(
        'event.vector.created',
        'idempotency.vector.created',
        V4_TIME.run
      ),
    })
  );
  const started = accepted(
    startAgentRun(task, created.state, {
      ...v4Command(
        'event.vector.started',
        'idempotency.vector.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.vector.1',
    })
  );
  const running = accepted(
    transitionAgentRunPhase(task, started.state, {
      ...v4Command(
        'event.vector.running',
        'idempotency.vector.running',
        V4_TIME.running
      ),
      phase: 'running',
    })
  );

  const reserved = accepted(
    reserveAgentRunBudget(task, running.state, {
      ...v4Command(
        'event.vector.budget-reserved',
        'idempotency.vector.budget-reserved',
        V4_TIME.operation
      ),
      reservationId: 'reservation.vector.model.1',
      demand: createV4Demand({
        inputTokens: '1200',
        outputTokens: '240',
        modelInvocations: 1,
        elapsedMs: 5000,
      }),
    })
  );
  const operationStarted = accepted(
    startAgentRunOperation(task, reserved.state, {
      ...v4Command(
        'event.vector.model-started',
        'idempotency.vector.model-started',
        V4_TIME.operation
      ),
      operationId: 'operation.vector.model.1',
      kind: 'model-stream',
      request: { contextPackDigest: v4Digest('canonical-context-pack') },
    })
  );
  const operationSettled = accepted(
    settleAgentRunOperation(task, operationStarted.state, {
      ...v4Command(
        'event.vector.model-completed',
        'idempotency.vector.model-completed',
        V4_TIME.settle
      ),
      status: 'completed',
      resultDigest: v4Digest('canonical-model-result'),
    })
  );
  const budgetSettled = accepted(
    settleAgentRunBudget(task, operationSettled.state, {
      ...v4Command(
        'event.vector.budget-settled',
        'idempotency.vector.budget-settled',
        V4_TIME.settle
      ),
      reservationId: 'reservation.vector.model.1',
      actual: createV4Demand({
        inputTokens: '1100',
        outputTokens: '220',
        modelInvocations: 1,
        elapsedMs: 4500,
      }),
    })
  );
  const terminal = accepted(
    finalizeAgentRun(task, budgetSettled.state, {
      ...v4Command(
        'event.vector.terminal',
        'idempotency.vector.terminal',
        V4_TIME.terminal
      ),
      outcome: 'succeeded',
      successProof: {
        mode: 'explain',
        answerDigest: v4Digest('canonical-answer'),
        groundingDigests: [v4Digest('canonical-source-trace')],
      },
    })
  );
  const transitions = [
    ['created', created],
    ['started', started],
    ['running', running],
    ['budget-reserved', reserved],
    ['model-started', operationStarted],
    ['model-completed', operationSettled],
    ['budget-settled', budgetSettled],
    ['terminal', terminal],
  ];
  const recoveryCreated = accepted(
    createAgentRunControl(task, {
      runId: 'run.g4-v4.recovery-vector',
      command: v4Command(
        'event.recovery-vector.created',
        'idempotency.recovery-vector.created',
        V4_TIME.run
      ),
    })
  );
  const recoveryStarted = accepted(
    startAgentRun(task, recoveryCreated.state, {
      ...v4Command(
        'event.recovery-vector.started',
        'idempotency.recovery-vector.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.recovery-vector.1',
    })
  );
  const recoveryRunning = accepted(
    transitionAgentRunPhase(task, recoveryStarted.state, {
      ...v4Command(
        'event.recovery-vector.running',
        'idempotency.recovery-vector.running',
        V4_TIME.running
      ),
      phase: 'running',
    })
  );
  const recoveryOperation = accepted(
    startAgentRunOperation(task, recoveryRunning.state, {
      ...v4Command(
        'event.recovery-vector.model-started',
        'idempotency.recovery-vector.model-started',
        V4_TIME.operation
      ),
      operationId: 'operation.recovery-vector.model.1',
      kind: 'model-stream',
      request: { contextPackDigest: v4Digest('recovery-context-pack') },
    })
  );
  const recovered = recoverAgentRun(task, recoveryOperation.state, {
    position: 'model-stream',
    attemptId: 'attempt.recovery-vector.2',
    eventIdPrefix: 'event.recovery-vector',
    idempotencyKeyPrefix: 'idempotency.recovery-vector',
    occurredAt: V4_TIME.cancel,
    producer: v4Command('unused', 'unused', V4_TIME.cancel).producer,
  });
  if (!recovered.recovered) {
    throw new Error(recovered.issues.map(({ message }) => message).join('; '));
  }
  const recoveryTransitions = [
    ['created', recoveryCreated],
    ['started', recoveryStarted],
    ['running', recoveryRunning],
    ['model-started', recoveryOperation],
    [
      'recovery-started',
      {
        state: recovered.state,
        event: recovered.events.at(-1),
      },
    ],
  ];
  const cancellationCreated = accepted(
    createAgentRunControl(task, {
      runId: 'run.g4-v4.cancellation-vector',
      command: v4Command(
        'event.cancellation-vector.created',
        'idempotency.cancellation-vector.created',
        V4_TIME.run
      ),
    })
  );
  const cancellationStarted = accepted(
    startAgentRun(task, cancellationCreated.state, {
      ...v4Command(
        'event.cancellation-vector.started',
        'idempotency.cancellation-vector.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.cancellation-vector.1',
    })
  );
  const cancellationRunning = accepted(
    transitionAgentRunPhase(task, cancellationStarted.state, {
      ...v4Command(
        'event.cancellation-vector.running',
        'idempotency.cancellation-vector.running',
        V4_TIME.running
      ),
      phase: 'running',
    })
  );
  const cancellationOperation = accepted(
    startAgentRunOperation(task, cancellationRunning.state, {
      ...v4Command(
        'event.cancellation-vector.tool-started',
        'idempotency.cancellation-vector.tool-started',
        V4_TIME.operation
      ),
      operationId: 'operation.cancellation-vector.tool.1',
      kind: 'tool-execution',
      request: { toolId: 'tool.catalog.search' },
    })
  );
  const cancellationRequested = accepted(
    cancelAgentRun(task, cancellationOperation.state, {
      ...v4Command(
        'event.cancellation-vector.requested',
        'idempotency.cancellation-vector.requested',
        V4_TIME.cancel
      ),
      reason: 'user-requested',
    })
  );
  const cancellationCleaned = accepted(
    acknowledgeAgentRunCleanup(task, cancellationRequested.state, {
      ...v4Command(
        'event.cancellation-vector.cleaned',
        'idempotency.cancellation-vector.cleaned',
        V4_TIME.cleanup
      ),
      cleanupState: 'clean',
      receiptDigest: v4Digest('cancellation-cleanup'),
    })
  );
  const cancellationTerminal = accepted(
    finalizeAgentRun(task, cancellationCleaned.state, {
      ...v4Command(
        'event.cancellation-vector.terminal',
        'idempotency.cancellation-vector.terminal',
        V4_TIME.terminal
      ),
      outcome: 'cancelled',
    })
  );
  const cancellationTransitions = [
    ['created', cancellationCreated],
    ['started', cancellationStarted],
    ['running', cancellationRunning],
    ['tool-started', cancellationOperation],
    ['cancel-requested', cancellationRequested],
    ['cleanup-acknowledged', cancellationCleaned],
    ['terminal', cancellationTerminal],
  ];
  const events = transitions.map(([, transition]) => transition.event);
  const audit = createAgentAuditExport(events, V4_TIME.export);
  const facts = Object.freeze({
    task: encodeAgentControlFact({ factType: 'task-record', value: task }),
    run: encodeAgentControlFact({
      factType: 'run-snapshot',
      value: terminal.state,
    }),
    event: encodeAgentControlFact({
      factType: 'run-event',
      value: terminal.event,
    }),
    audit: encodeAgentControlFact({ factType: 'audit-export', value: audit }),
  });
  return Object.freeze({
    format: 'prodivix.agent-control-canonical-vector',
    version: 1,
    facts,
    canonicalJson: Object.freeze(
      Object.fromEntries(
        Object.entries(facts).map(([key, value]) => [
          key,
          canonicalJsonText(value),
        ])
      )
    ),
    expectedDigests: Object.freeze({
      task: task.taskDigest,
      run: terminal.state.snapshotDigest,
      event: terminal.event.eventDigest,
      audit: audit.exportDigest,
    }),
    repositorySequence: Object.freeze(
      transitions.map(([name, transition]) =>
        Object.freeze({
          name,
          run: encodeAgentControlFact({
            factType: 'run-snapshot',
            value: transition.state,
          }),
          event: encodeAgentControlFact({
            factType: 'run-event',
            value: transition.event,
          }),
        })
      )
    ),
    recoverySequence: Object.freeze(
      recoveryTransitions.map(([name, transition]) =>
        Object.freeze({
          name,
          run: encodeAgentControlFact({
            factType: 'run-snapshot',
            value: transition.state,
          }),
          event: encodeAgentControlFact({
            factType: 'run-event',
            value: transition.event,
          }),
        })
      )
    ),
    cancellationSequence: Object.freeze(
      cancellationTransitions.map(([name, transition]) =>
        Object.freeze({
          name,
          run: encodeAgentControlFact({
            factType: 'run-snapshot',
            value: transition.state,
          }),
          event: encodeAgentControlFact({
            factType: 'run-event',
            value: transition.event,
          }),
        })
      )
    ),
  });
};
