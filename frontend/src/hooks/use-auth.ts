import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authApi, type AuthUser } from '@/lib/auth.api';
import { tokenStorage } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';

export function useAuth(): {
  user: AuthUser | null;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
} {
  const { user, isAuthenticated, clear } = useAuthStore();
  const navigate = useNavigate();

  const logout = async (): Promise<void> => {
    await authApi.logout();
    tokenStorage.clear();
    clear();
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
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message ?? 'Sign in failed');
    },
  });
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (session) => {
      tokenStorage.set(session.accessToken, session.refreshToken);
      setSession({ user: session.user });
      toast.success('Account created.');
      navigate('/dashboard');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message ?? 'Registration failed');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: authApi.forgotPassword,
    onSuccess: () => {
      toast.success('Reset link sent. Check your inbox.');
    },
    onError: () => toast.error('Failed to send reset link'),
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
    onError: () => toast.error('Failed to reset password'),
  });
}
