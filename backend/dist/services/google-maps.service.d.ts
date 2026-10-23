export interface LatLng {
    lat: number;
    lng: number;
}
export interface Address {
    line1: string;
    city: string;
    state: string;
    pincode: string;
}
export interface RouteDistances {
    /** Metres for each consecutive pair of points (`points.length - 1` legs). */
    legsM: number[];
    /** Per leg: true when that leg used the straight-line fallback. */
    legsEstimated: boolean[];
    /** True when any leg used the fallback. */
    estimated: boolean;
}
export declare const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
export declare const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
export declare const GOOGLE_TIMEOUT_MS = 3000;
/** A leg Google could not measure is not asked again for this long. */
export declare const FAILURE_TTL_MS: number;
/** This many failed calls in a row open the circuit breaker… */
export declare const BREAKER_THRESHOLD = 5;
/** …for this long: no calls to that API, every answer is the fallback. */
export declare const BREAKER_OPEN_MS: number;
/** Straight-line distance × this approximates the road distance when Google is unavailable. */
export declare const FALLBACK_ROAD_FACTOR = 1.3;
/** Tests: forget every cached distance, address and failure. */
export declare function clearGoogleMapsCache(): void;
/** The fallback for one leg: great-circle × 1.3, whole metres. */
export declare function estimatedLegMeters(a: LatLng, b: LatLng): number;
/**
 * Road distance of each leg between consecutive `points`. With no key, or
 * when a leg's call fails, that leg is the straight-line estimate and
 * `estimated` is true. Identical points are a 0 m leg (no call).
 */
declare function routeDistanceMeters(points: LatLng[]): Promise<RouteDistances>;
/**
 * The postal address at a point, or null (no key, nothing found, or Google
 * unreachable). `line1` is Google's formatted address.
 */
declare function reverseGeocode(lat: number, lng: number): Promise<Address | null>;
export declare const googleMaps: {
    /** True when a key is configured (Google is called at all). */
    isConfigured: () => boolean;
    reverseGeocode: typeof reverseGeocode;
    routeDistanceMeters: typeof routeDistanceMeters;
};
export {};
//# sourceMappingURL=google-maps.service.d.ts.map