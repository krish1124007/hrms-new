import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, type Attendance } from '@/lib/attendance.api';
import { expenseCategoriesApi, expenseClaimsApi } from '@/lib/expense-claims.api';
import { CheckInWidget } from './CheckInWidget';

vi.mock('@/lib/attendance.api', () => ({
  attendanceApi: {
    getConfig: vi.fn(),
    today: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    startBreak: vi.fn(),
    endBreak: vi.fn(),
  },
}));
vi.mock('@/lib/expense-claims.api', () => ({
  expenseCategoriesApi: { list: vi.fn() },
  expenseClaimsApi: { create: vi.fn() },
}));

const getConfig = vi.mocked(attendanceApi.getConfig);
const today = vi.mocked(attendanceApi.today);
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

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CheckInWidget />
    </QueryClientProvider>,
  );
}

describe('CheckInWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfig.mockResolvedValue({
      success: true,
      data: { _id: 'cfg', enabledMethods: ['manual'], settings: {} },
    } as never);
    today.mockResolvedValue({ success: true, data: checkedIn });
    categories.mockResolvedValue({
      success: true,
      data: [{ _id: 'cat-daily', name: 'Daily expense', code: 'DAILY' }],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
    } as never);
    createClaim.mockResolvedValue({ success: true, data: {} } as never);
  });

  it('checks out directly when the server accepts it — no expense form, no claim', async () => {
    checkOut.mockResolvedValue({ success: true, data: checkedIn });
    const user = userEvent.setup();

    renderWidget();
    await user.click(await screen.findByRole('button', { name: /check out/i }));

    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/submit today's expense to check out/i)).toBeNull();
    expect(createClaim).not.toHaveBeenCalled();
  });

  it('opens the expense form only on EXPENSE_REQUIRED_FOR_CHECKOUT, then checks out again once the claim is filed', async () => {
    checkOut.mockRejectedValueOnce(expenseRequired).mockResolvedValue({ success: true, data: checkedIn });
    const user = userEvent.setup();

    renderWidget();
    await user.click(await screen.findByRole('button', { name: /check out/i }));

    expect(await screen.findByText(/submit today's expense to check out/i)).toBeInTheDocument();
    expect(createClaim).not.toHaveBeenCalled();

    const submit = screen.getByRole('button', { name: /submit & check out/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(createClaim).toHaveBeenCalledTimes(1));
    expect(createClaim).toHaveBeenCalledWith(expect.objectContaining({ category: 'cat-daily', amount: 0 }));
    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/submit today's expense to check out/i)).toBeNull());
  });

  it('never offers face recognition, even when the stored config lists it first', async () => {
    getConfig.mockResolvedValue({
      success: true,
      data: { _id: 'cfg', enabledMethods: ['face', 'manual', 'qr'], settings: {} },
    } as never);
    today.mockResolvedValue({ success: true, data: null });

    renderWidget();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Static QR' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Face Recognition' })).toBeNull();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('manual');
  });
});
