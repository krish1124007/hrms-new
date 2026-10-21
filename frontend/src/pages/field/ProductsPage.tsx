import { useState, type ReactElement } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useDebounced } from '@/hooks/use-debounced';
import {
  useCanManageField,
  useCreateProduct,
  useDeleteProduct,
  useProductCategories,
  useProducts,
  useUpdateProduct,
} from '@/hooks/use-field';
import { GST_RATES, type Product, type ProductInput } from '@/lib/field.api';
import { formatCurrency } from '@/lib/format';

interface FormState {
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: string;
  gstRate: string;
  hsnCode: string;
  description: string;
  isActive: boolean;
}

const blank: FormState = {
  name: '',
  sku: '',
  category: '',
  unit: 'pcs',
  price: '',
  gstRate: '18',
  hsnCode: '',
  description: '',
  isActive: true,
};

function toInput(f: FormState): ProductInput {
  return {
    name: f.name.trim(),
    sku: f.sku.trim(),
    category: f.category.trim(),
    unit: f.unit.trim() || 'pcs',
    price: Number(f.price),
    gstRate: Number(f.gstRate),
    hsnCode: f.hsnCode.trim() || undefined,
    description: f.description.trim() || undefined,
    isActive: f.isActive,
  };
}

/** The product catalogue the order form prices from. Managed by `field-sales.manage`. */
export default function ProductsPage(): ReactElement {
  const canManage = useCanManageField();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [category, setCategory] = useState('');
  const [active, setActive] = useState<'true' | 'false' | 'all'>('all');

  const { data, isLoading, error, refetch } = useProducts({
    page,
    limit: 25,
    search: q || undefined,
    category: category || undefined,
    active,
    sort: 'name',
  });
  const { data: catData } = useProductCategories();
  const categories = catData?.data ?? [];
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const startCreate = (): void => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };
  const startEdit = (p: Product): void => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      unit: p.unit,
      price: String(p.price),
      gstRate: String(p.gstRate),
      hsnCode: p.hsnCode ?? '',
      description: p.description ?? '',
      isActive: p.isActive,
    });
    setOpen(true);
  };

  const price = Number(form.price);
  const valid =
    form.name.trim() !== '' &&
    form.sku.trim() !== '' &&
    form.category.trim() !== '' &&
    form.price.trim() !== '' &&
    Number.isFinite(price) &&
    price >= 0;

  const submit = (): void => {
    if (!valid) return;
    const input = toInput(form);
    if (editing) update.mutate({ id: editing._id, input }, { onSuccess: () => setOpen(false) });
    else create.mutate(input, { onSuccess: () => setOpen(false) });
  };

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (r) => <span className="text-xs">{r.category}</span> },
    {
      key: 'price',
      header: 'Price',
      cell: (r) => (
        <span>
          {formatCurrency(r.price)} <span className="text-xs text-muted-foreground">/ {r.unit}</span>
        </span>
      ),
    },
    { key: 'gst', header: 'GST', cell: (r) => <span className="text-xs">{r.gstRate}%</span> },
    { key: 'hsn', header: 'HSN', cell: (r) => <span className="font-mono text-xs">{r.hsnCode ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '90px',
            cell: (r: Product) => (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => startEdit(r)}
                  className="rounded p-1.5 hover:bg-muted"
                  aria-label={`Edit ${r.name}`}
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => setDeleting(r)}
                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label={`Delete ${r.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="The catalogue orders are priced from — price, unit and GST rate per product"
        icon={Package}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Products' }]}
        actions={
          canManage ? (
            <Button onClick={startCreate}>
              <Plus className="mr-2 size-4" />
              New product
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, SKU or HSN…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Select
          aria-label="Category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={active}
          onChange={(e) => {
            setActive(e.target.value as 'true' | 'false' | 'all');
            setPage(1);
          }}
          className="w-36"
        >
          <option value="all">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No products"
        emptyDescription={canManage ? 'Add products so reps can take orders from the catalogue.' : undefined}
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New product'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name *</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-sku">SKU *</Label>
              <Input
                id="p-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-cat">Category *</Label>
              <Input
                id="p-cat"
                list="product-categories"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-unit">Unit</Label>
              <Input id="p-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Price (₹, before GST) *</Label>
              <Input
                id="p-price"
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-gst">GST rate</Label>
              <Select id="p-gst" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-hsn">HSN code</Label>
              <Input id="p-hsn" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Available for new orders
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {editing && (
            <p className="text-xs text-muted-foreground">
              Price changes apply to new orders and to pending orders when their lines are edited; confirmed
              orders keep the price they were placed at.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid} loading={create.isPending || update.isPending}>
            {editing ? 'Save' : 'Add product'}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting._id, { onSuccess: () => setDeleting(null) });
        }}
        loading={remove.isPending}
        title={`Remove ${deleting?.name ?? 'product'}?`}
        description="It disappears from the catalogue and cannot be added to new orders. Orders already placed keep their lines. Its SKU becomes free for a new product."
        confirmLabel="Remove product"
      />
    </div>
  );
}
