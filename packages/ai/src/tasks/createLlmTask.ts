import type {
  LlmContextBundle,
  LlmExecutionBudget,
  LlmModelPreferences,
  LlmOutputChannel,
  LlmResponseMode,
  LlmTaskRequest,
  LlmToolSchemaFormat,
} from '@prodivix/shared';

export interface CreateLlmTaskOptions {
  id: string;
  intent: string;
  context: LlmContextBundle;
  allowedTools?: readonly string[];
  outputChannels?: readonly LlmOutputChannel[];
  modelPreferences?: LlmModelPreferences;
  responseMode?: LlmResponseMode;
  streaming?: boolean;
  toolSchemaFormat?: LlmToolSchemaFormat;
  providerMetadata?: Record<string, unknown>;
  budget?: LlmExecutionBudget;
  requiresPlan?: boolean;
}

export const createLlmTask = (
  options: CreateLlmTaskOptions
): LlmTaskRequest => ({
  id: options.id,
  intent: options.intent,
  context: options.context,
  allowedTools: options.allowedTools ?? [],
  outputChannels: options.outputChannels ?? [
    'pir-command',
    'node-graph-operation',
    'code-artifact',
  ],
  modelPreferences: options.modelPreferences,
  responseMode: options.responseMode,
  streaming: options.streaming,
  toolSchemaFormat: options.toolSchemaFormat,
  providerMetadata: options.providerMetadata,
  budget: options.budget,
  requiresPlan: options.requiresPlan,
});
