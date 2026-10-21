import { useMemo, type ReactElement } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { FitBounds, MapCanvas } from './MapCanvas';
import { defaultIcon } from './map-icons';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  detail?: string;
}

/** A plain map of labelled pins, fitted to them (the attendance live view). */
export function PointsMap({ points, height = 480 }: { points: MapPoint[]; height?: number | string }): ReactElement {
  const coords = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);
  const signature = useMemo(() => points.map((p) => p.id).join('|'), [points]);
  return (
    <MapCanvas height={height}>
      <FitBounds points={coords} signature={signature} />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={defaultIcon} title={p.label}>
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
    </MapCanvas>
  );
}
