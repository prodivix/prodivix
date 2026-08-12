import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
} from '../packages/ai/src/index.ts';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding } from '../apps/agent-evaluation-runner/src/productionSharedEffectHostedOwner.ts';
import { waitForG4HostedRetrievalRuntimeResourceOwnerHealth } from './verify-g4-hosted-retrieval-runtime-resource-health.mjs';

const namespaceId = 'g4-model-evaluation';
const startedAt = Date.parse('2026-08-11T00:00:00.000Z');
const binding =
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
    namespaceId
  );

const health = ({
  unfinishedCleanupCount = 0,
  overdueCount = 0,
  checkedAt = startedAt,
} = {}) => {
  const checkedAtText = new Date(checkedAt).toISOString();
  const storageSummary =
    createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
      namespaceId,
      schemaContractDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
      ledgerRevision: 1,
      registrationCount: 4,
      activeResourceCount: 4,
      activeReadLeaseCount: 0,
      unfinishedCleanupCount,
      overdueCount,
      summarizedAt: checkedAtText,
    });
  return createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
    namespaceId: binding.namespaceId,
    ownerAuthorityIssuerId: binding.ownerAuthorityIssuerId,
    implementationDigest: binding.implementationDigest,
    schemaContractDigest: binding.schemaContractDigest,
    supportedOperations:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
    storageSummary,
    storageSummaryDigest: storageSummary.summaryDigest,
    checkedAt: checkedAtText,
    expiresAt: new Date(checkedAt + 125_000).toISOString(),
  });
};

const advancingClock = () => {
  let now = startedAt + 1_000;
  return Object.freeze({
    clock: () => new Date(now++),
    delay: async (delayMs) => {
      now += delayMs;
    },
  });
};

test('accepts the exact fresh clean hosted resource owner health', async () => {
  const time = advancingClock();
  const receipt = await waitForG4HostedRetrievalRuntimeResourceOwnerHealth({
    client: { readOwnerHealth: async () => health() },
    binding,
    timeoutMs: 100,
    ...time,
  });
  assert.equal(receipt.namespaceId, namespaceId);
  assert.equal(receipt.storageSummary.unfinishedCleanupCount, 0);
  assert.equal(receipt.storageSummary.overdueCount, 0);
});

test('rejects unfinished cleanup, overdue storage, binding, and freshness drift', async () => {
  for (const candidate of [
    health({ unfinishedCleanupCount: 1 }),
    health({ overdueCount: 1 }),
    health({ checkedAt: startedAt - 126_000 }),
  ]) {
    const time = advancingClock();
    await assert.rejects(
      waitForG4HostedRetrievalRuntimeResourceOwnerHealth({
        client: { readOwnerHealth: async () => candidate },
        binding,
        timeoutMs: 2,
        ...time,
      }),
      /did not reach exact clean preactivation health/u
    );
  }

  const time = advancingClock();
  await assert.rejects(
    waitForG4HostedRetrievalRuntimeResourceOwnerHealth({
      client: { readOwnerHealth: async () => health() },
      binding: { ...binding, namespaceId: 'foreign-namespace' },
      timeoutMs: 2,
      ...time,
    }),
    /did not reach exact clean preactivation health/u
  );
});
