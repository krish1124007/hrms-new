import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Popup } from 'react-leaflet';
import { MapPin, Radio, RefreshCw, Route, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLiveLocations } from '@/hooks/use-live-locations';
import { formatRelative, formatTime, todayIST } from '@/lib/format';
import type { LiveLocation } from '@/lib/field.api';
import { cn } from '@/lib/utils';
import { FitBounds, MapCanvas } from './MapCanvas';
import { repIcon } from './map-icons';

/** A rep whose newest point is older than this is drawn grey ("last seen …"). */
const STALE_MS = 15 * 60_000;

const isStale = (r: LiveLocation, now: number): boolean => now - new Date(r.recordedAt).getTime() > STALE_MS;

/** How often "last seen …" and the grey (stale) markers are re-evaluated. */
export const LIVE_CLOCK_MS = 30_000;

/** The current time, re-read every `ms` — so ages and staleness move on without new data. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function StatusBadge({ status, reason }: { status: string; reason?: string }): ReactElement {
  if (status === 'live') {
    return (
      <Badge variant="success" title="Updates arrive as reps report them">
        <Radio className="mr-1 size-3" />
        Live
      </Badge>
    );
  }
  if (status === 'polling') {
    return (
      <Badge variant="warning" title={reason ? `Live connection unavailable (${reason})` : undefined}>
        <RefreshCw className="mr-1 size-3" />
        Polling every 30 s
      </Badge>
    );
  }
  return <Badge variant="secondary">Connecting…</Badge>;
}

/**
 * Where every visible rep is now: one marker per rep from
 * `GET /field/tracking/live`, moved by the `/field-tracking` socket, polled
 * every 30 s while the socket is down.
 */
export function LiveMap({ height = 520 }: { height?: number | string }): ReactElement {
  const { reps, status, reason, isLoading, error, dataUpdatedAt } = useLiveLocations();
  const [selected, setSelected] = useState<string | null>(null);
  const tick = useNow(LIVE_CLOCK_MS);
  const now = Math.max(tick, dataUpdatedAt);

  const coords = useMemo(() => reps.map((r) => [r.lat, r.lng] as [number, number]), [reps]);
  // Re-fit when reps join or leave, not when one of them moves.
  const signature = useMemo(() => reps.map((r) => r.employeeId).sort().join('|'), [reps]);
  const focus = useMemo(() => {
    const r = reps.find((x) => x.employeeId === selected);
    return r ? ([[r.lat, r.lng]] as Array<[number, number]>) : null;
  }, [reps, selected]);

  const today = todayIST();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" />
            {reps.length} {reps.length === 1 ? 'rep' : 'reps'} reporting in the last 2 h
          </div>
          <StatusBadge status={status} reason={reason} />
        </div>
        <MapCanvas height={height}>
          <FitBounds points={coords} signature={signature} />
          {focus && <FitBounds points={focus} signature={`focus:${selected}`} maxZoom={15} />}
          {reps.map((r) => (
            <Marker
              key={r.employeeId}
              position={[r.lat, r.lng]}
              title={r.name}
              icon={repIcon(r.name, {
                onVisit: !!r.onVisit,
                stale: isStale(r, now),
                selected: r.employeeId === selected,
              })}
              eventHandlers={{ click: () => setSelected(r.employeeId) }}
            >
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold">{r.name}</div>
                  {r.employeeCode && <div className="text-gray-500">{r.employeeCode}</div>}
                  <div>
                    Updated {formatTime(r.recordedAt)} ({formatRelative(r.recordedAt, { now: new Date(now) })})
                  </div>
                  {r.accuracy != null && <div>Accuracy ±{Math.round(r.accuracy)} m</div>}
                  {r.battery != null && <div>Battery {Math.round(r.battery)}%</div>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapCanvas>
        {error ? (
          <p className="text-sm text-destructive">Couldn&apos;t load locations. Retrying every 30 s.</p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card" data-testid="rep-list">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Reps</div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : reps.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No rep has reported a location in the last 2 hours. Locations come from the mobile app while
            reps are clocked in and live tracking is switched on.
          </p>
        ) : (
          <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
            {reps.map((r) => {
              const stale = isStale(r, now);
              return (
                <li
                  key={r.employeeId}
                  className={cn(
                    'cursor-pointer px-4 py-3 text-sm hover:bg-muted/40',
                    r.employeeId === selected && 'bg-muted/60',
                  )}
                  onClick={() => setSelected(r.employeeId)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className={cn('text-xs', stale ? 'text-muted-foreground' : 'text-success')}>
                      {formatRelative(r.recordedAt, { now: new Date(now) })}
                    </span>
                  </div>
                  {r.employeeCode && <div className="text-xs text-muted-foreground">{r.employeeCode}</div>}
                  {r.onVisit && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <MapPin className="size-3" />
                      At {r.onVisit.clientName}
                    </div>
                  )}
                  <Link
                    to={`/field/trail?employeeId=${encodeURIComponent(r.employeeId)}&date=${today}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Route className="size-3" />
                    Today&apos;s trail
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
