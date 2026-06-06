import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PublicUser } from './authApi';

type AuthState = {
  token: string | null;
  expiresAt: string | null;
  user: PublicUser | null;
  hasHydrated: boolean;
  isAuthenticated: () => boolean;
  setSession: (token: string, user: PublicUser, expiresAt?: string) => void;
  setUser: (user: PublicUser | null) => void;
  clearSession: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
};

export const isAuthSessionExpired = (expiresAt?: string | null): boolean => {
  if (!expiresAt) return false;
  const expiresTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresTime)) return true;
  return expiresTime <= Date.now();
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      user: null,
      hasHydrated: false,
      isAuthenticated: () => {
        const { token, expiresAt } = get();
        return Boolean(token) && !isAuthSessionExpired(expiresAt);
      },
      setSession: (token, user, expiresAt) =>
        set({
          token,
          user,
          expiresAt: expiresAt ?? null,
        }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ token: null, user: null, expiresAt: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'prodivix-auth-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setHasHydrated(true);
        if (
          !state.token ||
          !state.user ||
          isAuthSessionExpired(state.expiresAt)
        ) {
          state.clearSession();
        }
      },
    }
  )
);
