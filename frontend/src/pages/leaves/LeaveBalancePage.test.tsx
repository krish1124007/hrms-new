import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaveBalancesApi, leaveTypesApi } from '@/lib/leaves.api';
import { employeesApi, type Employee } from '@/lib/systemcore.api';
import { todayKey } from '@/lib/business-day';
import LeaveBalancePage from './LeaveBalancePage';

vi.mock('@/lib/leaves.api', () => ({
  leaveBalancesApi: { list: vi.fn(), reset: vi.fn(), allocate: vi.fn(), openYear: vi.fn() },
  leaveTypesApi: { list: vi.fn() },
}));
vi.mock('@/lib/systemcore.api', () => ({ employeesApi: { list: vi.fn() } }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true, hasAny: () => true, hasAll: () => true, permissions: [] }),
}));

const employeesList = vi.mocked(employeesApi.list);
const reset = vi.mocked(leaveBalancesApi.reset);

function emp(id: string, status: Employee['status']): Employee {
  return { _id: id, firstName: id, lastName: 'X', employeeId: id, status } as unknown as Employee;
}

const page = (data: Employee[]) => ({
  success: true,
  data,
  pagination: { page: 1, limit: 100, total: data.length, pages: 1 },
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LeaveBalancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LeaveBalancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(leaveBalancesApi.list).mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 1 },
    });
    vi.mocked(leaveTypesApi.list).mockResolvedValue({
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0, pages: 1 },
    });
    employeesList.mockImplementation(async (params) =>
      page(params?.status === 'active' ? [emp('A', 'active')] : [emp('N', 'onNotice')]),
    );
    reset.mockResolvedValue({ success: true, data: { modifiedCount: 3 } } as never);
  });

  it('allocation picker asks only for current employees, a page of 100 at a time', async () => {
    renderPage();
    await waitFor(() => expect(employeesList).toHaveBeenCalledTimes(2));
    const statuses = employeesList.mock.calls.map(([p]) => p?.status).sort();
    expect(statuses).toEqual(['active', 'onNotice']);
    for (const [p] of employeesList.mock.calls) expect(p?.limit).toBe(100);
  });

  it('pages the balances list on the server', async () => {
    renderPage();
    await waitFor(() =>
      expect(leaveBalancesApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 50 })),
    );
  });

  it('resets only after "RESET <year>" is typed', async () => {
    const year = Number(todayKey().slice(0, 4));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reset Balances' }));
    const confirm = await screen.findByRole('button', { name: `Reset ${year} balances` });
    expect(confirm).toBeDisabled();

    const box = screen.getByLabelText(/to confirm/i);
    await user.type(box, `RESET ${year - 1}`);
    expect(confirm).toBeDisabled();

    await user.clear(box);
    await user.type(box, `RESET ${year}`);
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(reset).toHaveBeenCalledWith(year, undefined));
  });
});
