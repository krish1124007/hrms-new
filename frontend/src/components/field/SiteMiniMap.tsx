import { useMemo, type ReactElement } from 'react';
import { Circle, Marker, Polyline, Popup } from 'react-leaflet';
import { MapPinOff } from 'lucide-react';
import type { LatLng, VisitPoint } from '@/lib/field.api';
import { formatDistance } from '@/lib/field-visits';
import { formatTime } from '@/lib/format';
import { FitBounds, MapCanvas } from './MapCanvas';
import { checkInIcon, checkOutIcon, siteIcon } from './map-icons';

const RADIUS_STYLE = { color: '#0d9488', weight: 2, fillOpacity: 0.1 } as const;
const LINK_STYLE = { color: '#64748b', weight: 2, dashArray: '4 6' } as const;

/**
 * A site's pin and allowed radius, and — for a visit — where the check-in
 * and check-out were recorded, each joined to the pin by a dashed line.
 * A site without a pin yet shows "No pin yet" instead of a map.
 */
export function SiteMiniMap({
  site,
  checkIn,
  checkOut,
  height = 300,
}: {
  site: { name: string; location: LatLng | null; radiusM: number };
  checkIn?: VisitPoint;
  checkOut?: VisitPoint;
  height?: number;
}): ReactElement {
  const pin: [number, number] | null = site.location ? [site.location.lat, site.location.lng] : null;
  const inAt = checkIn?.location ? ([checkIn.location.lat, checkIn.location.lng] as [number, number]) : null;
  const outAt = checkOut?.location ? ([checkOut.location.lat, checkOut.location.lng] as [number, number]) : null;
  // The coordinates, not the array identities, decide the view.
  const fitKey = [pin, inAt, outAt]
    .filter((p): p is [number, number] => p !== null)
    .map((p) => p.join(','))
    .join('|');
  const fit = useMemo(
    () => fitKey.split('|').map((p) => p.split(',').map(Number) as [number, number]),
    [fitKey],
  );

  if (!pin) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground"
        style={{ height }}
        data-testid="site-no-pin"
      >
        <MapPinOff className="size-6" aria-hidden />
        <p className="font-medium text-foreground">No pin yet</p>
        <p className="text-xs">Edit the site to place its pin; until then check-ins here cannot be checked against it.</p>
      </div>
    );
  }

  return (
    <MapCanvas height={height}>
      <FitBounds points={fit} signature={fitKey} maxZoom={17} />
      <Circle center={pin} radius={Math.max(1, site.radiusM)} pathOptions={RADIUS_STYLE} />
      <Marker position={pin} icon={siteIcon({ selected: true })} title={site.name}>
        <Popup>
          <div className="text-xs">
            <div className="text-sm font-semibold">{site.name}</div>
            Allowed radius {site.radiusM} m
          </div>
        </Popup>
      </Marker>
      {inAt && checkIn && (
        <>
          <Polyline positions={[pin, inAt]} pathOptions={LINK_STYLE} />
          <Marker position={inAt} icon={checkInIcon} title="Check-in">
            <Popup>
              <div className="text-xs">
                Check-in {formatTime(checkIn.at)} · {formatDistance(checkIn.distanceM)} from the pin
                {checkIn.accuracy != null ? ` · ±${Math.round(checkIn.accuracy)} m` : ''}
              </div>
            </Popup>
          </Marker>
        </>
      )}
      {outAt && checkOut && (
        <>
          <Polyline positions={[pin, outAt]} pathOptions={LINK_STYLE} />
          <Marker position={outAt} icon={checkOutIcon} title="Check-out">
            <Popup>
              <div className="text-xs">
                Check-out {formatTime(checkOut.at)} · {formatDistance(checkOut.distanceM)} from the pin
              </div>
            </Popup>
          </Marker>
        </>
      )}
    </MapCanvas>
  );
}
