import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  digestAgentCanonicalValue,
  doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest,
  isAgentControlIdentity,
  isAgentEvaluationCapabilityEffectProviderJournalHealth,
  isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  isAgentModelEvaluationPlan,
  planAgentModelEvaluationAttempts,
} from '../packages/ai/src/index.ts';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';
import {
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient,
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader,
} from '../apps/agent-evaluation-runner/src/productionCapabilityEffectProviderJournalClient.ts';

const MAXIMUM_PLAN_BYTES = 16_777_216;
const MAXIMUM_TIMEOUT_MS = 120_000;
const MAXIMUM_PARALLEL_REQUESTS = 12;
const RETRY_DELAY_MS = 100;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

const fail = (message) => {
  throw new Error(message);
};

const canonicalInstant = (date, label) => {
  const epochMs = date instanceof Date ? date.getTime() : Number.NaN;
  if (!Number.isFinite(epochMs)) fail(`${label} clock is invalid.`);
  const value = new Date(epochMs).toISOString();
  if (Date.parse(value) !== epochMs)
    fail(`${label} clock is not millisecond exact.`);
  return value;
};

const validateTimeout = (timeoutMs) => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUM_TIMEOUT_MS
  ) {
    fail('Capability-effect Provider journal timeout is invalid.');
  }
  return timeoutMs;
};

const wait = (delayMs) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));

const assertHealth = ({
  health,
  expectedOwnerInstanceId,
  requireFreshOwner,
  nowEpochMs,
}) => {
  if (
    !isAgentEvaluationCapabilityEffectProviderJournalHealth(health) ||
    health.ownerInstanceId !== expectedOwnerInstanceId ||
    health.status !== 'healthy' ||
    health.residualEncryptedSpoolCount !== 0 ||
    health.expiredEncryptedSpoolCount !== 0 ||
    health.unfinishedOwnerCount !== 0 ||
    health.overdueUnfinishedOwnerCount !== 0 ||
    (requireFreshOwner && health.abandonedOwnerCount !== 0) ||
    Date.parse(health.checkedAt) > nowEpochMs + 30_000 ||
    nowEpochMs >= Date.parse(health.expiresAt)
  ) {
    return undefined;
  }
  return health;
};

export const waitForG4CapabilityEffectProviderJournalHealth = async ({
  client,
  expectedOwnerInstanceId,
  timeoutMs,
  requireFreshOwner = true,
  clock = () => new Date(),
  delay = wait,
}) => {
  if (
    !client ||
    typeof client.readHealth !== 'function' ||
    !isAgentControlIdentity(expectedOwnerInstanceId) ||
    typeof clock !== 'function' ||
    typeof delay !== 'function'
  ) {
    fail('Capability-effect Provider journal health authority is invalid.');
  }
  const boundedTimeoutMs = validateTimeout(timeoutMs);
  const startedAt = clock().getTime();
  if (!Number.isFinite(startedAt)) {
    fail('Capability-effect Provider journal health clock is invalid.');
  }
  const deadline = startedAt + boundedTimeoutMs;
  while (clock().getTime() <= deadline) {
    const health = await client.readHealth();
    const nowEpochMs = clock().getTime();
    const accepted = assertHealth({
      health,
      expectedOwnerInstanceId,
      requireFreshOwner,
      nowEpochMs,
    });
    if (accepted) return accepted;
    const remaining = deadline - nowEpochMs;
    if (remaining <= 0) break;
    await delay(Math.min(RETRY_DELAY_MS, remaining));
  }
  fail(
    'Capability-effect Provider journal did not reach its exact clean health terminus.'
  );
};

const retryUntil = async ({ operation, deadline, clock, delay, label }) => {
  while (clock().getTime() <= deadline) {
    const value = await operation();
    if (value !== undefined) return value;
    const remaining = deadline - clock().getTime();
    if (remaining <= 0) break;
    await delay(Math.min(RETRY_DELAY_MS, remaining));
  }
  fail(`${label} did not reconcile before the bounded deadline.`);
};

const mapBounded = async (values, operation) => {
  let cursor = 0;
  const results = new Array(values.length);
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAXIMUM_PARALLEL_REQUESTS, values.length) },
      worker
    )
  );
  return results;
};

export const closeG4CapabilityEffectProviderJournalShard = async ({
  client,
  scope,
  attemptIds,
  expectedOwnerInstanceId,
  timeoutMs,
  clock = () => new Date(),
  delay = wait,
}) => {
  if (
    !client ||
    typeof client.cleanup !== 'function' ||
    typeof client.readZeroResidual !== 'function' ||
    typeof client.readHealth !== 'function' ||
    !scope ||
    !isAgentControlIdentity(scope.namespaceId) ||
    typeof scope.planDigest !== 'string' ||
    !/^sha256-[0-9a-f]{64}$/u.test(scope.planDigest) ||
    typeof scope.repositoryCommit !== 'string' ||
    !COMMIT_PATTERN.test(scope.repositoryCommit) ||
    !Array.isArray(attemptIds) ||
    attemptIds.length === 0 ||
    attemptIds.some((attemptId) => !isAgentControlIdentity(attemptId)) ||
    new Set(attemptIds).size !== attemptIds.length ||
    !isAgentControlIdentity(expectedOwnerInstanceId) ||
    typeof clock !== 'function' ||
    typeof delay !== 'function'
  ) {
    fail(
      'Capability-effect Provider journal shard cleanup authority is invalid.'
    );
  }
  const boundedTimeoutMs = validateTimeout(timeoutMs);
  const startedAt = clock().getTime();
  if (!Number.isFinite(startedAt)) {
    fail('Capability-effect Provider journal shard cleanup clock is invalid.');
  }
  const deadline = startedAt + boundedTimeoutMs;
  const canonicalAttemptIds = Object.freeze(
    [...attemptIds].sort(compareUnicodeCodePoints)
  );
  const cleanupReceipts = await mapBounded(
    canonicalAttemptIds,
    async (attemptId) => {
      const request =
        createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest({
          ...scope,
          attemptId,
          reason: 'cleanup-requested',
          requestedAt: canonicalInstant(
            clock(),
            'Capability-effect Provider journal cleanup request'
          ),
        });
      const receipt = await retryUntil({
        operation: () => client.cleanup(request),
        deadline,
        clock,
        delay,
        label: `Capability-effect Provider journal cleanup for ${attemptId}`,
      });
      if (
        !doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest(
          request,
          receipt
        ) ||
        receipt.residualEncryptedSpoolCount !== 0 ||
        receipt.unfinishedOwnerCount !== 0
      ) {
        fail('Capability-effect Provider journal cleanup receipt is invalid.');
      }
      return receipt;
    }
  );
  const zeroReceipts = await mapBounded(
    canonicalAttemptIds,
    async (attemptId) => {
      const receipt = await retryUntil({
        operation: () => client.readZeroResidual(attemptId),
        deadline,
        clock,
        delay,
        label: `Capability-effect Provider journal zero-residual receipt for ${attemptId}`,
      });
      if (
        !isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
          receipt
        ) ||
        receipt.namespaceId !== scope.namespaceId ||
        receipt.planDigest !== scope.planDigest ||
        receipt.repositoryCommit !== scope.repositoryCommit ||
        receipt.attemptId !== attemptId ||
        receipt.residualEncryptedSpoolCount !== 0 ||
        receipt.unfinishedOwnerCount !== 0
      ) {
        fail(
          'Capability-effect Provider journal zero-residual receipt is invalid.'
        );
      }
      return receipt;
    }
  );
  const remaining = deadline - clock().getTime();
  if (remaining < 1) {
    fail(
      'Capability-effect Provider journal owner zero-residual health deadline elapsed.'
    );
  }
  const health = await waitForG4CapabilityEffectProviderJournalHealth({
    client,
    expectedOwnerInstanceId,
    timeoutMs: remaining,
    requireFreshOwner: false,
    clock,
    delay,
  });
  return Object.freeze({
    attemptCount: canonicalAttemptIds.length,
    healthDigest: health.healthDigest,
    lifecycleDigest: digestAgentCanonicalValue({
      namespaceId: scope.namespaceId,
      planDigest: scope.planDigest,
      repositoryCommit: scope.repositoryCommit,
      ownerInstanceId: expectedOwnerInstanceId,
      cleanupReceiptDigests: cleanupReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
      zeroResidualReceiptDigests: zeroReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
      healthDigest: health.healthDigest,
    }),
  });
};

export const readG4CapabilityEffectProviderJournalPlan = async (path) => {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    fail('Capability-effect Provider journal plan path is invalid.');
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.size < 1 ||
      before.size > MAXIMUM_PLAN_BYTES
    ) {
      fail(
        'Capability-effect Provider journal plan file authority is invalid.'
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      bytes.byteLength !== before.size ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      fail('Capability-effect Provider journal plan file changed during read.');
    }
    const parsed = parseStrictJsonDocument(bytes, {
      documentKind: 'contribution',
      maxBytes: MAXIMUM_PLAN_BYTES,
      maxDepth: 128,
      maxNodes: 2_000_000,
    });
    if (
      !parsed.ok ||
      canonicalJsonText(parsed.value) !== bytes.toString('utf8') ||
      !isAgentModelEvaluationPlan(parsed.value)
    ) {
      fail(
        'Capability-effect Provider journal plan is not exact canonical JSON.'
      );
    }
    return parsed.value;
  } finally {
    await handle.close();
  }
};

const createClientForPlan = (plan, environment = process.env) =>
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient(
    {
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      environment,
    }
  );

const environmentOwnerInstanceId = () =>
  process.env[
    PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
  ];

const runCli = async () => {
  const [command, timeoutSource] = process.argv.slice(2);
  const timeoutMs = Number(timeoutSource);
  const ownerInstanceId = environmentOwnerInstanceId();
  if (command === 'health') {
    const health = await waitForG4CapabilityEffectProviderJournalHealth({
      client:
        createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader(),
      expectedOwnerInstanceId: ownerInstanceId,
      timeoutMs,
      requireFreshOwner: true,
    });
    process.stdout.write(`${health.healthDigest}\n`);
    return;
  }
  if (command === 'cleanup-shard') {
    const planPath = resolve(
      process.env.PRODIVIX_G4_MODEL_EVAL_PLAN_PATH ?? ''
    );
    const plan = await readG4CapabilityEffectProviderJournalPlan(planPath);
    const client = createClientForPlan(plan);
    const shardId = process.env.SHARD_ID;
    if (!isAgentControlIdentity(shardId)) {
      fail('Capability-effect Provider journal shard identity is invalid.');
    }
    const attemptIds = planAgentModelEvaluationAttempts(plan)
      .filter((descriptor) => descriptor.shardId === shardId)
      .map(({ attemptId }) => attemptId);
    const result = await closeG4CapabilityEffectProviderJournalShard({
      client,
      scope: {
        namespaceId: process.env.PRODIVIX_G4_MODEL_EVAL_NAMESPACE,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
      },
      attemptIds,
      expectedOwnerInstanceId: ownerInstanceId,
      timeoutMs,
    });
    process.stdout.write(`${result.lifecycleDigest}\n`);
    return;
  }
  fail('Capability-effect Provider journal lifecycle command is invalid.');
};

const invokedPath = process.argv[1];
if (
  typeof invokedPath === 'string' &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runCli().catch((caught) => {
    process.stderr.write(
      `${caught instanceof Error ? caught.message : 'Capability-effect Provider journal lifecycle failed closed.'}\n`
    );
    process.exitCode = 1;
  });
}
