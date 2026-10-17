import { api } from './axios';

interface ApiOk<T> {
  success: true;
  data: T;
}

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
