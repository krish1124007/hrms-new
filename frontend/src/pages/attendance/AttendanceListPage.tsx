import { useMemo, useState, type ReactElement } from 'react';
import {
  Download,
  RotateCcw,
  Users,
  CheckCircle2,
  Clock,
  CircleSlash,
  CalendarOff,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { MapPin } from 'lucide-react';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAttendanceList, useCorrectAttendanceRecord } from '@/hooks/use-attendance';
import { useDepartments } from '@/hooks/use-systemcore';
import { useActiveEmployees } from '@/hooks/use-employee-picker';
import { EmployeeFilterOptions } from '@/components/common/EmployeeFilterOptions';
import { formatDate, formatTime, todayIST, toISTDateKey } from '@/lib/format';
import { addDaysToKey, dayKeyOf, partsOfKey, startOfWeekKey } from '@/lib/business-day';
import type {
  Attendance,
  AttendanceArea,
  AttendanceStatus,
  LocationPoint,
} from '@/lib/attendance.api';

const STATUS_VARIANT: Record<
  AttendanceStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
> = {
  present: 'success',
  late: 'warning',
  half_day: 'warning',
  absent: 'destructive',
  on_leave: 'secondary',
  holiday: 'outline',
  weekend: 'outline',
};


/** Human-readable label for a captured check-in/out location. */
function locationText(loc?: LocationPoint): string {
  if (!loc || (loc.lat == null && loc.lng == null && !loc.address)) return 'No location';
  if (loc.address) return loc.address;
  return `${loc.lat!.toFixed(5)}, ${loc.lng!.toFixed(5)}`;
}

/** Google-Maps link for a point, or null when there are no coordinates. */
function mapsHref(loc?: LocationPoint): string | null {
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
}

/**
 * "Head Office · 40 m" — the nearest configured site or geofence to a punch,
 * resolved server-side from the sites/geofences already set up. Raw
 * coordinates alone don't tell an admin where somebody actually was.
 */
function AreaLine({ area }: { area?: AttendanceArea | null }): ReactElement | null {
  if (!area) return null;
  const near = area.distance < 1000 ? `${area.distance} m` : `${(area.distance / 1000).toFixed(1)} km`;
  return (
    <div className="flex items-center gap-1 text-[11px] leading-tight">
      <span className={area.inside ? 'text-success' : 'text-amber-600'}>
        {area.inside ? '● ' : '○ '}
        {area.name}
      </span>
      <span className="text-muted-foreground">{area.inside ? `· within ${near}` : `· ${near} away`}</span>
    </div>
  );
}

/** One line: "In · <place>" as a maps link when coordinates exist. */
function LocationLine({ prefix, loc }: { prefix: string; loc?: LocationPoint }): ReactElement {
  const text = locationText(loc);
  const href = mapsHref(loc);
  return (
    <div className="flex items-center gap-1 text-xs leading-tight">
      <span className="text-muted-foreground">{prefix}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
          title={text}
        >
          <MapPin className="size-3" />
          <span className="max-w-[140px] truncate">{text}</span>
        </a>
      ) : (
        <span className="text-muted-foreground">{text}</span>
      )}
    </div>
  );
}

/**
 * Quick date ranges as `<input type="date">` values, on the IST calendar —
 * worked out when the page renders (not when the bundle loaded) and right
 * between 00:00 and 05:30 IST too. Weeks start on Monday.
 */
function quickRanges(today: string): Array<{ label: string; from: string; to: string }> {
  const { year, month } = partsOfKey(today);
  const startOfThisMonth = dayKeyOf(year, month, 1);
  const endOfLastMonth = addDaysToKey(startOfThisMonth, -1);
  const { year: ly, month: lm } = partsOfKey(endOfLastMonth);
  return [
    { label: 'Today', from: today, to: today },
    { label: 'This week', from: startOfWeekKey(today), to: today },
    { label: 'This month', from: startOfThisMonth, to: today },
    { label: 'Last month', from: dayKeyOf(ly, lm, 1), to: endOfLastMonth },
  ];
}

function exportCSV(rows: Attendance[]): void {
  const headers = [
    'Employee ID',
    'Employee',
    'Date',
    'Check-in',
    'Check-out',
    'Check-in location',
    'Check-out location',
    'Hours',
    'Status',
    'Late (min)',
  ];
  const lines = rows.map((r) => {
    const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : '';
    const empCode = emp?.employeeId ?? '';
    const ci = r.checkIn?.time ? formatTime(r.checkIn.time) : '';
    const co = r.checkOut?.time ? formatTime(r.checkOut.time) : '';
    return [
      empCode,
      empName,
      formatDate(r.date),
      ci,
      co,
      locationText(r.checkIn?.location),
      r.checkOut?.time ? locationText(r.checkOut?.location) : '',
      r.totalWorkingHours,
      r.status,
      r.lateBy,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${todayIST()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceListPage(): ReactElement {
  // ── Filters ──
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Reset pagination whenever a filter changes — otherwise you can be sat
  // on page 4 of an empty result set after switching employees.
  const resetPage = (): void => setPage(1);

  // A filter over history: ex-employees stay selectable, in their own group.
  const { data: allEmployees = [] } = useActiveEmployees({ includeFormer: true });
  const { data: deptData } = useDepartments({ limit: 100 });

  const filteredEmployees = useMemo(() => {
    const all = allEmployees;
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => {
      const haystack = `${e.firstName} ${e.lastName} ${e.employeeId} ${e.email ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allEmployees, employeeSearch]);

  const { data, isLoading, error, refetch } = useAttendanceList({
    page,
    limit,
    employeeId: employeeId || undefined,
    departmentId: departmentId || undefined,
    search: employeeSearch || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  // ── Time correction — admin can set clock-in and/or clock-out ──
  const correct = useCorrectAttendanceRecord();
  const [fixRow, setFixRow] = useState<Attendance | null>(null);
  const [fixIn, setFixIn] = useState('');
  const [fixOut, setFixOut] = useState('');
  const [fixReason, setFixReason] = useState('');

  /** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
  const toLocalInput = (value: string | Date): string => {
    const d = new Date(value);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /** Pre-fill with what is on the record; default the missing side to a shift-like time. */
  const openFix = (r: Attendance): void => {
    // The record's IST day — a label stored at IST midnight is not the day before.
    const dayPrefix = toISTDateKey(r.date);
    setFixIn(r.checkIn?.time ? toLocalInput(r.checkIn.time) : `${dayPrefix}T10:00`);
    setFixOut(r.checkOut?.time ? toLocalInput(r.checkOut.time) : `${dayPrefix}T18:30`);
    setFixReason('');
    setFixRow(r);
  };

  const submitFix = (): void => {
    if (!fixRow || fixReason.trim().length < 3) return;
    const original = {
      in: fixRow.checkIn?.time ? toLocalInput(fixRow.checkIn.time) : '',
      out: fixRow.checkOut?.time ? toLocalInput(fixRow.checkOut.time) : '',
    };
    // Only send what actually changed, so an untouched side is left alone.
    const body: { checkIn?: string; checkOut?: string } = {};
    if (fixIn && fixIn !== original.in) body.checkIn = new Date(fixIn).toISOString();
    if (fixOut && fixOut !== original.out) body.checkOut = new Date(fixOut).toISOString();
    if (!body.checkIn && !body.checkOut) {
      setFixRow(null);
      return;
    }
    correct.mutate(
      { id: fixRow._id, ...body, reason: fixReason.trim() },
      { onSuccess: () => setFixRow(null) },
    );
  };

  // Stats over the current page only (the API doesn't return aggregates here).
  // Honest labels — "On this page" — so a paginated user knows it's not the
  // whole filter set's count.
  const rows = data?.data ?? [];
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0 };
    for (const r of rows) {
      if (r.status === 'present') c.present += 1;
      else if (r.status === 'late') c.late += 1;
      else if (r.status === 'half_day') c.halfDay += 1;
      else if (r.status === 'absent') c.absent += 1;
      else if (r.status === 'on_leave') c.onLeave += 1;
    }
    return c;
  }, [rows]);

  const hasFilters =
    !!employeeId || !!departmentId || !!status || !!from || !!to || !!employeeSearch;

  const clearFilters = (): void => {
    setEmployeeId('');
    setDepartmentId('');
    setStatus('');
    setFrom('');
    setTo('');
    setEmployeeSearch('');
    resetPage();
  };

  const applyQuickRange = (qr: { from: string; to: string }): void => {
    setFrom(qr.from);
    setTo(qr.to);
    resetPage();
  };

  const columns: DataTableColumn<Attendance>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => {
        const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
        return emp ? (
          <div className="text-sm leading-tight">
            <p className="font-medium">{`${emp.firstName} ${emp.lastName}`}</p>
            {emp.employeeId && (
              <p className="font-mono text-xs text-muted-foreground">{emp.employeeId}</p>
            )}
          </div>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'date',
      header: 'Date',
      cell: (r) => formatDate(r.date),
    },
    {
      key: 'checkIn',
      header: 'Check-in',
      cell: (r) =>
        r.checkIn?.time ? formatTime(r.checkIn.time) : '—',
    },
    {
      key: 'checkOut',
      header: 'Check-out',
      cell: (r) =>
        r.checkOut?.time ? formatTime(r.checkOut.time) : '—',
    },
    {
      key: 'location',
      header: 'Location',
      cell: (r) => (
        <div className="space-y-1">
          <div>
            <LocationLine prefix="In" loc={r.checkIn?.location} />
            <AreaLine area={r.checkInArea} />
          </div>
          {r.checkOut?.time && (
            <div>
              <LocationLine prefix="Out" loc={r.checkOut?.location} />
              <AreaLine area={r.checkOutArea} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'hours',
      header: 'Hours',
      cell: (r) => `${r.totalWorkingHours.toFixed(2)}h`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
          {r.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'lateBy',
      header: 'Late',
      cell: (r) => (r.lateBy > 0 ? `+${r.lateBy} min` : '—'),
    },
    {
      key: 'fix',
      header: '',
      width: '120px',
      // Employees mis-punch in both directions — a forgotten check-out leaves
      // the day at 0 hours, a forgotten check-in leaves no record of arrival.
      // /check-in and /check-out are self-service and cannot act on someone
      // else's record, so this is the only way to correct either.
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => openFix(r)}>
          <Clock className="size-3" />
          {r.checkIn?.time && !r.checkOut?.time ? 'Close day' : 'Edit times'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Records"
        description="Filter by employee, department, status, or date range — then export the result."
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Records' },
        ]}
        actions={
          <Button variant="outline" onClick={() => exportCSV(rows)} disabled={rows.length === 0}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        }
      />

      {/* Stats — counts on the visible page */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="On this page" value={rows.length} icon={Users} />
        <StatCard label="Present" value={counts.present} icon={CheckCircle2} />
        <StatCard label="Late" value={counts.late} icon={Clock} />
        <StatCard label="Absent" value={counts.absent} icon={CircleSlash} />
        <StatCard label="On leave" value={counts.onLeave} icon={CalendarOff} />
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick range
          </span>
          {quickRanges(todayIST()).map((qr) => {
            const isActive = from === qr.from && to === qr.to;
            return (
              <button
                key={qr.label}
                type="button"
                onClick={() => applyQuickRange(qr)}
                className={
                  'rounded-full border px-3 py-1 text-xs transition-colors ' +
                  (isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-accent')
                }
              >
                {qr.label}
              </button>
            );
          })}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              <RotateCcw className="size-3" /> Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="emp-search">Employee</Label>
            <Input
              id="emp-search"
              placeholder="Search by name or ID…"
              value={employeeSearch}
              onChange={(e) => {
                setEmployeeSearch(e.target.value);
                resetPage();
              }}
            />
            <Select
              className="mt-2"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All employees</option>
              <EmployeeFilterOptions employees={filteredEmployees} />
            </Select>
          </div>

          <div>
            <Label htmlFor="dept">Department</Label>
            <Select
              id="dept"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All departments</option>
              {(deptData?.data ?? []).map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                resetPage();
              }}
            >
              <option value="">All statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
              <option value="holiday">Holiday</option>
              <option value="weekend">Weekend</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPage();
              }}
            />
          </div>

          <div>
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                resetPage();
              }}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No records found"
        emptyDescription={
          hasFilters
            ? 'No attendance entries match these filters. Try widening the date range or clearing employee/department.'
            : 'No attendance records yet.'
        }
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}

      <Dialog open={!!fixRow} onClose={() => setFixRow(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Edit attendance times</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Set the clock-in and clock-out for{' '}
            <strong>
              {fixRow && typeof fixRow.employeeId === 'object'
                ? `${fixRow.employeeId.firstName} ${fixRow.employeeId.lastName}`
                : 'this employee'}
            </strong>{' '}
            on{' '}
            {fixRow ? formatDate(fixRow.date) : ''}
            . Hours, overtime and half-day status are recalculated from the times you enter.
          </p>
          <div>
            <Label htmlFor="fix-in">Clock-in time</Label>
            <Input
              id="fix-in"
              type="datetime-local"
              value={fixIn}
              onChange={(e) => setFixIn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fix-out">Clock-out time</Label>
            <Input
              id="fix-out"
              type="datetime-local"
              value={fixOut}
              onChange={(e) => setFixOut(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fix-reason">Reason *</Label>
            <Input
              id="fix-reason"
              placeholder="e.g. Forgot to check out — confirmed with employee"
              value={fixReason}
              onChange={(e) => setFixReason(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Stored on the record and in the audit log.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setFixRow(null)}>
            Cancel
          </Button>
          <Button
            onClick={submitFix}
            loading={correct.isPending}
            disabled={(!fixIn && !fixOut) || fixReason.trim().length < 3}
          >
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
