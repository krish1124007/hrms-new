import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ClipboardCheck,
  IndianRupee,
  LogIn,
  Map as MapIcon,
  MapPin,
  Radar,
  Route,
  ShoppingCart,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { LocationMismatchBadge, VisitStatusBadge } from '@/components/field/FieldBits';
import { useCanManageField, useFieldDashboard } from '@/hooks/use-field';
import { apiErrorMessage, isNoEmployeeProfileError } from '@/lib/api-error';
import { personName, type FieldVisit } from '@/lib/field.api';
import { formatCurrency, formatDate, formatTime, todayIST } from '@/lib/format';

const clientName = (v: FieldVisit): string => (typeof v.clientId === 'object' ? v.clientId.name : '—');
const money = (n: number): string => formatCurrency(n, { compact: n >= 100000 });

export default function FieldDashboardPage(): ReactElement {
  const canManage = useCanManageField();
  const { data, isLoading, error } = useFieldDashboard();
  const d = data?.data;
  const today = todayIST();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Sales"
        description={`Today, ${formatDate(`${today}T12:00:00+05:30`)} (IST) — ${canManage ? 'all reps' : 'your activity and your team’s'}`}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales' }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/field/visits">
                <LogIn className="mr-2 size-4" />
                Check in
              </Link>
            </Button>
            <Button asChild>
              <Link to="/field/orders">
                <ShoppingCart className="mr-2 size-4" />
                Orders
              </Link>
            </Button>
          </div>
        }
      />

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="field activity" />
      ) : error ? (
        <p className="text-sm text-destructive">{apiErrorMessage(error, "Couldn't load today's figures")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Visits today" value={d?.visitsToday ?? 0} icon={MapPin} />
          <StatCard label="Tasks completed today" value={d?.tasksCompleted ?? 0} icon={ClipboardCheck} />
          <StatCard
            label={`Orders today (${d?.orders.count ?? 0})`}
            value={d?.orders.total ?? 0}
            format={money}
            icon={ShoppingCart}
          />
          <StatCard
            label={`Collected today (${d?.payments.count ?? 0})`}
            value={d?.payments.total ?? 0}
            format={money}
            icon={IndianRupee}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {canManage && (
          <Link to="/field/tracking" className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40">
            <Radar className="mb-2 size-5 text-primary" />
            <div className="font-medium">Live map</div>
            <div className="text-xs text-muted-foreground">Where every rep is right now</div>
          </Link>
        )}
        <Link
          to={`/field/trail?date=${today}`}
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <Route className="mb-2 size-5 text-primary" />
          <div className="font-medium">Trails</div>
          <div className="text-xs text-muted-foreground">Replay a rep&apos;s route for any day</div>
        </Link>
        <Link to="/field/clients/map" className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40">
          <MapIcon className="mb-2 size-5 text-primary" />
          <div className="font-medium">Client map</div>
          <div className="text-xs text-muted-foreground">Clients by location and category</div>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Today&apos;s visits
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !d?.recentActivity?.length ? (
            <p className="text-sm text-muted-foreground">No visits yet today.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {d.recentActivity.map((v) => (
                <li key={v._id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{clientName(v)}</span>
                      <VisitStatusBadge status={v.status} />
                      {v.locationMismatch && <LocationMismatchBadge distanceM={v.distanceFromClientM} />}
                    </div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {personName(v.employeeId) !== '—' ? `${personName(v.employeeId)} · ` : ''}
                      {v.purpose}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatTime(v.checkIn?.time ?? v.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
