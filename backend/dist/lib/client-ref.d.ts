/**
 * Idempotent creates keyed by the client's reference.
 *
 * The mobile app gives every write it may have to retry (offline queue,
 * timeouts) a `clientRef` (UUID v4). Replaying it must not create a second
 * record: the record already stored under that reference is returned
 * instead. The collection carries a unique index on `clientRef` (alone or
 * with its owner), so two concurrent first attempts cannot both insert —
 * the loser finds the winner's record.
 */
import type { HydratedDocument, Model } from 'mongoose';
import { AppError } from './errors.js';
/** 409 `CLIENT_REF_CONFLICT`: the reference is already used by somebody else's record. */
export declare function clientRefConflict(): AppError;
/**
 * The record stored under `clientRef` (within `scope`, e.g. `{ employeeId }`
 * or `{ createdBy }`), or a new one from `create()`.
 *
 *   • no `clientRef` → `create()` (nothing to deduplicate on);
 *   • found (soft-deleted ones included) → `{ doc, created: false }`;
 *   • otherwise `create()`; when a concurrent request inserted the same
 *     reference first, its record is returned. A reference held by a record
 *     outside `scope` → 409 `CLIENT_REF_CONFLICT`.
 *
 * `create` must store `clientRef` on the record it creates.
 */
export declare function withClientRef<T>(model: Model<T>, clientRef: string | null | undefined, create: () => Promise<HydratedDocument<T>>, scope?: Record<string, unknown>): Promise<{
    doc: HydratedDocument<T>;
    created: boolean;
}>;
//# sourceMappingURL=client-ref.d.ts.map