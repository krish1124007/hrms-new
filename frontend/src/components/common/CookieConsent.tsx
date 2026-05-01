import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, X } from 'lucide-react';

/**
 * GDPR / ePrivacy cookie consent banner.
 *
 * Shows on first visit + whenever the stored consent version doesn't match
 * `CURRENT_VERSION`. Consent is stored in localStorage (so it persists across
 * sessions on the same device) plus optionally pushed to the backend for
 * cross-device sync — see hooks/use-cookie-consent.ts.
 *
 * Four categories (matches the ICO guidance):
 *   - **necessary**   — always on, never prompts (login session etc.)
 *   - **analytics**   — e.g. Sentry session replay, product analytics
 *   - **marketing**   — retargeting pixels, email open tracking
 *   - **preferences** — theme / language saved across devices
 *
 * "Accept all" and "Reject non-essential" are equally prominent (a dark-
 * pattern-free design — not burying the reject button in a modal).
 */

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
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

function writeConsent(partial: Partial<Omit<CookieConsent, 'necessary' | 'version' | 'recordedAt'>>): CookieConsent {
  const consent: CookieConsent = {
    necessary: true,
    analytics: partial.analytics ?? false,
    marketing: partial.marketing ?? false,
    preferences: partial.preferences ?? false,
    version: CURRENT_VERSION,
    recordedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  // Emit a custom event so other parts of the app (analytics init, Sentry,
  // etc.) can react without having to poll localStorage.
  window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: consent }));
  return consent;
}

export function CookieConsentBanner(): ReactElement | null {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [granular, setGranular] = useState({ analytics: false, marketing: false, preferences: false });

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  if (!visible) return null;

  const acceptAll = (): void => {
    writeConsent({ analytics: true, marketing: true, preferences: true });
    setVisible(false);
  };
  const rejectAll = (): void => {
    writeConsent({ analytics: false, marketing: false, preferences: false });
    setVisible(false);
  };
  const saveSelection = (): void => {
    writeConsent(granular);
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
            <div className="mb-1 font-semibold">We use cookies</div>
            <p className="text-muted-foreground">
              Necessary cookies keep you signed in. With your permission, we'd also like to use
              cookies for analytics (to fix bugs and improve the product), marketing (to measure
              campaign effectiveness), and preferences (to remember your theme across devices).
              Read our{' '}
              <a href="/privacy" className="underline hover:text-foreground">privacy policy</a>
              {' '}for details.
            </p>

            {expanded && (
              <div className="mt-4 space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                <Category label="Necessary" description="Login sessions, CSRF tokens. Always on." locked />
                <Category
                  label="Analytics"
                  description="Sentry session replay + product-usage events to help us fix bugs and prioritise features."
                  checked={granular.analytics}
                  onChange={(v) => setGranular((g) => ({ ...g, analytics: v }))}
                />
                <Category
                  label="Marketing"
                  description="Conversion tracking for email campaigns + retargeting on referral sources."
                  checked={granular.marketing}
                  onChange={(v) => setGranular((g) => ({ ...g, marketing: v }))}
                />
                <Category
                  label="Preferences"
                  description="Remember your theme + language across devices (requires an account)."
                  checked={granular.preferences}
                  onChange={(v) => setGranular((g) => ({ ...g, preferences: v }))}
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
              <Button size="sm" variant="outline" onClick={rejectAll}>
                Reject non-essential
              </Button>
              <Button size="sm" onClick={acceptAll}>
                Accept all
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setExpanded(false)}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={saveSelection}>
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
