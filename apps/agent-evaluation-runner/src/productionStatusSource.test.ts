import { readFileSync } from 'node:fs';
import {
  digestAgentCanonicalValue,
  planAgentModelEvaluationAttempts,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { createProductionAgentEvaluationCoordinatorStatusSource } from './productionStatusSource';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as { facts: { plan: { value: AgentModelEvaluationPlan } } };
const plan = vector.facts.plan.value;
const observedAt = '2026-08-08T01:02:05.000Z';
const namespace = 'evaluation.status.test';
const token = 'ledger-token-value-0123456789-abcdef';
const shardId = planAgentModelEvaluationAttempts(plan)[0]?.shardId;

if (shardId === undefined) throw new Error('fixture must contain one shard');

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespace,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    plan.repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const statusResponse = (selectedShardId?: string): Record<string, unknown> => {
  const plannedAttemptCount = planAgentModelEvaluationAttempts(plan).filter(
    (descriptor) =>
      selectedShardId === undefined || descriptor.shardId === selectedShardId
  ).length;
  const base = {
    format: 'prodivix.g4-model-evaluation-status',
    version: 1,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    ...(selectedShardId === undefined ? {} : { shardId: selectedShardId }),
    plannedAttemptCount,
    recordedAttemptCount: 0,
    missingAttemptCount: plannedAttemptCount,
    missingAttemptSetDigest: digestAgentCanonicalValue([]),
    attemptStatusCounts: {},
    checkpointCounts: {},
    unsettledBudgetReservationCount: 0,
    endpointSmokeDispatchIntentCount: 0,
    endpointSmokeTransportReceiptCount: 0,
    endpointSmokeResultSpoolReceiptCount: 0,
    endpointSmokeResultSpoolDispositionReceiptCount: 0,
    endpointSmokeValidationFailureReceiptCount: 0,
    endpointSmokeReceiptCount: 0,
    transportDispatchIntentCount: 0,
    transportReceiptCount: 0,
    providerResultSpoolReceiptCount: 0,
    providerResultSpoolDispositionReceiptCount: 0,
    invocationTurnReceiptCount: 0,
    invocationTurnSetReceiptCount: 0,
    resultSubmissionReceiptCount: 0,
    controlledRuntimeReceiptCount: 0,
    capabilityExecutionReceiptCount: 0,
    verificationAttemptGrantReceiptCount: 0,
    reviewRasterScanReceiptCount: 0,
    reviewCandidateRefCount: 0,
    blindReviewMappingRefCount: 0,
    validatedHumanReviewArtifactCount: 0,
    validatedHumanMetricObservationCount: 0,
    sourceReceiptCount: 0,
    executionReceiptCount: 0,
    readyForFinalization: false,
    observedAt,
  };
  return {
    ...base,
    statusDigest: digestAgentCanonicalValue(base),
  };
};

const response = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const expectResponseInvalid = async (operation: Promise<unknown>) => {
  await expect(operation).rejects.toMatchObject({
    code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
  });
};

describe('production bounded coordinator status source', () => {
  it('loads the exact whole-run and shard-bound Backend projections', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (url) =>
      response(
        new URL(String(url)).searchParams.has('shardId')
          ? statusResponse(shardId)
          : statusResponse()
      )
    );
    const source = createProductionAgentEvaluationCoordinatorStatusSource({
      environment,
      fetch: fetchImplementation,
    });

    await expect(source.load({ plan, observedAt })).resolves.toEqual(
      statusResponse()
    );
    await expect(source.load({ plan, shardId, observedAt })).resolves.toEqual(
      statusResponse(shardId)
    );

    const prefix = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespace}/${plan.planDigest}/${plan.repositoryCommit}/status`;
    expect(fetchImplementation.mock.calls.map(([url]) => String(url))).toEqual([
      `${prefix}?observedAt=2026-08-08T01%3A02%3A05.000Z`,
      `${prefix}?observedAt=2026-08-08T01%3A02%3A05.000Z&shardId=${encodeURIComponent(shardId)}`,
    ]);
  }, 20_000);

  it.each([
    ['an array', []],
    [
      'a swapped plan partition',
      { ...statusResponse(), planDigest: digestAgentCanonicalValue('swapped') },
    ],
    [
      'a swapped repository partition',
      { ...statusResponse(), repositoryCommit: 'f'.repeat(40) },
    ],
    [
      'a different observation instant',
      { ...statusResponse(), observedAt: '2026-08-08T01:02:05.001Z' },
    ],
    ['an unexpected aggregate shard', { ...statusResponse(), shardId }],
  ])('rejects %s before coordinator validation', async (_label, body) => {
    const source = createProductionAgentEvaluationCoordinatorStatusSource({
      environment,
      fetch: vi.fn<typeof fetch>(async () => response(body)),
    });
    await expectResponseInvalid(source.load({ plan, observedAt }));
  });

  it('requires the exact requested shard in the response', async () => {
    const responses = [statusResponse(), statusResponse(`${shardId}:other`)];
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      response(responses.shift())
    );
    const source = createProductionAgentEvaluationCoordinatorStatusSource({
      environment,
      fetch: fetchImplementation,
    });

    await expectResponseInvalid(source.load({ plan, shardId, observedAt }));
    await expectResponseInvalid(source.load({ plan, shardId, observedAt }));
  }, 20_000);

  it('rejects an environment repository outside the requested partition', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const source = createProductionAgentEvaluationCoordinatorStatusSource({
      environment: {
        ...environment,
        [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
          'f'.repeat(40),
      },
      fetch: fetchImplementation,
    });

    await expectResponseInvalid(source.load({ plan, observedAt }));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
