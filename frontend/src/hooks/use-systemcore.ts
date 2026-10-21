import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  departmentsApi,
  designationsApi,
  shiftsApi,
  holidaysApi,
  employeesApi,
  type DepartmentInput,
  type DesignationInput,
  type ShiftInput,
  type HolidayInput,
  type EmployeeInput,
  type EmployeeStatusInput,
} from '@/lib/systemcore.api';

/* ── Departments ── */
export function useDepartments(params?: Record<string, unknown>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['departments', params],
    queryFn: () => departmentsApi.list(params),
    enabled: opts.enabled ?? true,
  });
}

export function useDepartmentTree() {
  return useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: () => departmentsApi.tree(),
  });
}

export function useDepartment(id: string | undefined) {
  return useQuery({
    queryKey: ['departments', id],
    queryFn: () => departmentsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DepartmentInput) => departmentsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department created');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to create department'),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DepartmentInput> }) =>
      departmentsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department updated');
    },
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => departmentsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to delete'),
  });
}

/* ── Designations ── */
export function useDesignations(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['designations', params],
    queryFn: () => designationsApi.list(params),
  });
}

export function useCreateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DesignationInput) => designationsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designations'] });
      toast.success('Designation created');
    },
  });
}

export function useUpdateDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DesignationInput> }) =>
      designationsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designations'] });
      toast.success('Designation updated');
    },
  });
}

export function useDeleteDesignation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => designationsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['designations'] });
      toast.success('Designation deleted');
    },
  });
}

/* ── Shifts ── */
export function useShifts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['shifts', params],
    queryFn: () => shiftsApi.list(params),
  });
}

export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ShiftInput) => shiftsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift created');
    },
  });
}

export function useUpdateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ShiftInput> }) =>
      shiftsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift updated');
    },
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shiftsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success('Shift deleted');
    },
  });
}

/* ── Holidays ── */
export function useHolidays(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['holidays', params],
    queryFn: () => holidaysApi.list(params),
  });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HolidayInput) => holidaysApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday created');
    },
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<HolidayInput> }) =>
      holidaysApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday updated');
    },
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => holidaysApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday deleted');
    },
  });
}

/** Copy the recurring holidays into `year`. */
export function useRolloverHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => holidaysApi.rollover(year),
    onSuccess: (d, year) => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      const { created, skipped } = d.data;
      toast.success(
        created === 0 && skipped === 0
          ? 'No recurring holidays to copy'
          : `Copied ${created} recurring holiday(s) to ${year}${skipped ? ` — ${skipped} already there` : ''}`,
      );
    },
  });
}

/* ── Employees ── */
export function useEmployees(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => employeesApi.list(params),
  });
}

export function useEmployeeStats() {
  return useQuery({
    queryKey: ['employees', 'stats'],
    queryFn: () => employeesApi.stats(),
  });
}

/**
 * One employee. `includeDeleted` also finds a soft-deleted record (the API
 * honours it only for `employees.delete` holders) so it can be restored.
 */
export function useEmployee(
  id: string | undefined,
  opts?: Partial<UseQueryOptions> & { includeDeleted?: boolean },
) {
  const { includeDeleted, ...queryOpts } = opts ?? {};
  return useQuery({
    queryKey: ['employees', id, includeDeleted ? 'with-deleted' : 'live'],
    queryFn: () => employeesApi.get(id as string, includeDeleted ? { includeDeleted: 1 } : undefined),
    enabled: !!id,
    ...(queryOpts as object),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmployeeInput) => employeesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee created');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to create employee'),
  });
}

export function useImportEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employees: Omit<EmployeeInput, 'createUserAccount' | 'roleId'>[]) => employeesApi.import(employees),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employees imported');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to import employees'),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EmployeeInput> }) =>
      employeesApi.update(id, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employees', vars.id] });
      toast.success('Employee updated');
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => employeesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee deleted');
    },
    // Without this a rejected delete (missing permission, server error) failed
    // silently and the row just stayed put with no explanation.
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Could not delete employee'),
  });
}

export function useUpdateEmployeeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeStatusInput }) =>
      employeesApi.updateStatus(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Status updated');
    },
  });
}

export function useRestoreEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => employeesApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee restored');
    },
  });
}

/* ── Employee documents (offer letter, ID proofs, certificates …) ── */

export function useAddEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { type: string; name: string; fileUrl: string };
    }) => employeesApi.addDocument(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['employees', vars.id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Document uploaded');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to upload document'),
  });
}

export function useRemoveEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, docId }: { id: string; docId: string }) =>
      employeesApi.removeDocument(id, docId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['employees', vars.id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Document removed');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to remove document'),
  });
}
