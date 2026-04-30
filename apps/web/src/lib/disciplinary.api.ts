import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type DisciplinaryType =
  | 'verbal_warning'
  | 'written_warning'
  | 'final_warning'
  | 'pip'
  | 'suspension'
  | 'termination'
  | 'other';

export type DisciplinarySeverity = 'low' | 'medium' | 'high' | 'critical';

export type DisciplinaryStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'escalated'
  | 'resolved'
  | 'failed'
  | 'cancelled';

export interface DisciplinaryEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email?: string;
  profileImage?: string;
}

export interface DisciplinaryUserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface DisciplinaryAttachment {
  _id?: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface DisciplinaryComment {
  _id?: string;
  author: DisciplinaryUserRef | string;
  text: string;
  createdAt: string;
}

export interface DisciplinaryAction {
  _id: string;
  caseNumber: string;
  employee: DisciplinaryEmployeeRef;
  type: DisciplinaryType;
  severity: DisciplinarySeverity;
  status: DisciplinaryStatus;
  title: string;
  description: string;
  incidentDate?: string;
  issuedAt: string;
  issuedBy: DisciplinaryUserRef;
  acknowledgedAt?: string | null;
  acknowledgementNotes?: string;
  resolutionDate?: string | null;
  resolutionNotes?: string;
  pipStartDate?: string | null;
  pipEndDate?: string | null;
  pipGoals?: string;
  escalatedAt?: string | null;
  escalatedTo?: DisciplinaryUserRef | null;
  escalationReason?: string;
  confidential: boolean;
  attachments: DisciplinaryAttachment[];
  comments: DisciplinaryComment[];
  createdAt: string;
  updatedAt: string;
}

export interface DisciplinaryInput {
  employee: string;
  type: DisciplinaryType;
  severity?: DisciplinarySeverity;
  title: string;
  description: string;
  incidentDate?: string | Date;
  pipStartDate?: string | Date;
  pipEndDate?: string | Date;
  pipGoals?: string;
  confidential?: boolean;
}

export interface DisciplinaryStats {
  total: number;
  byStatus: Record<DisciplinaryStatus, number>;
  byType: { _id: string; n: number }[];
  bySeverity: Record<DisciplinarySeverity, number>;
}

export const DISCIPLINARY_TYPES: { value: DisciplinaryType; label: string }[] = [
  { value: 'verbal_warning', label: 'Verbal Warning' },
  { value: 'written_warning', label: 'Written Warning' },
  { value: 'final_warning', label: 'Final Warning' },
  { value: 'pip', label: 'Performance Improvement Plan' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'termination', label: 'Termination' },
  { value: 'other', label: 'Other' },
];

export const DISCIPLINARY_SEVERITIES: { value: DisciplinarySeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const DISCIPLINARY_STATUSES: { value: DisciplinaryStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const disciplinaryApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<DisciplinaryAction>> =>
    (await api.get('/disciplinary', { params })).data,
  myList: async (): Promise<{ success: boolean; data: DisciplinaryAction[] }> =>
    (await api.get('/disciplinary/me')).data,
  stats: async (): Promise<{ success: boolean; data: DisciplinaryStats }> =>
    (await api.get('/disciplinary/stats')).data,
  get: async (id: string): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.get(`/disciplinary/${id}`)).data,
  create: async (input: DisciplinaryInput): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post('/disciplinary', input)).data,
  update: async (
    id: string,
    input: Partial<DisciplinaryInput>,
  ): Promise<ItemResponse<DisciplinaryAction>> => (await api.patch(`/disciplinary/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/disciplinary/${id}`)).data,
  acknowledge: async (
    id: string,
    body: { notes?: string } = {},
  ): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post(`/disciplinary/${id}/acknowledge`, body)).data,
  resolve: async (
    id: string,
    body: { outcome: 'resolved' | 'failed'; notes: string },
  ): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post(`/disciplinary/${id}/resolve`, body)).data,
  escalate: async (
    id: string,
    body: { escalatedTo: string; reason: string },
  ): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post(`/disciplinary/${id}/escalate`, body)).data,
  cancel: async (
    id: string,
    body: { reason?: string } = {},
  ): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post(`/disciplinary/${id}/cancel`, body)).data,
  addComment: async (
    id: string,
    body: { text: string },
  ): Promise<ItemResponse<DisciplinaryAction>> =>
    (await api.post(`/disciplinary/${id}/comments`, body)).data,
};
