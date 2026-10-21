import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, type Attendance } from '@/lib/attendance.api';
import { dashboardApi } from '@/lib/dashboard.api';
import { expenseCategoriesApi, expenseClaimsApi } from '@/lib/expense-claims.api';
import { noticesApi, type Notice } from '@/lib/notices.api';
import { payrollApi, type PayrollRecord } from '@/lib/payroll.api';
import EmployeeDashboardPage from './EmployeeDashboardPage';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { _id: 'u1', firstName: 'Asha' }, isAuthenticated: true, logout: vi.fn() }),
}));
vi.mock('@/hooks/use-leaves', () => ({
  useMyLeaveBalances: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock('@/lib/attendance.api', () => ({
  attendanceApi: {
    today: vi.fn(),
    my: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
  },
}));
vi.mock('@/lib/dashboard.api', () => ({
  dashboardApi: { upcoming: vi.fn(async () => ({ birthdays: [], leaves: [] })) },
}));
vi.mock('@/lib/payroll.api', () => ({
  payrollApi: { myPayslips: vi.fn(async () => ({ success: true, data: [] })) },
}));
vi.mock('@/lib/notices.api', () => ({
  noticesApi: { list: vi.fn(async () => ({ success: true, data: [] })), acknowledge: vi.fn() },
}));
vi.mock('@/lib/expense-claims.api', () => ({
  expenseCategoriesApi: { list: vi.fn() },
  expenseClaimsApi: { create: vi.fn() },
}));

const today = vi.mocked(attendanceApi.today);
const my = vi.mocked(attendanceApi.my);
const checkOut = vi.mocked(attendanceApi.checkOut);
const categories = vi.mocked(expenseCategoriesApi.list);
const createClaim = vi.mocked(expenseClaimsApi.create);

const checkedIn = {
  _id: 'att-1',
  employeeId: 'e1',
  date: '2026-10-18T00:00:00.000Z',
  checkIn: { time: '2026-10-18T04:00:00.000Z', method: 'manual' },
  breaks: [],
  totalWorkingHours: 0,
  overtimeHours: 0,
  status: 'present',
  lateBy: 0,
  earlyLeaveBy: 0,
  isRegularized: false,
  createdAt: '2026-10-18T04:00:00.000Z',
  updatedAt: '2026-10-18T04:00:00.000Z',
} as unknown as Attendance;

const expenseRequired = {
  response: {
    status: 400,
    data: { error: { code: 'EXPENSE_REQUIRED_FOR_CHECKOUT', message: "Submit today's expense entry before checking out." } },
  },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EmployeeDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployeeDashboardPage check-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    today.mockResolvedValue({ success: true, data: checkedIn });
    my.mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 31, total: 0, pages: 0 } } as never);
    categories.mockResolvedValue({
      success: true,
      data: [{ _id: 'cat-daily', name: 'Daily expense', code: 'DAILY' }],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
    } as never);
    createClaim.mockResolvedValue({ success: true, data: {} } as never);
  });

  it('checks out directly when the server accepts it — no expense form, no ₹0 claim', async () => {
    checkOut.mockResolvedValue({ success: true, data: checkedIn });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /check out/i }));

    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/submit today's expense to check out/i)).toBeNull();
    expect(createClaim).not.toHaveBeenCalled();
  });

  it('opens the expense form on EXPENSE_REQUIRED_FOR_CHECKOUT and retries the check-out after filing the claim', async () => {
    checkOut.mockRejectedValueOnce(expenseRequired).mockResolvedValue({ success: true, data: checkedIn });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /check out/i }));

    expect(await screen.findByText(/submit today's expense to check out/i)).toBeInTheDocument();
    expect(checkOut).toHaveBeenCalledTimes(1);
    expect(createClaim).not.toHaveBeenCalled();

    const submit = screen.getByRole('button', { name: /submit & check out/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(createClaim).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/submit today's expense to check out/i)).toBeNull());
  });
});

describe('EmployeeDashboardPage notice pop-up and payslip', () => {
  const notice = {
    _id: 'n1',
    title: 'Office closed',
    content: '<p>The office is <strong>closed</strong> on Friday.</p><script>window.__pwned = true</script>',
    priority: 'normal',
    departments: [],
    postedBy: { _id: 'u9', firstName: 'HR', lastName: 'Team' },
    isPinned: false,
    attachments: [],
    acknowledgements: [],
    acknowledgedByMe: false,
    createdAt: '2026-10-20T04:00:00.000Z',
    updatedAt: '2026-10-20T04:00:00.000Z',
  } as Notice;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    today.mockResolvedValue({ success: true, data: null } as never);
    my.mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 31, total: 0, pages: 0 } } as never);
  });

  it('renders an HTML notice sanitised and keeps "Read later" across reloads', async () => {
    vi.mocked(noticesApi.list).mockResolvedValue({
      success: true,
      data: [notice],
      pagination: { page: 1, limit: 1, total: 1, pages: 1 },
    });
    const user = userEvent.setup();

    const first = renderPage();
    const dialogTitle = await screen.findByText('Office closed');
    const closed = await screen.findByText('closed', { selector: 'strong' });
    expect(closed).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(dialogTitle).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /read later/i }));
    await waitFor(() => expect(screen.queryByText('Office closed')).toBeNull());
    first.unmount();

    // A fresh page (new query cache, same session) does not pop it up again.
    renderPage();
    await waitFor(() => expect(noticesApi.list).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Office closed')).toBeNull();
  });

  it('does not pop up a notice the user already acknowledged', async () => {
    vi.mocked(noticesApi.list).mockResolvedValue({
      success: true,
      data: [{ ...notice, acknowledgedByMe: true }],
      pagination: { page: 1, limit: 1, total: 1, pages: 1 },
    });
    renderPage();
    await waitFor(() => expect(noticesApi.list).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Office closed')).toBeNull();
  });

  it("names the latest payslip's month from its payroll cycle", async () => {
    vi.mocked(noticesApi.list).mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 1, total: 0, pages: 0 },
    });
    vi.mocked(payrollApi.myPayslips).mockResolvedValue({
      success: true,
      data: [
        {
          _id: 'r1',
          cycleId: { _id: 'c1', month: 9, year: 2026, status: 'paid' },
          netSalary: 45000,
          grossSalary: 50000,
        } as PayrollRecord,
      ],
    });
    renderPage();
    expect(await screen.findByText('Sep 2026')).toBeInTheDocument();
  });
});

describe('EmployeeDashboardPage dates (IST, whatever the browser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    // 31 Oct 2026, 19:00 UTC = 1 Nov 2026, 00:30 IST: already November in India.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T19:00:00.000Z'));
    today.mockResolvedValue({ success: true, data: null } as never);
    my.mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 31, total: 0, pages: 0 } } as never);
    vi.mocked(noticesApi.list).mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 1, total: 0, pages: 0 } });
    vi.mocked(dashboardApi.upcoming).mockResolvedValue({
      birthdays: [{ _id: 'b1', firstName: 'Meera', lastName: 'Shah', dob: '1994-11-01T00:00:00.000Z' }],
      leaves: [],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts this IST month's attendance and labels days the Indian way", async () => {
    renderPage();
    await waitFor(() => expect(my).toHaveBeenCalled());
    expect(my.mock.calls[0][0]).toMatchObject({
      month: '2026-11',
      from: '2026-10-31T18:30:00.000Z', // 1 Nov 00:00 IST
      to: '2026-11-30T18:29:59.999Z', // end of 30 Nov IST
    });
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(await screen.findByText('1 Nov')).toBeInTheDocument();
  });
});
