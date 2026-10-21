import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveRequestsApi, type LeaveRequest } from '@/lib/leaves.api';
import { attendanceApi } from '@/lib/attendance.api';
import LeaveCalendarPage from './LeaveCalendarPage';

vi.mock('@/lib/leaves.api', () => ({ leaveRequestsApi: { calendar: vi.fn() } }));
vi.mock('@/lib/attendance.api', () => ({ attendanceApi: { getConfig: vi.fn() } }));

const calendar = vi.mocked(leaveRequestsApi.calendar);

function leave(startDate: string, endDate: string, name: string): LeaveRequest {
  const [firstName, lastName] = name.split(' ');
  return {
    _id: `l-${startDate}`,
    employeeId: { _id: 'e1', firstName, lastName },
    leaveTypeId: { _id: 't1', name: 'Casual', color: '#3b82f6' },
    startDate,
    endDate,
    status: 'approved',
  } as unknown as LeaveRequest;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LeaveCalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const day = (d: number): HTMLElement => screen.getByLabelText(new RegExp(`^${d} October 2026`));

describe('LeaveCalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 00:30 IST on 1 Oct 2026 — still 30 Sep in UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T19:00:00Z'));
    vi.mocked(attendanceApi.getConfig).mockResolvedValue({ success: true, data: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the IST month and asks for all of it, last day included', async () => {
    calendar.mockResolvedValue({ success: true, data: [] });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(calendar).toHaveBeenCalledWith('2026-09-30T18:30:00.000Z', '2026-10-31T18:29:59.999Z');
  });

  it('puts each leave on its IST day, not the day before', async () => {
    calendar.mockResolvedValue({
      success: true,
      data: [
        // Stored at IST midnight: 31 Oct, the last day of the month.
        leave('2026-10-30T18:30:00.000Z', '2026-10-30T18:30:00.000Z', 'Asha Rao'),
        // Stored at UTC midnight: 5–6 Oct.
        leave('2026-10-05T00:00:00.000Z', '2026-10-06T00:00:00.000Z', 'Ravi Shah'),
      ],
    });
    renderPage();

    expect(await within(day(31)).findByText('Asha Rao')).toBeInTheDocument();
    expect(within(day(30)).queryByText('Asha Rao')).not.toBeInTheDocument();
    expect(within(day(5)).getByText('Ravi Shah')).toBeInTheDocument();
    expect(within(day(6)).getByText('Ravi Shah')).toBeInTheDocument();
    expect(within(day(4)).queryByText('Ravi Shah')).not.toBeInTheDocument();
    expect(within(day(7)).queryByText('Ravi Shah')).not.toBeInTheDocument();
  });
});
