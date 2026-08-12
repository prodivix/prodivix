import type { AgentProviderProtocolFamily } from '@prodivix/ai';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { containsAsciiControlCharacter } from './textSafety';

export type AgentEvaluationNativeProtocol = Extract<
  AgentProviderProtocolFamily,
  'anthropic-messages' | 'gemini-interactions' | 'openai-responses'
>;

export const AGENT_EVALUATION_ENABLE_ENV =
  'PRODIVIX_G4_MODEL_EVAL_ENABLED' as const;

export const AGENT_EVALUATION_PROVIDER_DEFINITIONS = Object.freeze({
  'openai-responses': Object.freeze({
    endpoint: 'https://api.openai.com/v1/responses',
    endpointId: 'endpoint.openai-responses.first-party',
    modelEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_OPENAI_MODEL_ID',
    providerConfigurationId: 'provider.openai-responses.v8',
    secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY',
    secretRef: 'secret.provider.openai-responses',
  }),
  'anthropic-messages': Object.freeze({
    endpoint: 'https://api.anthropic.com/v1/messages',
    endpointId: 'endpoint.anthropic-messages.first-party',
    modelEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_MODEL_ID',
    providerConfigurationId: 'provider.anthropic-messages.v8',
    secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY',
    secretRef: 'secret.provider.anthropic-messages',
  }),
  'gemini-interactions': Object.freeze({
    endpoint:
      'https://generativelanguage.googleapis.com/v1/interactions?alt=sse',
    endpointId: 'endpoint.gemini-interactions.first-party',
    modelEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_GEMINI_MODEL_ID',
    providerConfigurationId: 'provider.gemini-interactions.v8',
    secretEnvironmentName: 'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY',
    secretRef: 'secret.provider.gemini-interactions',
  }),
} satisfies Readonly<
  Record<
    AgentEvaluationNativeProtocol,
    Readonly<{
      endpoint: string;
      endpointId: string;
      modelEnvironmentName: string;
      providerConfigurationId: string;
      secretEnvironmentName: string;
      secretRef: string;
    }>
  >
>);

export type AgentEvaluationProviderRuntimeConfiguration = Readonly<{
  protocolFamily: AgentEvaluationNativeProtocol;
  providerConfigurationId: string;
  modelId: string;
  endpoint: string;
  endpointId: string;
  secretRef: string;
}>;

export type AgentEvaluationRunnerConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      providers: Readonly<
        Record<
          AgentEvaluationNativeProtocol,
          AgentEvaluationProviderRuntimeConfiguration
        >
      >;
    }>;

export type AgentEvaluationEnvironment = Readonly<
  Record<string, string | undefined>
>;

const canonicalModelId = (value: string | undefined): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value)
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  return value;
};

/** Loads public model identity while leaving every credential in its server environment slot. */
export const loadAgentEvaluationRunnerConfig = (
  environment: AgentEvaluationEnvironment = process.env
): AgentEvaluationRunnerConfig => {
  const flag = environment[AGENT_EVALUATION_ENABLE_ENV];
  if (flag === undefined || flag === '')
    return Object.freeze({ enabled: false });
  if (flag !== '1') {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }

  const entries = (
    Object.entries(AGENT_EVALUATION_PROVIDER_DEFINITIONS) as readonly [
      AgentEvaluationNativeProtocol,
      (typeof AGENT_EVALUATION_PROVIDER_DEFINITIONS)[AgentEvaluationNativeProtocol],
    ][]
  ).map(([protocolFamily, definition]) => [
    protocolFamily,
    Object.freeze({
      protocolFamily,
      providerConfigurationId: definition.providerConfigurationId,
      modelId: canonicalModelId(environment[definition.modelEnvironmentName]),
      endpoint: definition.endpoint,
      endpointId: definition.endpointId,
      secretRef: definition.secretRef,
    }),
  ]);

  return Object.freeze({
    enabled: true,
    providers: Object.freeze(Object.fromEntries(entries)) as Readonly<
      Record<
        AgentEvaluationNativeProtocol,
        AgentEvaluationProviderRuntimeConfiguration
      >
    >,
  });
};

export const requireEnabledAgentEvaluationRunnerConfig = (
  config: AgentEvaluationRunnerConfig
): Extract<AgentEvaluationRunnerConfig, { enabled: true }> => {
  if (!config.enabled) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.disabled
    );
  }
  return config;
};
