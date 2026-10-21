import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  FileDown,
  IndianRupee,
  Landmark,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RowActionsMenu, type RowAction } from '@/components/common/RowActionsMenu';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { ClientPicker } from '@/components/field/ClientPicker';
import { PaymentStatusBadge } from '@/components/field/FieldBits';
import { RepSelect } from '@/components/field/RepSelect';
import {
  useBouncePayment,
  useCanManageField,
  useCreatePayment,
  useDeletePayment,
  useDepositPayment,
  useFieldOrders,
  useFieldPayments,
  useMyEmployeeId,
  useOutstandingReport,
  usePaymentsDaily,
  useVerifyPayment,
  useRepSelectRequired,
} from '@/hooks/use-field';
import { apiErrorMessage, isNoEmployeeProfileError } from '@/lib/api-error';
import { businessInstant } from '@/lib/business-day';
import {
  fieldApi,
  newIdempotencyKey,
  personName,
  type FieldPaymentMethod,
  type PaymentCollection,
} from '@/lib/field.api';
import { allowedPaymentActions, normaliseOrderStatus } from '@/lib/field-rules';
import { formatCurrency, formatDateTime, todayIST } from '@/lib/format';

const money = (n: number | undefined): string => formatCurrency(n ?? 0);

const METHODS: Array<{ value: FieldPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];
const methodLabel = (m: string): string => METHODS.find((x) => x.value === m)?.label ?? m;

/** Fetch the receipt PDF with the session's credentials and save it. */
async function downloadReceipt(p: PaymentCollection): Promise<void> {
  try {
    const blob = await fieldApi.receipt(p._id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.receiptNumber}.pdf`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (err) {
    toast.error(apiErrorMessage(err, "Couldn't download the receipt"));
  }
}

interface RecordForm {
  clientId: string;
  clientName: string;
  orderId: string;
  amount: string;
  method: FieldPaymentMethod;
  reference: string;
  /** `YYYY-MM-DDTHH:mm`, read as IST; empty = now. */
  collectedAt: string;
  notes: string;
  repId: string;
}

const blankForm = (clientId = '', orderId = ''): RecordForm => ({
  clientId,
  clientName: '',
  orderId,
  amount: '',
  method: 'cash',
  reference: '',
  collectedAt: '',
  notes: '',
  repId: '',
});

function RecordPaymentDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: RecordForm;
}): ReactElement {
  const [form, setForm] = useState<RecordForm>(initial);
  const key = useRef(newIdempotencyKey());
  const create = useCreatePayment();
  const repRequired = useRepSelectRequired();

  useEffect(() => {
    if (open) {
      setForm(initial);
      key.current = newIdempotencyKey();
    }
  }, [open, initial]);

  // The client's orders that still have money due.
  const { data: ordersData } = useFieldOrders(
    { clientId: form.clientId, limit: 50, sort: '-createdAt' },
    { enabled: open && !!form.clientId },
  );
  const openOrders = useMemo(
    () =>
      (ordersData?.data ?? []).filter(
        (o) => normaliseOrderStatus(o.status) !== 'cancelled' && o.totalAmount - (o.paidAmount ?? 0) > 0.004,
      ),
    [ordersData],
  );
  const order = openOrders.find((o) => o._id === form.orderId);
  const due = order ? Math.round((order.totalAmount - (order.paidAmount ?? 0)) * 100) / 100 : null;

  const amount = Number(form.amount);
  const amountError =
    form.amount.trim() === ''
      ? null
      : !Number.isFinite(amount) || amount <= 0
        ? 'Enter an amount above 0'
        : due !== null && amount > due + 0.004
          ? `More than the ${money(due)} due on this order`
          : null;
  const needsReference = form.method === 'cheque' || form.method === 'bank_transfer' || form.method === 'upi';
  const valid =
    !!form.clientId && form.amount.trim() !== '' && !amountError && (!repRequired || !!form.repId);

  const submit = (): void => {
    if (!valid) return;
    let collectedAt: string | undefined;
    if (form.collectedAt) {
      const [day, time] = form.collectedAt.split('T');
      collectedAt = businessInstant(day, time.slice(0, 5)).toISOString();
    }
    create.mutate(
      {
        input: {
          clientId: form.clientId,
          amount,
          method: form.method,
          reference: form.reference.trim() || undefined,
          orderId: form.orderId || undefined,
          collectedAt,
          notes: form.notes.trim() || undefined,
          employeeId: form.repId || undefined,
        },
        idempotencyKey: key.current,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IndianRupee className="size-4" />
          Record payment
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
        <ClientPicker
          value={form.clientId}
          selectedLabel={form.clientName}
          onChange={(id, name) => setForm({ ...form, clientId: id, clientName: name, orderId: '' })}
          required
          showOutstanding
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-order">Against order</Label>
            <Select
              id="pay-order"
              value={form.orderId}
              disabled={!form.clientId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            >
              <option value="">On account (no order)</option>
              {form.orderId && !order && <option value={form.orderId}>Selected order</option>}
              {openOrders.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderNumber} — {money(o.totalAmount - (o.paidAmount ?? 0))} due
                </option>
              ))}
            </Select>
          </div>
          <RepSelect value={form.repId} onChange={(repId) => setForm({ ...form, repId })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount (₹) *</Label>
            <Input
              id="pay-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            {due !== null && !amountError && <p className="text-xs text-muted-foreground">{money(due)} due on this order</p>}
            {amountError && <p className="text-xs text-destructive">{amountError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select
              id="pay-method"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as FieldPaymentMethod })}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">{needsReference ? 'Reference (cheque / transaction no.)' : 'Reference'}</Label>
            <Input id="pay-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-when">Collected at (IST)</Label>
            <Input
              id="pay-when"
              type="datetime-local"
              max={`${todayIST()}T23:59`}
              value={form.collectedAt}
              onChange={(e) => setForm({ ...form, collectedAt: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Leave empty for now.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-notes">Notes</Label>
          <Textarea id="pay-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid} loading={create.isPending}>
          Record payment
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export default function CollectionsPage(): ReactElement {
  const canManage = useCanManageField();
  const myEmployeeId = useMyEmployeeId();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');

  const { data: payments, isLoading, error, refetch } = useFieldPayments({
    page,
    limit: 20,
    status: status || undefined,
    method: method || undefined,
    sort: '-collectedAt',
  });
  const { data: dailyData } = usePaymentsDaily();
  const { data: outstandingData } = useOutstandingReport({ limit: 8 });
  const deposit = useDepositPayment();
  const verify = useVerifyPayment();
  const bounce = useBouncePayment();
  const remove = useDeletePayment();
  const [confirm, setConfirm] = useState<{ kind: 'bounce' | 'delete'; p: PaymentCollection } | null>(null);

  // `?record=1&clientId=&orderId=` (from an order) opens the dialog prefilled.
  const [recordInit, setRecordInit] = useState<RecordForm | null>(null);
  useEffect(() => {
    if (params.get('record') === '1') {
      setRecordInit({
        ...blankForm(params.get('clientId') ?? '', params.get('orderId') ?? ''),
        clientName: params.get('clientName') ?? '',
      });
      const next = new URLSearchParams(params);
      ['record', 'clientId', 'clientName', 'orderId'].forEach((k) => next.delete(k));
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const daily = dailyData?.data;
  const outstanding = outstandingData?.data;

  const columns: DataTableColumn<PaymentCollection>[] = [
    {
      key: 'receipt',
      header: 'Receipt #',
      cell: (r) => <span className="font-mono text-xs">{r.receiptNumber}</span>,
    },
    {
      key: 'client',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="font-medium">{typeof r.clientId === 'object' ? r.clientId.name : '—'}</div>
          {typeof r.orderId === 'object' && r.orderId && (
            <div className="font-mono text-xs text-muted-foreground">{r.orderId.orderNumber}</div>
          )}
        </div>
      ),
    },
    { key: 'rep', header: 'Collected by', cell: (r) => <span className="text-xs">{personName(r.employeeId)}</span> },
    { key: 'amount', header: 'Amount', cell: (r) => <span className="font-semibold">{money(r.amount)}</span> },
    {
      key: 'method',
      header: 'Method',
      cell: (r) => (
        <div className="text-xs">
          <div>{methodLabel(r.method)}</div>
          {r.reference && <div className="text-muted-foreground">{r.reference}</div>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <PaymentStatusBadge status={r.status} /> },
    {
      key: 'date',
      header: 'Collected',
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.collectedAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      cell: (r) => {
        const allowed = allowedPaymentActions(r, { canManage, myEmployeeId });
        const menu: RowAction[] = [];
        if (allowed.includes('deposit')) menu.push({ label: 'Mark deposited', icon: Landmark, onSelect: () => deposit.mutate(r._id) });
        if (allowed.includes('verify')) menu.push({ label: 'Verify', icon: CheckCircle2, onSelect: () => verify.mutate(r._id) });
        if (allowed.includes('bounce')) menu.push({ label: 'Mark bounced', icon: Ban, onSelect: () => setConfirm({ kind: 'bounce', p: r }), destructive: true });
        if (allowed.includes('delete')) menu.push({ label: 'Delete', icon: Trash2, onSelect: () => setConfirm({ kind: 'delete', p: r }), destructive: true });
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => void downloadReceipt(r)}
              className="rounded p-1.5 text-primary dark:text-blue-400 hover:bg-primary/10"
              title="Download receipt (PDF)"
              aria-label={`Download receipt ${r.receiptNumber}`}
            >
              <FileDown className="size-4" />
            </button>
            {menu.length > 0 && <RowActionsMenu actions={menu} />}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Payments collected in the field, their receipts and what clients still owe"
        icon={Receipt}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Collections' }]}
        actions={
          <Button onClick={() => setRecordInit(blankForm())}>
            <Plus className="mr-2 size-4" />
            Record payment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Collected today" value={daily?.totals.total ?? 0} format={(n) => money(n)} icon={IndianRupee} />
        <StatCard label="Receipts today" value={daily?.totals.count ?? 0} icon={Receipt} />
        <StatCard
          label="Outstanding receivables"
          value={outstanding?.total ?? 0}
          format={(n) => formatCurrency(n, { compact: true })}
          icon={AlertCircle}
        />
      </div>

      {outstanding && outstanding.clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Largest balances due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {outstanding.clients.map((c) => (
                <li key={c._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    {c.company && <div className="truncate text-xs text-muted-foreground">{c.company}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-destructive">{money(c.outstandingAmount)}</div>
                    <div className="text-xs text-muted-foreground">Paid {money(c.totalPayments)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRecordInit({ ...blankForm(c._id), clientName: c.name })}
                  >
                    Collect
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="collected">Collected</option>
          <option value="deposited">Deposited</option>
          <option value="verified">Verified</option>
          <option value="bounced">Bounced</option>
        </Select>
        <Select
          aria-label="Method"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All methods</option>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="collections" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={payments?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(r) => r._id}
            emptyTitle="No payments yet"
            emptyDescription="Recorded collections and their receipts appear here."
          />
          <Pagination page={page} pages={payments?.pagination?.pages ?? 1} onPageChange={setPage} />
        </>
      )}

      <RecordPaymentDialog
        open={recordInit !== null}
        onClose={() => setRecordInit(null)}
        initial={recordInit ?? blankForm()}
      />

      <ConfirmDialog
        open={confirm?.kind === 'bounce'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && bounce.mutate(confirm.p._id, { onSuccess: () => setConfirm(null) })}
        loading={bounce.isPending}
        title={`Mark ${confirm?.p.receiptNumber ?? ''} as bounced?`}
        description="A bounced payment stops counting as received: the client's balance and the order's paid amount go back up."
        confirmLabel="Mark bounced"
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm.p._id, { onSuccess: () => setConfirm(null) })}
        loading={remove.isPending}
        title={`Delete payment ${confirm?.p.receiptNumber ?? ''}?`}
        description="The payment is removed and the client's balance recalculated. Its receipt number is not reused."
        confirmLabel="Delete payment"
      />
    </div>
  );
}
