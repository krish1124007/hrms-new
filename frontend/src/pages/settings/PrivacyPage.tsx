import { useState, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Cookie, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getComplianceStatus, updateConsent, deleteAccount } from '@/lib/compliance.api';
import { readConsent } from '@/components/common/CookieConsent';

/**
 * Settings → Privacy & data. Wires all the Section-10 compliance APIs into
 * a user-facing page:
 *   - Export my data       (GDPR Art. 15/20)
 *   - Marketing consent    (revocable any time)
 *   - Cookie preferences   (opens the banner again)
 *   - Delete my account    (GDPR Art. 17, 30-day grace)
 *   - Delete workspace     (super-admin only, very dangerous)
 */
export default function PrivacyPage(): ReactElement {
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['compliance-status'],
    queryFn: getComplianceStatus,
  });

  const consentMutation = useMutation({
    mutationFn: updateConsent,
    onSuccess: () => {
      toast.success('Consent updated');
      void qc.invalidateQueries({ queryKey: ['compliance-status'] });
    },
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
          {/* Marketing + analytics consent */}
    

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

          {/* Danger zone */}
       
        </>
      )}
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): ReactElement {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-border"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
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

/* ─────────────── Delete my account ─────────────── */

function DeleteAccountForm(): ReactElement {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      deleteAccount({
        password,
        confirmation: confirmation as 'DELETE MY ACCOUNT',
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success(
        'Account scheduled for deletion. You have 30 days to cancel by contacting support.',
      );
      // User's session is gone — redirect
      setTimeout(() => {
        window.location.href = '/login';
      }, 2500);
    },
  });

  if (!open) {
    return (
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete my account
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Your data is hard-deleted 30 days after request. Contact support to cancel during that
          window.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">
        Deleting your account is permanent after 30 days. This cannot be undone once the grace
        period ends.
      </p>
      <div>
        <Label>Your password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <Label>Type DELETE MY ACCOUNT to confirm</Label>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="DELETE MY ACCOUNT"
        />
      </div>
      <div>
        <Label>Reason (optional)</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={mutation.isPending || confirmation !== 'DELETE MY ACCOUNT' || !password}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
        </Button>
      </div>
    </div>
  );
}

