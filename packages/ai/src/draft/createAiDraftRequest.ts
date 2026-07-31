import type {
  AiDraftContextBundle,
  AiDraftExecutionBudget,
  AiDraftModelPreferences,
  AiDraftRequest,
  AiDraftResponseMode,
  AiDraftToolSchemaFormat,
} from './draft.types';

export interface CreateAiDraftRequestOptions {
  id: string;
  intent: string;
  context: AiDraftContextBundle;
  allowedTools?: readonly string[];
  modelPreferences?: AiDraftModelPreferences;
  responseMode?: AiDraftResponseMode;
  streaming?: boolean;
  toolSchemaFormat?: AiDraftToolSchemaFormat;
  providerMetadata?: Readonly<Record<string, unknown>>;
  budget?: AiDraftExecutionBudget;
}

export const createAiDraftRequest = (
  options: CreateAiDraftRequestOptions
): AiDraftRequest => ({
  id: options.id,
  intent: options.intent,
  context: options.context,
  allowedTools: options.allowedTools ?? [],
  modelPreferences: options.modelPreferences,
  responseMode: options.responseMode,
  streaming: options.streaming,
  toolSchemaFormat: options.toolSchemaFormat,
  providerMetadata: options.providerMetadata,
  budget: options.budget,
});
