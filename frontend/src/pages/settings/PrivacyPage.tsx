import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Cookie, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getComplianceStatus } from '@/lib/compliance.api';
import { readConsent } from '@/components/common/CookieConsent';

/**
 * Settings → Privacy & data: this device's cookie preferences and the
 * user's recent privacy-related activity.
 */
export default function PrivacyPage(): ReactElement {
  const { data: status, isLoading } = useQuery({
    queryKey: ['compliance-status'],
    queryFn: getComplianceStatus,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy & data"
        description="Control your data, consents, and account lifecycle."
        icon={Shield}
        breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Privacy' }]}
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cookie preferences */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-6">
              <div>
                <h3 className="text-base font-semibold">Cookie preferences</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose which cookies this device stores. Current setting:{' '}
                  <CookieSummary />
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  // Clear the saved consent so the banner re-appears on next render
                  localStorage.removeItem('ddhrms.cookie-consent');
                  window.location.reload();
                }}
              >
                <Cookie className="mr-2 h-4 w-4" />
                Change
              </Button>
            </CardContent>
          </Card>

          {/* Recent compliance events */}
          {status?.history && status.history.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-3 text-base font-semibold">Recent privacy activity</h3>
                <ul className="divide-y text-sm">
                  {status.history.map((h) => (
                    <li key={h._id} className="flex items-center justify-between py-2">
                      <span>{prettyEvent(h.metadata?.event ?? h.action)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function CookieSummary(): ReactElement {
  const c = readConsent();
  if (!c) return <Badge variant="secondary">Not set</Badge>;
  const on: string[] = ['Necessary'];
  if (c.analytics) on.push('Analytics');
  if (c.marketing) on.push('Marketing');
  if (c.preferences) on.push('Preferences');
  return <Badge variant="outline">{on.join(', ')}</Badge>;
}

function prettyEvent(event: string): string {
  const map: Record<string, string> = {
    'gdpr.data-export': 'Data export downloaded',
    'consent.recorded': 'Consent updated',
    'gdpr.account-delete': 'Account deletion scheduled',
    'gdpr.tenant-delete': 'Workspace deletion scheduled',
  };
  return map[event] ?? event;
}
