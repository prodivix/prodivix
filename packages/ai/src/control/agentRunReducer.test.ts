import { describe, expect, it } from 'vitest';
import {
  V4_TIME,
  createStartedV4Run,
  createV4Task,
  v4Command,
  v4Digest,
} from '../__tests__/agentV4Fixtures';
import {
  acknowledgeAgentRunCleanup,
  cancelAgentRun,
  createAgentRunControl,
  finalizeAgentRun,
  recordFencedAgentCallback,
  retryAgentRun,
  settleAgentRunOperation,
  startAgentRunOperation,
} from './agentControlPlane';
import {
  createAgentControlEvent,
  createInitialAgentRunSnapshot,
  createAgentRunPendingOperation,
} from './agentRunFacts';
import { reduceAgentRun } from './agentRunReducer';
import type {
  AgentRunSnapshot,
  AgentRunTransitionResult,
} from './agentControl.types';

const acceptedState = (result: AgentRunTransitionResult): AgentRunSnapshot => {
  if (!result.accepted)
    throw new Error('Expected accepted AgentRun transition.');
  return result.state;
};

describe('AgentRun reducer and mode-specific success', () => {
  it('requires the exact success proof for every immutable Task mode', () => {
    const plan = createStartedV4Run('plan', 'plan-success');
    const planResult = finalizeAgentRun(plan.task, plan.state, {
      ...v4Command(
        'event.plan.terminal',
        'idempotency.plan.terminal',
        V4_TIME.terminal
      ),
      outcome: 'succeeded',
      successProof: { mode: 'plan', planDigest: v4Digest('plan') },
    });
    expect(planResult.accepted).toBe(true);
    if (planResult.accepted) {
      expect(planResult.state.run).toMatchObject({
        phase: 'terminal',
        outcome: 'succeeded',
      });
      expect(planResult.state.attempts[0]?.outcome).toBe('succeeded');
    }

    const apply = createStartedV4Run('apply', 'apply-no-closure');
    const blocked = finalizeAgentRun(apply.task, apply.state, {
      ...v4Command(
        'event.apply.terminal',
        'idempotency.apply.terminal',
        V4_TIME.terminal
      ),
      outcome: 'succeeded',
      successProof: {
        mode: 'plan',
        planDigest: v4Digest('not-apply'),
      } as never,
    });
    expect(blocked.accepted).toBe(false);
    if (!blocked.accepted) {
      expect(blocked.issues[0]?.code).toBe('AI-6004');
    }
  });

  it('replays the same event without changing cursor or state', () => {
    const task = createV4Task('explain', 'event-replay');
    const initial = createInitialAgentRunSnapshot(task, {
      runId: 'run.g4-v4.event-replay',
      createdAt: V4_TIME.run,
    });
    const event = createAgentControlEvent(initial, {
      ...v4Command(
        'event.replay.created',
        'idempotency.replay.created',
        V4_TIME.run
      ),
      type: 'run.created',
      payload: { taskDigest: task.taskDigest },
    });
    const first = reduceAgentRun(task, initial, event);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const duplicate = reduceAgentRun(task, first.state, event);
    expect(duplicate).toMatchObject({ accepted: true, replayed: true });
    if (duplicate.accepted) {
      expect(duplicate.state.cursor).toBe(1);
      expect(duplicate.state.snapshotDigest).toBe(first.state.snapshotDigest);
    }
  });

  it('fences late callbacks after cancel and requires cleanup before terminal', () => {
    const fixture = createStartedV4Run('explain', 'cancel');
    const started = startAgentRunOperation(fixture.task, fixture.state, {
      ...v4Command(
        'event.tool.started',
        'idempotency.tool.started',
        V4_TIME.operation
      ),
      operationId: 'tool.call.cancel',
      kind: 'tool-execution',
      request: { toolId: 'tool.catalog.search' },
    });
    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    const pending = started.state.pendingOperation!;
    const cancelledReceipt = createAgentRunPendingOperation({
      operationId: pending.operationId,
      kind: pending.kind,
      idempotencyKey: pending.idempotencyKey,
      requestDigest: pending.requestDigest,
      generation: pending.generation,
      state: 'cancelled',
      callbackAuthority: 'revoked',
      startedAt: pending.startedAt,
      settledAt: V4_TIME.settle,
    });
    expect(() =>
      createAgentControlEvent(started.state, {
        ...v4Command(
          'event.tool.invalid-completed',
          'idempotency.tool.invalid-completed',
          V4_TIME.settle
        ),
        type: 'tool.completed',
        data: { operation: cancelledReceipt },
      })
    ).toThrow(/invalid/u);
    const leakedReason = cancelAgentRun(fixture.task, started.state, {
      ...v4Command(
        'event.run.cancel-secret',
        'idempotency.run.cancel-secret',
        V4_TIME.settle
      ),
      reason: 'Bearer credential-material',
    });
    expect(leakedReason.accepted).toBe(false);
    const oldGeneration = started.state.run.generation;
    const cancelled = cancelAgentRun(fixture.task, started.state, {
      ...v4Command(
        'event.run.cancel',
        'idempotency.run.cancel',
        V4_TIME.cancel
      ),
      reason: 'user-requested',
    });
    expect(cancelled.accepted).toBe(true);
    if (!cancelled.accepted) return;
    expect(cancelled.state.run.generation).toBe(oldGeneration + 1);
    expect(cancelled.state.callbackAuthority).toBe('revoked');

    const late = settleAgentRunOperation(fixture.task, cancelled.state, {
      ...v4Command('event.tool.late', 'idempotency.tool.late', V4_TIME.cleanup),
      status: 'completed',
      resultDigest: v4Digest('late-result'),
    });
    expect(late).toMatchObject({ accepted: false, auditOnly: true });

    const audited = recordFencedAgentCallback(fixture.task, cancelled.state, {
      ...v4Command(
        'event.callback.rejected',
        'idempotency.callback.rejected',
        V4_TIME.cleanup
      ),
      callbackGeneration: oldGeneration,
      reason: 'cancelled-generation',
      receiptDigest: v4Digest('late-result'),
    });
    expect(audited.accepted).toBe(true);
    if (!audited.accepted) return;
    const premature = finalizeAgentRun(fixture.task, audited.state, {
      ...v4Command(
        'event.cancel.premature',
        'idempotency.cancel.premature',
        V4_TIME.terminal
      ),
      outcome: 'cancelled',
    });
    expect(premature.accepted).toBe(false);

    const cleaned = acknowledgeAgentRunCleanup(fixture.task, audited.state, {
      ...v4Command(
        'event.cleanup.clean',
        'idempotency.cleanup.clean',
        V4_TIME.terminal
      ),
      cleanupState: 'clean',
      receiptDigest: v4Digest('cleanup'),
    });
    expect(cleaned.accepted).toBe(true);
  });

  it('preserves failed attempts when retrying with a new generation', () => {
    const fixture = createStartedV4Run('explain', 'retry');
    const retried = retryAgentRun(fixture.task, fixture.state, {
      ...v4Command('event.retry.2', 'idempotency.retry.2', V4_TIME.operation),
      attemptId: 'attempt.retry.2',
    });
    expect(retried.accepted).toBe(true);
    if (!retried.accepted) return;
    expect(retried.state.attempts).toHaveLength(2);
    expect(retried.state.attempts[0]?.outcome).toBe('superseded');
    expect(retried.state.attempts[1]).toMatchObject({
      parentAttemptId: 'attempt.retry.1',
      generation: fixture.state.run.generation + 1,
    });
  });

  it('keeps create/start/finalize functions independent from Workspace writes', () => {
    const task = createV4Task('explain', 'no-write');
    const result = createAgentRunControl(task, {
      runId: 'run.g4-v4.no-write',
      command: v4Command(
        'event.no-write.created',
        'idempotency.no-write.created',
        V4_TIME.run
      ),
    });
    const state = acceptedState(result);
    expect(JSON.stringify(state)).not.toMatch(
      /workspacePatch|jsonPatch|applyToken|commitToken/u
    );
  });
});
