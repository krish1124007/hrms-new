import { AxiosError } from 'axios';
import { api } from './axios';
import { documentsApi } from './documents.api';
import type { EmergencyContact, ItemResponse } from './systemcore.api';

/** The signed-in user's own employee record (`GET /employees/me`) — no salary or bank data. */
export interface MyEmployeeProfile {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  personalEmail?: string;
  phone?: string;
  avatar?: string | null;
  department?: { _id: string; name: string } | null;
  designation?: { _id: string; name: string } | null;
  emergencyContact?: EmergencyContact;
}

/** The only fields an employee may change on their own record. */
export interface MyProfileUpdate {
  phone?: string;
  personalEmail?: string;
  emergencyContact?: EmergencyContact;
  avatar?: string;
}

/** `GET /employees/me` answers 404 `NO_EMPLOYEE_PROFILE` for a login with no employee record. */
export function isNoEmployeeProfile(err: unknown): boolean {
  return (
    err instanceof AxiosError &&
    err.response?.status === 404 &&
    (err.response.data as { error?: { code?: string } } | undefined)?.error?.code === 'NO_EMPLOYEE_PROFILE'
  );
}

export const profileApi = {
  me: async (): Promise<ItemResponse<MyEmployeeProfile>> => (await api.get('/employees/me')).data,

  update: async (input: MyProfileUpdate): Promise<ItemResponse<MyEmployeeProfile>> =>
    (await api.patch('/employees/me', input)).data,

  /**
   * Upload a new profile photo and set it as the avatar: the file goes to the
   * documents store (private to the uploader), then its link is saved with
   * `PATCH /employees/me { avatar }`.
   */
  uploadAvatar: async (file: File): Promise<ItemResponse<MyEmployeeProfile>> => {
    const uploaded = await documentsApi.upload(file, { folder: '/profile-photos', category: 'Profile photo' });
    const url = uploaded.data?.file?.url;
    if (!url) throw new Error('Upload succeeded but no file URL was returned');
    return profileApi.update({ avatar: url });
  },
};
