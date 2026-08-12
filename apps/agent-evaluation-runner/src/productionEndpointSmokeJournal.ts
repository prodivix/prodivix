import {
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentCanonicalDigest,
  isAgentControlInstant,
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolAad,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportReceipt,
  type AgentBudgetReservation,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type AgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import {
  createAgentEvaluationEndpointSmokeJournalTurn,
  type AgentEvaluationEndpointSmokeEncryptedResultSpool,
  type AgentEvaluationEndpointSmokeEvidenceCommit,
  type AgentEvaluationEndpointSmokeJournal,
  type AgentEvaluationEndpointSmokeJournalTurn,
} from './smokeQualifier';

const invalid = (): never => {
  throw new TypeError('Production endpoint-smoke journal response is invalid.');
};

const record = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value) || Object.keys(value).some(isUnsafeObjectKey)) {
    return invalid();
  }
  return value;
};

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : invalid();

const nonNegativeInteger = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();

const decodeReservation = (
  value: unknown,
  expected: Readonly<{
    reservationId: string;
    demand: unknown;
    demandDigest: string;
  }>
): AgentBudgetReservation => {
  const reservation = record(value);
  if (
    !exactKeys(reservation, [
      'reservationId',
      'demand',
      'demandDigest',
      'reservedAt',
      'status',
    ]) ||
    reservation.reservationId !== expected.reservationId ||
    reservation.demandDigest !== expected.demandDigest ||
    !sameCanonicalJson(reservation.demand, expected.demand) ||
    !isAgentControlInstant(reservation.reservedAt) ||
    reservation.status !== 'reserved'
  ) {
    return invalid();
  }
  return reservation as AgentBudgetReservation;
};

const decodeTurn = (
  value: unknown
): AgentEvaluationEndpointSmokeJournalTurn => {
  const turn = record(value);
  if (!isAgentEvaluationEndpointSmokeDispatchIntent(turn.intent)) {
    return invalid();
  }
  if (turn.state === 'intent-recorded') {
    if (!exactKeys(turn, ['state', 'intent', 'turnDigest'])) return invalid();
    const expected = createAgentEvaluationEndpointSmokeJournalTurn({
      state: 'intent-recorded',
      intent: turn.intent,
    });
    return sameCanonicalJson(turn, expected) ? expected : invalid();
  }
  if (
    turn.state !== 'closed' ||
    !exactKeys(
      turn,
      ['state', 'intent', 'transportReceipt', 'closedAt', 'turnDigest'],
      ['resultSpoolReceipt']
    ) ||
    !isAgentEvaluationTransportReceipt(turn.transportReceipt) ||
    !isAgentControlInstant(turn.closedAt) ||
    (turn.resultSpoolReceipt !== undefined &&
      !isAgentEvaluationEndpointSmokeResultSpoolReceipt(
        turn.resultSpoolReceipt
      ))
  ) {
    return invalid();
  }
  const expected = createAgentEvaluationEndpointSmokeJournalTurn({
    state: 'closed',
    intent: turn.intent,
    transportReceipt: turn.transportReceipt,
    ...(turn.resultSpoolReceipt
      ? { resultSpoolReceipt: turn.resultSpoolReceipt }
      : {}),
    closedAt: turn.closedAt,
  });
  return sameCanonicalJson(turn, expected) ? expected : invalid();
};

const decodeCommit = (
  value: unknown,
  expected: Readonly<{ planDigest: string; repositoryCommit: string }>
): AgentEvaluationEndpointSmokeEvidenceCommit => {
  const commit = record(value);
  if (
    !exactKeys(commit, [
      'configurationDigest',
      'planDigest',
      'repositoryCommit',
      'reservation',
      'settlement',
      'dispatchIntents',
      'transportReceipts',
      'resultSpoolReceipts',
      'resultSpoolDispositionReceipts',
      'endpointSmokeReceipts',
      'validationFailureReceipts',
      'sourceReceipts',
      'report',
    ]) ||
    !isAgentCanonicalDigest(commit.configurationDigest) ||
    commit.planDigest !== expected.planDigest ||
    commit.repositoryCommit !== expected.repositoryCommit ||
    !Array.isArray(commit.dispatchIntents) ||
    !commit.dispatchIntents.every(
      isAgentEvaluationEndpointSmokeDispatchIntent
    ) ||
    !Array.isArray(commit.transportReceipts) ||
    !commit.transportReceipts.every(isAgentEvaluationTransportReceipt) ||
    !Array.isArray(commit.resultSpoolReceipts) ||
    !commit.resultSpoolReceipts.every(
      isAgentEvaluationEndpointSmokeResultSpoolReceipt
    ) ||
    !Array.isArray(commit.resultSpoolDispositionReceipts) ||
    !commit.resultSpoolDispositionReceipts.every(
      isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt
    ) ||
    !Array.isArray(commit.endpointSmokeReceipts) ||
    !commit.endpointSmokeReceipts.every(
      isAgentEvaluationEndpointSmokeReceipt
    ) ||
    !Array.isArray(commit.validationFailureReceipts) ||
    !commit.validationFailureReceipts.every(
      isAgentEvaluationEndpointSmokeValidationFailureReceipt
    ) ||
    !Array.isArray(commit.sourceReceipts) ||
    !commit.sourceReceipts.every(isAgentEvaluationSourceReceipt) ||
    !isPlainObject(commit.reservation) ||
    !isPlainObject(commit.settlement) ||
    !isPlainObject(commit.report)
  ) {
    return invalid();
  }
  return commit as AgentEvaluationEndpointSmokeEvidenceCommit;
};

const decodeTurnAcknowledgement = (
  value: unknown
): AgentEvaluationEndpointSmokeJournalTurn => {
  const acknowledgement = record(value);
  if (!exactKeys(acknowledgement, ['turn', 'replayed'])) return invalid();
  boolean(acknowledgement.replayed);
  return decodeTurn(acknowledgement.turn);
};

const decodeSpool = (
  value: unknown,
  expected: Readonly<{
    planDigest: string;
    repositoryCommit: string;
    smokeTargetId: string;
    expectedSpoolReceiptDigest: string;
  }>
): AgentEvaluationEndpointSmokeEncryptedResultSpool => {
  const source = record(value);
  if (
    !exactKeys(source, ['aad', 'envelope', 'receipt']) ||
    !isAgentEvaluationEndpointSmokeResultSpoolAad(source.aad) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(source.envelope) ||
    !isAgentEvaluationEndpointSmokeResultSpoolReceipt(source.receipt) ||
    source.aad.planDigest !== expected.planDigest ||
    source.aad.repositoryCommit !== expected.repositoryCommit ||
    source.aad.smokeTargetId !== expected.smokeTargetId ||
    source.receipt.receiptDigest !== expected.expectedSpoolReceiptDigest ||
    source.receipt.planDigest !== expected.planDigest ||
    source.receipt.repositoryCommit !== expected.repositoryCommit ||
    source.receipt.smokeTargetId !== expected.smokeTargetId
  ) {
    return invalid();
  }
  let recreated;
  try {
    recreated = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
      aad: source.aad,
      envelope: source.envelope,
      responseDigest: source.receipt.responseDigest,
      retentionPolicyDigest: source.receipt.retentionPolicyDigest,
      createdAt: source.receipt.createdAt,
      expiresAt: source.receipt.expiresAt,
    });
  } catch {
    return invalid();
  }
  if (!sameCanonicalJson(recreated, source.receipt)) return invalid();
  return Object.freeze({
    aad: source.aad,
    envelope: source.envelope,
    receipt: recreated,
  });
};

const findTurn = async (
  client: AgentEvaluationLedgerClient,
  planDigest: string,
  repositoryCommit: string,
  smokeTargetId: string
): Promise<AgentEvaluationEndpointSmokeJournalTurn | undefined> => {
  const response = record(await client.listEndpointSmokeTurns());
  if (
    !exactKeys(response, [
      'format',
      'version',
      'planDigest',
      'repositoryCommit',
      'turns',
    ]) ||
    response.format !== 'prodivix.agent-evaluation-endpoint-smoke-turn-list' ||
    response.version !== 1 ||
    response.planDigest !== planDigest ||
    response.repositoryCommit !== repositoryCommit ||
    !Array.isArray(response.turns) ||
    response.turns.length > 5
  ) {
    return invalid();
  }
  const turns = response.turns.map(decodeTurn);
  if (
    new Set(turns.map(({ intent }) => intent.smokeTargetId)).size !==
    turns.length
  ) {
    return invalid();
  }
  return turns.find(({ intent }) => intent.smokeTargetId === smokeTargetId);
};

export type ProductionAgentEvaluationEndpointSmokeJournalOptions = Omit<
  CreateEnvironmentAgentEvaluationLedgerClientInput,
  'planDigest'
>;

/** Strict Backend v40 adapter for the five-target endpoint-smoke journal. */
export const createEnvironmentAgentEvaluationEndpointSmokeJournal = (
  options: ProductionAgentEvaluationEndpointSmokeJournalOptions = {}
): AgentEvaluationEndpointSmokeJournal => {
  const clientFor = (planDigest: string, repositoryCommit: string) => {
    const client = createEnvironmentAgentEvaluationLedgerClient({
      ...options,
      planDigest,
    });
    if (client.scope.repositoryCommit !== repositoryCommit) return invalid();
    return client;
  };

  const journal: AgentEvaluationEndpointSmokeJournal = {
    async loadCommit({ planDigest, repositoryCommit }) {
      const response = await clientFor(
        planDigest,
        repositoryCommit
      ).getEndpointSmokeCommit();
      if (response === null) return undefined;
      const envelope = record(response);
      if (!exactKeys(envelope, ['commit'])) return invalid();
      return decodeCommit(envelope.commit, { planDigest, repositoryCommit });
    },

    async reserveBudget({ plan, reservationId, demand, demandDigest }) {
      const client = clientFor(plan.planDigest, plan.repositoryCommit);
      const request = Object.freeze({ demand, demandDigest });
      let response: unknown;
      try {
        response = await client.reserveEndpointSmokeBudget(
          reservationId,
          request
        );
      } catch {
        response = await client.reserveEndpointSmokeBudget(
          reservationId,
          request
        );
      }
      const acknowledgement = record(response);
      if (
        !exactKeys(acknowledgement, [
          'reservation',
          'ledgerRevision',
          'replayed',
        ])
      ) {
        return invalid();
      }
      nonNegativeInteger(acknowledgement.ledgerRevision);
      boolean(acknowledgement.replayed);
      return decodeReservation(acknowledgement.reservation, {
        reservationId,
        demand,
        demandDigest,
      });
    },

    async listTurns({ planDigest, repositoryCommit }) {
      const client = clientFor(planDigest, repositoryCommit);
      const response = record(await client.listEndpointSmokeTurns());
      if (
        !exactKeys(response, [
          'format',
          'version',
          'planDigest',
          'repositoryCommit',
          'turns',
        ]) ||
        response.format !==
          'prodivix.agent-evaluation-endpoint-smoke-turn-list' ||
        response.version !== 1 ||
        response.planDigest !== planDigest ||
        response.repositoryCommit !== repositoryCommit ||
        !Array.isArray(response.turns) ||
        response.turns.length > 5
      ) {
        return invalid();
      }
      const turns = response.turns.map(decodeTurn);
      if (
        new Set(turns.map(({ intent }) => intent.smokeTargetId)).size !==
        turns.length
      ) {
        return invalid();
      }
      return Object.freeze(turns);
    },

    async putDispatchIntent({ plan, target, intent }) {
      const client = clientFor(plan.planDigest, plan.repositoryCommit);
      try {
        const turn = decodeTurnAcknowledgement(
          await client.putEndpointSmokeDispatch(target.smokeTargetId, intent)
        );
        return sameCanonicalJson(turn.intent, intent) ? turn : invalid();
      } catch (caught) {
        const recovered = await findTurn(
          client,
          plan.planDigest,
          plan.repositoryCommit,
          target.smokeTargetId
        );
        if (
          recovered?.state === 'intent-recorded' &&
          sameCanonicalJson(recovered.intent, intent)
        ) {
          return recovered;
        }
        throw caught;
      }
    },

    async closeTransport({
      plan,
      target,
      intent,
      transportReceipt,
      encryptedResultSpool,
      closedAt,
    }) {
      const client = clientFor(plan.planDigest, plan.repositoryCommit);
      const request = Object.freeze({
        intent,
        transportReceipt,
        ...(encryptedResultSpool ? { encryptedResultSpool } : {}),
        closedAt,
      });
      try {
        const turn = decodeTurnAcknowledgement(
          await client.closeEndpointSmokeTransport(
            target.smokeTargetId,
            request
          )
        );
        return turn.state === 'closed' &&
          sameCanonicalJson(turn.intent, intent) &&
          sameCanonicalJson(turn.transportReceipt, transportReceipt) &&
          sameCanonicalJson(
            turn.resultSpoolReceipt,
            encryptedResultSpool?.receipt
          ) &&
          turn.closedAt === closedAt
          ? turn
          : invalid();
      } catch (caught) {
        const recovered = await findTurn(
          client,
          plan.planDigest,
          plan.repositoryCommit,
          target.smokeTargetId
        );
        if (
          recovered?.state === 'closed' &&
          sameCanonicalJson(recovered.intent, intent) &&
          sameCanonicalJson(recovered.transportReceipt, transportReceipt) &&
          sameCanonicalJson(
            recovered.resultSpoolReceipt,
            encryptedResultSpool?.receipt
          ) &&
          recovered.closedAt === closedAt
        ) {
          return recovered;
        }
        throw caught;
      }
    },

    async readEncryptedResultSpool(input) {
      return decodeSpool(
        await clientFor(
          input.planDigest,
          input.repositoryCommit
        ).getEndpointSmokeResultSpool(
          input.smokeTargetId,
          input.expectedSpoolReceiptDigest
        ),
        input
      );
    },

    async commitEvidence(input) {
      const client = clientFor(input.planDigest, input.repositoryCommit);
      try {
        const acknowledgement = record(
          await client.putEndpointSmokeCommit(input)
        );
        if (!exactKeys(acknowledgement, ['commit', 'replayed'])) {
          return invalid();
        }
        boolean(acknowledgement.replayed);
        const committed = decodeCommit(acknowledgement.commit, input);
        return sameCanonicalJson(committed, input) ? committed : invalid();
      } catch (caught) {
        const recovered = await journal.loadCommit(input);
        if (recovered && sameCanonicalJson(recovered, input)) return recovered;
        throw caught;
      }
    },
  };
  return Object.freeze(journal);
};
