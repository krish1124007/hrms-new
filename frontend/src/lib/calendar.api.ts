import { api } from './axios';
import type { ItemResponse } from './systemcore.api';

export interface CalendarUserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  location?: string;
  color?: string;
  attendees: CalendarUserRef[];
  createdBy: CalendarUserRef | string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  startDate: string | Date;
  endDate: string | Date;
  isAllDay?: boolean;
  location?: string;
  color?: string;
  attendees?: string[];
}

export const calendarApi = {
  list: async (params?: { start?: string | Date; end?: string | Date }): Promise<{
    success: boolean;
    data: CalendarEvent[];
  }> => (await api.get('/calendar/events', { params })).data,
  get: async (id: string): Promise<ItemResponse<CalendarEvent>> =>
    (await api.get(`/calendar/events/${id}`)).data,
  create: async (input: CalendarEventInput): Promise<ItemResponse<CalendarEvent>> =>
    (await api.post('/calendar/events', input)).data,
  update: async (
    id: string,
    input: Partial<CalendarEventInput>,
  ): Promise<ItemResponse<CalendarEvent>> => (await api.patch(`/calendar/events/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/calendar/events/${id}`)).data,
};
