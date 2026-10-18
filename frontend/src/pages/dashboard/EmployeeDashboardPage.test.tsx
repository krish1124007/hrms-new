import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, type Attendance } from '@/lib/attendance.api';
import { expenseCategoriesApi, expenseClaimsApi } from '@/lib/expense-claims.api';
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
