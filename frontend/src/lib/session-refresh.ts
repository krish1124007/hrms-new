/**
 * The signed-in user (role, permissions, customPermissions) is persisted in
 * localStorage, so without a re-read it would keep whatever access it had at
 * login — a role change by an admin would never reach an open browser. Once
 * per page load and user, the guarded app re-reads it from GET /auth/me before
 * rendering anything that depends on it.
 */
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { authApi } from './auth.api';
import { tokenStorage } from './axios';
import { useAuthStore } from '@/stores/auth.store';

let current: { userId: string; promise: Promise<void>; done: boolean } | null = null;

/** True once the session of `userId` has been re-read during this page load. */
export function isSessionFresh(userId: string | undefined): boolean {
  return current !== null && current.userId === (userId ?? '') && current.done;
}

async function reread(userId: string): Promise<void> {
  try {
    const { user } = await authApi.me();
    // Only apply it if the same user is still signed in (no logout meanwhile).
    const state = useAuthStore.getState();
    if (state.isAuthenticated && (state.user?._id ?? '') === userId) {
      state.setSession({ user });
    }
  } catch (err) {
    // 401: the axios interceptor has already tried a token refresh and, when
    // that failed, cleared the session and sent the user to /login.
    // 403: the account exists but may not sign in (deactivated) — end the
    // session here, since the refresh token alone would keep it alive.
    if (err instanceof AxiosError && err.response?.status === 403) {
      tokenStorage.clear();
      useAuthStore.getState().clear();
      toast.error('Your account is not active. Contact HR.');
    }
    // Anything else (offline, 5xx): keep the cached user; the API still
    // enforces every permission on each request.
  }
}

/** Re-reads the signed-in user from /auth/me; concurrent callers share one request. */
export function refreshSessionUser(): Promise<void> {
  const userId = useAuthStore.getState().user?._id ?? '';
  if (current && current.userId === userId) return current.promise;
  const entry = { userId, done: false, promise: Promise.resolve() };
  entry.promise = reread(userId).finally(() => {
    entry.done = true;
  });
  current = entry;
  return entry.promise;
}
