import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export const AGENT_EVALUATION_SECRET_CANARIES_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES' as const;
export const AGENT_EVALUATION_PROTECTED_HOLDOUT_CANARIES_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES' as const;

const productionCanaryPattern = /^[A-Za-z0-9._:@%+=/-]{8,4096}$/u;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

export const decodeProductionAgentEvaluationCanaries = (
  source: string | undefined
): readonly string[] => {
  if (typeof source !== 'string' || source.length === 0) return unavailable();
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return unavailable();
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 256 ||
    value.some(
      (entry) =>
        typeof entry !== 'string' || !productionCanaryPattern.test(entry)
    ) ||
    new Set(value).size !== value.length
  ) {
    return unavailable();
  }
  return Object.freeze([...value]);
};
