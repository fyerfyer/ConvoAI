import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IUserPublic } from '@discord-platform/shared';

interface AuthState {
  user: IUserPublic | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;

  // Actions
  login: (user: IUserPublic, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<IUserPublic>) => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),

      login: (user, token) => {
        // Also store in localStorage for API client
        if (typeof window !== 'undefined') {
          localStorage.setItem('discord_token', token);
          localStorage.setItem('discord_user', JSON.stringify(user));
        }

        set({
          user,
          token,
          isAuthenticated: true,
        });
      },

      logout: () => {
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('discord_token');
          localStorage.removeItem('discord_user');
        }

        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      updateUser: (updatedFields) => {
        set((state) => {
          if (!state.user) return state;

          const updatedUser = { ...state.user, ...updatedFields };

          // Update localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('discord_user', JSON.stringify(updatedUser));
          }

          return { user: updatedUser };
        });
      },
    }),
    {
      name: 'discord-auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
