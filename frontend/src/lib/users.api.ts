import { api } from './axios';

/** A login (User) as `PATCH /users/:id` returns it, with its role populated. */
export interface LoginUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'active' | 'inactive' | 'invited';
  role?: { _id: string; name: string; slug: string; description?: string } | null;
}

interface ApiOk<T> {
  success: true;
  data: T;
}

/** Login administration (`users.update`). */
export const usersApi = {
  /**
   * Give a login another role. The server refuses your own role
   * (SELF_ROLE_CHANGE) and a role carrying permissions you do not hold.
   * It applies to the user's next request — no new sign-in.
   */
  setRole: async (userId: string, roleId: string): Promise<LoginUser> => {
    const { data } = await api.patch<ApiOk<LoginUser>>(`/users/${userId}`, { roleId });
    return data.data;
  },
  /** Allow (`active`) or block (`inactive`) sign-in. */
  setStatus: async (userId: string, status: 'active' | 'inactive'): Promise<LoginUser> => {
    const { data } = await api.patch<ApiOk<LoginUser>>(`/users/${userId}/status`, { status });
    return data.data;
  },
};
