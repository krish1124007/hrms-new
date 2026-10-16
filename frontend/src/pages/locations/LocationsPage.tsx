import { useState, type ReactElement } from 'react';
import {
  Building2,
  GitBranch,
  HardHat,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
  Warehouse,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateLocation, useDeleteLocation, useLocations } from '@/hooks/use-locations';
import type { Location, LocationType } from '@/lib/locations.api';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<
  LocationType,
  { icon: ReactElement; label: string; color: string }
> = {
  office: {
    icon: <Building2 className="size-5" />,
    label: 'Office',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  branch: {
    icon: <GitBranch className="size-5" />,
    label: 'Branch',
    color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  },
  warehouse: {
    icon: <Warehouse className="size-5" />,
    label: 'Warehouse',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  },
  site: {
    icon: <HardHat className="size-5" />,
    label: 'Site',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  },
};

export default function LocationsPage(): ReactElement {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useLocations({ limit: 100, search: search || undefined });
  const createLocation = useCreateLocation();
  const deleteLocation = useDeleteLocation();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<LocationType>('office');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const reset = (): void => {
    setName('');
    setType('office');
    setAddress('');
    setPhone('');
    setLat('');
    setLng('');
  };

  const submit = (): void => {
    const coordinates =
      lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
        ? { lat: Number(lat), lng: Number(lng) }
        : undefined;
    createLocation.mutate(
      {
        name,
        type,
        address,
        phone: phone || undefined,
        coordinates,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  };

  const useCurrentLocation = (): void => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    });
  };

  const locations: Location[] = data?.data ?? [];
  const total = locations.length;
  const valid = (canSubmit: boolean): boolean => canSubmit;
  const canSubmit = Boolean(name.trim() && address.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="Manage offices, branches, warehouses, and field sites"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add Location
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search locations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-20 text-center">
          <MapPin className="mb-3 size-12 text-muted-foreground" />
          <p className="text-sm font-medium">No locations added</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your offices, branches, warehouses, and field sites
          </p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add Location
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => {
            const config = TYPE_CONFIG[loc.type];
            const employeeCount = loc.employees?.length ?? 0;
            return (
              <div
                key={loc._id}
                className="flex flex-col rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', config.color)}>
                      {config.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold" title={loc.name}>
                        {loc.name}
                      </h3>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={loc.isActive ? 'default' : 'secondary'} className="text-[10px]">
                      {loc.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <button
                      onClick={() => deleteLocation.mutate(loc._id)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      title="Delete location"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <Separator className="my-3" />

                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-xs leading-relaxed text-muted-foreground">{loc.address}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    {loc.phone ? (
                      <span className="text-xs text-muted-foreground">{loc.phone}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {employeeCount} {employeeCount === 1 ? 'employee' : 'employees'}
                      </span>
                    </div>
                  </div>
                  {loc.coordinates ? (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {loc.coordinates.lat.toFixed(5)}, {loc.coordinates.lng.toFixed(5)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Add location</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="loc-name">Name *</Label>
            <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="loc-type">Type *</Label>
            <Select id="loc-type" value={type} onChange={(e) => setType(e.target.value as LocationType)}>
              <option value="office">Office</option>
              <option value="branch">Branch</option>
              <option value="warehouse">Warehouse</option>
              <option value="site">Site</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="loc-address">Address *</Label>
            <Input id="loc-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="loc-phone">Phone</Label>
            <Input id="loc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="loc-lat">Latitude</Label>
              <Input id="loc-lat" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="loc-lng">Longitude</Label>
              <Input id="loc-lng" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={useCurrentLocation}>
            <MapPin className="mr-2 size-4" />
            Use current location
          </Button>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createLocation.isPending} disabled={!valid(canSubmit)}>
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
