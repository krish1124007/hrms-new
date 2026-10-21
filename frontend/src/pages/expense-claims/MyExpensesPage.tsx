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
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { RejectionReason } from '@/components/common/RejectionReason';
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
import { formatDate, todayIST } from '@/lib/format';
import { isNoEmployeeProfileError } from '@/lib/api-error';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';

const PAGE_SIZE = 20;

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
  // Claims are reimbursed in rupees only.
  currency: z.literal('INR').default('INR'),
  date: z.string().min(1),
  description: z.string().optional(),
  paymentMethod: z.union([z.enum(['cash', 'bank', 'card', 'upi', 'cheque', 'other']), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  status: z.enum(['draft', 'pending']).default('pending'),
  receiptUrls: z
    .array(z.object({ name: z.string().min(1, 'Name is required'), fileUrl: z.string().min(1, 'File must be uploaded') }))
    .default([]),
})
  // A claim can't be verified without a bill, so a receipt is required before
  // it goes to an approver. Two exemptions: drafts aren't submitted yet, and
  // a zero-amount entry claims no money, so there is no bill to attach.
  .superRefine((v, ctx) => {
    if (v.status !== 'draft' && v.amount > 0 && v.receiptUrls.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiptUrls'],
        message: 'Attach at least one receipt or bill photo to claim an amount',
      });
    }
  });
type FormValues = z.infer<typeof schema>;

export default function MyExpensesPage(): ReactElement {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useMyExpenseClaims({ page, limit: PAGE_SIZE });
  const me = useMyEmployeeProfile();
  // Someone without an employee record (e.g. the seeded admin) has no claims.
  const noProfile = me.noProfile || isNoEmployeeProfileError(error);
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
      // Today on the IST calendar — not the UTC day before 05:30 IST.
      date: todayIST(),
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
  // Bills back up money claimed. A ₹0 entry claims nothing — it's the marker
  // that there was no expense — so it needs no receipt. The number input hands
  // back a string, hence the coercion.
  const receiptRequired = Number(watch('amount')) > 0;

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
      // Today on the IST calendar — not the UTC day before 05:30 IST.
      date: todayIST(),
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
      cell: (c) => formatDate(c.date),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (c) => (typeof c.category === 'object' ? c.category.name : '—'),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (c) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {c.currency} {c.amount.toLocaleString('en-IN')}
          </span>
          {c.acceptedAmount !== undefined && c.acceptedAmount !== c.amount ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-success">
              ✓ Approved: {c.currency} {c.acceptedAmount.toLocaleString('en-IN')}
              <span className="text-muted-foreground font-normal">
                ({Math.round((c.acceptedAmount / c.amount) * 100)}%)
              </span>
            </span>
          ) : c.status === 'approved' ? (
            <span className="text-xs text-success">✓ Full amount approved</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'desc',
      header: 'Description',
      cell: (c) => <span className="line-clamp-1 max-w-xs">{c.description ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
          {c.status === 'rejected' && (
            <RejectionReason reason={c.rejectedReason} title="Why your claim was rejected" />
          )}
        </div>
      ),
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
          noProfile ? undefined : (
            <Button size="sm" onClick={openDialog}>
              <Plus className="size-4" /> New Claim
            </Button>
          )
        }
      />

      {noProfile ? (
        <NoEmployeeProfileNotice feature="expense claim" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(c) => c._id}
            emptyTitle="No expense claims"
            emptyDescription="Click 'New Claim' to submit your first expense"
          />
          <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
        </>
      )}

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
                <Input id="ec-cur" value="INR (₹)" readOnly disabled />
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
                <Label>Receipts {receiptRequired ? '*' : '(not needed for ₹0)'}</Label>
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
                  {(errors.receiptUrls?.[idx]?.name || errors.receiptUrls?.[idx]?.fileUrl) && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.receiptUrls[idx]?.name?.message || errors.receiptUrls[idx]?.fileUrl?.message}
                    </p>
                  )}
                </div>
              ))}
              {(errors.receiptUrls?.root?.message ?? errors.receiptUrls?.message) && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.receiptUrls?.root?.message ?? errors.receiptUrls?.message}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {receiptRequired
                  ? 'A receipt or bill photo is required to claim an amount.'
                  : 'Amount is 0 — no receipt needed. Enter an amount above to attach a bill.'}
              </p>
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
