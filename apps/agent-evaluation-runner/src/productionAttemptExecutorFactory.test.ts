import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProductionAgentEvaluationDurableAttemptExecutorFactory } from './productionAttemptExecutorFactory';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const source = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/evaluation/g4-real-model-evaluation.example.json',
      import.meta.url
    ),
    'utf8'
  )
) as Record<string, unknown>;
materializeAgentEvaluationTestProductionRunConfig(source);
const config = decodeAgentEvaluationFrozenRunConfig(source, {
  clock: () => '2026-08-08T00:00:00.000Z',
  expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
});
const productionConfig =
  requireProductionAgentEvaluationFrozenRunConfig(config);

describe('production attempt executor factory', () => {
  it('fails at construction when a required production authority is absent', () => {
    expect(() =>
      createProductionAgentEvaluationDurableAttemptExecutorFactory({
        config: productionConfig,
        plan: productionConfig.plan,
        controlledRuntime: undefined as never,
        stateVault: undefined as never,
        capabilityRuntime: Object.freeze({
          executeTool: async () => {
            throw new Error('unreachable');
          },
          assessCapability: async () => {
            throw new Error('unreachable');
          },
        }),
        prepareVerificationAttemptGrants: async () => Object.freeze([]),
        gradeAndPersist: async () => {
          throw new Error('unreachable');
        },
      })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
      })
    );
  });
});
