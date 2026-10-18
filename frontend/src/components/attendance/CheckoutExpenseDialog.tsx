import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { documentsApi } from '@/lib/documents.api';
import { expenseCategoriesApi, expenseClaimsApi } from '@/lib/expense-claims.api';

/**
 * The check-out was refused because company policy
 * (`settings.expenseBeforeCheckout`) wants today's expense entry first — the
 * server's contract for "open the expense form".
 */
export function isExpenseRequiredError(e: unknown): boolean {
  const err = e as { response?: { data?: { error?: { code?: string } } } };
  return err?.response?.data?.error?.code === 'EXPENSE_REQUIRED_FOR_CHECKOUT';
}

interface CheckoutExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called once today's claim exists: retry the check-out. The caller closes
   * the dialog when the check-out succeeds; if it fails, submitting again
   * only retries the check-out — the claim is never filed twice.
   */
  onFiled: () => void;
  /** The check-out retry is in flight. */
  checkingOut: boolean;
}

/**
 * Today's expense entry, asked for only when a check-out answered
 * `EXPENSE_REQUIRED_FOR_CHECKOUT`. Files the claim, then hands back to the
 * caller to check out again.
 */
export function CheckoutExpenseDialog({
  open,
  onClose,
  onFiled,
  checkingOut,
}: CheckoutExpenseDialogProps): ReactElement {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  // Set once this session's claim exists. If the check-out then fails,
  // retrying must NOT create a second claim — that is how people ended up
  // with duplicate expenses for one day.
  const filedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    filedRef.current = false;
    setCategory('');
    setAmount('');
    setDescription('');
    setReceiptUrl('');
  }, [open]);

  const categoriesQ = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseCategoriesApi.list({ limit: 50 }),
    enabled: open, // only fetch when the form opens
  });
  const categories = categoriesQ.data?.data ?? [];
  // Default to "Daily expense" (code DAILY) when categories load.
  const defaultCategoryId = categories.find((c) => c.code === 'DAILY')?._id ?? categories[0]?._id ?? '';

  // Errors are toasted by the global mutation handler (main.tsx).
  const fileClaim = useMutation({
    mutationFn: () =>
      expenseClaimsApi.create({
        category: category || defaultCategoryId,
        amount: Number(amount),
        date: new Date().toISOString(),
        description: description || "Today's expense",
        currency: 'INR',
        status: 'pending',
        receiptUrls: receiptUrl ? [{ name: 'Receipt', fileUrl: receiptUrl }] : [],
      }),
    onSuccess: () => {
      filedRef.current = true;
      toast.success('Expense saved');
      onFiled();
    },
  });

  const submit = (): void => {
    if (filedRef.current) onFiled();
    else fileClaim.mutate();
  };
  const busy = fileClaim.isPending || checkingOut;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} size="md">
      <DialogHeader>
        <DialogTitle>Submit today's expense to check out</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Company policy: today's expense entry is required before you check out. Fill it in below
          and click <span className="font-medium text-foreground">Submit & Check out</span>.
        </p>
        <div>
          <Label htmlFor="exp-category">Category *</Label>
          <Select
            id="exp-category"
            value={category || defaultCategoryId}
            onChange={(e) => setCategory(e.target.value)}
            disabled={categoriesQ.isLoading}
          >
            {categoriesQ.isLoading ? (
              <option>Loading…</option>
            ) : categories.length === 0 ? (
              <option value="">No categories — ask HR to create one</option>
            ) : (
              categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))
            )}
          </Select>
        </div>
        <div>
          <Label htmlFor="exp-amount">Amount (₹)</Label>
          <Input
            id="exp-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="exp-description">Description</Label>
          <Input
            id="exp-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this for?"
          />
        </div>
        {/* A claim for money needs a bill — the server enforces it. Without
            this field an employee with a real expense could not check out at
            all: the claim was rejected and the check-out never ran. */}
        {Number(amount) > 0 && (
          <div>
            <Label htmlFor="exp-receipt">Bill / receipt *</Label>
            {receiptUrl ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-success">
                <Receipt className="size-3.5" /> Bill attached
                <button type="button" className="text-muted-foreground underline" onClick={() => setReceiptUrl('')}>
                  remove
                </button>
              </p>
            ) : (
              <Input
                id="exp-receipt"
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setUploading(true);
                    const res = await documentsApi.upload(file, { folder: 'expenses', category: 'Receipt' });
                    setReceiptUrl(res.data.file.url);
                  } catch {
                    toast.error('Could not upload the bill. Please try again.');
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {uploading ? 'Uploading…' : 'Required to claim an amount. Enter 0 if there was no expense today.'}
            </p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          loading={busy}
          disabled={
            (!category && !defaultCategoryId) ||
            uploading ||
            // Server rejects a money claim with no bill, and that failure
            // also blocks the check-out — so stop it here with a clear cause.
            (Number(amount) > 0 && !receiptUrl)
          }
        >
          <LogOut className="size-4" /> Submit & Check out
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
