import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { useSitesMap } from '@/hooks/use-field';
import { SITE_MAP_LIMIT, type LatLng, type SitePin } from '@/lib/field.api';
import { clampBBox } from '@/lib/map-config';
import { formatDate } from '@/lib/format';
import { FitBounds, MapCanvas } from './MapCanvas';
import { siteIcon } from './map-icons';

/** A site not visited for this long is drawn grey. */
const STALE_MS = 30 * 24 * 3600_000;

/** Report the visible area (debounced) whenever the map stops moving. */
function BBoxWatcher({ onChange }: { onChange: (bbox: string) => void }): null {
  const map = useMap();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const report = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const b = map.getBounds();
      onChange(clampBBox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth()));
    }, 350);
  };
  useMapEvents({ moveend: report, zoomend: report });
  useEffect(() => {
    report();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Once, for the opening view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Sites with their pins, loaded for the visible map area only
 * (`GET /field/sites/map?bbox=`, ≤ 500 per view — zoom in for more).
 * `type` narrows the pins to one site type.
 */
export function SitesMap({ type, height = 560 }: { type?: string; height?: number | string }): ReactElement {
  const [bbox, setBbox] = useState<string | null>(null);
  const { data, isFetching, error } = useSitesMap(bbox);
  // Only sites with a pin can be drawn (the server sends located ones; a pin-less one is skipped).
  const all = useMemo(
    () => (data?.data ?? []).filter((p): p is SitePin & { location: LatLng } => p.location !== null),
    [data],
  );
  const pins = useMemo(() => (type ? all.filter((p) => p.type === type) : all), [all, type]);
  const full = (data?.data?.length ?? 0) >= SITE_MAP_LIMIT;
  const now = Date.now();

  // The opening view is all of India; zoom once to the first sites found.
  const [opening, setOpening] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    if (opening === null && all.length > 0 && !full) {
      setOpening(all.map((p) => [p.location.lat, p.location.lng] as [number, number]));
    }
  }, [all, full, opening]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        {isFetching && <Loader2 className="size-3 animate-spin" />}
        {pins.length} {pins.length === 1 ? 'site' : 'sites'} in view
      </div>
      {full && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          More than {SITE_MAP_LIMIT} sites are in this area — zoom in to see them all.
        </p>
      )}
      {error ? <p className="text-sm text-destructive">Couldn&apos;t load sites for this area.</p> : null}
      <MapCanvas height={height}>
        <BBoxWatcher onChange={setBbox} />
        {opening && <FitBounds points={opening} signature="opening" maxZoom={14} />}
        {pins.map((p) => {
          const stale = !p.lastVisitAt || now - new Date(p.lastVisitAt).getTime() > STALE_MS;
          return (
            <Marker key={p._id} position={[p.location.lat, p.location.lng]} icon={siteIcon({ stale })} title={p.name}>
              <Popup>
                <div className="space-y-0.5 text-xs">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div>{p.type}</div>
                  <div>Radius {p.radiusM} m</div>
                  <div>Last visit: {p.lastVisitAt ? formatDate(p.lastVisitAt) : 'never'}</div>
                  {/* Leaflet popups are white in both themes: a fixed dark blue, not the theme's primary. */}
                  <Link to={`/field/sites/${p._id}`} className="font-medium text-blue-700 hover:underline">
                    Open site
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapCanvas>
      <p className="text-xs text-muted-foreground">Grey pins have not been visited in the last 30 days.</p>
    </div>
  );
}
