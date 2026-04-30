import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CalendarOff,
  ClipboardList,
  FileText,
  Plus,
  Receipt,
  TrendingUp,
  UserCheck,
  Users,
  Cake,
  Activity,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { OnboardingChecklist } from '@/components/common/OnboardingChecklist';
import { dashboardApi } from '@/lib/dashboard.api';

/**
 * Tenant-level dashboard — every card is live data now.
 *
 * Parallel queries:
 *   - /dashboard/overview           → module summary cards
 *   - /dashboard/attendance-trend   → 7-day chart
 *   - /dashboard/upcoming           → birthdays + leaves
 *   - /dashboard/recent-activity    → audit feed
 *
 * All four are cached server-side (30s–5m) via cacheFor() middleware,
 * so a dashboard refresh hits Redis, not the DB.
 */

export default function DashboardPage(): ReactElement {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const overview = useQuery({ queryKey: ['dashboard', 'overview'], queryFn: dashboardApi.overview });
  const trend = useQuery({
    queryKey: ['dashboard', 'attendance-trend'],
    queryFn: dashboardApi.attendanceTrend,
  });
  const upcoming = useQuery({
    queryKey: ['dashboard', 'upcoming'],
    queryFn: dashboardApi.upcoming,
  });
  const activity = useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: dashboardApi.recentActivity,
  });

  const emp = overview.data?.employees;
  const att = overview.data?.attendance;
  const lv = overview.data?.leaves;

  // Map ISO date → short "Mon / Tue / …" for the x-axis
  const trendData =
    trend.data?.map((d) => ({
      ...d,
      day: new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' }),
    })) ?? [];

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      <PageHeader
        title={`Welcome back, ${user?.firstName ?? 'there'}`}
        description={today}
        actions={
          <>
            <Link to="/employees">
              <Button variant="outline" size="sm">
                <FileText className="size-4" /> Reports
              </Button>
            </Link>
            <Link to="/employees/new">
              <Button size="sm">
                <Plus className="size-4" /> Add Employee
              </Button>
            </Link>
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Employees"
          value={overview.isLoading ? <InlineSkel /> : emp?.total ?? 0}
          icon={Users}
          trend={emp?.newThisMonth ? { value: emp.newThisMonth, direction: 'up' } : undefined}
        />
        <StatCard
          label="Present Today"
          value={overview.isLoading ? <InlineSkel /> : att?.presentToday ?? 0}
          icon={UserCheck}
        />
        <StatCard
          label="On Leave Today"
          value={overview.isLoading ? <InlineSkel /> : lv?.onLeaveToday ?? 0}
          icon={CalendarOff}
        />
        <StatCard
          label="Pending Requests"
          value={overview.isLoading ? <InlineSkel /> : lv?.pendingRequests ?? 0}
          icon={ClipboardList}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.5rem',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="present" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="late" stackId="a" fill="hsl(var(--warning, 38 92% 50%))" />
                  <Bar dataKey="leave" stackId="a" fill="hsl(var(--chart-3, 210 100% 60%))" />
                  <Bar
                    dataKey="absent"
                    stackId="a"
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Upcoming: birthdays + leaves */}
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UpcomingSection
              title="Birthdays"
              icon={Cake}
              loading={upcoming.isLoading}
              empty="No birthdays in the next 7 days"
              items={(upcoming.data?.birthdays ?? []).map((b) => ({
                key: b._id,
                label: `${b.firstName} ${b.lastName}`,
                detail: new Date(b.dob).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                }),
              }))}
            />
            <UpcomingSection
              title="On leave"
              icon={CalendarOff}
              loading={upcoming.isLoading}
              empty="No leaves scheduled"
              items={(upcoming.data?.leaves ?? []).map((l) => ({
                key: l._id,
                label: l.employee
                  ? `${l.employee.firstName} ${l.employee.lastName}`
                  : 'Team member',
                detail: `${new Date(l.startDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })} → ${new Date(l.endDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}`,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* Activity + quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !activity.data?.length ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-4">
                {activity.data.slice(0, 10).map((act) => (
                  <li key={act._id} className="flex items-start gap-3">
                    <div className="rounded-lg bg-muted p-2 text-primary">
                      <Activity className="size-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {act.userId?.firstName ? `${act.userId.firstName} ${act.userId.lastName}` : 'System'}{' '}
                        <span className="text-muted-foreground">
                          {act.action} {act.entity}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(act.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/employees/new">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="size-4" /> Add Employee
              </Button>
            </Link>
            <Link to="/payroll">
              <Button variant="outline" className="w-full justify-start">
                <Receipt className="size-4" /> Process Payroll
              </Button>
            </Link>
            <Link to="/crm">
              <Button variant="outline" className="w-full justify-start">
                <TrendingUp className="size-4" /> View CRM
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InlineSkel(): ReactElement {
  return <Skeleton className="inline-block h-6 w-12 align-middle" />;
}

function UpcomingSection({
  title,
  icon: Icon,
  loading,
  items,
  empty,
}: {
  title: string;
  icon: typeof Cake;
  loading: boolean;
  items: Array<{ key: string; label: string; detail: string }>;
  empty: string;
}): ReactElement {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </div>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 4).map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
