import { currentEmployeeId, hasPermission, idOf } from './access.js';
import { directReportIds } from './approvals.js';
import { AppError } from './errors.js';
export const FIELD_VIEW = 'field.view';
export const FIELD_MANAGE = 'field.manage';
/** True when the caller holds `field.manage` (or `*`). */
export function canManageField(req) {
    return hasPermission(req.user, FIELD_MANAGE);
}
/** 404 `NO_EMPLOYEE_PROFILE` — a self-service field action needs an employee record. */
export function noEmployeeProfile() {
    return new AppError('No employee profile is linked to your account', 404, 'NO_EMPLOYEE_PROFILE');
}
/** The caller's scope (see the header). */
export async function fieldScope(req) {
    const self = await currentEmployeeId(req);
    if (canManageField(req))
        return { employeeIds: 'all', self, manage: true };
    if (!self)
        throw noEmployeeProfile();
    return { employeeIds: [self, ...(await directReportIds(req))], self, manage: false };
}
/** True when `employeeId` (an id, string or populated doc) is inside the scope. */
export function scopeIncludes(scope, employeeId) {
    if (scope.employeeIds === 'all')
        return true;
    const id = idOf(employeeId);
    return id !== null && scope.employeeIds.some((e) => e.toHexString() === id);
}
/** Mongo filter restricting `field` (default `employeeId`) to the scope; `{}` for everybody. */
export function scopeFilter(scope, field = 'employeeId') {
    return scope.employeeIds === 'all' ? {} : { [field]: { $in: scope.employeeIds } };
}
//# sourceMappingURL=field-scope.js.map