import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

const ACCESS_TOKEN_KEY = 'opencore.accessToken';
const REFRESH_TOKEN_KEY = 'opencore.refreshToken';

export const tokenStorage = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (access: string, refresh: string): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/**
 * How long a request may take before it fails with `ECONNABORTED` — without
 * one a stalled request spins forever and its form can never be retried.
 * (Money writes carry an `Idempotency-Key`, so retrying after a timeout that
 * went through replays the first result instead of booking twice.)
 */
export const REQUEST_TIMEOUT_MS = 60_000;
/** File uploads/downloads and bulk server jobs (payroll runs, imports, backfills) get longer. */
export const TRANSFER_TIMEOUT_MS = 10 * 60_000;

/** Endpoints whose work grows with the company size — never cut off at the default timeout. */
const LONG_RUNNING: readonly RegExp[] = [
  /\/payroll\/cycles\/[^/]+\/(process|generate-payslips|lock|mark-paid|settle)$/,
  /\/attendance\/close-days?$/,
  /\/leaves\/balances\/(open-year|reset|allocate)/,
  /\/backups/,
  /\/(employees|assets|field\/clients)\/import$/,
  /\/holidays\/(import-calendar|rollover)$/,
  /\/export\b/,
  /\/reports?\b/,
];

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/** A request that moves a file (multipart body, binary response) or runs a bulk server job. */
export function isTransfer(config: Pick<InternalAxiosRequestConfig, 'data' | 'responseType' | 'url'>): boolean {
  const url = (config.url ?? '').split('?')[0] ?? '';
  return (
    (typeof FormData !== 'undefined' && config.data instanceof FormData) ||
    config.responseType === 'blob' ||
    config.responseType === 'arraybuffer' ||
    LONG_RUNNING.some((re) => re.test(url))
  );
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  if (config.timeout === REQUEST_TIMEOUT_MS && isTransfer(config)) config.timeout = TRANSFER_TIMEOUT_MS;
  return config;
});

let isRefreshing = false;

/** Requests that hit a 401 while a refresh was already in flight. */
interface PendingRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}
let pendingRequests: PendingRequest[] = [];

const resolveQueue = (token: string): void => {
  const queued = pendingRequests;
  pendingRequests = [];
  queued.forEach(({ resolve }) => resolve(token));
};

const rejectQueue = (error: unknown): void => {
  const queued = pendingRequests;
  pendingRequests = [];
  queued.forEach(({ reject }) => reject(error));
};

const MAX_NETWORK_RETRIES = 2;

function shouldRetryNetworkError(err: AxiosError): boolean {
  if (err.code !== 'ERR_NETWORK' && err.code !== 'ECONNABORTED') return false;
  const method = err.config?.method?.toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

/**
 * Auth endpoints whose 401 responses must propagate to the caller verbatim
 * (wrong-password, expired reset-link, etc.). The refresh-token interceptor
 * below only kicks in for tokens that *were* valid and just expired — it has
 * no business redirecting users who just typed the wrong password on the
 * login form.
 */
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/accept-invite',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
];

const isAuthEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return AUTH_ENDPOINTS.some((ep) => url.includes(ep));
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _netRetryCount?: number;
    };

    if (shouldRetryNetworkError(error) && originalRequest) {
      originalRequest._netRetryCount = (originalRequest._netRetryCount ?? 0) + 1;
      if (originalRequest._netRetryCount <= MAX_NETWORK_RETRIES) {
        const delay = 500 * 2 ** (originalRequest._netRetryCount - 1);
        await new Promise((r) => setTimeout(r, delay));
        return api(originalRequest);
      }
    }

    // Skip the refresh-token dance entirely for auth endpoints — those errors
    // are user-actionable (wrong creds, expired reset link) and must surface.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (token) => {
              originalRequest.headers.set('Authorization', `Bearer ${token}`);
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        const refresh = tokenStorage.getRefresh();
        if (!refresh) throw new Error('No refresh token');

        const { data } = await axios.post<{
          success: boolean;
          data: { accessToken: string; refreshToken: string };
        }>(`${API_BASE_URL}/auth/refresh-token`, { refreshToken: refresh });

        tokenStorage.set(data.data.accessToken, data.data.refreshToken);
        isRefreshing = false;
        resolveQueue(data.data.accessToken);
        originalRequest.headers.set('Authorization', `Bearer ${data.data.accessToken}`);
        return api(originalRequest);
      } catch (refreshError) {
        // Reset the flag here rather than in a `finally`: a 401 that lands
        // during the lazy import below must not queue behind a refresh that
        // has already failed, and a later reset would clobber its own refresh.
        isRefreshing = false;
        tokenStorage.clear();
        // Every request queued behind this refresh fails with it — leaving
        // them pending would hang their callers forever.
        rejectQueue(refreshError);
        // Drop the persisted session before navigating, so /login does not
        // boot with `isAuthenticated: true` and bounce straight back. The
        // store imports auth.api → axios, so load it lazily to avoid a cycle.
        try {
          const { useAuthStore } = await import('@/stores/auth.store');
          useAuthStore.getState().clear();
        } catch {
          // The tokens are already gone; the next guarded route redirects.
        }
        // Only force-redirect if we're not already on /login — otherwise we'd
        // hard-reload the login page and swallow any pending error toast.
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
