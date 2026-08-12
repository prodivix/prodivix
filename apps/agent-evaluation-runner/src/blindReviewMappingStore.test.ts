import { readFileSync } from 'node:fs';
import {
  digestAgentCanonicalValue,
  type AgentEvaluationReviewCandidateRef,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { createEnvironmentAgentEvaluationBlindReviewMappingStore } from './blindReviewMappingStore';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';

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
const token = 'ledger-token-value-0123456789-abcdef';
const rubricDigest = digestAgentCanonicalValue('public-review-rubric');
const bytesDigest = digestAgentCanonicalValue('safe-raster');
const candidateDigest = digestAgentCanonicalValue('review-candidate');
const candidateRef: AgentEvaluationReviewCandidateRef = Object.freeze({
  candidateId: `review-candidate:${candidateDigest.slice('sha256-'.length)}`,
  attemptId: `evaluation-attempt:${digestAgentCanonicalValue('attempt').slice('sha256-'.length)}`,
  planDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
  descriptorDigest: digestAgentCanonicalValue('descriptor'),
  responseDigest: digestAgentCanonicalValue('response'),
  executionReceiptDigest: digestAgentCanonicalValue('execution'),
  graderArtifactDigest: digestAgentCanonicalValue('grader'),
  projectionAuthorityDigest: digestAgentCanonicalValue('projection-authority'),
  mediaType: 'image/png',
  width: 1,
  height: 1,
  bytesDigest,
  byteLength: 1,
  publicArtifactScanDigest: digestAgentCanonicalValue('scan'),
  generatedAt: plan.plannedAt,
  candidateDigest,
});
const randomizedPresentationId = `blind-review:${Buffer.alloc(32).toString('base64url')}`;

const mapping = () => {
  const base = Object.freeze({
    format: 'prodivix.g4-model-evaluation-blind-review-mapping' as const,
    version: 1 as const,
    mappingId: `blind-mapping:${digestAgentCanonicalValue('mapping-id').slice('sha256-'.length)}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    candidateId: candidateRef.candidateId,
    attemptId: candidateRef.attemptId,
    candidateDigest: candidateRef.candidateDigest,
    bytesDigest: candidateRef.bytesDigest,
    rubricDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    randomizedPresentationId,
    createdAt: plan.plannedAt,
  });
  return Object.freeze({
    ...base,
    mappingDigest: digestAgentCanonicalValue(base),
  });
};

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: 'evaluation.test',
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    plan.repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const response = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });

describe('HTTP blind review mapping store', () => {
  it('creates and reloads only the Backend-owned exact mapping', async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method?: string }> =
      [];
    const fetchImplementation = vi.fn<typeof fetch>(async (_url, init) => {
      calls.push({ body: init?.body, method: init?.method });
      return init?.method === 'PUT'
        ? response({ fact: mapping(), replayed: false }, 201)
        : response({ fact: mapping() });
    });
    const store = createEnvironmentAgentEvaluationBlindReviewMappingStore({
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      store.getOrCreate({
        plan,
        candidateRef,
        rubricDigest,
        createdAt: plan.plannedAt,
      })
    ).resolves.toEqual(mapping());
    await expect(
      store.load({ plan, candidateRef, rubricDigest })
    ).resolves.toEqual(mapping());
    expect(calls).toEqual([
      { body: undefined, method: 'PUT' },
      { body: undefined, method: 'GET' },
    ]);
  });

  it('rejects response-envelope drift and a swapped candidate mapping', async () => {
    const envelopeDrift =
      createEnvironmentAgentEvaluationBlindReviewMappingStore({
        environment,
        fetch: vi.fn<typeof fetch>(async () =>
          response({ fact: mapping(), replayed: false })
        ),
      });
    await expect(
      envelopeDrift.load({ plan, candidateRef, rubricDigest })
    ).rejects.toThrow(TypeError);

    const valid = mapping();
    const { mappingDigest: _mappingDigest, ...base } = valid;
    const swappedBase = Object.freeze({
      ...base,
      candidateId: 'review-candidate:swapped',
    });
    const swapped = Object.freeze({
      ...swappedBase,
      mappingDigest: digestAgentCanonicalValue(swappedBase),
    });
    const mappingSwap = createEnvironmentAgentEvaluationBlindReviewMappingStore(
      {
        environment,
        fetch: vi.fn<typeof fetch>(async () => response({ fact: swapped })),
      }
    );
    await expect(
      mappingSwap.load({ plan, candidateRef, rubricDigest })
    ).rejects.toThrow(TypeError);
  });
});
