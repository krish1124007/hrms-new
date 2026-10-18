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
export type ApprovalModule = 'leaves' | 'expenses' | 'overtime' | 'attendance';
/**
 * Employee `_id`s whose `reportingManager` is the caller's employee record;
 * empty when the caller has none. Looked up once per request — the promise is
 * cached on `req`, so concurrent callers share the one query.
 */
export declare function directReportIds(req: Request): Promise<Types.ObjectId[]>;
/** True when the caller sees and decides every employee's requests in `module`. */
export declare function canSeeAll(req: Request, module: ApprovalModule): boolean;
/** True when the caller approves in `module` at all — for their reports, or for everybody. */
export declare function isApprover(req: Request, module: ApprovalModule): boolean;
/**
 * True when the caller may decide `employeeId`'s requests: they see all, or
 * they hold `<module>.approve` and the employee reports to them. Never true
 * for the caller's own record unless they see all.
 */
export declare function canDecide(req: Request, employeeId: unknown, module: ApprovalModule): Promise<boolean>;
/** 403 `NOT_YOUR_REPORT` unless the caller may decide `employeeId`'s requests. */
export declare function assertCanDecide(req: Request, employeeId: unknown, module: ApprovalModule): Promise<void>;
/**
 * Reading or handling a record: its owner may, and so may anyone who can
 * decide it. Otherwise the same 403 as `assertOwnOrPermission`.
 */
export declare function assertOwnOrCanDecide(req: Request, ownerEmployeeId: unknown, module: ApprovalModule): Promise<void>;
/**
 * The query filter on `field` (the owning employee) for a list: `{}` for a
 * see-all holder; the caller's direct reports plus themselves for a plain
 * approver; only the caller's own employee for everyone else. A caller with no
 * employee record gets `{ [field]: null }`, which matches nothing because the
 * field is required.
 */
export declare function scopeFilter(req: Request, module: ApprovalModule, field?: string): Promise<Record<string, unknown>>;
/**
 * `scopeFilter` for a list the client may narrow to one employee
 * (`?employeeId=`). A see-all holder may ask for anyone; a plain approver only
 * for their reports or themselves (anyone else matches nothing); everyone else
 * keeps getting their own records, whatever they ask for.
 */
export declare function scopeFilterFor(req: Request, module: ApprovalModule, requestedEmployeeId: string | undefined, field?: string): Promise<Record<string, unknown>>;
//# sourceMappingURL=approvals.d.ts.map