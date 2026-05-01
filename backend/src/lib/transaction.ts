import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../config/logger.js';

/**
 * Helper for running multi-document writes atomically.
 *
 * Guarantees all-or-nothing semantics across collections:
 *   await withTransaction(async (session) => {
 *     await User.create([{ ... }], { session });
 *     await Employee.create([{ ... }], { session });
 *     await Invite.create([{ ... }], { session });
 *   });
 *
 * If any step throws, every write is rolled back.
 *
 * Fallback: MongoDB transactions require a replica set. If the connected
 * server is a standalone instance (common in local dev with a bare
 * `mongod`), `session.startTransaction()` throws. We detect that and
 * fall back to running the work without a session — giving up atomicity
 * but not blocking the dev loop. Production always uses a replica set.
 */
/**
 * Heuristic: does the connected server support transactions? Cached after
 * the first probe — if the first transaction fails with a standalone error
 * we remember and skip future attempts for this process lifetime.
 */
let _transactionsSupported: boolean | null = null;

function isStandaloneError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return (
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set') ||
    msg.includes('not supported') ||
    msg.includes('requires replica set') ||
    msg.includes('MongoServerSelectionError')
  );
}

export async function withTransaction<T>(
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  // Dev/test standalone: skip session entirely.
  if (_transactionsSupported === false) {
    return fn(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      _transactionsSupported = true;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return result!;
    } catch (err) {
      if (isStandaloneError(err)) {
        logger.warn(
          { err: (err as Error).message },
          'Transactions unsupported (standalone mongod) — running without atomicity (once)',
        );
        _transactionsSupported = false;
        // Re-run with no session so the operations can complete.
        return fn(undefined);
      }
      throw err;
    }
  } finally {
    try {
      await session.endSession();
    } catch {
      /* noop */
    }
  }
}
