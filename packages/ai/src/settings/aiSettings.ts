import type { LlmExecutionBudget, LlmModelPreferences } from '@prodivix/shared';

export type ProdivixAiProviderKind = 'mock' | 'openai-compatible';

export interface ProdivixAiBaseSettings {
  enabled: boolean;
  provider: ProdivixAiProviderKind;
}

export interface ProdivixAiOpenAICompatibleSettings
  extends ProdivixAiBaseSettings {
  provider: 'openai-compatible';
  baseURL: string;
  apiKey?: string;
  model: string;
  modelPreferences?: LlmModelPreferences;
  budget?: LlmExecutionBudget;
}

export interface ProdivixAiMockSettings extends ProdivixAiBaseSettings {
  provider: 'mock';
}

export type ProdivixAiSettings =
  | ProdivixAiMockSettings
  | ProdivixAiOpenAICompatibleSettings;

export const createDefaultProdivixAiSettings = (): ProdivixAiSettings => ({
  enabled: true,
  provider: 'mock',
});
