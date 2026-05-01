import type { ReactElement } from 'react';
import { MapPin, ShoppingCart, IndianRupee, ClipboardCheck, Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFieldDashboard } from '@/hooks/use-field';
import type { FieldVisit } from '@/lib/field.api';

export const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

function clientName(v: FieldVisit): string {
  return typeof v.clientId === 'object' ? v.clientId.name : '—';
}

function employeeName(v: FieldVisit): string {
  if (typeof v.employeeId === 'object') {
    return `${v.employeeId.firstName} ${v.employeeId.lastName}`;
  }
  return '';
}

export default function FieldDashboardPage(): ReactElement {
  const { data, isLoading } = useFieldDashboard();
  const d = data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Dashboard"
        description="Live overview of field sales activity"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales' }]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Visits Today" value={d?.visitsToday ?? 0} icon={MapPin} />
        <StatCard
          label="Tasks Completed"
          value={d?.tasksCompleted ?? 0}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Orders Today"
          value={d?.orders.total ?? 0}
          format={inr}
          icon={ShoppingCart}
        />
        <StatCard
          label="Collected Today"
          value={d?.payments.total ?? 0}
          format={inr}
          icon={IndianRupee}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !d?.recentActivity?.length ? (
            <p className="text-sm text-muted-foreground">No activity today</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {d.recentActivity.map((v) => (
                <li
                  key={v._id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{clientName(v)}</span>
                      <Badge
                        variant={v.status === 'completed' ? 'success' : 'secondary'}
                      >
                        {v.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {employeeName(v)} • {v.purpose}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
