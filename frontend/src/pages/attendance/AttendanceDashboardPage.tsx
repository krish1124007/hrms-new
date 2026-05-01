import { useEffect, useState, type ReactElement } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  CalendarOff,
  UserX,
  RefreshCw,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAttendanceDashboard } from '@/hooks/use-attendance';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'];

function relativeTime(from: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function AttendanceDashboardPage(): ReactElement {
  const { data, dataUpdatedAt, isFetching, refetch } = useAttendanceDashboard();
  const stats = data?.data.totals;
  const heatmap = data?.data.heatmap ?? [];
  const lateComers = data?.data.lateComers ?? [];

  // Tick the "X seconds ago" label every second without re-fetching.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pieData = stats
    ? [
        { name: 'Present', value: stats.present },
        { name: 'Late', value: stats.late },
        { name: 'Half Day', value: stats.halfDay },
        { name: 'On Leave', value: stats.onLeave },
        { name: 'Absent', value: stats.absent },
      ]
    : [];

  const maxHeat = Math.max(1, ...heatmap.map((h) => h.present));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Dashboard"
        description="Live workforce attendance — refreshes automatically every 30 seconds"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Attendance' }]}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={
                  'inline-block size-2 rounded-full ' +
                  (isFetching ? 'bg-primary animate-pulse' : 'bg-success')
                }
                aria-hidden
              />
              {dataUpdatedAt
                ? `Updated ${relativeTime(dataUpdatedAt)}`
                : 'Loading…'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={'size-4 ' + (isFetching ? 'animate-spin' : '')} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Employees" value={stats?.totalEmployees ?? 0} icon={Users} />
        <StatCard label="Present" value={stats?.present ?? 0} icon={UserCheck} />
        <StatCard label="Late" value={stats?.late ?? 0} icon={Clock} />
        <StatCard label="Half Day" value={stats?.halfDay ?? 0} icon={AlertTriangle} />
        <StatCard label="On Leave" value={stats?.onLeave ?? 0} icon={CalendarOff} />
        <StatCard label="Absent" value={stats?.absent ?? 0} icon={UserX} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today's status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  label
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Late comers today</CardTitle>
          </CardHeader>
          <CardContent>
            {lateComers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No late entries today</p>
            ) : (
              <div className="space-y-2">
                {lateComers.map((r) => {
                  const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
                  return (
                    <div
                      key={r._id}
                      className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                    >
                      <span>{emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'}</span>
                      <span className="font-medium text-warning">+{r.lateBy} min</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>30-day attendance heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-10 gap-2 sm:grid-cols-15 md:grid-cols-30">
            {heatmap.map((h) => {
              const intensity = h.present / maxHeat;
              return (
                <div
                  key={h._id}
                  title={`${h._id}: ${h.present} present`}
                  className="aspect-square rounded-sm border border-border"
                  style={{
                    backgroundColor: `rgba(16, 185, 129, ${0.15 + intensity * 0.85})`,
                  }}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
