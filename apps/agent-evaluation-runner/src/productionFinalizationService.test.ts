import { readFileSync } from 'node:fs';
import {
  digestAgentCanonicalValue,
  type AgentHoldoutExecutionReceipt,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  createEnvironmentAgentEvaluationCoordinatorFinalizationService,
  createEnvironmentAgentEvaluationCoordinatorHoldoutSealer,
} from './productionFinalizationService';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  facts: {
    plan: { value: AgentModelEvaluationPlan };
    holdout: { value: AgentHoldoutExecutionReceipt };
  };
};
const plan = vector.facts.plan.value;
const token = 'finalization-token-0123456789-abcdef';

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: 'g4-finalization-test',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    plan.repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

describe('production bounded finalization services', () => {
  it('recovers a lost intent acknowledgement and reuses the durable millisecond', async () => {
    const completedAt = '2026-01-15T00:00:00.000Z';
    const laterCompletedAt = '2026-01-15T00:00:01.000Z';
    const intent = (replayed: boolean) => ({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      completedAt,
      intentDigest: digestAgentCanonicalValue({
        format: 'prodivix.g4-model-evaluation-finalization-intent',
        version: 1,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        completedAt,
      }),
      replayed,
    });
    let call = 0;
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1) throw new TypeError('lost acknowledgement');
      if (call === 3) {
        return new Response(JSON.stringify({ error: 'intent-conflict' }), {
          status: 409,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      return jsonResponse(intent(true));
    });
    const service =
      createEnvironmentAgentEvaluationCoordinatorFinalizationService({
        environment,
        fetch: fetchImplementation,
      });

    await expect(
      service.resolveIntent({ plan, proposedCompletedAt: completedAt })
    ).resolves.toEqual(intent(true));
    await expect(
      service.resolveIntent({ plan, proposedCompletedAt: laterCompletedAt })
    ).resolves.toEqual(intent(true));
    expect(
      fetchImplementation.mock.calls.map(([request, init]) => ({
        method: init?.method,
        path: new URL(String(request)).pathname.split('/').at(-1),
      }))
    ).toEqual([
      { method: 'PUT', path: 'finalization-intent' },
      { method: 'GET', path: 'finalization-intent' },
      { method: 'PUT', path: 'finalization-intent' },
      { method: 'GET', path: 'finalization-intent' },
    ]);
  });

  it('accepts only a valid server-sealed holdout receipt', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ status: 'sealed', receipt: vector.facts.holdout.value })
    );
    const sealer = createEnvironmentAgentEvaluationCoordinatorHoldoutSealer({
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      sealer.sealIfComplete({ plan, ledger: {} as never })
    ).resolves.toBe('sealed');
    expect(String(fetchImplementation.mock.calls[0]![0])).toContain(
      '/holdout-closure'
    );
  });

  it('preserves a sorted bounded pending holdout projection', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        status: 'pending',
        missingFacts: ['attempt-set', 'checkpoint-set'],
      })
    );
    const sealer = createEnvironmentAgentEvaluationCoordinatorHoldoutSealer({
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      sealer.sealIfComplete({ plan, ledger: {} as never })
    ).resolves.toBe('pending');
  });

  it('strictly decodes inspection and incomplete finalization reports', async () => {
    const inspectionBase = Object.freeze({
      format: 'prodivix.g4-model-evaluation-finalization-inspection' as const,
      version: 1 as const,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      missingFacts: Object.freeze(['human-review-report']),
      reviewedAttempts: Object.freeze([]),
      validatedHumanReviewArtifacts: Object.freeze([]),
      validatedHumanMetricObservations: Object.freeze([]),
    });
    const completedAt = '2026-01-15T00:00:00.000Z';
    const finalizationBase = Object.freeze({
      format: 'prodivix.g4-model-evaluation-finalization' as const,
      version: 1 as const,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      outcome: 'incomplete' as const,
      missingFacts: Object.freeze(['human-review-report']),
      completedAt,
    });
    const responses = [
      {
        ...inspectionBase,
        inspectionDigest: digestAgentCanonicalValue(inspectionBase),
      },
      {
        ...finalizationBase,
        reportDigest: digestAgentCanonicalValue(finalizationBase),
      },
    ];
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse(responses.shift())
    );
    const service =
      createEnvironmentAgentEvaluationCoordinatorFinalizationService({
        environment,
        fetch: fetchImplementation,
      });

    await expect(service.inspect({ plan })).resolves.toMatchObject({
      missingFacts: ['human-review-report'],
    });
    await expect(
      service.finalize({
        plan,
        completedAt,
        reviewLeaseDigest: digestAgentCanonicalValue('review-lease'),
        validatedHumanReviewArtifactDigest:
          digestAgentCanonicalValue('validated-review'),
        validatedHumanMetricObservationSetDigest: digestAgentCanonicalValue({
          validatedHumanMetricObservationDigests: [],
        }),
      })
    ).resolves.toMatchObject({ outcome: 'incomplete' });
  });

  it('rejects unsorted server missing-fact projections', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        status: 'pending',
        missingFacts: ['checkpoint-set', 'attempt-set'],
      })
    );
    const sealer = createEnvironmentAgentEvaluationCoordinatorHoldoutSealer({
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      sealer.sealIfComplete({ plan, ledger: {} as never })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });
});
