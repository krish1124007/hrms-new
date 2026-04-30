import { api } from './axios';

/**
 * API clients for the Phase-1 wiring sweep — one file, seven namespaces.
 *
 * Each namespace maps to exactly one backend area. Keeping them together
 * during the sweep avoids a proliferation of tiny API files while we
 * replace fixtures with real data. Once the surface stabilises, these
 * can be split into their own files like billing.api.ts.
 */

interface ApiOk<T> {
  success: true;
  data: T;
}

/* ─────────── Platform announcements (super-admin) ─────────── */

export interface AnnouncementRow {
  _id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  targetAudience: 'all' | 'active' | 'trial' | 'specific';
  targetTenantIds?: string[];
  publishedAt?: string;
  expiresAt?: string;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  createdBy?: string;
}

export const announcementsApi = {
  list: async (): Promise<AnnouncementRow[]> => {
    const { data } = await api.get<ApiOk<AnnouncementRow[]>>('/super-admin/announcements');
    return data.data;
  },
  create: async (body: Partial<AnnouncementRow>): Promise<AnnouncementRow> => {
    const { data } = await api.post<ApiOk<AnnouncementRow>>('/super-admin/announcements', body);
    return data.data;
  },
  update: async (id: string, body: Partial<AnnouncementRow>): Promise<AnnouncementRow> => {
    const { data } = await api.patch<ApiOk<AnnouncementRow>>(
      `/super-admin/announcements/${id}`,
      body,
    );
    return data.data;
  },
  publish: async (id: string): Promise<void> => {
    await api.post(`/super-admin/announcements/${id}/publish`);
  },
  archive: async (id: string): Promise<void> => {
    await api.post(`/super-admin/announcements/${id}/archive`);
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/super-admin/announcements/${id}`);
  },
};

/* ─────────── Backups ─────────── */

export interface BackupRow {
  _id: string;
  type: 'database' | 'files' | 'full';
  status: 'in_progress' | 'completed' | 'failed';
  trigger: 'manual' | 'scheduled';
  size?: number;
  fileUrl?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
}

export interface BackupSchedule {
  enabled: boolean;
  pattern: string;
  description: string;
  nextRun?: number;
}

export const backupsApi = {
  list: async (): Promise<BackupRow[]> => {
    const { data } = await api.get<ApiOk<BackupRow[]>>('/backups');
    return data.data;
  },
  create: async (
    input: { type?: 'database' | 'files' | 'full' } = {},
  ): Promise<BackupRow> => {
    const { data } = await api.post<ApiOk<BackupRow>>('/backups', input);
    return data.data;
  },
  restore: async (id: string, scratchMongoUri: string): Promise<void> => {
    await api.post(`/backups/${id}/restore`, { scratchMongoUri });
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/backups/${id}`);
  },
  getSchedule: async (): Promise<BackupSchedule> => {
    const { data } = await api.get<ApiOk<BackupSchedule>>('/backups/schedule');
    return data.data;
  },
  setSchedule: async (enabled: boolean): Promise<BackupSchedule> => {
    const { data } = await api.put<ApiOk<BackupSchedule>>('/backups/schedule', {
      enabled,
    });
    return data.data;
  },
};

/* ─────────── Super-admin tickets (cross-tenant) ─────────── */

export interface SATicket {
  _id: string;
  ticketNumber: string;
  tenantId: string;
  tenant?: { _id: string; name: string; slug: string };
  createdBy?: { _id: string; firstName: string; lastName: string; email: string };
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  assignedTo?: { _id: string; firstName: string; lastName: string };
  slaBreached?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SATicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  breached: number;
  byPriority: Record<string, number>;
}

export const saTicketsApi = {
  list: async (params?: {
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
  }): Promise<SATicket[]> => {
    const { data } = await api.get<ApiOk<SATicket[]>>('/super-admin/tickets', { params });
    return data.data;
  },
  stats: async (): Promise<SATicketStats> => {
    const { data } = await api.get<ApiOk<SATicketStats>>('/super-admin/tickets/stats');
    return data.data;
  },
  assign: async (id: string, assignedTo: string): Promise<void> => {
    await api.patch(`/super-admin/tickets/${id}`, { assignedTo });
  },
  reply: async (id: string, message: string): Promise<void> => {
    await api.post(`/super-admin/tickets/${id}/reply`, { message });
  },
};

/* ─────────── Customer success (health scores) ─────────── */

export interface HealthScoreRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  score: number; // 0..100
  risk: 'healthy' | 'watch' | 'at-risk';
  factors: {
    loginActivity: number;
    featureAdoption: number;
    billingStatus: number;
    supportLoad: number;
  };
  mrr?: number;
  lastLogin?: string;
}

export interface HealthScoreSummary {
  total: number;
  atRisk: number;
  watch: number;
  healthy: number;
  avgScore: number;
}

export const customerHealthApi = {
  list: async (): Promise<{ scores: HealthScoreRow[]; summary: HealthScoreSummary }> => {
    const { data } = await api.get<ApiOk<{ scores: HealthScoreRow[]; summary: HealthScoreSummary }>>(
      '/super-admin/health-scores',
    );
    return data.data;
  },
};

/* ─────────── Roles (tenant-level CRUD) ─────────── */

export interface Role {
  _id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export const rolesApi = {
  list: async (): Promise<Role[]> => {
    const { data } = await api.get<ApiOk<Role[]>>('/roles');
    return data.data;
  },
  /** Module → permission strings, sourced from the API so it stays in sync as we add features. */
  permissions: async (): Promise<Record<string, string[]>> => {
    const { data } = await api.get<ApiOk<Record<string, string[]>>>('/permissions');
    return data.data;
  },
  create: async (input: {
    name: string;
    description?: string;
    permissions: string[];
  }): Promise<Role> => {
    const { data } = await api.post<ApiOk<Role>>('/roles', input);
    return data.data;
  },
  update: async (
    id: string,
    input: { name?: string; description?: string; permissions?: string[] },
  ): Promise<Role> => {
    const { data } = await api.patch<ApiOk<Role>>(`/roles/${id}`, input);
    return data.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/roles/${id}`);
  },
};

