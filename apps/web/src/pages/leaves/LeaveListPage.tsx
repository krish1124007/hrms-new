import { useState, type ReactElement } from 'react';
import { Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useLeaveRequests,
  useApproveLeave,
  useRejectLeave,
} from '@/hooks/use-leaves';
import type { LeaveRequest, LeaveStatus } from '@/lib/leaves.api';

const STATUS_VARIANT: Record<LeaveStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  cancelled: 'secondary',
};

export default function LeaveListPage(): ReactElement {
  const [status, setStatus] = useState<string>('');
  const { data, isLoading } = useLeaveRequests({ limit: 50, status: status || undefined });
  const approve = useApproveLeave();
  const reject = useRejectLeave();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const submitReject = (): void => {
    if (!rejectingId || !reason.trim()) return;
    reject.mutate(
      { id: rejectingId, reason },
      {
        onSuccess: () => {
          setRejectingId(null);
          setReason('');
        },
      },
    );
  };

  const columns: DataTableColumn<LeaveRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => {
        const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
        return emp ? <span className="font-medium">{`${emp.firstName} ${emp.lastName}`}</span> : '—';
      },
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => {
        const lt = typeof r.leaveTypeId === 'object' ? r.leaveTypeId : null;
        return lt ? (
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: lt.color }} />
            {lt.name}
          </span>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'period',
      header: 'Period',
      cell: (r) =>
        `${new Date(r.startDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })} → ${new Date(r.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`,
    },
    { key: 'days', header: 'Days', cell: (r) => r.days },
    { key: 'reason', header: 'Reason', cell: (r) => <span className="line-clamp-1 max-w-xs">{r.reason}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      cell: (r) =>
        r.status === 'pending' ? (
          <div className="flex gap-1">
            <button
              onClick={() => approve.mutate(r._id)}
              className="rounded-md p-1.5 text-success hover:bg-success/10"
              title="Approve"
            >
              <Check className="size-4" />
            </button>
            <button
              onClick={() => {
                setRejectingId(r._id);
                setReason('');
              }}
              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
              title="Reject"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Requests"
        description="Review and manage employee leave requests"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Leaves' }, { label: 'Requests' }]}
      />

      <div className="flex items-center gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No leave requests"
        emptyDescription="Requests submitted by employees will appear here"
      />

      <Dialog open={!!rejectingId} onClose={() => setRejectingId(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Reject leave request</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Label htmlFor="rej-reason">Reason *</Label>
          <Textarea
            id="rej-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectingId(null)}>
            Cancel
          </Button>
          <Button onClick={submitReject} loading={reject.isPending} disabled={!reason.trim()}>
            Reject
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
