import { type AuditAction } from '../models/audit-log.model.js';
export interface AuditInput {
    action: AuditAction;
    entity: string;
    entityId?: string;
    before?: any;
    after?: any;
    metadata?: Record<string, any>;
}
export declare function audit(input: AuditInput): Promise<void>;
export interface AuditExplicitInput {
    action: AuditAction;
    entity: string;
    entityId?: string;
    userId?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
}
export declare function auditExplicit(input: AuditExplicitInput): Promise<void>;
//# sourceMappingURL=audit.service.d.ts.map