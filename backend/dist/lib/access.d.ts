/**
 * Record-level access helpers shared by the self-service controllers.
 *
 * Route middleware (`requirePermission`) answers "may this user call this
 * endpoint at all?". These answer the per-record question that follows:
 * "is this *their* record, or do they hold the permission that lets them act
 * on anybody's?". Ownership is always by Employee — every owner field these
 * modules store (`employeeId`, `employee`, `assignedTo`) references Employee.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
/** Same rule as `requirePermission`: role permissions + customPermissions, `*` passes. */
export declare function hasPermission(user: Express.Request['user'], perm: string): boolean;
/**
 * The caller's Employee `_id`, or `null` when the user has no employee record
 * (or the request is unauthenticated). Looked up once per request — the
 * promise is cached on `req`, so concurrent callers share the one query.
 */
export declare function currentEmployeeId(req: Request): Promise<Types.ObjectId | null>;
/**
 * Allow the record's owner, or anyone holding `perm` (any one of them, when
 * given a list); otherwise 403. A caller with no employee record is never
 * the owner.
 */
export declare function assertOwnOrPermission(req: Request, ownerEmployeeId: unknown, perm: string | readonly string[]): Promise<void>;
/**
 * Approvers decide other people's requests, never their own: 403
 * `SELF_APPROVAL` when `ownerEmployeeId` is the caller's employee record.
 */
export declare function assertNotSelfApproval(req: Request, ownerEmployeeId: unknown, message: string): Promise<void>;
//# sourceMappingURL=access.d.ts.map