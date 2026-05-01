import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type PolicyCategory =
  | 'general'
  | 'code_of_conduct'
  | 'leave'
  | 'attendance'
  | 'compensation'
  | 'benefits'
  | 'safety'
  | 'security'
  | 'data_privacy'
  | 'remote_work'
  | 'travel'
  | 'expenses'
  | 'harassment'
  | 'grievance'
  | 'it'
  | 'other';

export type PolicyStatus = 'draft' | 'published' | 'archived';

export interface PolicyEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email?: string;
  profileImage?: string;
}

export interface PolicyVersion {
  _id?: string;
  versionNumber: number;
  content: string;
  changeNotes?: string;
  publishedAt?: string | null;
  publishedBy?: { _id: string; firstName: string; lastName: string } | null;
  effectiveDate?: string | null;
}

export interface PolicyAcknowledgement {
  _id?: string;
  employee: PolicyEmployeeRef;
  versionNumber: number;
  acknowledgedAt: string;
  comment?: string;
}

export interface PolicyAttachment {
  _id?: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface HrPolicy {
  _id: string;
  policyCode: string;
  title: string;
  category: PolicyCategory;
  status: PolicyStatus;
  summary?: string;
  content: string;
  currentVersion: number;
  versions: PolicyVersion[];
  effectiveDate?: string | null;
  reviewDueDate?: string | null;
  mandatory: boolean;
  acknowledgements: PolicyAcknowledgement[];
  acknowledgementCount?: number;
  tags: string[];
  attachments: PolicyAttachment[];
  ownerUser?: { _id: string; firstName: string; lastName: string; email?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyInput {
  policyCode?: string;
  title: string;
  category?: PolicyCategory;
  summary?: string;
  content: string;
  effectiveDate?: string | Date;
  reviewDueDate?: string | Date;
  mandatory?: boolean;
  tags?: string[];
  changeNotes?: string;
}

export interface PolicyStats {
  total: number;
  byStatus: Record<PolicyStatus, number>;
  byCategory: { _id: string; n: number }[];
  mandatoryPublished: number;
  activeEmployees: number;
}

export interface PolicyAckSummary {
  acknowledgements: PolicyAcknowledgement[];
  summary: {
    total: number;
    acknowledged: number;
    pending: number;
    currentVersion: number;
  };
}

export const POLICY_CATEGORIES: { value: PolicyCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'code_of_conduct', label: 'Code of Conduct' },
  { value: 'leave', label: 'Leave' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'benefits', label: 'Benefits' },
  { value: 'safety', label: 'Safety' },
  { value: 'security', label: 'Security' },
  { value: 'data_privacy', label: 'Data Privacy' },
  { value: 'remote_work', label: 'Remote Work' },
  { value: 'travel', label: 'Travel' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'harassment', label: 'Anti-Harassment' },
  { value: 'grievance', label: 'Grievance' },
  { value: 'it', label: 'IT & Acceptable Use' },
  { value: 'other', label: 'Other' },
];

export const POLICY_STATUSES: { value: PolicyStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export const hrPoliciesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<HrPolicy>> =>
    (await api.get('/hr-policies', { params })).data,
  stats: async (): Promise<{ success: boolean; data: PolicyStats }> =>
    (await api.get('/hr-policies/stats')).data,
  get: async (id: string): Promise<ItemResponse<HrPolicy>> =>
    (await api.get(`/hr-policies/${id}`)).data,
  create: async (input: PolicyInput): Promise<ItemResponse<HrPolicy>> =>
    (await api.post('/hr-policies', input)).data,
  update: async (id: string, input: Partial<PolicyInput>): Promise<ItemResponse<HrPolicy>> =>
    (await api.patch(`/hr-policies/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/hr-policies/${id}`)).data,
  publish: async (
    id: string,
    body: { effectiveDate?: string | Date; changeNotes?: string } = {},
  ): Promise<ItemResponse<HrPolicy>> => (await api.post(`/hr-policies/${id}/publish`, body)).data,
  archive: async (id: string): Promise<ItemResponse<HrPolicy>> =>
    (await api.post(`/hr-policies/${id}/archive`)).data,
  restore: async (id: string): Promise<ItemResponse<HrPolicy>> =>
    (await api.post(`/hr-policies/${id}/restore`)).data,
  acknowledge: async (
    id: string,
    body: { employee: string; comment?: string },
  ): Promise<ItemResponse<HrPolicy>> =>
    (await api.post(`/hr-policies/${id}/acknowledge`, body)).data,
  acknowledgements: async (
    id: string,
  ): Promise<{ success: boolean; data: PolicyAckSummary }> =>
    (await api.get(`/hr-policies/${id}/acknowledgements`)).data,
  uploadAttachment: async (id: string, file: File): Promise<ItemResponse<HrPolicy>> => {
    const fd = new FormData();
    fd.append('file', file);
    return (
      await api.post(`/hr-policies/${id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  deleteAttachment: async (
    id: string,
    attachmentId: string,
  ): Promise<ItemResponse<HrPolicy>> =>
    (await api.delete(`/hr-policies/${id}/attachments/${attachmentId}`)).data,
};
