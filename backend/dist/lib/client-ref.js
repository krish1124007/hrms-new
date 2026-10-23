import { AppError } from './errors.js';
/** 409 `CLIENT_REF_CONFLICT`: the reference is already used by somebody else's record. */
export function clientRefConflict() {
    return new AppError('This clientRef is already used by another record', 409, 'CLIENT_REF_CONFLICT');
}
function isDuplicateClientRef(err) {
    if (typeof err !== 'object' || err === null)
        return false;
    const e = err;
    if (e.code !== 11000)
        return false;
    if (e.keyPattern)
        return 'clientRef' in e.keyPattern;
    return typeof e.message === 'string' && e.message.includes('clientRef');
}
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
export async function withClientRef(model, clientRef, create, scope = {}) {
    if (!clientRef)
        return { doc: await create(), created: true };
    const find = () => model
        .findOne({ ...scope, clientRef })
        .setOptions({ withDeleted: true })
        .exec();
    const existing = await find();
    if (existing)
        return { doc: existing, created: false };
    try {
        return { doc: await create(), created: true };
    }
    catch (err) {
        if (!isDuplicateClientRef(err))
            throw err;
        const winner = await find();
        if (winner)
            return { doc: winner, created: false };
        throw clientRefConflict();
    }
}
//# sourceMappingURL=client-ref.js.map