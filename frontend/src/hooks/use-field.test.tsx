import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FIELD_SETTINGS, fieldApi } from '@/lib/field.api';
import { createAppQueryClient } from '@/lib/query-client';
import { useUpdateFieldSettings } from './use-field';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/field.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field.api')>();
  return { ...actual, fieldApi: { ...actual.fieldApi, updateSettings: vi.fn() } };
});

describe('useUpdateFieldSettings', () => {
  it('marks the vehicle rates travel allowance reads as stale once HR saves new ones', async () => {
    const qc = createAppQueryClient();
    const vehiclesKey = ['field', 'settings', 'vehicles'];
    qc.setQueryData(vehiclesKey, { success: true, data: DEFAULT_FIELD_SETTINGS.vehicles });
    const saved = {
      ...DEFAULT_FIELD_SETTINGS,
      vehicles: [
        { type: 'bike' as const, label: 'Two-wheeler', ratePerKm: 4 },
        { type: 'car' as const, label: 'Car', ratePerKm: 9 },
      ],
    };
    vi.mocked(fieldApi.updateSettings).mockResolvedValue({ success: true, data: saved });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateFieldSettings(), { wrapper });

    expect(qc.getQueryState(vehiclesKey)?.isInvalidated).toBe(false);
    await act(async () => {
      await result.current.mutateAsync(saved);
    });
    await waitFor(() => expect(qc.getQueryState(vehiclesKey)?.isInvalidated).toBe(true));
    expect(qc.getQueryData(['field-settings'])).toEqual({ success: true, data: saved });
  });
});
