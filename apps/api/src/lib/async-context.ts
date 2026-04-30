import { AsyncLocalStorage } from 'node:async_hooks';
import type { Types } from 'mongoose';

export interface RequestContext {
  userId?: Types.ObjectId | string;
  userRole?: string;
  userPermissions?: string[];
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, patch);
}

export function getUserId(): string | undefined {
  const ctx = getContext();
  return ctx?.userId ? String(ctx.userId) : undefined;
}
