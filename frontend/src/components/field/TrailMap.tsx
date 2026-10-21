import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { formatTime } from '@/lib/format';
import type { Trail, VisitPin } from '@/lib/field.api';
import { pointIndexAt, trailDistanceM } from '@/lib/trail';
import { FitBounds, MapCanvas } from './MapCanvas';
import { playheadIcon, visitIcon } from './map-icons';

/** Playback speeds: how many seconds of the day pass per real second. */
const SPEEDS = [
  { value: 60, label: '1 min / s' },
  { value: 300, label: '5 min / s' },
  { value: 900, label: '15 min / s' },
  { value: 3600, label: '1 h / s' },
];
const TICK_MS = 100;

const fmtKm = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// Module constants: a new options object each render makes react-leaflet
// restyle the layer on every playback tick.
const ROUTE_STYLE = { color: '#1e293b', weight: 4, opacity: 0.55, dashArray: '8 6' } as const;
const TRAVELLED_STYLE = { color: '#2563eb', weight: 6, opacity: 0.9 } as const;

/**
 * A rep's day replayed: the full route in grey, the part travelled so far in
 * blue, a moving dot at the playhead, and a numbered pin per visit.
 */
export function TrailMap({ trail, height = 520 }: { trail: Trail; height?: number | string }): ReactElement {
  const { points, visits } = trail;
  const times = useMemo(() => points.map((p) => new Date(p.recordedAt).getTime()), [points]);
  const start = times[0] ?? 0;
  const end = times[times.length - 1] ?? 0;

  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // A new trail (rep or day) starts at its first point, paused.
  useEffect(() => {
    setT(start);
    setPlaying(false);
  }, [trail.employeeId, trail.date, start]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = tRef.current + TICK_MS * speed;
      if (next >= end) {
        setT(end);
        setPlaying(false);
      } else {
        setT(next);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, speed, end]);

  const idx = points.length ? pointIndexAt(times, t) : 0;
  const route = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);
  // A new array only when the playhead reaches another point — not on every
  // 100 ms tick — so the travelled line is redrawn only when it grows.
  const travelled = useMemo(() => route.slice(0, idx + 1), [route, idx]);
  const located = useMemo(
    () => visits.filter((v): v is VisitPin & { lat: number; lng: number } => v.lat != null && v.lng != null),
    [visits],
  );
  const visitIcons = useMemo(() => located.map((v, i) => visitIcon(i + 1, v.status)), [located]);
  const fit = useMemo(
    () => [...route, ...located.map((v) => [v.lat, v.lng] as [number, number])],
    [route, located],
  );
  const distance = useMemo(() => trailDistanceM(points), [points]);
  const current = points[idx];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Stat label="Points" value={String(points.length)} />
        <Stat label="Distance (approx.)" value={fmtKm(distance)} />
        <Stat
          label="First – last fix"
          value={points.length ? `${formatTime(points[0].recordedAt)} – ${formatTime(points[points.length - 1].recordedAt)}` : '—'}
        />
        <Stat label="Visits" value={String(visits.length)} />
      </div>

      {trail.truncated && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          This day has more points than one map can show; the first 5,000 are drawn.
        </p>
      )}

      <MapCanvas height={height} preferCanvas>
        <FitBounds points={fit} signature={`${trail.employeeId}:${trail.date}:${fit.length}`} />
        {route.length > 1 && <Polyline positions={route} pathOptions={ROUTE_STYLE} />}
        {travelled.length > 1 && <Polyline positions={travelled} pathOptions={TRAVELLED_STYLE} />}
        {current && (
          <Marker position={[current.lat, current.lng]} icon={playheadIcon} title="Playhead" zIndexOffset={1000}>
            <Popup>
              <div className="text-xs">
                {formatTime(current.recordedAt)}
                {current.accuracy != null ? ` · ±${Math.round(current.accuracy)} m` : ''}
              </div>
            </Popup>
          </Marker>
        )}
        {located.map((v, i) => (
          <Marker key={v.visitId} position={[v.lat, v.lng]} icon={visitIcons[i]} title={v.clientName}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <div className="text-sm font-semibold">
                  {i + 1}. {v.clientName}
                </div>
                <div className="capitalize">
                  {v.purpose} · {v.status.replace('_', ' ')}
                </div>
                <div>
                  In {v.checkInAt ? formatTime(v.checkInAt) : '—'} · Out {v.checkOutAt ? formatTime(v.checkOutAt) : '—'}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapCanvas>

      {points.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Button
            size="sm"
            onClick={() => {
              if (t >= end) setT(start);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Restart"
            onClick={() => {
              setPlaying(false);
              setT(start);
            }}
          >
            <RotateCcw className="size-4" />
          </Button>
          <input
            type="range"
            aria-label="Playback position"
            min={0}
            max={Math.max(0, points.length - 1)}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setT(times[Number(e.target.value)] ?? start);
            }}
            className="min-w-[160px] flex-1 accent-primary"
          />
          <span className="w-20 whitespace-nowrap text-right font-mono text-sm tabular-nums">
            {current ? formatTime(current.recordedAt) : '—'}
          </span>
          <Select
            aria-label="Playback speed"
            value={String(speed)}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-9 w-32 text-xs"
          >
            {SPEEDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {visits.length > 0 && (
        <ol className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {visits.map((v, i) => (
            <li key={v.visitId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="font-medium">{v.clientName}</span>
                <span className="ml-2 text-xs capitalize text-muted-foreground">
                  {v.purpose} · {v.status.replace('_', ' ')}
                </span>
                {v.lat == null && <span className="ml-2 text-xs text-muted-foreground">(no location)</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {v.checkInAt ? formatTime(v.checkInAt) : '—'} – {v.checkOutAt ? formatTime(v.checkOutAt) : 'open'}
              </span>
            </li>
          ))}
        </ol>
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
