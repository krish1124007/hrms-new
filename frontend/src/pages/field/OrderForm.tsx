import { useMemo, useRef, useState, type ReactElement } from 'react';
import { PackagePlus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ClientPicker } from '@/components/field/ClientPicker';
import { useDebounced } from '@/hooks/use-debounced';
import { RepSelect } from '@/components/field/RepSelect';
import { useCreateFieldOrder, useProducts, useRepSelectRequired } from '@/hooks/use-field';
import { newIdempotencyKey, type Product, type ProductOrder } from '@/lib/field.api';
import { priceOrder } from '@/lib/order-pricing';
import { formatCurrency } from '@/lib/format';

interface FormLine {
  product: Product;
  /** Kept as typed so a half-typed number does not jump back. */
  quantity: string;
  discountPercent: string;
}

const num = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s));
const money = (n: number): string => formatCurrency(n);

interface OrderFormProps {
  onDone: (order: ProductOrder) => void;
  onCancel: () => void;
  /** Pre-select a client (e.g. booking from a visit). */
  defaultClient?: { id: string; name: string };
  /** The rep's own visit to that client; the visit is marked "order placed". */
  visitId?: string;
}

/**
 * A new order from the product catalogue. Lines pick a product and give a
 * quantity and a discount %; prices, GST and totals are previewed here with
 * the server's formula and computed by the server on submit — the request
 * carries only `productId`, `quantity` and `discountPercent` per line.
 */
export function OrderForm({ onDone, onCancel, defaultClient, visitId }: OrderFormProps): ReactElement {
  const [clientId, setClientId] = useState(defaultClient?.id ?? '');
  const [clientName, setClientName] = useState(defaultClient?.name ?? '');
  const [repId, setRepId] = useState('');
  const repRequired = useRepSelectRequired();
  const [lines, setLines] = useState<FormLine[]>([]);
  const [notes, setNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  // One key per form: a double click or a network retry books one order.
  const idempotencyKey = useRef(newIdempotencyKey());

  const { data: productsData, isLoading: productsLoading } = useProducts({
    search: q || undefined,
    active: 'true',
    sort: 'name',
    limit: 50,
  });
  const products = productsData?.data ?? [];
  const create = useCreateFieldOrder();

  const priced = useMemo(
    () =>
      priceOrder(
        lines.map((l) => ({
          unitPrice: l.product.price,
          gstRate: l.product.gstRate,
          quantity: num(l.quantity),
          discountPercent: l.discountPercent.trim() === '' ? 0 : num(l.discountPercent),
        })),
      ),
    [lines],
  );

  const lineErrors = lines.map((l) => {
    const qty = num(l.quantity);
    const d = l.discountPercent.trim() === '' ? 0 : num(l.discountPercent);
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be more than 0';
    if (!Number.isFinite(d) || d < 0 || d > 100) return 'Discount must be 0–100%';
    return null;
  });
  const valid =
    !!clientId && lines.length > 0 && lineErrors.every((e) => e === null) && (!repRequired || !!repId);

  const addProduct = (p: Product): void => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product._id === p._id);
      if (i === -1) return [...prev, { product: p, quantity: '1', discountPercent: '0' }];
      const next = prev.slice();
      const qty = num(next[i].quantity);
      next[i] = { ...next[i], quantity: String((Number.isFinite(qty) ? qty : 0) + 1) };
      return next;
    });
  };

  const updateLine = (i: number, patch: Partial<Pick<FormLine, 'quantity' | 'discountPercent'>>): void =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = (): void => {
    if (!valid || create.isPending) return;
    create.mutate(
      {
        input: {
          clientId,
          items: lines.map((l) => ({
            productId: l.product._id,
            quantity: num(l.quantity),
            discountPercent: l.discountPercent.trim() === '' ? 0 : num(l.discountPercent),
          })),
          notes: notes.trim() || undefined,
          deliveryDate: deliveryDate || undefined,
          visitId,
          employeeId: repId || undefined,
        },
        idempotencyKey: idempotencyKey.current,
      },
      {
        onSuccess: (res) => {
          idempotencyKey.current = newIdempotencyKey();
          onDone(res.data);
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <ClientPicker
          value={clientId}
          selectedLabel={clientName}
          onChange={(id, name) => {
            setClientId(id);
            setClientName(name);
          }}
          required
          disabled={!!defaultClient}
        />
        <RepSelect value={repId} onChange={setRepId} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="catalogue-search">Add products</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="catalogue-search"
            className="pl-9"
            placeholder="Search the catalogue by name, SKU or HSN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          data-testid="catalogue-results"
          className="max-h-44 overflow-y-auto rounded-md border border-border"
        >
          {productsLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading catalogue…</p>
          ) : products.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {q ? 'No active product matches.' : 'The catalogue has no active products yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{p.name}</span>{' '}
                      <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {money(p.price)} / {p.unit} · GST {p.gstRate}%
                      <PackagePlus className="size-4 text-primary dark:text-blue-400" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="w-24 px-3 py-2 text-right">Qty</th>
              <th className="w-24 px-3 py-2 text-right">Disc %</th>
              <th className="px-3 py-2 text-right">GST</th>
              <th className="px-3 py-2 text-right">Line total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Pick products above to add lines.
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const p = priced.lines[i];
                return (
                  <tr key={l.product._id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.product.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{l.product.sku}</div>
                      {lineErrors[i] && <div className="text-xs text-destructive">{lineErrors[i]}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{money(l.product.price)}</td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Quantity for ${l.product.name}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className="h-8 text-right"
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Discount % for ${l.product.name}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="any"
                        className="h-8 text-right"
                        value={l.discountPercent}
                        onChange={(e) => updateLine(i, { discountPercent: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <div>{money(p.lineGst)}</div>
                      <div className="text-muted-foreground">{l.product.gstRate}%</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{money(p.lineTotal)}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        aria-label={`Remove ${l.product.name}`}
                        onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="delivery">Delivery date</Label>
            <Input id="delivery" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-notes">Notes</Label>
            <Textarea id="order-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <dl className="space-y-1 rounded-md bg-muted/40 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal (after discount)</dt>
            <dd data-testid="order-subtotal">{money(priced.subtotal)}</dd>
          </div>
          {priced.discountTotal > 0 && (
            <div className="flex justify-between text-xs">
              <dt className="text-muted-foreground">Discount given</dt>
              <dd>{money(priced.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">GST</dt>
            <dd data-testid="order-gst">{money(priced.gstTotal)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd data-testid="order-total">{money(priced.total)}</dd>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Prices come from the catalogue; the order is priced again by the server when placed.
          </p>
        </dl>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid} loading={create.isPending}>
          Place order
        </Button>
      </div>
    </div>
  );
}
