import { useState, type ReactElement } from 'react';
import { Plus, CheckCircle2, IndianRupee, Receipt, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useFieldPayments,
  useFieldClients,
  usePaymentsDaily,
  useOutstandingReport,
  useCreatePayment,
  useVerifyPayment,
} from '@/hooks/use-field';
import type {
  PaymentCollection,
  PaymentCollectionInput,
  FieldPaymentMethod,
} from '@/lib/field.api';

const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function CollectionsPage(): ReactElement {
  const { data: payments, isLoading } = useFieldPayments();
  const { data: clientsData } = useFieldClients({ limit: 200 });
  const { data: dailyData } = usePaymentsDaily();
  const { data: outstandingData } = useOutstandingReport();
  const create = useCreatePayment();
  const verify = useVerifyPayment();

  const clients = clientsData?.data ?? [];
  const daily = dailyData?.data;
  const outstanding = outstandingData?.data;

  const [open, setOpen] = useState(false);
  const blank: PaymentCollectionInput = {
    clientId: '',
    amount: 0,
    method: 'cash',
  };
  const [form, setForm] = useState<PaymentCollectionInput>(blank);

  const submit = (): void => {
    if (!form.clientId || !form.amount) return;
    create.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(blank);
      },
    });
  };

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
        <span className="font-medium">
          {typeof r.clientId === 'object' ? r.clientId.name : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (r) => <span className="font-semibold">{inr(r.amount)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (r) => <span className="text-xs capitalize">{r.method.replace('_', ' ')}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.reference ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge
          variant={
            r.status === 'verified'
              ? 'success'
              : r.status === 'bounced'
                ? 'destructive'
                : 'secondary'
          }
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Collected',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.collectedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) =>
        r.status !== 'verified' ? (
          <button
            onClick={() => verify.mutate(r._id)}
            className="rounded p-1.5 text-success hover:bg-success/10"
            title="Verify"
          >
            <CheckCircle2 className="size-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Payment collections and outstanding receivables"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Collections' },
        ]}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            Record Payment
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          label="Collected Today"
          value={daily?.totals.total ?? 0}
          format={inr}
          icon={IndianRupee}
        />
        <StatCard label="Receipts Today" value={daily?.totals.count ?? 0} icon={Receipt} />
        <StatCard
          label="Total Outstanding"
          value={outstanding?.total ?? 0}
          format={inr}
          icon={AlertCircle}
        />
      </div>

      {outstanding && outstanding.clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Top Outstanding ({outstanding.clients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {outstanding.clients.slice(0, 8).map((c) => (
                <li
                  key={c._id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    {c.company && (
                      <div className="truncate text-xs text-muted-foreground">{c.company}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-destructive">
                      {inr(c.outstandingAmount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Paid {inr(c.totalPayments)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={payments?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No payments yet"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="client">Client *</Label>
            <Select
              id="client"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            >
              <option value="">— Select client —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                  {c.outstandingAmount > 0 ? ` (${inr(c.outstandingAmount)} due)` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <Select
                id="method"
                value={form.method}
                onChange={(e) =>
                  setForm({ ...form, method: e.target.value as FieldPaymentMethod })
                }
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="reference">Reference (cheque/txn no.)</Label>
            <Input
              id="reference"
              value={form.reference ?? ''}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending}
            disabled={!form.clientId || !form.amount}
          >
            Record
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
