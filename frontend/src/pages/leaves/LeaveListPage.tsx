import { useState, type ReactElement } from 'react';
import { Ban, Check, X, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RejectionReason } from '@/components/common/RejectionReason';
import { ExpandableText } from '@/components/common/ExpandableText';
import {
  useLeaveRequests,
  useApproveLeave,
  useRejectLeave,
  useCancelLeave,
  useDeleteLeaveRequest,
} from '@/hooks/use-leaves';
import { usePermissions } from '@/hooks/use-permissions';
import type { LeaveRequest, LeaveStatus } from '@/lib/leaves.api';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 25;

const STATUS_VARIANT: Record<LeaveStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  cancelled: 'secondary',
};

export default function LeaveListPage(): ReactElement {
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  // Paged on the server — older requests are a page away, never silently cut off.
  const { data, isLoading, error, refetch } = useLeaveRequests({
    page,
    limit: PAGE_SIZE,
    status: status || undefined,
  });
  const approve = useApproveLeave();
  const reject = useRejectLeave();
  const deleteLeave = useDeleteLeaveRequest();
  const cancelLeave = useCancelLeave();
  const { has } = usePermissions();
  // HR may cancel anyone's leave — even one already under way — with a reason.
  const canCancel = has('leaves.update');

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const submitCancel = (): void => {
    const why = cancelReason.trim();
    if (!cancellingId || why.length < 3) return;
    cancelLeave.mutate(
      { id: cancellingId, reason: why },
      {
        onSuccess: () => {
          setCancellingId(null);
          setCancelReason('');
        },
      },
    );
  };

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
        `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`,
    },
    { key: 'days', header: 'Days', cell: (r) => r.days },
    {
      key: 'reason',
      header: 'Reason',
      // Approvers need the whole reason to decide — the clipped cell opens it.
      cell: (r) => <ExpandableText text={r.reason} title="Leave reason" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
          {r.status === 'rejected' && (
            <RejectionReason reason={r.rejectedReason} title="Leave rejection reason" />
          )}
          {r.status === 'cancelled' && (
            <RejectionReason reason={r.cancelReason} title="Leave cancellation reason" />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '140px',
      cell: (r) => (
        <div className="flex gap-1">
          {r.status === 'pending' && (
            <>
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
            </>
          )}
          {canCancel && (r.status === 'pending' || r.status === 'approved') && (
            <button
              onClick={() => {
                setCancellingId(r._id);
                setCancelReason('');
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Cancel leave"
              aria-label="Cancel leave"
            >
              <Ban className="size-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Are you sure you want to delete this leave request? This will restore the balance if it was approved.',
                )
              ) {
                deleteLeave.mutate(r._id);
              }
            }}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
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
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
        >
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
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No leave requests"
        emptyDescription="Requests submitted by employees will appear here"
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />

      <Dialog open={!!cancellingId} onClose={() => setCancellingId(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Cancel leave</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <p className="text-sm text-muted-foreground">
            The leave's days go back to the employee's balance; days already past are marked
            absent.
          </p>
          <Label htmlFor="cancel-reason">Reason *</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Shown on the request (at least 3 characters)"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancellingId(null)}>
            Keep leave
          </Button>
          <Button
            variant="destructive"
            onClick={submitCancel}
            loading={cancelLeave.isPending}
            disabled={cancelReason.trim().length < 3}
          >
            Cancel leave
          </Button>
        </DialogFooter>
      </Dialog>

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
