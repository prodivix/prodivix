import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ProdivixAiSettings } from '@prodivix/ai';
import { createDefaultProdivixAiSettings } from '@prodivix/ai';

type AiSettingsStore = {
  settings: ProdivixAiSettings;
  setSettings: (settings: ProdivixAiSettings) => void;
  resetSettings: () => void;
};

export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set) => ({
      settings: createDefaultProdivixAiSettings(),
      setSettings: (settings) => set({ settings }),
      resetSettings: () => set({ settings: createDefaultProdivixAiSettings() }),
    }),
    {
      name: 'prodivix-ai-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
