import { AuditLog, type AuditAction } from '../models/audit-log.model.js';
import { getContext } from '../lib/async-context.js';
import { logger } from '../config/logger.js';

export interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const ctx = getContext();
    await AuditLog.create({
      userId: ctx?.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      changes: input.before || input.after ? { before: input.before, after: input.after } : undefined,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      metadata: input.metadata,
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to write audit log');
  }
}

export interface AuditExplicitInput {
  action: AuditAction;
  entity: string;
  entityId?: string;
  userId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export async function auditExplicit(input: AuditExplicitInput): Promise<void> {
  try {
    await AuditLog.create({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      changes:
        input.before || input.after
          ? { before: input.before, after: input.after }
          : undefined,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: input.metadata,
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to write explicit audit log');
  }
}
