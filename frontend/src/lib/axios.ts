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

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

const processQueue = (token: string): void => {
  pendingRequests.forEach((cb) => cb(token));
  pendingRequests = [];
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
  '/auth/register',
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
        return new Promise((resolve) => {
          pendingRequests.push((token) => {
            originalRequest.headers.set('Authorization', `Bearer ${token}`);
            resolve(api(originalRequest));
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
        processQueue(data.data.accessToken);
        originalRequest.headers.set('Authorization', `Bearer ${data.data.accessToken}`);
        return api(originalRequest);
      } catch (refreshError) {
        tokenStorage.clear();
        // Only force-redirect if we're not already on /login — otherwise we'd
        // hard-reload the login page and swallow any pending error toast.
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
