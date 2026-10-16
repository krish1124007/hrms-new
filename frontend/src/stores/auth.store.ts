import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/lib/auth.api';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setSession: (input: { user: AuthUser }) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setSession: ({ user }) => set({ user, isAuthenticated: true }),
      clear: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: 'opencore.auth' },
  ),
);
