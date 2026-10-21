import { useState, type ReactElement } from 'react';
import { Plus, Trash2, MapPin, Circle, ToggleLeft, ToggleRight, Search, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  useGeofences,
  useCreateGeofence,
  useDeleteGeofence,
  useUpdateGeofence,
} from '@/hooks/use-attendance';
import type { GeofenceZone } from '@/lib/attendance.api';
import { GEOCODE_URL, geocode } from '@/lib/map-config';

/** Renders a simple SVG circle diagram showing the geofence zone visually. */
function GeoCirclePreview({
  name,
  radius,
}: {
  name: string;
  radius: number;
}): ReactElement {
  const SIZE = 120;
  const MAX_R = 45;
  // Scale: cap at MAX_R px for zones ≤ 1000m, grow slowly beyond.
  const r = Math.min(MAX_R, Math.max(12, (radius / 1000) * MAX_R));

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Outer faint ring */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={MAX_R + 4} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        {/* Zone circle */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          fill="#6366f120"
          stroke="#6366f1"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
        {/* Centre pin */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={4} fill="#6366f1" />
      </svg>
      <p className="text-xs text-muted-foreground">{name}</p>
      <p className="text-xs font-semibold text-primary">{radius}m radius</p>
    </div>
  );
}

export default function GeofencePage(): ReactElement {
  const { data, isLoading, error, refetch } = useGeofences({ limit: 100 });
  const create = useCreateGeofence();
  const remove = useDeleteGeofence();
  const update = useUpdateGeofence();

  const [open, setOpen] = useState(false);
  const [previewZone, setPreviewZone] = useState<GeofenceZone | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'polygon'>('circle');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [autoCheckIn, setAutoCheckIn] = useState(false);
  const [autoCheckOut, setAutoCheckOut] = useState(false);
  const [polygonText, setPolygonText] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetchingCoords, setIsFetchingCoords] = useState(false);

  // Address search goes to the operator-configured geocoder (VITE_GEOCODE_URL);
  // without one the search box is hidden and nothing leaves the network.
  const fetchCoordinates = async () => {
    if (!searchQuery || !GEOCODE_URL) return;
    setIsFetchingCoords(true);
    try {
      const hit = await geocode(searchQuery);
      if (hit) {
        setLat(hit.lat.toFixed(5));
        setLng(hit.lng.toFixed(5));
        toast.success("Coordinates found!");
      } else {
        toast.error("Location not found.");
      }
    } catch (err) {
      toast.error("Error fetching coordinates.");
    } finally {
      setIsFetchingCoords(false);
    }
  };

  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setIsFetchingCoords(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(5));
        setLng(position.coords.longitude.toFixed(5));
        setIsFetchingCoords(false);
        toast.success("Current location fetched!");
      },
      (_err) => {
        setIsFetchingCoords(false);
        toast.error("Unable to retrieve your location");
      }
    );
  };

  const resetForm = (): void => {
    setName(''); setLat(''); setLng(''); setRadius('200');
    setAutoCheckIn(false); setAutoCheckOut(false); setPolygonText('');
    setType('circle');
    setSearchQuery('');
  };

  const submit = (): void => {
    if (type === 'circle') {
      create.mutate(
        {
          name,
          type: 'circle',
          center: { lat: Number(lat), lng: Number(lng) },
          radius: Number(radius),
          autoCheckIn,
          autoCheckOut,
          isActive: true,
        },
        { onSuccess: () => { setOpen(false); resetForm(); } },
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
      create.mutate(
        { name, type: 'polygon', coordinates: coords, isActive: true },
        { onSuccess: () => { setOpen(false); resetForm(); } },
      );
    }
  };

  const toggleActive = (zone: GeofenceZone): void => {
    update.mutate({ id: zone._id, input: { isActive: !zone.isActive } });
  };

  const columns: DataTableColumn<GeofenceZone>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="size-4 text-primary" />
          </div>
          <span className="font-medium">{r.name}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <Badge variant="outline">{r.type}</Badge>,
    },
    {
      key: 'detail',
      header: 'Coordinates / Radius',
      cell: (r) =>
        r.type === 'circle' && r.center
          ? (
            <div className="flex items-center gap-1 text-sm">
              <Circle className="size-3 text-primary" />
              <span className="font-mono text-xs">
                {r.center.lat.toFixed(4)}, {r.center.lng.toFixed(4)}
              </span>
              <Badge variant="secondary" className="ml-1">{r.radius}m</Badge>
            </div>
          )
          : `${r.coordinates?.length ?? 0} points`,
    },
    {
      key: 'auto',
      header: 'Auto Clock',
      cell: (r) => (
        <div className="flex gap-1 text-xs">
          {r.autoCheckIn && <Badge variant="success" className="text-[10px]">In</Badge>}
          {r.autoCheckOut && <Badge variant="warning" className="text-[10px]">Out</Badge>}
          {!r.autoCheckIn && !r.autoCheckOut && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      cell: (r) => (
        <button
          onClick={() => toggleActive(r)}
          className="flex items-center gap-1.5 text-sm"
          title={r.isActive ? 'Click to deactivate' : 'Click to activate'}
        >
          {r.isActive
            ? <ToggleRight className="size-5 text-success" />
            : <ToggleLeft className="size-5 text-muted-foreground" />}
          <Badge variant={r.isActive ? 'success' : 'secondary'}>
            {r.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </button>
      ),
    },
    {
      key: 'preview',
      header: '',
      width: '60px',
      cell: (r) =>
        r.type === 'circle' && r.radius ? (
          <button
            onClick={() => setPreviewZone(r)}
            className="rounded p-1.5 text-primary hover:bg-primary/10"
            title="Preview zone"
          >
            <Circle className="size-4" />
          </button>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) => (
        <button
          onClick={() => {
            if (confirm(`Delete "${r.name}"?`)) remove.mutate(r._id);
          }}
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
        description="Define circular perimeter zones. Employees must be inside an active zone to clock in via Geo method."
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

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold text-foreground">How Geofencing Works</p>
          <p className="mt-1 text-muted-foreground">
            When an employee selects <strong>Geofence</strong> clock-in on the mobile app or web,
            their GPS position is checked against all <strong>Active</strong> circle zones below.
            If they are within the radius of any zone, the clock-in is allowed.
            Otherwise, they see the distance to the nearest office and are blocked.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        rowKey={(r) => r._id}
        emptyTitle="No geofence zones"
        emptyDescription="Create a circle zone to enforce location-based clock-in"
      />

      {/* Zone preview dialog */}
      {previewZone && previewZone.type === 'circle' && (
        <Dialog open={!!previewZone} onClose={() => setPreviewZone(null)} size="sm">
          <DialogHeader>
            <DialogTitle>Zone Preview — {previewZone.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col items-center gap-4 py-6">
            <GeoCirclePreview name={previewZone.name} radius={previewZone.radius!} />
            <div className="grid w-full grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Latitude</p>
                <p className="font-mono font-semibold">{previewZone.center?.lat.toFixed(5)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Longitude</p>
                <p className="font-mono font-semibold">{previewZone.center?.lng.toFixed(5)}</p>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-primary/5 p-3 text-center">
                <p className="text-xs text-muted-foreground">Allowed Radius</p>
                <p className="text-2xl font-bold text-primary">{previewZone.radius}m</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewZone(null)}>Close</Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Create zone dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>New Geofence Zone</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="g-name">Zone Name *</Label>
            <Input id="g-name" placeholder="Head Office, Branch A, Warehouse..." value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="g-type">Shape</Label>
            <Select id="g-type" value={type} onChange={(e) => setType(e.target.value as 'circle' | 'polygon')}>
              <option value="circle">Circle (recommended for most offices)</option>
              <option value="polygon">Polygon (custom boundary)</option>
            </Select>
          </div>
          {type === 'circle' ? (
            <>
              <div className="mb-2 space-y-2 rounded-md border border-border p-3 bg-muted/20">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Auto-fill Coordinates</Label>
                <div className="flex gap-2">
                  {GEOCODE_URL && (
                    <>
                      <Input
                        placeholder="Enter city, address, or landmark..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void fetchCoordinates(); } }}
                      />
                      <Button type="button" variant="secondary" onClick={() => void fetchCoordinates()} disabled={!searchQuery || isFetchingCoords}>
                        {isFetchingCoords ? '...' : <Search className="size-4" />}
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="outline" onClick={fetchCurrentLocation} disabled={isFetchingCoords} title="Use Current Location">
                    <LocateFixed className="size-4 text-primary" />
                    {!GEOCODE_URL && <span className="ml-1">Use my current location</span>}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="g-lat">Latitude *</Label>
                  <Input id="g-lat" placeholder="e.g. 28.6139" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="g-lng">Longitude *</Label>
                  <Input id="g-lng" placeholder="e.g. 77.2090" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="g-rad">Radius (metres)</Label>
                  <Input id="g-rad" type="number" value={radius} onChange={(e) => setRadius(e.target.value)} />
                </div>
              </div>
              {/* Live circle preview */}
              {Number(radius) > 0 && name && (
                <div className="rounded-xl border border-border bg-muted/20 py-4">
                  <GeoCirclePreview name={name} radius={Number(radius)} />
                </div>
              )}
            </>
          ) : (
            <div>
              <Label htmlFor="g-poly">Polygon coordinates (one per line: lat,lng)</Label>
              <textarea
                id="g-poly"
                rows={6}
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                value={polygonText}
                onChange={(e) => setPolygonText(e.target.value)}
                placeholder={"28.6139, 77.2090\n28.6145, 77.2095\n..."}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Auto Clock (optional)</Label>
            <div className="flex items-center gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoCheckIn}
                  onChange={(e) => setAutoCheckIn(e.target.checked)}
                  className="size-4"
                />
                Auto clock-in when entering zone
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoCheckOut}
                  onChange={(e) => setAutoCheckOut(e.target.checked)}
                  className="size-4"
                />
                Auto clock-out when leaving zone
              </label>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name || (type === 'circle' && (!lat || !lng))}>
            Create Zone
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
