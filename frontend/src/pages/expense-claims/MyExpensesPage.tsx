import { useState, type ReactElement } from 'react';
import { Plus, Trash2, Upload, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm, useFieldArray } from 'react-hook-form';
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
  useMyExpenseClaims,
  useCreateExpenseClaim,
  useDeleteExpenseClaim,
  useExpenseCategories,
} from '@/hooks/use-expense-claims';
import { documentsApi } from '@/lib/documents.api';
import type { ExpenseClaim, ExpenseClaimStatus } from '@/lib/expense-claims.api';

const STATUS_VARIANT: Record<
  ExpenseClaimStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'default'
> = {
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  reimbursed: 'default',
};

const schema = z.object({
  category: z.string().min(1, 'Select a category'),
  amount: z.coerce.number().min(0, 'Amount must be 0 or more'),
  currency: z.string().default('INR'),
  date: z.string().min(1),
  description: z.string().optional(),
  paymentMethod: z.enum(['cash', 'bank', 'card', 'upi', 'cheque', 'other']).optional(),
  status: z.enum(['draft', 'pending']).default('pending'),
  receiptUrls: z
    .array(z.object({ name: z.string().min(1), fileUrl: z.string().url('Valid URL required') }))
    .default([]),
});
type FormValues = z.infer<typeof schema>;

export default function MyExpensesPage(): ReactElement {
  const { data, isLoading } = useMyExpenseClaims({ limit: 50 });
  const { data: cats } = useExpenseCategories({ isActive: true, limit: 100 });
  const create = useCreateExpenseClaim();
  const remove = useDeleteExpenseClaim();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '',
      amount: 0,
      currency: 'INR',
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      receiptUrls: [],
    },
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = form;
  const { fields, append, remove: removeReceipt } = useFieldArray({ control, name: 'receiptUrls' });
  const [uploading, setUploading] = useState<number | null>(null);

  const handleUpload = async (idx: number, file: File): Promise<void> => {
    try {
      setUploading(idx);
      const res = await documentsApi.upload(file, { folder: 'expenses', category: 'Receipt' });
      form.setValue(`receiptUrls.${idx}.fileUrl`, res.data.file.url);
      form.setValue(`receiptUrls.${idx}.name`, file.name);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const openDialog = (): void => {
    reset({
      category: '',
      amount: 0,
      currency: 'INR',
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      description: '',
      receiptUrls: [],
    });
    setOpen(true);
  };

  const onSubmit = (v: FormValues): void => {
    create.mutate(v, { onSuccess: () => setOpen(false) });
  };

  const columns: DataTableColumn<ExpenseClaim>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (c) => new Date(c.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (c) => (typeof c.category === 'object' ? c.category.name : '—'),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (c) => `${c.currency} ${c.amount.toLocaleString('en-IN')}`,
    },
    {
      key: 'desc',
      header: 'Description',
      cell: (c) => <span className="line-clamp-1 max-w-xs">{c.description ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (c) =>
        c.status === 'draft' || c.status === 'pending' ? (
          <button
            onClick={() => {
              if (confirm('Delete this claim?')) remove.mutate(c._id);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Expenses"
        description="Submit and track your expense claims"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'My Expenses' }]}
        actions={
          <Button size="sm" onClick={openDialog}>
            <Plus className="size-4" /> New Claim
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(c) => c._id}
        emptyTitle="No expense claims"
        emptyDescription="Click 'New Claim' to submit your first expense"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New expense claim</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="ec-cat">Category *</Label>
              <Select id="ec-cat" {...register('category')}>
                <option value="">Select category…</option>
                {(cats?.data ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {errors.category && (
                <p className="mt-1 text-xs text-destructive">{errors.category.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ec-amt">Amount</Label>
                <Input id="ec-amt" type="number" step="0.01" {...register('amount')} />
                {errors.amount && (
                  <p className="mt-1 text-xs text-destructive">{errors.amount.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="ec-cur">Currency</Label>
                <Input id="ec-cur" {...register('currency')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ec-date">Date *</Label>
                <Input id="ec-date" type="date" {...register('date')} />
              </div>
              <div>
                <Label htmlFor="ec-pm">Payment method</Label>
                <Select id="ec-pm" {...register('paymentMethod')}>
                  <option value="">—</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="ec-desc">Description</Label>
              <Textarea id="ec-desc" rows={2} {...register('description')} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Receipts</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => append({ name: '', fileUrl: '' })}
                >
                  <Plus className="size-3" /> Add receipt
                </Button>
              </div>
              {fields.map((f, idx) => (
                <div key={f.id} className="mb-2 space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      placeholder="Receipt Name"
                      {...register(`receiptUrls.${idx}.name` as const)}
                      className="h-8"
                    />
                    <button
                      type="button"
                      onClick={() => removeReceipt(idx)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {watch(`receiptUrls.${idx}.fileUrl`) ? (
                      <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="size-4 text-primary" />
                        <span className="truncate">{watch(`receiptUrls.${idx}.fileUrl`)}</span>
                      </div>
                    ) : (
                      <div className="relative flex-1">
                        <Input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(idx, file);
                          }}
                          className="h-9 cursor-pointer pr-10 text-xs"
                          disabled={uploading === idx}
                        />
                        <div className="absolute right-3 top-2.5">
                          {uploading === idx ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Upload className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label htmlFor="ec-status">Status</Label>
              <Select id="ec-status" {...register('status')}>
                <option value="pending">Submit for approval</option>
                <option value="draft">Save as draft</option>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Submit
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
