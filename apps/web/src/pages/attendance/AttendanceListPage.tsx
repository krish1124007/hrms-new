import { useState, type ReactElement } from 'react';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useAttendanceList } from '@/hooks/use-attendance';
import type { Attendance, AttendanceStatus } from '@/lib/attendance.api';

const STATUS_VARIANT: Record<AttendanceStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'> = {
  present: 'success',
  late: 'warning',
  half_day: 'warning',
  absent: 'destructive',
  on_leave: 'secondary',
  holiday: 'outline',
  weekend: 'outline',
};

function exportCSV(rows: Attendance[]): void {
  const headers = ['Employee', 'Date', 'Check-in', 'Check-out', 'Hours', 'Status', 'Late (min)'];
  const lines = rows.map((r) => {
    const emp = typeof r.employeeId === 'object' ? `${r.employeeId.firstName} ${r.employeeId.lastName}` : '';
    const ci = r.checkIn?.time ? new Date(r.checkIn.time).toLocaleTimeString() : '';
    const co = r.checkOut?.time ? new Date(r.checkOut.time).toLocaleTimeString() : '';
    return [
      emp,
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
  a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceListPage(): ReactElement {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading } = useAttendanceList({
    limit: 100,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const columns: DataTableColumn<Attendance>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => {
        const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
        return emp ? (
          <span className="font-medium">{`${emp.firstName} ${emp.lastName}`}</span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'date',
      header: 'Date',
      cell: (r) => new Date(r.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      key: 'checkIn',
      header: 'Check-in',
      cell: (r) => (r.checkIn?.time ? new Date(r.checkIn.time).toLocaleTimeString() : '—'),
    },
    {
      key: 'checkOut',
      header: 'Check-out',
      cell: (r) => (r.checkOut?.time ? new Date(r.checkOut.time).toLocaleTimeString() : '—'),
    },
    {
      key: 'hours',
      header: 'Hours',
      cell: (r) => `${r.totalWorkingHours.toFixed(2)}h`,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace('_', ' ')}</Badge>,
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
        description="View and export workforce attendance"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Records' },
        ]}
        actions={
          <Button variant="outline" onClick={() => exportCSV(data?.data ?? [])}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="half_day">Half Day</option>
            <option value="absent">Absent</option>
            <option value="on_leave">On Leave</option>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No records found"
        emptyDescription="Adjust filters or wait for employees to check in"
      />
    </div>
  );
}
