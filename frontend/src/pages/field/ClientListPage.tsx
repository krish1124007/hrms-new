import { useState, type ReactElement } from 'react';
import { Plus, Trash2, Pencil, Phone, Mail } from 'lucide-react';
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
  useFieldClients,
  useCreateFieldClient,
  useUpdateFieldClient,
  useDeleteFieldClient,
} from '@/hooks/use-field';
import type {
  FieldClient,
  FieldClientInput,
  ClientCategory,
  ClientStatus,
} from '@/lib/field.api';

const blank: FieldClientInput = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  company: '',
  category: 'C',
  status: 'active',
  address: { line1: '', city: '', state: '', pincode: '' },
};

const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function ClientListPage(): ReactElement {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'' | ClientCategory>('');
  const { data, isLoading } = useFieldClients({
    search: search || undefined,
    category: category || undefined,
  });
  const create = useCreateFieldClient();
  const update = useUpdateFieldClient();
  const remove = useDeleteFieldClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FieldClientInput>(blank);

  const startCreate = (): void => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const startEdit = (c: FieldClient): void => {
    setEditingId(c._id);
    setForm({
      name: c.name,
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
      company: c.company,
      category: c.category,
      status: c.status,
      tags: c.tags,
      address: c.address ?? {},
      territory: c.territory,
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (editingId) {
      update.mutate({ id: editingId, input: form }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<FieldClient>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          {r.company && (
            <div className="text-xs text-muted-foreground">{r.company}</div>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Cat',
      width: '60px',
      cell: (r) => (
        <Badge
          variant={
            r.category === 'A' ? 'success' : r.category === 'B' ? 'warning' : 'secondary'
          }
        >
          {r.category}
        </Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (r) => (
        <div className="space-y-0.5 text-xs">
          {r.phone && (
            <div className="flex items-center gap-1">
              <Phone className="size-3" /> {r.phone}
            </div>
          )}
          {r.email && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Mail className="size-3" /> {r.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'city',
      header: 'City',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.address?.city ?? '—'}
          {r.address?.state ? `, ${r.address.state}` : ''}
        </span>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      cell: (r) => (
        <span
          className={r.outstandingAmount > 0 ? 'font-semibold text-destructive' : ''}
        >
          {inr(r.outstandingAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={r.status === 'active' ? 'success' : 'secondary'}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => startEdit(r)}
            className="rounded p-1.5 hover:bg-muted"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => remove.mutate(r._id)}
            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
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
        title="Clients"
        description="Field sales client directory"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Clients' },
        ]}
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 size-4" />
            New Client
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as '' | ClientCategory)}
          className="w-32"
        >
          <option value="">All Cats</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No clients yet"
        emptyDescription="Add your first field sales client"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit client' : 'New client'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={form.company ?? ''}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="contact">Contact person</Label>
              <Input
                id="contact"
                value={form.contactPerson ?? ''}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cat">Category</Label>
              <Select
                id="cat"
                value={form.category ?? 'C'}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as ClientCategory })
                }
              >
                <option value="A">A — Premium</option>
                <option value="B">B — Mid-tier</option>
                <option value="C">C — Standard</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="line1">Address</Label>
            <Input
              id="line1"
              placeholder="Street address"
              value={form.address?.line1 ?? ''}
              onChange={(e) =>
                setForm({ ...form, address: { ...form.address, line1: e.target.value } })
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              placeholder="City"
              value={form.address?.city ?? ''}
              onChange={(e) =>
                setForm({ ...form, address: { ...form.address, city: e.target.value } })
              }
            />
            <Input
              placeholder="State"
              value={form.address?.state ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  address: { ...form.address, state: e.target.value },
                })
              }
            />
            <Input
              placeholder="Pincode"
              value={form.address?.pincode ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  address: { ...form.address, pincode: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={form.status ?? 'active'}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ClientStatus })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.name}
          >
            {editingId ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
