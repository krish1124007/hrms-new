import { api } from './axios';

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

interface ListResponse {
  success: true;
  data: Notification[];
  pagination: { page: number; limit: number; total: number; pages: number };
  meta: { unreadCount: number };
}

export async function listNotifications(opts: { page?: number; limit?: number; unreadOnly?: boolean } = {}): Promise<ListResponse> {
  const { data } = await api.get<ListResponse>('/notifications', { params: opts });
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ success: true; data: { unreadCount: number } }>(
    '/notifications/unread-count',
  );
  return data.data.unreadCount;
}

export async function markRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await api.post('/notifications/mark-all-read');
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`);
}
