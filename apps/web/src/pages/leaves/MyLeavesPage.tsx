import { useState, type ReactElement } from 'react';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useMyLeaveBalances,
  useMyLeaveRequests,
  useApplyLeave,
  useCancelLeave,
  useLeaveTypes,
} from '@/hooks/use-leaves';
import type { LeaveRequest, LeaveStatus } from '@/lib/leaves.api';

const STATUS_VARIANT: Record<LeaveStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  cancelled: 'secondary',
};

const schema = z.object({
  leaveTypeId: z.string().min(1, 'Select a leave type'),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isHalfDay: z.boolean().default(false),
  halfDayType: z.enum(['first_half', 'second_half']).optional(),
  reason: z.string().min(1, 'Reason is required'),
});
type FormValues = z.infer<typeof schema>;

export default function MyLeavesPage(): ReactElement {
  const year = new Date().getFullYear();
  const { data: balances } = useMyLeaveBalances(year);
  const { data: requests, isLoading } = useMyLeaveRequests({ limit: 50 });
  const { data: types } = useLeaveTypes({ isActive: true, limit: 100 });
  const apply = useApplyLeave();
  const cancel = useCancelLeave();

  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isHalfDay: false },
  });
  const isHalfDay = watch('isHalfDay');

  const openDialog = (): void => {
    reset({ leaveTypeId: '', startDate: '', endDate: '', isHalfDay: false, reason: '' });
    setOpen(true);
  };

  const onSubmit = (v: FormValues): void => {
    apply.mutate(
      {
        leaveTypeId: v.leaveTypeId,
        startDate: v.startDate,
        endDate: v.endDate,
        isHalfDay: v.isHalfDay,
        halfDayType: v.isHalfDay ? v.halfDayType : undefined,
        reason: v.reason,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  const columns: DataTableColumn<LeaveRequest>[] = [
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
      width: '90px',
      cell: (r) =>
        r.status === 'pending' || r.status === 'approved' ? (
          <button
            onClick={() => {
              if (confirm('Cancel this leave request?')) cancel.mutate(r._id);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Leaves"
        description={`Apply and track your leave requests for ${year}`}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'My Leaves' }]}
        actions={
          <Button size="sm" onClick={openDialog}>
            <Plus className="size-4" /> Apply Leave
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(balances?.data ?? []).map((b) => {
          const lt = typeof b.leaveTypeId === 'object' ? b.leaveTypeId : null;
          const total = (b.allocated ?? 0) + (b.carried ?? 0) + (b.adjusted ?? 0);
          const remaining = total - (b.used ?? 0);
          return (
            <div
              key={b._id}
              className="rounded-lg border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {lt && <span className="size-2 rounded-full" style={{ backgroundColor: lt.color }} />}
                {lt?.name ?? 'Leave'}
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{remaining}</div>
              <div className="text-xs text-muted-foreground">
                {b.used} used of {total}
              </div>
            </div>
          );
        })}
        {(balances?.data ?? []).length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No leave balances allocated for this year.
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={requests?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No leave requests"
        emptyDescription="Click 'Apply Leave' to submit your first request"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="lr-type">Leave type *</Label>
              <Select id="lr-type" {...register('leaveTypeId')}>
                <option value="">Select leave type…</option>
                {(types?.data ?? []).map((lt) => (
                  <option key={lt._id} value={lt._id}>
                    {lt.name} ({lt.code})
                  </option>
                ))}
              </Select>
              {errors.leaveTypeId && (
                <p className="mt-1 text-xs text-destructive">{errors.leaveTypeId.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lr-start">Start date *</Label>
                <Input id="lr-start" type="date" {...register('startDate')} />
              </div>
              <div>
                <Label htmlFor="lr-end">End date *</Label>
                <Input id="lr-end" type="date" {...register('endDate')} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isHalfDay')} /> Half day
            </label>
            {isHalfDay && (
              <div>
                <Label htmlFor="lr-half">Half day session</Label>
                <Select id="lr-half" {...register('halfDayType')}>
                  <option value="first_half">First half</option>
                  <option value="second_half">Second half</option>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="lr-reason">Reason *</Label>
              <Textarea id="lr-reason" rows={3} {...register('reason')} />
              {errors.reason && (
                <p className="mt-1 text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={apply.isPending}>
              Submit
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
