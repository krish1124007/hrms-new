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

export async function updateConsent(
  consents: Pick<ConsentState, 'termsOfService' | 'privacyPolicy' | 'marketing' | 'analytics'>,
): Promise<ConsentState> {
  const { data } = await api.post<{ success: true; data: { consents: ConsentState } }>(
    '/me/consent',
    { consents },
  );
  return data.data.consents;
}

export async function deleteAccount(input: {
  password: string;
  confirmation: 'DELETE MY ACCOUNT';
  reason?: string;
}): Promise<void> {
  await api.post('/me/delete-account', input);
}
