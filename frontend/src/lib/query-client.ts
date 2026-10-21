import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { apiErrorMessage } from './api-error';
import { useAuthStore } from '@/stores/auth.store';

/** Error codes that open a dedicated dialog instead of a toast. */
const DIALOG_ERROR_CODES = new Set(['LOCATION_REQUIRED', 'EXPENSE_REQUIRED_FOR_CHECKOUT']);

const isSilent = (meta: unknown): boolean => !!(meta as { silent?: unknown } | undefined)?.silent;

/**
 * The app's React Query client.
 *
 * Query errors: only toast on server (5xx) or unrecognised — 4xx is the
 * component's job to render inline (a list passes the query's `error` to
 * `DataTable`, a self-service page shows "no employee profile"), never as an
 * empty state.
 *
 * Mutations: a failed mutation gets exactly ONE error toast, from here. Hooks
 * and pages never toast a mutation error themselves (that showed every
 * failure twice); a mutation whose error is shown another way (inline, a
 * dialog) opts out with `meta: { silent: true }`.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, err) => {
          if (err instanceof AxiosError && err.response?.status && err.response.status < 500) {
            return false; // client errors are permanent
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false, // side-effect safety — never auto-retry mutations
      },
    },
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (isSilent(query.meta)) return;
        if (err instanceof AxiosError && err.response?.status && err.response.status < 500) return;
        toast.error(apiErrorMessage(err));
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (isSilent(mutation.meta)) return;
        const body = (err as AxiosError)?.response?.data as { error?: { code?: string } } | undefined;
        if (DIALOG_ERROR_CODES.has(body?.error?.code ?? '')) return;
        toast.error(apiErrorMessage(err));
      },
    }),
  });
}

export const queryClient = createAppQueryClient();

/**
 * Forget every cached response, so the next person to sign in on this
 * browser never sees the previous one's data (nothing is persisted to
 * storage — the cache lives in memory only).
 */
export function clearSessionCache(client: QueryClient = queryClient): void {
  void client.cancelQueries();
  client.clear();
}

/**
 * Wire `client` to the session: whenever a session ends (logout, a failed
 * token refresh, a deactivated account) or a different user signs in, the
 * cache is dropped. Every one of those paths goes through the auth store.
 * Returns the unsubscribe function.
 */
export function clearCacheOnSessionChange(client: QueryClient = queryClient): () => void {
  return useAuthStore.subscribe((state, prev) => {
    const ended = prev.isAuthenticated && !state.isAuthenticated;
    const switched = !!prev.user && !!state.user && prev.user._id !== state.user._id;
    if (ended || switched) clearSessionCache(client);
  });
}
