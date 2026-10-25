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

/**
 * A role as a role picker sees it (`GET /roles/assignable`) — no permission
 * list, but what matters when choosing one.
 */
export interface AssignableRole {
  _id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  /** False when it carries a permission the signed-in user does not hold (saving it would be refused). */
  assignable: boolean;
  /** Opens Field Visits (`field.view`): own visits, plus direct reports' when people report to them. */
  fieldAccess: boolean;
  /** Sees everybody's field visits and the field settings (`field.manage`). */
  fieldManage: boolean;
  /** Admin-like: manages logins, roles or system settings (or holds everything). */
  privileged: boolean;
}

/** What a role opens in Field Visits, in a few words — or null when it opens nothing. */
export function roleFieldScope(role: Pick<AssignableRole, 'slug' | 'fieldAccess' | 'fieldManage'>): string | null {
  if (!role.fieldAccess) return null;
  if (role.fieldManage) return 'Field Visits: everyone';
  if (role.slug === 'field_manager') return 'Field Visits: their team';
  return 'Field Visits: own visits';
}

/** The seeded role a field employee should have. */
export const FIELD_EMPLOYEE_SLUG = 'field_employee';
/** The seeded role a new login gets by default. */
export const DEFAULT_EMPLOYEE_SLUG = 'employee';

export const rolesApi = {
  list: async (): Promise<Role[]> => {
    const { data } = await api.get<ApiOk<Role[]>>('/roles');
    return data.data;
  },
  /** Every role for a picker — needs roles.view, users.create, users.update or employees.create. */
  assignable: async (): Promise<AssignableRole[]> => {
    const { data } = await api.get<ApiOk<AssignableRole[]>>('/roles/assignable');
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
