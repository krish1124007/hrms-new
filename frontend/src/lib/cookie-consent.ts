/**
 * The user's cookie choice, kept in this browser's localStorage.
 *
 *   - **necessary** — sign-in session, theme and layout. Always on.
 *   - **analytics** — Sentry error reports. `main.tsx` starts Sentry only
 *     when this is true.
 */
export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  version: number;
  recordedAt: string;
}

const STORAGE_KEY = 'ddhrms.cookie-consent';
/**
 * Bump when what a choice covers changes, so everyone is asked again.
 * v2: crash reports may now include the field-sales pages (maps, live
 * locations) — choices made under v1 never covered those.
 */
const CURRENT_VERSION = 2;

export function readConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CURRENT_VERSION) return null; // re-prompt on version bump
    return parsed;
  } catch {
    return null;
  }
}

/** Forget the saved choice so the banner asks again (Settings → Privacy). */
export function clearConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing was saved either.
  }
}

export function writeConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    necessary: true,
    analytics,
    version: CURRENT_VERSION,
    recordedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Storage unavailable — the banner will simply ask again next visit.
  }
  // Let the app react (Sentry starts or stops) without polling localStorage.
  window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: consent }));
  return consent;
}
