/**
 * Employee Timesheet Page
 *
 * Shows:
 *  - The employee's **assigned shift** (schedule, work days, grace window) — read from their profile
 *  - Month-by-month attendance table with check-in, check-out, hours, late-by, status
 *  - Summary stat cards
 *  - CSV export
 */

import { useState, type ReactElement } from 'react';
import {
  ChevronLeft, ChevronRight, Download, Clock, LogIn, LogOut,
  Timer, CalendarDays, Sun, Coffee,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useMonthlyAttendance, useMyShift } from '@/hooks/use-attendance';
import { useAuthStore } from '@/stores/auth.store';
import type { AttendanceStatus } from '@/lib/attendance.api';

// ─── Status colour config ────────────────────────────────────────────
const STATUS_CONFIG: Record<
  AttendanceStatus,
  { variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'default'; label: string }
> = {
  present:  { variant: 'success',     label: 'Present'  },
  late:     { variant: 'warning',     label: 'Late'     },
  half_day: { variant: 'warning',     label: 'Half Day' },
  absent:   { variant: 'destructive', label: 'Absent'   },
  on_leave: { variant: 'default',     label: 'On Leave' },
  holiday:  { variant: 'secondary',   label: 'Holiday'  },
  weekend:  { variant: 'secondary',   label: 'Weekend'  },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function buildCSV(rows: ReturnType<typeof useMonthlyAttendance>['data']): string {
  if (!rows?.data) return '';
  const headers = ['Date', 'Day', 'Check-In', 'Check-Out', 'Hours', 'Late By (min)', 'Status'];
  const lines = rows.data.map((r) => {
    const d = new Date(r.date);
    return [
      d.toLocaleDateString('en-IN'),
      d.toLocaleDateString('en-IN', { weekday: 'long' }),
      r.checkIn?.time ? fmtTime(r.checkIn.time) : '',
      r.checkOut?.time ? fmtTime(r.checkOut.time) : '',
      r.totalWorkingHours?.toFixed(2) ?? '',
      r.lateBy ?? '',
      r.status,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  return [headers.join(','), ...lines].join('\n');
}

// ─── Shift schedule card (read-only for employees) ───────────────────
function ShiftCard(): ReactElement {
  const { data, isLoading } = useMyShift();
  const shift = data?.data as
    | { _id: string; name: string; color: string; startTime?: string; endTime?: string; graceMinutes?: number; workDays?: number[]; fullDayHours?: number; breakDuration?: number }
    | null
    | undefined;

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (!shift) return (
    <Card className="border-dashed">
      <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <Clock className="size-5" />
        <span>No shift assigned yet. Ask your HR admin to assign a shift schedule.</span>
      </CardContent>
    </Card>
  );

  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: shift.color ?? '#6366f1' }} />
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex size-7 items-center justify-center rounded-lg" style={{ backgroundColor: (shift.color ?? '#6366f1') + '20' }}>
            <Clock className="size-4" style={{ color: shift.color ?? '#6366f1' }} />
          </div>
          Your Shift — {shift.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
        {/* Start / End */}
        <div className="flex items-start gap-2">
          <LogIn className="mt-0.5 size-4 text-success shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="font-mono text-sm font-semibold text-foreground">{shift.startTime ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <LogOut className="mt-0.5 size-4 text-destructive shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">End</p>
            <p className="font-mono text-sm font-semibold text-foreground">{shift.endTime ?? '—'}</p>
          </div>
        </div>
        {/* Grace & Break */}
        <div className="flex items-start gap-2">
          <Timer className="mt-0.5 size-4 text-orange-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Grace</p>
            <p className="text-sm font-semibold text-foreground">{shift.graceMinutes ?? 0} min</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Coffee className="mt-0.5 size-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Break</p>
            <p className="text-sm font-semibold text-foreground">{shift.breakDuration ?? 60} min</p>
          </div>
        </div>

        {/* Work days */}
        <div className="col-span-2 flex items-start gap-2 sm:col-span-4">
          <CalendarDays className="mt-0.5 size-4 text-primary shrink-0" />
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Work days</p>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md text-[11px] font-bold',
                    (shift.workDays ?? [1, 2, 3, 4, 5]).includes(i)
                      ? 'text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                  style={
                    (shift.workDays ?? [1, 2, 3, 4, 5]).includes(i)
                      ? { backgroundColor: shift.color ?? '#6366f1' }
                      : {}
                  }
                >
                  {d.charAt(0)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────
export default function EmployeeTimesheetPage(): ReactElement {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useMonthlyAttendance(year, month);
  const records = data?.data ?? [];

  const monthName = new Date(year, month - 1).toLocaleString('en-IN', {
    month: 'long', year: 'numeric',
  });

  const prev = (): void => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };
  const next = (): void => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  // Summary
  const totals = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalHours = records.reduce((s, r) => s + (r.totalWorkingHours ?? 0), 0);
  const lateCount = records.filter((r) => r.status === 'late' || (r.lateBy && r.lateBy > 0)).length;

  const handleExport = (): void => {
    const csv = buildCSV(data);
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Timesheet"
        description="Your shift schedule and daily attendance records"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance/my' },
          { label: 'Timesheet' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={records.length === 0}>
            <Download className="mr-2 size-4" /> Export CSV
          </Button>
        }
      />

      {/* ── Shift schedule card (shows the shift assigned at creation) ── */}
      <ShiftCard />

      {/* ── Month navigation ── */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="size-9" onClick={prev}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-[200px] text-center text-lg font-semibold">{monthName}</h2>
        <Button variant="outline" size="icon" className="size-9" onClick={next}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Present', value: (totals.present ?? 0) + (totals.late ?? 0), color: 'text-success', bg: 'bg-success/10 border-success/20' },
          { label: 'Late', value: lateCount, color: 'text-orange-600', bg: 'bg-orange-500/10 border-orange-200' },
          { label: 'Absent', value: totals.absent ?? 0, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20' },
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
        ].map((item) => (
          <div key={item.label} className={cn('rounded-xl border p-4', item.bg)}>
            <div className={cn('text-2xl font-bold', item.color)}>{item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── Attendance table ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Header row */}
        <div className="grid grid-cols-[140px_1fr_1fr_80px_90px_120px] gap-px bg-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div className="bg-card px-4 py-3">Date</div>
          <div className="bg-card px-4 py-3 flex items-center gap-1"><LogIn className="size-3" /> Check-In</div>
          <div className="bg-card px-4 py-3 flex items-center gap-1"><LogOut className="size-3" /> Check-Out</div>
          <div className="bg-card px-4 py-3 flex items-center gap-1"><Timer className="size-3" /> Hours</div>
          <div className="bg-card px-4 py-3 flex items-center gap-1"><Clock className="size-3" /> Late By</div>
          <div className="bg-card px-4 py-3">Status</div>
        </div>

        {isLoading ? (
          <div className="space-y-px bg-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card px-4 py-3">
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sun className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No attendance records for {monthName}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {records
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((rec) => {
                const d = new Date(rec.date);
                const effectiveStatus: AttendanceStatus =
                  rec.lateBy && rec.lateBy > 0 && rec.status === 'present'
                    ? 'late'
                    : rec.status;
                const cfg = STATUS_CONFIG[effectiveStatus] ?? { variant: 'secondary' as const, label: rec.status };
                const isLate = effectiveStatus === 'late';
                const isAbsent = rec.status === 'absent';
                return (
                  <div
                    key={rec._id}
                    className={cn(
                      'grid grid-cols-[140px_1fr_1fr_80px_90px_120px] gap-px text-sm',
                      isLate && 'bg-orange-500/5',
                      isAbsent && 'bg-destructive/5',
                    )}
                  >
                    <div className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      <span className={cn('font-mono', rec.checkIn?.time ? 'text-foreground' : 'text-muted-foreground/40')}>
                        {fmtTime(rec.checkIn?.time)}
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      <span className={cn('font-mono', rec.checkOut?.time ? 'text-foreground' : 'text-muted-foreground/40')}>
                        {fmtTime(rec.checkOut?.time)}
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      {rec.totalWorkingHours != null && rec.totalWorkingHours > 0 ? (
                        <span className="font-semibold text-primary">{rec.totalWorkingHours.toFixed(1)}h</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      {isLate && rec.lateBy && rec.lateBy > 0 ? (
                        <span className="font-medium text-orange-600">+{rec.lateBy}m</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
