import { api } from './axios';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ListResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

export interface ItemResponse<T> {
  success: boolean;
  data: T;
}

/* ── Department ── */
export interface Department {
  _id: string;
  name: string;
  code: string;
  description?: string;
  head?: { _id: string; firstName: string; lastName: string; profileImage?: string } | null;
  parentDepartment?: { _id: string; name: string; code: string } | null;
  status: 'active' | 'inactive';
  employeeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

export interface DepartmentInput {
  name: string;
  code: string;
  description?: string;
  head?: string;
  parentDepartment?: string;
  status?: 'active' | 'inactive';
}

export const departmentsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Department>> =>
    (await api.get('/departments', { params })).data,
  tree: async (): Promise<{ success: boolean; data: DepartmentTreeNode[] }> =>
    (await api.get('/departments/tree')).data,
  get: async (id: string): Promise<ItemResponse<Department>> =>
    (await api.get(`/departments/${id}`)).data,
  create: async (input: DepartmentInput): Promise<ItemResponse<Department>> =>
    (await api.post('/departments', input)).data,
  update: async (id: string, input: Partial<DepartmentInput>): Promise<ItemResponse<Department>> =>
    (await api.patch(`/departments/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/departments/${id}`)).data,
};

/* ── Designation ── */
export interface Designation {
  _id: string;
  name: string;
  department?: { _id: string; name: string; code: string } | null;
  level: number;
  description?: string;
}

export interface DesignationInput {
  name: string;
  department?: string;
  level?: number;
  description?: string;
}

export const designationsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Designation>> =>
    (await api.get('/designations', { params })).data,
  get: async (id: string): Promise<ItemResponse<Designation>> =>
    (await api.get(`/designations/${id}`)).data,
  create: async (input: DesignationInput): Promise<ItemResponse<Designation>> =>
    (await api.post('/designations', input)).data,
  update: async (
    id: string,
    input: Partial<DesignationInput>,
  ): Promise<ItemResponse<Designation>> => (await api.patch(`/designations/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/designations/${id}`)).data,
};

/* ── Shift ── */
export interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  workDays: number[];
  isNightShift: boolean;
  breakDuration: number;
  isDefault: boolean;
  color: string;
}

export interface ShiftInput {
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes?: number;
  halfDayHours?: number;
  fullDayHours?: number;
  workDays?: number[];
  isNightShift?: boolean;
  breakDuration?: number;
  isDefault?: boolean;
  color?: string;
}

export const shiftsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Shift>> =>
    (await api.get('/shifts', { params })).data,
  get: async (id: string): Promise<ItemResponse<Shift>> => (await api.get(`/shifts/${id}`)).data,
  create: async (input: ShiftInput): Promise<ItemResponse<Shift>> =>
    (await api.post('/shifts', input)).data,
  update: async (id: string, input: Partial<ShiftInput>): Promise<ItemResponse<Shift>> =>
    (await api.patch(`/shifts/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/shifts/${id}`)).data,
  assign: async (id: string, employeeIds: string[]): Promise<{ success: boolean }> =>
    (await api.post(`/shifts/${id}/assign`, { employeeIds })).data,
};

/* ── Holiday ── */
export interface Holiday {
  _id: string;
  name: string;
  date: string;
  /** Only `public` holidays are days off (for `departments`, or everyone when empty). */
  type: 'public' | 'optional' | 'restricted';
  departments: { _id: string; name: string; code: string }[];
  isRecurring: boolean;
  description?: string;
}

export interface HolidayInput {
  name: string;
  date: string | Date;
  type?: 'public' | 'optional' | 'restricted';
  departments?: string[];
  isRecurring?: boolean;
  description?: string;
}

export const holidaysApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Holiday>> =>
    (await api.get('/holidays', { params })).data,
  upcoming: async (): Promise<{ success: boolean; data: Holiday[] }> =>
    (await api.get('/holidays/upcoming')).data,
  get: async (id: string): Promise<ItemResponse<Holiday>> =>
    (await api.get(`/holidays/${id}`)).data,
  create: async (input: HolidayInput): Promise<ItemResponse<Holiday>> =>
    (await api.post('/holidays', input)).data,
  update: async (id: string, input: Partial<HolidayInput>): Promise<ItemResponse<Holiday>> =>
    (await api.patch(`/holidays/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/holidays/${id}`)).data,
  /** Copy every recurring holiday into `year` (the target), skipping ones already there. */
  rollover: async (year: number): Promise<{ success: boolean; data: { created: number; skipped: number } }> =>
    (await api.post('/holidays/rollover', { year })).data,
  /** Bulk-add holidays (`date` is `YYYY-MM-DD`); ones already there (same day, same name) are skipped. */
  importCalendar: async (
    holidays: { name: string; date: string; type: Holiday['type'] }[],
  ): Promise<{ success: boolean; data: { created: number; skipped: number } }> =>
    (await api.post('/holidays/import-calendar', { holidays })).data,
};

/* ── Employee ── */
export interface EmployeeAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface EmployeeSalary {
  basic?: number;
  hra?: number;
  da?: number;
  specialAllowance?: number;
  otherAllowances?: Record<string, number>;
  grossSalary?: number;
  /** Monthly TDS payroll deducts. */
  tdsMonthly?: number;
}

export interface EmployeeBank {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  panNumber?: string;
}

export interface EmployeeDocument {
  _id: string;
  type: string;
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface EmergencyContact {
  name?: string;
  relation?: string;
  phone?: string;
}

/** An employee's login as `GET /employees/:id` returns it. */
export interface EmployeeLogin {
  _id: string;
  email: string;
  status: 'active' | 'inactive' | 'invited' | string;
  lastLogin?: string;
  /** The login's role — name and description, never its permission list. Null if the role was deleted. */
  role?: { _id: string; name: string; slug: string; description?: string } | null;
}

export interface Employee {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  bloodGroup?: string;
  profileImage?: string;
  address?: { current?: EmployeeAddress; permanent?: EmployeeAddress };
  /** Location is mandatory for this employee's check-in / check-out. */
  requireLocation?: boolean;
  department?: { _id: string; name: string; code: string } | null;
  designation?: { _id: string; name: string; level: number } | null;
  shift?: { _id: string; name: string; color: string } | null;
  reportingManager?:
    | { _id: string; firstName: string; lastName: string; employeeId: string }
    | null;
  joiningDate: string;
  confirmationDate?: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'intern';
  workLocation?: string;
  salary: EmployeeSalary;
  bankDetails: EmployeeBank;
  documents: EmployeeDocument[];
  emergencyContact: EmergencyContact;
  status: 'active' | 'inactive' | 'terminated' | 'resigned' | 'onNotice';
  exitDate?: string;
  exitReason?: string;
  /** The status a scheduled exit (`exitDate` in the future) applies on that day. */
  exitStatus?: 'inactive' | 'terminated' | 'resigned';
  /** Field staff — e.g. the expense-before-check-out rule can target them. */
  isFieldStaff?: boolean;
  /** Salary structure payroll takes this employee's components from. */
  salaryStructureId?: string | null;
  /** Soft-deleted; `POST /employees/:id/restore` brings it back. */
  isDeleted?: boolean;
  probationEndDate?: string;
  noticePeriod?: number;
  // `GET /employees/:id` populates the login with its role (name only); lists send the bare id.
  userId?: EmployeeLogin | string | null;
  /** `GET /employees/:id` only: whether their login opens Field Visits (role or own permissions). */
  fieldAccess?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string | Date;
  gender?: 'male' | 'female' | 'other';
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed';
  bloodGroup?: string;
  profileImage?: string;
  address?: { current?: EmployeeAddress; permanent?: EmployeeAddress };
  /** Location is mandatory for this employee's check-in / check-out. */
  requireLocation?: boolean;
  isFieldStaff?: boolean;
  /** `null` clears the structure. */
  salaryStructureId?: string | null;
  department?: string;
  designation?: string;
  shift?: string;
  reportingManager?: string;
  joiningDate: string | Date;
  confirmationDate?: string | Date;
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'intern';
  workLocation?: string;
  salary?: EmployeeSalary;
  bankDetails?: EmployeeBank;
  emergencyContact?: EmergencyContact;
  probationEndDate?: string | Date;
  noticePeriod?: number;
  createUserAccount?: boolean;
  roleId?: string;
  /** Optional admin-set login password (≥8 chars). If omitted on create the
   *  backend issues an invite link by email instead. */
  password?: string;
}

export interface EmployeeStatusInput {
  status: Employee['status'];
  reason?: string;
  /** `YYYY-MM-DD`. */
  exitDate?: string;
}

export interface EmployeeStats {
  total: number;
  active: number;
  byDepartment: { _id: string | null; n: number }[];
  byType: { _id: string; n: number }[];
  joiningsThisMonth: number;
  exitsThisMonth: number;
}

/** One import row's outcome, as `POST /employees/import` reports it. */
export interface EmployeeImportRow {
  row: number;
  email?: string;
  employeeId?: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
}

export interface EmployeeImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  /** The skipped and errored rows, the way older clients read them. */
  failed: Array<{ email: string; reason: string }>;
  rows: EmployeeImportRow[];
}

export const employeesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Employee>> =>
    (await api.get('/employees', { params })).data,
  stats: async (): Promise<{ success: boolean; data: EmployeeStats }> =>
    (await api.get('/employees/stats')).data,
  birthdays: async (): Promise<{ success: boolean; data: Employee[] }> =>
    (await api.get('/employees/birthdays')).data,
  get: async (id: string, params?: { includeDeleted?: 1 }): Promise<ItemResponse<Employee>> =>
    (await api.get(`/employees/${id}`, { params })).data,
  /** `GET /employees/export` — every employee as a CSV file. */
  exportCsv: async (): Promise<Blob> =>
    (await api.get('/employees/export', { responseType: 'blob' })).data as Blob,
  create: async (input: EmployeeInput): Promise<ItemResponse<Employee>> =>
    (await api.post('/employees', input)).data,
  import: async (
    employees: Omit<EmployeeInput, 'createUserAccount' | 'roleId'>[],
  ): Promise<{ success: boolean; data: EmployeeImportResult }> =>
    (await api.post('/employees/import', { employees })).data,
  update: async (id: string, input: Partial<EmployeeInput>): Promise<ItemResponse<Employee>> =>
    (await api.patch(`/employees/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/employees/${id}`)).data,
  /**
   * A future `exitDate` schedules the exit: the employee stays as they are
   * (on notice stays on notice) until that day, then takes the exit status.
   */
  updateStatus: async (id: string, body: EmployeeStatusInput): Promise<ItemResponse<Employee>> =>
    (await api.patch(`/employees/${id}/status`, body)).data,
  /** Bring back a soft-deleted employee (and reactivate their login). */
  restore: async (id: string): Promise<ItemResponse<Employee>> =>
    (await api.post(`/employees/${id}/restore`)).data,
  addDocument: async (
    id: string,
    body: { type: string; name: string; fileUrl: string },
  ): Promise<{ success: boolean; data: EmployeeDocument[] }> =>
    (await api.post(`/employees/${id}/documents`, body)).data,
  removeDocument: async (
    id: string,
    docId: string,
  ): Promise<{ success: boolean; data: EmployeeDocument[] }> =>
    (await api.delete(`/employees/${id}/documents/${docId}`)).data,
};
