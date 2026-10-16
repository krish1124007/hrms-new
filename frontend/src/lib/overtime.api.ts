import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface OvertimeEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email?: string;
  profileImage?: string;
}

export interface OvertimeUserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface OvertimeRequest {
  _id: string;
  employee: OvertimeEmployeeRef;
  date: string;
  hours: number;
  reason: string;
  status: OvertimeStatus;
  appliedAt: string;
  approvedBy?: OvertimeUserRef | null;
  approvedAt?: string | null;
  approverNotes?: string;
  rejectedReason?: string;
  payrollRecordId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OvertimeInput {
  employee?: string;
  date: string | Date;
  hours: number;
  reason: string;
}

export interface OvertimeStats {
  total: number;
  byStatus: Record<OvertimeStatus, number>;
  approvedHours: number;
}

export const OVERTIME_STATUSES: { value: OvertimeStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const overtimeApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<OvertimeRequest>> =>
    (await api.get('/overtime', { params })).data,
  listMine: async (params?: Record<string, unknown>): Promise<ListResponse<OvertimeRequest>> =>
    (await api.get('/overtime/me', { params })).data,
  stats: async (): Promise<{ success: boolean; data: OvertimeStats }> =>
    (await api.get('/overtime/stats')).data,
  get: async (id: string): Promise<ItemResponse<OvertimeRequest>> =>
    (await api.get(`/overtime/${id}`)).data,
  create: async (input: OvertimeInput): Promise<ItemResponse<OvertimeRequest>> =>
    (await api.post('/overtime', input)).data,
  update: async (
    id: string,
    input: Partial<OvertimeInput>,
  ): Promise<ItemResponse<OvertimeRequest>> => (await api.patch(`/overtime/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/overtime/${id}`)).data,
  approve: async (
    id: string,
    body: { notes?: string } = {},
  ): Promise<ItemResponse<OvertimeRequest>> =>
    (await api.post(`/overtime/${id}/approve`, body)).data,
  reject: async (
    id: string,
    body: { reason: string },
  ): Promise<ItemResponse<OvertimeRequest>> =>
    (await api.post(`/overtime/${id}/reject`, body)).data,
};
