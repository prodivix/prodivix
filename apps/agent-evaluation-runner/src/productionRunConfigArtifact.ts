import { basename, isAbsolute, parse, resolve, win32 } from 'node:path';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME as CANONICAL_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES as CANONICAL_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES,
  createAgentEvaluationProductionRunConfigArtifactBinding,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlInstant,
  type AgentEvaluationProductionRunConfigArtifactBinding,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';

export {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_FORMAT,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_VERSION,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME,
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES,
  type AgentEvaluationProductionRunConfigArtifactBinding,
} from '@prodivix/ai';

export const AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES =
  Object.freeze({
    path: 'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH' as const,
    sourcePlanArtifactName:
      'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_NAME' as const,
    sourcePlanArtifactDigest:
      'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_DIGEST' as const,
    sourcePlanWorkflowRunId:
      'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ID' as const,
    sourcePlanWorkflowRunAttempt:
      'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_ARTIFACT_RUN_ATTEMPT' as const,
  });

export type ProductionAgentEvaluationRunConfigEnvironment =
  NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type ProductionAgentEvaluationFrozenRunConfigArtifact = Readonly<{
  config: AgentEvaluationProductionFrozenRunConfig;
  runConfigDocument: Readonly<Record<string, unknown>>;
  artifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  absolutePath: string;
}>;

export type LoadProductionAgentEvaluationRunConfigArtifactInput = Readonly<{
  files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
  environment?: ProductionAgentEvaluationRunConfigEnvironment;
  expectedRepositoryCommit: string;
  expectedPlanDigest: CanonicalDigest;
  observedAt: string;
  expectedPlan?: AgentModelEvaluationPlan;
}>;

const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const readEnvironment = (
  environment: ProductionAgentEvaluationRunConfigEnvironment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const canonicalAbsoluteRunConfigPath = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value) ||
    value.startsWith('\\\\') ||
    value.startsWith('//') ||
    !isAbsolute(value) ||
    (win32.isAbsolute(value) && !isAbsolute(value)) ||
    resolve(value) !== value ||
    value === parse(value).root ||
    basename(value) !== CANONICAL_PRODUCTION_RUN_CONFIG_FILE_NAME
  ) {
    return invalid();
  }
  return value;
};

/**
 * Loads the one generated production config from an admitted plan artifact.
 * The file port owns physical regular-file/no-symlink/TOCTOU checks; this layer
 * hard-cuts canonical bytes and the workflow artifact authority.
 */
export const loadProductionAgentEvaluationRunConfigArtifact = async (
  input: LoadProductionAgentEvaluationRunConfigArtifactInput
): Promise<ProductionAgentEvaluationFrozenRunConfigArtifact> => {
  try {
    if (
      typeof input.files.readCanonicalJson !== 'function' ||
      !repositoryCommitPattern.test(input.expectedRepositoryCommit) ||
      !isAgentCanonicalDigest(input.expectedPlanDigest) ||
      !isAgentControlInstant(input.observedAt)
    ) {
      return invalid();
    }
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const absolutePath = canonicalAbsoluteRunConfigPath(
      read(AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path)
    );
    const source = await input.files.readCanonicalJson(absolutePath);
    if (!isPlainObject(source)) return invalid();
    const runConfigByteLength = Buffer.byteLength(
      canonicalJsonText(source),
      'utf8'
    );
    if (
      runConfigByteLength < 2 ||
      runConfigByteLength > CANONICAL_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES
    ) {
      return invalid();
    }
    const config = requireProductionAgentEvaluationFrozenRunConfig(
      decodeAgentEvaluationFrozenRunConfig(source, {
        clock: () => input.observedAt,
        expectedRepositoryCommit: input.expectedRepositoryCommit,
      }),
      input.expectedRepositoryCommit
    );
    if (
      config.plan.planDigest !== input.expectedPlanDigest ||
      digestAgentCanonicalValue(source) !== config.sourceConfigDigest ||
      (input.expectedPlan !== undefined &&
        !sameCanonicalJson(config.plan, input.expectedPlan))
    ) {
      return invalid();
    }
    const sourcePlanWorkflowRunAttemptSource = read(
      AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt
    );
    if (
      typeof sourcePlanWorkflowRunAttemptSource !== 'string' ||
      !/^[1-9][0-9]{0,8}$/u.test(sourcePlanWorkflowRunAttemptSource)
    ) {
      return invalid();
    }
    const sourcePlanWorkflowRunAttempt = Number(
      sourcePlanWorkflowRunAttemptSource
    );
    const artifactBinding =
      createAgentEvaluationProductionRunConfigArtifactBinding({
        sourcePlanArtifactName:
          read(
            AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName
          ) ?? invalid(),
        sourcePlanArtifactDigest:
          read(
            AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest
          ) ?? invalid(),
        sourcePlanWorkflowRunId:
          read(
            AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId
          ) ?? invalid(),
        sourcePlanWorkflowRunAttempt,
        runConfigFileName: CANONICAL_PRODUCTION_RUN_CONFIG_FILE_NAME,
        runConfigByteLength,
        runConfigCanonicalBytesDigest: config.sourceConfigDigest,
        sourceConfigDigest: config.sourceConfigDigest,
        frozenRunDigest: config.frozenRunDigest,
        planDigest: config.plan.planDigest,
        repositoryCommit: config.plan.repositoryCommit,
      });
    return Object.freeze({
      config,
      runConfigDocument: source,
      artifactBinding,
      absolutePath,
    });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  }
};
