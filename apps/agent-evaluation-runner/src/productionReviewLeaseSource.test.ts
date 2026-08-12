import { readFileSync } from 'node:fs';
import {
  digestAgentCanonicalValue,
  planAgentModelEvaluationAttempts,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createEnvironmentAgentEvaluationCoordinatorReviewLeaseSource } from './productionReviewLeaseSource';

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
const digest = (value: unknown): string => digestAgentCanonicalValue(value);
const token = 'review-lease-token-0123456789-abcdef';
const namespace = 'g4-review-lease-test';

const eligibleCount = (): number => {
  const cases = new Set(
    plan.concreteCases
      .filter(
        ({ access, subjectiveVisualQuality }) =>
          access === 'public' && subjectiveVisualQuality
      )
      .map(({ caseId }) => caseId)
  );
  return planAgentModelEvaluationAttempts(plan).filter(({ caseId }) =>
    cases.has(caseId)
  ).length;
};

const reviewLease = () => {
  const count = eligibleCount();
  const roots = Object.freeze({
    machinePhaseDigest: digest('machine-phase'),
    eligibleAttemptSetDigest: digest('eligible-attempts'),
    invocationTurnReceiptSetDigest: digest('turns'),
    invocationTurnSetReceiptSetDigest: digest('turn-sets'),
    executionReceiptSetDigest: digest('execution'),
    reviewRasterScanReceiptSetDigest: digest('raster-scans'),
    reviewCandidateRefSetDigest: digest('candidate-refs'),
    blindReviewMappingSetDigest: digest('mapping-refs'),
  });
  const families = Object.freeze(
    [
      ['attempts', roots.eligibleAttemptSetDigest],
      ['invocationTurnReceipts', roots.invocationTurnReceiptSetDigest],
      ['invocationTurnSetReceipts', roots.invocationTurnSetReceiptSetDigest],
      ['executionReceipts', roots.executionReceiptSetDigest],
      ['reviewRasterScanReceipts', roots.reviewRasterScanReceiptSetDigest],
      ['reviewCandidateRefs', roots.reviewCandidateRefSetDigest],
    ].map(([family, expectedSemanticDigest], familyIndex) =>
      Object.freeze({
        family,
        familyIndex,
        expectedRecordCount: count,
        expectedRecordSetDigest: digest({ family, records: [] }),
        expectedSemanticDigest,
        expectedTotalBytes: 1,
        firstOrderKey: `["${family}","first"]`,
        lastOrderKey: `["${family}","last"]`,
      })
    )
  );
  const createdAt = plan.plannedAt;
  const expiresAt = new Date(
    Date.parse(createdAt) + 60 * 60 * 1_000
  ).toISOString();
  const base = Object.freeze({
    format: 'prodivix.g4-model-evaluation-review-lease' as const,
    version: 1 as const,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    ...roots,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    createdAt,
    expiresAt,
  });
  return Object.freeze({
    ...base,
    leaseId: 'evaluation-review-lease:test',
    reviewLeaseDigest: digest(base),
    families,
    totalRecordCount: count * families.length,
    totalRecordBytes: families.length,
    replayed: false,
  });
};

const sourceWith = (fetchImplementation: typeof fetch) =>
  createEnvironmentAgentEvaluationCoordinatorReviewLeaseSource({
    environment: {
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
        AGENT_EVALUATION_LEDGER_BASE_URL,
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespace,
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
        plan.repositoryCommit,
      [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
    },
    fetch: fetchImplementation,
  });

const jsonResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

describe('production bounded review lease source', () => {
  it('rejects a lease whose canonical digest was replaced', async () => {
    const lease = reviewLease();
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ...lease, reviewLeaseDigest: digest('drifted-lease') })
    );

    await expect(
      sourceWith(fetchImplementation).open({ plan })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('checks an imported review lease digest before reading any family page', async () => {
    const lease = reviewLease();
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      jsonResponse(lease)
    );

    await expect(
      sourceWith(fetchImplementation).open({
        plan,
        expectedReviewLeaseDigest: digest('another-review-lease'),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  }, 20_000);
});
