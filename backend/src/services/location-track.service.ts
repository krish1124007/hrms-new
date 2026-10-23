/**
 * Stored location fixes (`LocationTrack`).
 *
 * Continuous tracking was removed (scope §8, decision 7): nothing records new
 * fixes any more — both upload URLs answer `{ ignored: true }`
 * (controllers/field-tracking.controller.ts) — and the field team map works
 * from check-in/check-out points (services/field-route.service.ts). Fixes
 * stored earlier stay readable by the attendance live-tracking page, which
 * only ever shows field staff's.
 */
import { Employee } from '../models/employee.model.js';
import { idOf } from '../lib/access.js';

/** Of `employeeIds`, the ones HR has flagged as field staff (hex ids). */
export async function fieldStaffAmong(employeeIds: readonly unknown[]): Promise<Set<string>> {
  const ids = employeeIds.map((id) => idOf(id)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Set();
  const employees = await Employee.find({ _id: { $in: ids }, isFieldStaff: true })
    .select('_id')
    .lean()
    .exec();
  return new Set(employees.map((emp) => String(emp._id)));
}
