import { useState, type ReactElement } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
} from '@/hooks/use-expense-claims';
import type { ExpenseCategory } from '@/lib/expense-claims.api';

const schema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  limit: z.coerce.number().min(0).optional(),
  requiresReceipt: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
type FormValues = z.infer<typeof schema>;

export default function ExpenseCategoryPage(): ReactElement {
  const { data, isLoading } = useExpenseCategories({ limit: 100 });
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const remove = useDeleteExpenseCategory();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { requiresReceipt: true, isActive: true },
  });

  const openCreate = (): void => {
    setEditing(null);
    reset({ name: '', code: '', description: '', requiresReceipt: true, isActive: true });
    setOpen(true);
  };

  const openEdit = (c: ExpenseCategory): void => {
    setEditing(c);
    reset({
      name: c.name,
      code: c.code,
      description: c.description ?? '',
      limit: c.limit,
      requiresReceipt: c.requiresReceipt,
      isActive: c.isActive,
    });
    setOpen(true);
  };

  const onSubmit = (v: FormValues): void => {
    if (editing) {
      update.mutate({ id: editing._id, input: v }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(v, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<ExpenseCategory>[] = [
    { key: 'name', header: 'Name', cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'code', header: 'Code', cell: (c) => <code className="text-xs">{c.code}</code> },
    { key: 'limit', header: 'Limit', cell: (c) => (c.limit ? `₹${c.limit.toLocaleString('en-IN')}` : '—') },
    {
      key: 'receipt',
      header: 'Receipt',
      cell: (c) => (c.requiresReceipt ? 'Required' : 'Optional'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      cell: (c) => (
        <div className="flex gap-1">
          <button
            onClick={() => openEdit(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${c.name}"?`)) remove.mutate(c._id);
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
        title="Expense Categories"
        description="Configure categories for employee expense claims"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Expenses' },
          { label: 'Categories' },
        ]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Category
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(c) => c._id}
        emptyTitle="No categories"
        emptyDescription="Add categories like Travel, Meals, Supplies"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ec-name">Name *</Label>
                <Input id="ec-name" {...register('name')} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="ec-code">Code *</Label>
                <Input id="ec-code" {...register('code')} placeholder="TRVL, MEAL" />
              </div>
            </div>
            <div>
              <Label htmlFor="ec-limit">Per-claim limit (₹)</Label>
              <Input id="ec-limit" type="number" {...register('limit')} />
            </div>
            <div>
              <Label htmlFor="ec-desc">Description</Label>
              <Textarea id="ec-desc" rows={3} {...register('description')} />
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('requiresReceipt')} /> Receipt required
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('isActive')} /> Active
              </label>
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
