import { Types } from 'mongoose';
import { assertOwnOrPermission, currentEmployeeId, hasPermission, idOf } from './access.js';
import { directReportIds } from './approvals.js';
import { AppError, ForbiddenError, ValidationAppError } from './errors.js';
import { Employee } from '../models/employee.model.js';
export const FIELD_VIEW = 'field-sales.view';
export const FIELD_MANAGE = 'field-sales.manage';
/** True when the caller holds `field-sales.manage` (or `*`). */
export function canManageField(req) {
    return hasPermission(req.user, FIELD_MANAGE);
}
/** 404 `NO_EMPLOYEE_PROFILE` — a self-service field action needs an employee record. */
export function noEmployeeProfile() {
    return new AppError('No employee profile is linked to your account', 404, 'NO_EMPLOYEE_PROFILE');
}
/** The caller's Employee `_id`, or 404 `NO_EMPLOYEE_PROFILE`. */
export async function requireOwnEmployeeId(req) {
    const id = await currentEmployeeId(req);
    if (!id)
        throw noEmployeeProfile();
    return id;
}
/**
 * Employee ids whose field records the caller may read: `null` for a field
 * manager (everyone), otherwise themselves plus their direct reports. A
 * non-manager without an employee record gets 404 `NO_EMPLOYEE_PROFILE`.
 */
export async function visibleEmployeeIds(req) {
    if (canManageField(req))
        return null;
    const self = await requireOwnEmployeeId(req);
    return [self, ...(await directReportIds(req))];
}
/**
 * List filter on `field` (the owning employee). A field manager may narrow to
 * any `requested` employee; anyone else to one of the employees they can see —
 * a request outside that scope is ignored (they keep getting their own scope).
 */
export async function fieldScope(req, requested, field = 'employeeId') {
    const ids = await visibleEmployeeIds(req);
    const wanted = requested && Types.ObjectId.isValid(requested) ? new Types.ObjectId(requested) : null;
    if (ids === null)
        return wanted ? { [field]: wanted } : {};
    if (wanted && ids.some((id) => id.equals(wanted)))
        return { [field]: wanted };
    return { [field]: { $in: ids } };
}
/** 403 unless the caller may read a record owned by `owner` (manager, owner, or owner's manager). */
export async function assertFieldRead(req, owner) {
    if (canManageField(req))
        return;
    const target = idOf(owner);
    const ids = await visibleEmployeeIds(req);
    if (target && ids?.some((id) => id.toHexString() === target))
        return;
    throw new ForbiddenError('You can only access your own records');
}
/** 403 unless the caller may change a record owned by `owner` (field manager or the owner). */
export async function assertFieldWrite(req, owner) {
    await assertOwnOrPermission(req, owner, FIELD_MANAGE);
}
/**
 * The employee a new record belongs to: a field manager may name anyone in
 * `bodyEmployeeId`; everyone else always gets their own record.
 */
export async function ownerForCreate(req, bodyEmployeeId) {
    if (canManageField(req) && bodyEmployeeId) {
        await assertEmployeeExists(bodyEmployeeId);
        return new Types.ObjectId(bodyEmployeeId);
    }
    return requireOwnEmployeeId(req);
}
/** 400 unless `id` names an existing (not deleted) employee. */
export async function assertEmployeeExists(id) {
    const exists = Types.ObjectId.isValid(id) && (await Employee.exists({ _id: id }).exec());
    if (!exists)
        throw new ValidationAppError('employeeId does not name an employee');
}
//# sourceMappingURL=field-access.js.map