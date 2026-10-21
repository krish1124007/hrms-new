import { describe, expect, it } from 'vitest';
import { clampBBox } from './map-config';
import { haversineM, pointIndexAt, trailDistanceM } from './trail';

describe('trail helpers', () => {
  it('measures great-circle distance', () => {
    // One degree of latitude ≈ 111.2 km.
    expect(haversineM({ lat: 19, lng: 72.8 }, { lat: 20, lng: 72.8 })).toBeCloseTo(111_195, -2);
    expect(trailDistanceM([{ lat: 19, lng: 72.8 }])).toBe(0);
    expect(
      trailDistanceM([
        { lat: 19, lng: 72.8 },
        { lat: 19.5, lng: 72.8 },
        { lat: 20, lng: 72.8 },
      ]),
    ).toBeCloseTo(111_195, -2);
  });

  it('finds the playhead point for a time', () => {
    const times = [100, 200, 300, 400];
    expect(pointIndexAt(times, 50)).toBe(0);
    expect(pointIndexAt(times, 100)).toBe(0);
    expect(pointIndexAt(times, 250)).toBe(1);
    expect(pointIndexAt(times, 400)).toBe(3);
    expect(pointIndexAt(times, 9999)).toBe(3);
    expect(pointIndexAt([], 10)).toBe(0);
  });
});

describe('clampBBox', () => {
  it('keeps a Leaflet bounds string inside what the API accepts', () => {
    expect(clampBBox(-200.123456, -95, 210, 91)).toBe('-180,-90,180,90');
    expect(clampBBox(72.812345678, 18.9, 73.1, 19.2)).toBe('72.81235,18.9,73.1,19.2');
  });
});
