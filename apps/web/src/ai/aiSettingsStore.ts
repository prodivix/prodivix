import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AiDraftExecutionBudget } from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';

/** Browser preferences select public server authority; they never configure transport. */
export type BlueprintAssistantPreferences = {
  provider: 'mock' | 'server';
  providerId?: string;
  modelId?: string;
  budget?: AiDraftExecutionBudget;
};
const defaults = (): BlueprintAssistantPreferences => ({ provider: 'mock' });
const normalizePreferences = (
  value: unknown
): BlueprintAssistantPreferences => {
  if (!isPlainObject(value) || value.provider !== 'server') return defaults();
  const budget = isPlainObject(value.budget) ? value.budget : {};
  return {
    provider: 'server',
    providerId:
      typeof value.providerId === 'string'
        ? value.providerId.slice(0, 256)
        : '',
    modelId:
      typeof value.modelId === 'string' ? value.modelId.slice(0, 256) : '',
    budget: {
      temperature:
        typeof budget.temperature === 'number' &&
        Number.isFinite(budget.temperature) &&
        budget.temperature >= 0 &&
        budget.temperature <= 2
          ? budget.temperature
          : 0.2,
      maxOutputTokens:
        typeof budget.maxOutputTokens === 'number' &&
        Number.isSafeInteger(budget.maxOutputTokens) &&
        budget.maxOutputTokens > 0 &&
        budget.maxOutputTokens <= 32768
          ? budget.maxOutputTokens
          : 4096,
      timeoutMs:
        typeof budget.timeoutMs === 'number' &&
        Number.isSafeInteger(budget.timeoutMs) &&
        budget.timeoutMs > 0 &&
        budget.timeoutMs <= 300000
          ? budget.timeoutMs
          : 60000,
    },
  };
};

type AiSettingsStore = {
  settings: BlueprintAssistantPreferences;
  setSettings(settings: BlueprintAssistantPreferences): void;
  resetSettings(): void;
};

export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set) => ({
      settings: defaults(),
      setSettings: (settings) =>
        set({ settings: normalizePreferences(settings) }),
      resetSettings: () => set({ settings: defaults() }),
    }),
    {
      name: 'prodivix-ai-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: normalizePreferences(state.settings),
      }),
      merge: (persisted, current) => ({
        ...current,
        settings: normalizePreferences(
          isPlainObject(persisted) ? persisted.settings : undefined
        ),
      }),
      onRehydrateStorage: () => (state) => state?.setSettings(state.settings),
    }
  )
);
