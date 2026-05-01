import { useState, type ReactElement } from 'react';
import { Plus, Building2, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from '@/hooks/use-systemcore';
import type { Department } from '@/lib/systemcore.api';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  code: z.string().min(1, 'Required'),
  description: z.string().optional(),
  parentDepartment: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});
type FormValues = z.infer<typeof schema>;

export default function DepartmentListPage(): ReactElement {
  const { data, isLoading } = useDepartments({ limit: 100 });
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const remove = useDeleteDepartment();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active' },
  });

  const openCreate = (): void => {
    setEditing(null);
    reset({ name: '', code: '', description: '', parentDepartment: '', status: 'active' });
    setOpen(true);
  };

  const openEdit = (d: Department): void => {
    setEditing(d);
    reset({
      name: d.name,
      code: d.code,
      description: d.description ?? '',
      parentDepartment: d.parentDepartment?._id ?? '',
      status: d.status,
    });
    setOpen(true);
  };

  const onSubmit = (values: FormValues): void => {
    const payload = { ...values, parentDepartment: values.parentDepartment || undefined };
    if (editing) {
      update.mutate(
        { id: editing._id, input: payload },
        { onSuccess: () => setOpen(false) },
      );
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Organize your company structure"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Departments' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Department
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !data?.data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Building2}
              title="No departments yet"
              description="Create your first department to organize your employees"
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" /> New Department
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((d) => (
            <Card key={d._id} className="transition-shadow hover:shadow-elevated">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Building2 className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{d.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground">{d.code}</p>
                    </div>
                  </div>
                  <Badge variant={d.status === 'active' ? 'success' : 'secondary'}>
                    {d.status}
                  </Badge>
                </div>
                {d.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">
                    {d.employeeCount ?? 0} employees
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(d)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete department "${d.name}"?`)) remove.mutate(d._id);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit department' : 'New department'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="d-name">Name *</Label>
              <Input id="d-name" {...register('name')} />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="d-code">Code *</Label>
              <Input id="d-code" {...register('code')} placeholder="ENG" />
            </div>
            <div>
              <Label htmlFor="d-parent">Parent department</Label>
              <Select id="d-parent" {...register('parentDepartment')}>
                <option value="">None</option>
                {data?.data
                  .filter((x) => x._id !== editing?._id)
                  .map((x) => (
                    <option key={x._id} value={x._id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="d-status">Status</Label>
              <Select id="d-status" {...register('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="d-desc">Description</Label>
              <Textarea id="d-desc" rows={3} {...register('description')} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
