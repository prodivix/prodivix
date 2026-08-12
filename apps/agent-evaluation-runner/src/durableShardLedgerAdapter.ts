import {
  canonicalAgentEvaluationAuthenticityOrder,
  createAgentBudgetLedger,
  decodeAgentEvaluationFact,
  digestAgentCanonicalValue,
  encodeAgentEvaluationFact,
  isAgentCanonicalDigest,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  isAgentEvaluationCapabilityExecutionReceipt,
  isAgentEvaluationCapabilitySpecificReceipt,
  isAgentEvaluationExecutionReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationPreDispatchFailureReceipt,
  isAgentEvaluationProviderResultSpoolAad,
  isAgentEvaluationProviderResultSpoolDispositionReceipt,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationShardCheckpoint,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  isAgentModelEvaluationAttempt,
  planAgentModelEvaluationAttempts,
  reconcileAgentBudgetReservation,
  reserveAgentBudget,
  settleAgentBudget,
  validateAgentModelEvaluationPlan,
  type AgentBudgetDemand,
  type AgentBudgetLedgerResult,
  type AgentBudgetLedgerState,
  type AgentBudgetSettlement,
  type AgentEvaluationRepositoryWriteResult,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationShardCheckpoint,
  type AgentEvaluationShardLease,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { AgentEvaluationRunnerError } from './errors';
import {
  AgentEvaluationLedgerClient,
  createEnvironmentAgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import {
  isAgentEvaluationDurableAttemptEvidence,
  isAgentEvaluationDurableResultSpoolAccessReceipt,
  isAgentEvaluationDurableTurnRecord,
  type AgentEvaluationDurableEncryptedResultSpool,
  type AgentEvaluationDurableResultSpoolRead,
  type AgentEvaluationDurableShardLedger,
  type AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import {
  isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  nativeOptionalCapabilityBootstrapIngressMatchesTransport,
} from './nativeOptionalCapabilityBootstrapIngress';

type DurableShardLedgerClient = Pick<
  AgentEvaluationLedgerClient,
  | 'scope'
  | 'listAttempts'
  | 'getLatestCheckpoint'
  | 'getBudget'
  | 'claimLease'
  | 'renewLease'
  | 'reserveBudget'
  | 'reconcileBudget'
  | 'listPreDispatchFailureReceipts'
  | 'putPreDispatchFailureReceipt'
  | 'listAttemptTurns'
  | 'putTurnDispatchIntent'
  | 'closeTurnTransport'
  | 'getTurnResultSpool'
  | 'putCheckpoint'
  | 'putAttemptCommit'
>;

const invalid = (): never => {
  throw new TypeError('Evaluation durable shard ledger response is invalid.');
};

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!isPlainObject(value) || Object.keys(value).some(isUnsafeObjectKey)) {
    return invalid();
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    keys.length < required.length ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    return invalid();
  }
  return value;
};

const text = (value: unknown): string =>
  typeof value === 'string' ? value : invalid();

const integer = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();

const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : invalid();

const array = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : invalid();

const instant = (value: unknown): string => {
  const candidate = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(candidate) ||
    !Number.isFinite(Date.parse(candidate)) ||
    new Date(candidate).toISOString() !== candidate
  ) {
    return invalid();
  }
  return candidate;
};

type DurableEvaluationFactMap = Readonly<{
  'evaluation-attempt': AgentModelEvaluationAttempt;
  'evaluation-checkpoint': AgentEvaluationShardCheckpoint;
}>;

const decodeFact = <T extends keyof DurableEvaluationFactMap>(
  value: unknown,
  factType: T
): DurableEvaluationFactMap[T] => {
  const decoded = decodeAgentEvaluationFact(value);
  if (!decoded.ok || decoded.value.factType !== factType) return invalid();
  return decoded.value.value as DurableEvaluationFactMap[T];
};

const decodeFactResponse = <T extends keyof DurableEvaluationFactMap>(
  value: unknown,
  factType: T,
  replayRequired: boolean
): Readonly<{
  value: DurableEvaluationFactMap[T];
  replayed: boolean;
}> => {
  const response = exact(
    value,
    replayRequired ? ['fact', 'replayed'] : ['fact'],
    replayRequired ? [] : ['replayed']
  );
  if (!replayRequired && response.replayed !== undefined) invalid();
  return Object.freeze({
    value: decodeFact(response.fact, factType),
    replayed: replayRequired ? boolean(response.replayed) : false,
  });
};

type BudgetReservationExport = Readonly<{
  reservationId: string;
  ledgerRevision: number;
  demandDigest: string;
  demand: AgentBudgetDemand;
  reservedAt: string;
}>;

type BudgetSettlementExport = Readonly<{
  reservationId: string;
  ledgerRevision: number;
  settlementDigest: string;
  settlement: AgentBudgetSettlement;
  settledAt: string;
}>;

const budgetReservation = (value: unknown): BudgetReservationExport => {
  const entry = exact(value, [
    'reservationId',
    'ledgerRevision',
    'demandDigest',
    'demand',
    'reservedAt',
  ]);
  return Object.freeze({
    reservationId: text(entry.reservationId),
    ledgerRevision: integer(entry.ledgerRevision),
    demandDigest: text(entry.demandDigest),
    demand: entry.demand as AgentBudgetDemand,
    reservedAt: instant(entry.reservedAt),
  });
};

const budgetSettlement = (value: unknown): BudgetSettlementExport => {
  const entry = exact(value, [
    'reservationId',
    'ledgerRevision',
    'settlementDigest',
    'settlement',
    'settledAt',
  ]);
  return Object.freeze({
    reservationId: text(entry.reservationId),
    ledgerRevision: integer(entry.ledgerRevision),
    settlementDigest: text(entry.settlementDigest),
    settlement: entry.settlement as AgentBudgetSettlement,
    settledAt: instant(entry.settledAt),
  });
};

/** Replays the append-only HTTP projection into the canonical domain ledger. */
export const decodeAgentEvaluationDurableBudget = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): AgentBudgetLedgerState => {
  const response = exact(value, [
    'planDigest',
    'revision',
    'updatedAt',
    'reservations',
    'settlements',
    'unsettledReservationIds',
  ]);
  if (response.planDigest !== plan.planDigest) invalid();
  instant(response.updatedAt);
  const revision = integer(response.revision);
  const reservations = array(response.reservations).map(budgetReservation);
  const settlements = array(response.settlements).map(budgetSettlement);
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
      if (
        !result.ok ||
        result.reservation.demandDigest !== event.entry.demandDigest
      ) {
        invalid();
      }
      state = result.state;
      continue;
    }
    const persisted = event.entry.settlement;
    const result =
      persisted.requiresReconciliation &&
      persisted.reconciliationReason !== 'usage-unknown'
        ? reconcileAgentBudgetReservation(state, {
            reservationId: event.entry.reservationId,
            expectedRevision: state.revision,
            reason: persisted.reconciliationReason ?? invalid(),
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
      event.entry.settlementDigest !== persisted.settlementDigest ||
      event.entry.settledAt !== persisted.settledAt ||
      !sameCanonicalJson(result.reservation.settlement, persisted)
    ) {
      invalid();
    }
    state = result.state;
  }
  const unsettledReservationIds = array(response.unsettledReservationIds).map(
    text
  );
  const expectedUnsettled = state.reservations
    .filter(({ status }) => status === 'reserved')
    .map(({ reservationId }) => reservationId)
    .sort(compareUnicodeCodePoints);
  if (
    state.revision !== revision ||
    new Set(unsettledReservationIds).size !== unsettledReservationIds.length ||
    !sameCanonicalJson(unsettledReservationIds, expectedUnsettled)
  ) {
    invalid();
  }
  return state;
};

const leaseResponse = (
  value: unknown,
  replayRequired: boolean
): Readonly<{ lease: AgentEvaluationShardLease; replayed: boolean }> => {
  const response = exact(value, [
    'planDigest',
    'shardId',
    'ownerId',
    'generation',
    'leaseDigest',
    'acquiredAt',
    'expiresAt',
    ...(replayRequired ? ['replayed'] : []),
  ]);
  const base = Object.freeze({
    planDigest: text(response.planDigest),
    shardId: text(response.shardId),
    ownerId: text(response.ownerId),
    generation: integer(response.generation),
    acquiredAt: instant(response.acquiredAt),
    expiresAt: instant(response.expiresAt),
  });
  const lease = Object.freeze({
    ...base,
    leaseDigest: text(response.leaseDigest),
  });
  if (
    lease.generation < 1 ||
    Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt) ||
    lease.leaseDigest !== digestAgentCanonicalValue(base)
  ) {
    invalid();
  }
  return Object.freeze({
    lease,
    replayed: replayRequired ? boolean(response.replayed) : false,
  });
};

const successful = <T>(
  value: T,
  replayed: boolean
): AgentEvaluationRepositoryWriteResult<T> =>
  Object.freeze({ ok: true, value, replayed });

const notFound = (caught: unknown): boolean =>
  caught instanceof AgentEvaluationRunnerError && caught.httpStatus === 404;

export class HttpAgentEvaluationDurableShardLedger implements AgentEvaluationDurableShardLedger {
  readonly namespaceId: string;
  readonly namespaceDigest: string;
  readonly #client: DurableShardLedgerClient;
  readonly #plan: AgentModelEvaluationPlan;
  readonly #descriptorByAttemptId: ReadonlyMap<
    string,
    ReturnType<typeof planAgentModelEvaluationAttempts>[number]
  >;

  constructor(
    client: DurableShardLedgerClient,
    plan: AgentModelEvaluationPlan
  ) {
    if (
      validateAgentModelEvaluationPlan(plan).length > 0 ||
      client.scope.planDigest !== plan.planDigest ||
      client.scope.repositoryCommit !== plan.repositoryCommit
    ) {
      invalid();
    }
    this.#client = client;
    this.#plan = plan;
    this.namespaceId = client.scope.namespace;
    this.namespaceDigest = digestAgentCanonicalValue({
      format: 'prodivix.g4-model-evaluation-response-spool-namespace',
      version: 1,
      namespaceId: this.namespaceId,
    });
    this.#descriptorByAttemptId = new Map(
      planAgentModelEvaluationAttempts(plan).map((descriptor) => [
        descriptor.attemptId,
        descriptor,
      ])
    );
  }

  async listAttemptTurns(
    attemptId: string
  ): Promise<readonly AgentEvaluationDurableTurnRecord[]> {
    const descriptor = this.#descriptorByAttemptId.get(attemptId);
    const plannedDescriptor = descriptor ?? invalid();
    const response = exact(await this.#client.listAttemptTurns(attemptId), [
      'turns',
    ]);
    const turns = array(response.turns).map((value, turnIndex) =>
      this.#decodeTurn(value, plannedDescriptor, turnIndex)
    );
    if (
      turns.some(
        (turn, turnIndex) =>
          turn.turnIndex !== turnIndex ||
          (turnIndex < turns.length - 1 && turn.state !== 'closed')
      )
    ) {
      invalid();
    }
    return Object.freeze(turns);
  }

  async listPreDispatchFailureReceipts(): Promise<
    readonly AgentEvaluationPreDispatchFailureReceipt[]
  > {
    const response = exact(
      await this.#client.listPreDispatchFailureReceipts(),
      ['facts']
    );
    const receipts = array(response.facts);
    if (
      receipts.some((receipt) => {
        if (!isAgentEvaluationPreDispatchFailureReceipt(receipt)) return true;
        const descriptor = this.#descriptorByAttemptId.get(receipt.attemptId);
        return (
          !descriptor ||
          receipt.descriptorDigest !== descriptor.descriptorDigest ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit
        );
      }) ||
      new Set(
        receipts.map((receipt) => {
          const value = receipt as AgentEvaluationPreDispatchFailureReceipt;
          return `${value.attemptId}\u0000${value.turnIndex}`;
        })
      ).size !== receipts.length ||
      !sameCanonicalJson(
        receipts,
        canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
          receipts as AgentEvaluationPreDispatchFailureReceipt[]
        )
      )
    ) {
      invalid();
    }
    return Object.freeze(
      receipts as AgentEvaluationPreDispatchFailureReceipt[]
    );
  }

  async putPreDispatchFailureReceipt(
    receipt: AgentEvaluationPreDispatchFailureReceipt
  ): ReturnType<
    AgentEvaluationDurableShardLedger['putPreDispatchFailureReceipt']
  > {
    const descriptor = this.#descriptorByAttemptId.get(receipt.attemptId);
    if (
      !isAgentEvaluationPreDispatchFailureReceipt(receipt) ||
      !descriptor ||
      receipt.descriptorDigest !== descriptor.descriptorDigest ||
      receipt.planDigest !== this.#plan.planDigest ||
      receipt.repositoryCommit !== this.#plan.repositoryCommit
    ) {
      invalid();
    }
    const response = exact(
      await this.#client.putPreDispatchFailureReceipt(
        receipt.attemptId,
        receipt.turnIndex,
        receipt
      ),
      ['fact', 'replayed']
    );
    if (
      !isAgentEvaluationPreDispatchFailureReceipt(response.fact) ||
      !sameCanonicalJson(response.fact, receipt)
    ) {
      invalid();
    }
    return successful(receipt, boolean(response.replayed));
  }

  async putTurnDispatchIntent(
    input: Parameters<
      AgentEvaluationDurableShardLedger['putTurnDispatchIntent']
    >[0]
  ): ReturnType<AgentEvaluationDurableShardLedger['putTurnDispatchIntent']> {
    const descriptor = this.#descriptorByAttemptId.get(
      input.descriptor.attemptId
    );
    const target = this.#plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === input.descriptor.targetId
    );
    if (
      !descriptor ||
      !target ||
      !sameCanonicalJson(descriptor, input.descriptor) ||
      !isAgentEvaluationTransportDispatchIntent(input.dispatchIntent) ||
      input.dispatchIntent.planDigest !== this.#plan.planDigest ||
      input.dispatchIntent.repositoryCommit !== this.#plan.repositoryCommit ||
      input.dispatchIntent.attemptId !== descriptor.attemptId ||
      input.dispatchIntent.descriptorDigest !== descriptor.descriptorDigest ||
      input.dispatchIntent.turnIndex !== input.turnIndex ||
      input.dispatchIntent.budgetReservationId !== input.budgetReservationId ||
      input.dispatchIntent.providerConfigurationId !==
        target.providerConfigurationId ||
      input.dispatchIntent.protocolFamily !== target.protocolFamily ||
      input.dispatchIntent.modelLineageDigest !== target.modelLineageDigest ||
      input.dispatchIntent.inferenceConfigurationDigest !==
        target.inferenceConfigurationDigest
    ) {
      invalid();
    }
    const plannedDescriptor = descriptor ?? invalid();
    const response = exact(
      await this.#client.putTurnDispatchIntent(
        input.descriptor.attemptId,
        input.turnIndex,
        Object.freeze({
          descriptor: input.descriptor,
          budgetReservationId: input.budgetReservationId,
          dispatchIntent: input.dispatchIntent,
        })
      ),
      ['turn', 'replayed']
    );
    const turn = this.#decodeTurn(
      response.turn,
      plannedDescriptor,
      input.turnIndex
    );
    if (
      turn.state !== 'dispatched' ||
      turn.budgetReservationId !== input.budgetReservationId ||
      !sameCanonicalJson(turn.dispatchIntent, input.dispatchIntent)
    ) {
      invalid();
    }
    return successful(turn, boolean(response.replayed));
  }

  async closeTurnTransport(
    input: Parameters<
      AgentEvaluationDurableShardLedger['closeTurnTransport']
    >[0]
  ): ReturnType<AgentEvaluationDurableShardLedger['closeTurnTransport']> {
    const descriptor = this.#descriptorByAttemptId.get(
      input.descriptor.attemptId
    );
    const completed = input.transportReceipt.outcome === 'completed';
    if (
      !descriptor ||
      !sameCanonicalJson(descriptor, input.descriptor) ||
      !isAgentEvaluationTransportReceipt(input.transportReceipt) ||
      input.transportReceipt.dispatchIntentDigest !==
        input.expectedIntentDigest ||
      completed !== (input.encryptedResultSpool !== undefined) ||
      (input.encryptedResultSpool !== undefined &&
        !this.#validEncryptedSpool(input.encryptedResultSpool)) ||
      (input.nativeOptionalCapabilityBootstrapIngress !== undefined &&
        (!input.encryptedResultSpool ||
          !isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(
            input.nativeOptionalCapabilityBootstrapIngress
          ) ||
          !nativeOptionalCapabilityBootstrapIngressMatchesTransport(
            input.nativeOptionalCapabilityBootstrapIngress,
            {
              turnIndex: input.turnIndex,
              transportReceipt: input.transportReceipt,
              responseDigest: input.encryptedResultSpool.responseDigest,
              resultSpoolAad: input.encryptedResultSpool.aad,
              encryptedResultSpool: input.encryptedResultSpool.envelope,
            }
          )))
    ) {
      invalid();
    }
    const plannedDescriptor = descriptor ?? invalid();
    const response = exact(
      await this.#client.closeTurnTransport(
        input.descriptor.attemptId,
        input.turnIndex,
        Object.freeze({
          descriptorDigest: input.descriptor.descriptorDigest,
          budgetReservationId: input.budgetReservationId,
          expectedIntentDigest: input.expectedIntentDigest,
          transportReceipt: input.transportReceipt,
          ...(input.encryptedResultSpool
            ? { encryptedResultSpool: input.encryptedResultSpool }
            : {}),
          ...(input.nativeOptionalCapabilityBootstrapIngress
            ? {
                nativeOptionalCapabilityBootstrapIngress:
                  input.nativeOptionalCapabilityBootstrapIngress,
              }
            : {}),
          closedAt: input.closedAt,
        })
      ),
      ['turn', 'replayed']
    );
    const turn = this.#decodeTurn(
      response.turn,
      plannedDescriptor,
      input.turnIndex
    );
    if (
      turn.state !== 'closed' ||
      turn.budgetReservationId !== input.budgetReservationId ||
      turn.dispatchIntent.intentDigest !== input.expectedIntentDigest ||
      !sameCanonicalJson(turn.transportReceipt, input.transportReceipt) ||
      completed !== (turn.resultSpoolReceipt !== undefined) ||
      turn.closedAt !== input.closedAt ||
      (input.encryptedResultSpool !== undefined &&
        (turn.resultSpoolReceipt?.envelopeDigest !==
          input.encryptedResultSpool.envelope.envelopeDigest ||
          turn.resultSpoolReceipt?.aadDigest !==
            input.encryptedResultSpool.envelope.aadDigest ||
          turn.resultSpoolReceipt?.responseDigest !==
            input.encryptedResultSpool.responseDigest ||
          turn.resultSpoolReceipt?.retentionPolicyDigest !==
            input.encryptedResultSpool.retentionPolicyDigest ||
          turn.resultSpoolReceipt?.expiresAt !==
            input.encryptedResultSpool.expiresAt))
    ) {
      invalid();
    }
    return successful(turn, boolean(response.replayed));
  }

  async getTurnResultSpool(
    input: Parameters<
      AgentEvaluationDurableShardLedger['getTurnResultSpool']
    >[0]
  ): Promise<AgentEvaluationDurableResultSpoolRead> {
    const descriptor = this.#descriptorByAttemptId.get(
      input.descriptor.attemptId
    );
    if (!descriptor || !sameCanonicalJson(descriptor, input.descriptor)) {
      invalid();
    }
    const plannedDescriptor = descriptor ?? invalid();
    const raw = exact(
      await this.#client.getTurnResultSpool(
        input.descriptor.attemptId,
        input.turnIndex,
        {
          shardId: input.shardId,
          ownerId: input.ownerId,
          leaseGeneration: input.leaseGeneration,
          expectedTurnDigest: input.expectedTurnDigest,
        }
      ),
      [
        'aad',
        'envelope',
        'responseDigest',
        'retentionPolicyDigest',
        'expiresAt',
        'resultSpoolReceipt',
        'accessReceipt',
      ]
    );
    const aad = isAgentEvaluationProviderResultSpoolAad(raw.aad)
      ? raw.aad
      : invalid();
    const envelope = isAgentEvaluationProviderResultSpoolEnvelope(raw.envelope)
      ? raw.envelope
      : invalid();
    const resultSpoolReceipt = isAgentEvaluationProviderResultSpoolReceipt(
      raw.resultSpoolReceipt
    )
      ? raw.resultSpoolReceipt
      : invalid();
    const accessReceipt = isAgentEvaluationDurableResultSpoolAccessReceipt(
      raw.accessReceipt
    )
      ? raw.accessReceipt
      : invalid();
    const result: AgentEvaluationDurableResultSpoolRead = Object.freeze({
      aad,
      envelope,
      responseDigest: text(raw.responseDigest),
      retentionPolicyDigest: text(raw.retentionPolicyDigest),
      expiresAt: instant(raw.expiresAt),
      resultSpoolReceipt,
      accessReceipt,
    });
    if (
      !this.#validEncryptedSpool(result) ||
      result.resultSpoolReceipt.attemptId !== plannedDescriptor.attemptId ||
      result.resultSpoolReceipt.descriptorDigest !==
        plannedDescriptor.descriptorDigest ||
      result.resultSpoolReceipt.turnIndex !== input.turnIndex ||
      result.resultSpoolReceipt.envelopeDigest !==
        result.envelope.envelopeDigest ||
      result.resultSpoolReceipt.aadDigest !== result.envelope.aadDigest ||
      result.resultSpoolReceipt.responseDigest !== result.responseDigest ||
      result.resultSpoolReceipt.retentionPolicyDigest !==
        result.retentionPolicyDigest ||
      result.resultSpoolReceipt.expiresAt !== result.expiresAt ||
      result.accessReceipt.expectedTurnDigest !== input.expectedTurnDigest ||
      result.accessReceipt.shardId !== input.shardId ||
      result.accessReceipt.ownerId !== input.ownerId ||
      result.accessReceipt.leaseGeneration !== input.leaseGeneration
    ) {
      invalid();
    }
    return result;
  }

  #validEncryptedSpool(
    value: AgentEvaluationDurableEncryptedResultSpool
  ): boolean {
    return (
      isAgentEvaluationProviderResultSpoolAad(value.aad) &&
      isAgentEvaluationProviderResultSpoolEnvelope(value.envelope) &&
      value.envelope.aadDigest === digestAgentCanonicalValue(value.aad) &&
      isAgentCanonicalDigest(value.responseDigest) &&
      isAgentCanonicalDigest(value.retentionPolicyDigest) &&
      Date.parse(value.expiresAt) > 0
    );
  }

  #decodeTurn(
    value: unknown,
    descriptor: ReturnType<typeof planAgentModelEvaluationAttempts>[number],
    turnIndex: number
  ): AgentEvaluationDurableTurnRecord {
    const turn = isAgentEvaluationDurableTurnRecord(value) ? value : invalid();
    if (
      turn.attemptId !== descriptor.attemptId ||
      turn.descriptorDigest !== descriptor.descriptorDigest ||
      turn.turnIndex !== turnIndex ||
      (turn.state === 'closed' &&
        turn.resultSpoolReceipt !== undefined &&
        (turn.resultSpoolReceipt.planDigest !== this.#plan.planDigest ||
          turn.resultSpoolReceipt.repositoryCommit !==
            this.#plan.repositoryCommit))
    ) {
      invalid();
    }
    return turn;
  }

  async listAttempts(): Promise<readonly AgentModelEvaluationAttempt[]> {
    const response = exact(await this.#client.listAttempts(), ['facts']);
    const attempts = array(response.facts).map((fact) => {
      const attempt = decodeFact(fact, 'evaluation-attempt');
      const descriptor = this.#descriptorByAttemptId.get(
        attempt.descriptor.attemptId
      );
      if (!descriptor || !sameCanonicalJson(attempt.descriptor, descriptor)) {
        invalid();
      }
      return attempt;
    });
    if (
      new Set(attempts.map(({ descriptor }) => descriptor.attemptId)).size !==
      attempts.length
    ) {
      invalid();
    }
    return Object.freeze(
      attempts.sort((left, right) =>
        compareUnicodeCodePoints(
          left.descriptor.attemptId,
          right.descriptor.attemptId
        )
      )
    );
  }

  async getLatestCheckpoint(
    shardId: string
  ): Promise<AgentEvaluationShardCheckpoint | undefined> {
    try {
      const response = decodeFactResponse(
        await this.#client.getLatestCheckpoint(shardId),
        'evaluation-checkpoint',
        false
      );
      if (
        response.value.planDigest !== this.#plan.planDigest ||
        response.value.shardId !== shardId
      ) {
        invalid();
      }
      return response.value;
    } catch (caught) {
      if (notFound(caught)) return undefined;
      throw caught;
    }
  }

  async getBudgetLedger(): Promise<AgentBudgetLedgerState> {
    return decodeAgentEvaluationDurableBudget(
      await this.#client.getBudget(),
      this.#plan
    );
  }

  async claimLease(
    input: Parameters<AgentEvaluationDurableShardLedger['claimLease']>[0]
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>> {
    this.#assertPlanDigest(input.planDigest);
    const response = leaseResponse(
      await this.#client.claimLease(input.shardId, {
        ownerId: input.ownerId,
        acquiredAt: input.acquiredAt,
        expiresAt: input.expiresAt,
      }),
      true
    );
    if (
      response.lease.planDigest !== input.planDigest ||
      response.lease.shardId !== input.shardId ||
      response.lease.ownerId !== input.ownerId ||
      response.lease.acquiredAt !== input.acquiredAt ||
      response.lease.expiresAt !== input.expiresAt
    ) {
      invalid();
    }
    return successful(response.lease, response.replayed);
  }

  async renewLease(
    input: Parameters<AgentEvaluationDurableShardLedger['renewLease']>[0]
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>> {
    this.#assertPlanDigest(input.planDigest);
    const response = leaseResponse(
      await this.#client.renewLease(input.shardId, {
        ownerId: input.ownerId,
        generation: input.generation,
        renewedAt: input.renewedAt,
        expiresAt: input.expiresAt,
      }),
      false
    );
    if (
      response.lease.planDigest !== input.planDigest ||
      response.lease.shardId !== input.shardId ||
      response.lease.ownerId !== input.ownerId ||
      response.lease.generation !== input.generation ||
      response.lease.expiresAt !== input.expiresAt
    ) {
      invalid();
    }
    return successful(response.lease, false);
  }

  async reserveBudget(
    input: Parameters<AgentEvaluationDurableShardLedger['reserveBudget']>[0]
  ): Promise<AgentBudgetLedgerResult> {
    const current = await this.#budgetAt(input.expectedRevision);
    const expected = reserveAgentBudget(current, input);
    if (!expected.ok) return expected;
    const rawResponse = exact(
      await this.#client.reserveBudget(
        input.reservationId,
        input.expectedRevision,
        input.reservedAt,
        input.demand
      ),
      [
        'reservationId',
        'ledgerRevision',
        'demandDigest',
        'demand',
        'reservedAt',
        'replayed',
      ]
    );
    void boolean(rawResponse.replayed);
    const response = budgetReservation({
      reservationId: rawResponse.reservationId,
      ledgerRevision: rawResponse.ledgerRevision,
      demandDigest: rawResponse.demandDigest,
      demand: rawResponse.demand,
      reservedAt: rawResponse.reservedAt,
    });
    if (
      response.reservationId !== input.reservationId ||
      response.ledgerRevision !== expected.state.revision ||
      response.demandDigest !== expected.reservation.demandDigest ||
      response.reservedAt !== input.reservedAt ||
      !sameCanonicalJson(response.demand, expected.reservation.demand)
    ) {
      invalid();
    }
    return expected;
  }

  async reconcileBudget(
    input: Parameters<AgentEvaluationDurableShardLedger['reconcileBudget']>[0]
  ): Promise<AgentBudgetLedgerResult> {
    const current = await this.#budgetAt(input.expectedRevision);
    const expected = reconcileAgentBudgetReservation(current, input);
    if (!expected.ok || !expected.reservation.settlement) return expected;
    const raw = exact(
      await this.#client.reconcileBudget(
        input.reservationId,
        input.expectedRevision,
        input.reason,
        input.settledAt
      ),
      [
        'reservationId',
        'ledgerRevision',
        'settlementDigest',
        'settlement',
        'settledAt',
        'replayed',
      ]
    );
    void boolean(raw.replayed);
    const response = budgetSettlement({
      reservationId: raw.reservationId,
      ledgerRevision: raw.ledgerRevision,
      settlementDigest: raw.settlementDigest,
      settlement: raw.settlement,
      settledAt: raw.settledAt,
    });
    if (
      response.reservationId !== input.reservationId ||
      response.ledgerRevision !== expected.state.revision ||
      response.settlementDigest !==
        expected.reservation.settlement.settlementDigest ||
      response.settledAt !== input.settledAt ||
      !sameCanonicalJson(response.settlement, expected.reservation.settlement)
    ) {
      invalid();
    }
    return expected;
  }

  async commitAttemptEvidence(
    input: Parameters<
      AgentEvaluationDurableShardLedger['commitAttemptEvidence']
    >[0]
  ): ReturnType<AgentEvaluationDurableShardLedger['commitAttemptEvidence']> {
    const descriptor = this.#descriptorByAttemptId.get(
      input.attempt.descriptor.attemptId
    );
    if (
      !isAgentModelEvaluationAttempt(input.attempt) ||
      !descriptor ||
      !sameCanonicalJson(descriptor, input.attempt.descriptor) ||
      !isAgentEvaluationExecutionReceipt(input.executionReceipt) ||
      !isAgentEvaluationDurableAttemptEvidence({
        plan: this.#plan,
        descriptor: input.attempt.descriptor,
        demand: input.actual,
        attempt: input.attempt,
        transportDispatchIntents: input.transportDispatchIntents,
        transportReceipts: input.transportReceipts,
        providerResultSpoolReceipts: input.providerResultSpoolReceipts,
        providerResultSpoolDispositionReceipts:
          input.providerResultSpoolDispositionReceipts,
        preDispatchFailureReceipts: input.preDispatchFailureReceipts,
        capabilityExecutionReceipts: input.capabilityExecutionReceipts,
        capabilitySpecificReceipts: input.capabilitySpecificReceipts,
        providerCapabilityObservationReceipts:
          input.providerCapabilityObservationReceipts,
        attemptAuthorityOwnerReceipts: input.attemptAuthorityOwnerReceipts,
        verificationAttemptGrantReceipts:
          input.verificationAttemptGrantReceipts,
        invocationTurnReceipts: input.invocationTurnReceipts,
        invocationTurnSetReceipt: input.invocationTurnSetReceipt,
        sourceReceipts: input.sourceReceipts,
        executionReceipt: input.executionReceipt,
        ...(input.resultSubmissionReceipt
          ? { resultSubmissionReceipt: input.resultSubmissionReceipt }
          : {}),
        ...(input.controlledRuntimeReceipt
          ? { controlledRuntimeReceipt: input.controlledRuntimeReceipt }
          : {}),
      }) ||
      !sameCanonicalJson(
        input.sourceReceipts,
        [...input.sourceReceipts].sort((left, right) =>
          compareUnicodeCodePoints(left.sourceReceiptId, right.sourceReceiptId)
        )
      )
    ) {
      invalid();
    }
    this.#assertReceiptPartition(input.executionReceipt);
    input.sourceReceipts.forEach((receipt) =>
      this.#assertReceiptPartition(receipt)
    );
    input.capabilityExecutionReceipts.forEach((receipt) =>
      this.#assertReceiptPartition(receipt)
    );
    input.capabilitySpecificReceipts.forEach((receipt) =>
      this.#assertReceiptPartition(receipt)
    );
    input.providerCapabilityObservationReceipts.forEach((receipt) =>
      this.#assertReceiptPartition(receipt)
    );
    input.attemptAuthorityOwnerReceipts.forEach((receipt) =>
      this.#assertReceiptPartition(receipt)
    );
    const current = await this.#budgetAt(input.expectedRevision);
    const expected = settleAgentBudget(current, {
      reservationId: input.reservationId,
      expectedRevision: input.expectedRevision,
      actual: input.actual,
      settledAt: input.settledAt,
    });
    if (expected.ok === false) return invalid();
    const expectedSettlement = expected.reservation.settlement;
    if (expectedSettlement === undefined) return invalid();
    const attemptFact = encodeAgentEvaluationFact({
      factType: 'evaluation-attempt',
      value: input.attempt,
    });
    const completed = input.attempt.status === 'completed';
    const raw = exact(
      await this.#client.putAttemptCommit(
        input.attempt.descriptor.attemptId,
        Object.freeze({
          transportDispatchIntents: input.transportDispatchIntents,
          transportReceipts: input.transportReceipts,
          providerResultSpoolReceipts: input.providerResultSpoolReceipts,
          providerResultSpoolDispositionReceipts:
            input.providerResultSpoolDispositionReceipts,
          preDispatchFailureReceipts: input.preDispatchFailureReceipts,
          capabilityExecutionReceipts: input.capabilityExecutionReceipts,
          capabilitySpecificReceipts: input.capabilitySpecificReceipts,
          providerCapabilityObservationReceipts:
            input.providerCapabilityObservationReceipts,
          attemptAuthorityOwnerReceipts: input.attemptAuthorityOwnerReceipts,
          verificationAttemptGrantReceipts:
            input.verificationAttemptGrantReceipts,
          invocationTurnReceipts: input.invocationTurnReceipts,
          invocationTurnSetReceipt: input.invocationTurnSetReceipt,
          sourceReceipts: input.sourceReceipts,
          ...(input.resultSubmissionReceipt
            ? { resultSubmissionReceipt: input.resultSubmissionReceipt }
            : {}),
          ...(input.controlledRuntimeReceipt
            ? { controlledRuntimeReceipt: input.controlledRuntimeReceipt }
            : {}),
          executionReceipt: input.executionReceipt,
          attemptFact,
          budgetSettlement: Object.freeze({
            reservationId: input.reservationId,
            expectedRevision: input.expectedRevision,
            settlement: expectedSettlement,
          }),
        })
      ),
      [
        'transportDispatchIntents',
        'transportReceipts',
        'providerResultSpoolReceipts',
        'providerResultSpoolDispositionReceipts',
        'preDispatchFailureReceipts',
        'capabilityExecutionReceipts',
        'capabilitySpecificReceipts',
        'providerCapabilityObservationReceipts',
        'attemptAuthorityOwnerReceipts',
        'verificationAttemptGrantReceipts',
        'invocationTurnReceipts',
        'invocationTurnSetReceipt',
        'sourceReceipts',
        ...(completed
          ? ['resultSubmissionReceipt', 'controlledRuntimeReceipt']
          : []),
        'executionReceipt',
        'attemptFact',
        'budgetSettlement',
        'replayed',
      ]
    );
    const acknowledgedIntents = array(raw.transportDispatchIntents);
    const acknowledgedTransports = array(raw.transportReceipts);
    const acknowledgedSpools = array(raw.providerResultSpoolReceipts);
    const acknowledgedDispositions = array(
      raw.providerResultSpoolDispositionReceipts
    );
    const acknowledgedPreDispatchFailures = array(
      raw.preDispatchFailureReceipts
    );
    const acknowledgedCapabilityExecutions = array(
      raw.capabilityExecutionReceipts
    );
    const acknowledgedCapabilitySpecifics = array(
      raw.capabilitySpecificReceipts
    );
    const acknowledgedProviderCapabilityObservations = array(
      raw.providerCapabilityObservationReceipts
    );
    const acknowledgedAttemptAuthorityOwners = array(
      raw.attemptAuthorityOwnerReceipts
    );
    const acknowledgedVerificationAttemptGrants = array(
      raw.verificationAttemptGrantReceipts
    );
    const acknowledgedTurns = array(raw.invocationTurnReceipts);
    const acknowledgedSources = array(raw.sourceReceipts);
    if (
      acknowledgedIntents.some(
        (intent) => !isAgentEvaluationTransportDispatchIntent(intent)
      ) ||
      !sameCanonicalJson(acknowledgedIntents, input.transportDispatchIntents) ||
      acknowledgedTransports.some(
        (receipt) => !isAgentEvaluationTransportReceipt(receipt)
      ) ||
      !sameCanonicalJson(acknowledgedTransports, input.transportReceipts) ||
      acknowledgedSpools.some(
        (receipt) => !isAgentEvaluationProviderResultSpoolReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedSpools,
        input.providerResultSpoolReceipts
      ) ||
      acknowledgedDispositions.some(
        (receipt) =>
          !isAgentEvaluationProviderResultSpoolDispositionReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedDispositions,
        input.providerResultSpoolDispositionReceipts
      ) ||
      acknowledgedPreDispatchFailures.some(
        (receipt) => !isAgentEvaluationPreDispatchFailureReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedPreDispatchFailures,
        input.preDispatchFailureReceipts
      ) ||
      acknowledgedCapabilityExecutions.some(
        (receipt) => !isAgentEvaluationCapabilityExecutionReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedCapabilityExecutions,
        input.capabilityExecutionReceipts
      ) ||
      acknowledgedCapabilitySpecifics.some(
        (receipt) => !isAgentEvaluationCapabilitySpecificReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedCapabilitySpecifics,
        input.capabilitySpecificReceipts
      ) ||
      acknowledgedProviderCapabilityObservations.some(
        (receipt) =>
          !isAgentEvaluationProviderCapabilityObservationReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedProviderCapabilityObservations,
        input.providerCapabilityObservationReceipts
      ) ||
      acknowledgedAttemptAuthorityOwners.some(
        (receipt) => !isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedAttemptAuthorityOwners,
        input.attemptAuthorityOwnerReceipts
      ) ||
      acknowledgedVerificationAttemptGrants.some(
        (receipt) => !isAgentEvaluationVerificationAttemptGrantReceipt(receipt)
      ) ||
      !sameCanonicalJson(
        acknowledgedVerificationAttemptGrants,
        input.verificationAttemptGrantReceipts
      ) ||
      acknowledgedTurns.some(
        (receipt) => !isAgentEvaluationInvocationTurnReceipt(receipt)
      ) ||
      !sameCanonicalJson(acknowledgedTurns, input.invocationTurnReceipts) ||
      !isAgentEvaluationInvocationTurnSetReceipt(
        raw.invocationTurnSetReceipt
      ) ||
      !sameCanonicalJson(
        raw.invocationTurnSetReceipt,
        input.invocationTurnSetReceipt
      ) ||
      acknowledgedSources.some(
        (receipt) => !isAgentEvaluationSourceReceipt(receipt)
      ) ||
      !sameCanonicalJson(acknowledgedSources, input.sourceReceipts) ||
      (completed &&
        (!sameCanonicalJson(
          raw.resultSubmissionReceipt,
          input.resultSubmissionReceipt
        ) ||
          !sameCanonicalJson(
            raw.controlledRuntimeReceipt,
            input.controlledRuntimeReceipt
          ))) ||
      !isAgentEvaluationExecutionReceipt(raw.executionReceipt) ||
      !sameCanonicalJson(raw.executionReceipt, input.executionReceipt) ||
      !sameCanonicalJson(raw.attemptFact, attemptFact)
    ) {
      invalid();
    }
    const acknowledgedAttempt = decodeFact(
      raw.attemptFact,
      'evaluation-attempt'
    );
    const settlement = budgetSettlement(raw.budgetSettlement);
    if (
      !sameCanonicalJson(acknowledgedAttempt, input.attempt) ||
      settlement.reservationId !== input.reservationId ||
      settlement.ledgerRevision !== expected.state.revision ||
      settlement.settlementDigest !== expectedSettlement.settlementDigest ||
      settlement.settledAt !== input.settledAt ||
      !sameCanonicalJson(settlement.settlement, expectedSettlement)
    ) {
      invalid();
    }
    return Object.freeze({
      transportDispatchIntents: input.transportDispatchIntents,
      transportReceipts: input.transportReceipts,
      providerResultSpoolReceipts: input.providerResultSpoolReceipts,
      providerResultSpoolDispositionReceipts:
        input.providerResultSpoolDispositionReceipts,
      preDispatchFailureReceipts: input.preDispatchFailureReceipts,
      capabilityExecutionReceipts: input.capabilityExecutionReceipts,
      capabilitySpecificReceipts: input.capabilitySpecificReceipts,
      providerCapabilityObservationReceipts:
        input.providerCapabilityObservationReceipts,
      attemptAuthorityOwnerReceipts: input.attemptAuthorityOwnerReceipts,
      verificationAttemptGrantReceipts: input.verificationAttemptGrantReceipts,
      invocationTurnReceipts: input.invocationTurnReceipts,
      invocationTurnSetReceipt: input.invocationTurnSetReceipt,
      sourceReceipts: input.sourceReceipts,
      ...(input.resultSubmissionReceipt
        ? { resultSubmissionReceipt: input.resultSubmissionReceipt }
        : {}),
      ...(input.controlledRuntimeReceipt
        ? { controlledRuntimeReceipt: input.controlledRuntimeReceipt }
        : {}),
      executionReceipt: input.executionReceipt,
      attempt: input.attempt,
      budgetLedger: expected.state,
      replayed: boolean(raw.replayed),
    });
  }

  async putCheckpoint(
    checkpoint: AgentEvaluationShardCheckpoint,
    expectedPreviousRevision: number
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationShardCheckpoint>
  > {
    if (
      !isAgentEvaluationShardCheckpoint(checkpoint) ||
      checkpoint.planDigest !== this.#plan.planDigest ||
      checkpoint.revision !== expectedPreviousRevision + 1
    ) {
      invalid();
    }
    const response = decodeFactResponse(
      await this.#client.putCheckpoint(
        checkpoint.shardId,
        checkpoint.revision,
        expectedPreviousRevision,
        encodeAgentEvaluationFact({
          factType: 'evaluation-checkpoint',
          value: checkpoint,
        })
      ),
      'evaluation-checkpoint',
      true
    );
    if (!sameCanonicalJson(response.value, checkpoint)) invalid();
    return successful(response.value, response.replayed);
  }

  #assertPlanDigest(planDigest: string): void {
    if (planDigest !== this.#plan.planDigest) invalid();
  }

  #assertReceiptPartition(
    receipt: Readonly<{ planDigest: string; repositoryCommit: string }>
  ): void {
    if (
      receipt.planDigest !== this.#plan.planDigest ||
      receipt.repositoryCommit !== this.#plan.repositoryCommit
    ) {
      invalid();
    }
  }

  async #budgetAt(expectedRevision: number): Promise<AgentBudgetLedgerState> {
    const current = await this.getBudgetLedger();
    if (current.revision !== expectedRevision) invalid();
    return current;
  }
}

export const createEnvironmentAgentEvaluationDurableShardLedger = (
  plan: AgentModelEvaluationPlan,
  input: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = {}
): HttpAgentEvaluationDurableShardLedger =>
  new HttpAgentEvaluationDurableShardLedger(
    createEnvironmentAgentEvaluationLedgerClient({
      ...input,
      planDigest: plan.planDigest,
    }),
    plan
  );
