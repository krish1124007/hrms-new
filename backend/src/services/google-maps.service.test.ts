/**
 * The Google Maps service with `fetch` mocked: Routes API legs (request
 * shape, caching, fallback on failure / timeout / no key) and reverse
 * geocoding.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { distanceMeters } from '../lib/field-utils.js';
import {
  GOOGLE_TIMEOUT_MS,
  ROUTES_URL,
  clearGoogleMapsCache,
  estimatedLegMeters,
  googleMaps,
} from './google-maps.service.js';

const A = { lat: 19.076, lng: 72.8777 };
const B = { lat: 19.1197, lng: 72.8468 };
const C = { lat: 19.2183, lng: 72.9781 };
const KEY = 'test-maps-key-123';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  clearGoogleMapsCache();
  env.GOOGLE_MAPS_API_KEY = KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  env.GOOGLE_MAPS_API_KEY = undefined;
  clearGoogleMapsCache();
});

describe('routeDistanceMeters', () => {
  it('calls computeRoutes once per leg with the key and field mask, and sums nothing itself', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ routes: [{ distanceMeters: 7200 }] }))
      .mockResolvedValueOnce(json({ routes: [{ distanceMeters: 18350 }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await googleMaps.routeDistanceMeters([A, B, C]);
    expect(result).toEqual({ legsM: [7200, 18350], legsEstimated: [false, false], estimated: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ROUTES_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'routes.distanceMeters' });
    expect(JSON.parse(String(init.body))).toEqual({
      origin: { location: { latLng: { latitude: A.lat, longitude: A.lng } } },
      destination: { location: { latLng: { latitude: B.lat, longitude: B.lng } } },
      travelMode: 'DRIVE',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('caches legs by rounded coordinates: the same day recomputed makes no new call', async () => {
    const fetchMock = vi.fn(async () => json({ routes: [{ distanceMeters: 5000 }] }));
    vi.stubGlobal('fetch', fetchMock);
    await googleMaps.routeDistanceMeters([A, B]);
    const again = await googleMaps.routeDistanceMeters([{ lat: A.lat + 0.00001, lng: A.lng }, B]);
    expect(again.legsM).toEqual([5000]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to straight line × 1.3 for a leg answered with HTTP 500, marked estimated', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ routes: [{ distanceMeters: 7200 }] }))
      .mockResolvedValueOnce(json({ error: { message: 'boom' } }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(logger, 'warn');

    const result = await googleMaps.routeDistanceMeters([A, B, C]);
    expect(result.legsM[0]).toBe(7200);
    expect(result.legsM[1]).toBe(Math.round(distanceMeters(B, C) * 1.3));
    expect(result.legsEstimated).toEqual([false, true]);
    expect(result.estimated).toBe(true);
    // The key never reaches the logs.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it('falls back when the call times out after 3 s, a route is missing, or the network fails', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', hanging);
    const pending = googleMaps.routeDistanceMeters([A, B]);
    await vi.advanceTimersByTimeAsync(GOOGLE_TIMEOUT_MS + 10);
    expect(await pending).toEqual({ legsM: [estimatedLegMeters(A, B)], legsEstimated: [true], estimated: true });
    vi.useRealTimers();

    vi.stubGlobal('fetch', vi.fn(async () => json({ routes: [] })));
    expect((await googleMaps.routeDistanceMeters([A, C])).estimated).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect((await googleMaps.routeDistanceMeters([B, C])).estimated).toBe(true);
  });

  it('makes no call without a key: every leg is the estimate', async () => {
    env.GOOGLE_MAPS_API_KEY = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await googleMaps.routeDistanceMeters([A, B, C]);
    expect(result).toEqual({
      legsM: [estimatedLegMeters(A, B), estimatedLegMeters(B, C)],
      legsEstimated: [true, true],
      estimated: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(googleMaps.isConfigured()).toBe(false);
  });

  it('a leg between the same point is 0 m without a call; fewer than two points have no legs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await googleMaps.routeDistanceMeters([A, { ...A }])).toEqual({ legsM: [0], legsEstimated: [false], estimated: false });
    expect(await googleMaps.routeDistanceMeters([A])).toEqual({ legsM: [], legsEstimated: [], estimated: false });
    expect(await googleMaps.routeDistanceMeters([])).toEqual({ legsM: [], legsEstimated: [], estimated: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a zero-length route (no distanceMeters in the reply) is 0 m', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ routes: [{}] })));
    expect(await googleMaps.routeDistanceMeters([A, B])).toEqual({ legsM: [0], legsEstimated: [false], estimated: false });
  });
});

describe('reverseGeocode', () => {
  it('maps the first result onto { line1, city, state, pincode }', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        status: 'OK',
        results: [
          {
            formatted_address: 'MG Road, Pune, Maharashtra 411001, India',
            address_components: [
              { long_name: 'Pune', types: ['locality'] },
              { long_name: 'Maharashtra', types: ['administrative_area_level_1'] },
              { long_name: '411001', types: ['postal_code'] },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await googleMaps.reverseGeocode(18.52, 73.85)).toEqual({
      line1: 'MG Road, Pune, Maharashtra 411001, India',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=18.52%2C73.85&key=${KEY}`,
    );
    // Cached.
    await googleMaps.reverseGeocode(18.52, 73.85);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('null without a key, for ZERO_RESULTS, an HTTP error, or a network failure', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'ZERO_RESULTS', results: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await googleMaps.reverseGeocode(1, 1)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)));
    expect(await googleMaps.reverseGeocode(2, 2)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    expect(await googleMaps.reverseGeocode(3, 3)).toBeNull();

    env.GOOGLE_MAPS_API_KEY = undefined;
    const untouched = vi.fn();
    vi.stubGlobal('fetch', untouched);
    expect(await googleMaps.reverseGeocode(4, 4)).toBeNull();
    expect(untouched).not.toHaveBeenCalled();
  });
});
