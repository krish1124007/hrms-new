import type { Types } from 'mongoose';
export interface RequestContext {
    userId?: Types.ObjectId | string;
    userRole?: string;
    userPermissions?: string[];
    requestId?: string;
    ip?: string;
    userAgent?: string;
}
export declare function runWithContext<T>(ctx: RequestContext, fn: () => T): T;
export declare function getContext(): RequestContext | undefined;
export declare function setContext(patch: Partial<RequestContext>): void;
export declare function getUserId(): string | undefined;
//# sourceMappingURL=async-context.d.ts.map