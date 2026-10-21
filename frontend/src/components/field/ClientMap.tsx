import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Loader2 } from 'lucide-react';
import { useClientsMap } from '@/hooks/use-field';
import { clampBBox } from '@/lib/map-config';
import { formatDate } from '@/lib/format';
import type { ClientCategory, ClientPin } from '@/lib/field.api';
import { cn } from '@/lib/utils';
import { FitBounds, MapCanvas } from './MapCanvas';
import { clientIcon } from './map-icons';

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

const CATEGORIES: ClientCategory[] = ['A', 'B', 'C'];
const CATEGORY_DOT: Record<ClientCategory, string> = { A: 'bg-green-600', B: 'bg-amber-500', C: 'bg-slate-500' };

function addressLine(p: ClientPin): string {
  const a = p.address;
  return [a?.line1, a?.city, a?.state].filter(Boolean).join(', ');
}

/**
 * Clients with a saved location, loaded for the visible map area only
 * (`GET /field/clients/map?bbox=`, ≤ 500 per view — zoom in for more).
 */
export function ClientMap({ height = 560 }: { height?: number | string }): ReactElement {
  const [bbox, setBbox] = useState<string | null>(null);
  const [shown, setShown] = useState<Record<ClientCategory, boolean>>({ A: true, B: true, C: true });
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isFetching, error } = useClientsMap(bbox);

  const pins = useMemo(
    () =>
      (data?.data ?? []).filter(
        (p) => shown[p.category] !== false && (includeInactive || p.status !== 'inactive'),
      ),
    [data, shown, includeInactive],
  );

  // The opening view is all of India; zoom once to the first clients found.
  const [opening, setOpening] = useState<Array<[number, number]> | null>(null);
  useEffect(() => {
    if (opening === null && data && data.data.length > 0 && !data.truncated) {
      setOpening(data.data.map((p) => [p.lat, p.lng] as [number, number]));
    }
  }, [data, opening]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          {CATEGORIES.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={shown[c]}
                onChange={(e) => setShown((s) => ({ ...s, [c]: e.target.checked }))}
              />
              <span className={cn('inline-block size-3 rounded-full', CATEGORY_DOT[c])} />
              Category {c}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Inactive clients
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isFetching && <Loader2 className="size-3 animate-spin" />}
          {pins.length} {pins.length === 1 ? 'client' : 'clients'} in view
        </div>
      </div>
      {data?.truncated && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          More than 500 clients are in this area — zoom in to see them all.
        </p>
      )}
      {error ? <p className="text-sm text-destructive">Couldn&apos;t load clients for this area.</p> : null}
      <MapCanvas height={height}>
        <BBoxWatcher onChange={setBbox} />
        {opening && <FitBounds points={opening} signature="opening" maxZoom={14} />}
        {pins.map((p) => (
          <Marker key={p._id} position={[p.lat, p.lng]} icon={clientIcon(p.category, p.status === 'inactive')} title={p.name}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <div className="text-sm font-semibold">{p.name}</div>
                <div>
                  Category {p.category}
                  {p.status === 'inactive' ? ' · inactive' : ''}
                </div>
                {addressLine(p) && <div>{addressLine(p)}</div>}
                {p.assignedTo && (
                  <div>
                    Rep: {p.assignedTo.firstName} {p.assignedTo.lastName}
                  </div>
                )}
                <div>Last visit: {p.lastVisitDate ? formatDate(p.lastVisitDate) : 'never'}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapCanvas>
    </div>
  );
}
