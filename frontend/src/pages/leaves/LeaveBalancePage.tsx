import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useLeaveBalances,
  useAllocateLeaveBalances,
  useLeaveTypes,
  useResetLeaveBalances,
} from '@/hooks/use-leaves';
import { useEmployees } from '@/hooks/use-systemcore';
import type { LeaveBalance } from '@/lib/leaves.api';

const schema = z.object({
  leaveTypeId: z.string().min(1),
  year: z.coerce.number().int(),
  allocated: z.coerce.number().min(0),
  applyTo: z.enum(['all', 'selected']).default('all'),
});
type FormValues = z.infer<typeof schema>;

export default function LeaveBalancePage(): ReactElement {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useLeaveBalances({ year, limit: 200 });
  const { data: types } = useLeaveTypes({ isActive: true, limit: 100 });
  const { data: employees } = useEmployees({ limit: 500 });
  const allocate = useAllocateLeaveBalances();
  const resetBalances = useResetLeaveBalances();

  const handleResetClick = (): void => {
    if (
      confirm(
        `Are you sure you want to reset all leave balances to 0 for the year ${year}? This cannot be undone.`
      )
    ) {
      resetBalances.mutate({ year });
    }
  };

  const [open, setOpen] = useState(false);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { year, applyTo: 'all', allocated: 0 },
  });
  const applyTo = watch('applyTo');

  const openDialog = (): void => {
    setSelectedEmps([]);
    reset({ leaveTypeId: '', year, allocated: 0, applyTo: 'all' });
    setOpen(true);
  };

  const onSubmit = (v: FormValues): void => {
    const ids =
      v.applyTo === 'all'
        ? (employees?.data ?? []).map((e) => e._id)
        : selectedEmps;
    if (ids.length === 0) return;
    allocate.mutate(
      {
        employeeIds: ids,
        leaveTypeId: v.leaveTypeId,
        year: v.year,
        allocated: v.allocated,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  const columns: DataTableColumn<LeaveBalance>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (b) => {
        const emp = typeof b.employeeId === 'object' ? b.employeeId : null;
        return emp ? `${emp.firstName} ${emp.lastName}` : '—';
      },
    },
    {
      key: 'type',
      header: 'Leave Type',
      cell: (b) => (typeof b.leaveTypeId === 'object' ? b.leaveTypeId.name : '—'),
    },
    { key: 'allocated', header: 'Allocated', cell: (b) => b.allocated },
    { key: 'used', header: 'Used', cell: (b) => b.used },
    { key: 'carried', header: 'Carried', cell: (b) => b.carried },
    { key: 'adjusted', header: 'Adjusted', cell: (b) => b.adjusted },
    {
      key: 'balance',
      header: 'Balance',
      cell: (b) => {
        const lt = typeof b.leaveTypeId === 'object' ? b.leaveTypeId : null;
        const isUnpaid = lt
          ? lt.paidLeave === false ||
            /unpaid|un-paid|lwp|loss of pay/i.test(lt.name) ||
            ['LWP', 'LOP', 'UL', 'UNPAID'].includes((lt.code || '').toUpperCase())
          : false;
        if (isUnpaid) {
          return <span className="font-semibold text-amber-500">∞ (Unlimited)</span>;
        }
        return (
          <span className="font-semibold">
            {(b.allocated ?? 0) + (b.carried ?? 0) + (b.adjusted ?? 0) - (b.used ?? 0)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Balances"
        description="Manage employee leave allocations"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Leaves' }, { label: 'Balances' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="destructive" onClick={handleResetClick} loading={resetBalances.isPending}>
              Reset Balances
            </Button>
            <Button onClick={openDialog}>Allocate Leaves</Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="bal-year">Year</Label>
        <Input
          id="bal-year"
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-32"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(b) => b._id}
        emptyTitle="No balances allocated"
        emptyDescription="Click 'Allocate Leaves' to set up annual balances"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Allocate leave balances</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="al-type">Leave type *</Label>
              <Select id="al-type" {...register('leaveTypeId')}>
                <option value="">Select…</option>
                {(types?.data ?? []).map((lt) => (
                  <option key={lt._id} value={lt._id}>
                    {lt.name} ({lt.daysAllowed} days)
                  </option>
                ))}
              </Select>
              {errors.leaveTypeId && (
                <p className="mt-1 text-xs text-destructive">{errors.leaveTypeId.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="al-year">Year *</Label>
                <Input id="al-year" type="number" {...register('year')} />
              </div>
              <div>
                <Label htmlFor="al-amt">Days to allocate *</Label>
                <Input id="al-amt" type="number" step="0.5" {...register('allocated')} />
              </div>
            </div>
            <div>
              <Label htmlFor="al-apply">Apply to</Label>
              <Select id="al-apply" {...register('applyTo')}>
                <option value="all">All employees</option>
                <option value="selected">Selected employees</option>
              </Select>
            </div>
            {applyTo === 'selected' && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
                {(employees?.data ?? []).map((e) => (
                  <label key={e._id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedEmps.includes(e._id)}
                      onChange={(ev) => {
                        if (ev.target.checked) setSelectedEmps([...selectedEmps, e._id]);
                        else setSelectedEmps(selectedEmps.filter((id) => id !== e._id));
                      }}
                    />
                    {e.firstName} {e.lastName}
                  </label>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={allocate.isPending}>
              Allocate
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
