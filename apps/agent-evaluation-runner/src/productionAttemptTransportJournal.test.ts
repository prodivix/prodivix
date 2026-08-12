import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  createAgentNativeProviderRuntimeFactEnvelope,
  digestAgentCanonicalValue,
  digestAgentNativeProviderRuntimeResponse,
  normalizeNativeAgentProviderRuntimeEvents,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationProviderResultSpoolEnvelope,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentEvaluationDurableEncryptedResultSpool,
  AgentEvaluationDurableReceiptPersistence,
  AgentEvaluationDurableResultSpoolRead,
  AgentEvaluationDurableTurnRecord,
} from './durableShardRunner';
import { createProductionAgentEvaluationAttemptTransportBinding } from './productionAttemptTransportJournal';
import {
  createAgentEvaluationAesGcmResultSpoolCipher,
  EnvironmentAgentEvaluationResultSpoolKeyResolver,
} from './resultSpoolCipher';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import type { AgentEvaluationEncodedInvocationPayload } from './invocationPayload';

const NOW = '2026-08-08T00:00:00.000Z';

const config = decodeAgentEvaluationFrozenRunConfig(
  materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../specs/evaluation/g4-real-model-evaluation.example.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as Record<string, unknown>
  ),
  {
    clock: () => NOW,
    expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  }
);

const identityPersistence = <T>(receipt: T): Promise<T> =>
  Promise.resolve(receipt);

describe('production attempt transport journal', () => {
  it('replays one atomically closed normalized spool without another dispatch', async () => {
    const plan = config.plan;
    const descriptor = planAgentModelEvaluationAttempts(plan).find(
      (candidate) =>
        plan.capabilityQualificationTargets.find(
          ({ targetId }) => targetId === candidate.targetId
        )?.protocolFamily === 'openai-responses'
    )!;
    const target = plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === descriptor.targetId
    )!;
    const budgetReservationId = 'budget-reservation.production-journal-test';
    const demandDigest = digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      maximumTurns: config.controlledRuntime.loop.maximumTurnsPerAttempt,
    });
    const cipher = createAgentEvaluationAesGcmResultSpoolCipher({
      keys: new EnvironmentAgentEvaluationResultSpoolKeyResolver({
        profile: config.responseSpoolEncryption,
        environment: {
          PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: Buffer.alloc(
            32,
            7
          ).toString('base64'),
        },
      }),
      randomBytes: (size) => new Uint8Array(size).fill(5),
    });
    const turns: AgentEvaluationDurableTurnRecord[] = [];
    let encrypted:
      | (AgentEvaluationDurableEncryptedResultSpool & {
          resultSpoolReceipt: ReturnType<
            typeof createAgentEvaluationProviderResultSpoolReceipt
          >;
        })
      | undefined;
    const persistIntent = vi.fn(
      async ({
        turnIndex,
        dispatchIntent,
      }: Parameters<
        AgentEvaluationDurableReceiptPersistence['persistTransportDispatchIntent']
      >[0]) => {
        const base = Object.freeze({
          state: 'dispatched' as const,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          turnIndex,
          budgetReservationId,
          dispatchIntent,
          createdAt: dispatchIntent.createdAt,
        });
        const turn = Object.freeze({
          ...base,
          turnDigest: digestAgentCanonicalValue(base),
        });
        turns.push(turn);
        return turn;
      }
    );
    const persistence: AgentEvaluationDurableReceiptPersistence = Object.freeze(
      {
        namespaceDigest: config.responseSpoolEncryption.namespaceDigest,
        listTransportTurns: async () => Object.freeze([...turns]),
        persistTransportDispatchIntent: persistIntent,
        closeTransportTurn: async (close) => {
          const open = turns[close.turnIndex];
          if (
            !open ||
            open.state !== 'dispatched' ||
            !close.encryptedResultSpool
          ) {
            throw new Error('Expected one open completed turn.');
          }
          const resultSpoolReceipt =
            createAgentEvaluationProviderResultSpoolReceipt({
              aad: close.encryptedResultSpool.aad,
              envelope: close.encryptedResultSpool.envelope,
              responseDigest: close.encryptedResultSpool.responseDigest,
              retentionClass: 'attempt-resume-only',
              retentionPolicyDigest:
                close.encryptedResultSpool.retentionPolicyDigest,
              createdAt: close.transportReceipt.completedAt,
              expiresAt: close.encryptedResultSpool.expiresAt,
            });
          encrypted = Object.freeze({
            ...close.encryptedResultSpool,
            resultSpoolReceipt,
          });
          const base = Object.freeze({
            state: 'closed' as const,
            attemptId: descriptor.attemptId,
            descriptorDigest: descriptor.descriptorDigest,
            turnIndex: close.turnIndex,
            budgetReservationId,
            dispatchIntent: open.dispatchIntent,
            transportReceipt: close.transportReceipt,
            resultSpoolReceipt,
            createdAt: open.createdAt,
            closedAt: close.closedAt,
          });
          const turn = Object.freeze({
            ...base,
            turnDigest: digestAgentCanonicalValue(base),
          });
          turns[close.turnIndex] = turn;
          return turn;
        },
        readEncryptedResultSpool: async ({ expectedTurnDigest }) => {
          if (!encrypted) throw new Error('Encrypted spool was not closed.');
          const accessBase = Object.freeze({
            format:
              'prodivix.agent-evaluation-provider-result-spool-access-receipt' as const,
            version: 1 as const,
            spoolRef: encrypted.resultSpoolReceipt.spoolRef,
            spoolReceiptDigest: encrypted.resultSpoolReceipt.receiptDigest,
            attemptId: descriptor.attemptId,
            turnIndex: 0,
            expectedTurnDigest,
            shardId: descriptor.shardId,
            ownerId: 'owner.production-journal-test',
            leaseGeneration: 1,
            accessedAt: NOW,
          });
          return Object.freeze({
            ...encrypted,
            accessReceipt: Object.freeze({
              ...accessBase,
              receiptDigest: digestAgentCanonicalValue(accessBase),
            }),
          }) as AgentEvaluationDurableResultSpoolRead;
        },
        stageResultSpoolDispositionReceipt: identityPersistence,
        persistPreDispatchFailureReceipt: identityPersistence,
        persistCapabilityExecutionReceipt: identityPersistence,
        persistCapabilitySpecificReceipt: identityPersistence,
        persistProviderCapabilityObservationReceipt: identityPersistence,
        persistAttemptAuthorityOwnerReceipt: identityPersistence,
        persistSourceReceipt: identityPersistence,
        persistInvocationTurnReceipt: identityPersistence,
        persistResultSubmissionReceipt: identityPersistence,
        persistControlledRuntimeReceipt: identityPersistence,
        persistExecutionReceipt: identityPersistence,
      }
    );
    const binding = createProductionAgentEvaluationAttemptTransportBinding({
      plan,
      descriptor,
      persistence,
      budgetReservationId,
      demandDigest,
      spoolCipher: cipher,
      responseSpoolEncryption: config.responseSpoolEncryption,
      now: () => NOW,
    });
    const invocation = Object.freeze({
      invocationId: 'invocation.production-journal-test',
      requestDigest: digestAgentCanonicalValue({ request: 'journal-test' }),
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      capabilityProfileDigest: target.capabilityProfileDigest,
      inferenceConfigurationDigest: target.inferenceConfigurationDigest,
      contextPackDigest: digestAgentCanonicalValue({ context: 'journal-test' }),
    });
    const request = Object.freeze({
      protocolFamily: 'openai-responses' as const,
      invocation,
    });
    const authority = await binding.resolveDispatchIntentAuthority(request);
    const requestBodyDigest = digestAgentCanonicalValue({ body: 'safe' });
    const intent = createAgentEvaluationTransportDispatchIntent({
      intentId: 'transport-intent.production-journal-test',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: authority.turnIndex,
      budgetReservationId,
      demandDigest,
      protocolFamily: 'openai-responses',
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      inferenceConfigurationDigest: target.inferenceConfigurationDigest,
      invocationId: invocation.invocationId,
      requestDigest: invocation.requestDigest,
      endpointId: 'endpoint.openai-responses.first-party',
      endpointClass: 'first-party-hosted',
      requestBodyDigest,
      requestBytes: 128,
      createdAt: NOW,
    });
    await binding.putDispatchIntent({ descriptor, intent });
    const responseBodyDigest = digestAgentCanonicalValue({ response: 'safe' });
    const receipt = createAgentEvaluationTransportReceipt({
      receiptId: 'provider-transport-receipt.production-journal-test',
      protocolFamily: 'openai-responses',
      providerConfigurationId: target.providerConfigurationId,
      invocationId: invocation.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: invocation.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: 'first-party-hosted',
      requestBodyDigest,
      requestBytes: 128,
      responseBytes: 256,
      httpStatus: 200,
      responseHeaderDigest: digestAgentCanonicalValue({ headers: 'safe' }),
      responseBodyDigest,
      providerRequestId: 'provider-request.production-journal-test',
      providerIdentityKind: 'response-id',
      providerResponseId: 'provider-response.production-journal-test',
      resolvedModelId: target.modelId,
      sseEventCount: 2,
      dispatchState: 'dispatched',
      outcome: 'completed',
      startedAt: NOW,
      completedAt: NOW,
    });
    const facts = normalizeNativeAgentProviderRuntimeEvents(
      'openai-responses',
      [
        { type: 'response.created', response: { id: 'response-journal' } },
        {
          type: 'response.completed',
          response: {
            id: 'response-journal',
            status: 'completed',
            usage: { input_tokens: 8, output_tokens: 4 },
          },
        },
      ],
      { invocationId: invocation.invocationId, occurredAt: NOW }
    );
    const runtimeEvents = Object.freeze(
      facts.map((fact) =>
        createAgentNativeProviderRuntimeFactEnvelope(
          {
            protocolFamily: 'openai-responses',
            invocationId: invocation.invocationId,
            requestDigest: invocation.requestDigest,
            providerConfigurationId: invocation.providerConfigurationId,
            modelLineageDigest: invocation.modelLineageDigest,
            fact,
          },
          {
            protectedMaterialCanaries: Object.freeze([
              'protected-transport-journal-canary',
            ]),
            secretCanaries: Object.freeze(['secret-transport-journal-canary']),
          }
        )
      )
    );
    const responseDigest = digestAgentNativeProviderRuntimeResponse(
      invocation.requestDigest,
      facts
    );
    const aad = createAgentEvaluationProviderResultSpoolAad({
      namespaceDigest: config.responseSpoolEncryption.namespaceDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId: invocation.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: receipt.receiptDigest,
      responseBodyDigest,
      normalizedEventSetDigest: digestAgentCanonicalValue(runtimeEvents),
    });
    const canonicalEventBytes = new TextEncoder().encode(
      canonicalJsonText(runtimeEvents)
    );
    const envelope: AgentEvaluationProviderResultSpoolEnvelope =
      await cipher.encrypt({ aad, canonicalEventBytes });
    await binding.closeTransport({
      receipt,
      responseDigest,
      resultSpoolAad: aad,
      encryptedResultSpool: envelope,
    });
    const encodedPayload = Object.freeze({
      protocolFamily: 'openai-responses' as const,
      payload: Object.freeze({ body: Object.freeze({ input: 'safe' }) }),
      toolBindings: Object.freeze([]),
      toolResultBindings: Object.freeze([]),
      payloadDigest: digestAgentCanonicalValue({ payload: 'journal-test' }),
    }) satisfies AgentEvaluationEncodedInvocationPayload;
    const closed = await binding.journal.takeClosedTurn({
      plan,
      descriptor,
      turnIndex: 0,
      invocation,
      encodedPayload,
    });
    const replayed = await binding.journal.recoverRuntimeTurn({
      plan,
      descriptor,
      turn: closed,
      invocation,
      encodedPayload,
      protectedLeakCanaries: [],
    });

    expect(replayed.terminalEvent.durableEvent.type).toBe('completed');
    expect(replayed.reportedUsage.amounts).toHaveLength(2);
    expect(persistIntent).toHaveBeenCalledTimes(1);
    expect(turns).toHaveLength(1);
  }, 30_000);
});
