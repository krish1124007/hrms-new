/**
 * Durable document numbering.
 *
 * Numbers used to be "highest existing + 1", read from the non-deleted rows.
 * A soft-deleted row kept its number in the unique index while dropping out of
 * that read, so the next number collided with it (every create 409'd until
 * someone repaired the database), and two concurrent creates read the same
 * maximum. A counter document incremented with one atomic `$inc` fixes both:
 * the database hands every caller a distinct value, and it never goes back.
 */
import type { Model } from 'mongoose';
/**
 * The next value of counter `key` (1, 2, 3, …), atomically.
 *
 * On first use the counter is created at `seed()` — the highest number already
 * issued under this key — so switching an existing collection over to
 * counters continues where it left off. Concurrent first users race to create
 * the counter; exactly one insert wins and everyone then increments it.
 */
export declare function nextSequence(key: string, seed?: () => Promise<number>): Promise<number>;
/**
 * `<prefix>-<YYYY>-<00001>` for the current business (IST) year, from a
 * yearly counter keyed `<prefix>-<YYYY>`. `model`/`field` locate the numbers
 * already issued, which seed a counter the first time it is used.
 */
export declare function nextYearlyNumber(opts: {
    prefix: string;
    model: Model<any>;
    field: string;
    at?: Date;
}): Promise<string>;
/**
 * Create a numbered document, taking a fresh number if the one handed out is
 * somehow already stored (rows imported or restored behind the counter's
 * back): the counter has moved on, so the next attempt gets a higher one.
 * Never surfaces a duplicate-number 409 for a handful of stale numbers.
 */
export declare function createWithNumber<T>(nextNumber: () => Promise<string>, create: (number: string) => Promise<T>, numberField: string, attempts?: number): Promise<T>;
//# sourceMappingURL=sequence.d.ts.map