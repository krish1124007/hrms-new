import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DEFAULT_FIELD_SETTINGS,
  fieldApi,
  type FieldSettings,
  type NoFieldAccessReason,
  type FieldTaskInput,
  type FieldTaskUpdate,
  type PlanVisitInput,
  type SiteInput,
  type SiteUpdate,
  type TaskCompletionInput,
  type VisitScheduleInput,
} from '@/lib/field.api';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveEmployees } from '@/hooks/use-employee-picker';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { useAuthStore } from '@/stores/auth.store';

/*
 * Mutation failures are toasted once, by the global handler
 * (`lib/query-client.ts`) — never again here.
 */

type QC = ReturnType<typeof useQueryClient>;

/** `field.manage` — sees and acts on everyone's field records and the settings. */
export function useCanManageField(): boolean {
  const { has } = usePermissions();
  return has('field.manage');
}

/* ── People (pickers) ── */

/**
 * Employees field work can be planned or assigned for: the shared
 * current-staff picker (≤ 100 per request, active + on notice).
 */
export function useFieldReps(enabled = true) {
  return useActiveEmployees({ enabled });
}

/**
 * Employees in the caller's scope who cannot be given field work — no login,
 * or a login whose role lacks Field Visits — by employee id. Planning a visit,
 * a recurring visit or a task for them is refused (400
 * `EMPLOYEE_NO_FIELD_ACCESS`), so pickers flag them. Empty while loading or
 * if the read fails: the server still refuses.
 */
export function useNoFieldAccess(enabled = true): Record<string, NoFieldAccessReason> {
  const q = useQuery({
    queryKey: ['field', 'team-access'],
    queryFn: () => fieldApi.teamAccess(),
    enabled,
    staleTime: 60_000,
  });
  return q.data?.data.noAccess ?? NO_ONE;
}
const NO_ONE: Record<string, NoFieldAccessReason> = {};

/** Whether the signed-in user may list employees for a picker (`employees.view`). */
export function useCanPickEmployees(): boolean {
  const { has } = usePermissions();
  return has('employees.view');
}

/** The signed-in user's own employee id, if they have an employee record. */
export function useMyEmployeeId(): string | undefined {
  return useMyEmployeeProfile().profile?._id;
}

/** The signed-in user's login id — what a site's or task's `createdBy` holds. */
export function useMyUserId(): string | undefined {
  return useAuthStore((s) => s.user?._id);
}

/* ── Settings ── */

export function useFieldSettings() {
  const q = useQuery({
    queryKey: ['field-settings'],
    queryFn: () => fieldApi.getSettings(),
    staleTime: 60_000,
  });
  /** The loaded settings, or the defaults while they load (or when the read failed). */
  const settings: FieldSettings = q.data?.data ?? DEFAULT_FIELD_SETTINGS;
  return { ...q, settings };
}

export function useUpdateFieldSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldSettings) => fieldApi.updateSettings(input),
    onSuccess: (res) => {
      qc.setQueryData(['field-settings'], res);
      // Travel allowance reads the vehicle rates under their own key.
      void qc.invalidateQueries({ queryKey: ['field', 'settings'] });
      toast.success('Field settings saved');
    },
  });
}

/* ── Uploads ── */

export function useUploadFieldPhoto() {
  return useMutation({ mutationFn: (file: File) => fieldApi.uploadPhoto(file) });
}

/* ── Sites ── */

function invalidateSites(qc: QC): void {
  qc.invalidateQueries({ queryKey: ['field-sites'] });
  qc.invalidateQueries({ queryKey: ['field-sites-map'] });
  qc.invalidateQueries({ queryKey: ['field-site'] });
}

export function useSites(params?: Record<string, unknown>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field-sites', params],
    queryFn: () => fieldApi.listSites(params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

export function useSitesMap(bbox: string | null) {
  return useQuery({
    queryKey: ['field-sites-map', bbox],
    queryFn: () => fieldApi.sitesMap(bbox as string),
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
  });
}

export function useSite(id: string | undefined) {
  return useQuery({
    queryKey: ['field-site', id],
    queryFn: () => fieldApi.getSite(id as string),
    enabled: !!id,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteInput) => fieldApi.createSite(input),
    onSuccess: () => {
      invalidateSites(qc);
      toast.success('Site added');
    },
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: SiteUpdate }) => fieldApi.updateSite(vars.id, vars.input),
    onSuccess: () => {
      invalidateSites(qc);
      toast.success('Site updated');
    },
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteSite(id),
    onSuccess: () => {
      invalidateSites(qc);
      toast.success('Site deleted');
    },
  });
}

export function useImportSites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => fieldApi.importSites(file),
    onSuccess: () => invalidateSites(qc),
  });
}

/* ── Visits ── */

function invalidateVisits(qc: QC): void {
  qc.invalidateQueries({ queryKey: ['field-visits'] });
  qc.invalidateQueries({ queryKey: ['field-visit'] });
  qc.invalidateQueries({ queryKey: ['field-my-day'] });
  qc.invalidateQueries({ queryKey: ['field-site'] });
}

export function useVisits(params?: Record<string, unknown>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field-visits', params],
    queryFn: () => fieldApi.listVisits(params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

export function useVisit(id: string | undefined) {
  return useQuery({
    queryKey: ['field-visit', id],
    queryFn: () => fieldApi.getVisit(id as string),
    enabled: !!id,
  });
}

export function usePlanVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanVisitInput) => fieldApi.planVisit(input),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Visit planned');
    },
  });
}

export function useCancelVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) => fieldApi.cancelVisit(vars.id, vars.reason),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Visit cancelled');
    },
  });
}

export function useMyDay(date: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field-my-day', date],
    queryFn: () => fieldApi.myDay(date),
    enabled: opts.enabled ?? true,
  });
}

/* ── Recurring schedules ── */

function invalidateSchedules(qc: QC): void {
  qc.invalidateQueries({ queryKey: ['field-schedules'] });
}

export function useVisitSchedules(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-schedules', params],
    queryFn: () => fieldApi.listSchedules(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VisitScheduleInput) => fieldApi.createSchedule(input),
    onSuccess: () => {
      invalidateSchedules(qc);
      toast.success('Recurring visit saved — planned visits appear up to 7 days ahead');
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<VisitScheduleInput> }) =>
      fieldApi.updateSchedule(vars.id, vars.input),
    onSuccess: () => {
      invalidateSchedules(qc);
      toast.success('Recurring visit updated');
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteSchedule(id),
    onSuccess: () => {
      invalidateSchedules(qc);
      toast.success('Recurring visit deleted');
    },
  });
}

/* ── Tasks at a site ── */

function invalidateTasks(qc: QC): void {
  qc.invalidateQueries({ queryKey: ['field-tasks'] });
  qc.invalidateQueries({ queryKey: ['field-my-day'] });
}

export function useFieldTasks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-tasks', params],
    queryFn: () => fieldApi.listTasks(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldTaskInput) => fieldApi.createTask(input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task assigned');
    },
  });
}

export function useUpdateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: FieldTaskUpdate }) => fieldApi.updateTask(vars.id, vars.input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task updated');
    },
  });
}

export function useDeleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteTask(id),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task deleted');
    },
  });
}

export function useAcceptFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.acceptTask(id),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task accepted');
    },
  });
}

export function useCompleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: TaskCompletionInput }) => fieldApi.completeTask(vars.id, vars.input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task completed');
    },
  });
}
