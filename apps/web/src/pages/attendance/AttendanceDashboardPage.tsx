import { type ReactElement } from 'react';
import { Users, UserCheck, Clock, AlertTriangle, CalendarOff, UserX } from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAttendanceDashboard } from '@/hooks/use-attendance';
import { CheckInWidget } from '@/components/attendance/CheckInWidget';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'];

export default function AttendanceDashboardPage(): ReactElement {
  const { data } = useAttendanceDashboard();
  const stats = data?.data.totals;
  const heatmap = data?.data.heatmap ?? [];
  const lateComers = data?.data.lateComers ?? [];

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
        description="Real-time workforce attendance overview"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Attendance' }]}
      />

      <CheckInWidget />

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
