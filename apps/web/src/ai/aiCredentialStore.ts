import { create } from 'zustand';
import { useAuthStore } from '@/auth/useAuthStore';

type AiCredentialStore = {
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  clearApiKey: () => void;
};

/**
 * Holds the provider API key for the lifetime of the tab only. It is deliberately
 * not wrapped in `persist`: browser storage is limited to UI preferences, so a
 * credential must never survive a reload, a logout or a shared browser profile.
 */
export const useAiCredentialStore = create<AiCredentialStore>()((set) => ({
  apiKey: '',
  setApiKey: (apiKey) => set({ apiKey }),
  clearApiKey: () => set({ apiKey: '' }),
}));

// The key's lifetime is bounded by the session as well as the tab: signing out
// on a shared machine must not leave the previous user's provider key live for
// whoever uses the tab next. The credential module observes auth rather than
// auth knowing about AI settings, so every sign-out path is covered without
// each call site remembering to wipe it.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) {
    useAiCredentialStore.getState().clearApiKey();
  }
});
