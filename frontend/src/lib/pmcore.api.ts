import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectMemberRole = 'manager' | 'member' | 'viewer';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type MilestoneStatus = 'pending' | 'completed';

export interface ProjectMember {
  _id?: string;
  userId: { _id: string; firstName: string; lastName: string; email: string; avatar?: string } | string;
  role: ProjectMemberRole;
  joinedAt: string;
}

export interface Project {
  _id: string;
  name: string;
  code: string;
  description?: string;
  client?: { _id: string; name: string } | string | null;
  category?: string;
  startDate?: string;
  endDate?: string;
  estimatedHours?: number;
  budget?: number;
  status: ProjectStatus;
  priority: Priority;
  members: ProjectMember[];
  progress: number;
  color: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  code: string;
  description?: string;
  client?: string;
  category?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  estimatedHours?: number;
  budget?: number;
  status?: ProjectStatus;
  priority?: Priority;
  members?: { userId: string; role?: ProjectMemberRole }[];
  progress?: number;
  color?: string;
  tags?: string[];
}

export const projectsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Project>> =>
    (await api.get('/projects', { params })).data,
  get: async (id: string): Promise<ItemResponse<Project>> => (await api.get(`/projects/${id}`)).data,
  create: async (input: ProjectInput): Promise<ItemResponse<Project>> =>
    (await api.post('/projects', input)).data,
  update: async (id: string, input: Partial<ProjectInput>): Promise<ItemResponse<Project>> =>
    (await api.patch(`/projects/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/projects/${id}`)).data,
  dashboard: async (
    id: string,
  ): Promise<{
    success: boolean;
    data: {
      project: Project;
      taskStats: { _id: string; n: number }[];
      milestoneStats: { _id: string; n: number }[];
      totalHours: number;
    };
  }> => (await api.get(`/projects/${id}/dashboard`)).data,
};

/* ── Milestones ── */
export interface Milestone {
  _id: string;
  projectId: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: MilestoneStatus;
  completedAt?: string;
  order: number;
}

export interface MilestoneInput {
  title: string;
  description?: string;
  dueDate?: string | Date;
  status?: MilestoneStatus;
  order?: number;
}

export const milestonesApi = {
  list: async (projectId: string): Promise<{ success: boolean; data: Milestone[] }> =>
    (await api.get(`/projects/${projectId}/milestones`)).data,
  create: async (projectId: string, input: MilestoneInput): Promise<ItemResponse<Milestone>> =>
    (await api.post(`/projects/${projectId}/milestones`, input)).data,
  update: async (
    projectId: string,
    id: string,
    input: Partial<MilestoneInput>,
  ): Promise<ItemResponse<Milestone>> =>
    (await api.patch(`/projects/${projectId}/milestones/${id}`, input)).data,
  remove: async (projectId: string, id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/projects/${projectId}/milestones/${id}`)).data,
};

/* ── Tasks ── */
export interface Task {
  _id: string;
  projectId: string;
  milestoneId?: string;
  title: string;
  description?: string;
  assignee?: { _id: string; firstName: string; lastName: string; email: string; avatar?: string } | null;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  estimatedHours?: number;
  labels: string[];
  attachments: { _id: string; name: string; fileUrl: string }[];
  order: number;
  parentTask?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  milestoneId?: string;
  assignee?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string | Date;
  estimatedHours?: number;
  labels?: string[];
  parentTask?: string;
  order?: number;
}

export const tasksApi = {
  list: async (
    projectId: string,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; data: Task[] }> =>
    (await api.get(`/projects/${projectId}/tasks`, { params })).data,
  get: async (projectId: string, id: string): Promise<ItemResponse<Task>> =>
    (await api.get(`/projects/${projectId}/tasks/${id}`)).data,
  create: async (projectId: string, input: TaskInput): Promise<ItemResponse<Task>> =>
    (await api.post(`/projects/${projectId}/tasks`, input)).data,
  update: async (
    projectId: string,
    id: string,
    input: Partial<TaskInput>,
  ): Promise<ItemResponse<Task>> => (await api.patch(`/projects/${projectId}/tasks/${id}`, input)).data,
  updateStatus: async (
    projectId: string,
    id: string,
    body: { status: TaskStatus; order?: number },
  ): Promise<ItemResponse<Task>> =>
    (await api.patch(`/projects/${projectId}/tasks/${id}/status`, body)).data,
  reorder: async (
    projectId: string,
    items: { _id: string; status: TaskStatus; order: number }[],
  ): Promise<{ success: boolean }> =>
    (await api.patch(`/projects/${projectId}/tasks/reorder`, { items })).data,
  remove: async (projectId: string, id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/projects/${projectId}/tasks/${id}`)).data,
};

/* ── Time entries ── */
export interface TimeEntry {
  _id: string;
  projectId: string | { _id: string; name: string; code: string; color: string };
  taskId?: { _id: string; title: string } | string;
  userId: { _id: string; firstName: string; lastName: string; email: string; avatar?: string } | string;
  date: string;
  hours: number;
  description?: string;
  isBillable: boolean;
}

export interface TimeEntryInput {
  taskId?: string;
  userId?: string;
  date: string | Date;
  hours: number;
  description?: string;
  isBillable?: boolean;
}

export const timeEntriesApi = {
  list: async (
    projectId: string,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; data: TimeEntry[] }> =>
    (await api.get(`/projects/${projectId}/time-entries`, { params })).data,
  create: async (projectId: string, input: TimeEntryInput): Promise<ItemResponse<TimeEntry>> =>
    (await api.post(`/projects/${projectId}/time-entries`, input)).data,
  update: async (
    projectId: string,
    id: string,
    input: Partial<TimeEntryInput>,
  ): Promise<ItemResponse<TimeEntry>> =>
    (await api.patch(`/projects/${projectId}/time-entries/${id}`, input)).data,
  remove: async (projectId: string, id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/projects/${projectId}/time-entries/${id}`)).data,
};

/* ── Timesheets ── */
export interface WeeklyTimesheet {
  weekStart: string;
  days: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: { project: any; perDay: Record<string, number>; total: number }[];
}

export const timesheetsApi = {
  my: async (params?: { from?: string; to?: string }): Promise<{ success: boolean; data: TimeEntry[] }> =>
    (await api.get('/timesheets/my', { params })).data,
  weekly: async (params?: { weekStart?: string }): Promise<{ success: boolean; data: WeeklyTimesheet }> =>
    (await api.get('/timesheets/weekly', { params })).data,
};
