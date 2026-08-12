import type {
  AgentEvaluationProductionRunConfigArtifactBinding,
  AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  createEnvironmentAgentEvaluationAuthoritySigner,
  type EnvironmentAgentEvaluationAuthoritySigner,
} from './attestationSigner';
import type {
  AgentEvaluationAuthoritySignerFactory,
  AgentEvaluationCoordinatorFilePort,
} from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES,
  loadProductionAgentEvaluationRunConfigArtifact,
  type ProductionAgentEvaluationRunConfigEnvironment,
} from './productionRunConfigArtifact';
import type { AgentEvaluationProductionFrozenRunConfig } from './runConfig';

export const AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME =
  AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path;
export type { ProductionAgentEvaluationRunConfigEnvironment } from './productionRunConfigArtifact';

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

export type ProductionAgentEvaluationFrozenRunConfigBinding = Readonly<{
  config: AgentEvaluationProductionFrozenRunConfig;
  artifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
}>;

/**
 * Reloads the reviewed production run config after the exact plan is known,
 * then binds the public workflow identity before private material can be read.
 */
export class ProductionAgentEvaluationAuthoritySignerFactory implements AgentEvaluationAuthoritySignerFactory {
  readonly #environment: ProductionAgentEvaluationRunConfigEnvironment;
  readonly #files: Pick<
    AgentEvaluationCoordinatorFilePort,
    'readCanonicalJson'
  >;

  constructor(
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>,
    environment: ProductionAgentEvaluationRunConfigEnvironment = process.env
  ) {
    this.#files = files;
    this.#environment = environment;
  }

  async create(input: {
    readonly plan: AgentModelEvaluationPlan;
  }): Promise<EnvironmentAgentEvaluationAuthoritySigner> {
    try {
      const config = await loadProductionAgentEvaluationFrozenRunConfigForPlan({
        files: this.#files,
        environment: this.#environment,
        plan: input.plan,
      });
      return createEnvironmentAgentEvaluationAuthoritySigner({
        environment: this.#environment,
        expectedAttestation: config.attestation,
      });
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return invalid();
    }
  }
}

export const createProductionAgentEvaluationAuthoritySignerFactory = (
  files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>,
  environment: ProductionAgentEvaluationRunConfigEnvironment = process.env
): ProductionAgentEvaluationAuthoritySignerFactory =>
  new ProductionAgentEvaluationAuthoritySignerFactory(files, environment);

/** Reloads and exact-cross-binds the admitted production artifact to a plan. */
export const loadProductionAgentEvaluationFrozenRunConfigForPlan = async (
  input: Readonly<{
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    environment?: ProductionAgentEvaluationRunConfigEnvironment;
    plan: AgentModelEvaluationPlan;
  }>
) => {
  const binding =
    await loadProductionAgentEvaluationFrozenRunConfigBindingForPlan(input);
  return binding.config;
};

/** Loads the exact config together with its admitted plan-artifact binding. */
export const loadProductionAgentEvaluationFrozenRunConfigBindingForPlan =
  async (
    input: Readonly<{
      files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
      environment?: ProductionAgentEvaluationRunConfigEnvironment;
      plan: AgentModelEvaluationPlan;
    }>
  ): Promise<ProductionAgentEvaluationFrozenRunConfigBinding> => {
    try {
      const loaded = await loadProductionAgentEvaluationRunConfigArtifact({
        files: input.files,
        environment: input.environment ?? process.env,
        expectedRepositoryCommit: input.plan.repositoryCommit,
        expectedPlanDigest: input.plan.planDigest,
        expectedPlan: input.plan,
        observedAt: input.plan.plannedAt,
      });
      return Object.freeze({
        config: loaded.config,
        artifactBinding: loaded.artifactBinding,
      });
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return invalid();
    }
  };
