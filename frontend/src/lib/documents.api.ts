import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type DocumentAccessLevel = 'private' | 'department' | 'all';

export interface DocumentUserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface DocumentRecord {
  _id: string;
  name: string;
  category?: string;
  folder: string;
  tags: string[];
  accessLevel: DocumentAccessLevel;
  file: {
    url: string;
    size: number;
    mimeType: string;
    key: string;
  };
  uploadedBy: DocumentUserRef | string;
  createdAt: string;
  updatedAt: string;
}

export const documentsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<DocumentRecord>> =>
    (await api.get('/documents', { params })).data,
  folders: async (): Promise<{ success: boolean; data: string[] }> =>
    (await api.get('/documents/folders')).data,
  get: async (id: string): Promise<ItemResponse<DocumentRecord>> =>
    (await api.get(`/documents/${id}`)).data,
  upload: async (
    file: File,
    opts: { folder?: string; tags?: string[]; category?: string } = {},
  ): Promise<ItemResponse<DocumentRecord>> => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts.folder) fd.append('folder', opts.folder);
    if (opts.category) fd.append('category', opts.category);
    if (opts.tags?.length) fd.append('tags', opts.tags.join(','));
    const res = await api.post('/documents/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  update: async (
    id: string,
    body: { name?: string; folder?: string; tags?: string[]; category?: string },
  ): Promise<ItemResponse<DocumentRecord>> =>
    (await api.patch(`/documents/${id}`, body)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/documents/${id}`)).data,
};
