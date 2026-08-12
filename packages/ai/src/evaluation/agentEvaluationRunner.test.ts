import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { V8_TIME, createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import type { AgentBudgetDemand } from '../usage/agentBudgetLedger';
import {
  InMemoryAgentEvaluationRepository,
  type AgentEvaluationRepository,
} from './agentEvaluationRepository';
import {
  createAgentEvaluationMetricObservation,
  createAgentModelEvaluationAttempt,
} from './agentEvaluationResults';
import { AgentModelEvaluationShardRunner } from './agentEvaluationRunner';

const demand = (modelInvocations: number): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([
      Object.freeze({
        unit: 'text-token-input',
        logicalAmount: String(modelInvocations),
        billableAmount: String(modelInvocations),
        confidence: 'reported',
      }),
    ]),
    cost: Object.freeze([]),
    modelInvocations,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: modelInvocations,
  });

const attemptAuthority = (attemptId: string) =>
  Object.freeze({
    dispatchIntentSetDigest: digestAgentCanonicalValue({
      attemptId,
      authority: 'dispatch-intents',
    }),
    transportReceiptSetDigest: digestAgentCanonicalValue({
      attemptId,
      authority: 'transport-receipts',
    }),
    invocationTurnReceiptSetDigest: digestAgentCanonicalValue({
      attemptId,
      authority: 'invocation-turn-receipts',
    }),
    invocationTurnSetReceiptDigest: digestAgentCanonicalValue({
      attemptId,
      authority: 'invocation-turn-set',
    }),
    capabilityExecutionReceiptSetDigest: digestAgentCanonicalValue({
      attemptId,
      authority: 'capability-execution-receipt-set',
    }),
    verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
      verificationAttemptGrantReceiptDigests: [],
    }),
  });

describe('G4 V8 evaluation repository and shard runner', () => {
  it('reserves once, checkpoints, deduplicates resume, and fences a competing worker', async () => {
    const plan = createV8EvaluationPlan();
    const repository: AgentEvaluationRepository =
      new InMemoryAgentEvaluationRepository();
    expect(repository.putPlan(plan)).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect(repository.putPlan(plan)).toMatchObject({
      ok: true,
      replayed: true,
    });
    const shardId = repository.listDescriptors(plan.planDigest)[0]!.shardId;
    const runner = new AgentModelEvaluationShardRunner({
      repository,
      now: () => V8_TIME.started,
      executor: {
        estimateShard: ({ descriptors }) => demand(descriptors.length),
        execute: async ({ descriptor }) => {
          const responseDigest = digestAgentCanonicalValue({
            passed: descriptor.attemptId,
          });
          return {
            attempt: createAgentModelEvaluationAttempt({
              descriptor,
              independentRunId: `run.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
              ...attemptAuthority(descriptor.attemptId),
              responseDigest,
              status: 'completed',
              outcome: 'passed',
              metricObservations: [
                createAgentEvaluationMetricObservation({
                  metricId: 'authority.correctness',
                  graderId: 'grader.strict-authority.v8',
                  graderKind: 'deterministic-rule',
                  authority: 'deterministic',
                  verdict: 'passed',
                }),
              ],
              usage: demand(1).usage,
              cost: [],
              startedAt: V8_TIME.started,
              completedAt: V8_TIME.completed,
            }),
            demand: demand(1),
          };
        },
      },
    });
    const input = {
      planDigest: plan.planDigest,
      shardId,
      ownerId: 'evaluation-worker.a',
      leaseDurationMs: 86_400_000,
      checkpointEvery: 250,
    };
    const first = await runner.runShard(input);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) throw new Error(first.reason);
    expect(first.executedAttemptCount).toBeGreaterThan(0);
    expect(first.checkpoint.state).toBe('completed');
    expect(first.checkpoint.completedAttemptRefs).toHaveLength(
      first.executedAttemptCount
    );
    const resumed = await runner.runShard(input);
    expect(resumed).toMatchObject({ ok: true, executedAttemptCount: 0 });
    expect(
      await runner.runShard({ ...input, ownerId: 'evaluation-worker.b' })
    ).toEqual({ ok: false, reason: 'lease-rejected' });
  }, 60_000);

  it('keeps an unexpected executor crash pending and resumes the exact descriptor', async () => {
    const plan = createV8EvaluationPlan();
    const repository = new InMemoryAgentEvaluationRepository();
    repository.putPlan(plan);
    const seedDescriptor = repository.listDescriptors(plan.planDigest)[0]!;
    const shardDescriptors = repository
      .listDescriptors(plan.planDigest)
      .filter(({ shardId }) => shardId === seedDescriptor.shardId)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      );
    const descriptor = shardDescriptors[0]!;
    let failFirstDispatch = true;
    const runner = new AgentModelEvaluationShardRunner({
      repository,
      now: () => V8_TIME.started,
      executor: {
        estimateShard: ({ descriptors }) => demand(descriptors.length),
        execute: async ({ descriptor: current }) => {
          if (failFirstDispatch) {
            failFirstDispatch = false;
            throw new Error('transient transport disconnect');
          }
          const responseDigest = digestAgentCanonicalValue({
            attemptId: current.attemptId,
            response: true,
          });
          return {
            attempt: createAgentModelEvaluationAttempt({
              descriptor: current,
              independentRunId: `run.${current.samplingIdentityDigest.slice('sha256-'.length)}`,
              ...attemptAuthority(current.attemptId),
              responseDigest,
              status: 'completed',
              outcome: 'passed',
              metricObservations: [],
              usage: demand(1).usage,
              cost: [],
              startedAt: V8_TIME.started,
              completedAt: V8_TIME.completed,
            }),
            demand: demand(1),
          };
        },
      },
    });
    const input = {
      planDigest: plan.planDigest,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.transport-failure',
      leaseDurationMs: 86_400_000,
      checkpointEvery: 250,
    };
    const first = await runner.runShard(input);
    expect(first).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: {
        state: 'incomplete',
        completedAttemptRefs: [],
      },
    });
    if (first.ok || !first.checkpoint) return;
    expect(first.checkpoint.missingAttemptRefs).toHaveLength(
      shardDescriptors.length
    );
    expect(first.checkpoint.missingAttemptRefs[0]).toMatchObject({
      attemptId: descriptor.attemptId,
      reason: 'infrastructure-error',
    });
    expect(
      repository.getAttempt(plan.planDigest, descriptor.attemptId)
    ).toBeUndefined();

    const resumed = await runner.runShard(input);
    expect(resumed).toMatchObject({
      ok: true,
      checkpoint: { state: 'completed', missingAttemptRefs: [] },
    });
    if (!resumed.ok) return;
    expect(resumed.executedAttemptCount).toBe(shardDescriptors.length);
    expect(resumed.checkpoint.completedAttemptRefs).toHaveLength(
      shardDescriptors.length
    );
    expect(
      repository.getAttempt(plan.planDigest, descriptor.attemptId)
    ).toMatchObject({
      status: 'completed',
      outcome: 'passed',
    });
  }, 60_000);

  it('rejects an over-budget atomic shard reservation', () => {
    const plan = createV8EvaluationPlan();
    const repository = new InMemoryAgentEvaluationRepository();
    repository.putPlan(plan);
    const ledger = repository.getBudgetLedger(plan.planDigest)!;
    expect(
      repository.reserveBudget({
        planDigest: plan.planDigest,
        reservationId: 'reservation.over-budget',
        expectedRevision: ledger.revision,
        demand: demand(plan.budget.budget.maxModelInvocations + 1),
        reservedAt: V8_TIME.started,
      })
    ).toMatchObject({ ok: false });
  });

  it('fences leases and reservations to the frozen plan window', () => {
    const plan = createV8EvaluationPlan();
    const repository = new InMemoryAgentEvaluationRepository();
    repository.putPlan(plan);
    const shardId = repository.listDescriptors(plan.planDigest)[0]!.shardId;
    expect(
      repository.claimShard({
        planDigest: plan.planDigest,
        shardId,
        ownerId: 'evaluation-worker.expired',
        acquiredAt: plan.expiresAt,
        leaseDurationMs: 1,
      })
    ).toMatchObject({ ok: false, reason: 'lease-expired' });
    expect(
      repository.reserveBudget({
        planDigest: plan.planDigest,
        reservationId: 'reservation.expired',
        expectedRevision: 0,
        demand: demand(1),
        reservedAt: plan.expiresAt,
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'AI-6002', path: '/reservedAt' }],
    });
  });

  it('checkpoints every pending attempt when shard estimation throws', async () => {
    const plan = createV8EvaluationPlan();
    const repository = new InMemoryAgentEvaluationRepository();
    repository.putPlan(plan);
    const descriptor = repository.listDescriptors(plan.planDigest)[0]!;
    const runner = new AgentModelEvaluationShardRunner({
      repository,
      now: () => V8_TIME.started,
      executor: {
        estimateShard: () => {
          throw new Error('pricing snapshot unavailable');
        },
        execute: async () => {
          throw new Error('must not execute without a reservation estimate');
        },
      },
    });
    const result = await runner.runShard({
      planDigest: plan.planDigest,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.estimator-failure',
      leaseDurationMs: 86_400_000,
      checkpointEvery: 250,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: { state: 'incomplete' },
    });
    if (result.ok || !result.checkpoint) return;
    expect(result.checkpoint.missingAttemptRefs).toHaveLength(
      repository
        .listDescriptors(plan.planDigest)
        .filter(({ shardId }) => shardId === descriptor.shardId).length
    );
    expect(
      result.checkpoint.missingAttemptRefs.every(
        ({ reason }) => reason === 'infrastructure-error'
      )
    ).toBe(true);
    expect(repository.getBudgetLedger(plan.planDigest)?.reservations).toEqual(
      []
    );
  });

  it('reconciles the reserved ceiling and checkpoints incomplete when executor usage drifts', async () => {
    const plan = createV8EvaluationPlan();
    const repository = new InMemoryAgentEvaluationRepository();
    repository.putPlan(plan);
    const descriptor = repository.listDescriptors(plan.planDigest)[0]!;
    const runner = new AgentModelEvaluationShardRunner({
      repository,
      now: () => V8_TIME.started,
      executor: {
        estimateShard: ({ descriptors }) => demand(descriptors.length),
        execute: async ({ descriptor: current }) => ({
          attempt: createAgentModelEvaluationAttempt({
            descriptor: current,
            independentRunId: `run.${current.samplingIdentityDigest.slice('sha256-'.length)}`,
            ...attemptAuthority(current.attemptId),
            responseDigest: digestAgentCanonicalValue({
              attemptId: current.attemptId,
              response: 'usage-drift',
            }),
            status: 'completed',
            outcome: 'passed',
            metricObservations: [],
            usage: demand(1).usage,
            cost: [],
            startedAt: V8_TIME.started,
            completedAt: V8_TIME.completed,
          }),
          demand: demand(2),
        }),
      },
    });
    const result = await runner.runShard({
      planDigest: plan.planDigest,
      shardId: descriptor.shardId,
      ownerId: 'evaluation-worker.drift',
      leaseDurationMs: 86_400_000,
      checkpointEvery: 250,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'executor-failed',
      checkpoint: { state: 'incomplete' },
    });
    expect(
      repository
        .getBudgetLedger(plan.planDigest)
        ?.reservations.every(
          ({ status, settlement }) =>
            status === 'settled' && settlement?.requiresReconciliation
        )
    ).toBe(true);
  });
});
