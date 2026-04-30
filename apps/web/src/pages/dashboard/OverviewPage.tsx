import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarOff,
  CheckCircle2,
  Loader2,
  MapPin,
  Target,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAnalytics, type AnalyticsData } from '@/lib/analytics.api';

const DEPT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
const LEAVE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function formatINR(amount: number, compact = false): string {
  if (compact) {
    if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
    if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2)}L`;
    if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function OverviewPage(): ReactElement {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalytics,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Analytics Overview"
          description="Live business insights, trends, and forecasts across every module"
        />
        <Card>
          <CardContent className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OverviewContent data={data} />;
}

function OverviewContent({ data }: { data: AnalyticsData }): ReactElement {
  const headcountWithColor = data.headcountByDepartment.map((d, i) => ({
    ...d,
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  }));
  const leaveWithColor = data.leaveDistribution.map((l, i) => ({
    ...l,
    color: LEAVE_COLORS[i % LEAVE_COLORS.length],
  }));
  const totalHeadcount = headcountWithColor.reduce((s, d) => s + d.value, 0);
  const totalLeaves = leaveWithColor.reduce((s, l) => s + l.count, 0);
  const avgAttendance = data.attendanceTrend.length
    ? Math.round(data.attendanceTrend.reduce((s, w) => s + w.rate, 0) / data.attendanceTrend.length)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics Overview"
        description="Live business insights, trends, and forecasts across every module"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard
          label="Active Employees"
          value={data.kpis.activeEmployees.toLocaleString('en-IN')}
          change={data.kpis.employeeChange}
          subtext="vs last month"
          icon={Users}
          accent="blue"
        />
        <KPICard
          label="Attendance Rate"
          value={`${data.kpis.attendanceRate.toFixed(1)}%`}
          change={null}
          subtext="this month"
          icon={UserCheck}
          accent="purple"
        />
        <KPICard
          label="Task Completion"
          value={`${data.kpis.taskCompletion.toFixed(0)}%`}
          change={null}
          subtext="this month"
          icon={Target}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Headcount by Department</CardTitle>
            <p className="text-xs text-muted-foreground">{totalHeadcount} active employees</p>
          </CardHeader>
          <CardContent>
            {headcountWithColor.length === 0 ? (
              <EmptyState message="Add employees and assign departments to see this chart." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={headcountWithColor}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {headcountWithColor.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {headcountWithColor.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-full" style={{ background: d.color }} />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Attendance Rate — Last 8 Weeks</CardTitle>
              <p className="text-xs text-muted-foreground">
                {avgAttendance > 0 ? `Average: ${avgAttendance}%` : 'No data yet'}
              </p>
            </div>
            {avgAttendance > 0 && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">
                <Activity className="mr-1 size-3" />
                {avgAttendance}% avg
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {data.attendanceTrend.length === 0 ? (
              <EmptyState message="Attendance records will populate this chart as employees check in." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                    }}
                    formatter={(value: number) => `${value}%`}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leave Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">This month by type</p>
          </CardHeader>
          <CardContent>
            {leaveWithColor.length === 0 ? (
              <EmptyState message="No approved leaves this month." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={leaveWithColor} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      dataKey="type"
                      type="category"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {leaveWithColor.map((d) => (
                        <Cell key={d.type} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total approved leaves:</span>
                  <span className="font-semibold">{totalLeaves}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Field Operations</CardTitle>
              <p className="text-xs text-muted-foreground">Live today</p>
            </div>
            <MapPin className="size-5 text-primary" />
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldStat label="Active Agents" value={data.fieldStats.activeAgents} color="text-emerald-500" />
            <FieldStat label="Visits Today" value={data.fieldStats.visitsToday} color="text-blue-500" />
            <FieldStat label="Orders Today" value={data.fieldStats.ordersToday} color="text-purple-500" />
            <FieldStat
              label="Collection Today"
              value={formatINR(data.fieldStats.collectionToday, true)}
              color="text-amber-500"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Top Performers</CardTitle>
            <p className="text-xs text-muted-foreground">% of monthly target achieved</p>
          </div>
          <Trophy className="size-5 text-amber-500" />
        </CardHeader>
        <CardContent>
          {data.topPerformers.length === 0 ? (
            <EmptyState message="No sales targets recorded for this month yet." />
          ) : (
            <ul className="space-y-3">
              {data.topPerformers.map((p, i) => {
                const pct = p.target > 0 ? Math.round((p.achieved / p.target) * 100) : 0;
                return (
                  <li key={`${p.name}-${i}`} className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        i === 0
                          ? 'bg-amber-500/20 text-amber-500'
                          : i === 1
                            ? 'bg-slate-400/20 text-slate-400'
                            : i === 2
                              ? 'bg-orange-700/20 text-orange-700'
                              : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </div>
                    <Avatar name={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.role}</p>
                    </div>
                    <div className="w-32">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            pct >= 120 ? 'bg-emerald-500' : pct >= 100 ? 'bg-blue-500' : 'bg-amber-500',
                          )}
                          style={{ width: `${Math.min(pct, 150) / 1.5}%` }}
                        />
                      </div>
                    </div>
                    <span
                      className={cn(
                        'min-w-[52px] text-right text-sm font-semibold',
                        pct >= 120 ? 'text-emerald-500' : pct >= 100 ? 'text-blue-500' : 'text-amber-500',
                      )}
                    >
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Health Indicators</CardTitle>
          <p className="text-xs text-muted-foreground">Key operational metrics at a glance</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <HealthIndicator
              icon={CheckCircle2}
              label="Task Completion"
              value={`${data.healthIndicators.taskCompletion.toFixed(0)}%`}
              status={data.healthIndicators.taskCompletion >= 70 ? 'good' : 'warn'}
            />
            <HealthIndicator
              icon={CalendarOff}
              label="Leave Approval Lag"
              value={`${data.healthIndicators.leaveApprovalLagDays}d`}
              status={data.healthIndicators.leaveApprovalLagDays <= 2 ? 'good' : 'warn'}
            />
            <HealthIndicator
              icon={BarChart3}
              label="Pending Leaves"
              value={String(data.healthIndicators.pendingLeaves)}
              status={
                data.healthIndicators.pendingLeaves === 0
                  ? 'good'
                  : data.healthIndicators.pendingLeaves <= 5
                    ? 'warn'
                    : 'bad'
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ message }: { message: string }): ReactElement {
  return (
    <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function FieldStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{value}</p>
    </div>
  );
}

function KPICard({
  label,
  value,
  change,
  subtext,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  change: number | null;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'emerald' | 'blue' | 'purple' | 'amber';
}): ReactElement {
  const positive = change !== null && change >= 0;
  const accentMap = {
    emerald: 'bg-emerald-500/10 text-emerald-500',
    blue: 'bg-blue-500/10 text-blue-500',
    purple: 'bg-purple-500/10 text-purple-500',
    amber: 'bg-amber-500/10 text-amber-500',
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className={cn('flex size-10 items-center justify-center rounded-lg', accentMap[accent])}>
            <Icon className="size-5" />
          </div>
          {change !== null && change !== 0 && (
            <div
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500',
              )}
            >
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mb-1 text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{subtext}</p>
      </CardContent>
    </Card>
  );
}

function HealthIndicator({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  status: 'good' | 'warn' | 'bad';
}): ReactElement {
  const dotColor = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
  }[status];

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className={cn('ml-auto size-2 rounded-full', dotColor)} />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}
