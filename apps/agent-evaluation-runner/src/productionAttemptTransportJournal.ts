import {
  digestAgentCanonicalValue,
  digestAgentNativeProviderRuntimeResponse,
  isAgentCanonicalDigest,
  isAgentEvaluationProviderResultSpoolAad,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
  isAgentNativeProviderRuntimeFactEnvelope,
  type AgentNativeProviderTransportRequest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  collectAgentEvaluationRuntimeFacts,
  type AgentEvaluationAttemptClosedTransportTurn,
  type AgentEvaluationAttemptTransportJournal,
} from './attemptExecutor';
import type {
  AgentEvaluationDurableReceiptPersistence,
  AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationTransportCloseAcknowledgement,
  AgentEvaluationTransportCloseInput,
  AgentEvaluationTransportDispatchFenceInput,
  AgentEvaluationTransportDispatchIntentAcknowledgement,
  AgentEvaluationTransportDispatchIntentAuthorityResolver,
} from './providerTransport';
import type { AgentEvaluationResultSpoolCipher } from './resultSpoolCipher';
import type { AgentEvaluationResponseSpoolEncryptionProfile } from './runConfig';
import {
  isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  nativeOptionalCapabilityBootstrapIngressMatchesTransport,
} from './nativeOptionalCapabilityBootstrapIngress';
import type {
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationPlan,
  CanonicalDigest,
  Instant,
} from '@prodivix/ai';

type PendingDispatch = Readonly<{
  turnIndex: number;
  invocationId: string;
  requestDigest: CanonicalDigest;
}>;

export type CreateProductionAgentEvaluationAttemptTransportBindingInput =
  Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    persistence: AgentEvaluationDurableReceiptPersistence;
    budgetReservationId: string;
    demandDigest: CanonicalDigest;
    spoolCipher: AgentEvaluationResultSpoolCipher;
    responseSpoolEncryption: AgentEvaluationResponseSpoolEncryptionProfile;
    now: () => Instant;
  }>;

export type ProductionAgentEvaluationAttemptTransportBinding = Readonly<{
  journal: AgentEvaluationAttemptTransportJournal;
  resolveDispatchIntentAuthority: AgentEvaluationTransportDispatchIntentAuthorityResolver;
  putDispatchIntent(
    input: AgentEvaluationTransportDispatchFenceInput
  ): Promise<AgentEvaluationTransportDispatchIntentAcknowledgement>;
  closeTransport(
    input: AgentEvaluationTransportCloseInput
  ): Promise<AgentEvaluationTransportCloseAcknowledgement>;
}>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
  );
};

const asClosedTurn = (
  turn: AgentEvaluationDurableTurnRecord
): AgentEvaluationAttemptClosedTransportTurn => {
  if (turn.state !== 'closed') return unavailable();
  return Object.freeze({
    state: 'closed',
    attemptId: turn.attemptId,
    descriptorDigest: turn.descriptorDigest,
    turnIndex: turn.turnIndex,
    budgetReservationId: turn.budgetReservationId,
    dispatchIntent: turn.dispatchIntent,
    transportReceipt: turn.transportReceipt,
    ...(turn.resultSpoolReceipt
      ? { resultSpoolReceipt: turn.resultSpoolReceipt }
      : {}),
    createdAt: turn.createdAt,
    closedAt: turn.closedAt,
    turnDigest: turn.turnDigest,
  });
};

const exactTurns = (
  turns: readonly AgentEvaluationDurableTurnRecord[],
  input: CreateProductionAgentEvaluationAttemptTransportBindingInput
): readonly AgentEvaluationDurableTurnRecord[] => {
  if (
    turns.some(
      (turn, turnIndex) =>
        turn.turnIndex !== turnIndex ||
        turn.attemptId !== input.descriptor.attemptId ||
        turn.descriptorDigest !== input.descriptor.descriptorDigest ||
        turn.budgetReservationId !== input.budgetReservationId ||
        turn.dispatchIntent.planDigest !== input.plan.planDigest ||
        turn.dispatchIntent.repositoryCommit !== input.plan.repositoryCommit ||
        turn.dispatchIntent.demandDigest !== input.demandDigest
    )
  ) {
    return unavailable();
  }
  return turns;
};

const expiresAt = (
  completedAt: Instant,
  profile: AgentEvaluationResponseSpoolEncryptionProfile
): Instant => {
  const value = new Date(
    Date.parse(completedAt) + profile.retention.maximumAgeMs
  ).toISOString();
  return value;
};

const pendingKey = (invocationId: string, requestDigest: string): string =>
  `${invocationId}\u0000${requestDigest}`;

/**
 * Binds provider dispatch to one descriptor-local durable journal. A completed
 * response is normalized and encrypted before the close acknowledgement; a
 * recovered close is decrypted exactly once and never re-dispatched.
 */
export const createProductionAgentEvaluationAttemptTransportBinding = (
  input: CreateProductionAgentEvaluationAttemptTransportBindingInput
): ProductionAgentEvaluationAttemptTransportBinding => {
  if (
    input.descriptor.planDigest !== input.plan.planDigest ||
    !isAgentCanonicalDigest(input.demandDigest) ||
    input.responseSpoolEncryption.namespaceDigest !==
      input.persistence.namespaceDigest ||
    input.spoolCipher.authority.keyId !== input.responseSpoolEncryption.keyId ||
    input.spoolCipher.authority.keyVersion !==
      input.responseSpoolEncryption.keyVersion ||
    input.spoolCipher.authority.keyRefDigest !==
      input.responseSpoolEncryption.keyRefDigest ||
    input.spoolCipher.authority.encryptionProfileDigest !==
      input.responseSpoolEncryption.encryptionProfileDigest
  ) {
    return unavailable();
  }

  const pending = new Map<string, PendingDispatch>();
  const resolveDispatchIntentAuthority: AgentEvaluationTransportDispatchIntentAuthorityResolver =
    async (request: AgentNativeProviderTransportRequest) => {
      const key = pendingKey(
        request.invocation.invocationId,
        request.invocation.requestDigest
      );
      const existing = pending.get(key);
      if (existing) {
        return Object.freeze({
          descriptor: input.descriptor,
          repositoryCommit: input.plan.repositoryCommit,
          turnIndex: existing.turnIndex,
          budgetReservationId: input.budgetReservationId,
          demandDigest: input.demandDigest,
        });
      }
      const target = input.plan.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === input.descriptor.targetId
      );
      const turns = exactTurns(
        await input.persistence.listTransportTurns(),
        input
      );
      if (
        !target ||
        target.protocolFamily !== request.protocolFamily ||
        turns.some(({ state }) => state !== 'closed') ||
        turns.some(
          ({ transportReceipt }) =>
            transportReceipt?.outcome !== undefined &&
            transportReceipt.outcome !== 'completed'
        )
      ) {
        return unavailable();
      }
      const authority = Object.freeze({
        descriptor: input.descriptor,
        repositoryCommit: input.plan.repositoryCommit,
        turnIndex: turns.length,
        budgetReservationId: input.budgetReservationId,
        demandDigest: input.demandDigest,
      });
      pending.set(
        key,
        Object.freeze({
          turnIndex: turns.length,
          invocationId: request.invocation.invocationId,
          requestDigest: request.invocation.requestDigest,
        })
      );
      return authority;
    };

  const putDispatchIntent = async (
    fence: AgentEvaluationTransportDispatchFenceInput
  ): Promise<AgentEvaluationTransportDispatchIntentAcknowledgement> => {
    const key = pendingKey(
      fence.intent.invocationId,
      fence.intent.requestDigest
    );
    const expected = pending.get(key);
    if (
      !expected ||
      !isAgentEvaluationTransportDispatchIntent(fence.intent) ||
      !sameCanonicalJson(fence.descriptor, input.descriptor) ||
      fence.intent.turnIndex !== expected.turnIndex ||
      fence.intent.budgetReservationId !== input.budgetReservationId ||
      fence.intent.demandDigest !== input.demandDigest
    ) {
      return unavailable();
    }
    const acknowledged = await input.persistence.persistTransportDispatchIntent(
      {
        turnIndex: expected.turnIndex,
        dispatchIntent: fence.intent,
      }
    );
    if (
      acknowledged.state !== 'dispatched' ||
      !sameCanonicalJson(acknowledged.dispatchIntent, fence.intent)
    ) {
      return unavailable();
    }
    return Object.freeze({
      intentDigest: fence.intent.intentDigest,
      disposition: 'created',
    });
  };

  const closeTransport = async (
    close: AgentEvaluationTransportCloseInput
  ): Promise<AgentEvaluationTransportCloseAcknowledgement> => {
    const key = pendingKey(
      close.receipt.invocationId,
      close.receipt.requestDigest
    );
    const expected = pending.get(key);
    const completed = close.receipt.outcome === 'completed';
    if (
      !expected ||
      !isAgentEvaluationTransportReceipt(close.receipt) ||
      completed !== (close.responseDigest !== undefined) ||
      completed !== (close.resultSpoolAad !== undefined) ||
      completed !== (close.encryptedResultSpool !== undefined) ||
      (close.responseDigest !== undefined &&
        !isAgentCanonicalDigest(close.responseDigest)) ||
      (close.resultSpoolAad !== undefined &&
        !isAgentEvaluationProviderResultSpoolAad(close.resultSpoolAad)) ||
      (close.encryptedResultSpool !== undefined &&
        !isAgentEvaluationProviderResultSpoolEnvelope(
          close.encryptedResultSpool
        )) ||
      (close.nativeOptionalCapabilityBootstrapIngress !== undefined &&
        (!completed ||
          expected.turnIndex !== 0 ||
          !close.responseDigest ||
          !close.resultSpoolAad ||
          !close.encryptedResultSpool ||
          !isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(
            close.nativeOptionalCapabilityBootstrapIngress
          ) ||
          !nativeOptionalCapabilityBootstrapIngressMatchesTransport(
            close.nativeOptionalCapabilityBootstrapIngress,
            {
              turnIndex: expected.turnIndex,
              transportReceipt: close.receipt,
              responseDigest: close.responseDigest,
              resultSpoolAad: close.resultSpoolAad,
              encryptedResultSpool: close.encryptedResultSpool,
            }
          )))
    ) {
      return unavailable();
    }
    const closed = await input.persistence.closeTransportTurn({
      turnIndex: expected.turnIndex,
      expectedIntentDigest: close.receipt.dispatchIntentDigest,
      transportReceipt: close.receipt,
      ...(completed
        ? {
            encryptedResultSpool: Object.freeze({
              aad: close.resultSpoolAad!,
              envelope: close.encryptedResultSpool!,
              responseDigest: close.responseDigest!,
              retentionPolicyDigest:
                input.responseSpoolEncryption.retention.retentionPolicyDigest,
              expiresAt: expiresAt(
                close.receipt.completedAt,
                input.responseSpoolEncryption
              ),
            }),
          }
        : {}),
      ...(close.nativeOptionalCapabilityBootstrapIngress
        ? {
            nativeOptionalCapabilityBootstrapIngress:
              close.nativeOptionalCapabilityBootstrapIngress,
          }
        : {}),
      closedAt: close.receipt.completedAt,
    });
    if (
      closed.state !== 'closed' ||
      !sameCanonicalJson(closed.transportReceipt, close.receipt) ||
      completed !== (closed.resultSpoolReceipt !== undefined) ||
      (completed &&
        closed.resultSpoolReceipt?.responseDigest !== close.responseDigest)
    ) {
      return unavailable();
    }
    pending.delete(key);
    return Object.freeze({
      dispatchIntentDigest: close.receipt.dispatchIntentDigest,
      transportReceiptDigest: close.receipt.receiptDigest,
      ...(closed.resultSpoolReceipt
        ? { resultSpoolDigest: closed.resultSpoolReceipt.envelopeDigest }
        : {}),
      disposition: 'closed',
    });
  };

  const journal: AgentEvaluationAttemptTransportJournal = Object.freeze({
    async takeClosedTurn(
      turnInput: Parameters<
        AgentEvaluationAttemptTransportJournal['takeClosedTurn']
      >[0]
    ) {
      const turns = exactTurns(
        await input.persistence.listTransportTurns(),
        input
      );
      const turn = turns[turnInput.turnIndex];
      if (
        !turn ||
        turn.state !== 'closed' ||
        turnInput.plan.planDigest !== input.plan.planDigest ||
        !sameCanonicalJson(turnInput.descriptor, input.descriptor) ||
        turn.dispatchIntent.invocationId !==
          turnInput.invocation.invocationId ||
        turn.dispatchIntent.requestDigest !==
          turnInput.invocation.requestDigest ||
        turnInput.encodedPayload.protocolFamily !==
          turn.dispatchIntent.protocolFamily
      ) {
        return unavailable();
      }
      return asClosedTurn(turn);
    },
    async recoverRuntimeTurn(
      turnInput: Parameters<
        AgentEvaluationAttemptTransportJournal['recoverRuntimeTurn']
      >[0]
    ) {
      const spool = turnInput.turn.resultSpoolReceipt;
      if (
        !spool ||
        !isAgentEvaluationProviderResultSpoolReceipt(spool) ||
        turnInput.turn.transportReceipt.outcome !== 'completed' ||
        turnInput.encodedPayload.protocolFamily !==
          turnInput.turn.transportReceipt.protocolFamily
      ) {
        return unavailable();
      }
      const encrypted = await input.persistence.readEncryptedResultSpool({
        turnIndex: turnInput.turn.turnIndex,
        expectedTurnDigest: turnInput.turn.turnDigest,
      });
      if (
        !sameCanonicalJson(encrypted.resultSpoolReceipt, spool) ||
        encrypted.responseDigest !== spool.responseDigest ||
        encrypted.aad.normalizedEventSetDigest !==
          spool.normalizedEventSetDigest
      ) {
        return unavailable();
      }
      return input.spoolCipher.useDecrypted(
        encrypted.envelope,
        encrypted.aad,
        async (bytes) => {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          const parsed: unknown = JSON.parse(text);
          if (
            canonicalJsonText(parsed) !== text ||
            !Array.isArray(parsed) ||
            parsed.length < 2 ||
            parsed.some(
              (value) =>
                !isAgentNativeProviderRuntimeFactEnvelope(value) ||
                value.protocolFamily !==
                  turnInput.encodedPayload.protocolFamily ||
                value.invocationId !== turnInput.invocation.invocationId ||
                value.requestDigest !== turnInput.invocation.requestDigest ||
                value.providerConfigurationId !==
                  turnInput.invocation.providerConfigurationId ||
                value.modelLineageDigest !==
                  turnInput.invocation.modelLineageDigest
            )
          ) {
            return unavailable();
          }
          const envelopes = parsed;
          const facts = Object.freeze(envelopes.map(({ fact }) => fact));
          if (
            digestAgentCanonicalValue(envelopes) !==
              encrypted.aad.normalizedEventSetDigest ||
            digestAgentNativeProviderRuntimeResponse(
              turnInput.invocation.requestDigest,
              facts
            ) !== spool.responseDigest
          ) {
            return unavailable();
          }
          return collectAgentEvaluationRuntimeFacts(
            facts,
            turnInput.invocation,
            turnInput.protectedLeakCanaries,
            input.now
          );
        }
      );
    },
  });

  return Object.freeze({
    journal,
    resolveDispatchIntentAuthority,
    putDispatchIntent,
    closeTransport,
  });
};
