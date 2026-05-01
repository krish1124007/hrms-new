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
import { Textarea } from '@/components/ui/textarea';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useDepartments,
  useDesignations,
  useCreateDesignation,
  useUpdateDesignation,
  useDeleteDesignation,
} from '@/hooks/use-systemcore';
import type { Designation } from '@/lib/systemcore.api';

const schema = z.object({
  name: z.string().min(1),
  department: z.string().optional(),
  level: z.coerce.number().int().min(1).default(1),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function DesignationListPage(): ReactElement {
  const { data, isLoading } = useDesignations({ limit: 100 });
  const { data: deptData } = useDepartments({ limit: 100 });
  const create = useCreateDesignation();
  const update = useUpdateDesignation();
  const remove = useDeleteDesignation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { level: 1 },
  });

  const openCreate = (): void => {
    setEditing(null);
    reset({ name: '', department: '', level: 1, description: '' });
    setOpen(true);
  };

  const openEdit = (d: Designation): void => {
    setEditing(d);
    reset({
      name: d.name,
      department: d.department?._id ?? '',
      level: d.level,
      description: d.description ?? '',
    });
    setOpen(true);
  };

  const onSubmit = (values: FormValues): void => {
    const payload = { ...values, department: values.department || undefined };
    if (editing) {
      update.mutate({ id: editing._id, input: payload }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<Designation>[] = [
    { key: 'name', header: 'Name', cell: (d) => <span className="font-medium">{d.name}</span> },
    { key: 'department', header: 'Department', cell: (d) => d.department?.name ?? '—' },
    { key: 'level', header: 'Level', cell: (d) => d.level },
    {
      key: 'actions',
      header: '',
      width: '100px',
      cell: (d) => (
        <div className="flex gap-1">
          <button
            onClick={() => openEdit(d)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete designation "${d.name}"?`)) remove.mutate(d._id);
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
        title="Designations"
        description="Job titles and seniority levels"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Designations' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Designation
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(d) => d._id}
        emptyTitle="No designations yet"
        emptyDescription="Add roles like 'Software Engineer', 'Manager', etc."
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit designation' : 'New designation'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="dz-name">Name *</Label>
              <Input id="dz-name" {...register('name')} />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="dz-dept">Department</Label>
              <Select id="dz-dept" {...register('department')}>
                <option value="">None</option>
                {deptData?.data.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dz-level">Level (1 = junior)</Label>
              <Input id="dz-level" type="number" {...register('level')} />
            </div>
            <div>
              <Label htmlFor="dz-desc">Description</Label>
              <Textarea id="dz-desc" rows={3} {...register('description')} />
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
