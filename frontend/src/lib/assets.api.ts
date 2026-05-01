import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type AssetCategory =
  | 'laptop'
  | 'desktop'
  | 'mobile'
  | 'tablet'
  | 'monitor'
  | 'peripheral'
  | 'furniture'
  | 'vehicle'
  | 'tool'
  | 'other';

export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired' | 'lost';
export type AssetCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';

export interface AssetEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email?: string;
  profileImage?: string;
}

export interface AssetHistoryEntry {
  _id?: string;
  employee: AssetEmployeeRef | string;
  assignedAt: string;
  returnedAt?: string | null;
  notes?: string;
}

export interface Asset {
  _id: string;
  name: string;
  assetCode: string;
  category: AssetCategory;
  status: AssetStatus;
  condition: AssetCondition;
  serialNumber?: string;
  manufacturer?: string;
  modelNumber?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  warrantyExpiresAt?: string;
  location?: string;
  assignedTo?: AssetEmployeeRef | null;
  assignedAt?: string | null;
  history: AssetHistoryEntry[];
  notes?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInput {
  name: string;
  assetCode?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  condition?: AssetCondition;
  serialNumber?: string;
  manufacturer?: string;
  modelNumber?: string;
  purchaseDate?: string | Date;
  purchasePrice?: number;
  currentValue?: number;
  warrantyExpiresAt?: string | Date;
  location?: string;
  notes?: string;
  imageUrl?: string;
}

export interface AssetStats {
  total: number;
  byStatus: Record<AssetStatus, number>;
  byCategory: { _id: string; n: number }[];
  totalPurchaseValue: number;
  totalCurrentValue: number;
}

export const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile / Phone' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'peripheral', label: 'Peripheral' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'tool', label: 'Tool / Equipment' },
  { value: 'other', label: 'Other' },
];

export const ASSET_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
  { value: 'lost', label: 'Lost / Stolen' },
];

export const ASSET_CONDITIONS: { value: AssetCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'damaged', label: 'Damaged' },
];

export const assetsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Asset>> =>
    (await api.get('/assets', { params })).data,
  stats: async (): Promise<{ success: boolean; data: AssetStats }> =>
    (await api.get('/assets/stats')).data,
  get: async (id: string): Promise<ItemResponse<Asset>> =>
    (await api.get(`/assets/${id}`)).data,
  create: async (input: AssetInput): Promise<ItemResponse<Asset>> =>
    (await api.post('/assets', input)).data,
  update: async (id: string, input: Partial<AssetInput>): Promise<ItemResponse<Asset>> =>
    (await api.patch(`/assets/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/assets/${id}`)).data,
  assign: async (
    id: string,
    body: { employee: string; notes?: string },
  ): Promise<ItemResponse<Asset>> => (await api.post(`/assets/${id}/assign`, body)).data,
  unassign: async (
    id: string,
    body: { notes?: string; condition?: AssetCondition } = {},
  ): Promise<ItemResponse<Asset>> => (await api.post(`/assets/${id}/unassign`, body)).data,
};
