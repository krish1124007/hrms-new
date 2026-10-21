import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth.api';
import { departmentsApi, designationsApi, employeesApi, type Employee } from '@/lib/systemcore.api';
import { useAuthStore } from '@/stores/auth.store';
import EmployeeListPage from './EmployeeListPage';

vi.mock('@/lib/systemcore.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/systemcore.api')>()),
  employeesApi: { list: vi.fn(), stats: vi.fn(), exportCsv: vi.fn() },
  departmentsApi: { list: vi.fn() },
  designationsApi: { list: vi.fn() },
}));

const emp = vi.mocked(employeesApi);
const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } };

const asha = {
  _id: 'e1',
  employeeId: 'EMP-001',
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha@example.com',
  status: 'active',
  joiningDate: '2024-04-01T00:00:00.000Z',
} as Employee;

const hr: AuthUser = {
  _id: 'u-hr',
  email: 'hr@example.com',
  role: {
    slug: 'hr_executive',
    name: 'HR Executive',
    permissions: ['employees.view', 'employees.create', 'employees.update'],
  },
};
const manager: AuthUser = {
  _id: 'u-m',
  email: 'm@example.com',
  role: { slug: 'manager', name: 'Manager', permissions: ['employees.view'] },
};

function LocationProbe(): null {
  (globalThis as { __path?: string }).__path = useLocation().pathname;
  return null;
}

function renderPage(user: AuthUser) {
  useAuthStore.setState({ user, isAuthenticated: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/employees']}>
        <LocationProbe />
        <Routes>
          <Route path="*" element={<EmployeeListPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:employees');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  emp.list.mockResolvedValue({ success: true, data: [asha], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
  emp.stats.mockResolvedValue({
    success: true,
    data: { total: 1, active: 1, byDepartment: [], byType: [], joiningsThisMonth: 0, exitsThisMonth: 0 },
  });
  emp.exportCsv.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
  vi.mocked(departmentsApi.list).mockResolvedValue(empty as never);
  vi.mocked(designationsApi.list).mockResolvedValue(empty as never);
});

describe('EmployeeListPage', () => {
  it('exports the CSV from the API instead of a "coming soon" toast', async () => {
    renderPage(hr);
    await userEvent.click(await screen.findByRole('button', { name: /export/i }));
    await waitFor(() => expect(emp.exportCsv).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('offers View, Edit and Change status in the row menu to HR', async () => {
    renderPage(hr);
    await userEvent.click(await screen.findByRole('button', { name: /more actions for asha rao/i }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'View',
      'Edit',
      'Change status',
    ]);

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Change status' }));
    expect(await screen.findByText('Change status — Asha Rao')).toBeInTheDocument();
  });

  it('hides create and edit actions from a manager who can only view', async () => {
    renderPage(manager);
    await userEvent.click(await screen.findByRole('button', { name: /more actions for asha rao/i }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['View']);
    expect(screen.queryByRole('button', { name: /add employee/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();

    await userEvent.click(screen.getByRole('menuitem', { name: 'View' }));
    await waitFor(() => expect((globalThis as { __path?: string }).__path).toBe('/employees/e1'));
  });
});
