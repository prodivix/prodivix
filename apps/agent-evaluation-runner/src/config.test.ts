import { describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_ENABLE_ENV,
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  loadAgentEvaluationRunnerConfig,
} from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const modelEnvironment = Object.freeze({
  [AGENT_EVALUATION_ENABLE_ENV]: '1',
  PRODIVIX_G4_MODEL_EVAL_OPENAI_MODEL_ID: 'openai-model-snapshot',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_MODEL_ID: 'anthropic-model-snapshot',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_MODEL_ID: 'gemini-model-snapshot',
});

describe('agent evaluation runner configuration', () => {
  it('stays disabled unless the exact enable value is present', () => {
    expect(loadAgentEvaluationRunnerConfig({})).toEqual({ enabled: false });
    expect(
      loadAgentEvaluationRunnerConfig({ [AGENT_EVALUATION_ENABLE_ENV]: '' })
    ).toEqual({ enabled: false });
    for (const value of ['0', 'true', 'TRUE', ' 1', '1 ']) {
      expect(() =>
        loadAgentEvaluationRunnerConfig({
          ...modelEnvironment,
          [AGENT_EVALUATION_ENABLE_ENV]: value,
        })
      ).toThrow(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
    }
  });

  it('requires all three public model IDs and never loads secret values', () => {
    const config = loadAgentEvaluationRunnerConfig({
      ...modelEnvironment,
      PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY: 'openai-secret-value',
      PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY: 'anthropic-secret-value',
      PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY: 'gemini-secret-value',
    });
    expect(config.enabled).toBe(true);
    expect(JSON.stringify(config)).not.toContain('secret-value');
    if (!config.enabled) throw new Error('test configuration was disabled');
    expect(config.providers['openai-responses'].modelId).toBe(
      'openai-model-snapshot'
    );
    expect(config.providers['anthropic-messages'].modelId).toBe(
      'anthropic-model-snapshot'
    );
    expect(config.providers['gemini-interactions'].modelId).toBe(
      'gemini-model-snapshot'
    );

    const { PRODIVIX_G4_MODEL_EVAL_GEMINI_MODEL_ID: _omitted, ...incomplete } =
      modelEnvironment;
    expect(() => loadAgentEvaluationRunnerConfig(incomplete)).toThrow(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  });

  it('freezes the first-party endpoints and Gemini query exactly', () => {
    expect(AGENT_EVALUATION_PROVIDER_DEFINITIONS).toMatchObject({
      'openai-responses': {
        endpoint: 'https://api.openai.com/v1/responses',
        secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY',
      },
      'anthropic-messages': {
        endpoint: 'https://api.anthropic.com/v1/messages',
        secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY',
      },
      'gemini-interactions': {
        endpoint:
          'https://generativelanguage.googleapis.com/v1/interactions?alt=sse',
        secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY',
      },
    });
    const gemini = new URL(
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions'].endpoint
    );
    expect(gemini.pathname).toBe('/v1/interactions');
    expect(gemini.search).toBe('?alt=sse');
  });
});
