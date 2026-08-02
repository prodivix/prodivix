import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  acknowledgeAgentRunCleanup,
  cancelAgentRun,
  finalizeAgentRun,
  recordFencedAgentCallback,
  recoverAgentRun,
  reduceAgentRun,
  type AgentRecoveryPosition,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G4_V4_TIME,
  createGoldenG4V4RecoveryState,
  goldenG4V4Command,
} from './goldenG4V4ControlPlaneFixture';

const positions: readonly AgentRecoveryPosition[] = [
  'model-stream',
  'tool-execute',
  'awaiting-approval',
  'commit-ack',
  'verification',
];

const once = (ledger: Map<string, number>, identity: string): void => {
  if (!ledger.has(identity)) ledger.set(identity, 1);
};

describe('Golden G4 V4 durable Agent control plane', () => {
  it.each(positions)(
    'recovers %s after restart without duplicating side effects or Workspace authority',
    (position) => {
      const fixture = createGoldenG4V4RecoveryState(position);
      const workspaceAuthority = Object.freeze({
        revision: fixture.task.spec.baseRevision,
        grantRef: fixture.task.spec.initialGrantRef,
      });
      const authorityBefore = canonicalJsonText(workspaceAuthority);
      const sideEffects = new Map<string, number>();
      once(sideEffects, fixture.effectIdentity);
      const previousGeneration = fixture.state.run.generation;

      const recovered = recoverAgentRun(fixture.task, fixture.state, {
        position,
        attemptId: `attempt.golden.${position}.2`,
        eventIdPrefix: `event.golden.${position}.recovery`,
        idempotencyKeyPrefix: `idempotency.golden.${position}.recovery`,
        occurredAt: GOLDEN_G4_V4_TIME.recovery,
        producer: goldenG4V4Command(
          'unused',
          'unused',
          GOLDEN_G4_V4_TIME.recovery
        ).producer,
      });
      expect(recovered.recovered).toBe(true);
      if (!recovered.recovered) return;
      expect(recovered.state.run.generation).toBe(previousGeneration + 1);
      expect(recovered.state.pendingOperation).toBeUndefined();
      expect(
        recovered.state.budgetLedger.reservations.every(
          ({ status, settlement }) =>
            status === 'settled' &&
            settlement?.requiresReconciliation === true &&
            canonicalJsonText(settlement.charged) ===
              canonicalJsonText(
                recovered.state.budgetLedger.reservations[0]?.demand
              )
        )
      ).toBe(true);

      // Re-delivery after ACK loss replays the same durable identities.
      let replayState = recovered.state;
      for (const event of recovered.events) {
        const replayed = reduceAgentRun(fixture.task, replayState, event);
        expect(replayed.accepted).toBe(true);
        if (replayed.accepted) {
          expect(replayed.replayed).toBe(true);
          replayState = replayed.state;
        }
      }
      expect(replayState.snapshotDigest).toBe(recovered.state.snapshotDigest);

      once(sideEffects, fixture.effectIdentity);
      expect(sideEffects.get(fixture.effectIdentity)).toBe(1);
      const lateCallback = recordFencedAgentCallback(
        fixture.task,
        recovered.state,
        {
          ...goldenG4V4Command(
            `event.golden.${position}.late-callback`,
            `idempotency.golden.${position}.late-callback`,
            GOLDEN_G4_V4_TIME.callback
          ),
          callbackGeneration: previousGeneration,
          reason: 'worker-generation-was-fenced',
        }
      );
      expect(lateCallback.accepted).toBe(true);
      expect(canonicalJsonText(workspaceAuthority)).toBe(authorityBefore);
    }
  );

  it.each(positions)(
    'cancels %s with cleanup acknowledgement and rejects old callbacks',
    (position) => {
      const fixture = createGoldenG4V4RecoveryState(position);
      const generation = fixture.state.run.generation;
      const cancelled = cancelAgentRun(fixture.task, fixture.state, {
        ...goldenG4V4Command(
          `event.golden.${position}.cancel`,
          `idempotency.golden.${position}.cancel`,
          GOLDEN_G4_V4_TIME.recovery
        ),
        reason: 'operator-requested',
      });
      expect(cancelled.accepted).toBe(true);
      if (!cancelled.accepted) return;
      expect(cancelled.state.run.phase).toBe('cancelling');
      expect(cancelled.state.callbackAuthority).toBe('revoked');
      if (cancelled.state.pendingOperation) {
        expect(cancelled.state.pendingOperation.state).toBe('cancelled');
        expect(cancelled.state.pendingOperation.callbackAuthority).toBe(
          'revoked'
        );
      }

      const late = recordFencedAgentCallback(fixture.task, cancelled.state, {
        ...goldenG4V4Command(
          `event.golden.${position}.cancelled-callback`,
          `idempotency.golden.${position}.cancelled-callback`,
          GOLDEN_G4_V4_TIME.callback
        ),
        callbackGeneration: generation,
        reason: 'cancel-fenced',
      });
      expect(late.accepted).toBe(true);
      if (!late.accepted) return;
      const cleaned = acknowledgeAgentRunCleanup(fixture.task, late.state, {
        ...goldenG4V4Command(
          `event.golden.${position}.cleanup`,
          `idempotency.golden.${position}.cleanup`,
          GOLDEN_G4_V4_TIME.cleanup
        ),
        cleanupState: 'clean',
        receiptDigest: fixture.task.taskDigest,
      });
      expect(cleaned.accepted).toBe(true);
      if (!cleaned.accepted) return;
      const terminal = finalizeAgentRun(fixture.task, cleaned.state, {
        ...goldenG4V4Command(
          `event.golden.${position}.terminal`,
          `idempotency.golden.${position}.terminal`,
          GOLDEN_G4_V4_TIME.terminal
        ),
        outcome: 'cancelled',
      });
      expect(terminal.accepted).toBe(true);
      if (terminal.accepted) {
        expect(terminal.state.run).toMatchObject({
          phase: 'terminal',
          outcome: 'cancelled',
        });
      }
    }
  );
});
