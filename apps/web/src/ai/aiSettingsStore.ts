import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProdivixAiSettings } from '@prodivix/ai';
import {
  createDefaultProdivixAiSettings,
  normalizeProdivixAiSettings,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';

type AiSettingsStore = {
  settings: ProdivixAiSettings;
  setSettings: (settings: ProdivixAiSettings) => void;
  resetSettings: () => void;
};

/**
 * Persists AI provider preferences only. The provider credential lives in
 * `useAiCredentialStore` and never reaches `localStorage`; normalizing on both
 * write and read also drops a key an older client may already have stored.
 */
export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set) => ({
      settings: createDefaultProdivixAiSettings(),
      setSettings: (settings) =>
        set({ settings: normalizeProdivixAiSettings(settings) }),
      resetSettings: () => set({ settings: createDefaultProdivixAiSettings() }),
    }),
    {
      name: 'prodivix-ai-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: normalizeProdivixAiSettings(state.settings),
      }),
      merge: (persisted, current) => ({
        ...current,
        settings: normalizeProdivixAiSettings(
          isPlainObject(persisted) ? persisted.settings : undefined
        ),
      }),
      // Rewriting on load erases a credential an older client left on disk instead of
      // leaving it there until the user happens to save settings again.
      onRehydrateStorage: () => (state) => state?.setSettings(state.settings),
    }
  )
);
