import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { Instant } from '../domain/agent.types';
import type { AgentBudgetDemand } from '../usage/agentBudgetLedger';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import type {
  AgentEvaluationShardCheckpoint,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationMissingAttemptRef,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import type { InMemoryAgentEvaluationRepository } from './agentEvaluationRepository';
import {
  createAgentEvaluationShardCheckpoint,
  createAgentModelEvaluationAttempt,
  isAgentModelEvaluationAttempt,
} from './agentEvaluationResults';

export type AgentEvaluationAttemptExecution = Readonly<{
  attempt: AgentModelEvaluationAttempt;
  demand: AgentBudgetDemand;
}>;

/** Remote-model execution is injected; the runner never resolves credentials. */
export interface AgentModelEvaluationAttemptExecutor {
  estimateShard(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
    }>
  ): AgentBudgetDemand;
  execute(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationAttemptExecution>;
}

export type AgentEvaluationShardRunResult =
  | Readonly<{
      ok: true;
      checkpoint: AgentEvaluationShardCheckpoint;
      executedAttemptCount: number;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'plan-not-found'
        | 'shard-not-found'
        | 'lease-rejected'
        | 'budget-exhausted'
        | 'checkpoint-conflict'
        | 'attempt-conflict'
        | 'executor-failed';
      checkpoint?: AgentEvaluationShardCheckpoint;
    }>;

export type AgentModelEvaluationRunnerRepository = Pick<
  InMemoryAgentEvaluationRepository,
  | 'getPlan'
  | 'listDescriptors'
  | 'claimShard'
  | 'renewShard'
  | 'getAttempt'
  | 'putAttempt'
  | 'getLatestCheckpoint'
  | 'putCheckpoint'
  | 'getBudgetLedger'
  | 'reserveBudget'
  | 'settleBudget'
  | 'reconcileBudget'
>;

const emptyDemand = (): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([]),
    cost: Object.freeze([]),
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 0,
  });

const addDemand = (
  left: AgentBudgetDemand,
  right: AgentBudgetDemand
): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([
      ...left.usage.amounts,
      ...right.usage.amounts,
    ]),
    cost: normalizeAgentCosts([...left.cost, ...right.cost]),
    modelInvocations: left.modelInvocations + right.modelInvocations,
    toolCalls: left.toolCalls + right.toolCalls,
    repairRounds: left.repairRounds + right.repairRounds,
    transactions: left.transactions + right.transactions,
    artifactBytes: left.artifactBytes + right.artifactBytes,
    elapsedMs: left.elapsedMs + right.elapsedMs,
  });

const missingRef = (
  descriptor: AgentModelEvaluationAttemptDescriptor,
  reason: AgentModelEvaluationMissingAttemptRef['reason']
): AgentModelEvaluationMissingAttemptRef =>
  Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    reason,
  });

const executionMatchesAttempt = (
  execution: AgentEvaluationAttemptExecution,
  descriptor: AgentModelEvaluationAttemptDescriptor
): boolean => {
  try {
    const demandCounts = [
      execution.demand.modelInvocations,
      execution.demand.toolCalls,
      execution.demand.repairRounds,
      execution.demand.transactions,
      execution.demand.artifactBytes,
      execution.demand.elapsedMs,
    ];
    return (
      isAgentModelEvaluationAttempt(execution.attempt) &&
      execution.attempt.descriptor.attemptId === descriptor.attemptId &&
      sameCanonicalJson(execution.attempt.usage, execution.demand.usage) &&
      sameCanonicalJson(
        execution.attempt.cost,
        normalizeAgentCosts(execution.demand.cost)
      ) &&
      execution.demand.modelInvocations >= 1 &&
      demandCounts.every((count) => Number.isSafeInteger(count) && count >= 0)
    );
  } catch {
    return false;
  }
};

export class AgentModelEvaluationShardRunner {
  readonly #repository: AgentModelEvaluationRunnerRepository;
  readonly #executor: AgentModelEvaluationAttemptExecutor;
  readonly #now: () => Instant;

  constructor(
    input: Readonly<{
      repository: AgentModelEvaluationRunnerRepository;
      executor: AgentModelEvaluationAttemptExecutor;
      now: () => Instant;
    }>
  ) {
    this.#repository = input.repository;
    this.#executor = input.executor;
    this.#now = input.now;
  }

  async runShard(
    input: Readonly<{
      planDigest: string;
      shardId: string;
      ownerId: string;
      leaseDurationMs: number;
      checkpointEvery: number;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationShardRunResult> {
    const plan = this.#repository.getPlan(input.planDigest);
    if (!plan) return Object.freeze({ ok: false, reason: 'plan-not-found' });
    const descriptors = this.#repository
      .listDescriptors(plan.planDigest)
      .filter(({ shardId }) => shardId === input.shardId)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      );
    if (descriptors.length === 0) {
      return Object.freeze({ ok: false, reason: 'shard-not-found' });
    }
    const lease = this.#repository.claimShard({
      planDigest: plan.planDigest,
      shardId: input.shardId,
      ownerId: input.ownerId,
      acquiredAt: this.#now(),
      leaseDurationMs: input.leaseDurationMs,
    });
    if (!lease.ok) {
      return Object.freeze({ ok: false, reason: 'lease-rejected' });
    }
    const existingAttempts = descriptors
      .map((descriptor) =>
        this.#repository.getAttempt(plan.planDigest, descriptor.attemptId)
      )
      .filter((attempt): attempt is AgentModelEvaluationAttempt =>
        Boolean(attempt)
      );
    const existingMissing = existingAttempts
      .filter(({ status }) => status !== 'completed')
      .map(({ descriptor, status }) =>
        missingRef(descriptor, status === 'completed' ? 'missing' : status)
      );
    const pending = descriptors.filter(
      ({ attemptId }) =>
        !existingAttempts.some(
          ({ descriptor }) => descriptor.attemptId === attemptId
        )
    );
    let checkpoint = this.#repository.getLatestCheckpoint(
      plan.planDigest,
      input.shardId
    );
    let revision = (checkpoint?.revision ?? -1) + 1;
    let actual = emptyDemand();
    let executedAttemptCount = 0;
    const ledger = this.#repository.getBudgetLedger(plan.planDigest);
    if (!ledger) return Object.freeze({ ok: false, reason: 'plan-not-found' });
    const reservationId = `evaluation-reservation:${digestAgentCanonicalValue({
      planDigest: plan.planDigest,
      shardId: input.shardId,
      leaseGeneration: lease.value.generation,
      checkpointRevision: revision,
      pendingDescriptorDigests: pending.map(
        ({ descriptorDigest }) => descriptorDigest
      ),
    }).slice('sha256-'.length)}`;
    if (pending.length > 0) {
      let estimatedDemand: AgentBudgetDemand;
      try {
        estimatedDemand = this.#executor.estimateShard({
          plan,
          descriptors: pending,
        });
      } catch {
        const incomplete = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: [
            ...existingMissing,
            ...pending.map((entry) =>
              missingRef(entry, 'infrastructure-error')
            ),
          ],
        });
        return Object.freeze({
          ok: false,
          reason: incomplete ? 'executor-failed' : 'checkpoint-conflict',
          ...(incomplete ? { checkpoint: incomplete } : {}),
        });
      }
      const reservation = this.#repository.reserveBudget({
        planDigest: plan.planDigest,
        reservationId,
        expectedRevision: ledger.revision,
        demand: estimatedDemand,
        reservedAt: this.#now(),
      });
      if (!reservation?.ok || reservation.reservation.status !== 'reserved') {
        const incomplete = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: [
            ...existingMissing,
            ...pending.map((entry) => missingRef(entry, 'missing')),
          ],
        });
        return incomplete
          ? Object.freeze({
              ok: false,
              reason: 'budget-exhausted',
              checkpoint: incomplete,
            })
          : Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
      }
    }

    for (const descriptor of pending) {
      if (input.signal?.aborted) {
        this.#reconcileReservation(
          plan.planDigest,
          reservationId,
          'worker-loss'
        );
        const remaining = pending
          .slice(executedAttemptCount)
          .map((entry) => missingRef(entry, 'cancelled'));
        checkpoint = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: [...existingMissing, ...remaining],
        });
        return checkpoint
          ? Object.freeze({
              ok: false,
              reason: 'executor-failed',
              checkpoint,
            })
          : Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
      }
      const renewed = this.#repository.renewShard({
        planDigest: plan.planDigest,
        shardId: input.shardId,
        ownerId: input.ownerId,
        generation: lease.value.generation,
        renewedAt: this.#now(),
        leaseDurationMs: input.leaseDurationMs,
      });
      if (!renewed.ok) {
        this.#reconcileReservation(
          plan.planDigest,
          reservationId,
          'worker-loss'
        );
        return Object.freeze({ ok: false, reason: 'lease-rejected' });
      }
      let execution: AgentEvaluationAttemptExecution;
      try {
        execution = await this.#executor.execute({
          plan,
          descriptor,
          signal: input.signal,
        });
      } catch {
        const failed = createAgentModelEvaluationAttempt({
          descriptor,
          independentRunId: `evaluation-run:${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
          status: 'infrastructure-error',
          outcome: 'inconclusive',
          metricObservations: Object.freeze([]),
          usage: createAgentUsageVector([
            Object.freeze({
              unit: 'text-token-input',
              confidence: 'unknown',
            }),
          ]),
          cost: Object.freeze([]),
          startedAt: this.#now(),
          completedAt: this.#now(),
        });
        const stored = this.#repository.putAttempt(failed);
        if (!stored.ok) {
          this.#reconcileReservation(
            plan.planDigest,
            reservationId,
            'ack-loss'
          );
          return Object.freeze({ ok: false, reason: 'attempt-conflict' });
        }
        this.#reconcileReservation(
          plan.planDigest,
          reservationId,
          'provider-disconnect'
        );
        const remaining = [
          missingRef(descriptor, 'infrastructure-error'),
          ...pending
            .slice(executedAttemptCount + 1)
            .map((entry) => missingRef(entry, 'missing')),
        ];
        checkpoint = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: [...existingMissing, ...remaining],
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'executor-failed' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }
      if (!executionMatchesAttempt(execution, descriptor)) {
        this.#reconcileReservation(
          plan.planDigest,
          reservationId,
          'provider-disconnect'
        );
        const remaining = pending
          .slice(executedAttemptCount)
          .map((entry) => missingRef(entry, 'schema-failed'));
        checkpoint = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: [...existingMissing, ...remaining],
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'executor-failed' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }
      const stored = this.#repository.putAttempt(execution.attempt);
      if (!stored.ok) {
        this.#reconcileReservation(plan.planDigest, reservationId, 'ack-loss');
        return Object.freeze({ ok: false, reason: 'attempt-conflict' });
      }
      actual = addDemand(actual, execution.demand);
      executedAttemptCount += 1;
      if (
        Number.isSafeInteger(input.checkpointEvery) &&
        input.checkpointEvery > 0 &&
        executedAttemptCount % input.checkpointEvery === 0
      ) {
        checkpoint = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'running',
          descriptors,
          missing: existingMissing,
        });
        if (!checkpoint) {
          this.#reconcileReservation(
            plan.planDigest,
            reservationId,
            'worker-loss'
          );
          return Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
        }
        revision += 1;
      }
    }

    if (pending.length > 0) {
      const budgetState = this.#repository.getBudgetLedger(plan.planDigest);
      if (!budgetState) {
        return Object.freeze({ ok: false, reason: 'plan-not-found' });
      }
      const settlement = this.#repository.settleBudget({
        planDigest: plan.planDigest,
        reservationId,
        expectedRevision: budgetState.revision,
        actual,
        settledAt: this.#now(),
      });
      if (!settlement?.ok) {
        this.#reconcileReservation(plan.planDigest, reservationId, 'ack-loss');
        checkpoint = this.#checkpoint({
          plan,
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: lease.value.generation,
          revision,
          state: 'incomplete',
          descriptors,
          missing: existingMissing,
        });
        return Object.freeze({
          ok: false,
          reason: 'budget-exhausted',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }
    }
    checkpoint = this.#checkpoint({
      plan,
      shardId: input.shardId,
      ownerId: input.ownerId,
      leaseGeneration: lease.value.generation,
      revision,
      state: existingMissing.length > 0 ? 'incomplete' : 'completed',
      descriptors,
      missing: existingMissing,
    });
    return checkpoint && existingMissing.length === 0
      ? Object.freeze({ ok: true, checkpoint, executedAttemptCount })
      : checkpoint
        ? Object.freeze({
            ok: false,
            reason: 'executor-failed',
            checkpoint,
          })
        : Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
  }

  #checkpoint(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId: string;
      ownerId: string;
      leaseGeneration: number;
      revision: number;
      state: AgentEvaluationShardCheckpoint['state'];
      descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
      missing: readonly AgentModelEvaluationMissingAttemptRef[];
    }>
  ): AgentEvaluationShardCheckpoint | undefined {
    const attempts = input.descriptors
      .map(({ attemptId }) =>
        this.#repository.getAttempt(input.plan.planDigest, attemptId)
      )
      .filter(
        (entry): entry is AgentModelEvaluationAttempt =>
          Boolean(entry) && entry?.status === 'completed'
      );
    const budgetLedger = this.#repository.getBudgetLedger(
      input.plan.planDigest
    );
    if (!budgetLedger) return undefined;
    const checkpoint = createAgentEvaluationShardCheckpoint({
      planDigest: input.plan.planDigest,
      shardId: input.shardId,
      revision: input.revision,
      leaseOwnerId: input.ownerId,
      leaseGeneration: input.leaseGeneration,
      state: input.state,
      completedAttemptRefs: Object.freeze(
        attempts.map((attempt) =>
          Object.freeze({
            attemptId: attempt.descriptor.attemptId,
            descriptorDigest: attempt.descriptor.descriptorDigest,
            attemptDigest: attempt.attemptDigest,
          })
        )
      ),
      missingAttemptRefs: input.missing,
      budgetLedger,
      updatedAt: this.#now(),
    });
    const stored = this.#repository.putCheckpoint(checkpoint);
    return stored.ok ? stored.value : undefined;
  }

  #reconcileReservation(
    planDigest: string,
    reservationId: string,
    reason: 'worker-loss' | 'provider-disconnect' | 'ack-loss'
  ): void {
    const budgetState = this.#repository.getBudgetLedger(planDigest);
    if (!budgetState) return;
    this.#repository.reconcileBudget({
      planDigest,
      reservationId,
      expectedRevision: budgetState.revision,
      reason,
      settledAt: this.#now(),
    });
  }
}
