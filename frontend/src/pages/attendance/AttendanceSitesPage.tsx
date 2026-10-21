import { useState, type ReactElement } from 'react';
import { Plus, Trash2, MapPin, Pencil, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAttendanceSites,
  useCreateSite,
  useDeleteSite,
  useUpdateSite,
} from '@/hooks/use-attendance';
import type { AttendanceSite } from '@/lib/attendance.api';
import { EmployeeChecklist } from '@/components/employees/EmployeeChecklist';

/** `assignedEmployees` comes back as ids (or populated docs from the detail route). */
function assignedIds(site: AttendanceSite): string[] {
  return (site.assignedEmployees ?? []).map((e: string | { _id: string }) => (typeof e === 'string' ? e : e._id));
}

export default function AttendanceSitesPage(): ReactElement {
  const { data, isLoading } = useAttendanceSites({ limit: 100 });
  const createSite = useCreateSite();
  const deleteSite = useDeleteSite();
  const updateSite = useUpdateSite();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceSite | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [assigning, setAssigning] = useState<AttendanceSite | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('100');

  const fillForm = (site: AttendanceSite | null): void => {
    setEditing(site);
    setName(site?.name ?? '');
    setAddress(site?.address ?? '');
    setLat(site ? String(site.location.lat) : '');
    setLng(site ? String(site.location.lng) : '');
    setRadius(site ? String(site.radius) : '100');
    setIsActive(site?.isActive ?? true);
    setOpen(true);
  };

  const submit = (): void => {
    const input = {
      name,
      address: address || undefined,
      location: { lat: Number(lat), lng: Number(lng) },
      radius: Number(radius),
    };
    const done = { onSuccess: () => setOpen(false) };
    if (editing) updateSite.mutate({ id: editing._id, input: { ...input, isActive } }, done);
    else createSite.mutate(input, done);
  };

  const openAssign = (site: AttendanceSite): void => {
    setAssigning(site);
    setAssignIds(assignedIds(site));
  };

  const saveAssign = (): void => {
    if (!assigning) return;
    updateSite.mutate(
      { id: assigning._id, input: { assignedEmployees: assignIds } },
      { onSuccess: () => setAssigning(null) },
    );
  };

  const useCurrentLocation = (): void => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    });
  };

  const columns: DataTableColumn<AttendanceSite>[] = [
    { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'address', header: 'Address', cell: (r) => r.address ?? '—' },
    {
      key: 'coords',
      header: 'Coordinates',
      cell: (r) => (
        <span className="font-mono text-xs">
          {r.location.lat.toFixed(5)}, {r.location.lng.toFixed(5)}
        </span>
      ),
    },
    { key: 'radius', header: 'Radius', cell: (r) => `${r.radius}m` },
    {
      key: 'active',
      header: 'Status',
      cell: (r) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'employees',
      header: 'Employees',
      cell: (r) => {
        const n = assignedIds(r).length;
        return n === 0 ? <span className="text-muted-foreground">None</span> : `${n} assigned`;
      },
    },
    {
      key: 'manage',
      header: '',
      width: '80px',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => fillForm(r)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Edit site"
            aria-label={`Edit ${r.name}`}
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => openAssign(r)}
            className="rounded p-1.5 text-primary hover:bg-primary/10"
            title="Assign employees"
            aria-label={`Assign employees to ${r.name}`}
          >
            <Users className="size-4" />
          </button>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) => (
        <button
          onClick={() => deleteSite.mutate(r._id)}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Sites"
        description="Manage office locations for GPS-based attendance"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Sites' },
        ]}
        actions={
          <Button onClick={() => fillForm(null)}>
            <Plus className="mr-2 size-4" />
            New Site
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No sites configured"
        emptyDescription="Add your office locations to enable site-based check-in"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit attendance site' : 'New attendance site'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="site-name">Name *</Label>
            <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="site-addr">Address</Label>
            <Input id="site-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="site-lat">Latitude *</Label>
              <Input id="site-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="site-lng">Longitude *</Label>
              <Input id="site-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={useCurrentLocation}>
            <MapPin className="mr-2 size-4" />
            Use current location
          </Button>
          <div>
            <Label htmlFor="site-radius">Radius (meters)</Label>
            <Input
              id="site-radius"
              type="number"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active — check-ins can use this site
            </label>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={createSite.isPending || (!!editing && updateSite.isPending)}
            disabled={!name || !lat || !lng}
          >
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!assigning} onClose={() => setAssigning(null)} size="md">
        <DialogHeader>
          <DialogTitle>Employees at {assigning?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tick the employees who work from this site; untick anyone who has moved.
          </p>
          {assigning && <EmployeeChecklist value={assignIds} onChange={setAssignIds} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAssigning(null)}>
            Cancel
          </Button>
          <Button onClick={saveAssign} loading={updateSite.isPending}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
