import { useState, type ReactElement } from 'react';
import { Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { ExpandableText } from '@/components/common/ExpandableText';
import { useDecideRegularization, useRegularizations } from '@/hooks/use-attendance';
import type { Attendance, RegularizationStatus } from '@/lib/attendance.api';
import { BUSINESS_TIMEZONE } from '@/lib/business-day';

const STATUS_VARIANT: Record<RegularizationStatus, 'success' | 'warning' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

const PAGE_SIZE = 20;

/** The attendance `date` is the UTC-midnight label of the business day. */
const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Punch and request times in business time (IST), whatever the browser's timezone. */
const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit' });

const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { timeZone: BUSINESS_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });

/**
 * Attendance → Regularizations: the approval queue for "please correct my
 * punches for this day" requests. HR sees everyone's; a manager only their
 * direct reports' (the API scopes the list).
 */
export default function RegularizationsPage(): ReactElement {
  const [status, setStatus] = useState<RegularizationStatus>('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useRegularizations({ status, page, limit: PAGE_SIZE });
  const decide = useDecideRegularization();

  const rows = data?.data ?? [];
  const deciding = (id: string): boolean => decide.isPending && decide.variables?.id === id;

  const columns: DataTableColumn<Attendance>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => {
        const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
        return emp ? (
          <div>
            <div className="font-medium">{`${emp.firstName} ${emp.lastName}`}</div>
            {emp.employeeId && <div className="text-xs text-muted-foreground">{emp.employeeId}</div>}
          </div>
        ) : (
          '—'
        );
      },
    },
    { key: 'day', header: 'Day', cell: (r) => <span className="whitespace-nowrap">{dayLabel(r.date)}</span> },
    {
      key: 'requested',
      header: 'Asked for',
      cell: (r) => {
        const reg = r.regularization;
        if (!reg?.requestedCheckIn && !reg?.requestedCheckOut) {
          return (
            <span className="text-xs text-muted-foreground" title="Approving marks the day present without punch times">
              Reason only
            </span>
          );
        }
        return (
          <div className="flex flex-col text-xs">
            {reg.requestedCheckIn && <span>In {time(reg.requestedCheckIn)}</span>}
            {reg.requestedCheckOut && <span>Out {time(reg.requestedCheckOut)}</span>}
          </div>
        );
      },
    },
    {
      key: 'recorded',
      header: 'Recorded',
      cell: (r) =>
        r.checkIn?.time || r.checkOut?.time ? (
          <div className="flex flex-col text-xs text-muted-foreground">
            {r.checkIn?.time && <span>{`Punched in ${time(r.checkIn.time)}`}</span>}
            {r.checkOut?.time && <span>{`Punched out ${time(r.checkOut.time)}`}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No punches</span>
        ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => <ExpandableText text={r.regularization?.reason} title="Regularization reason" />,
    },
    {
      key: 'requestedAt',
      header: 'Requested',
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.regularization?.requestedAt ? dateTime(r.regularization.requestedAt) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.regularization ? (
          <Badge variant={STATUS_VARIANT[r.regularization.status]}>{r.regularization.status}</Badge>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      cell: (r) =>
        r.regularization?.status === 'pending' ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => decide.mutate({ id: r._id, status: 'approved' })}
              disabled={deciding(r._id)}
              className="rounded-md p-1.5 text-success hover:bg-success/10 disabled:opacity-40"
              aria-label="Approve"
              title="Approve"
            >
              <Check className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => decide.mutate({ id: r._id, status: 'rejected' })}
              disabled={deciding(r._id)}
              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
              aria-label="Reject"
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
        title="Regularizations"
        description="Requests to correct a day's attendance. Approving writes the asked-for punches; a reason-only request marks the day present."
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Regularizations' },
        ]}
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="reg-status">Status</Label>
        <Select
          id="reg-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as RegularizationStatus);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No regularization requests"
        emptyDescription={
          status === 'pending'
            ? 'Nothing waiting for a decision.'
            : `No ${status} requests yet.`
        }
      />
      {data?.pagination && (
        <Pagination page={data.pagination.page} pages={data.pagination.pages} onPageChange={setPage} />
      )}
    </div>
  );
}
