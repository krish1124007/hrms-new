import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AxiosError } from 'axios';
import App from './App.tsx';
import { ThemeProvider } from './providers/ThemeProvider.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { CookieConsentBanner, readConsent } from './components/common/CookieConsent';
import { initSentry } from './lib/sentry';
import './i18n'; // side-effect init — must run before any component renders
import './index.css';

// Install Sentry only if the user gave analytics consent (ePrivacy/GDPR).
// If no consent recorded yet, skip init; the banner will trigger a reload
// on save so Sentry picks up the consent on the next page load.
const consent = readConsent();
if (consent?.analytics) initSentry();
// Refresh the app when consent changes so Sentry init + analytics
// subscribe to the new state without a full mental-model split.
window.addEventListener('cookie-consent-changed', () => {
  // eslint-disable-next-line no-console
  console.info('[consent] updated — reloading to apply');
  window.location.reload();
});

/**
 * Extract a user-facing message from an arbitrary error.
 * Handles Axios + our standard `{ error: { message } }` envelope.
 */
function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = err.response?.data as any;
    if (body?.error?.message) return body.error.message as string;
    if (err.code === 'ERR_NETWORK') return 'Network error — check your connection';
    if (err.response?.status === 401) return 'Session expired — please sign in again';
    if (err.response?.status === 429) {
      return body?.error?.message ?? 'Too many requests — please slow down';
    }
    return err.message;
  }
  return (err as Error)?.message ?? 'Something went wrong';
}

/**
 * Query errors: only toast on server (5xx) or unrecognised — 4xx is the
 * component's job to render inline. Mutations always toast: user just
 * clicked something and expects feedback. Opt-out per-call via
 * `meta: { silent: true }`.
 */
const queryClient = new QueryClient({
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const silent = (query.meta as any)?.silent;
      if (silent) return;
      if (err instanceof AxiosError && err.response?.status && err.response.status < 500) {
        return;
      }
      toast.error(errorMessage(err));
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const silent = (mutation.meta as any)?.silent;
      if (silent) return;
      toast.error(errorMessage(err));
    },
  }),
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    {/* Root boundary: catches any render error so the browser never
        shows a white screen. Nested ErrorBoundary inside the router
        scopes route-level errors to the dashboard's main area. */}
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <App />
          <OfflineIndicator />
          <CookieConsentBanner />
          <Toaster richColors position="top-right" closeButton />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
