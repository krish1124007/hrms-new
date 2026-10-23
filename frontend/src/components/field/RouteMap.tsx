import { useMemo, type ReactElement } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import type { DayRoute, RoutePoint } from '@/lib/field-reports.api';
import { formatKm, pointKindLabel } from '@/lib/field-route';
import { formatTime } from '@/lib/format';
import { FitBounds, MapCanvas } from './MapCanvas';
import { pointIcon } from './team-map-icons';

// Module constants: a new options object each render makes react-leaflet restyle the layer.
const ROAD_STYLE = { color: '#2563eb', weight: 5, opacity: 0.8 } as const;
const ESTIMATED_STYLE = { color: '#f59e0b', weight: 4, opacity: 0.9, dashArray: '8 6' } as const;

const pointName = (p: RoutePoint | undefined, n: number): string =>
  p ? `${n}. ${pointKindLabel(p.kind)}${p.siteName ? ` · ${p.siteName}` : ''}` : `${n}. —`;

export function EstimatedBadge(): ReactElement {
  return (
    <Badge variant="warning" title="Road distance was unavailable, so this is the straight-line distance × 1.3">
      Estimated
    </Badge>
  );
}

/**
 * A day's route: a numbered marker per check-in/out point and a line per
 * measured leg (solid for road distance, dashed amber for an estimate).
 * Lines join the points directly; the km beside them is what was measured.
 */
export function RouteMap({ route, height = 520 }: { route: DayRoute; height?: number | string }): ReactElement {
  const { points, legs, totalKm, estimated } = route;
  const coords = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);
  const icons = useMemo(() => points.map((p, i) => pointIcon(i + 1, p.kind)), [points]);
  const lines = useMemo(
    () =>
      legs
        .map((l, i) => {
          const a = points[l.fromIndex];
          const b = points[l.toIndex];
          return a && b
            ? { key: `${i}:${l.fromIndex}-${l.toIndex}`, positions: [[a.lat, a.lng], [b.lat, b.lng]] as Array<[number, number]>, estimated: l.estimated }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [legs, points],
  );
  const visits = points.filter((p) => p.kind === 'visit_in').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Stat label="Points" value={String(points.length)} />
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Distance</div>
          <div className="flex items-center gap-2 font-semibold">
            <span data-testid="route-total-km">{formatKm(totalKm)}</span>
            {estimated && <EstimatedBadge />}
          </div>
        </div>
        <Stat
          label="First – last point"
          value={
            points.length
              ? `${formatTime(points[0].at)} – ${formatTime(points[points.length - 1].at)}`
              : '—'
          }
        />
        <Stat label="Visits" value={String(visits)} />
      </div>

      <MapCanvas height={height}>
        <FitBounds points={coords} signature={`${route.date}:${coords.length}:${coords[0]?.join(',') ?? ''}`} />
        {lines.map((l) => (
          <Polyline key={l.key} positions={l.positions} pathOptions={l.estimated ? ESTIMATED_STYLE : ROAD_STYLE} />
        ))}
        {points.map((p, i) => (
          <Marker key={`${i}:${p.at}`} position={[p.lat, p.lng]} icon={icons[i]} title={pointName(p, i + 1)}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <div className="text-sm font-semibold">{pointName(p, i + 1)}</div>
                <div>{formatTime(p.at)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapCanvas>

      {legs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="route-legs">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">From</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2 text-right">Distance</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l, i) => {
                const from = points[l.fromIndex];
                const to = points[l.toIndex];
                return (
                  <tr key={`${i}:${l.fromIndex}-${l.toIndex}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      {pointName(from, l.fromIndex + 1)}
                      {from && <span className="ml-2 text-xs text-muted-foreground">{formatTime(from.at)}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {pointName(to, l.toIndex + 1)}
                      {to && <span className="ml-2 text-xs text-muted-foreground">{formatTime(to.at)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {formatKm(l.distanceM / 1000)}
                      {l.estimated && <span className="ml-2 text-xs text-warning">estimated</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
