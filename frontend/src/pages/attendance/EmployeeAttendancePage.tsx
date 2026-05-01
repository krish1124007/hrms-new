import { useState, type ReactElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMonthlyAttendance } from '@/hooks/use-attendance';
import type { AttendanceStatus } from '@/lib/attendance.api';
import { CheckInWidget } from '@/components/attendance/CheckInWidget';
import { cn } from '@/lib/utils';

const STATUS_BG: Record<AttendanceStatus, string> = {
  present: 'bg-success/20 border-success/40 text-success',
  late: 'bg-warning/20 border-warning/40 text-warning',
  half_day: 'bg-warning/20 border-warning/40 text-warning',
  absent: 'bg-destructive/20 border-destructive/40 text-destructive',
  on_leave: 'bg-blue-500/20 border-blue-500/40 text-blue-600',
  holiday: 'bg-purple-500/20 border-purple-500/40 text-purple-600',
  weekend: 'bg-muted text-muted-foreground',
};

export default function EmployeeAttendancePage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const { data } = useMonthlyAttendance(year, month);
  const records = data?.data ?? [];
  const map = new Map(records.map((r) => [new Date(r.date).getDate(), r]));

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prev = (): void => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const next = (): void => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  // summary
  const totals = records.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Attendance"
        description="Check in and out, and review your monthly attendance"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'My' },
        ]}
      />

      <CheckInWidget />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-[200px] text-center text-lg font-semibold">{monthName}</h2>
          <Button variant="outline" size="sm" onClick={next}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded bg-success/20 px-2 py-1">Present {totals.present ?? 0}</span>
          <span className="rounded bg-warning/20 px-2 py-1">Late {totals.late ?? 0}</span>
          <span className="rounded bg-destructive/20 px-2 py-1">Absent {totals.absent ?? 0}</span>
          <span className="rounded bg-blue-500/20 px-2 py-1">Leave {totals.on_leave ?? 0}</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const rec = map.get(d);
              const cls = rec ? STATUS_BG[rec.status] : 'border-border';
              return (
                <div
                  key={i}
                  className={cn(
                    'flex h-20 flex-col rounded-md border p-2 text-xs transition-colors',
                    cls,
                  )}
                >
                  <span className="font-semibold">{d}</span>
                  {rec && (
                    <>
                      {rec.checkIn?.time && (
                        <span className="mt-auto truncate">
                          {new Date(rec.checkIn.time).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      {rec.totalWorkingHours > 0 && (
                        <span>{rec.totalWorkingHours.toFixed(1)}h</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
