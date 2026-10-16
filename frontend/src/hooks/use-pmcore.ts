import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  projectsApi,
  milestonesApi,
  tasksApi,
  timeEntriesApi,
  timesheetsApi,
  type ProjectInput,
  type MilestoneInput,
  type TaskInput,
  type TimeEntryInput,
  type TaskStatus,
} from '@/lib/pmcore.api';

/* ── Projects ── */
export function useProjects(params?: Record<string, unknown>) {
  return useQuery({ queryKey: ['projects', params], queryFn: () => projectsApi.list(params) });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.get(id as string),
    enabled: !!id,
  });
}

export function useProjectDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id, 'dashboard'],
    queryFn: () => projectsApi.dashboard(id as string),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectInput) => projectsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to create project'),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProjectInput> }) =>
      projectsApi.update(id, input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', vars.id] });
      toast.success('Project updated');
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
  });
}

/* ── Milestones ── */
export function useMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['milestones', projectId],
    queryFn: () => milestonesApi.list(projectId as string),
    enabled: !!projectId,
  });
}

export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MilestoneInput) => milestonesApi.create(projectId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      toast.success('Milestone added');
    },
  });
}

export function useUpdateMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MilestoneInput> }) =>
      milestonesApi.update(projectId, id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      toast.success('Milestone updated');
    },
  });
}

export function useDeleteMilestone(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => milestonesApi.remove(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones', projectId] });
      toast.success('Milestone deleted');
    },
  });
}

/* ── Tasks ── */
export function useTasks(projectId: string | undefined, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['tasks', projectId, params],
    queryFn: () => tasksApi.list(projectId as string, params),
    enabled: !!projectId,
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => tasksApi.create(projectId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      toast.success('Task created');
    },
  });
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TaskInput> }) =>
      tasksApi.update(projectId, id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      toast.success('Task updated');
    },
  });
}

export function useUpdateTaskStatus(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, order }: { id: string; status: TaskStatus; order?: number }) =>
      tasksApi.updateStatus(projectId, id, { status, order }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}

export function useReorderTasks(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: { _id: string; status: TaskStatus; order: number }[]) =>
      tasksApi.reorder(projectId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      toast.success('Task deleted');
    },
  });
}

/* ── Time entries ── */
export function useTimeEntries(projectId: string | undefined, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['time-entries', projectId, params],
    queryFn: () => timeEntriesApi.list(projectId as string, params),
    enabled: !!projectId,
  });
}

export function useCreateTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TimeEntryInput) => timeEntriesApi.create(projectId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries', projectId] });
      qc.invalidateQueries({ queryKey: ['timesheets'] });
      toast.success('Time logged');
    },
  });
}

export function useDeleteTimeEntry(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => timeEntriesApi.remove(projectId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries', projectId] });
      qc.invalidateQueries({ queryKey: ['timesheets'] });
      toast.success('Entry removed');
    },
  });
}

/* ── Timesheets ── */
export function useMyTimesheets(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['timesheets', 'my', params],
    queryFn: () => timesheetsApi.my(params),
  });
}

export function useWeeklyTimesheet(params?: { weekStart?: string }) {
  return useQuery({
    queryKey: ['timesheets', 'weekly', params],
    queryFn: () => timesheetsApi.weekly(params),
  });
}
