import { useState, type ReactElement } from 'react';
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  Calculator,
} from 'lucide-react';
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
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useApproveOvertime,
  useCreateOvertime,
  useDeleteOvertime,
  useMyOvertimeRequests,
  useOvertimeRequests,
  useOvertimeStats,
  useRejectOvertime,
} from '@/hooks/use-overtime';
import { useEmployees } from '@/hooks/use-systemcore';
import { usePermissions } from '@/hooks/use-permissions';
import {
  OVERTIME_STATUSES,
  type OvertimeRequest,
  type OvertimeStatus,
} from '@/lib/overtime.api';
import { formatDate, formatRelative } from '@/lib/format';

const STATUS_VARIANT: Record<OvertimeStatus, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

const createSchema = z.object({
  employee: z.string().optional(),
  date: z.string().min(1, 'Pick a date'),
  hours: z.coerce.number().positive().max(24),
  reason: z.string().min(1).max(1000),
});
type CreateValues = z.infer<typeof createSchema>;

const rejectSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export default function OvertimePage(): ReactElement {
  const { hasAny } = usePermissions();
  const canApprove = hasAny(['overtime.approve', 'attendance.manage']);
  const canViewAll = hasAny(['overtime.view', 'attendance.view']) || canApprove;
  // Approvers land on the All-Requests tab; submitters land on My Requests.
  const defaultTab = canApprove ? 'all' : 'mine';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overtime"
        description="Submit overtime hours and track approval status"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Overtime' }]}
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {!canApprove && <TabsTrigger value="mine">My Requests</TabsTrigger>}
          {canViewAll && <TabsTrigger value="all">All Requests</TabsTrigger>}
        </TabsList>
        {!canApprove && (
          <TabsContent value="mine">
            <MyRequestsTab />
          </TabsContent>
        )}
        {canViewAll && (
          <TabsContent value="all">
            <AllRequestsTab canApprove={canApprove} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ──────────────────────────── My Requests ──────────────────────────── */

function MyRequestsTab(): ReactElement {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useMyOvertimeRequests({ page, limit: 20 });
  const create = useCreateOvertime();
  const remove = useDeleteOvertime();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { hours: 1 },
  });

  const onSubmit = (values: CreateValues): void => {
    create.mutate(
      { date: values.date, hours: values.hours, reason: values.reason },
      {
        onSuccess: () => {
          reset({ hours: 1 });
          setOpen(false);
        },
      },
    );
  };

  const hours = watch('hours');

  const columns: DataTableColumn<OvertimeRequest>[] = [
    { key: 'date', header: 'Date', cell: (r) => formatDate(r.date) },
    {
      key: 'hours',
      header: 'Hours',
      cell: (r) => (
        <span className="font-mono">
          {r.hours.toFixed(2)}h <span className="text-xs text-muted-foreground">({(r.hours * 60).toFixed(0)} min)</span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => <span className="line-clamp-2 text-sm">{r.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) =>
        r.status === 'pending' ? (
          <button
            onClick={() => {
              if (confirm('Withdraw this request?')) remove.mutate(r._id);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Withdraw"
          >
            <Trash2 className="size-4" />
          </button>
        ) : (
          <span />
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New OT Request
        </Button>
      </div>

      <DataTable<OvertimeRequest>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No overtime requests yet"
        emptyDescription="Submit your first OT request when you've worked extra hours"
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New overtime request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="ot-date">Date *</Label>
              <Input id="ot-date" type="date" {...register('date')} />
              {errors.date && (
                <p className="mt-1 text-xs text-destructive">{errors.date.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="ot-hours">Hours *</Label>
              <Input
                id="ot-hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                {...register('hours')}
              />
              {errors.hours && (
                <p className="mt-1 text-xs text-destructive">{errors.hours.message}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                = {((Number(hours) || 0) * 60).toFixed(0)} minutes
              </p>
            </div>
            <div>
              <Label htmlFor="ot-reason">Reason *</Label>
              <Textarea
                id="ot-reason"
                rows={3}
                placeholder="Why did you need to work extra hours?"
                {...register('reason')}
              />
              {errors.reason && (
                <p className="mt-1 text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>
            <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Calculator className="mt-0.5 size-3.5" />
              <span>
                OT pay is calculated at <strong>2× the per-minute rate</strong> based on your
                gross salary and actual present days for the month. Approved requests are
                added to that month's payslip automatically.
              </span>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

/* ──────────────────────────── All Requests (approval) ──────────────────────────── */

function AllRequestsTab({ canApprove }: { canApprove: boolean }): ReactElement {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | OvertimeStatus>('pending');
  const [employee, setEmployee] = useState('');
  const { data, isLoading } = useOvertimeRequests({
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(employee ? { employee } : {}),
  });
  const { data: stats } = useOvertimeStats();
  const { data: empData } = useEmployees({ limit: 500 });

  const approve = useApproveOvertime();
  const reject = useRejectOvertime();

  const [rejectOpen, setRejectOpen] = useState<OvertimeRequest | null>(null);
  const [rejReason, setRejReason] = useState('');

  const handleApprove = (r: OvertimeRequest): void => {
    if (!confirm(`Approve ${r.hours}h overtime for ${r.employee.firstName}?`)) return;
    approve.mutate({ id: r._id });
  };

  const submitReject = (): void => {
    if (!rejectOpen) return;
    const parsed = rejectSchema.safeParse({ reason: rejReason });
    if (!parsed.success) return;
    reject.mutate(
      { id: rejectOpen._id, reason: parsed.data.reason },
      {
        onSuccess: () => {
          setRejectOpen(null);
          setRejReason('');
        },
      },
    );
  };

  const columns: DataTableColumn<OvertimeRequest>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => (
        <div className="text-sm">
          <p className="font-medium">
            {r.employee.firstName} {r.employee.lastName}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{r.employee.employeeId}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', cell: (r) => formatDate(r.date) },
    {
      key: 'hours',
      header: 'Hours',
      cell: (r) => (
        <span className="font-mono">
          {r.hours.toFixed(2)}h{' '}
          <span className="text-xs text-muted-foreground">({(r.hours * 60).toFixed(0)}m)</span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => <span className="line-clamp-2 text-sm">{r.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'applied',
      header: 'Applied',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatRelative(r.appliedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) =>
        canApprove && r.status === 'pending' ? (
          <div className="flex gap-1">
            <button
              onClick={() => handleApprove(r)}
              className="rounded-md p-1.5 text-success hover:bg-success/10"
              title="Approve"
            >
              <CheckCircle2 className="size-4" />
            </button>
            <button
              onClick={() => setRejectOpen(r)}
              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
              title="Reject"
            >
              <XCircle className="size-4" />
            </button>
          </div>
        ) : (
          <span />
        ),
    },
  ];

  const s = stats?.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pending" value={s?.byStatus.pending ?? 0} icon={Clock} />
        <StatCard label="Approved" value={s?.byStatus.approved ?? 0} icon={CheckCircle2} />
        <StatCard label="Rejected" value={s?.byStatus.rejected ?? 0} icon={XCircle} />
        <StatCard label="Approved hours (all-time)" value={s?.approvedHours ?? 0} icon={Calculator} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OvertimeStatus | '');
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">All statuses</option>
          {OVERTIME_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={employee}
          onChange={(e) => {
            setEmployee(e.target.value);
            setPage(1);
          }}
          className="sm:w-72"
        >
          <option value="">All employees</option>
          {(empData?.data ?? []).map((emp) => (
            <option key={emp._id} value={emp._id}>
              {emp.firstName} {emp.lastName} ({emp.employeeId})
            </option>
          ))}
        </Select>
      </div>

      <DataTable<OvertimeRequest>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No overtime requests"
        emptyDescription={
          status === 'pending'
            ? 'No requests pending approval right now'
            : 'Try changing the filters'
        }
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}

      <Dialog open={!!rejectOpen} onClose={() => setRejectOpen(null)} size="md">
        <DialogHeader>
          <DialogTitle>Reject overtime request</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tell {rejectOpen?.employee.firstName} why their request can't be approved.
          </p>
          <div>
            <Label htmlFor="rj-reason">Reason *</Label>
            <Textarea
              id="rj-reason"
              rows={4}
              value={rejReason}
              onChange={(e) => setRejReason(e.target.value)}
              placeholder="e.g., this work was not pre-authorised"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectOpen(null)}>
            Cancel
          </Button>
          <Button
            onClick={submitReject}
            disabled={!rejReason.trim()}
            loading={reject.isPending}
          >
            Confirm rejection
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

// Pencil import needs to stay for future inline-edit (currently unused in render).
void Pencil;
