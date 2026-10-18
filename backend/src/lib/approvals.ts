/**
 * The approval chain: who may see and decide whose requests.
 *
 * Route middleware only asks "may this user approve things at all?" — the
 * plain `<module>.approve` every manager holds. These helpers answer the
 * per-request question that follows:
 *
 *   • a manager (plain `approve`) sees and decides their *direct reports'*
 *     requests — employees whose `reportingManager` is the manager's own
 *     employee record — and nobody else's;
 *   • HR sees and decides everybody's: `<module>.approve_all`, or the module's
 *     HR permission (`leaves.update`, `attendance.manage`). The admin wildcard
 *     `*` passes both;
 *   • everyone else only ever sees their own records.
 *
 * Deciding one's own request is a separate rule (`assertNotSelfApproval`);
 * callers run it first so a manager approving their own leave is told
 * `SELF_APPROVAL`, not `NOT_YOUR_REPORT`.
 *
 * Routes stay on the plain `approve` (`requirePermission` needs *all* the
 * permissions it is given, so it cannot express "approve or approve_all");
 * the scoping is done in the controllers through the helpers below.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { Employee } from '../models/employee.model.js';
import {
  currentEmployeeId,
  hasPermission,
  idOf,
  isOwnRecord,
} from './access.js';
import { AppError, ForbiddenError } from './errors.js';

export type ApprovalModule = 'leaves' | 'expenses' | 'overtime' | 'attendance';

/**
 * Holding any one of these lifts the direct-reports restriction for a module.
 * Expenses and overtime have no HR permission of their own, so only their
 * `approve_all` counts; attendance has no `approve_all`, HR's
 * `attendance.manage` is what sees everyone.
 */
const SEE_ALL_PERMISSIONS: Record<ApprovalModule, readonly string[]> = {
  leaves: ['leaves.approve_all', 'leaves.update'],
  expenses: ['expenses.approve_all'],
  overtime: ['overtime.approve_all'],
  attendance: ['attendance.manage'],
};

const DIRECT_REPORTS = Symbol('directReportIds');
type WithCachedReports = Request & { [DIRECT_REPORTS]?: Promise<Types.ObjectId[]> };

/**
 * Employee `_id`s whose `reportingManager` is the caller's employee record;
 * empty when the caller has none. Looked up once per request — the promise is
 * cached on `req`, so concurrent callers share the one query.
 */
export function directReportIds(req: Request): Promise<Types.ObjectId[]> {
  const r = req as WithCachedReports;
  if (!r[DIRECT_REPORTS]) {
    r[DIRECT_REPORTS] = currentEmployeeId(req).then(async (me) => {
      if (!me) return [];
      const reports = await Employee.find({ reportingManager: me }).select('_id').lean().exec();
      return reports.map((employee) => employee._id as Types.ObjectId);
    });
  }
  return r[DIRECT_REPORTS];
}

/** True when the caller sees and decides every employee's requests in `module`. */
export function canSeeAll(req: Request, module: ApprovalModule): boolean {
  return SEE_ALL_PERMISSIONS[module].some((perm) => hasPermission(req.user, perm));
}

/** True when the caller approves in `module` at all — for their reports, or for everybody. */
export function isApprover(req: Request, module: ApprovalModule): boolean {
  return canSeeAll(req, module) || hasPermission(req.user, `${module}.approve`);
}

/**
 * True when the caller may decide `employeeId`'s requests: they see all, or
 * they hold `<module>.approve` and the employee reports to them. Never true
 * for the caller's own record unless they see all.
 */
export async function canDecide(
  req: Request,
  employeeId: unknown,
  module: ApprovalModule,
): Promise<boolean> {
  if (canSeeAll(req, module)) return true;
  if (!hasPermission(req.user, `${module}.approve`)) return false;
  const target = idOf(employeeId);
  if (!target) return false;
  const reports = await directReportIds(req);
  return reports.some((id) => id.toHexString() === target);
}

/** 403 `NOT_YOUR_REPORT` unless the caller may decide `employeeId`'s requests. */
export async function assertCanDecide(
  req: Request,
  employeeId: unknown,
  module: ApprovalModule,
): Promise<void> {
  if (await canDecide(req, employeeId, module)) return;
  throw new AppError(
    "You can only act on your direct reports' requests",
    403,
    'NOT_YOUR_REPORT',
  );
}

/**
 * Reading or handling a record: its owner may, and so may anyone who can
 * decide it. Otherwise the same 403 as `assertOwnOrPermission`.
 */
export async function assertOwnOrCanDecide(
  req: Request,
  ownerEmployeeId: unknown,
  module: ApprovalModule,
): Promise<void> {
  if (await isOwnRecord(req, ownerEmployeeId)) return;
  if (await canDecide(req, ownerEmployeeId, module)) return;
  throw new ForbiddenError('You can only access your own records');
}

/**
 * The query filter on `field` (the owning employee) for a list: `{}` for a
 * see-all holder; the caller's direct reports plus themselves for a plain
 * approver; only the caller's own employee for everyone else. A caller with no
 * employee record gets `{ [field]: null }`, which matches nothing because the
 * field is required.
 */
export async function scopeFilter(
  req: Request,
  module: ApprovalModule,
  field = 'employeeId',
): Promise<Record<string, unknown>> {
  if (canSeeAll(req, module)) return {};
  const self = await currentEmployeeId(req);
  if (!hasPermission(req.user, `${module}.approve`)) return { [field]: self };
  const reports = await directReportIds(req);
  return { [field]: { $in: self ? [...reports, self] : reports } };
}

/**
 * `scopeFilter` for a list the client may narrow to one employee
 * (`?employeeId=`). A see-all holder may ask for anyone; a plain approver only
 * for their reports or themselves (anyone else matches nothing); everyone else
 * keeps getting their own records, whatever they ask for.
 */
export async function scopeFilterFor(
  req: Request,
  module: ApprovalModule,
  requestedEmployeeId: string | undefined,
  field = 'employeeId',
): Promise<Record<string, unknown>> {
  if (!requestedEmployeeId) return scopeFilter(req, module, field);
  const requested = new Types.ObjectId(requestedEmployeeId);
  if (canSeeAll(req, module)) return { [field]: requested };
  if (!hasPermission(req.user, `${module}.approve`)) return scopeFilter(req, module, field);
  const [self, reports] = await Promise.all([currentEmployeeId(req), directReportIds(req)]);
  const inScope = (self?.equals(requested) ?? false) || reports.some((id) => id.equals(requested));
  return { [field]: inScope ? requested : { $in: [] } };
}
