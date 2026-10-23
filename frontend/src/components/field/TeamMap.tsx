import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Popup } from 'react-leaflet';
import { MapPin, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TeamMemberStatus, TeamStatusRow } from '@/lib/field-reports.api';
import { routeLink } from '@/lib/field-links';
import { formatKm, pointKindLabel } from '@/lib/field-route';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FitBounds, MapCanvas } from './MapCanvas';
import { statusIcon } from './team-map-icons';

const fullName = (r: TeamStatusRow): string => `${r.employee.firstName} ${r.employee.lastName}`.trim();

const STATUS_VARIANT: Record<TeamMemberStatus, 'success' | 'warning' | 'secondary' | 'outline'> = {
  at_site: 'success',
  between_sites: 'warning',
  day_ended: 'secondary',
  not_started: 'outline',
};

/** "At Acme Plant" / "Between sites" / "Day ended" / "Not started". */
function statusLabel(row: Pick<TeamStatusRow, 'status' | 'currentVisit' | 'lastPoint'>): string {
  switch (row.status) {
    case 'at_site': {
      const site = row.currentVisit?.site.name ?? row.lastPoint?.siteName;
      return site ? `At ${site}` : 'At a site';
    }
    case 'between_sites':
      return 'Between sites';
    case 'day_ended':
      return 'Day ended';
    case 'not_started':
      return 'Not started';
    default:
      return String(row.status).replace(/_/g, ' ');
  }
}

export function TeamStatusChip({ row }: { row: TeamStatusRow }): ReactElement {
  return (
    <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'} data-testid="status-chip">
      {statusLabel(row)}
    </Badge>
  );
}

type Located = TeamStatusRow & { lastPoint: NonNullable<TeamStatusRow['lastPoint']> };

/**
 * The team on a day: one marker per person at their last check-in/out point
 * (there is no continuous tracking), coloured by status, beside a list of
 * everyone in scope — including people with no point yet.
 */
export function TeamMap({
  rows,
  date,
  height = 520,
}: {
  rows: TeamStatusRow[];
  /** The IST day shown — the route links open on it. */
  date: string;
  height?: number | string;
}): ReactElement {
  const [selected, setSelected] = useState<string | null>(null);

  const located = useMemo(
    () => rows.filter((r): r is Located => r.lastPoint != null && Number.isFinite(r.lastPoint.lat)),
    [rows],
  );
  const coords = useMemo(() => located.map((r) => [r.lastPoint.lat, r.lastPoint.lng] as [number, number]), [located]);
  // Re-fit when people appear or leave, not when someone's last point moves.
  const signature = useMemo(() => located.map((r) => r.employee._id).sort().join('|'), [located]);
  const focus = useMemo(() => {
    const r = located.find((x) => x.employee._id === selected);
    return r ? ([[r.lastPoint.lat, r.lastPoint.lng]] as Array<[number, number]>) : null;
  }, [located, selected]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 lg:col-span-2">
        <MapCanvas height={height}>
          <FitBounds points={coords} signature={signature} />
          {focus && <FitBounds points={focus} signature={`focus:${selected}`} maxZoom={15} />}
          {located.map((r) => (
            <Marker
              key={r.employee._id}
              position={[r.lastPoint.lat, r.lastPoint.lng]}
              title={fullName(r)}
              icon={statusIcon(fullName(r), r.status, r.employee._id === selected)}
              eventHandlers={{ click: () => setSelected(r.employee._id) }}
            >
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold">{fullName(r)}</div>
                  <div>{statusLabel(r)}</div>
                  <div>
                    {pointKindLabel(r.lastPoint.kind)} at {formatTime(r.lastPoint.at)}
                    {r.lastPoint.siteName ? ` · ${r.lastPoint.siteName}` : ''}
                  </div>
                  <div>
                    {r.visitsToday} {r.visitsToday === 1 ? 'visit' : 'visits'} · {formatKm(r.kmToday)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapCanvas>
        <p className="text-xs text-muted-foreground">
          Markers show each person&apos;s last check-in or check-out. Locations are recorded only at those points.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Team <span className="font-normal text-muted-foreground">({rows.length})</span>
        </div>
        <ul data-testid="team-list" className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {rows.map((r) => (
            <li
              key={r.employee._id}
              className={cn(
                'cursor-pointer px-4 py-3 text-sm hover:bg-muted/40',
                r.employee._id === selected && 'bg-muted/60',
              )}
              onClick={() => setSelected(r.employee._id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{fullName(r)}</span>
                <TeamStatusChip row={r} />
              </div>
              {r.employee.employeeId && <div className="text-xs text-muted-foreground">{r.employee.employeeId}</div>}
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                {r.lastPoint ? (
                  <span className="truncate">
                    {pointKindLabel(r.lastPoint.kind)} {formatTime(r.lastPoint.at)}
                    {r.lastPoint.siteName ? ` · ${r.lastPoint.siteName}` : ''}
                  </span>
                ) : (
                  <span>No check-in yet</span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {r.visitsToday} {r.visitsToday === 1 ? 'visit' : 'visits'} · {formatKm(r.kmToday)}
                </span>
                <Link
                  to={routeLink(r.employee._id, date)}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Route className="size-3" />
                  Route
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
