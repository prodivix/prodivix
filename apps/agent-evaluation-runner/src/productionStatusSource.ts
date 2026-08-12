import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentEvaluationCoordinatorStatusSource,
  AgentEvaluationStatusReport,
} from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';

export type ProductionAgentEvaluationCoordinatorStatusSourceOptions = Omit<
  CreateEnvironmentAgentEvaluationLedgerClientInput,
  'planDigest'
>;

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const validateStatusResponseBinding = (
  value: unknown,
  input: Parameters<AgentEvaluationCoordinatorStatusSource['load']>[0]
): AgentEvaluationStatusReport => {
  if (
    !isPlainObject(value) ||
    value.planDigest !== input.plan.planDigest ||
    value.repositoryCommit !== input.plan.repositoryCommit ||
    value.observedAt !== input.observedAt
  ) {
    return responseInvalid();
  }
  const hasShardId = Object.hasOwn(value, 'shardId');
  if (
    input.shardId === undefined
      ? hasShardId
      : !hasShardId || value.shardId !== input.shardId
  ) {
    return responseInvalid();
  }
  return value as AgentEvaluationStatusReport;
};

/** Reads the bounded Backend status projection for one exact plan partition. */
export class ProductionAgentEvaluationCoordinatorStatusSource implements AgentEvaluationCoordinatorStatusSource {
  readonly #options: ProductionAgentEvaluationCoordinatorStatusSourceOptions;

  constructor(
    options: ProductionAgentEvaluationCoordinatorStatusSourceOptions = {}
  ) {
    this.#options = options;
  }

  async load(
    input: Parameters<AgentEvaluationCoordinatorStatusSource['load']>[0]
  ): Promise<AgentEvaluationStatusReport> {
    const client = createEnvironmentAgentEvaluationLedgerClient({
      ...this.#options,
      planDigest: input.plan.planDigest,
    });
    if (
      client.scope.planDigest !== input.plan.planDigest ||
      client.scope.repositoryCommit !== input.plan.repositoryCommit
    ) {
      return responseInvalid();
    }
    const response = await client.getStatus({
      observedAt: input.observedAt,
      ...(input.shardId === undefined ? {} : { shardId: input.shardId }),
    });
    return validateStatusResponseBinding(response, input);
  }
}

export const createProductionAgentEvaluationCoordinatorStatusSource = (
  options: ProductionAgentEvaluationCoordinatorStatusSourceOptions = {}
): ProductionAgentEvaluationCoordinatorStatusSource =>
  new ProductionAgentEvaluationCoordinatorStatusSource(options);
