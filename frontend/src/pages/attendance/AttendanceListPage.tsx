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
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { useAttendanceList } from '@/hooks/use-attendance';
import { useDepartments, useEmployees } from '@/hooks/use-systemcore';
import type { Attendance, AttendanceStatus } from '@/lib/attendance.api';

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

/** Date helpers — keep them dumb (string in, string out) so they work with <input type="date"> */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const startOfThisWeek = (() => {
  const d = new Date(today);
  // Treat Monday as the start of the week.
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
})();
const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

const QUICK_RANGES: Array<{ label: string; from: string; to: string }> = [
  { label: 'Today', from: ymd(today), to: ymd(today) },
  { label: 'This week', from: ymd(startOfThisWeek), to: ymd(today) },
  { label: 'This month', from: ymd(startOfThisMonth), to: ymd(today) },
  { label: 'Last month', from: ymd(startOfLastMonth), to: ymd(endOfLastMonth) },
];

function exportCSV(rows: Attendance[]): void {
  const headers = [
    'Employee ID',
    'Employee',
    'Date',
    'Check-in',
    'Check-out',
    'Hours',
    'Status',
    'Late (min)',
  ];
  const lines = rows.map((r) => {
    const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
    const empName = emp ? `${emp.firstName} ${emp.lastName}` : '';
    const empCode = emp?.employeeId ?? '';
    const ci = r.checkIn?.time ? new Date(r.checkIn.time).toLocaleTimeString() : '';
    const co = r.checkOut?.time ? new Date(r.checkOut.time).toLocaleTimeString() : '';
    return [
      empCode,
      empName,
      new Date(r.date).toLocaleDateString(),
      ci,
      co,
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
  a.download = `attendance-${ymd(new Date())}.csv`;
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

  const { data: empData } = useEmployees({ limit: 500 });
  const { data: deptData } = useDepartments({ limit: 100 });

  const filteredEmployees = useMemo(() => {
    const all = empData?.data ?? [];
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => {
      const haystack = `${e.firstName} ${e.lastName} ${e.employeeId} ${e.email ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [empData, employeeSearch]);

  const { data, isLoading } = useAttendanceList({
    page,
    limit,
    employeeId: employeeId || undefined,
    departmentId: departmentId || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  });

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
      cell: (r) =>
        new Date(r.date).toLocaleDateString('en-IN', {
          dateStyle: 'medium',
        }),
    },
    {
      key: 'checkIn',
      header: 'Check-in',
      cell: (r) =>
        r.checkIn?.time
          ? new Date(r.checkIn.time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—',
    },
    {
      key: 'checkOut',
      header: 'Check-out',
      cell: (r) =>
        r.checkOut?.time
          ? new Date(r.checkOut.time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—',
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
          {QUICK_RANGES.map((qr) => {
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
                // Don't reset the selected employeeId — searching just narrows
                // the dropdown; the filter only changes when they pick someone.
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
              {filteredEmployees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName}
                  {e.employeeId ? ` · ${e.employeeId}` : ''}
                </option>
              ))}
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
    </div>
  );
}
