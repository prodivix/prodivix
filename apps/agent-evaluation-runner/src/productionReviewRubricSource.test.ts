import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvaluationCoordinatorFilePort } from './coordinator';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createProductionAgentEvaluationPublicReviewRubricSource } from './productionReviewRubricSource';
import { AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME } from './productionSignerFactory';
import { AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES } from './productionRunConfigArtifact';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const example = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/evaluation/g4-real-model-evaluation.example.json',
      import.meta.url
    ),
    'utf8'
  )
) as Record<string, unknown>;
const fixedInstant = '2026-08-08T00:00:00.000Z';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const configPath = resolve('state', 'production-run-config.json');

const productionSource = (): unknown =>
  materializeAgentEvaluationTestProductionRunConfig(
    structuredClone(example) as Record<string, unknown>
  );
const frozen = () =>
  requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(productionSource(), {
      clock: () => fixedInstant,
      expectedRepositoryCommit: repositoryCommit,
    }),
    repositoryCommit
  );

const files = (): AgentEvaluationCoordinatorFilePort => ({
  readJson: vi.fn(async () => productionSource()),
  readCanonicalJson: vi.fn(async () => productionSource()),
  writeCanonicalJson: vi.fn(async () => undefined),
  createCanonicalJson: vi.fn(async () => undefined),
});

describe('production public review rubric source', () => {
  it('returns the one public rubric frozen into the exact production plan', async () => {
    const config = frozen();
    const filePort = files();
    const source = createProductionAgentEvaluationPublicReviewRubricSource({
      files: filePort,
      environment: {
        [AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME]: configPath,
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
          'g4-plan-1234567-2',
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]: `sha256:${'a'.repeat(64)}`,
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
          '1234567',
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
          '2',
      },
    });
    const rubric = config.execution.humanReview.publicRubrics[0]!;

    await expect(
      source.load({ plan: config.plan, rubricDigest: rubric.rubricDigest })
    ).resolves.toEqual(rubric);
    expect(filePort.readCanonicalJson).toHaveBeenCalledOnce();
  }, 60_000);

  it('rejects a rubric digest or plan that is outside the frozen config', async () => {
    const config = frozen();
    const source = createProductionAgentEvaluationPublicReviewRubricSource({
      files: files(),
      environment: {
        [AGENT_EVALUATION_RUN_CONFIG_ENVIRONMENT_NAME]: configPath,
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactName]:
          'g4-plan-1234567-2',
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanArtifactDigest]: `sha256:${'a'.repeat(64)}`,
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunId]:
          '1234567',
        [AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.sourcePlanWorkflowRunAttempt]:
          '2',
      },
    });
    await expect(
      source.load({
        plan: config.plan,
        rubricDigest: digestAgentCanonicalValue('unfrozen-rubric'),
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      source.load({
        plan: {
          ...config.plan,
          planDigest: digestAgentCanonicalValue('drifted-plan'),
        },
        rubricDigest:
          config.execution.humanReview.publicRubrics[0]!.rubricDigest,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
  }, 20_000);
});
