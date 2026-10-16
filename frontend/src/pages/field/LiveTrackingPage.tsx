import { useMemo, type ReactElement } from 'react';
import { Radar, Battery, Activity, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLiveTracking } from '@/hooks/use-field';
import { LiveMap, type LiveMapPoint } from '@/components/field/LiveMap';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function LiveTrackingPage(): ReactElement {
  const { data, isLoading, isFetching } = useLiveTracking();
  const live = data?.data ?? [];

  const mapPoints = useMemo<LiveMapPoint[]>(
    () =>
      live.map((p) => ({
        id: p.employeeId,
        lat: p.lat,
        lng: p.lng,
        label: p.employee
          ? `${p.employee.firstName} ${p.employee.lastName}`
          : 'Unknown',
        sublabel: p.employee?.employeeCode,
        detail: [
          p.activity ?? null,
          p.speed != null ? `${Math.round(p.speed)} km/h` : null,
          p.battery != null ? `${Math.round(p.battery)}% battery` : null,
          `Updated ${timeAgo(p.timestamp)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [live],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Tracking"
        description="Real-time field employee locations (auto-refreshes every 15s)"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Live Tracking' },
        ]}
        actions={
          <Badge variant={isFetching ? 'warning' : 'success'}>
            <Radar className="mr-1 size-3" />
            {isFetching ? 'Refreshing…' : 'Live'}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" />
            Active Field Staff ({live.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <LiveMap points={mapPoints} height={480} />
          )}
          {!isLoading && live.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No employees currently tracking. Locations are reported from the mobile app.
            </p>
          )}
        </CardContent>
      </Card>

      {live.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {live.map((p) => (
                <div
                  key={p.employeeId}
                  className="rounded-lg border border-border/60 bg-card p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="font-medium">
                        {p.employee
                          ? `${p.employee.firstName} ${p.employee.lastName}`
                          : 'Unknown'}
                      </div>
                      {p.employee?.employeeCode && (
                        <div className="text-xs text-muted-foreground">
                          {p.employee.employeeCode}
                        </div>
                      )}
                    </div>
                    <Badge variant="success">Live</Badge>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-3 text-muted-foreground" />
                      <span className="font-mono">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="size-3" />
                      {p.activity ?? '—'}
                      {p.speed !== undefined && p.speed !== null
                        ? ` · ${Math.round(p.speed)} km/h`
                        : ''}
                    </div>
                    {p.battery !== undefined && p.battery !== null && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Battery className="size-3" />
                        {Math.round(p.battery)}%
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      Updated {timeAgo(p.timestamp)}
                    </div>
                  </div>

                  <a
                    href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}&zoom=16`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open in OpenStreetMap →
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
