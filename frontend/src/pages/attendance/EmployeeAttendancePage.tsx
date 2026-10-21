import { useState, type ReactElement } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileClock, FileText, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAttendanceConfig, useMonthlyAttendance } from '@/hooks/use-attendance';
import { useEmployee } from '@/hooks/use-systemcore';
import type { AttendanceStatus } from '@/lib/attendance.api';
import { CheckInWidget } from '@/components/attendance/CheckInWidget';
import { RegularizationRequestDialog } from '@/components/attendance/RegularizationRequestDialog';
import { cn } from '@/lib/utils';
import { DEFAULT_WEEK_OFF_RULE, isWeekOff } from '@/lib/week-off';
import { formatTime, todayIST, toISTDateKey } from '@/lib/format';
import { dayKeyOf, daysInMonth as monthLength, partsOfKey } from '@/lib/business-day';
import { apiErrorMessage, isNoEmployeeProfileError } from '@/lib/api-error';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';

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

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  half_day: 'Half day',
  absent: 'Absent',
  on_leave: 'On leave',
  holiday: 'Holiday',
  weekend: 'Week off',
};

/** A past working day the server has no row for — not proof of an absence. */
const NO_RECORD_BG = 'border-dashed border-muted-foreground/40 text-muted-foreground';
/** Before the employee joined: not part of their attendance at all. */
const BEFORE_JOINING_BG = 'border-transparent bg-muted/30 text-muted-foreground/60';

/**
 * What one calendar day shows. Only the server says a day was absent: its
 * nightly day-close writes an `absent` row for every working day an employee
 * (who had joined) did not punch. A day with no row is "No record" — e.g.
 * before day-close existed — never a made-up absence; days before joining and
 * days still to come say nothing about attendance.
 */
function describeDay(
  key: string,
  ctx: {
    record?: { effectiveStatus: AttendanceStatus };
    todayKey: string;
    joiningKey: string | null;
    weekOff: boolean;
  },
): { label: string; className: string } {
  const { record, todayKey, joiningKey, weekOff } = ctx;
  if (record) {
    return { label: STATUS_LABEL[record.effectiveStatus], className: STATUS_BG[record.effectiveStatus] };
  }
  if (joiningKey && key < joiningKey) return { label: 'Before joining', className: BEFORE_JOINING_BG };
  if (weekOff) return { label: STATUS_LABEL.weekend, className: STATUS_BG.weekend };
  if (key >= todayKey) return { label: '', className: 'border-border' };
  return { label: 'No record', className: NO_RECORD_BG };
}

export default function EmployeeAttendancePage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  // "Today" and the month shown are IST's, whatever the browser's timezone.
  const todayKey = todayIST();
  const [year, setYear] = useState(() => partsOfKey(todayKey).year);
  const [month, setMonth] = useState(() => partsOfKey(todayKey).month); // 1-12
  const [regularizeOpen, setRegularizeOpen] = useState(false);

  const { data, error: monthError, refetch } = useMonthlyAttendance(year, month, id);
  const { data: employeeData } = useEmployee(id);
  // Own calendar: the joining date comes from the caller's own record.
  const me = useMyEmployeeProfile({ enabled: !id });
  const { data: configData } = useAttendanceConfig();
  const emp = employeeData?.data;
  const weekOffRule = configData?.data.weekOff ?? DEFAULT_WEEK_OFF_RULE;
  const joiningDate = id ? emp?.joiningDate : me.profile?.joiningDate;
  // Unknown (e.g. the profile lookup failed): no lower bound rather than a guess.
  const joiningKey = joiningDate ? toISTDateKey(joiningDate) : null;
  const noProfile = !id && (me.noProfile || isNoEmployeeProfileError(monthError));

  const rawRecords = data?.data ?? [];
  
  const records = rawRecords.map((r) => {
    // Resolve effective status: lateBy > 0 means late, but only if they are marked present.
    // This prevents overriding absent or half_day statuses.
    const effectiveStatus = (r.status === 'present' && r.lateBy > 0) ? 'late' : r.status;
    return { ...r, effectiveStatus };
  });

  // Keyed by the IST day — a label stored at IST midnight is that day, not the one before.
  const map = new Map(records.map((r) => [toISTDateKey(r.date), r]));

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = monthLength(year, month);
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
          !id && !noProfile ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setRegularizeOpen(true)}>
                <FileClock className="size-4" /> Request regularization
              </Button>
              <Link
                to="/attendance/timesheet"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <FileText className="size-4" /> View Timesheet
              </Link>
            </>
          ) : null
        }
      />

      {noProfile ? (
        <NoEmployeeProfileNotice feature="attendance" />
      ) : (
        <>
          {!id && (
            <RegularizationRequestDialog open={regularizeOpen} onClose={() => setRegularizeOpen(false)} />
          )}

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
              <span
                className="flex items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/40 px-2.5 py-1 text-muted-foreground"
                title="A past working day with no attendance row — not counted as an absence"
              >
                No record
              </span>
            </div>
          </div>

          {monthError ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center text-sm">
                <p className="font-medium text-foreground">Couldn't load this month's attendance</p>
                <p className="text-muted-foreground">{apiErrorMessage(monthError)}</p>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <RotateCw className="size-4" /> Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
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
                    const key = dayKeyOf(year, month, d);
                    const rec = map.get(key);
                    const { label, className: cls } = describeDay(key, {
                      record: rec,
                      todayKey,
                      joiningKey,
                      // A local Date of that calendar day: its weekday is the same everywhere.
                      weekOff: isWeekOff(new Date(year, month - 1, d), weekOffRule),
                    });
                    return (
                      <div
                        key={i}
                        aria-label={label ? `${d} ${monthName}: ${label}` : `${d} ${monthName}`}
                        title={label || undefined}
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
                                {formatTime(rec.checkIn.time)}
                              </span>
                            )}
                            {rec.lateBy > 0 && (
                              <span className="text-[9px] font-bold text-orange-600">+{rec.lateBy}m late</span>
                            )}
                            {rec.totalWorkingHours > 0 && (
                              <span className="text-[9px] opacity-70">{rec.totalWorkingHours.toFixed(1)}h</span>
                            )}
                            {rec.regularization?.status === 'pending' && (
                              <span className="truncate text-[9px] font-semibold text-amber-600" title={rec.regularization.reason}>
                                Regularization pending
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
