import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, X } from 'lucide-react';

/**
 * Cookie / storage consent banner.
 *
 * The app stores two kinds of things in the browser, and the banner asks
 * about exactly those:
 *   - **necessary** — the sign-in session, theme and sidebar layout. Always on.
 *   - **analytics** — Sentry error reports (with a masked replay of the
 *     moments before an error). Off until the user agrees; `main.tsx` only
 *     starts Sentry when this is true.
 *
 * Consent lives in this browser's localStorage. "Accept" and "Reject" are
 * equally prominent.
 */

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  version: number;
  recordedAt: string;
}

const STORAGE_KEY = 'ddhrms.cookie-consent';
const CURRENT_VERSION = 1;

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

function writeConsent(analytics: boolean): CookieConsent {
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

export function CookieConsentBanner(): ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  const save = (allowAnalytics: boolean): void => {
    writeConsent(allowAnalytics);
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg sm:p-6"
      role="dialog"
      aria-label="Cookie preferences"
      aria-modal="false"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex gap-3 lg:flex-1">
          <Cookie className="mt-0.5 h-6 w-6 flex-shrink-0 text-muted-foreground" aria-hidden />
          <div className="text-sm">
            <div className="mb-1 font-semibold">Cookies and error reports</div>
            <p className="text-muted-foreground">
              We store what keeps you signed in. With your permission we also send error reports
              to Sentry so we can fix bugs — text and inputs in them are masked. There is no
              advertising or marketing tracking. Read our{' '}
              <a href="/privacy-policy.html" target="_blank" rel="noopener" className="underline hover:text-foreground">
                privacy policy
              </a>{' '}
              for details.
            </p>

            {expanded && (
              <div className="mt-4 space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Category
                  label="Necessary"
                  description="Sign-in session, theme and layout preferences. Always on."
                  locked
                />
                <Category
                  label="Error reports (analytics)"
                  description="Sentry error reports, including a masked replay of the moments before an error."
                  checked={analytics}
                  onChange={setAnalytics}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
          {!expanded ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
                Customise
              </Button>
              <Button size="sm" variant="outline" onClick={() => save(false)}>
                Necessary only
              </Button>
              <Button size="sm" onClick={() => save(true)}>
                Accept all
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setExpanded(false)} aria-label="Back">
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => save(analytics)}>
                Save selection
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Category({
  label,
  description,
  checked,
  onChange,
  locked,
}: {
  label: string;
  description: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}): ReactElement {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={locked ? true : (checked ?? false)}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 rounded border-border"
      />
      <div className="flex-1">
        <div className="font-medium text-foreground">
          {label}
          {locked && <span className="ml-2 text-xs text-muted-foreground">(always on)</span>}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}
