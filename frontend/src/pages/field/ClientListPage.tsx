import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Crosshair, Mail, Map as MapIcon, MapPin, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useDebounced } from '@/hooks/use-debounced';
import {
  useCanManageField,
  useCreateFieldClient,
  useDeleteFieldClient,
  useFieldClients,
  useFieldReps,
  useUpdateFieldClient,
} from '@/hooks/use-field';
import { usePermissions } from '@/hooks/use-permissions';
import { GEOCODE_URL, geocode } from '@/lib/map-config';
import {
  personName,
  refId,
  type ClientCategory,
  type ClientStatus,
  type FieldClient,
  type FieldClientInput,
  type FieldClientUpdate,
} from '@/lib/field.api';
import { formatCurrency, formatDate } from '@/lib/format';

interface FormState {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  company: string;
  category: ClientCategory;
  status: ClientStatus;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
  assignedTo: string;
  territory: string;
}

const blank: FormState = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  company: '',
  category: 'C',
  status: 'active',
  line1: '',
  city: '',
  state: '',
  pincode: '',
  lat: '',
  lng: '',
  assignedTo: '',
  territory: '',
};

function toInput(f: FormState): FieldClientInput {
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  const hasLocation = f.lat.trim() !== '' && f.lng.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng);
  return {
    name: f.name.trim(),
    contactPerson: f.contactPerson.trim() || undefined,
    phone: f.phone.trim() || undefined,
    email: f.email.trim() || undefined,
    company: f.company.trim() || undefined,
    category: f.category,
    status: f.status,
    address: {
      line1: f.line1.trim() || undefined,
      city: f.city.trim() || undefined,
      state: f.state.trim() || undefined,
      pincode: f.pincode.trim() || undefined,
    },
    location: hasLocation ? { lat, lng } : undefined,
    assignedTo: f.assignedTo || undefined,
    territory: f.territory.trim() || undefined,
  };
}

/**
 * An edit: a field the user emptied goes as `null` (the server clears it) —
 * leaving it out would keep the old value. Address parts are cleared with ''
 * (they are set one by one).
 */
function toUpdate(f: FormState): FieldClientUpdate {
  const input = toInput(f);
  const orNull = (v: string): string | null => v.trim() || null;
  return {
    ...input,
    contactPerson: orNull(f.contactPerson),
    phone: orNull(f.phone),
    email: orNull(f.email),
    company: orNull(f.company),
    territory: orNull(f.territory),
    assignedTo: f.assignedTo || null,
    location: input.location ?? null,
    address: {
      line1: f.line1.trim(),
      city: f.city.trim(),
      state: f.state.trim(),
      pincode: f.pincode.trim(),
    },
  };
}

const latLngError = (f: FormState): string | null => {
  if (f.lat.trim() === '' && f.lng.trim() === '') return null;
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between -90 and 90';
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitude must be between -180 and 180';
  return null;
};

export default function ClientListPage(): ReactElement {
  const canManage = useCanManageField();
  const { has } = usePermissions();
  const { data: reps = [] } = useFieldReps(canManage && has('employees.view'));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [category, setCategory] = useState<'' | ClientCategory>('');
  const [status, setStatus] = useState<'' | ClientStatus>('');
  const { data, isLoading, error, refetch } = useFieldClients({
    page,
    limit: 20,
    search: q || undefined,
    category: category || undefined,
    status: status || undefined,
    sort: 'name',
  });
  const create = useCreateFieldClient();
  const update = useUpdateFieldClient();
  const remove = useDeleteFieldClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldClient | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [deleting, setDeleting] = useState<FieldClient | null>(null);
  const [locating, setLocating] = useState(false);

  const startCreate = (): void => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };
  const startEdit = (c: FieldClient): void => {
    setEditing(c);
    const [lng, lat] = c.location?.coordinates ?? [];
    setForm({
      name: c.name,
      contactPerson: c.contactPerson ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      company: c.company ?? '',
      category: c.category,
      status: c.status,
      line1: c.address?.line1 ?? '',
      city: c.address?.city ?? '',
      state: c.address?.state ?? '',
      pincode: c.address?.pincode ?? '',
      lat: lat != null ? String(lat) : '',
      lng: lng != null ? String(lng) : '',
      assignedTo: c.assignedTo ? refId(c.assignedTo) : '',
      territory: c.territory ?? '',
    });
    setOpen(true);
  };

  const fillMyLocation = (): void => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share its location');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
      },
      () => {
        setLocating(false);
        toast.error('Unable to get your location');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const findAddress = async (): Promise<void> => {
    const query = [form.line1, form.city, form.state, form.pincode].filter((s) => s.trim()).join(', ');
    if (!query) {
      toast.error('Enter an address first');
      return;
    }
    setLocating(true);
    try {
      const hit = await geocode(query);
      if (!hit) toast.error('Address not found — place the pin with your location or type the coordinates');
      else setForm((f) => ({ ...f, lat: hit.lat.toFixed(6), lng: hit.lng.toFixed(6) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Address search failed');
    } finally {
      setLocating(false);
    }
  };

  const locErr = latLngError(form);
  const valid = form.name.trim() !== '' && !locErr;

  const submit = (): void => {
    if (!valid) return;
    if (editing) update.mutate({ id: editing._id, input: toUpdate(form) }, { onSuccess: () => setOpen(false) });
    else create.mutate(toInput(form), { onSuccess: () => setOpen(false) });
  };

  const columns: DataTableColumn<FieldClient>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: (r) => (
        <div>
          <div className="flex items-center gap-1.5 font-medium">
            {r.name}
            {r.location && <MapPin className="size-3 text-muted-foreground" aria-label="Has a location" />}
          </div>
          {r.company && <div className="text-xs text-muted-foreground">{r.company}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Cat',
      width: '60px',
      cell: (r) => (
        <Badge variant={r.category === 'A' ? 'success' : r.category === 'B' ? 'warning' : 'secondary'}>{r.category}</Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (r) => (
        <div className="space-y-0.5 text-xs">
          {r.contactPerson && <div>{r.contactPerson}</div>}
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
    { key: 'rep', header: 'Rep', cell: (r) => <span className="text-xs">{r.assignedTo ? personName(r.assignedTo) : '—'}</span> },
    {
      key: 'lastVisit',
      header: 'Last visit',
      cell: (r) => <span className="text-xs text-muted-foreground">{r.lastVisitDate ? formatDate(r.lastVisitDate) : 'never'}</span>,
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      cell: (r) => (
        <span className={r.outstandingAmount > 0 ? 'font-semibold text-destructive' : r.outstandingAmount < 0 ? 'text-success' : ''}>
          {formatCurrency(r.outstandingAmount ?? 0)}
          {r.outstandingAmount < 0 ? ' credit' : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Badge variant={r.status === 'active' ? 'success' : 'secondary'}>{r.status}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '90px',
            cell: (r: FieldClient) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => startEdit(r)} className="rounded p-1.5 hover:bg-muted" aria-label={`Edit ${r.name}`}>
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
        title="Clients"
        description={canManage ? 'Every field client, their rep and their balance' : 'Field clients — new clients you add are assigned to you'}
        icon={Building2}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Clients' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/field/clients/map">
                <MapIcon className="mr-2 size-4" />
                Map
              </Link>
            </Button>
            <Button onClick={startCreate}>
              <Plus className="mr-2 size-4" />
              New client
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, phone, e-mail, company…"
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
            setCategory(e.target.value as '' | ClientCategory);
            setPage(1);
          }}
          className="w-36"
        >
          <option value="">All categories</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </Select>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | ClientStatus);
            setPage(1);
          }}
          className="w-32"
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No clients"
        emptyDescription="Add a client to start booking visits and orders."
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'New client'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="max-h-[75vh] space-y-3 overflow-y-auto">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-company">Company</Label>
              <Input id="c-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-contact">Contact person</Label>
              <Input id="c-contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-cat">Category</Label>
              <Select id="c-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ClientCategory })}>
                <option value="A">A — Premium</option>
                <option value="B">B — Mid-tier</option>
                <option value="C">C — Standard</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-line1">Address</Label>
            <Input id="c-line1" placeholder="Street address" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input aria-label="City" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input aria-label="State" placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <Input aria-label="Pincode" placeholder="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          </div>

          <div className="space-y-1.5 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Location on the map</span>
              <div className="flex gap-2">
                {GEOCODE_URL && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void findAddress()} disabled={locating}>
                    <Search className="mr-1 size-3" />
                    From address
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={fillMyLocation} disabled={locating}>
                  <Crosshair className="mr-1 size-3" />
                  My location
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input aria-label="Latitude" placeholder="Latitude" inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              <Input aria-label="Longitude" placeholder="Longitude" inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </div>
            {locErr ? (
              <p className="text-xs text-destructive">{locErr}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Visits are checked against this point; a check-in far from it is flagged.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {canManage && reps.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="c-rep">Rep</Label>
                <Select id="c-rep" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                  <option value="">Unassigned</option>
                  {form.assignedTo && !reps.some((r) => r._id === form.assignedTo) && editing?.assignedTo && (
                    <option value={form.assignedTo}>{personName(editing.assignedTo)}</option>
                  )}
                  {reps.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.firstName} {r.lastName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="c-territory">Territory</Label>
              <Input id="c-territory" value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-status">Status</Label>
              <Select id="c-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!valid}>
            {editing ? 'Save' : 'Add client'}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id, { onSuccess: () => setDeleting(null) })}
        loading={remove.isPending}
        title={`Delete ${deleting?.name ?? 'client'}?`}
        description="The client disappears from lists and maps. Their visits, orders and payments stay on record."
        confirmLabel="Delete client"
      />
    </div>
  );
}
