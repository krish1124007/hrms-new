import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeLegacyStorage } from '@/lib/legacy-storage';
import EmployeeFormPage from './EmployeeFormPage';

const createMutate = vi.fn();

vi.mock('@/hooks/use-systemcore', () => ({
  useDepartments: () => ({ data: { data: [] } }),
  useDesignations: () => ({ data: { data: [] } }),
  useShifts: () => ({ data: { data: [] } }),
  useEmployee: () => ({ data: undefined }),
  useCreateEmployee: () => ({ mutate: createMutate, isPending: false }),
  useUpdateEmployee: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-payroll', () => ({ useSalaryStructures: () => ({ data: undefined }) }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ has: () => false }) }));
vi.mock('@/hooks/use-employee-picker', () => ({ useActiveEmployees: () => ({ data: [] }) }));

const DRAFT_KEY = 'opencore.employee.draft';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/employees/new']}>
        <Routes>
          <Route path="/employees/new" element={<EmployeeFormPage />} />
          <Route path="/employees" element={<p>Employee list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const draft = (): Record<string, unknown> => JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}');

describe('EmployeeFormPage draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('autosaves the form but never the password', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('First name *'), 'Asha');
    await user.type(screen.getByLabelText('Login password'), 'Secret123!');

    await waitFor(() => expect(draft().firstName).toBe('Asha'));
    expect(draft()).not.toHaveProperty('password');
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toContain('Secret123!');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('drops an old full-form draft and restores none of its secrets', async () => {
    const legacy = JSON.stringify({
      firstName: 'Ravi',
      password: 'Secret123!',
      accountNumber: '1234567890',
      ifscCode: 'EXMP0000001',
      panNumber: 'ABCDE1234F',
      basic: 50000,
    });
    localStorage.setItem(DRAFT_KEY, legacy);
    sessionStorage.setItem(DRAFT_KEY, legacy);

    // App start-up (`main.tsx`) purges the localStorage copy once.
    purgeLegacyStorage();
    renderPage();

    expect(await screen.findByDisplayValue('Ravi')).toBeInTheDocument();
    expect(screen.getByText(/Restored your unsaved form/)).toBeInTheDocument();
    expect(screen.getByLabelText('Login password')).toHaveValue('');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    await waitFor(() => expect(sessionStorage.getItem(DRAFT_KEY) ?? '').not.toContain('1234567890'));
  });

  it('"Discard draft" leaves no draft behind — not even an empty one', async () => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ firstName: 'Ravi' }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByDisplayValue('Ravi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /discard draft/i }));

    await waitFor(() => expect(screen.queryByDisplayValue('Ravi')).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('says why Next does not move on', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('First name *'), 'Asha');
    await user.type(screen.getByLabelText('Email *'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText('Enter a valid e-mail address')).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
    // Still on step 1.
    expect(screen.getByLabelText('First name *')).toBeInTheDocument();
  });

  it('clears the draft once the employee is created', async () => {
    createMutate.mockImplementation((_input, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('First name *'), 'Asha');
    await user.type(screen.getByLabelText('Last name *'), 'Rao');
    await user.type(screen.getByLabelText('Email *'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.type(await screen.findByLabelText('Joining date *'), '2026-10-15');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(await screen.findByRole('button', { name: /create employee/i }));

    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(await screen.findByText('Employee list')).toBeInTheDocument();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
