import { useState, type ReactElement } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  useLeaveTypes,
  useCreateLeaveType,
  useUpdateLeaveType,
  useDeleteLeaveType,
} from '@/hooks/use-leaves';
import type { LeaveType } from '@/lib/leaves.api';

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  daysAllowed: z.coerce.number().min(0),
  paidLeave: z.boolean().default(true),
  encashable: z.boolean().default(false),
  halfDayAllowed: z.boolean().default(true),
  attachmentRequired: z.boolean().default(false),
  applicableGender: z.enum(['all', 'male', 'female']).default('all'),
  color: z.string().default('#3b82f6'),
  carryForwardEnabled: z.boolean().default(false),
  carryForwardMax: z.coerce.number().min(0).default(0),
});
type FormValues = z.infer<typeof schema>;

export default function LeaveTypesPage(): ReactElement {
  const { data, isLoading } = useLeaveTypes({ limit: 100 });
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const remove = useDeleteLeaveType();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { paidLeave: true, halfDayAllowed: true, color: '#3b82f6', applicableGender: 'all' },
  });

  const openCreate = (): void => {
    setEditing(null);
    reset({
      name: '',
      code: '',
      daysAllowed: 0,
      paidLeave: true,
      encashable: false,
      halfDayAllowed: true,
      attachmentRequired: false,
      applicableGender: 'all',
      color: '#3b82f6',
      carryForwardEnabled: false,
      carryForwardMax: 0,
    });
    setOpen(true);
  };

  const openEdit = (lt: LeaveType): void => {
    setEditing(lt);
    reset({
      name: lt.name,
      code: lt.code,
      daysAllowed: lt.daysAllowed,
      paidLeave: lt.paidLeave,
      encashable: lt.encashable,
      halfDayAllowed: lt.halfDayAllowed,
      attachmentRequired: lt.attachmentRequired,
      applicableGender: lt.applicableGender,
      color: lt.color,
      carryForwardEnabled: lt.carryForward?.enabled ?? false,
      carryForwardMax: lt.carryForward?.maxDays ?? 0,
    });
    setOpen(true);
  };

  const onSubmit = (v: FormValues): void => {
    const payload = {
      name: v.name,
      code: v.code,
      daysAllowed: v.daysAllowed,
      paidLeave: v.paidLeave,
      encashable: v.encashable,
      halfDayAllowed: v.halfDayAllowed,
      attachmentRequired: v.attachmentRequired,
      applicableGender: v.applicableGender,
      color: v.color,
      carryForward: { enabled: v.carryForwardEnabled, maxDays: v.carryForwardMax },
    };
    if (editing) {
      update.mutate({ id: editing._id, input: payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<LeaveType>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (lt) => (
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: lt.color }} />
          <span className="font-medium">{lt.name}</span>
        </div>
      ),
    },
    { key: 'code', header: 'Code', cell: (lt) => <code className="text-xs">{lt.code}</code> },
    { key: 'days', header: 'Days/yr', cell: (lt) => lt.daysAllowed },
    {
      key: 'paid',
      header: 'Paid',
      cell: (lt) => (
        <Badge variant={lt.paidLeave ? 'success' : 'secondary'}>{lt.paidLeave ? 'Paid' : 'Unpaid'}</Badge>
      ),
    },
    {
      key: 'cf',
      header: 'Carry forward',
      cell: (lt) => (lt.carryForward?.enabled ? `Up to ${lt.carryForward.maxDays}` : '—'),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      cell: (lt) => (
        <div className="flex gap-1">
          <button
            onClick={() => openEdit(lt)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${lt.name}"?`)) remove.mutate(lt._id);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
        title="Leave Types"
        description="Configure leave categories, allocations and rules"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Leaves' }, { label: 'Types' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Leave Type
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(lt) => lt._id}
        emptyTitle="No leave types"
        emptyDescription="Create leave types like casual, sick, earned to enable employees to apply"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit leave type' : 'New leave type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lt-name">Name *</Label>
                <Input id="lt-name" {...register('name')} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="lt-code">Code *</Label>
                <Input id="lt-code" {...register('code')} placeholder="CL, SL, EL" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lt-days">Days per year</Label>
                <Input id="lt-days" type="number" step="0.5" {...register('daysAllowed')} />
              </div>
              <div>
                <Label htmlFor="lt-color">Color</Label>
                <Input id="lt-color" type="color" {...register('color')} />
              </div>
            </div>
            <div>
              <Label htmlFor="lt-gender">Applicable gender</Label>
              <Select id="lt-gender" {...register('applicableGender')}>
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('paidLeave')} /> Paid leave
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('encashable')} /> Encashable
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('halfDayAllowed')} /> Half day allowed
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('attachmentRequired')} /> Attachment required
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('carryForwardEnabled')} /> Carry forward
              </label>
              <div>
                <Label htmlFor="lt-cfmax" className="text-xs">Max carry days</Label>
                <Input id="lt-cfmax" type="number" {...register('carryForwardMax')} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
