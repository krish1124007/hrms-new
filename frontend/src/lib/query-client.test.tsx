import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { api, tokenStorage } from './axios';
import { authApi, type AuthUser } from './auth.api';
import { clearCacheOnSessionChange, createAppQueryClient } from './query-client';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores/auth.store';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

const ALICE: AuthUser = { _id: 'u-alice', email: 'alice@example.com' };
const BOB: AuthUser = { _id: 'u-bob', email: 'bob@example.com' };

function unauthorized(config?: InternalAxiosRequestConfig): AxiosError {
  const response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, null, response);
}

const cachedKeys = (client: ReturnType<typeof createAppQueryClient>): string[] =>
  client
    .getQueryCache()
    .getAll()
    .map((q) => JSON.stringify(q.queryKey));

describe('the query cache follows the session', () => {
  let client: ReturnType<typeof createAppQueryClient>;
  let unsubscribe: () => void;

  beforeEach(() => {
    client = createAppQueryClient();
    unsubscribe = clearCacheOnSessionChange(client);
    useAuthStore.getState().setSession({ user: ALICE });
    client.setQueryData(['employees', 'me'], { name: 'Alice' });
    client.setQueryData(['payroll', 'my-payslips'], [{ net: 50_000 }]);
  });

  afterEach(() => {
    unsubscribe();
    useAuthStore.getState().clear();
    tokenStorage.clear();
    vi.restoreAllMocks();
  });

  it('is emptied by logout, so the next user never sees the previous one’s data', async () => {
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    unsubscribe(); // logout clears the cache by itself, not only through the store subscription
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(cachedKeys(client)).toHaveLength(2);

    await act(() => result.current.logout());

    expect(cachedKeys(client)).toEqual([]);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('is emptied when a token refresh fails and the session is dropped', async () => {
    const originalAdapter = api.defaults.adapter;
    window.history.replaceState({}, '', '/dashboard');
    tokenStorage.set('expired-access', 'dead-refresh');
    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      throw unauthorized(config);
    }) as AxiosAdapter;
    vi.spyOn(axios, 'post').mockRejectedValue(unauthorized());
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom cannot navigate

    try {
      await expect(api.get('/employees/me')).rejects.toBeInstanceOf(AxiosError);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(cachedKeys(client)).toEqual([]);
    } finally {
      api.defaults.adapter = originalAdapter;
    }
  });

  it('is emptied when a different user signs in, and kept when the same user’s profile is re-read', () => {
    useAuthStore.getState().setSession({ user: { ...ALICE, firstName: 'Alice' } });
    expect(cachedKeys(client)).toHaveLength(2);

    useAuthStore.getState().setSession({ user: BOB });
    expect(cachedKeys(client)).toEqual([]);
  });
});

describe('mutation errors', () => {
  afterEach(() => vi.clearAllMocks());

  it('are toasted exactly once, by the global handler', async () => {
    const client = createAppQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const conflict = new AxiosError('Request failed with status code 409', AxiosError.ERR_BAD_REQUEST, undefined, null, {
      status: 409,
      statusText: 'Conflict',
      data: { success: false, error: { code: 'INVALID_STATUS_TRANSITION', message: 'A deposited payment cannot become collected' } },
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    } as AxiosResponse);
    const { result } = renderHook(() => useMutation({ mutationFn: () => Promise.reject(conflict) }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('A deposited payment cannot become collected');
  });

  it('stay quiet for a silent mutation', async () => {
    const client = createAppQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useMutation({ mutationFn: () => Promise.reject(new Error('nope')), meta: { silent: true } }),
      { wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
