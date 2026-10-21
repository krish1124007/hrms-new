import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App.tsx';
import { ThemeProvider } from './providers/ThemeProvider.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { CookieConsentBanner } from './components/common/CookieConsent';
import { readConsent } from './lib/cookie-consent';
import { initSentry } from './lib/sentry';
import { clearCacheOnSessionChange, queryClient } from './lib/query-client';
import { purgeLegacyStorage } from './lib/legacy-storage';
import './index.css';

// Install Sentry only if the user gave analytics consent (ePrivacy/GDPR).
// If no consent recorded yet, skip init; the banner will trigger a reload
// on save so Sentry picks up the consent on the next page load.
const consent = readConsent();
if (consent?.analytics) initSentry();
// Refresh the app when consent changes so Sentry init + analytics
// subscribe to the new state without a full mental-model split.
window.addEventListener('cookie-consent-changed', () => {
  window.location.reload();
});

// Data an older build left in this browser (e.g. a full employee form draft).
purgeLegacyStorage();

// Logout, a failed token refresh or a different user signing in drops every
// cached response, so nobody sees the previous user's data.
clearCacheOnSessionChange(queryClient);

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
