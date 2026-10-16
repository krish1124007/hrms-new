import { useState, type ReactElement } from 'react';
import { Plus, Trash2, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  useFieldOrders,
  useFieldClients,
  useCreateFieldOrder,
  useUpdateOrderStatus,
  useDeleteFieldOrder,
} from '@/hooks/use-field';
import type {
  ProductOrder,
  ProductOrderInput,
  OrderItem,
  OrderStatus,
} from '@/lib/field.api';

const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

const statusVariant = (s: OrderStatus): 'success' | 'warning' | 'secondary' | 'destructive' => {
  if (s === 'delivered') return 'success';
  if (s === 'cancelled') return 'destructive';
  if (s === 'shipped' || s === 'processing') return 'warning';
  return 'secondary';
};

function blankItem(): OrderItem {
  return { name: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 };
}

export default function OrdersPage(): ReactElement {
  const { data, isLoading } = useFieldOrders();
  const { data: clientsData } = useFieldClients({ limit: 200 });
  const create = useCreateFieldOrder();
  const updateStatus = useUpdateOrderStatus();
  const remove = useDeleteFieldOrder();

  const clients = clientsData?.data ?? [];

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState<OrderItem[]>([blankItem()]);
  const [taxAmount, setTaxAmount] = useState(0);
  const [notes, setNotes] = useState('');

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const totalAmount = subtotal + (taxAmount || 0);

  const updateItem = (idx: number, patch: Partial<OrderItem>): void => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        merged.total = Math.max(
          0,
          merged.quantity * merged.unitPrice - (merged.discount || 0),
        );
        return merged;
      }),
    );
  };

  const reset = (): void => {
    setClientId('');
    setItems([blankItem()]);
    setTaxAmount(0);
    setNotes('');
  };

  const submit = (): void => {
    if (!clientId || items.length === 0 || items.some((i) => !i.name || i.quantity <= 0)) {
      return;
    }
    const input: ProductOrderInput = {
      clientId,
      items,
      taxAmount,
      notes: notes || undefined,
    };
    create.mutate(input, {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
  };

  const columns: DataTableColumn<ProductOrder>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      cell: (r) => <span className="font-mono text-xs">{r.orderNumber}</span>,
    },
    {
      key: 'client',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="font-medium">
            {typeof r.clientId === 'object' ? r.clientId.name : '—'}
          </div>
          {typeof r.clientId === 'object' && r.clientId.company && (
            <div className="text-xs text-muted-foreground">{r.clientId.company}</div>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      cell: (r) => <span className="text-xs">{r.items.length}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      cell: (r) => <span className="font-semibold">{inr(r.totalAmount)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      cell: (r) => (
        <div className="text-xs">
          <div>{inr(r.paidAmount)}</div>
          <Badge
            variant={
              r.paymentStatus === 'paid'
                ? 'success'
                : r.paymentStatus === 'partial'
                  ? 'warning'
                  : 'secondary'
            }
          >
            {r.paymentStatus}
          </Badge>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Select
          value={r.status}
          onChange={(e) =>
            updateStatus.mutate({ id: r._id, status: e.target.value as OrderStatus })
          }
          className="h-8 text-xs"
        >
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) => (
        <button
          onClick={() => remove.mutate(r._id)}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ];

  // status badge variant ref for lint
  void statusVariant;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Field sales orders"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Orders' },
        ]}
        actions={
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            New Order
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No orders yet"
        emptyDescription="Create your first field sales order"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            New order
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="client">Client *</Label>
            <Select
              id="client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">— Select client —</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.company ? `(${c.company})` : ''}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Items</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setItems([...items, blankItem()])}
              >
                <Plus className="mr-1 size-3" />
                Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-4"
                    placeholder="Item name"
                    value={it.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Price"
                    value={it.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="Disc"
                    value={it.discount}
                    onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })}
                  />
                  <div className="col-span-1 flex items-center justify-end text-xs font-medium">
                    {inr(it.total)}
                  </div>
                  <button
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="col-span-1 flex items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                type="number"
                value={taxAmount}
                onChange={(e) => setTaxAmount(Number(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">Subtotal: {inr(subtotal)}</div>
                <div className="text-lg font-bold">Total: {inr(totalAmount)}</div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            disabled={!clientId || items.some((i) => !i.name || i.quantity <= 0)}
          >
            Create order
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
