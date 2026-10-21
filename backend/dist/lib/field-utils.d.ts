/**
 * Small shared pieces of the field-sales controllers: IST day/month windows,
 * query-string parsing (ids, date bounds, sort keys), money rounding and
 * great-circle distance.
 */
import { z } from 'zod';
/** `[start, end)` instants of the business (IST) day containing `d`. */
export declare function businessDayWindow(d?: Date): {
    start: Date;
    end: Date;
};
/** `[start, end)` instants of the IST calendar day `ymd` (`YYYY-MM-DD`). */
export declare function businessDateWindow(ymd: string): {
    start: Date;
    end: Date;
};
/** `[start, end)` instants of IST calendar month `month` (1–12) of `year`. */
export declare function businessMonthWindow(year: number, month: number): {
    start: Date;
    end: Date;
};
/** The IST `{ year, month }` of `d`. */
export declare function businessYearMonth(d?: Date): {
    year: number;
    month: number;
};
/**
 * A `?date=` value: a `YYYY-MM-DD` string names an IST calendar day; anything
 * else parseable names the IST day it falls on; missing/invalid → today.
 */
export declare function windowForDateParam(value: unknown): {
    start: Date;
    end: Date;
};
export declare const objectIdString: z.ZodEffects<z.ZodString, string, string>;
/**
 * A `?from=` / `?to=` bound. `YYYY-MM-DD` is an IST calendar day (`from` = its
 * first instant, `to` = the first instant of the next day, used with `$lt`);
 * a full timestamp is taken as given (`to` made exclusive by +1 ms).
 */
export declare function dateBound(edge: 'from' | 'to'): z.ZodEffects<z.ZodString, Date, string>;
/** `{ $gte: from, $lt: to }` for whichever bounds are present, or undefined. */
export declare function rangeFilter(from?: Date, to?: Date): Record<string, Date> | undefined;
/** `?sort=` restricted to `fields`, ascending or (`-field`) descending. */
export declare function sortParam(fields: readonly string[]): z.ZodEffects<z.ZodString, string, string>;
/** `?limit=` — the global guard already clamps to 100; this keeps the schema honest. */
export declare const pageParams: {
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
};
/** Escape user text for a literal `$regex` match (no ReDoS, no operators) — the shared helper. */
export { escapeRegex } from './regex.js';
/**
 * An update body as a Mongo update: `null` clears a field (`$unset`),
 * `undefined` leaves it alone, anything else is `$set`. Update schemas accept
 * `null` only for the optional fields that may be cleared.
 */
export declare function setAndUnset(body: Record<string, unknown>): {
    $set?: Record<string, unknown>;
    $unset?: Record<string, ''>;
};
/** Round to paise. */
export declare function roundMoney(n: number): number;
/** Great-circle distance in metres between two `{ lat, lng }` points. */
export declare function distanceMeters(a: {
    lat: number;
    lng: number;
}, b: {
    lat: number;
    lng: number;
}): number;
/** `[lng, lat]` GeoJSON coordinates as `{ lat, lng }`; null when absent or the 0,0 placeholder. */
export declare function pointOf(coordinates: unknown): {
    lat: number;
    lng: number;
} | null;
//# sourceMappingURL=field-utils.d.ts.map