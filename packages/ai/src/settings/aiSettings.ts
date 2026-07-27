import type { LlmExecutionBudget, LlmModelPreferences } from '@prodivix/shared';
import { isPlainObject } from '@prodivix/shared/safety';

export type ProdivixAiProviderKind = 'mock' | 'openai-compatible';

export interface ProdivixAiBaseSettings {
  enabled: boolean;
  provider: ProdivixAiProviderKind;
}

/**
 * Provider settings are durable UI preferences and therefore carry no credential.
 * The API key is a session-scoped value supplied to the provider at call time so
 * it can never be written to client storage.
 */
export interface ProdivixAiOpenAICompatibleSettings extends ProdivixAiBaseSettings {
  provider: 'openai-compatible';
  baseURL: string;
  model: string;
  modelPreferences?: LlmModelPreferences;
  budget?: LlmExecutionBudget;
}

export interface ProdivixAiMockSettings extends ProdivixAiBaseSettings {
  provider: 'mock';
}

export type ProdivixAiSettings =
  ProdivixAiMockSettings | ProdivixAiOpenAICompatibleSettings;

export const createDefaultProdivixAiSettings = (): ProdivixAiSettings => ({
  enabled: true,
  provider: 'mock',
});

const optionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const definedFields = <TValue extends object>(value: TValue): TValue =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as TValue;

/**
 * Rebuilds settings from the declared preference fields only. Storage adapters
 * run every read and every write through this, so an unexpected field — such as
 * a credential written by an older client — is dropped instead of round-tripped.
 */
export const normalizeProdivixAiSettings = (
  value: unknown
): ProdivixAiSettings => {
  if (!isPlainObject(value)) return createDefaultProdivixAiSettings();
  const enabled = value.enabled !== false;
  if (
    value.provider !== 'openai-compatible' ||
    typeof value.baseURL !== 'string' ||
    typeof value.model !== 'string'
  ) {
    return { enabled, provider: 'mock' };
  }
  const preferences = isPlainObject(value.modelPreferences)
    ? definedFields<LlmModelPreferences>({
        jsonMode: optionalBoolean(value.modelPreferences.jsonMode),
        toolCalling: optionalBoolean(value.modelPreferences.toolCalling),
        vision: optionalBoolean(value.modelPreferences.vision),
        longContext: optionalBoolean(value.modelPreferences.longContext),
      })
    : undefined;
  const budget = isPlainObject(value.budget)
    ? definedFields<LlmExecutionBudget>({
        maxOutputTokens: optionalNumber(value.budget.maxOutputTokens),
        temperature: optionalNumber(value.budget.temperature),
        timeoutMs: optionalNumber(value.budget.timeoutMs),
      })
    : undefined;
  return {
    enabled,
    provider: 'openai-compatible',
    baseURL: value.baseURL,
    model: value.model,
    ...(preferences ? { modelPreferences: preferences } : {}),
    ...(budget ? { budget } : {}),
  };
};
