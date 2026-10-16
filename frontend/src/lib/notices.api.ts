import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type NoticePriority = 'normal' | 'important' | 'urgent';

export interface NoticeUserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface NoticeDeptRef {
  _id: string;
  name: string;
  code: string;
}

export interface NoticeAcknowledgement {
  userId: string;
  acknowledgedAt: string;
}

export interface NoticeAttachment {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface Notice {
  _id: string;
  title: string;
  content: string;
  priority: NoticePriority;
  departments: NoticeDeptRef[];
  postedBy: NoticeUserRef;
  expiresAt?: string | null;
  isPinned: boolean;
  attachments: NoticeAttachment[];
  acknowledgements: NoticeAcknowledgement[];
  createdAt: string;
  updatedAt: string;
}

export interface NoticeInput {
  title: string;
  content: string;
  priority?: NoticePriority;
  departments?: string[];
  expiresAt?: string | Date;
  isPinned?: boolean;
}

export const NOTICE_PRIORITIES: { value: NoticePriority; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
];

export const noticesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Notice>> =>
    (await api.get('/notices', { params })).data,
  get: async (id: string): Promise<ItemResponse<Notice>> =>
    (await api.get(`/notices/${id}`)).data,
  create: async (input: NoticeInput): Promise<ItemResponse<Notice>> =>
    (await api.post('/notices', input)).data,
  update: async (id: string, input: Partial<NoticeInput>): Promise<ItemResponse<Notice>> =>
    (await api.patch(`/notices/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/notices/${id}`)).data,
  acknowledge: async (id: string): Promise<ItemResponse<Notice>> =>
    (await api.post(`/notices/${id}/acknowledge`)).data,
};
