import { useState, type ReactElement } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
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
} from '@/hooks/use-attendance';
import type { AttendanceSite } from '@/lib/attendance.api';

export default function AttendanceSitesPage(): ReactElement {
  const { data, isLoading } = useAttendanceSites({ limit: 100 });
  const createSite = useCreateSite();
  const deleteSite = useDeleteSite();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('100');

  const submit = (): void => {
    createSite.mutate(
      {
        name,
        address: address || undefined,
        location: { lat: Number(lat), lng: Number(lng) },
        radius: Number(radius),
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName('');
          setAddress('');
          setLat('');
          setLng('');
          setRadius('100');
        },
      },
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
          <Button onClick={() => setOpen(true)}>
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
          <DialogTitle>New attendance site</DialogTitle>
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
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={createSite.isPending}
            disabled={!name || !lat || !lng}
          >
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
