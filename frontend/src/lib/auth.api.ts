import { api } from './axios';

export interface AuthUser {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: { slug: string; name: string; permissions: string[] };
  customPermissions?: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface ApiOk<T> {
  success: true;
  data: T;
}

export const authApi = {
  login: async (input: {
    email: string;
    password: string;
  }): Promise<AuthSession> => {
    const { data } = await api.post<ApiOk<AuthSession>>('/auth/login', input);
    return data.data;
  },

  register: async (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<AuthSession> => {
    const { data } = await api.post<ApiOk<AuthSession>>('/auth/register', input);
    return data.data;
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post('/auth/forgot-password', { email });
  },

  resetPassword: async (input: { token: string; password: string }): Promise<void> => {
    await api.post('/auth/reset-password', input);
  },

  me: async (): Promise<{ user: AuthUser }> => {
    const { data } = await api.get<ApiOk<{ user: AuthUser }>>('/auth/me');
    return data.data;
  },

  updateMyProfile: async (input: {
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }): Promise<{ user: AuthUser }> => {
    const { data } = await api.patch<ApiOk<{ user: AuthUser }>>('/auth/me', input);
    return data.data;
  },

  changeMyPassword: async (input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> => {
    await api.post('/auth/change-password', input);
  },

  /**
   * Admin-only — overwrite another user's password. Bumps their session
   * version on the server so any active sessions are revoked.
   */
  adminSetUserPassword: async (userId: string, password: string): Promise<void> => {
    await api.patch(`/users/${userId}/password`, { password });
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout').catch(() => undefined);
  },
};
