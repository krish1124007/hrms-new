import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, IndianRupee, Plus, ShoppingCart, Truck, XCircle, Trash2, Eye } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { OrderStatusBadge } from '@/components/field/FieldBits';
import { allowedOrderActions, normaliseOrderStatus } from '@/lib/field-rules';
import {
  useCanManageField,
  useDeleteFieldOrder,
  useFieldOrder,
  useFieldOrders,
  useMyEmployeeId,
  useOrderReport,
  useUpdateOrderStatus,
} from '@/hooks/use-field';
import { isNoEmployeeProfileError } from '@/lib/api-error';
import { personName, refId, type OrderStatusChange, type ProductOrder } from '@/lib/field.api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { OrderForm } from './OrderForm';

const money = (n: number | undefined): string => formatCurrency(n ?? 0);
const clientOf = (o: ProductOrder): { name: string; company?: string } =>
  typeof o.clientId === 'object' ? o.clientId : { name: '—' };

const PAYMENT_VARIANT = { paid: 'success', partial: 'warning', pending: 'secondary' } as const;

const ACTION_UI: Record<OrderStatusChange, { label: string; icon: typeof CheckCircle2; variant: 'default' | 'outline' | 'destructive' }> = {
  confirmed: { label: 'Confirm', icon: CheckCircle2, variant: 'default' },
  delivered: { label: 'Mark delivered', icon: Truck, variant: 'default' },
  cancelled: { label: 'Cancel order', icon: XCircle, variant: 'outline' },
};

function OrderDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}): ReactElement {
  const { data, isLoading } = useFieldOrder(id);
  const canManage = useCanManageField();
  const myEmployeeId = useMyEmployeeId();
  const setStatus = useUpdateOrderStatus();
  const remove = useDeleteFieldOrder();
  const [confirm, setConfirm] = useState<OrderStatusChange | 'delete' | null>(null);
  const o = data?.data;

  const actions = o ? allowedOrderActions(o, { canManage, myEmployeeId }) : [];
  const outstanding = o ? Math.max(0, (o.totalAmount ?? 0) - (o.paidAmount ?? 0)) : 0;
  const receivable = o ? ['confirmed', 'delivered'].includes(normaliseOrderStatus(o.status)) : false;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShoppingCart className="size-4" />
          {o ? `Order ${o.orderNumber}` : 'Order'}
          {o && <OrderStatusBadge status={o.status} />}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
        {isLoading || !o ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Client</div>
                <div className="font-medium">{clientOf(o).name}</div>
                {clientOf(o).company && <div className="text-xs text-muted-foreground">{clientOf(o).company}</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Rep</div>
                <div>{personName(o.employeeId)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Placed</div>
                <div>{formatDateTime(o.createdAt)}</div>
                {o.deliveryDate && <div className="text-xs text-muted-foreground">Deliver by {formatDate(o.deliveryDate)}</div>}
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Disc</th>
                    <th className="px-3 py-2 text-right">GST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{l.name}</div>
                        {(l.sku || l.hsnCode) && (
                          <div className="font-mono text-xs text-muted-foreground">
                            {l.sku}
                            {l.hsnCode ? ` · HSN ${l.hsnCode}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.quantity} {l.unit ?? ''}
                      </td>
                      <td className="px-3 py-2 text-right">{money(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{l.discountPercent ?? l.discount ?? 0}%</td>
                      <td className="px-3 py-2 text-right">
                        {l.gstRate != null ? `${l.gstRate}% · ${money(l.lineGst)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{money(l.lineTotal ?? l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Payment:</span>
                  <Badge variant={PAYMENT_VARIANT[o.paymentStatus] ?? 'secondary'}>{o.paymentStatus}</Badge>
                </div>
                <div>
                  Paid {money(o.paidAmount)}
                  {receivable && outstanding > 0 ? ` · ${money(outstanding)} due` : ''}
                </div>
                {o.confirmedAt && <div className="text-xs text-muted-foreground">Confirmed {formatDateTime(o.confirmedAt)}</div>}
                {o.deliveredAt && <div className="text-xs text-muted-foreground">Delivered {formatDateTime(o.deliveredAt)}</div>}
                {o.cancelledAt && <div className="text-xs text-muted-foreground">Cancelled {formatDateTime(o.cancelledAt)}</div>}
                {o.notes && <p className="whitespace-pre-wrap pt-1 text-sm">{o.notes}</p>}
              </div>
              <dl className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{money(o.subtotal)}</dd>
                </div>
                {!!o.discountTotal && (
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">Discount given</dt>
                    <dd>{money(o.discountTotal)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST</dt>
                  <dd>{money(o.gstTotal ?? o.taxAmount)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd>{money(o.total ?? o.totalAmount)}</dd>
                </div>
              </dl>
            </div>
          </>
        )}
      </DialogBody>
      <DialogFooter className="flex-wrap gap-2">
        {o && canManage && (
          <Button variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirm('delete')}>
            <Trash2 className="mr-1 size-4" />
            Delete
          </Button>
        )}
        {o && receivable && outstanding > 0 && (
          <Button variant="outline" asChild>
            <Link
              to={`/field/collections?record=1&clientId=${encodeURIComponent(refId(o.clientId))}&clientName=${encodeURIComponent(clientOf(o).name)}&orderId=${encodeURIComponent(o._id)}`}
            >
              <IndianRupee className="mr-1 size-4" />
              Record payment
            </Link>
          </Button>
        )}
        {actions.map((a) => {
          const ui = ACTION_UI[a];
          const Icon = ui.icon;
          return (
            <Button
              key={a}
              variant={ui.variant}
              loading={setStatus.isPending && setStatus.variables?.status === a}
              onClick={() => (a === 'cancelled' ? setConfirm('cancelled') : setStatus.mutate({ id, status: a }))}
            >
              <Icon className="mr-1 size-4" />
              {ui.label}
            </Button>
          );
        })}
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirm === 'cancelled'}
        onClose={() => setConfirm(null)}
        onConfirm={() => setStatus.mutate({ id, status: 'cancelled' }, { onSuccess: () => setConfirm(null) })}
        loading={setStatus.isPending}
        title={`Cancel order ${o?.orderNumber ?? ''}?`}
        description="A cancelled order no longer counts towards the client's balance or the rep's target. It cannot be reopened."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              setConfirm(null);
              onClose();
            },
          })
        }
        loading={remove.isPending}
        title={`Delete order ${o?.orderNumber ?? ''}?`}
        description="The order is removed from lists and balances. An order with payments against it cannot be deleted — cancel it instead."
        confirmLabel="Delete order"
      />
    </>
  );
}

export default function OrdersPage(): ReactElement {
  const canManage = useCanManageField();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, isLoading, error, refetch } = useFieldOrders({
    page,
    limit: 20,
    status: status || undefined,
    sort: '-createdAt',
  });
  const { data: report } = useOrderReport();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

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
          <div className="font-medium">{clientOf(r).name}</div>
          {clientOf(r).company && <div className="text-xs text-muted-foreground">{clientOf(r).company}</div>}
        </div>
      ),
    },
    { key: 'rep', header: 'Rep', cell: (r) => <span className="text-xs">{personName(r.employeeId)}</span> },
    { key: 'items', header: 'Lines', cell: (r) => <span className="text-xs">{r.items.length}</span> },
    { key: 'total', header: 'Total', cell: (r) => <span className="font-semibold">{money(r.totalAmount)}</span> },
    {
      key: 'paid',
      header: 'Paid',
      cell: (r) => (
        <div className="space-y-0.5 text-xs">
          <div>{money(r.paidAmount)}</div>
          <Badge variant={PAYMENT_VARIANT[r.paymentStatus] ?? 'secondary'}>{r.paymentStatus}</Badge>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (r) => <OrderStatusBadge status={r.status} /> },
    {
      key: 'date',
      header: 'Placed',
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'view',
      header: '',
      width: '50px',
      cell: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setViewing(r._id);
          }}
          className="rounded p-1.5 hover:bg-muted"
          aria-label={`View order ${r.orderNumber}`}
        >
          <Eye className="size-4" />
        </button>
      ),
    },
  ];

  const totals = report?.data.totals;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={
          canManage
            ? 'Catalogue orders from the field — confirm, deliver or cancel them here'
            : 'Your catalogue orders — a manager confirms and delivers them'
        }
        icon={ShoppingCart}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Orders' }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 size-4" />
            New order
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Orders this month" value={totals?.count ?? 0} icon={ShoppingCart} />
        <StatCard label="Booked this month" value={totals?.total ?? 0} format={(n) => formatCurrency(n, { compact: true })} icon={IndianRupee} />
        <StatCard label="Collected against them" value={totals?.paid ?? 0} format={(n) => formatCurrency(n, { compact: true })} icon={CheckCircle2} />
      </div>

      <div className="flex items-center gap-2">
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="order history" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(r) => r._id}
            onRowClick={(r) => setViewing(r._id)}
            emptyTitle="No orders yet"
            emptyDescription="Orders placed from the catalogue appear here."
          />
          <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />
        </>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            New order
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[80vh] overflow-y-auto">
          {creating && (
            <OrderForm
              onCancel={() => setCreating(false)}
              onDone={(order) => {
                setCreating(false);
                setViewing(order._id);
              }}
            />
          )}
        </DialogBody>
      </Dialog>

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} size="xl">
        {viewing && <OrderDetail id={viewing} onClose={() => setViewing(null)} />}
      </Dialog>
    </div>
  );
}
