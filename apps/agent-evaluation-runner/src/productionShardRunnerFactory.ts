import type {
  AgentEvaluationShardRunResult,
  AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentEvaluationCoordinatorFilePort,
  AgentEvaluationCoordinatorShardRunner,
  AgentEvaluationCoordinatorShardRunnerFactory,
  AgentEvaluationPartition,
} from './coordinator';
import {
  AgentEvaluationDurableShardRunner,
  type AgentEvaluationDurableAttemptExecutorFactory,
  type AgentEvaluationDurableShardLedger,
  type AgentEvaluationDurableShardSettings,
} from './durableShardRunner';
import { createEnvironmentAgentEvaluationDurableShardLedger } from './durableShardLedgerAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { CreateEnvironmentAgentEvaluationLedgerClientInput } from './ledgerClient';
import {
  createProductionAgentEvaluationDurableAttemptExecutorFactory,
  type CreateProductionAgentEvaluationDurableAttemptExecutorFactoryInput,
} from './productionAttemptExecutorFactory';
import { loadProductionAgentEvaluationFrozenRunConfigBindingForPlan } from './productionSignerFactory';
import type { AgentEvaluationProductionFrozenRunConfig } from './runConfig';
import {
  createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer,
  type AgentEvaluationVerificationAttemptGrantIssuer,
} from './verificationAttemptGrantClient';

export const AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES = Object.freeze({
  runId: 'GITHUB_RUN_ID',
  runAttempt: 'GITHUB_RUN_ATTEMPT',
  jobId: 'GITHUB_JOB',
} as const);

const workerComponentPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const shardIdentityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

export type ProductionAgentEvaluationAttemptExecutorFactorySource = Readonly<{
  create(
    input: Readonly<{
      config: AgentEvaluationProductionFrozenRunConfig;
      plan: AgentModelEvaluationPlan;
    }>
  ):
    | AgentEvaluationDurableAttemptExecutorFactory
    | Promise<AgentEvaluationDurableAttemptExecutorFactory>;
}>;

export type ProductionAgentEvaluationAttemptAuthorities = Pick<
  CreateProductionAgentEvaluationDurableAttemptExecutorFactoryInput,
  | 'controlledRuntime'
  | 'capabilityRuntime'
  | 'stateVault'
  | 'prepareVerificationAttemptGrants'
  | 'gradeAndPersist'
>;

export type ProductionAgentEvaluationAttemptAuthoritySource = Readonly<{
  load(
    input: Readonly<{
      config: AgentEvaluationProductionFrozenRunConfig;
      plan: AgentModelEvaluationPlan;
    }>
  ):
    | ProductionAgentEvaluationAttemptAuthorities
    | Promise<ProductionAgentEvaluationAttemptAuthorities>;
}>;

export type ProductionAgentEvaluationAttemptExecutorFactorySourceOptions =
  Readonly<{
    authorities: ProductionAgentEvaluationAttemptAuthoritySource;
    environment?: NodeJS.ProcessEnv;
    now?: () => string;
  }>;

/** Binds the production executor constructor to its durable authorities. */
export const createProductionAgentEvaluationAttemptExecutorFactorySource = (
  options: ProductionAgentEvaluationAttemptExecutorFactorySourceOptions
): ProductionAgentEvaluationAttemptExecutorFactorySource =>
  Object.freeze({
    async create(input) {
      const authorities = await options.authorities.load(input);
      return createProductionAgentEvaluationDurableAttemptExecutorFactory({
        config: input.config,
        plan: input.plan,
        ...(options.environment ? { environment: options.environment } : {}),
        ...(options.now ? { now: options.now } : {}),
        controlledRuntime: authorities.controlledRuntime,
        capabilityRuntime: authorities.capabilityRuntime,
        stateVault: authorities.stateVault,
        prepareVerificationAttemptGrants:
          authorities.prepareVerificationAttemptGrants,
        gradeAndPersist: authorities.gradeAndPersist,
      });
    },
  });

type ProductionAgentEvaluationDurableRunnerConstructorInput = Readonly<{
  ledger: AgentEvaluationDurableShardLedger;
  executorFactory: AgentEvaluationDurableAttemptExecutorFactory;
  verificationAttemptGrantIssuer: AgentEvaluationVerificationAttemptGrantIssuer;
  settings: AgentEvaluationDurableShardSettings;
  now: () => string;
}>;

type ProductionAgentEvaluationDurableRunner = Readonly<{
  run(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId: string;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationShardRunResult>;
}>;

export type ProductionAgentEvaluationCoordinatorShardRunnerFactoryOptions =
  Readonly<{
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    attemptExecutorFactorySource: ProductionAgentEvaluationAttemptExecutorFactorySource;
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    now?: () => string;
    /** Dependency seams are reserved for deterministic unit tests. */
    createLedger?: (
      plan: AgentModelEvaluationPlan,
      input: Omit<
        CreateEnvironmentAgentEvaluationLedgerClientInput,
        'planDigest'
      >
    ) => AgentEvaluationDurableShardLedger;
    createVerificationAttemptGrantIssuer?: (
      input: Readonly<{
        evaluationPlanDigest: string;
        repositoryCommit: string;
        environment: NodeJS.ProcessEnv;
        fetch?: typeof fetch;
        operationTimeoutMs: number;
      }>
    ) => AgentEvaluationVerificationAttemptGrantIssuer;
    createDurableRunner?: (
      input: ProductionAgentEvaluationDurableRunnerConstructorInput
    ) => ProductionAgentEvaluationDurableRunner;
  }>;

const assertAttemptExecutorFactory = (
  value: AgentEvaluationDurableAttemptExecutorFactory
): AgentEvaluationDurableAttemptExecutorFactory => {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.estimateShard !== 'function' ||
    typeof value.prepareVerificationAttemptGrants !== 'function' ||
    typeof value.createPreDispatchAttemptFinalizer !== 'function' ||
    typeof value.create !== 'function'
  ) {
    return unavailable();
  }
  return value;
};

const exactPartition = (
  partition: AgentEvaluationPartition,
  plan: AgentModelEvaluationPlan
): boolean =>
  partition.planDigest === plan.planDigest &&
  partition.repositoryCommit === plan.repositoryCommit;

export const createProductionAgentEvaluationShardWorkerOwnerId = (
  environment: NodeJS.ProcessEnv,
  shardId: string
): string => {
  const runId =
    environment[AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.runId];
  const runAttempt =
    environment[AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.runAttempt];
  const jobId =
    environment[AGENT_EVALUATION_SHARD_WORKER_ENVIRONMENT_NAMES.jobId];
  if (
    typeof runId !== 'string' ||
    !/^[1-9][0-9]{0,19}$/u.test(runId) ||
    typeof runAttempt !== 'string' ||
    !/^[1-9][0-9]{0,8}$/u.test(runAttempt) ||
    typeof jobId !== 'string' ||
    !workerComponentPattern.test(jobId) ||
    !shardIdentityPattern.test(shardId)
  ) {
    return unavailable();
  }
  const ownerId = `g4.eval.${runId}.${runAttempt}.${jobId}.${shardId}`;
  if (!shardIdentityPattern.test(ownerId)) return unavailable();
  return ownerId;
};

const defaultDurableRunner = (
  input: ProductionAgentEvaluationDurableRunnerConstructorInput
): ProductionAgentEvaluationDurableRunner =>
  new AgentEvaluationDurableShardRunner(input);

/**
 * Creates the production descriptor runner over the durable Backend journal.
 * Config, worker identity, grants, and all attempt authorities are resolved
 * before the durable runner can authorize a Provider dispatch.
 */
export const createProductionAgentEvaluationCoordinatorShardRunnerFactory = (
  options: ProductionAgentEvaluationCoordinatorShardRunnerFactoryOptions
): AgentEvaluationCoordinatorShardRunnerFactory => {
  const environment = options.environment ?? process.env;
  const now = options.now ?? (() => new Date().toISOString());
  const clientInput: Omit<
    CreateEnvironmentAgentEvaluationLedgerClientInput,
    'planDigest'
  > = Object.freeze({
    environment,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const createLedger =
    options.createLedger ?? createEnvironmentAgentEvaluationDurableShardLedger;
  const createGrantIssuer =
    options.createVerificationAttemptGrantIssuer ??
    ((input) =>
      createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer(input));
  const createDurableRunner =
    options.createDurableRunner ?? defaultDurableRunner;

  return Object.freeze({
    create({
      partition,
    }: Parameters<AgentEvaluationCoordinatorShardRunnerFactory['create']>[0]) {
      const frozenPartition = Object.freeze({ ...partition });
      return Object.freeze({
        async run(
          input: Parameters<AgentEvaluationCoordinatorShardRunner['run']>[0]
        ) {
          try {
            if (!exactPartition(frozenPartition, input.plan)) {
              return unavailable();
            }
            const binding =
              await loadProductionAgentEvaluationFrozenRunConfigBindingForPlan({
                files: options.files,
                environment,
                plan: input.plan,
              });
            if (!sameCanonicalJson(binding.config.plan, input.plan)) {
              return unavailable();
            }
            const ownerId = createProductionAgentEvaluationShardWorkerOwnerId(
              environment,
              input.shardId
            );
            const executorFactory = assertAttemptExecutorFactory(
              await options.attemptExecutorFactorySource.create({
                config: binding.config,
                plan: input.plan,
              })
            );
            const ledger = createLedger(input.plan, clientInput);
            const verificationAttemptGrantIssuer = createGrantIssuer({
              evaluationPlanDigest: input.plan.planDigest,
              repositoryCommit: input.plan.repositoryCommit,
              environment,
              ...(options.fetch ? { fetch: options.fetch } : {}),
              operationTimeoutMs:
                binding.config.controlledRuntime.loop.continuationTimeoutMs,
            });
            const runner = createDurableRunner({
              ledger,
              executorFactory,
              verificationAttemptGrantIssuer,
              settings: Object.freeze({
                ownerId,
                leaseDurationMs: binding.config.execution.shard.leaseDurationMs,
                checkpoint: Object.freeze({
                  completedAttemptInterval:
                    binding.config.execution.checkpoint
                      .completedAttemptInterval,
                  maximumIntervalMs:
                    binding.config.execution.checkpoint.maximumIntervalMs,
                }),
              }),
              now,
            });
            return runner.run(input);
          } catch (caught) {
            if (caught instanceof AgentEvaluationRunnerError) throw caught;
            return unavailable();
          }
        },
      });
    },
  });
};
