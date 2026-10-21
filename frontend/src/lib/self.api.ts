import { api } from './axios';

/**
 * The signed-in user's own employee record — `GET /employees/me`, open to
 * every authenticated user. No salary or bank details. A user without an
 * employee record (e.g. the seeded admin) gets 404 `NO_EMPLOYEE_PROFILE`.
 */
export interface MyEmployeeProfile {
  _id: string;
  employeeId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  personalEmail?: string;
  phone?: string;
  avatar?: string;
  gender?: string;
  dateOfBirth?: string;
  /** Day label; read it with `toISTDateKey`. */
  joiningDate?: string;
  status?: 'active' | 'inactive' | 'terminated' | 'resigned' | 'onNotice';
  isFieldStaff?: boolean;
  department?: { _id: string; name: string } | null;
  designation?: { _id: string; name: string } | null;
  shift?: { _id: string; name: string; startTime?: string; endTime?: string } | null;
  reportingManager?: { _id: string; firstName: string; lastName: string } | null;
}

export const selfApi = {
  profile: async (): Promise<{ success: boolean; data: MyEmployeeProfile }> =>
    (await api.get('/employees/me')).data,
};
