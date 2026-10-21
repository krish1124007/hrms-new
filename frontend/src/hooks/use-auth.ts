import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi, type AuthUser } from '@/lib/auth.api';
import { tokenStorage } from '@/lib/axios';
import { clearSessionCache } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth.store';

export function useAuth(): {
  user: AuthUser | null;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
} {
  const { user, isAuthenticated, clear } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = async (): Promise<void> => {
    await authApi.logout();
    tokenStorage.clear();
    clear();
    // Nothing of this session may show to whoever signs in next (the store
    // subscription in `lib/query-client.ts` does the same for every other
    // way a session ends).
    clearSessionCache(queryClient);
    navigate('/login');
  };

  return { user, isAuthenticated, logout };
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (result) => {
      tokenStorage.set(result.accessToken, result.refreshToken);
      setSession({ user: result.user });
      toast.success(`Welcome back, ${result.user.firstName ?? result.user.email}`);
      navigate('/dashboard');
    },
    // A failed sign-in is toasted once, by the global mutation handler.
  });
}

/**
 * Activate an invited account. On success the response is a full session
 * (same shape as login), stored exactly as `useLogin` stores it. Errors are
 * rendered inline by the page (an invalid or used link needs a way back to
 * sign-in, not a toast), so the global toast is silenced.
 */
export function useAcceptInvite() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.acceptInvite,
    meta: { silent: true },
    onSuccess: (session) => {
      tokenStorage.set(session.accessToken, session.refreshToken);
      setSession({ user: session.user });
      toast.success(`Welcome, ${session.user.firstName ?? session.user.email}`);
      navigate('/dashboard');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: () => {
      toast.success('Reset link sent. Check your inbox.');
    },
  });
}

export function useResetPassword() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      toast.success('Password reset. Please sign in.');
      navigate('/login');
    },
  });
}
