import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default marker — Vite doesn't bundle the PNGs from leaflet/dist/images
// the way webpack used to. Point to a CDN-hosted version instead.
const ICON_RETINA = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png';
const ICON = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png';
const ICON_SHADOW = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: ICON_RETINA,
  iconUrl: ICON,
  shadowUrl: ICON_SHADOW,
});

export interface LiveMapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  detail?: string;
}

interface LiveMapProps {
  points: LiveMapPoint[];
  height?: number | string;
}

/**
 * Live map view using OpenStreetMap tiles via Leaflet.
 * Free, no API key required, no usage caps for reasonable traffic.
 */
export function LiveMap({ points, height = 480 }: LiveMapProps): ReactElement {
  // Centre on India by default if no points; otherwise the bounds-fitter takes over.
  const initialCentre: [number, number] = useMemo(() => {
    if (points.length === 0) return [22.9734, 78.6569]; // India
    return [points[0].lat, points[0].lng];
  }, [points]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      style={{ height }}
    >
      <MapContainer
        center={initialCentre}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{p.label}</div>
                {p.sublabel && <div className="text-xs text-gray-500">{p.sublabel}</div>}
                {p.detail && <div className="text-xs">{p.detail}</div>}
                <div className="font-mono text-[10px] text-gray-500">
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/** Auto-fit the map to the supplied markers whenever they change. */
function FitBounds({ points }: { points: LiveMapPoint[] }): null {
  const map = useMap();
  // Track previous count so we only re-fit when the set actually changes.
  const lastSig = useRef('');
  useEffect(() => {
    const sig = points.map((p) => `${p.id}:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [points, map]);
  return null;
}
