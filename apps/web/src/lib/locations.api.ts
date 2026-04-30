import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type LocationType = 'office' | 'branch' | 'warehouse' | 'site';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationManager {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface Location {
  _id: string;
  name: string;
  type: LocationType;
  address: string;
  coordinates?: LocationCoordinates;
  phone?: string;
  manager?: LocationManager | string | null;
  employees: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocationInput {
  name: string;
  type: LocationType;
  address: string;
  coordinates?: LocationCoordinates;
  phone?: string;
  manager?: string;
  isActive?: boolean;
}

export const locationsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Location>> =>
    (await api.get('/locations', { params })).data,
  get: async (id: string): Promise<ItemResponse<Location>> =>
    (await api.get(`/locations/${id}`)).data,
  create: async (input: LocationInput): Promise<ItemResponse<Location>> =>
    (await api.post('/locations', input)).data,
  update: async (id: string, input: Partial<LocationInput>): Promise<ItemResponse<Location>> =>
    (await api.patch(`/locations/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/locations/${id}`)).data,
  assignEmployees: async (
    id: string,
    employeeIds: string[],
  ): Promise<ItemResponse<Location>> =>
    (await api.post(`/locations/${id}/employees`, { employeeIds })).data,
};
