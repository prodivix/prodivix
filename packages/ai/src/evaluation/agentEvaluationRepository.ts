import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  createAgentBudgetLedger,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerResult,
  type AgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';
import type {
  AgentEvaluationGraderReport,
  AgentEvaluationMetricReport,
  AgentEvaluationShardCheckpoint,
  AgentHoldoutExecutionReceipt,
  AgentHumanReviewReport,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationManifest,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import {
  canonicalAgentEvaluationValidatedHumanMetricObservationOrder,
  isAgentEvaluationValidatedHumanMetricObservation,
  type AgentEvaluationValidatedHumanMetricObservation,
} from './agentEvaluationHumanMetricAuthority';
import {
  planAgentModelEvaluationAttempts,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import {
  isAgentEvaluationGraderReport,
  isAgentEvaluationMetricReport,
  isAgentEvaluationShardCheckpoint,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  validateAgentModelEvaluationManifest,
} from './agentEvaluationResults';

export type AgentEvaluationShardLease = Readonly<{
  planDigest: CanonicalDigest;
  shardId: string;
  ownerId: string;
  generation: number;
  acquiredAt: Instant;
  expiresAt: Instant;
  leaseDigest: CanonicalDigest;
}>;

export type AgentEvaluationRepositoryWriteResult<T> =
  | Readonly<{ ok: true; value: T; replayed: boolean }>
  | Readonly<{
      ok: false;
      reason:
        | 'not-found'
        | 'conflict'
        | 'invalid'
        | 'lease-held'
        | 'lease-expired'
        | 'fenced';
    }>;

export type AgentEvaluationManifestLookup =
  | Readonly<{ status: 'found'; manifest: AgentModelEvaluationManifest }>
  | Readonly<{ status: 'missing' | 'expired' | 'unsatisfied' }>;

/**
 * Durable evaluation persistence port. Production composition can implement
 * this contract with PostgreSQL while the in-memory repository remains the
 * deterministic reference adapter.
 */
export interface AgentEvaluationRepository {
  putPlan(
    plan: AgentModelEvaluationPlan
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationPlan>;
  getPlan(planDigest: CanonicalDigest): AgentModelEvaluationPlan | undefined;
  listDescriptors(
    planDigest: CanonicalDigest
  ): readonly AgentModelEvaluationAttemptDescriptor[];
  putAttempt(
    attempt: AgentModelEvaluationAttempt
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationAttempt>;
  getAttempt(
    planDigest: CanonicalDigest,
    attemptId: string
  ): AgentModelEvaluationAttempt | undefined;
  listAttempts(
    planDigest: CanonicalDigest
  ): readonly AgentModelEvaluationAttempt[];
  claimShard(
    input: Readonly<{
      planDigest: CanonicalDigest;
      shardId: string;
      ownerId: string;
      acquiredAt: Instant;
      leaseDurationMs: number;
    }>
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>;
  renewShard(
    input: Readonly<{
      planDigest: CanonicalDigest;
      shardId: string;
      ownerId: string;
      generation: number;
      renewedAt: Instant;
      leaseDurationMs: number;
    }>
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>;
  putCheckpoint(
    checkpoint: AgentEvaluationShardCheckpoint
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardCheckpoint>;
  getLatestCheckpoint(
    planDigest: CanonicalDigest,
    shardId: string
  ): AgentEvaluationShardCheckpoint | undefined;
  getBudgetLedger(
    planDigest: CanonicalDigest
  ): AgentBudgetLedgerState | undefined;
  reserveBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      demand: AgentBudgetDemand;
      reservedAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined;
  settleBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      actual: AgentBudgetDemand;
      settledAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined;
  reconcileBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      reason: 'worker-loss' | 'timeout' | 'provider-disconnect' | 'ack-loss';
      settledAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined;
  putMetricReport(
    report: AgentEvaluationMetricReport
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationMetricReport>;
  putGraderReport(
    report: AgentEvaluationGraderReport
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationGraderReport>;
  putHumanReviewReport(
    report: AgentHumanReviewReport
  ): AgentEvaluationRepositoryWriteResult<AgentHumanReviewReport>;
  putValidatedHumanMetricObservations(
    planDigest: CanonicalDigest,
    observations: readonly AgentEvaluationValidatedHumanMetricObservation[]
  ): AgentEvaluationRepositoryWriteResult<
    readonly AgentEvaluationValidatedHumanMetricObservation[]
  >;
  listValidatedHumanMetricObservations(
    planDigest: CanonicalDigest
  ): readonly AgentEvaluationValidatedHumanMetricObservation[];
  putHoldoutReceipt(
    receipt: AgentHoldoutExecutionReceipt
  ): AgentEvaluationRepositoryWriteResult<AgentHoldoutExecutionReceipt>;
  putManifest(
    manifest: AgentModelEvaluationManifest
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationManifest>;
  findFreshSatisfiedManifest(
    input: Readonly<{
      planDigest: CanonicalDigest;
      manifestId: string;
      qualificationTargetDigest: CanonicalDigest;
      at: Instant;
    }>
  ): AgentEvaluationManifestLookup;
}

const planKey = (planDigest: CanonicalDigest, id: string): string =>
  `${planDigest}\u0000${id}`;

const createLease = (
  input: Omit<AgentEvaluationShardLease, 'leaseDigest'>
): AgentEvaluationShardLease => {
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    leaseDigest: digestAgentCanonicalValue(base),
  });
};

/** Zero-network reference store with the same immutable/CAS boundaries as the backend. */
export class InMemoryAgentEvaluationRepository implements AgentEvaluationRepository {
  readonly #plans = new Map<CanonicalDigest, AgentModelEvaluationPlan>();
  readonly #descriptors = new Map<
    CanonicalDigest,
    ReadonlyMap<
      string,
      ReturnType<typeof planAgentModelEvaluationAttempts>[number]
    >
  >();
  readonly #attempts = new Map<string, AgentModelEvaluationAttempt>();
  readonly #checkpointHistory = new Map<
    string,
    AgentEvaluationShardCheckpoint
  >();
  readonly #latestCheckpoints = new Map<
    string,
    AgentEvaluationShardCheckpoint
  >();
  readonly #leases = new Map<string, AgentEvaluationShardLease>();
  readonly #budgetLedgers = new Map<CanonicalDigest, AgentBudgetLedgerState>();
  readonly #metricReports = new Map<string, AgentEvaluationMetricReport>();
  readonly #graderReports = new Map<string, AgentEvaluationGraderReport>();
  readonly #humanReports = new Map<string, AgentHumanReviewReport>();
  readonly #humanMetricObservations = new Map<
    CanonicalDigest,
    readonly AgentEvaluationValidatedHumanMetricObservation[]
  >();
  readonly #holdoutReceipts = new Map<string, AgentHoldoutExecutionReceipt>();
  readonly #manifests = new Map<string, AgentModelEvaluationManifest>();

  putPlan(
    plan: AgentModelEvaluationPlan
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationPlan> {
    if (validateAgentModelEvaluationPlan(plan).length > 0) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const current = this.#plans.get(plan.planDigest);
    if (current) {
      return sameCanonicalJson(current, plan)
        ? Object.freeze({ ok: true, value: current, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    const descriptors = planAgentModelEvaluationAttempts(plan);
    this.#plans.set(plan.planDigest, plan);
    this.#descriptors.set(
      plan.planDigest,
      new Map(descriptors.map((entry) => [entry.attemptId, entry]))
    );
    this.#budgetLedgers.set(
      plan.planDigest,
      createAgentBudgetLedger(plan.budget.budget)
    );
    return Object.freeze({ ok: true, value: plan, replayed: false });
  }

  getPlan(planDigest: CanonicalDigest): AgentModelEvaluationPlan | undefined {
    return this.#plans.get(planDigest);
  }

  listDescriptors(planDigest: CanonicalDigest) {
    return Object.freeze([
      ...(this.#descriptors.get(planDigest)?.values() ?? []),
    ]);
  }

  putAttempt(
    attempt: AgentModelEvaluationAttempt
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationAttempt> {
    if (!isAgentModelEvaluationAttempt(attempt)) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const planned = this.#descriptors
      .get(attempt.descriptor.planDigest)
      ?.get(attempt.descriptor.attemptId);
    if (!planned) return Object.freeze({ ok: false, reason: 'not-found' });
    if (!sameCanonicalJson(planned, attempt.descriptor)) {
      return Object.freeze({ ok: false, reason: 'fenced' });
    }
    const key = planKey(
      attempt.descriptor.planDigest,
      attempt.descriptor.attemptId
    );
    const current = this.#attempts.get(key);
    if (current) {
      return current.attemptDigest === attempt.attemptDigest &&
        sameCanonicalJson(current, attempt)
        ? Object.freeze({ ok: true, value: current, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    this.#attempts.set(key, attempt);
    return Object.freeze({ ok: true, value: attempt, replayed: false });
  }

  getAttempt(planDigest: CanonicalDigest, attemptId: string) {
    return this.#attempts.get(planKey(planDigest, attemptId));
  }

  listAttempts(
    planDigest: CanonicalDigest
  ): readonly AgentModelEvaluationAttempt[] {
    return Object.freeze(
      [...this.#attempts.entries()]
        .filter(([key]) => key.startsWith(`${planDigest}\u0000`))
        .map(([, attempt]) => attempt)
        .sort((left, right) =>
          compareUnicodeCodePoints(
            left.descriptor.attemptId,
            right.descriptor.attemptId
          )
        )
    );
  }

  claimShard(
    input: Readonly<{
      planDigest: CanonicalDigest;
      shardId: string;
      ownerId: string;
      acquiredAt: Instant;
      leaseDurationMs: number;
    }>
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease> {
    const plan = this.#plans.get(input.planDigest);
    const acquiredAt = Date.parse(input.acquiredAt);
    const candidateExpiry = acquiredAt + input.leaseDurationMs;
    if (
      !plan ||
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs <= 0 ||
      !Number.isFinite(acquiredAt)
    ) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    if (
      acquiredAt < Date.parse(plan.plannedAt) ||
      acquiredAt >= Date.parse(plan.expiresAt) ||
      candidateExpiry > Date.parse(plan.expiresAt)
    ) {
      return Object.freeze({ ok: false, reason: 'lease-expired' });
    }
    const key = planKey(input.planDigest, input.shardId);
    const current = this.#leases.get(key);
    if (
      current &&
      Date.parse(current.expiresAt) > acquiredAt &&
      current.ownerId !== input.ownerId
    ) {
      return Object.freeze({ ok: false, reason: 'lease-held' });
    }
    if (
      current &&
      Date.parse(current.expiresAt) > acquiredAt &&
      current.ownerId === input.ownerId
    ) {
      return Object.freeze({ ok: true, value: current, replayed: true });
    }
    const lease = createLease({
      planDigest: input.planDigest,
      shardId: input.shardId,
      ownerId: input.ownerId,
      generation: (current?.generation ?? 0) + 1,
      acquiredAt: input.acquiredAt,
      expiresAt: new Date(candidateExpiry).toISOString(),
    });
    this.#leases.set(key, lease);
    return Object.freeze({ ok: true, value: lease, replayed: false });
  }

  renewShard(
    input: Readonly<{
      planDigest: CanonicalDigest;
      shardId: string;
      ownerId: string;
      generation: number;
      renewedAt: Instant;
      leaseDurationMs: number;
    }>
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease> {
    const key = planKey(input.planDigest, input.shardId);
    const current = this.#leases.get(key);
    const plan = this.#plans.get(input.planDigest);
    const renewedAt = Date.parse(input.renewedAt);
    if (
      !current ||
      !plan ||
      !Number.isFinite(renewedAt) ||
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs <= 0
    ) {
      return Object.freeze({
        ok: false,
        reason: current ? 'invalid' : 'not-found',
      });
    }
    if (
      current.ownerId !== input.ownerId ||
      current.generation !== input.generation
    ) {
      return Object.freeze({ ok: false, reason: 'fenced' });
    }
    if (Date.parse(current.expiresAt) <= renewedAt) {
      return Object.freeze({ ok: false, reason: 'lease-expired' });
    }
    const { leaseDigest: _leaseDigest, ...leaseBase } = current;
    const candidateExpiry = renewedAt + input.leaseDurationMs;
    if (
      renewedAt >= Date.parse(plan.expiresAt) ||
      candidateExpiry > Date.parse(plan.expiresAt)
    ) {
      return Object.freeze({ ok: false, reason: 'lease-expired' });
    }
    const renewed = createLease({
      ...leaseBase,
      expiresAt: new Date(
        Math.max(Date.parse(current.expiresAt), candidateExpiry)
      ).toISOString(),
    });
    this.#leases.set(key, renewed);
    return Object.freeze({ ok: true, value: renewed, replayed: false });
  }

  putCheckpoint(
    checkpoint: AgentEvaluationShardCheckpoint
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationShardCheckpoint> {
    if (!isAgentEvaluationShardCheckpoint(checkpoint)) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const key = planKey(checkpoint.planDigest, checkpoint.shardId);
    const lease = this.#leases.get(key);
    if (!lease) return Object.freeze({ ok: false, reason: 'not-found' });
    if (
      lease.ownerId !== checkpoint.leaseOwnerId ||
      lease.generation !== checkpoint.leaseGeneration
    ) {
      return Object.freeze({ ok: false, reason: 'fenced' });
    }
    if (
      Date.parse(checkpoint.updatedAt) < Date.parse(lease.acquiredAt) ||
      Date.parse(lease.expiresAt) <= Date.parse(checkpoint.updatedAt)
    ) {
      return Object.freeze({ ok: false, reason: 'lease-expired' });
    }
    const historyKey = `${key}\u0000${checkpoint.revision}`;
    const history = this.#checkpointHistory.get(historyKey);
    if (history) {
      return history.checkpointDigest === checkpoint.checkpointDigest
        ? Object.freeze({ ok: true, value: history, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    const current = this.#latestCheckpoints.get(key);
    if (checkpoint.revision !== (current?.revision ?? -1) + 1) {
      return Object.freeze({ ok: false, reason: 'conflict' });
    }
    this.#checkpointHistory.set(historyKey, checkpoint);
    this.#latestCheckpoints.set(key, checkpoint);
    return Object.freeze({ ok: true, value: checkpoint, replayed: false });
  }

  getLatestCheckpoint(planDigest: CanonicalDigest, shardId: string) {
    return this.#latestCheckpoints.get(planKey(planDigest, shardId));
  }

  getBudgetLedger(planDigest: CanonicalDigest) {
    return this.#budgetLedgers.get(planDigest);
  }

  reserveBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      demand: AgentBudgetDemand;
      reservedAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined {
    const plan = this.#plans.get(input.planDigest);
    const ledger = this.#budgetLedgers.get(input.planDigest);
    if (!ledger || !plan) return undefined;
    const reservedAt = Date.parse(input.reservedAt);
    if (
      !Number.isFinite(reservedAt) ||
      reservedAt < Date.parse(plan.plannedAt) ||
      reservedAt >= Date.parse(plan.expiresAt)
    ) {
      return Object.freeze({
        ok: false,
        state: ledger,
        issues: Object.freeze([
          Object.freeze({
            code: 'AI-6002' as const,
            path: '/reservedAt',
            message:
              'Evaluation budget reservation is outside the frozen plan window.',
            blocking: true as const,
          }),
        ]),
      });
    }
    const result = reserveAgentBudget(ledger, input);
    if (result.ok) this.#budgetLedgers.set(input.planDigest, result.state);
    return result;
  }

  settleBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      actual: AgentBudgetDemand;
      settledAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined {
    const ledger = this.#budgetLedgers.get(input.planDigest);
    if (!ledger) return undefined;
    const result = settleAgentBudget(ledger, input);
    if (result.ok) this.#budgetLedgers.set(input.planDigest, result.state);
    return result;
  }

  reconcileBudget(
    input: Readonly<{
      planDigest: CanonicalDigest;
      reservationId: string;
      expectedRevision: number;
      reason: 'worker-loss' | 'timeout' | 'provider-disconnect' | 'ack-loss';
      settledAt: Instant;
    }>
  ): AgentBudgetLedgerResult | undefined {
    const ledger = this.#budgetLedgers.get(input.planDigest);
    if (!ledger) return undefined;
    const result = reconcileAgentBudgetReservation(ledger, input);
    if (result.ok) this.#budgetLedgers.set(input.planDigest, result.state);
    return result;
  }

  putMetricReport(
    report: AgentEvaluationMetricReport
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationMetricReport> {
    return this.#putReport(
      report,
      report.reportId,
      report.planDigest,
      isAgentEvaluationMetricReport(report),
      this.#metricReports
    );
  }

  putGraderReport(
    report: AgentEvaluationGraderReport
  ): AgentEvaluationRepositoryWriteResult<AgentEvaluationGraderReport> {
    return this.#putReport(
      report,
      report.reportId,
      report.planDigest,
      isAgentEvaluationGraderReport(report),
      this.#graderReports
    );
  }

  putHumanReviewReport(
    report: AgentHumanReviewReport
  ): AgentEvaluationRepositoryWriteResult<AgentHumanReviewReport> {
    return this.#putReport(
      report,
      report.reportId,
      report.planDigest,
      isAgentHumanReviewReport(report),
      this.#humanReports
    );
  }

  putValidatedHumanMetricObservations(
    planDigest: CanonicalDigest,
    observations: readonly AgentEvaluationValidatedHumanMetricObservation[]
  ): AgentEvaluationRepositoryWriteResult<
    readonly AgentEvaluationValidatedHumanMetricObservation[]
  > {
    const plan = this.#plans.get(planDigest);
    if (!plan) return Object.freeze({ ok: false, reason: 'not-found' });
    if (
      !Array.isArray(observations) ||
      !observations.every(
        (observation) =>
          isAgentEvaluationValidatedHumanMetricObservation(observation) &&
          observation.planDigest === planDigest &&
          observation.repositoryCommit === plan.repositoryCommit
      )
    ) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const canonical =
      canonicalAgentEvaluationValidatedHumanMetricObservationOrder(
        observations
      );
    if (!sameCanonicalJson(canonical, observations)) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const current = this.#humanMetricObservations.get(planDigest);
    if (current) {
      return sameCanonicalJson(current, canonical)
        ? Object.freeze({ ok: true, value: current, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    this.#humanMetricObservations.set(planDigest, canonical);
    return Object.freeze({ ok: true, value: canonical, replayed: false });
  }

  listValidatedHumanMetricObservations(
    planDigest: CanonicalDigest
  ): readonly AgentEvaluationValidatedHumanMetricObservation[] {
    return this.#humanMetricObservations.get(planDigest) ?? Object.freeze([]);
  }

  putHoldoutReceipt(
    receipt: AgentHoldoutExecutionReceipt
  ): AgentEvaluationRepositoryWriteResult<AgentHoldoutExecutionReceipt> {
    return this.#putReport(
      receipt,
      receipt.receiptId,
      receipt.planDigest,
      isAgentHoldoutExecutionReceipt(receipt),
      this.#holdoutReceipts
    );
  }

  #putReport<T>(
    value: T,
    id: string,
    planDigest: CanonicalDigest,
    valid: boolean,
    repository: Map<string, T>
  ): AgentEvaluationRepositoryWriteResult<T> {
    if (!valid) return Object.freeze({ ok: false, reason: 'invalid' });
    if (!this.#plans.has(planDigest))
      return Object.freeze({ ok: false, reason: 'not-found' });
    const key = planKey(planDigest, id);
    const current = repository.get(key);
    if (current) {
      return sameCanonicalJson(current, value)
        ? Object.freeze({ ok: true, value: current, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    repository.set(key, value);
    return Object.freeze({ ok: true, value, replayed: false });
  }

  putManifest(
    manifest: AgentModelEvaluationManifest
  ): AgentEvaluationRepositoryWriteResult<AgentModelEvaluationManifest> {
    const plan = this.#plans.get(manifest.planDigest);
    if (!plan) return Object.freeze({ ok: false, reason: 'not-found' });
    const metricReport = this.#metricReports.get(
      planKey(manifest.planDigest, manifest.metricReportRef)
    );
    const graderReport = this.#graderReports.get(
      planKey(manifest.planDigest, manifest.graderReportRef)
    );
    const holdoutExecutionReceipt = this.#holdoutReceipts.get(
      planKey(manifest.planDigest, manifest.holdoutExecutionReceiptRef)
    );
    const humanReviewReport = manifest.humanReviewReportRef
      ? this.#humanReports.get(
          planKey(manifest.planDigest, manifest.humanReviewReportRef)
        )
      : undefined;
    if (!metricReport || !graderReport || !holdoutExecutionReceipt) {
      return Object.freeze({ ok: false, reason: 'not-found' });
    }
    if (
      validateAgentModelEvaluationManifest({
        manifest,
        plan,
        descriptors: this.listDescriptors(manifest.planDigest),
        attempts: this.listAttempts(manifest.planDigest),
        validatedHumanMetricObservations:
          this.listValidatedHumanMetricObservations(manifest.planDigest),
        metricReport,
        graderReport,
        humanReviewReport,
        holdoutExecutionReceipt,
      }).length > 0
    ) {
      return Object.freeze({ ok: false, reason: 'invalid' });
    }
    const key = planKey(manifest.planDigest, manifest.manifestId);
    const current = this.#manifests.get(key);
    if (current) {
      return current.manifestDigest === manifest.manifestDigest
        ? Object.freeze({ ok: true, value: current, replayed: true })
        : Object.freeze({ ok: false, reason: 'conflict' });
    }
    this.#manifests.set(key, manifest);
    return Object.freeze({ ok: true, value: manifest, replayed: false });
  }

  findFreshSatisfiedManifest(
    input: Readonly<{
      planDigest: CanonicalDigest;
      manifestId: string;
      qualificationTargetDigest: CanonicalDigest;
      at: Instant;
    }>
  ): AgentEvaluationManifestLookup {
    const manifest = this.#manifests.get(
      planKey(input.planDigest, input.manifestId)
    );
    if (!manifest) return Object.freeze({ status: 'missing' });
    if (
      Date.parse(input.at) >= Date.parse(manifest.expiresAt) ||
      manifest.outcome === 'expired'
    ) {
      return Object.freeze({ status: 'expired' });
    }
    if (
      manifest.outcome !== 'satisfied' ||
      !manifest.qualificationTargetDigests.includes(
        input.qualificationTargetDigest
      )
    ) {
      return Object.freeze({ status: 'unsatisfied' });
    }
    return Object.freeze({ status: 'found', manifest });
  }
}
