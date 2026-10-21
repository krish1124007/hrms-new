import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Marker, Popup } from 'react-leaflet';
import { formatTime } from '@/lib/format';
import type { VisitPin } from '@/lib/field.api';
import { FitBounds, MapCanvas } from './MapCanvas';
import { visitIcon } from './map-icons';

/** The day's visits as numbered pins (numbered per rep, in check-in order). */
export function VisitPinsMap({
  pins,
  date,
  height = 480,
}: {
  pins: VisitPin[];
  /** IST day of the pins, for the trail links. */
  date: string;
  height?: number | string;
}): ReactElement {
  const located = useMemo(() => {
    const seq = new Map<string, number>();
    return pins
      .filter((p): p is VisitPin & { lat: number; lng: number } => p.lat != null && p.lng != null)
      .map((p) => {
        const n = (seq.get(p.employeeId) ?? 0) + 1;
        seq.set(p.employeeId, n);
        return { ...p, n };
      });
  }, [pins]);
  const coords = useMemo(() => located.map((p) => [p.lat, p.lng] as [number, number]), [located]);

  return (
    <MapCanvas height={height}>
      <FitBounds points={coords} signature={`${date}:${located.map((p) => p.visitId).join('|')}`} />
      {located.map((p) => (
        <Marker key={p.visitId} position={[p.lat, p.lng]} icon={visitIcon(p.n, p.status)} title={p.clientName}>
          <Popup>
            <div className="space-y-0.5 text-xs">
              <div className="text-sm font-semibold">{p.clientName}</div>
              {p.employeeName && <div>{p.employeeName}</div>}
              <div className="capitalize">
                {p.purpose} · {p.status.replace('_', ' ')}
              </div>
              <div>
                In {p.checkInAt ? formatTime(p.checkInAt) : '—'} · Out {p.checkOutAt ? formatTime(p.checkOutAt) : '—'}
              </div>
              <Link
                to={`/field/trail?employeeId=${encodeURIComponent(p.employeeId)}&date=${date}`}
                className="font-medium text-primary dark:text-blue-400 hover:underline"
              >
                Show the rep&apos;s trail
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapCanvas>
  );
}
