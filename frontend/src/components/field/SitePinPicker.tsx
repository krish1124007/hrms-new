import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import type { LeafletEvent, Marker as LeafletMarker } from 'leaflet';
import { Crosshair, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseLatLng } from '@/lib/field-visits';
import { GEOCODE_URL, geocode } from '@/lib/map-config';
import { MapCanvas } from './MapCanvas';
import { defaultIcon } from './map-icons';

/** Six decimals ≈ 10 cm — finer than any phone fix. */
const fix6 = (n: number): string => n.toFixed(6);

function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }): null {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Keep the pin in view when it moves (typed, looked up, located): zoom in
 * from a country-wide view, otherwise pan only if it left the screen — never
 * undo the zoom someone chose to place it precisely.
 */
function FollowPin({ pinKey }: { pinKey: string }): null {
  const map = useMap();
  useEffect(() => {
    if (!pinKey) return;
    const [lat, lng] = pinKey.split(',').map(Number) as [number, number];
    if (map.getZoom() < 13) map.setView([lat, lng], 16);
    else if (!map.getBounds().contains([lat, lng])) map.panTo([lat, lng]);
  }, [map, pinKey]);
  return null;
}

const RADIUS_STYLE = { color: '#0d9488', weight: 2, fillOpacity: 0.12 } as const;

/**
 * Where a site is: click the map or drag the pin, type the coordinates, use
 * the browser's location, or look up the address (when an address search is
 * configured). The circle shows the radius check-ins are allowed within.
 */
export function SitePinPicker({
  lat,
  lng,
  onChange,
  radiusM,
  addressQuery,
  height = 280,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  radiusM: number;
  /** The typed address, for "From address". */
  addressQuery?: string;
  height?: number;
}): ReactElement {
  const pin = parseLatLng(lat, lng);
  const [busy, setBusy] = useState(false);
  const pick = (la: number, ln: number): void => onChange(fix6(la), fix6(ln));

  const markerHandlers = useMemo(
    () => ({
      dragend: (e: LeafletEvent) => {
        const p = (e.target as LeafletMarker).getLatLng();
        onChange(fix6(p.lat), fix6(p.lng));
      },
    }),
    [onChange],
  );

  const locateMe = (): void => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share its location');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        pick(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setBusy(false);
        toast.error('Unable to get your location');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const fromAddress = async (): Promise<void> => {
    const q = addressQuery?.trim();
    if (!q) {
      toast.error('Enter an address first');
      return;
    }
    setBusy(true);
    try {
      const hit = await geocode(q);
      if (!hit) toast.error('Address not found — click the map to place the pin');
      else pick(hit.lat, hit.lng);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Address search failed');
    } finally {
      setBusy(false);
    }
  };

  const latErr = lat.trim() !== '' && !(Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90);
  const lngErr = lng.trim() !== '' && !(Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180);

  return (
    <div className="space-y-2">
      <MapCanvas height={height}>
        <ClickToPin onPick={pick} />
        <FollowPin pinKey={pin ? `${pin.lat},${pin.lng}` : ''} />
        {pin && (
          <>
            <Circle center={[pin.lat, pin.lng]} radius={Math.max(1, radiusM)} pathOptions={RADIUS_STYLE} />
            <Marker position={[pin.lat, pin.lng]} icon={defaultIcon} draggable eventHandlers={markerHandlers} />
          </>
        )}
      </MapCanvas>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Input
          aria-label="Latitude"
          placeholder="Latitude"
          inputMode="decimal"
          value={lat}
          aria-invalid={latErr || undefined}
          onChange={(e) => onChange(e.target.value, lng)}
        />
        <Input
          aria-label="Longitude"
          placeholder="Longitude"
          inputMode="decimal"
          value={lng}
          aria-invalid={lngErr || undefined}
          onChange={(e) => onChange(lat, e.target.value)}
        />
        <Button type="button" size="sm" variant="outline" className="h-10" onClick={locateMe} disabled={busy}>
          <Crosshair className="size-3" />
          My location
        </Button>
        {GEOCODE_URL && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10"
            onClick={() => void fromAddress()}
            disabled={busy}
          >
            <Search className="size-3" />
            From address
          </Button>
        )}
      </div>
      {latErr || lngErr ? (
        <p className="text-xs text-destructive">
          Latitude must be between -90 and 90 and longitude between -180 and 180.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {pin
            ? 'Drag the pin or click the map to move it. Check-ins farther away than the radius are flagged.'
            : 'Click the map to place the pin, or use your location.'}
        </p>
      )}
    </div>
  );
}
