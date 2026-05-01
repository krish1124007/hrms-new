import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDayType = 'first_half' | 'second_half';
export type LeaveGender = 'all' | 'male' | 'female';

/* ── Leave Type ── */
export interface LeaveType {
  _id: string;
  name: string;
  code: string;
  daysAllowed: number;
  carryForward: { enabled: boolean; maxDays: number };
  encashable: boolean;
  paidLeave: boolean;
  applicableGender: LeaveGender;
  probationAllowed: boolean;
  halfDayAllowed: boolean;
  attachmentRequired: boolean;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveTypeInput {
  name: string;
  code: string;
  daysAllowed: number;
  carryForward?: { enabled: boolean; maxDays: number };
  encashable?: boolean;
  paidLeave?: boolean;
  applicableGender?: LeaveGender;
  probationAllowed?: boolean;
  halfDayAllowed?: boolean;
  attachmentRequired?: boolean;
  color?: string;
  isActive?: boolean;
}

export const leaveTypesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<LeaveType>> =>
    (await api.get('/leaves/types', { params })).data,
  get: async (id: string): Promise<ItemResponse<LeaveType>> =>
    (await api.get(`/leaves/types/${id}`)).data,
  create: async (input: LeaveTypeInput): Promise<ItemResponse<LeaveType>> =>
    (await api.post('/leaves/types', input)).data,
  update: async (id: string, input: Partial<LeaveTypeInput>): Promise<ItemResponse<LeaveType>> =>
    (await api.patch(`/leaves/types/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/leaves/types/${id}`)).data,
};

/* ── Leave Balance ── */
export interface LeaveBalance {
  _id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeId?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveTypeId: string | { _id: string; name: string; code: string; color: string };
  year: number;
  allocated: number;
  used: number;
  carried: number;
  adjusted: number;
  balance: number;
}

export interface AllocateBalanceInput {
  employeeIds: string[];
  leaveTypeId: string;
  year: number;
  allocated: number;
}

export const leaveBalancesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<LeaveBalance>> =>
    (await api.get('/leaves/balances', { params })).data,
  my: async (year?: number): Promise<{ success: boolean; data: LeaveBalance[] }> =>
    (await api.get('/leaves/balances/my', { params: { year } })).data,
  allocate: async (
    input: AllocateBalanceInput,
  ): Promise<{ success: boolean; data: { matched: number; upserted: number } }> =>
    (await api.post('/leaves/balances/allocate', input)).data,
  adjust: async (
    id: string,
    delta: number,
    reason?: string,
  ): Promise<ItemResponse<LeaveBalance>> =>
    (await api.patch(`/leaves/balances/${id}/adjust`, { delta, reason })).data,
};

/* ── Leave Request ── */
export interface LeaveAttachment {
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface LeaveRequest {
  _id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeId?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveTypeId: string | { _id: string; name: string; code: string; color: string };
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  halfDayType?: HalfDayType;
  reason: string;
  attachments: LeaveAttachment[];
  status: LeaveStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approvedBy?: string | { _id: string; firstName: string; lastName: string; email: string };
  approvedAt?: string;
  rejectedReason?: string;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequestInput {
  employeeId?: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay?: boolean;
  halfDayType?: HalfDayType;
  reason: string;
  attachments?: { name: string; fileUrl: string }[];
}

export interface LeaveReports {
  year: number;
  byStatus: { _id: string; n: number; days: number }[];
  byType: { leaveTypeId: string; name?: string; color?: string; days: number }[];
  totalApprovedDays: number;
}

export const leaveRequestsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<LeaveRequest>> =>
    (await api.get('/leaves/requests', { params })).data,
  my: async (params?: Record<string, unknown>): Promise<ListResponse<LeaveRequest>> =>
    (await api.get('/leaves/requests/my', { params })).data,
  team: async (params?: Record<string, unknown>): Promise<ListResponse<LeaveRequest>> =>
    (await api.get('/leaves/requests/team', { params })).data,
  calendar: async (
    from?: string,
    to?: string,
  ): Promise<{ success: boolean; data: LeaveRequest[] }> =>
    (await api.get('/leaves/requests/calendar', { params: { from, to } })).data,
  get: async (id: string): Promise<ItemResponse<LeaveRequest>> =>
    (await api.get(`/leaves/requests/${id}`)).data,
  apply: async (input: LeaveRequestInput): Promise<ItemResponse<LeaveRequest>> =>
    (await api.post('/leaves/requests', input)).data,
  approve: async (id: string): Promise<ItemResponse<LeaveRequest>> =>
    (await api.patch(`/leaves/requests/${id}/approve`)).data,
  reject: async (id: string, reason: string): Promise<ItemResponse<LeaveRequest>> =>
    (await api.patch(`/leaves/requests/${id}/reject`, { reason })).data,
  cancel: async (id: string): Promise<ItemResponse<LeaveRequest>> =>
    (await api.patch(`/leaves/requests/${id}/cancel`)).data,
  reports: async (year?: number): Promise<{ success: boolean; data: LeaveReports }> =>
    (await api.get('/leaves/reports', { params: { year } })).data,
};
