import { Types } from 'mongoose';
import { Employee } from '../models/employee.model.js';
import { AppError, ForbiddenError } from './errors.js';
/** Same rule as `requirePermission`: role permissions + customPermissions, `*` passes. */
export function hasPermission(user, perm) {
    if (!user)
        return false;
    const role = user.role;
    const perms = [...(role?.permissions ?? []), ...(user.customPermissions ?? [])];
    return perms.includes('*') || perms.includes(perm);
}
const EMPLOYEE_ID = Symbol('currentEmployeeId');
/**
 * The caller's Employee `_id`, or `null` when the user has no employee record
 * (or the request is unauthenticated). Looked up once per request — the
 * promise is cached on `req`, so concurrent callers share the one query.
 */
export function currentEmployeeId(req) {
    const r = req;
    if (!r[EMPLOYEE_ID]) {
        const userId = req.user?._id;
        r[EMPLOYEE_ID] = userId
            ? Employee.findOne({ userId })
                .select('_id')
                .lean()
                .exec()
                .then((emp) => (emp ? emp._id : null))
            : Promise.resolve(null);
    }
    return r[EMPLOYEE_ID];
}
/** Hex id of an owner field: an ObjectId, a string id, or a populated document. */
function idOf(value) {
    if (value == null)
        return null;
    if (value instanceof Types.ObjectId)
        return value.toHexString();
    if (typeof value === 'object' && '_id' in value) {
        const inner = value._id;
        return inner === value ? String(value) : idOf(inner);
    }
    return String(value);
}
/** True when `ownerEmployeeId` is the caller's own employee record. */
async function isOwnRecord(req, ownerEmployeeId) {
    const owner = idOf(ownerEmployeeId);
    if (!owner)
        return false;
    const own = await currentEmployeeId(req);
    return own !== null && own.toHexString() === owner;
}
/**
 * Allow the record's owner, or anyone holding `perm` (any one of them, when
 * given a list); otherwise 403. A caller with no employee record is never
 * the owner.
 */
export async function assertOwnOrPermission(req, ownerEmployeeId, perm) {
    const perms = typeof perm === 'string' ? [perm] : perm;
    if (perms.some((p) => hasPermission(req.user, p)))
        return;
    if (await isOwnRecord(req, ownerEmployeeId))
        return;
    throw new ForbiddenError('You can only access your own records');
}
/**
 * Approvers decide other people's requests, never their own: 403
 * `SELF_APPROVAL` when `ownerEmployeeId` is the caller's employee record.
 */
export async function assertNotSelfApproval(req, ownerEmployeeId, message) {
    if (await isOwnRecord(req, ownerEmployeeId)) {
        throw new AppError(message, 403, 'SELF_APPROVAL');
    }
}
//# sourceMappingURL=access.js.map