import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAttendanceConfig, useMonthlyAttendance } from '@/hooks/use-attendance';
import { useEmployee } from '@/hooks/use-systemcore';
import type { AttendanceStatus } from '@/lib/attendance.api';
import { CheckInWidget } from '@/components/attendance/CheckInWidget';
import { cn } from '@/lib/utils';
import { DEFAULT_WEEK_OFF_RULE, isWeekOff } from '@/lib/week-off';

const STATUS_BG: Record<AttendanceStatus, string> = {
  present: 'bg-success/20 border-success/40 text-success font-semibold',
  late: 'bg-orange-500/20 border-orange-500/40 text-orange-600 font-semibold',
  half_day: 'bg-amber-500/20 border-amber-500/40 text-amber-600 font-semibold',
  absent: 'bg-destructive/20 border-destructive/40 text-destructive font-semibold',
  on_leave: 'bg-blue-500/20 border-blue-500/40 text-blue-600 font-semibold',
  holiday: 'bg-purple-500/20 border-purple-500/40 text-purple-600 font-semibold',
  // Week off (Sundays + the off Saturdays) — dark grey, so a non-working day
  // is distinguishable from a day with simply no record.
  weekend: 'bg-slate-300 border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200',
};

export default function EmployeeAttendancePage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const { data } = useMonthlyAttendance(year, month, id);
  const { data: employeeData } = useEmployee(id);
  const { data: configData } = useAttendanceConfig();
  const emp = employeeData?.data;
  const weekOffRule = configData?.data.weekOff ?? DEFAULT_WEEK_OFF_RULE;

  const rawRecords = data?.data ?? [];
  
  const records = rawRecords.map((r) => {
    // Resolve effective status: lateBy > 0 means late, but only if they are marked present.
    // This prevents overriding absent or half_day statuses.
    const effectiveStatus = (r.status === 'present' && r.lateBy > 0) ? 'late' : r.status;
    return { ...r, effectiveStatus };
  });

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
      acc[r.effectiveStatus] = (acc[r.effectiveStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={id && emp ? `${emp.firstName}'s Attendance` : 'My Attendance'}
        description={id ? `Review monthly attendance for ${emp?.firstName} ${emp?.lastName}` : 'Check in and out, and review your monthly attendance'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: id ? 'Employee' : 'My' },
        ]}
        actions={
          !id ? (
            <Link
              to="/attendance/timesheet"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <FileText className="size-4" /> View Timesheet
            </Link>
          ) : null
        }
      />

      {!id && <CheckInWidget />}

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
        <div className="flex flex-wrap gap-2 text-[10px] md:text-xs">
          <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
            <span className="size-1.5 rounded-full bg-success" /> Present {totals.present ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-orange-600">
            <span className="size-1.5 rounded-full bg-orange-500" /> Late {totals.late ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-600">
            <span className="size-1.5 rounded-full bg-amber-500" /> Half Day {totals.half_day ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-destructive">
            <span className="size-1.5 rounded-full bg-destructive" /> Absent {totals.absent ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-600">
            <span className="size-1.5 rounded-full bg-blue-500" /> Leave {totals.on_leave ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-600">
            <span className="size-1.5 rounded-full bg-purple-500" /> Holiday {totals.holiday ?? 0}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-slate-400 bg-slate-300 px-2.5 py-1 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">
            <span className="size-1.5 rounded-full bg-slate-500" /> Week off {totals.weekend ?? 0}
          </span>
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

              const effectiveStatus = rec?.effectiveStatus;

              // Determine background class
              let cls = 'border-border';
              if (effectiveStatus) {
                cls = STATUS_BG[effectiveStatus];
              } else {
                // For days without records, check if it's a week off or past day
                const dateObj = new Date(year, month - 1, d);
                const weekOff = isWeekOff(dateObj, weekOffRule);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (dateObj < today) {
                  cls = weekOff ? STATUS_BG.weekend : STATUS_BG.absent;
                } else if (weekOff) {
                  cls = STATUS_BG.weekend;
                }
              }
              return (
                <div
                  key={i}
                  className={cn(
                    'flex h-20 flex-col rounded-md border p-1.5 text-xs transition-colors',
                    cls,
                  )}
                >
                  <span className="font-semibold text-sm">{d}</span>
                  {rec && (
                    <>
                      {rec.checkIn?.time && (
                        <span className="mt-auto truncate text-[10px] opacity-80">
                          {new Date(rec.checkIn.time).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      {rec.lateBy > 0 && (
                        <span className="text-[9px] font-bold text-orange-600">+{rec.lateBy}m late</span>
                      )}
                      {rec.totalWorkingHours > 0 && (
                        <span className="text-[9px] opacity-70">{rec.totalWorkingHours.toFixed(1)}h</span>
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
