import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth.api';
import { employeesApi, type Employee } from '@/lib/systemcore.api';
import { useAuthStore } from '@/stores/auth.store';
import { CommandPalette } from './CommandPalette';

vi.mock('@/lib/systemcore.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/systemcore.api')>()),
  employeesApi: { list: vi.fn() },
}));

const list = vi.mocked(employeesApi.list);

/** The seeded Employee role (backend `role.model.ts`). */
const employee: AuthUser = {
  _id: 'u-emp',
  email: 'asha@example.com',
  role: {
    slug: 'employee',
    name: 'Employee',
    permissions: [
      'attendance.checkin',
      'leaves.view',
      'leaves.create',
      'expenses.view',
      'expenses.create',
      'payroll.view',
      'policies.view',
      'holidays.view',
    ],
  },
};

const hr: AuthUser = {
  _id: 'u-hr',
  email: 'hr@example.com',
  role: { slug: 'hr_executive', name: 'HR Executive', permissions: ['employees.view', 'leaves.approve'] },
};

function LocationProbe(): null {
  const location = useLocation();
  (globalThis as { __path?: string }).__path = location.pathname;
  return null;
}

function renderPalette(user: AuthUser) {
  useAuthStore.setState({ user, isAuthenticated: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationProbe />
                <CommandPalette open onOpenChange={() => undefined} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const destinations = (): Array<string | null> =>
  screen.getAllByRole('option').map((el) => el.getAttribute('data-to'));

beforeAll(() => {
  // cmdk scrolls the selected item into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({
    success: true,
    data: [
      {
        _id: 'e1',
        employeeId: 'EMP-001',
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha.rao@example.com',
      } as Employee,
    ],
    pagination: { page: 1, limit: 5, total: 1, pages: 1 },
  });
});

describe('CommandPalette', () => {
  it('shows an employee only the pages they can open, each with a real destination', () => {
    renderPalette(employee);

    const tos = destinations();
    expect(tos.length).toBeGreaterThan(0);
    for (const to of tos) expect(to).toMatch(/^\/[a-z]/);

    expect(tos).toContain('/leaves');
    expect(tos).toContain('/payroll/my-payslips');
    for (const forbidden of ['/payroll', '/payroll/components', '/settings/roles', '/backups', '/employees']) {
      expect(tos).not.toContain(forbidden);
    }
    expect(document.body.textContent).not.toMatch(/Priya Sharma|Acme|Project Atlas/);
  });

  it('never searches people for a user without employees.view', async () => {
    renderPalette(employee);
    await userEvent.type(screen.getByRole('combobox'), 'asha');
    await new Promise((r) => setTimeout(r, 400));
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
  });

  it('finds employees through the API for employees.view holders and opens their profile', async () => {
    renderPalette(hr);
    await userEvent.type(screen.getByRole('combobox'), 'asha');

    const person = await screen.findByRole('option', { name: /Asha Rao/ });
    expect(person).toHaveAttribute('data-to', '/employees/e1');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ search: 'asha' }));

    await userEvent.click(person);
    await waitFor(() => expect((globalThis as { __path?: string }).__path).toBe('/employees/e1'));
  });
});
