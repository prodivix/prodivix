import { readFileSync } from 'node:fs';
import {
  createAgentEvaluationEndpointSmokeDispatchIntent,
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentBudgetDemand,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { createEnvironmentAgentEvaluationEndpointSmokeJournal } from './productionEndpointSmokeJournal';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import { createAgentEvaluationEndpointSmokeJournalTurn } from './smokeQualifier';

const instant = '2026-08-08T00:00:00.000Z';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const config = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/evaluation/g4-real-model-evaluation.example.json',
      import.meta.url
    ),
    'utf8'
  )
) as Record<string, unknown>;
materializeAgentEvaluationTestProductionRunConfig(config);
const plan = decodeAgentEvaluationFrozenRunConfig(config, {
  clock: () => instant,
  expectedRepositoryCommit: repositoryCommit,
}).plan;
const target = plan.endpointSmokeTargets[0]!;
const digest = (label: string) => digestAgentCanonicalValue({ label });
const token = 'endpoint-smoke-ledger-token-0123456789-abcdef';
const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: 'g4-evaluation',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });

const intent = createAgentEvaluationEndpointSmokeDispatchIntent({
  intentId: 'endpoint-smoke-intent.1',
  planDigest: plan.planDigest,
  repositoryCommit,
  smokeTargetId: target.smokeTargetId,
  smokeTargetDigest: target.targetDigest,
  endpointClass: target.endpointClass,
  protocolFamily: target.protocolFamily,
  providerConfigurationId: target.providerConfigurationId,
  modelId: target.modelId,
  immutableModelVersion: target.immutableModelVersion,
  modelLineageDigest: target.modelLineageDigest,
  inferenceConfigurationDigest: target.inferenceConfigurationDigest,
  adapterDigest: target.adapterDigest,
  pricingAuthorityDigest: target.pricingAuthorityDigest,
  responseSpoolEncryptionPolicyDigest:
    target.responseSpoolEncryptionPolicyDigest,
  smokeProfileDigest: target.smokeProfileDigest,
  invocationId: 'endpoint-smoke-invocation.1',
  budgetReservationId: 'endpoint-smoke-budget.1',
  demandDigest: digest('demand'),
  requestDigest: digest('request'),
  endpointId: 'endpoint-smoke-endpoint.1',
  requestBodyDigest: digest('request-body'),
  requestBytes: 128,
  createdAt: instant,
});

const transport = createAgentEvaluationTransportReceipt({
  receiptId: 'endpoint-smoke-transport.1',
  protocolFamily: intent.protocolFamily,
  providerConfigurationId: intent.providerConfigurationId,
  invocationId: intent.invocationId,
  dispatchIntentDigest: intent.intentDigest,
  requestDigest: intent.requestDigest,
  endpointId: intent.endpointId,
  endpointClass: intent.endpointClass,
  requestBodyDigest: intent.requestBodyDigest,
  requestBytes: intent.requestBytes,
  responseBytes: 256,
  httpStatus: 200,
  responseHeaderDigest: digest('response-headers'),
  responseBodyDigest: digest('response-body'),
  providerRequestId: 'provider-request.1',
  providerIdentityKind: 'response-id',
  providerResponseId: 'provider-response.1',
  resolvedModelId: target.modelId,
  resolvedModelVersion: target.immutableModelVersion,
  sseEventCount: 1,
  dispatchState: 'dispatched',
  outcome: 'completed',
  startedAt: instant,
  completedAt: '2026-08-08T00:00:01.000Z',
});

const aadFor = (suffix: string): AgentEvaluationEndpointSmokeResultSpoolAad =>
  Object.freeze({
    format:
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad' as const,
    version: 1 as const,
    namespaceDigest: digest('namespace'),
    planDigest: plan.planDigest,
    repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    responseBodyDigest: transport.responseBodyDigest!,
    normalizedEventSetDigest: digest(`events-${suffix}`),
  });

const spoolFor = (aad: AgentEvaluationEndpointSmokeResultSpoolAad) => {
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationEndpointSmokeResultSpoolId(aad),
    algorithm: 'aes-256-gcm',
    keyId: 'endpoint-smoke-spool-key',
    keyVersion: 1,
    keyRefDigest: digest('key-ref'),
    encryptionProfileDigest: digest('encryption-profile'),
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQID',
    aadDigest: digestAgentEvaluationEndpointSmokeResultSpoolAad(aad),
  });
  const receipt = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
    aad,
    envelope,
    responseDigest: digest('response'),
    retentionPolicyDigest: digest('retention'),
    createdAt: '2026-08-08T00:00:01.000Z',
    expiresAt: '2026-08-08T01:00:01.000Z',
  });
  return Object.freeze({ aad, envelope, receipt });
};

const demand: AgentBudgetDemand = Object.freeze({
  usage: createAgentUsageVector([]),
  cost: Object.freeze([]),
  modelInvocations: 5,
  toolCalls: 0,
  repairRounds: 0,
  transactions: 0,
  artifactBytes: 0,
  elapsedMs: 5_000,
});

describe('production endpoint-smoke journal', () => {
  it('decodes the bounded turn list and reserved budget acknowledgement', async () => {
    const turn = createAgentEvaluationEndpointSmokeJournalTurn({
      state: 'intent-recorded',
      intent,
    });
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/endpoint-smoke/turns')) {
        return jsonResponse({
          format: 'prodivix.agent-evaluation-endpoint-smoke-turn-list',
          version: 1,
          planDigest: plan.planDigest,
          repositoryCommit,
          turns: [turn],
        });
      }
      expect(path).toContain('/endpoint-smoke/budget-reservations/');
      const demandDigest = digestAgentCanonicalValue(demand);
      expect(JSON.parse(String(init?.body))).toEqual({ demand, demandDigest });
      return jsonResponse({
        reservation: {
          reservationId: 'endpoint-smoke-budget.1',
          demand,
          demandDigest,
          reservedAt: instant,
          status: 'reserved',
        },
        ledgerRevision: 1,
        replayed: false,
      });
    });
    const journal = createEnvironmentAgentEvaluationEndpointSmokeJournal({
      environment,
      fetch: fetchImplementation,
    });
    await expect(
      journal.listTurns({ planDigest: plan.planDigest, repositoryCommit })
    ).resolves.toEqual([turn]);
    await expect(
      journal.reserveBudget({
        plan,
        reservationId: 'endpoint-smoke-budget.1',
        demand,
        demandDigest: digestAgentCanonicalValue(demand),
      })
    ).resolves.toMatchObject({ status: 'reserved' });
  });

  it('rejects a settled reservation without its atomic evidence commit', async () => {
    const demandDigest = digestAgentCanonicalValue(demand);
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        reservation: {
          reservationId: 'endpoint-smoke-budget.1',
          demand,
          demandDigest,
          reservedAt: instant,
          status: 'settled',
          settlement: {
            actual: demand,
            charged: demand,
            requiresReconciliation: false,
            settledAt: instant,
            settlementDigest: digest('settlement'),
          },
        },
        ledgerRevision: 2,
        replayed: true,
      })
    );
    const journal = createEnvironmentAgentEvaluationEndpointSmokeJournal({
      environment,
      fetch: fetchImplementation,
    });
    await expect(
      journal.reserveBudget({
        plan,
        reservationId: 'endpoint-smoke-budget.1',
        demand,
        demandDigest,
      })
    ).rejects.toThrow('journal response is invalid');
  });

  it('rejects a valid receipt paired with a different valid encrypted envelope', async () => {
    const first = spoolFor(aadFor('first'));
    const second = spoolFor(aadFor('second'));
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        aad: first.aad,
        envelope: second.envelope,
        receipt: first.receipt,
      })
    );
    const journal = createEnvironmentAgentEvaluationEndpointSmokeJournal({
      environment,
      fetch: fetchImplementation,
    });
    await expect(
      journal.readEncryptedResultSpool({
        planDigest: plan.planDigest,
        repositoryCommit,
        smokeTargetId: target.smokeTargetId,
        expectedSpoolReceiptDigest: first.receipt.receiptDigest,
      })
    ).rejects.toThrow('journal response is invalid');
  });
});
