import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
  createAgentEvaluationCapabilityEffectProviderJournalHealth,
  createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  digestAgentCanonicalValue,
} from '../packages/ai/src/index.ts';
import { createV8EvaluationPlan } from '../packages/ai/src/__tests__/agentV8Fixtures.ts';
import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  closeG4CapabilityEffectProviderJournalShard,
  readG4CapabilityEffectProviderJournalPlan,
  waitForG4CapabilityEffectProviderJournalHealth,
} from './verify-g4-capability-effect-provider-journal-lifecycle.mjs';

const ownerInstanceId = 'g4.provider-journal.123456789.1.shard.001';
const namespaceId = 'g4-model-evaluation';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const planDigest = digestAgentCanonicalValue({ fixture: 'journal-plan' });
const attemptIds = Object.freeze(['attempt.b', 'attempt.a']);
const startedAt = Date.parse('2026-08-11T00:00:00.000Z');

const health = ({
  owner = ownerInstanceId,
  residualEncryptedSpoolCount = 0,
  expiredEncryptedSpoolCount = 0,
  unfinishedOwnerCount = 0,
  overdueUnfinishedOwnerCount = 0,
  abandonedOwnerCount = 0,
  checkedAt = startedAt,
} = {}) =>
  createAgentEvaluationCapabilityEffectProviderJournalHealth({
    authorityId:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId,
    authorityDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
    ownerInstanceId: owner,
    retentionPolicyDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.retentionPolicyDigest,
    status:
      expiredEncryptedSpoolCount === 0 && overdueUnfinishedOwnerCount === 0
        ? 'healthy'
        : 'unavailable',
    residualEncryptedSpoolCount,
    expiredEncryptedSpoolCount,
    unfinishedOwnerCount,
    overdueUnfinishedOwnerCount,
    abandonedOwnerCount,
    checkedAt: new Date(checkedAt).toISOString(),
    expiresAt: new Date(checkedAt + 125_000).toISOString(),
  });

const advancingClock = () => {
  let now = startedAt + 1_000;
  return Object.freeze({
    clock: () => new Date(now++),
    delay: async (delayMs) => {
      now += delayMs;
    },
  });
};

test('accepts only the exact fresh clean owner-bound journal health', async () => {
  const time = advancingClock();
  const accepted = await waitForG4CapabilityEffectProviderJournalHealth({
    client: { readHealth: async () => health() },
    expectedOwnerInstanceId: ownerInstanceId,
    timeoutMs: 100,
    ...time,
  });
  assert.equal(accepted.ownerInstanceId, ownerInstanceId);
  assert.equal(accepted.unfinishedOwnerCount, 0);

  const dirtyTime = advancingClock();
  await assert.rejects(
    waitForG4CapabilityEffectProviderJournalHealth({
      client: {
        readHealth: async () =>
          health({
            residualEncryptedSpoolCount: 1,
            unfinishedOwnerCount: 1,
          }),
      },
      expectedOwnerInstanceId: ownerInstanceId,
      timeoutMs: 3,
      ...dirtyTime,
    }),
    /exact clean health terminus/u
  );

  const swappedTime = advancingClock();
  await assert.rejects(
    waitForG4CapabilityEffectProviderJournalHealth({
      client: {
        readHealth: async () => health({ owner: `${ownerInstanceId}.swap` }),
      },
      expectedOwnerInstanceId: ownerInstanceId,
      timeoutMs: 3,
      ...swappedTime,
    }),
    /exact clean health terminus/u
  );
});

test('reconciles cleanup ACK loss, proves every attempt zero, and seals one lifecycle digest', async () => {
  const time = advancingClock();
  const cleanupCalls = new Map();
  const zeroCalls = new Map();
  const client = {
    async cleanup(request) {
      const count = (cleanupCalls.get(request.attemptId) ?? 0) + 1;
      cleanupCalls.set(request.attemptId, count);
      if (count === 1) return undefined;
      return createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt(
        {
          requestDigest: request.requestDigest,
          destroyedEncryptedSpoolCount: 0,
          abandonmentDispositionReceiptDigests: Object.freeze([]),
          abandonmentRecordDigests: Object.freeze([]),
          residualEncryptedSpoolCount: 0,
          unfinishedOwnerCount: 0,
          completedAt: request.requestedAt,
        }
      );
    },
    async readZeroResidual(attemptId) {
      zeroCalls.set(attemptId, (zeroCalls.get(attemptId) ?? 0) + 1);
      return createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
        {
          namespaceId,
          planDigest,
          repositoryCommit,
          attemptId,
          journalAuthorityDigest:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
          residualEncryptedSpoolCount: 0,
          unfinishedOwnerCount: 0,
          abandonedSpoolCount: 0,
          abandonedOwnerCount: 0,
          checkedAt: new Date(startedAt).toISOString(),
          expiresAt: new Date(startedAt + 125_000).toISOString(),
        }
      );
    },
    async readHealth() {
      return health({ abandonedOwnerCount: 1 });
    },
  };
  const result = await closeG4CapabilityEffectProviderJournalShard({
    client,
    scope: { namespaceId, planDigest, repositoryCommit },
    attemptIds,
    expectedOwnerInstanceId: ownerInstanceId,
    timeoutMs: 1_000,
    ...time,
  });
  assert.equal(result.attemptCount, 2);
  assert.match(result.lifecycleDigest, /^sha256-[0-9a-f]{64}$/u);
  assert.deepEqual([...cleanupCalls.keys()], ['attempt.a', 'attempt.b']);
  assert.deepEqual([...cleanupCalls.values()], [2, 2]);
  assert.deepEqual([...zeroCalls.keys()], ['attempt.a', 'attempt.b']);
});

test('fails closed on duplicate attempts and a missing per-attempt zero receipt', async () => {
  const base = {
    scope: { namespaceId, planDigest, repositoryCommit },
    expectedOwnerInstanceId: ownerInstanceId,
    timeoutMs: 10,
  };
  await assert.rejects(
    closeG4CapabilityEffectProviderJournalShard({
      ...base,
      client: {},
      attemptIds: ['attempt.a', 'attempt.a'],
    }),
    /cleanup authority is invalid/u
  );

  const time = advancingClock();
  await assert.rejects(
    closeG4CapabilityEffectProviderJournalShard({
      ...base,
      attemptIds: ['attempt.a'],
      client: {
        async cleanup(request) {
          return createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt(
            {
              requestDigest: request.requestDigest,
              destroyedEncryptedSpoolCount: 0,
              abandonmentDispositionReceiptDigests: Object.freeze([]),
              abandonmentRecordDigests: Object.freeze([]),
              residualEncryptedSpoolCount: 0,
              unfinishedOwnerCount: 0,
              completedAt: request.requestedAt,
            }
          );
        },
        async readZeroResidual() {
          return undefined;
        },
        async readHealth() {
          return health();
        },
      },
      ...time,
    }),
    /zero-residual receipt.*did not reconcile/u
  );
});

test('reads only a stable O_NOFOLLOW exact canonical production plan', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'g4-provider-journal-plan-'));
  try {
    const canonicalPath = join(directory, 'plan.json');
    const nonCanonicalPath = join(directory, 'plan.pretty.json');
    const plan = createV8EvaluationPlan();
    await writeFile(canonicalPath, canonicalJsonText(plan), 'utf8');
    await writeFile(nonCanonicalPath, JSON.stringify(plan, null, 2), 'utf8');
    assert.equal(
      (await readG4CapabilityEffectProviderJournalPlan(canonicalPath))
        .planDigest,
      plan.planDigest
    );
    await assert.rejects(
      readG4CapabilityEffectProviderJournalPlan(nonCanonicalPath),
      /exact canonical JSON/u
    );
    await assert.rejects(
      readG4CapabilityEffectProviderJournalPlan('plan.json'),
      /plan path is invalid/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
