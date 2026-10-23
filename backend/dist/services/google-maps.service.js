/**
 * Google Maps over HTTPS (no SDK): road distances (Routes API
 * `computeRoutes`, one call per leg) and reverse geocoding (Geocoding API).
 *
 * Key: env `GOOGLE_MAPS_API_KEY` (a server key with the Routes and Geocoding
 * APIs enabled). Unset → no Google call is ever made: addresses stay as
 * entered and distances use the fallback. Every call has a 3 s timeout that
 * covers the whole exchange, body included; any failure falls back. The key
 * is never logged or returned (the geocoding URL carries it, so URLs are
 * never logged either).
 *
 * Fallback distance: the great-circle distance × 1.3, marked `estimated`.
 * Road distances are cached in-process (LRU) by coordinates rounded to
 * 4 decimals (≈ 11 m), so recomputing a day's route costs no new calls. A
 * leg Google failed (HTTP error, timeout, no route) is not asked again for
 * 10 minutes. After 5 failed calls in a row (HTTP error, timeout, network)
 * an API is left alone for 5 minutes (circuit breaker), then tried again.
 */
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { distanceMeters } from '../lib/field-utils.js';
export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
export const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
export const GOOGLE_TIMEOUT_MS = 3000;
/** A leg Google could not measure is not asked again for this long. */
export const FAILURE_TTL_MS = 10 * 60 * 1000;
/** This many failed calls in a row open the circuit breaker… */
export const BREAKER_THRESHOLD = 5;
/** …for this long: no calls to that API, every answer is the fallback. */
export const BREAKER_OPEN_MS = 5 * 60 * 1000;
/** Straight-line distance × this approximates the road distance when Google is unavailable. */
export const FALLBACK_ROAD_FACTOR = 1.3;
const CACHE_MAX = 2000;
/** Legs computed at the same time. */
const CONCURRENCY = 4;
/* ── LRU ── */
class Lru {
    max;
    map = new Map();
    constructor(max) {
        this.max = max;
    }
    get(key) {
        const value = this.map.get(key);
        if (value === undefined)
            return undefined;
        this.map.delete(key);
        this.map.set(key, value);
        return value;
    }
    set(key, value) {
        this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.max)
            this.map.delete(this.map.keys().next().value);
    }
    clear() {
        this.map.clear();
    }
}
const legCache = new Lru(CACHE_MAX);
/** Legs that failed → when they may be asked again (epoch ms). */
const legFailures = new Lru(CACHE_MAX);
const geocodeCache = new Lru(CACHE_MAX);
const round = (p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
/** Consecutive failed calls to one API; open (no calls) for a while after too many. */
class CircuitBreaker {
    failures = 0;
    openUntil = 0;
    /** True while calls are held back. */
    isOpen() {
        return Date.now() < this.openUntil;
    }
    success() {
        this.failures = 0;
        this.openUntil = 0;
    }
    failure() {
        this.failures += 1;
        if (this.failures >= BREAKER_THRESHOLD)
            this.openUntil = Date.now() + BREAKER_OPEN_MS;
    }
}
const routesBreaker = new CircuitBreaker();
const geocodeBreaker = new CircuitBreaker();
/** Tests: forget every cached distance, address and failure. */
export function clearGoogleMapsCache() {
    legCache.clear();
    legFailures.clear();
    geocodeCache.clear();
    routesBreaker.success();
    geocodeBreaker.success();
}
function apiKey() {
    const key = env.GOOGLE_MAPS_API_KEY;
    return key && key.trim() !== '' ? key.trim() : undefined;
}
/**
 * `fetch` + the JSON body, all within the 3 s timeout (a body that stalls
 * after the headers is aborted too). `body` is null for a non-2xx answer.
 * Rejects on a timeout or a network failure.
 */
async function fetchJson(url, init = {}) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new DOMException('Google did not answer in time', 'TimeoutError'));
        }, GOOGLE_TIMEOUT_MS);
    });
    try {
        const res = await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout]);
        if (!res.ok) {
            await res.body?.cancel().catch(() => undefined);
            return { ok: false, status: res.status, body: null };
        }
        const body = await Promise.race([res.json(), timeout]);
        return { ok: true, status: res.status, body };
    }
    finally {
        clearTimeout(timer);
    }
}
/** The fallback for one leg: great-circle × 1.3, whole metres. */
export function estimatedLegMeters(a, b) {
    return Math.round(distanceMeters(a, b) * FALLBACK_ROAD_FACTOR);
}
/**
 * One leg's road distance from the Routes API, or null on any failure. A
 * failed leg is remembered for FAILURE_TTL_MS (no call meanwhile); while the
 * breaker is open no call is made at all.
 */
async function routeLeg(a, b, key) {
    const cacheKey = `${round(a)}>${round(b)}`;
    const hit = legCache.get(cacheKey);
    if (hit !== undefined)
        return hit;
    const failedUntil = legFailures.get(cacheKey);
    if (failedUntil !== undefined && failedUntil > Date.now())
        return null;
    if (routesBreaker.isOpen())
        return null;
    const failed = () => {
        legFailures.set(cacheKey, Date.now() + FAILURE_TTL_MS);
        return null;
    };
    const waypoint = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    try {
        const res = await fetchJson(ROUTES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': 'routes.distanceMeters',
            },
            body: JSON.stringify({ origin: waypoint(a), destination: waypoint(b), travelMode: 'DRIVE' }),
        });
        if (!res.ok) {
            routesBreaker.failure();
            logger.warn({ status: res.status }, 'Google Routes API request failed; using the estimate');
            return failed();
        }
        // Google answered: the API works, even when this leg has no route.
        routesBreaker.success();
        const route = res.body?.routes?.[0];
        if (!route)
            return failed();
        // A zero-length route has no distanceMeters (proto3 default).
        const metres = Math.round(Number(route.distanceMeters ?? 0));
        if (!Number.isFinite(metres) || metres < 0)
            return failed();
        legCache.set(cacheKey, metres);
        return metres;
    }
    catch (err) {
        routesBreaker.failure();
        logger.warn({ reason: err?.name ?? 'error' }, 'Google Routes API unreachable; using the estimate');
        return failed();
    }
}
/**
 * Road distance of each leg between consecutive `points`. With no key, or
 * when a leg's call fails, that leg is the straight-line estimate and
 * `estimated` is true. Identical points are a 0 m leg (no call).
 */
async function routeDistanceMeters(points) {
    const legs = points.slice(1).map((b, i) => ({ a: points[i], b }));
    const key = apiKey();
    const legsM = new Array(legs.length).fill(0);
    const legsEstimated = new Array(legs.length).fill(false);
    let next = 0;
    const worker = async () => {
        while (next < legs.length) {
            const i = next;
            next += 1;
            const { a, b } = legs[i];
            if (round(a) === round(b))
                continue;
            // eslint-disable-next-line no-await-in-loop
            const road = key ? await routeLeg(a, b, key) : null;
            if (road === null) {
                legsM[i] = estimatedLegMeters(a, b);
                legsEstimated[i] = true;
            }
            else {
                legsM[i] = road;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, legs.length) }, worker));
    return { legsM, legsEstimated, estimated: legsEstimated.some(Boolean) };
}
/**
 * The postal address at a point, or null (no key, nothing found, or Google
 * unreachable). `line1` is Google's formatted address.
 */
async function reverseGeocode(lat, lng) {
    const key = apiKey();
    if (!key)
        return null;
    const cacheKey = round({ lat, lng });
    const hit = geocodeCache.get(cacheKey);
    if (hit)
        return { ...hit };
    if (geocodeBreaker.isOpen())
        return null;
    const url = `${GEOCODE_URL}?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}`;
    try {
        const res = await fetchJson(url);
        if (!res.ok || !res.body) {
            geocodeBreaker.failure();
            logger.warn({ status: res.status }, 'Google Geocoding request failed');
            return null;
        }
        const body = res.body;
        const first = body.results?.[0];
        if (body.status !== 'OK' || !first) {
            // REQUEST_DENIED / OVER_QUERY_LIMIT: the key or the quota, not this point.
            if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT')
                geocodeBreaker.failure();
            else
                geocodeBreaker.success();
            if (body.status !== 'ZERO_RESULTS')
                logger.warn({ status: body.status }, 'Google Geocoding returned no address');
            return null;
        }
        geocodeBreaker.success();
        const components = first.address_components ?? [];
        const part = (...types) => {
            for (const type of types) {
                const hitPart = components.find((c) => c.types?.includes(type));
                if (hitPart?.long_name)
                    return hitPart.long_name;
            }
            return '';
        };
        const address = {
            line1: (first.formatted_address ?? '').slice(0, 300),
            city: part('locality', 'administrative_area_level_3', 'administrative_area_level_2', 'sublocality'),
            state: part('administrative_area_level_1'),
            pincode: part('postal_code'),
        };
        geocodeCache.set(cacheKey, address);
        return { ...address };
    }
    catch (err) {
        geocodeBreaker.failure();
        logger.warn({ reason: err?.name ?? 'error' }, 'Google Geocoding unreachable');
        return null;
    }
}
export const googleMaps = {
    /** True when a key is configured (Google is called at all). */
    isConfigured: () => apiKey() !== undefined,
    reverseGeocode,
    routeDistanceMeters,
};
//# sourceMappingURL=google-maps.service.js.map