'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type JwtPayload } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (
    accessToken: string,
    refreshToken: string,
    payload: JwtPayload,
  ) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      setAuth: (accessToken, refreshToken, payload) => {
        set({
          accessToken,
          refreshToken,
          user: {
            id: payload.sub,
            email: payload.email,
            role: payload.role,
          },
        });
      },

      clearAuth: () => {
        set({ accessToken: null, refreshToken: null, user: null });
      },
    }),
    {
      name: 'auth-storage',
      // Only persist the tokens and user, not the actions
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
