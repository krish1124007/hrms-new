import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/axios';
import { disciplinaryApi, type DisciplinaryAction } from '@/lib/disciplinary.api';
import { employeesApi, type Employee } from '@/lib/systemcore.api';
import { useAuthStore } from '@/stores/auth.store';
import DisciplinaryDetailPage from './DisciplinaryDetailPage';

vi.mock('@/lib/disciplinary.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/disciplinary.api')>()),
  disciplinaryApi: { get: vi.fn(), escalate: vi.fn() },
}));
vi.mock('@/lib/systemcore.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemcore.api')>();
  return { ...actual, employeesApi: { ...actual.employeesApi, list: vi.fn() } };
});

const getCase = vi.mocked(disciplinaryApi.get);
const escalate = vi.mocked(disciplinaryApi.escalate);
const listEmployees = vi.mocked(employeesApi.list);

const theCase = {
  _id: 'd1',
  caseNumber: 'DISC-2026-0001',
  employee: { _id: 'e9', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-009' },
  type: 'written_warning',
  severity: 'medium',
  status: 'open',
  title: 'Repeated late arrival',
  description: 'Late five times this month.',
  issuedAt: '2026-10-20T05:00:00.000Z',
  issuedBy: { _id: 'u-hr', firstName: 'Hema', lastName: 'R' },
  confidential: false,
  attachments: [],
  comments: [],
  createdAt: '2026-10-20T05:00:00.000Z',
  updatedAt: '2026-10-20T05:00:00.000Z',
} as unknown as DisciplinaryAction;

const employee = (over: Partial<Employee>): Employee =>
  ({ _id: 'e', employeeId: 'EMP', firstName: 'A', lastName: 'B', email: 'a@b.c', status: 'active', ...over }) as Employee;

beforeEach(() => {
  vi.clearAllMocks();
  // An HR manager: manages cases, may read the employee list — but not GET /users.
  useAuthStore.getState().setSession({
    user: {
      _id: 'u-hr',
      email: 'hr@example.com',
      role: { slug: 'hr_manager', name: 'HR Manager', permissions: ['disciplinary.manage', 'disciplinary.view', 'employees.view'] },
    },
  });
  getCase.mockResolvedValue({ success: true, data: theCase });
  escalate.mockResolvedValue({ success: true, data: { ...theCase, status: 'escalated' } });
  listEmployees.mockImplementation(async (params) => ({
    success: true,
    data:
      params?.status === 'active'
        ? [
            employee({ _id: 'e1', employeeId: 'EMP-001', firstName: 'Meera', lastName: 'Shah', userId: 'u-meera' }),
            // No login of their own: cannot be escalated to.
            employee({ _id: 'e2', employeeId: 'EMP-002', firstName: 'Nobody', lastName: 'Login', userId: null }),
            employee({
              _id: 'e3',
              employeeId: 'EMP-003',
              firstName: 'Arjun',
              lastName: 'Patel',
              userId: { _id: 'u-arjun', email: 'arjun@example.com', status: 'active' },
            }),
          ]
        : [],
    pagination: { page: 1, limit: 100, total: 3, pages: 1 },
  }));
});

afterEach(() => {
  useAuthStore.getState().clear();
  vi.restoreAllMocks();
});

describe('DisciplinaryDetailPage — escalation', () => {
  it('offers current employees who can sign in and escalates to their user account, never calling GET /users', async () => {
    const apiGet = vi.spyOn(api, 'get');
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/disciplinary/d1']}>
          <Routes>
            <Route path="/disciplinary/:id" element={<DisciplinaryDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /escalate/i }));

    const select = await screen.findByLabelText('Escalate to *');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select a person',
      'Arjun Patel (EMP-003)',
      'Meera Shah (EMP-001)',
    ]);

    await user.selectOptions(select, 'Meera Shah (EMP-001)');
    await user.type(screen.getByLabelText('Reason *'), 'Needs a senior review');
    const dialog = screen.getByRole('dialog', { name: 'Escalate case' });
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));

    await waitFor(() => expect(escalate).toHaveBeenCalledTimes(1));
    expect(escalate.mock.calls[0][1]).toEqual({ escalatedTo: 'u-meera', reason: 'Needs a senior review' });
    expect(apiGet.mock.calls.some(([url]) => String(url).startsWith('/users'))).toBe(false);
  });
});
