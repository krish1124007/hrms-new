import { useState, type ReactElement } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGeofences, useCreateGeofence, useDeleteGeofence } from '@/hooks/use-attendance';
import type { GeofenceZone } from '@/lib/attendance.api';

export default function GeofencePage(): ReactElement {
  const { data, isLoading } = useGeofences({ limit: 100 });
  const create = useCreateGeofence();
  const remove = useDeleteGeofence();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'polygon'>('circle');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [polygonText, setPolygonText] = useState('');

  const submit = (): void => {
    if (type === 'circle') {
      create.mutate(
        {
          name,
          type: 'circle',
          center: { lat: Number(lat), lng: Number(lng) },
          radius: Number(radius),
        },
        { onSuccess: () => setOpen(false) },
      );
    } else {
      const coords = polygonText
        .trim()
        .split('\n')
        .map((line) => {
          const [la, ln] = line.split(',').map((v) => Number(v.trim()));
          return { lat: la, lng: ln };
        })
        .filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
      create.mutate({ name, type: 'polygon', coordinates: coords }, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<GeofenceZone>[] = [
    { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <Badge variant="outline">{r.type}</Badge>,
    },
    {
      key: 'detail',
      header: 'Detail',
      cell: (r) =>
        r.type === 'circle' && r.center
          ? `${r.center.lat.toFixed(4)}, ${r.center.lng.toFixed(4)} • ${r.radius}m`
          : `${r.coordinates.length} points`,
    },
    {
      key: 'auto',
      header: 'Auto',
      cell: (r) =>
        [r.autoCheckIn && 'in', r.autoCheckOut && 'out'].filter(Boolean).join('/') || '—',
    },
    {
      key: 'active',
      header: 'Status',
      cell: (r) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Off'}</Badge>,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Geofence Zones"
        description="Define perimeter zones for automatic check-in/out"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Geofences' },
        ]}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Zone
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No geofence zones"
        emptyDescription="Define a circle or polygon to track automatic attendance"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New geofence zone</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="g-name">Name *</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="g-type">Type</Label>
            <Select id="g-type" value={type} onChange={(e) => setType(e.target.value as 'circle' | 'polygon')}>
              <option value="circle">Circle</option>
              <option value="polygon">Polygon</option>
            </Select>
          </div>
          {type === 'circle' ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="g-lat">Lat</Label>
                <Input id="g-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="g-lng">Lng</Label>
                <Input id="g-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="g-rad">Radius (m)</Label>
                <Input id="g-rad" value={radius} onChange={(e) => setRadius(e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="g-poly">Polygon coordinates (one per line: lat,lng)</Label>
              <textarea
                id="g-poly"
                rows={6}
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                value={polygonText}
                onChange={(e) => setPolygonText(e.target.value)}
                placeholder="12.9716, 77.5946&#10;12.9720, 77.5950&#10;..."
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name}>
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
