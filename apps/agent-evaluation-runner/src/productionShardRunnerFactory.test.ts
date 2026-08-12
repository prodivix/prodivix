import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planAgentModelEvaluationAttempts } from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentEvaluationCoordinatorFilePort,
  AgentEvaluationCoordinatorLedger,
} from './coordinator';
import type {
  AgentEvaluationDurableAttemptExecutorFactory,
  AgentEvaluationDurableShardLedger,
} from './durableShardRunner';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME } from './productionSignerFactory';
import { AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES } from './productionRunConfigArtifact';
import {
  AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES,
  createProductionAgentEvaluationAttemptExecutorFactorySource,
  createProductionAgentEvaluationCoordinatorShardRunnerFactory,
  createProductionAgentEvaluationShardWorkerOwnerId,
} from './productionShardRunnerFactory';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import type { AgentEvaluationVerificationAttemptGrantIssuer } from './verificationAttemptGrantClient';

const exampleText = readFileSync(
  new URL(
    '../../../specs/evaluation/g4-real-model-evaluation.example.json',
    import.meta.url
  ),
  'utf8'
);
const fixedInstant = '2026-08-08T00:00:00.000Z';
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const configPath = resolve('state', 'production-run-config.json');

const productionSource = (): unknown =>
  materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(exampleText) as Record<string, unknown>
  );

const config = requireProductionAgentEvaluationFrozenRunConfig(
  decodeAgentEvaluationFrozenRunConfig(productionSource(), {
    clock: () => fixedInstant,
    expectedRepositoryCommit: exactCommit,
  }),
  exactCommit
);
const descriptor = planAgentModelEvaluationAttempts(config.plan)[0];
if (!descriptor) throw new Error('fixture must contain one descriptor');

const environment = Object.freeze({
  [AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME]: configPath,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
    'g4-plan-123456789-2',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]: `sha256:${'a'.repeat(64)}`,
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
    '123456789',
  [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
    '2',
  [AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.runId]: '123456789',
  [AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.runAttempt]: '2',
  [AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.jobId]: 'full_shards',
});

const files = (): AgentEvaluationCoordinatorFilePort => ({
  readJson: vi.fn(async () => productionSource()),
  readCanonicalJson: vi.fn(async () => productionSource()),
  writeCanonicalJson: vi.fn(async () => undefined),
  createCanonicalJson: vi.fn(async () => undefined),
});

const executorFactory = Object.freeze({
  estimateShard: vi.fn(),
  prepareVerificationAttemptGrants: vi.fn(),
  createPreDispatchAttemptFinalizer: vi.fn(),
  create: vi.fn(),
}) as unknown as AgentEvaluationDurableAttemptExecutorFactory;

const grantIssuer = Object.freeze({
  issue: vi.fn(),
  list: vi.fn(),
}) as unknown as AgentEvaluationVerificationAttemptGrantIssuer;

const coordinatorLedger = Object.freeze(
  {}
) as unknown as AgentEvaluationCoordinatorLedger;

describe('production durable shard runner composition', () => {
  it('rejects an incomplete external authority set before provider composition', async () => {
    const source = createProductionAgentEvaluationAttemptExecutorFactorySource({
      authorities: Object.freeze({
        load: async () => Object.freeze({}) as never,
      }),
    });

    await expect(
      source.create({ config, plan: config.plan })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
  });

  it('derives an exact restart-stable worker owner identity', () => {
    expect(
      createProductionAgentEvaluationShardWorkerOwnerId(
        environment,
        descriptor.shardId
      )
    ).toBe(`g4.eval.123456789.2.full_shards.${descriptor.shardId}`);
    expect(() =>
      createProductionAgentEvaluationShardWorkerOwnerId(
        { ...environment, GITHUB_RUN_ATTEMPT: '0' },
        descriptor.shardId
      )
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
      })
    );
  });

  it('reloads the frozen config and starts the durable HTTP runner with exact settings', async () => {
    const filePort = files();
    const sourceCreate = vi.fn(async () => executorFactory);
    const createLedger = vi.fn(
      () =>
        Object.freeze({
          namespaceId: 'evaluation.production.test',
        }) as unknown as AgentEvaluationDurableShardLedger
    );
    const run = vi.fn(async () =>
      Object.freeze({ ok: false, reason: 'executor-failed' as const })
    );
    const createDurableRunner = vi.fn(() => Object.freeze({ run }));
    const createGrantIssuer = vi.fn(() => grantIssuer);
    const factory =
      createProductionAgentEvaluationCoordinatorShardRunnerFactory({
        files: filePort,
        environment,
        now: () => fixedInstant,
        attemptExecutorFactorySource: Object.freeze({ create: sourceCreate }),
        createLedger,
        createVerificationAttemptGrantIssuer: createGrantIssuer,
        createDurableRunner,
      });

    const result = await factory
      .create({
        partition: {
          planDigest: config.plan.planDigest,
          repositoryCommit: config.plan.repositoryCommit,
        },
        ledger: coordinatorLedger,
      })
      .run({ plan: config.plan, shardId: descriptor.shardId });

    expect(result).toEqual({ ok: false, reason: 'executor-failed' });
    expect(sourceCreate).toHaveBeenCalledWith({
      config,
      plan: config.plan,
    });
    expect(createLedger).toHaveBeenCalledOnce();
    expect(createGrantIssuer).toHaveBeenCalledWith({
      evaluationPlanDigest: config.plan.planDigest,
      repositoryCommit: config.plan.repositoryCommit,
      environment,
      operationTimeoutMs: config.controlledRuntime.loop.continuationTimeoutMs,
    });
    expect(createDurableRunner).toHaveBeenCalledWith({
      ledger: expect.any(Object),
      executorFactory,
      verificationAttemptGrantIssuer: grantIssuer,
      settings: {
        ownerId: `g4.eval.123456789.2.full_shards.${descriptor.shardId}`,
        leaseDurationMs: config.execution.shard.leaseDurationMs,
        checkpoint: config.execution.checkpoint,
      },
      now: expect.any(Function),
    });
    expect(run).toHaveBeenCalledWith({
      plan: config.plan,
      shardId: descriptor.shardId,
    });
  }, 20_000);

  it('rejects a partition drift before reading config or constructing authorities', async () => {
    const filePort = files();
    const sourceCreate = vi.fn(async () => executorFactory);
    const factory =
      createProductionAgentEvaluationCoordinatorShardRunnerFactory({
        files: filePort,
        environment,
        attemptExecutorFactorySource: Object.freeze({ create: sourceCreate }),
      });

    await expect(
      factory
        .create({
          partition: {
            planDigest: config.plan.planDigest,
            repositoryCommit: 'f'.repeat(40),
          },
          ledger: coordinatorLedger,
        })
        .run({ plan: config.plan, shardId: descriptor.shardId })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(filePort.readCanonicalJson).not.toHaveBeenCalled();
    expect(sourceCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing worker identity before constructing attempt authorities', async () => {
    const sourceCreate = vi.fn(async () => executorFactory);
    const factory =
      createProductionAgentEvaluationCoordinatorShardRunnerFactory({
        files: files(),
        environment: {
          ...environment,
          [AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.jobId]: undefined,
        },
        attemptExecutorFactorySource: Object.freeze({ create: sourceCreate }),
      });

    await expect(
      factory
        .create({
          partition: {
            planDigest: config.plan.planDigest,
            repositoryCommit: config.plan.repositoryCommit,
          },
          ledger: coordinatorLedger,
        })
        .run({ plan: config.plan, shardId: descriptor.shardId })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(sourceCreate).not.toHaveBeenCalled();
  }, 20_000);
});
