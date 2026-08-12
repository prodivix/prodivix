import {
  createAgentBudgetLedger,
  createAgentEvaluationExecutionReceipt,
  decodeAgentEvaluationFact,
  encodeAgentEvaluationFact,
  digestAgentEvaluationBlindReviewMappingRefSet,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  isAgentEvaluationBlindReviewMappingRef,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  isAgentEvaluationCapabilityExecutionReceipt,
  isAgentEvaluationCapabilitySpecificReceipt,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentEvaluationGraderReport,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationMetricReport,
  isAgentEvaluationPreDispatchFailureReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderResultSpoolDispositionReceipt,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationReviewCandidate,
  isAgentEvaluationReviewCandidateRef,
  isAgentEvaluationReviewRasterScanReceipt,
  isAgentEvaluationResultSubmissionReceipt,
  isAgentEvaluationShardCheckpoint,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
  isAgentEvaluationValidatedHumanReviewArtifact,
  isAgentEvaluationValidatedHumanMetricObservation,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
  settleAgentBudget,
  validateAgentModelEvaluationPlan,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationFact,
  type AgentEvaluationGraderReport,
  type AgentEvaluationMetricReport,
  type AgentEvaluationReviewCandidate,
  type AgentHoldoutExecutionReceipt,
  type AgentHumanReviewReport,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationCoordinatorLedger,
  AgentEvaluationBlindReviewArtifactSource,
  AgentEvaluationDurableSnapshot,
  AgentEvaluationLedgerBudgetReservation,
  AgentEvaluationPartition,
} from './coordinator';
import {
  AgentEvaluationLedgerClient,
  createEnvironmentAgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

const invalid = (): never => {
  throw new TypeError('Evaluation ledger snapshot is invalid.');
};

const record = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value) || Object.keys(value).some(isUnsafeObjectKey)) {
    return invalid();
  }
  return value;
};

const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : invalid();

const integer = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();

const text = (value: unknown): string =>
  typeof value === 'string' ? value : invalid();

const factFromGetResponse = (value: unknown): unknown => {
  const source = record(value);
  if (Object.keys(source).length !== 1 || !Object.hasOwn(source, 'fact')) {
    invalid();
  }
  return source.fact;
};

const partitionMatches = (
  value: unknown,
  partition: AgentEvaluationPartition
): boolean => {
  const candidate = record(value);
  return (
    candidate.planDigest === partition.planDigest &&
    candidate.repositoryCommit === partition.repositoryCommit
  );
};

type BudgetReservationExport = Readonly<{
  demand: AgentBudgetDemand;
  ledgerRevision: number;
  reservationId: string;
  reservedAt: string;
}>;

type BudgetSettlementExport = Readonly<{
  ledgerRevision: number;
  reservationId: string;
  settledAt: string;
  settlement: NonNullable<
    AgentBudgetLedgerState['reservations'][number]['settlement']
  >;
}>;

const decodeBudget = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): AgentBudgetLedgerState => {
  const source = record(value);
  const revision = integer(source.revision);
  const reservations = array(source.reservations).map((entry) => {
    const candidate = record(entry);
    return Object.freeze({
      demand: candidate.demand as AgentBudgetDemand,
      ledgerRevision: integer(candidate.ledgerRevision),
      reservationId: text(candidate.reservationId),
      reservedAt: text(candidate.reservedAt),
    }) satisfies BudgetReservationExport;
  });
  const settlements = array(source.settlements).map((entry) => {
    const candidate = record(entry);
    return Object.freeze({
      ledgerRevision: integer(candidate.ledgerRevision),
      reservationId: text(candidate.reservationId),
      settledAt: text(candidate.settledAt),
      settlement: candidate.settlement as BudgetSettlementExport['settlement'],
    }) satisfies BudgetSettlementExport;
  });
  const events = [
    ...reservations.map((entry) =>
      Object.freeze({ kind: 'reservation' as const, entry })
    ),
    ...settlements.map((entry) =>
      Object.freeze({ kind: 'settlement' as const, entry })
    ),
  ].sort(
    (left, right) => left.entry.ledgerRevision - right.entry.ledgerRevision
  );
  let state = createAgentBudgetLedger(plan.budget.budget);
  for (const event of events) {
    if (event.entry.ledgerRevision !== state.revision + 1) invalid();
    if (event.kind === 'reservation') {
      const result = reserveAgentBudget(state, {
        reservationId: event.entry.reservationId,
        expectedRevision: state.revision,
        demand: event.entry.demand,
        reservedAt: event.entry.reservedAt,
      });
      if (!result.ok) invalid();
      state = result.state;
      continue;
    }
    const persisted = event.entry.settlement;
    const result = persisted.requiresReconciliation
      ? reconcileAgentBudgetReservation(state, {
          reservationId: event.entry.reservationId,
          expectedRevision: state.revision,
          reason:
            persisted.reconciliationReason === 'usage-unknown' ||
            persisted.reconciliationReason === undefined
              ? invalid()
              : persisted.reconciliationReason,
          settledAt: event.entry.settledAt,
        })
      : settleAgentBudget(state, {
          reservationId: event.entry.reservationId,
          expectedRevision: state.revision,
          actual: persisted.actual,
          settledAt: event.entry.settledAt,
        });
    if (
      !result.ok ||
      !result.reservation.settlement ||
      !sameCanonicalJson(result.reservation.settlement, persisted)
    ) {
      invalid();
    }
    state = result.state;
  }
  if (state.revision !== revision) invalid();
  const unsettled = array(source.unsettledReservationIds)
    .map(text)
    .sort(compareUnicodeCodePoints);
  const expectedUnsettled = state.reservations
    .filter(({ status }) => status !== 'settled')
    .map(({ reservationId }) => reservationId)
    .sort(compareUnicodeCodePoints);
  if (!sameCanonicalJson(unsettled, expectedUnsettled)) invalid();
  return state;
};

const decodeExecutionReceipt = (
  value: unknown
): AgentEvaluationExecutionReceipt => {
  const source = record(value) as AgentEvaluationExecutionReceipt;
  const { receiptDigest: _receiptDigest, ...base } = source;
  const normalized = createAgentEvaluationExecutionReceipt(base);
  return sameCanonicalJson(normalized, source) ? normalized : invalid();
};

type AgentEvaluationFactValueByType = {
  [T in AgentEvaluationFact['factType']]: Extract<
    AgentEvaluationFact,
    Readonly<{ factType: T }>
  >['value'];
};

const decodeFactValue = <T extends AgentEvaluationFact['factType']>(
  value: unknown,
  factType: T
): AgentEvaluationFactValueByType[T] => {
  const decoded = decodeAgentEvaluationFact(value);
  if (!decoded.ok) return invalid();
  if (decoded.value.factType !== factType) return invalid();
  return decoded.value.value as AgentEvaluationFactValueByType[T];
};

const artifactsFrom = (
  values: readonly unknown[]
): Readonly<{
  metricReport?: AgentEvaluationMetricReport;
  graderReport?: AgentEvaluationGraderReport;
  humanReviewReport?: AgentHumanReviewReport;
  holdoutExecutionReceipt?: AgentHoldoutExecutionReceipt;
  manifest?: AgentModelEvaluationManifest;
}> => {
  const result: {
    metricReport?: AgentEvaluationMetricReport;
    graderReport?: AgentEvaluationGraderReport;
    humanReviewReport?: AgentHumanReviewReport;
    holdoutExecutionReceipt?: AgentHoldoutExecutionReceipt;
    manifest?: AgentModelEvaluationManifest;
  } = {};
  for (const value of values) {
    const decoded = decodeAgentEvaluationFact(value);
    if (!decoded.ok) return invalid();
    const candidate = decoded.value.value as never;
    let key: keyof typeof result | undefined;
    if (
      decoded.value.factType === 'evaluation-metric-report' &&
      isAgentEvaluationMetricReport(candidate)
    ) {
      key = 'metricReport';
    } else if (
      decoded.value.factType === 'evaluation-grader-report' &&
      isAgentEvaluationGraderReport(candidate)
    ) {
      key = 'graderReport';
    } else if (
      decoded.value.factType === 'evaluation-human-review-report' &&
      isAgentHumanReviewReport(candidate)
    ) {
      key = 'humanReviewReport';
    } else if (
      decoded.value.factType === 'evaluation-holdout-receipt' &&
      isAgentHoldoutExecutionReceipt(candidate)
    ) {
      key = 'holdoutExecutionReceipt';
    } else if (
      decoded.value.factType === 'evaluation-manifest' &&
      isAgentModelEvaluationManifest(candidate)
    ) {
      key = 'manifest';
    } else {
      invalid();
    }
    const artifactKey = key ?? invalid();
    if (result[artifactKey] !== undefined) invalid();
    Object.assign(result, { [artifactKey]: value });
  }
  return Object.freeze(result);
};

export const decodeAgentEvaluationLedgerSnapshot = (
  raw: unknown,
  expectedPartition: AgentEvaluationPartition
): AgentEvaluationDurableSnapshot => {
  const envelope = record(raw);
  if (envelope.exportType !== 'agent-evaluation-repository-snapshot') {
    return invalid();
  }
  const value = record(envelope.value);
  if (!partitionMatches(value.partition, expectedPartition)) invalid();
  const plan = decodeFactValue(value.planFact, 'evaluation-plan');
  if (
    validateAgentModelEvaluationPlan(plan).length > 0 ||
    plan.planDigest !== expectedPartition.planDigest ||
    plan.repositoryCommit !== expectedPartition.repositoryCommit
  ) {
    invalid();
  }
  const attempts = array(value.attemptFacts).map((attempt) => {
    const value = decodeFactValue(attempt, 'evaluation-attempt');
    return isAgentModelEvaluationAttempt(value) ? value : invalid();
  }) as AgentEvaluationDurableSnapshot['attempts'];
  const checkpoints = array(value.checkpointFacts).map((checkpoint) => {
    const value = decodeFactValue(checkpoint, 'evaluation-checkpoint');
    return isAgentEvaluationShardCheckpoint(value) ? value : invalid();
  }) as AgentEvaluationDurableSnapshot['checkpoints'];
  const endpointSmokeReceipts = array(value.endpointSmokeReceipts).map(
    (receipt) =>
      isAgentEvaluationEndpointSmokeReceipt(receipt) ? receipt : invalid()
  );
  const endpointSmokeDispatchIntents = array(
    value.endpointSmokeDispatchIntents
  ).map((intent) =>
    isAgentEvaluationEndpointSmokeDispatchIntent(intent) ? intent : invalid()
  );
  const endpointSmokeTransportReceipts = array(
    value.endpointSmokeTransportReceipts
  ).map((receipt) =>
    isAgentEvaluationTransportReceipt(receipt) ? receipt : invalid()
  );
  const endpointSmokeResultSpoolReceipts = array(
    value.endpointSmokeResultSpoolReceipts
  ).map((receipt) =>
    isAgentEvaluationEndpointSmokeResultSpoolReceipt(receipt)
      ? receipt
      : invalid()
  );
  const endpointSmokeResultSpoolDispositionReceipts = array(
    value.endpointSmokeResultSpoolDispositionReceipts
  ).map((receipt) =>
    isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt(receipt)
      ? receipt
      : invalid()
  );
  const endpointSmokeValidationFailureReceipts = array(
    value.endpointSmokeValidationFailureReceipts
  ).map((receipt) =>
    isAgentEvaluationEndpointSmokeValidationFailureReceipt(receipt)
      ? receipt
      : invalid()
  );
  const preDispatchFailureReceipts = array(
    value.preDispatchFailureReceipts
  ).map((receipt) =>
    isAgentEvaluationPreDispatchFailureReceipt(receipt) ? receipt : invalid()
  );
  const transportDispatchIntents = array(value.transportDispatchIntents).map(
    (intent) =>
      isAgentEvaluationTransportDispatchIntent(intent) ? intent : invalid()
  );
  const transportReceipts = array(value.transportReceipts).map((receipt) =>
    isAgentEvaluationTransportReceipt(receipt) ? receipt : invalid()
  );
  const providerResultSpoolReceipts = array(
    value.providerResultSpoolReceipts
  ).map((receipt) =>
    isAgentEvaluationProviderResultSpoolReceipt(receipt) ? receipt : invalid()
  );
  const providerResultSpoolDispositionReceipts = array(
    value.providerResultSpoolDispositionReceipts
  ).map((receipt) =>
    isAgentEvaluationProviderResultSpoolDispositionReceipt(receipt)
      ? receipt
      : invalid()
  );
  const providerCapabilityObservationReceipts = array(
    value.providerCapabilityObservationReceipts
  ).map((receipt) =>
    isAgentEvaluationProviderCapabilityObservationReceipt(receipt)
      ? receipt
      : invalid()
  );
  const invocationTurnReceipts = array(value.invocationTurnReceipts).map(
    (receipt) =>
      isAgentEvaluationInvocationTurnReceipt(receipt) ? receipt : invalid()
  );
  const invocationTurnSetReceipts = array(value.invocationTurnSetReceipts).map(
    (receipt) =>
      isAgentEvaluationInvocationTurnSetReceipt(receipt) ? receipt : invalid()
  );
  const resultSubmissionReceipts = array(value.resultSubmissionReceipts).map(
    (receipt) =>
      isAgentEvaluationResultSubmissionReceipt(receipt) ? receipt : invalid()
  );
  const controlledRuntimeReceipts = array(value.controlledRuntimeReceipts).map(
    (receipt) =>
      isAgentEvaluationControlledRuntimeReceipt(receipt) ? receipt : invalid()
  );
  const capabilityExecutionReceipts = array(
    value.capabilityExecutionReceipts
  ).map((receipt) =>
    isAgentEvaluationCapabilityExecutionReceipt(receipt) ? receipt : invalid()
  );
  const capabilitySpecificReceipts = array(
    value.capabilitySpecificReceipts
  ).map((receipt) =>
    isAgentEvaluationCapabilitySpecificReceipt(receipt) ? receipt : invalid()
  );
  const attemptAuthorityOwnerReceipts = array(
    value.attemptAuthorityOwnerReceipts
  ).map((receipt) =>
    isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt) ? receipt : invalid()
  );
  const verificationAttemptGrantReceipts = array(
    value.verificationAttemptGrantReceipts
  ).map((receipt) =>
    isAgentEvaluationVerificationAttemptGrantReceipt(receipt)
      ? receipt
      : invalid()
  );
  const sourceReceipts = array(value.sourceReceipts).map((receipt) =>
    isAgentEvaluationSourceReceipt(receipt) ? receipt : invalid()
  );
  const executionReceipts = array(value.executionReceipts).map(
    decodeExecutionReceipt
  );
  const reviewRasterScanReceipts = array(value.reviewRasterScanReceipts).map(
    (receipt) =>
      isAgentEvaluationReviewRasterScanReceipt(receipt as never)
        ? receipt
        : invalid()
  ) as AgentEvaluationDurableSnapshot['reviewRasterScanReceipts'];
  const reviewCandidateRefs = array(value.reviewCandidateRefs).map(
    (reference) =>
      isAgentEvaluationReviewCandidateRef(reference as never)
        ? reference
        : invalid()
  ) as AgentEvaluationDurableSnapshot['reviewCandidateRefs'];
  const blindReviewMappingRefs = array(value.blindReviewMappingRefs).map(
    (reference) =>
      isAgentEvaluationBlindReviewMappingRef(reference as never)
        ? reference
        : invalid()
  ) as AgentEvaluationDurableSnapshot['blindReviewMappingRefs'];
  if (
    text(value.blindReviewMappingSetDigest) !==
    digestAgentEvaluationBlindReviewMappingRefSet(blindReviewMappingRefs)
  ) {
    invalid();
  }
  const artifacts = artifactsFrom(array(value.artifactFacts));
  const validatedHumanReviewArtifacts =
    value.validatedHumanReviewArtifact === null
      ? Object.freeze([])
      : Object.freeze([
          isAgentEvaluationValidatedHumanReviewArtifact(
            value.validatedHumanReviewArtifact,
            artifacts.humanReviewReport
          )
            ? value.validatedHumanReviewArtifact
            : invalid(),
        ]);
  const validatedHumanMetricObservations = Object.freeze(
    array(value.validatedHumanMetricObservations).map((observation) =>
      isAgentEvaluationValidatedHumanMetricObservation(observation)
        ? observation
        : invalid()
    )
  );
  if (
    text(value.validatedHumanMetricObservationSetDigest) !==
    digestAgentEvaluationValidatedHumanMetricObservationSet(
      validatedHumanMetricObservations
    )
  ) {
    invalid();
  }
  return Object.freeze({
    partition: Object.freeze({ ...expectedPartition }),
    plan,
    attempts: Object.freeze(attempts),
    checkpoints: Object.freeze(checkpoints),
    budgetLedger: decodeBudget(value.budgetLedger, plan),
    endpointSmokeDispatchIntents: Object.freeze(endpointSmokeDispatchIntents),
    endpointSmokeTransportReceipts: Object.freeze(
      endpointSmokeTransportReceipts
    ),
    endpointSmokeResultSpoolReceipts: Object.freeze(
      endpointSmokeResultSpoolReceipts
    ),
    endpointSmokeResultSpoolDispositionReceipts: Object.freeze(
      endpointSmokeResultSpoolDispositionReceipts
    ),
    endpointSmokeValidationFailureReceipts: Object.freeze(
      endpointSmokeValidationFailureReceipts
    ),
    endpointSmokeReceipts: Object.freeze(endpointSmokeReceipts),
    preDispatchFailureReceipts: Object.freeze(preDispatchFailureReceipts),
    transportDispatchIntents: Object.freeze(transportDispatchIntents),
    transportReceipts: Object.freeze(transportReceipts),
    providerResultSpoolReceipts: Object.freeze(providerResultSpoolReceipts),
    providerResultSpoolDispositionReceipts: Object.freeze(
      providerResultSpoolDispositionReceipts
    ),
    providerCapabilityObservationReceipts: Object.freeze(
      providerCapabilityObservationReceipts
    ),
    invocationTurnReceipts: Object.freeze(invocationTurnReceipts),
    invocationTurnSetReceipts: Object.freeze(invocationTurnSetReceipts),
    resultSubmissionReceipts: Object.freeze(resultSubmissionReceipts),
    controlledRuntimeReceipts: Object.freeze(controlledRuntimeReceipts),
    capabilityExecutionReceipts: Object.freeze(capabilityExecutionReceipts),
    capabilitySpecificReceipts: Object.freeze(capabilitySpecificReceipts),
    attemptAuthorityOwnerReceipts: Object.freeze(attemptAuthorityOwnerReceipts),
    verificationAttemptGrantReceipts: Object.freeze(
      verificationAttemptGrantReceipts
    ),
    sourceReceipts: Object.freeze(sourceReceipts),
    executionReceipts: Object.freeze(executionReceipts),
    reviewRasterScanReceipts: Object.freeze(reviewRasterScanReceipts),
    reviewCandidateRefs: Object.freeze(reviewCandidateRefs),
    blindReviewMappingRefs: Object.freeze(blindReviewMappingRefs),
    validatedHumanReviewArtifacts,
    validatedHumanMetricObservations,
    ...artifacts,
  });
};

const responseRevision = (value: unknown, reservationId: string): number => {
  const source = record(value);
  if (source.reservationId !== reservationId) invalid();
  return integer(source.ledgerRevision);
};

export class HttpAgentEvaluationCoordinatorLedger implements AgentEvaluationCoordinatorLedger {
  readonly #client: AgentEvaluationLedgerClient;
  readonly #partition: AgentEvaluationPartition;

  constructor(
    client: AgentEvaluationLedgerClient,
    partition: AgentEvaluationPartition
  ) {
    if (
      client.scope.planDigest !== partition.planDigest ||
      client.scope.repositoryCommit !== partition.repositoryCommit
    ) {
      invalid();
    }
    this.#client = client;
    this.#partition = Object.freeze({ ...partition });
  }

  async putPlan(plan: AgentModelEvaluationPlan): Promise<void> {
    if (
      plan.planDigest !== this.#partition.planDigest ||
      plan.repositoryCommit !== this.#partition.repositoryCommit
    ) {
      invalid();
    }
    await this.#client.putPlan(
      encodeAgentEvaluationFact({ factType: 'evaluation-plan', value: plan })
    );
  }

  async snapshot(): Promise<AgentEvaluationDurableSnapshot> {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.productionReadModelUnavailable
    );
  }

  async reserveBudget(
    input: Readonly<{
      reservationId: string;
      demand: AgentBudgetDemand;
      reservedAt: string;
    }>
  ): Promise<AgentEvaluationLedgerBudgetReservation> {
    const state = await this.#budgetState();
    const expected = reserveAgentBudget(state, {
      ...input,
      expectedRevision: state.revision,
    });
    if (!expected.ok) invalid();
    const response = await this.#client.reserveBudget(
      input.reservationId,
      state.revision,
      input.reservedAt,
      input.demand
    );
    const revision = responseRevision(response, input.reservationId);
    if (revision !== expected.state.revision) invalid();
    return Object.freeze({ reservationId: input.reservationId, revision });
  }

  async settleBudget(
    input: Readonly<{
      reservationId: string;
      actual: AgentBudgetDemand;
      settledAt: string;
    }>
  ): Promise<void> {
    const state = await this.#budgetState();
    const expected = settleAgentBudget(state, {
      ...input,
      expectedRevision: state.revision,
    });
    if (!expected.ok || !expected.reservation.settlement) {
      return invalid();
    }
    const response = await this.#client.settleBudget(
      input.reservationId,
      state.revision,
      expected.reservation.settlement
    );
    if (
      responseRevision(response, input.reservationId) !==
      expected.state.revision
    ) {
      invalid();
    }
  }

  async reconcileBudget(
    input: Readonly<{
      reservationId: string;
      reason: 'ack-loss' | 'provider-disconnect' | 'timeout' | 'worker-loss';
      settledAt: string;
    }>
  ): Promise<void> {
    const state = await this.#budgetState();
    const expected = reconcileAgentBudgetReservation(state, {
      ...input,
      expectedRevision: state.revision,
    });
    if (!expected.ok) invalid();
    const response = await this.#client.reconcileBudget(
      input.reservationId,
      state.revision,
      input.reason,
      input.settledAt
    );
    if (
      responseRevision(response, input.reservationId) !==
      expected.state.revision
    ) {
      invalid();
    }
  }

  async putEndpointSmokeReceipt(
    receipt: Parameters<
      AgentEvaluationCoordinatorLedger['putEndpointSmokeReceipt']
    >[0]
  ): Promise<void> {
    await this.#client.putEndpointSmokeReceipt(receipt.smokeTargetId, receipt);
  }

  async putSourceReceipt(
    receipt: Parameters<AgentEvaluationCoordinatorLedger['putSourceReceipt']>[0]
  ): Promise<void> {
    await this.#client.putSourceReceipt(receipt.sourceReceiptId, receipt);
  }

  async putHumanReviewReport(report: AgentHumanReviewReport): Promise<void> {
    await this.#client.putArtifact(
      'evaluation-human-review-report',
      report.reportId,
      encodeAgentEvaluationFact({
        factType: 'evaluation-human-review-report',
        value: report,
      })
    );
  }

  async putValidatedHumanReview(
    input: Parameters<
      AgentEvaluationCoordinatorLedger['putValidatedHumanReview']
    >[0]
  ): Promise<void> {
    const humanReviewReportFact = encodeAgentEvaluationFact({
      factType: 'evaluation-human-review-report',
      value: input.humanReviewReport,
    });
    const response = record(
      await this.#client.putValidatedHumanReviewArtifact(
        input.artifact,
        humanReviewReportFact,
        input.validatedHumanMetricObservations,
        digestAgentEvaluationValidatedHumanMetricObservationSet(
          input.validatedHumanMetricObservations
        )
      )
    );
    if (
      Object.keys(response).length !== 5 ||
      typeof response.replayed !== 'boolean' ||
      !isAgentEvaluationValidatedHumanReviewArtifact(
        response.validatedHumanReviewArtifact,
        input.humanReviewReport
      ) ||
      !sameCanonicalJson(
        response.validatedHumanReviewArtifact,
        input.artifact
      ) ||
      !sameCanonicalJson(
        response.humanReviewReportFact,
        humanReviewReportFact
      ) ||
      !Array.isArray(response.validatedHumanMetricObservations) ||
      !response.validatedHumanMetricObservations.every(
        isAgentEvaluationValidatedHumanMetricObservation
      ) ||
      !sameCanonicalJson(
        response.validatedHumanMetricObservations,
        input.validatedHumanMetricObservations
      ) ||
      response.validatedHumanMetricObservationSetDigest !==
        digestAgentEvaluationValidatedHumanMetricObservationSet(
          input.validatedHumanMetricObservations
        )
    ) {
      invalid();
    }
  }

  async putHoldoutExecutionReceipt(
    receipt: AgentHoldoutExecutionReceipt
  ): Promise<void> {
    await this.#client.putArtifact(
      'evaluation-holdout-receipt',
      receipt.receiptId,
      encodeAgentEvaluationFact({
        factType: 'evaluation-holdout-receipt',
        value: receipt,
      })
    );
  }

  async putFinalization(
    input: Readonly<{
      metricReport: AgentEvaluationMetricReport;
      graderReport: AgentEvaluationGraderReport;
      humanReviewReport: AgentHumanReviewReport;
      holdoutExecutionReceipt: AgentHoldoutExecutionReceipt;
      manifest: AgentModelEvaluationManifest;
    }>
  ): Promise<void> {
    await this.#client.putArtifact(
      'evaluation-metric-report',
      input.metricReport.reportId,
      encodeAgentEvaluationFact({
        factType: 'evaluation-metric-report',
        value: input.metricReport,
      })
    );
    await this.#client.putArtifact(
      'evaluation-grader-report',
      input.graderReport.reportId,
      encodeAgentEvaluationFact({
        factType: 'evaluation-grader-report',
        value: input.graderReport,
      })
    );
    await this.putHumanReviewReport(input.humanReviewReport);
    await this.putHoldoutExecutionReceipt(input.holdoutExecutionReceipt);
    await this.#client.putArtifact(
      'evaluation-manifest',
      input.manifest.manifestId,
      encodeAgentEvaluationFact({
        factType: 'evaluation-manifest',
        value: input.manifest,
      })
    );
  }

  async #budgetState(): Promise<AgentBudgetLedgerState> {
    const plan = decodeFactValue(
      factFromGetResponse(await this.#client.getPlan()),
      'evaluation-plan'
    );
    if (
      validateAgentModelEvaluationPlan(plan).length > 0 ||
      plan.planDigest !== this.#partition.planDigest ||
      plan.repositoryCommit !== this.#partition.repositoryCommit
    ) {
      invalid();
    }
    return decodeBudget(await this.#client.getBudget(), plan);
  }
}

export const createEnvironmentAgentEvaluationCoordinatorLedger = (
  partition: AgentEvaluationPartition,
  input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = {}
): HttpAgentEvaluationCoordinatorLedger =>
  new HttpAgentEvaluationCoordinatorLedger(
    createEnvironmentAgentEvaluationLedgerClient({
      ...input,
      planDigest: partition.planDigest,
    }),
    partition
  );

/** Loads one bounded review candidate from the exact PostgreSQL partition. */
export class HttpAgentEvaluationReviewArtifactSource implements AgentEvaluationBlindReviewArtifactSource {
  readonly #input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  >;

  constructor(
    input: Omit<
      CreateEnvironmentAgentEvaluationLedgerClientInput,
      'planDigest'
    > = {}
  ) {
    this.#input = input;
  }

  async load(
    input: Parameters<AgentEvaluationBlindReviewArtifactSource['load']>[0]
  ): Promise<AgentEvaluationReviewCandidate> {
    const client = createEnvironmentAgentEvaluationLedgerClient({
      ...this.#input,
      planDigest: input.plan.planDigest,
    });
    if (
      client.scope.planDigest !== input.plan.planDigest ||
      client.scope.repositoryCommit !== input.plan.repositoryCommit
    ) {
      invalid();
    }
    const decoded = decodeAgentEvaluationFact(
      factFromGetResponse(
        await client.getReviewCandidate(input.attempt.descriptor.attemptId)
      )
    );
    if (!decoded.ok) return invalid();
    if (decoded.value.factType !== 'evaluation-review-candidate') {
      return invalid();
    }
    if (!isAgentEvaluationReviewCandidate(decoded.value.value)) {
      return invalid();
    }
    const candidate = decoded.value.value;
    if (
      candidate.planDigest !== input.plan.planDigest ||
      candidate.repositoryCommit !== input.plan.repositoryCommit ||
      candidate.attemptId !== input.attempt.descriptor.attemptId ||
      candidate.descriptorDigest !==
        input.attempt.descriptor.descriptorDigest ||
      candidate.responseDigest !==
        input.invocationReceipt.responseArtifactDigest
    ) {
      invalid();
    }
    return candidate;
  }
}

export const createEnvironmentAgentEvaluationReviewArtifactSource = (
  input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = {}
): HttpAgentEvaluationReviewArtifactSource =>
  new HttpAgentEvaluationReviewArtifactSource(input);
