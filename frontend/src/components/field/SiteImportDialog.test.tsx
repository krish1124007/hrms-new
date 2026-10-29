import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldApi } from '@/lib/field.api';
import { createAppQueryClient } from '@/lib/query-client';
import { SiteImportDialog } from './SiteImportDialog';

afterEach(() => vi.restoreAllMocks());

describe('SiteImportDialog', () => {
  it('lists skipped rows and, apart from them, imported rows that left out some employee IDs', async () => {
    vi.spyOn(fieldApi, 'importSites').mockResolvedValue({
      success: true,
      data: {
        created: 2,
        updated: 0,
        errors: [{ row: 4, message: 'Latitude and Longitude must be valid coordinates' }],
        warnings: [{ row: 2, message: 'Not assigned: EMP-999 — no employee has this ID' }],
      },
    } as Awaited<ReturnType<typeof fieldApi.importSites>>);
    render(
      <QueryClientProvider client={createAppQueryClient()}>
        <SiteImportDialog open onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/like EMP000046/)).toBeInTheDocument();
    const file = new File(['x'], 'sites.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await userEvent.upload(screen.getByLabelText('Excel file'), file);
    await userEvent.click(screen.getByRole('button', { name: /Import/ }));

    expect(await screen.findByText('2 created, 0 updated, 1 skipped')).toBeInTheDocument();
    expect(screen.getByText('Skipped rows')).toBeInTheDocument();
    expect(screen.getByText('Latitude and Longitude must be valid coordinates')).toBeInTheDocument();
    expect(screen.getByText('Imported, with notes')).toBeInTheDocument();
    expect(screen.getByText('Not assigned: EMP-999 — no employee has this ID')).toBeInTheDocument();
  });
});
