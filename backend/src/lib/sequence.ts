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
import { Counter } from '../models/counter.model.js';
import { startOfBusinessDay } from './business-day.js';

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/**
 * The next value of counter `key` (1, 2, 3, …), atomically.
 *
 * On first use the counter is created at `seed()` — the highest number already
 * issued under this key — so switching an existing collection over to
 * counters continues where it left off. Concurrent first users race to create
 * the counter; exactly one insert wins and everyone then increments it.
 */
export async function nextSequence(key: string, seed?: () => Promise<number>): Promise<number> {
  for (;;) {
    const bumped = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true })
      .lean()
      .exec();
    if (bumped) return bumped.seq;
    const start = seed ? await seed() : 0;
    try {
      await Counter.create({ _id: key, seq: start });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Someone else created it first — fine, increment theirs.
    }
  }
}

/** Escape a literal for use inside a RegExp. */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Highest `<prefix>-<year>-<n>` number stored in `field` of `model`,
 * soft-deleted rows included (an aggregate bypasses the soft-delete query
 * hooks). 0 when there is none.
 */
async function highestIssued(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  field: string,
  stem: string,
): Promise<number> {
  const [row] = await model.aggregate<{ max: number }>([
    { $match: { [field]: { $regex: `^${escapeRegex(stem)}\\d+$` } } },
    {
      $group: {
        _id: null,
        max: { $max: { $toLong: { $substrCP: [`$${field}`, stem.length, 20] } } },
      },
    },
  ]);
  return Number(row?.max ?? 0);
}

/**
 * `<prefix>-<YYYY>-<00001>` for the current business (IST) year, from a
 * yearly counter keyed `<prefix>-<YYYY>`. `model`/`field` locate the numbers
 * already issued, which seed a counter the first time it is used.
 */
export async function nextYearlyNumber(opts: {
  prefix: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  field: string;
  at?: Date;
}): Promise<string> {
  const year = startOfBusinessDay(opts.at ?? new Date()).getUTCFullYear();
  const stem = `${opts.prefix}-${year}-`;
  const seq = await nextSequence(`${opts.prefix}-${year}`, () => highestIssued(opts.model, opts.field, stem));
  return `${stem}${String(seq).padStart(5, '0')}`;
}

/**
 * Create a numbered document, taking a fresh number if the one handed out is
 * somehow already stored (rows imported or restored behind the counter's
 * back): the counter has moved on, so the next attempt gets a higher one.
 * Never surfaces a duplicate-number 409 for a handful of stale numbers.
 */
export async function createWithNumber<T>(
  nextNumber: () => Promise<string>,
  create: (number: string) => Promise<T>,
  numberField: string,
  attempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const number = await nextNumber();
    try {
      return await create(number);
    } catch (err) {
      const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
      const numberClash = isDuplicateKey(err) && numberField in keyPattern;
      if (!numberClash || attempt >= attempts) throw err;
    }
  }
}
