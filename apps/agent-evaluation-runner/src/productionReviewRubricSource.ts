import type { AgentModelEvaluationPlan } from '@prodivix/ai';
import type {
  AgentEvaluationCoordinatorFilePort,
  AgentEvaluationPublicReviewRubricSource,
} from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  loadProductionAgentEvaluationFrozenRunConfigForPlan,
  type ProductionAgentEvaluationRunConfigEnvironment,
} from './productionSignerFactory';
import { validateAgentEvaluationPublicReviewRubric } from './reviewWorkflow';

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

export type ProductionAgentEvaluationPublicReviewRubricSourceOptions =
  Readonly<{
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    environment?: ProductionAgentEvaluationRunConfigEnvironment;
  }>;

/** Loads only the public rubric frozen in the admitted production artifact. */
export class ProductionAgentEvaluationPublicReviewRubricSource implements AgentEvaluationPublicReviewRubricSource {
  readonly #files: Pick<
    AgentEvaluationCoordinatorFilePort,
    'readCanonicalJson'
  >;
  readonly #environment?: ProductionAgentEvaluationRunConfigEnvironment;

  constructor(
    options: ProductionAgentEvaluationPublicReviewRubricSourceOptions
  ) {
    this.#files = options.files;
    this.#environment = options.environment;
  }

  async load(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      rubricDigest: string;
    }>
  ) {
    const config = await loadProductionAgentEvaluationFrozenRunConfigForPlan({
      files: this.#files,
      ...(this.#environment ? { environment: this.#environment } : {}),
      plan: input.plan,
    });
    const matches = config.execution.humanReview.publicRubrics.filter(
      ({ rubricDigest }) => rubricDigest === input.rubricDigest
    );
    if (matches.length !== 1) return invalid();
    return validateAgentEvaluationPublicReviewRubric(
      matches[0],
      input.rubricDigest
    );
  }
}

export const createProductionAgentEvaluationPublicReviewRubricSource = (
  options: ProductionAgentEvaluationPublicReviewRubricSourceOptions
): ProductionAgentEvaluationPublicReviewRubricSource =>
  new ProductionAgentEvaluationPublicReviewRubricSource(options);
