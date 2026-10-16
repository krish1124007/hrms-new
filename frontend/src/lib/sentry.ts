import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry for the web dashboard. Activates only when
 * `VITE_SENTRY_DSN` is set — keeps dev/preview builds free of network
 * calls to Sentry.
 *
 * Once initialised, this also installs a `window.__errorReporter` hook
 * so the existing ErrorBoundary forwards caught errors to Sentry
 * without needing a direct import.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: parseFloat(
      (import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined) ?? '0.1',
    ),
    // Session replay on errors only — cheap + privacy-friendly
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text + inputs by default for PII safety;
        // unmask specific selectors via `unmask` attribute.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__errorReporter = (err: Error, info: unknown) => {
    Sentry.captureException(err, { extra: { info } });
  };
}

/** Set the current user on every event (call after login / logout). */
export function setSentryUser(user: { id: string; email?: string; tenantId?: string } | null): void {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
    segment: user.tenantId, // tenant-based cohorting
  });
}

export { Sentry };
