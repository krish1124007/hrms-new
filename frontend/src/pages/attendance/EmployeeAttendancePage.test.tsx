import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, type Attendance } from '@/lib/attendance.api';
import { selfApi } from '@/lib/self.api';
import EmployeeAttendancePage from './EmployeeAttendancePage';

vi.mock('@/lib/attendance.api', () => ({
  attendanceApi: { monthly: vi.fn(), getConfig: vi.fn() },
}));
vi.mock('@/lib/self.api', () => ({
  selfApi: { profile: vi.fn() },
}));
// The check-in widget and the regularization dialog have their own tests and
// their own queries; the calendar is what is under test here.
vi.mock('@/components/attendance/CheckInWidget', () => ({ CheckInWidget: () => null }));
vi.mock('@/components/attendance/RegularizationRequestDialog', () => ({
  RegularizationRequestDialog: () => null,
}));

const monthly = vi.mocked(attendanceApi.monthly);
const getConfig = vi.mocked(attendanceApi.getConfig);
const profile = vi.mocked(selfApi.profile);

function httpError(status: number, code: string, message: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(message, 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { success: false, error: { code, message } },
  });
}

function row(date: string, status: Attendance['status'], over: Partial<Attendance> = {}): Attendance {
  return {
    _id: `a-${date}`,
    employeeId: 'e1',
    date,
    breaks: [],
    totalWorkingHours: status === 'present' ? 8 : 0,
    overtimeHours: 0,
    status,
    lateBy: 0,
    earlyLeaveBy: 0,
    isRegularized: false,
    createdAt: date,
    updatedAt: date,
    ...over,
  } as unknown as Attendance;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EmployeeAttendancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The calendar cell of `day` in October 2026, by its accessible label. */
const cell = (day: number): HTMLElement => screen.getByLabelText(new RegExp(`^${day} October 2026`));

describe('EmployeeAttendancePage calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 20 Oct 2026, 11:30 IST. Only Date is faked so React Query's timers run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T06:00:00Z'));
    getConfig.mockResolvedValue({ success: true, data: {} } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks nothing absent before the joining date or after today', async () => {
    profile.mockResolvedValue({
      success: true,
      data: { _id: 'e1', firstName: 'Asha', lastName: 'Rao', joiningDate: '2026-10-15T00:00:00.000Z' },
    } as never);
    monthly.mockResolvedValue({
      success: true,
      data: [
        // A day label stored at IST midnight, one at UTC midnight.
        row('2026-10-15T18:30:00.000Z', 'present'),
        row('2026-10-19T00:00:00.000Z', 'absent'),
        row('2026-10-18T00:00:00.000Z', 'weekend', { isVirtual: true } as Partial<Attendance>),
      ],
    });

    renderPage();
    await screen.findByLabelText(/^16 October 2026: Present/);

    for (let d = 1; d <= 14; d++) {
      expect(cell(d).getAttribute('aria-label')).not.toMatch(/Absent/);
    }
    expect(cell(14).getAttribute('aria-label')).toMatch(/Before joining/);
    for (let d = 21; d <= 31; d++) {
      expect(cell(d).getAttribute('aria-label')).not.toMatch(/Absent/);
    }
    // Only a day the server recorded as absent says so.
    expect(cell(19).getAttribute('aria-label')).toMatch(/Absent/);
    // A past working day with no record is not claimed to be an absence.
    expect(cell(17).getAttribute('aria-label')).toMatch(/No record/);
    expect(cell(18).getAttribute('aria-label')).toMatch(/Week off/);
  });

  it('still renders the calendar when the profile cannot be loaded', async () => {
    profile.mockRejectedValue(httpError(500, 'INTERNAL', 'boom'));
    monthly.mockResolvedValue({ success: true, data: [row('2026-10-16T00:00:00.000Z', 'present')] });

    renderPage();
    await screen.findByLabelText(/^16 October 2026: Present/);
    expect(cell(5).getAttribute('aria-label')).not.toMatch(/Absent/);
  });

  it('tells a user without an employee profile so instead of showing an empty month', async () => {
    profile.mockRejectedValue(httpError(404, 'NO_EMPLOYEE_PROFILE', 'No employee profile for this user'));
    monthly.mockRejectedValue(httpError(403, 'FORBIDDEN', 'No employee profile found for current user'));

    renderPage();

    expect(await screen.findByText(/no employee profile/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^1 October 2026/)).not.toBeInTheDocument();
  });
});
