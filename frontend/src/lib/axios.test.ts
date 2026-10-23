import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isTransfer, tokenStorage } from './axios';
import { useAuthStore } from '@/stores/auth.store';
import type { AuthUser } from './auth.api';

const USER: AuthUser = { _id: 'u1', email: 'someone@example.com' };

function unauthorized(config?: InternalAxiosRequestConfig): AxiosError {
  const response = {
    status: 401,
    statusText: 'Unauthorized',
    data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Token expired' } },
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError(
    'Request failed with status code 401',
    AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  );
}

/** Settles to which way the promise went, or 'pending' if it has not within `ms`. */
function outcome(p: Promise<unknown>, ms = 200): Promise<'resolved' | 'rejected' | 'pending'> {
  return Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

describe('api refresh-token failure', () => {
  const originalAdapter = api.defaults.adapter;

  beforeEach(() => {
    window.history.replaceState({}, '', '/dashboard');
    tokenStorage.set('expired-access', 'dead-refresh');
    useAuthStore.getState().setSession({ user: USER });
    // Every API call answers 401, as an expired access token would.
    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      throw unauthorized(config);
    }) as AxiosAdapter;
    // jsdom cannot navigate; it reports the /login redirect on console.error.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
    tokenStorage.clear();
    useAuthStore.getState().clear();
  });

  it('clears the session and rejects every queued request when the refresh call returns 401', async () => {
    let failRefresh: (err: unknown) => void = () => undefined;
    const refreshCall = new Promise<never>((_resolve, reject) => {
      failRefresh = reject;
    });
    vi.spyOn(axios, 'post').mockReturnValue(refreshCall);

    const first = api.get('/employees');
    const second = api.get('/departments');
    // Let both 401s reach the interceptor: one starts the refresh, the other queues behind it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(axios.post).toHaveBeenCalledTimes(1);

    failRefresh(unauthorized());

    await expect(first).rejects.toBeInstanceOf(AxiosError);
    expect(await outcome(second)).toBe('rejected');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(tokenStorage.getAccess()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
  });
});

describe('request timeouts', () => {
  it('gives bulk server jobs and file transfers the long timeout, plain JSON calls the default', () => {
    expect(isTransfer({ url: '/payroll/cycles/abc123/process', data: undefined, responseType: undefined })).toBe(true);
    expect(isTransfer({ url: '/attendance/close-days', data: undefined, responseType: undefined })).toBe(true);
    expect(isTransfer({ url: '/leaves/balances/open-year', data: undefined, responseType: undefined })).toBe(true);
    expect(isTransfer({ url: '/employees/export?format=csv', data: undefined, responseType: undefined })).toBe(true);
    expect(isTransfer({ url: '/field/reports/daily', data: undefined, responseType: 'blob' })).toBe(true);
    expect(isTransfer({ url: '/employees', data: undefined, responseType: undefined })).toBe(false);
    expect(isTransfer({ url: '/payroll/cycles/abc123', data: undefined, responseType: undefined })).toBe(false);
  });

  it('gives the site import the long timeout and no longer names the old client import', () => {
    expect(isTransfer({ url: '/field/sites/import', data: undefined, responseType: undefined })).toBe(true);
    expect(isTransfer({ url: '/field/clients/import', data: undefined, responseType: undefined })).toBe(false);
  });
});
