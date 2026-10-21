import { api } from './axios';

export interface ConsentState {
  termsOfService: boolean;
  privacyPolicy: boolean;
  marketing?: boolean;
  analytics?: boolean;
  recordedAt?: string;
  ip?: string;
  userAgent?: string;
  documentVersions?: Record<string, string>;
}

export interface ComplianceStatus {
  consents: ConsentState | null;
  history: Array<{
    _id: string;
    action: string;
    entity: string;
    createdAt: string;
    metadata?: { event?: string };
  }>;
}

export async function getComplianceStatus(): Promise<ComplianceStatus> {
  const { data } = await api.get<{ success: true; data: ComplianceStatus }>('/me/compliance');
  return data.data;
}
