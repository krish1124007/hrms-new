import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Cookie, Loader2, Mail } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getComplianceStatus } from '@/lib/compliance.api';
import { clearConsent, readConsent } from '@/components/common/CookieConsent';
import { SUPPORT_EMAIL } from '@/config/brand';

/**
 * Settings → Privacy: what this browser stores (and the user's choice about
 * error reports), how to ask about personal data, and the user's recent
 * privacy-related activity. Nothing here is a placeholder.
 */
export default function PrivacyPage(): ReactElement {
  const { data: status, isLoading } = useQuery({
    queryKey: ['compliance-status'],
    queryFn: getComplianceStatus,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy"
        description="Your cookie choice on this device and how your personal data is handled."
        icon={Shield}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Privacy' }]}
      />

      {/* Cookie preferences */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Cookies and error reports</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Necessary storage keeps you signed in. Error reports go to Sentry only if you allow
              them. Current setting on this device: <CookieSummary />
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              // Forget the saved choice so the banner asks again.
              clearConsent();
              window.location.reload();
            }}
          >
            <Cookie className="mr-2 h-4 w-4" />
            Change
          </Button>
        </CardContent>
      </Card>

      {/* Personal data requests */}
      <Card>
        <CardContent className="space-y-2 p-6">
          <h3 className="text-base font-semibold">Your personal data</h3>
          <p className="text-sm text-muted-foreground">
            Your employee record is kept by your employer's HR team. To see a copy of it, correct
            it, or ask for it to be deleted, contact HR — or write to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1 text-primary underline">
              <Mail className="size-3.5" /> {SUPPORT_EMAIL}
            </a>
            . The{' '}
            <a href="/privacy-policy.html" target="_blank" rel="noopener" className="text-primary underline">
              privacy policy
            </a>{' '}
            explains what is collected and why.
          </p>
        </CardContent>
      </Card>

      {/* Recent compliance events */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </CardContent>
        </Card>
      ) : status?.history && status.history.length > 0 ? (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-3 text-base font-semibold">Recent privacy activity</h3>
            <ul className="divide-y text-sm">
              {status.history.map((h) => (
                <li key={h._id} className="flex items-center justify-between py-2">
                  <span>{prettyEvent(h.metadata?.event ?? h.action)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Kolkata',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CookieSummary(): ReactElement {
  const c = readConsent();
  if (!c) return <Badge variant="secondary">Not set</Badge>;
  return <Badge variant="outline">{c.analytics ? 'Necessary + error reports' : 'Necessary only'}</Badge>;
}

function prettyEvent(event: string): string {
  const map: Record<string, string> = {
    'gdpr.data-export': 'Data export downloaded',
    'consent.recorded': 'Consent updated',
    'gdpr.account-delete': 'Account deletion requested',
  };
  return map[event] ?? event;
}
