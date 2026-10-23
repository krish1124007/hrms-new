import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/axios';
import type { DailyReport } from '@/lib/field-reports.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import { useAuthStore } from '@/stores/auth.store';
import ReportsPage from './ReportsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock('@/lib/axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/axios')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const get = vi.mocked(api.get);

const ME = { _id: 'me', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-1' };
const NO_FLAGS = {
  awayFromSite: false,
  noGps: false,
  noSelfie: false,
  shortVisit: false,
  autoClosed: false,
  syncedLate: false,
  capturedOffline: false,
};
/** `GET /field/reports/daily` exactly as the server answers it. */
const DAILY: DailyReport = {
  date: '2026-10-22',
  employee: ME,
  visits: [
    {
      _id: 'v1',
      site: { _id: 's1', name: 'Acme Plant', type: 'Client office' },
      purpose: 'Inspection',
      status: 'completed',
      plannedDate: null,
      checkIn: { at: '2026-10-22T04:30:00.000Z', location: { lat: 19.03, lng: 72.84 }, distanceM: 450 },
      checkOut: { at: '2026-10-22T05:30:00.000Z', location: { lat: 19.031, lng: 72.841 }, distanceM: 20 },
      durationMinutes: 60,
      flags: { ...NO_FLAGS, awayFromSite: true },
      report: {
        notes: 'Pump replaced',
        outcome: 'follow_up',
        nextAction: 'Check pressure',
        followUpDate: null,
        photos: ['/uploads/a.jpg'],
        documents: [],
        peopleMet: [{ name: 'Mr Shah' }],
        checklist: null,
        submittedAt: '2026-10-22T05:31:00.000Z',
      },
    },
    {
      _id: 'v2',
      site: { _id: 's2', name: 'Depot 4', type: 'Branch' },
      purpose: 'Audit',
      status: 'missed',
      plannedDate: '2026-10-22',
      checkIn: null,
      checkOut: null,
      durationMinutes: null,
      flags: NO_FLAGS,
      report: null,
    },
  ],
  points: [],
  legs: [],
  totalKm: 12.5,
  estimated: true,
};
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
              employee: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-1' },
              site: { _id: 's1', name: 'Acme Plant', type: 'Client office' },
              date: '2026-10-20',
              type: 'away_from_site',
              detail: 'Checked in 450 m from the site (radius 200 m)',
            },
          ],
        },
      };
    }
    if (url === '/field/team/status') {
      return {
        data: {
          success: true,
          data: [
            {
              employee: ME,
              status: 'day_ended',
              currentVisit: null,
              lastPoint: null,
              visitsToday: 1,
              kmToday: 12.5,
            },
          ],
        },
      };
    }
    if (url === '/field/reports/daily') {
      return { data: { success: true, data: DAILY } };
    }
    if (url === '/field/reports/sites') {
      return {
        data: {
          success: true,
          data: [
            {
              site: { _id: 's1', name: 'Acme Plant', type: 'Client office' },
              visits: 4,
              lastVisitAt: '2026-10-20T06:00:00.000Z',
              employees: [
                { _id: 'e2', firstName: 'Asha', lastName: 'Rao', employeeId: 'EMP-2' },
                { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-1' },
              ],
              employeeCount: 2,
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
  useAuthStore.getState().clear();
});

describe('ReportsPage', () => {
  it("shows the signed-in employee's day: visits, flags, work report and km", async () => {
    renderPage();
    const visit = (await screen.findByRole('link', { name: 'Acme Plant' })).closest('li') as HTMLElement;
    expect(within(visit).getByText('Completed')).toBeInTheDocument();
    expect(within(visit).getByText('Away from site')).toBeInTheDocument();
    expect(within(visit).getByText(/Outcome: Follow-up needed/)).toBeInTheDocument();
    expect(within(visit).getByText(/Met Mr Shah/)).toBeInTheDocument();
    const missed = screen.getByRole('link', { name: 'Depot 4' }).closest('li') as HTMLElement;
    expect(within(missed).getByText('Missed')).toBeInTheDocument();
    expect(screen.getByText('12.5 km')).toBeInTheDocument();
    expect(screen.getByText('Estimated')).toBeInTheDocument();
    const call = get.mock.calls.find(([url]) => url === '/field/reports/daily');
    expect(call?.[1]).toMatchObject({ params: { employeeId: 'me' } });
  });

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

  it('lists who visited each site and how many people that is', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sites' }));
    const row = (await screen.findByText('Acme Plant')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Asha Rao, Ravi Kumar')).toBeInTheDocument();
    expect(within(row).getByTestId('site-people')).toHaveTextContent('2 people');
    expect(within(row).getByText('Client office')).toBeInTheDocument();
  });

  it('refuses a range longer than the server allows (92 days)', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    await screen.findByText('Ravi Kumar');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-04-02' } }); // 92 days: fine
    expect(screen.queryByText(/at most 92 days/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-04-03' } }); // 93 days
    expect(await screen.findByText(/at most 92 days/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excel/i })).toBeDisabled();
  });

  it('lets a field manager open the day of anyone, also someone not on today’s team map', async () => {
    useAuthStore.getState().setSession({
      user: { _id: 'u-hr', email: 'hr@example.com', role: { slug: 'hr', name: 'HR', permissions: ['field.view', 'field.manage', 'employees.view'] } },
    });
    const base = get.getMockImplementation();
    get.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/employees') {
        return {
          data: {
            success: true,
            data: [{ _id: 'e9', firstName: 'Old', lastName: 'Timer', employeeId: 'EMP-9', status: 'terminated' }],
            pagination: { page: 1, limit: 100, total: 1, pages: 1 },
          },
        };
      }
      return base!(url, config);
    });
    renderPage();
    const picker = screen.getByLabelText('Employee');
    expect(await within(picker).findByRole('option', { name: 'Old Timer (EMP-9)' })).toBeInTheDocument();
    expect(within(picker).getByRole('option', { name: 'Ravi Kumar (EMP-1)' })).toBeInTheDocument();
    // Former employees too: the picker asks for every status.
    const call = get.mock.calls.find(([url]) => url === '/employees');
    expect((call?.[1] as { params: Record<string, unknown> }).params).not.toHaveProperty('status');

    await userEvent.selectOptions(picker, 'e9');
    await waitFor(() =>
      expect(get.mock.calls.some(([url, cfg]) => url === '/field/reports/daily' && (cfg as { params: { employeeId: string } }).params.employeeId === 'e9')).toBe(true),
    );
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
