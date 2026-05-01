import { api } from './axios';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'export'
  | 'import';

export interface AuditLogUser {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
}

export interface AuditLog {
  _id: string;
  userId?: AuditLogUser | string | null;
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogsResponse {
  success: true;
  data: AuditLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: AuditAction;
  entity?: string;
  entityId?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<AuditLogsResponse> {
  const { data } = await api.get<AuditLogsResponse>('/audit-logs', { params });
  return data;
}

export async function listAuditEntities(): Promise<string[]> {
  const { data } = await api.get<{ success: true; data: string[] }>('/audit-logs/entities');
  return data.data;
}

export async function getAuditLog(id: string): Promise<AuditLog> {
  const { data } = await api.get<{ success: true; data: AuditLog }>(`/audit-logs/${id}`);
  return data.data;
}
