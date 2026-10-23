import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/axios';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import ReportsPage from './ReportsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/axios')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const get = vi.mocked(api.get);
const createObjectURL = vi.fn(() => 'blob:report');
const revokeObjectURL = vi.fn();
let saved: string[] = [];

function renderPage(): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  // jsdom cannot navigate; record which file the page asked the browser to save.
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  vi.mocked(selfApi.profile).mockResolvedValue({ success: true, data: { _id: 'me' } } as never);
  get.mockImplementation(async (url: string, config?: { responseType?: string }) => {
    if (config?.responseType === 'blob') {
      return {
        data: new Blob(['file']),
        headers: { 'content-disposition': 'attachment; filename="field-report.xlsx"' },
      };
    }
    if (url === '/field/reports/summary') {
      return {
        data: {
          success: true,
          data: [{ key: 'e1', label: 'Ravi Kumar', visits: 5, completed: 4, missed: 1, minutesOnSite: 200, km: 30.5 }],
        },
      };
    }
    if (url === '/field/reports/exceptions') {
      return {
        data: {
          success: true,
          data: [
            {
              visitId: 'v9',
              employee: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar' },
              site: { _id: 's1', name: 'Acme Plant' },
              date: '2026-10-20',
              type: 'away_from_site',
              detail: '450 m from the pin',
            },
          ],
        },
      };
    }
    return { data: { success: true, data: [] } };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReportsPage', () => {
  it('shows the summary for the date range', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('3 h 20 m')).toBeInTheDocument();
    const call = get.mock.calls.find(([url]) => url === '/field/reports/summary');
    expect(call?.[1]).toMatchObject({ params: { groupBy: 'employee' } });
    const params = (call?.[1] as { params: Record<string, string> }).params;
    expect(params.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('downloads the summary as Excel with format=xlsx', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    await screen.findByText('Ravi Kumar');
    await userEvent.click(screen.getByRole('button', { name: /excel/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const download = get.mock.calls.find(([, cfg]) => (cfg as { responseType?: string })?.responseType === 'blob');
    expect(download?.[0]).toBe('/field/reports/summary');
    expect(saved).toEqual(['field-report.xlsx']);
    expect(download?.[1]).toMatchObject({
      responseType: 'blob',
      params: { format: 'xlsx', groupBy: 'employee' },
    });
  });

  it('downloads the exceptions as PDF with format=pdf', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Exceptions' }));
    const table = await screen.findByText('Away from site');
    expect(within(table.closest('tr') as HTMLElement).getByText('Acme Plant')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /pdf/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const download = get.mock.calls.find(([, cfg]) => (cfg as { responseType?: string })?.responseType === 'blob');
    expect(download?.[0]).toBe('/field/reports/exceptions');
    expect(download?.[1]).toMatchObject({ responseType: 'blob', params: { format: 'pdf' } });
  });

  it('refuses a range that ends before it starts', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    await screen.findByText('Ravi Kumar');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2099-01-01' } });
    expect(await screen.findByText(/must not be after/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excel/i })).toBeDisabled();
  });
});
