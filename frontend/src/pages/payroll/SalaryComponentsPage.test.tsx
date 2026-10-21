import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payrollApi, type SalaryComponent } from '@/lib/payroll.api';
import SalaryComponentsPage from './SalaryComponentsPage';

vi.mock('@/lib/payroll.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll.api')>()),
  payrollApi: {
    listComponents: vi.fn(),
    createComponent: vi.fn(),
    updateComponent: vi.fn(),
    deleteComponent: vi.fn(),
  },
}));

const api = vi.mocked(payrollApi);

const page = { page: 1, limit: 200, total: 1, pages: 1 };

const component = (over: Partial<SalaryComponent> & { statutoryBase?: string | null }): SalaryComponent =>
  ({
    _id: 'c1',
    name: 'Special Allowance',
    code: 'SPL',
    type: 'earning',
    calculationType: 'fixed',
    defaultValue: 1000,
    isTaxable: true,
    isStatutory: false,
    order: 1,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }) as SalaryComponent;

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SalaryComponentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.updateComponent.mockImplementation(async (id) => ({ success: true, data: component({ _id: id }) }));
  api.createComponent.mockImplementation(async (input) => ({ success: true, data: component(input) }));
});

describe('SalaryComponentsPage — PF wage (statutoryBase)', () => {
  it('offers Auto (by name), Basic, DA and Excluded from PF wage, with a per-component explanation', async () => {
    api.listComponents.mockResolvedValue({ success: true, data: [component({})], pagination: page });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit component Special Allowance' }));

    const select = screen.getByLabelText('PF wage');
    expect(within(select).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent])).toEqual([
      ['', 'Auto (by name)'],
      ['basic', 'Basic'],
      ['da', 'DA'],
      ['none', 'Excluded from PF wage'],
    ]);
    expect(select).toHaveAccessibleDescription(/decided for this component alone/i);
    expect(screen.queryByText(/only.*flagged/i)).not.toBeInTheDocument();
  });

  it("round-trips 'none': shown as Excluded, saved back unchanged, and Auto saves null", async () => {
    api.listComponents.mockResolvedValue({ success: true, data: [component({ statutoryBase: 'none' })], pagination: page });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit component Special Allowance' }));

    const select = screen.getByLabelText<HTMLSelectElement>('PF wage');
    expect(select.value).toBe('none');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateComponent).toHaveBeenCalledTimes(1));
    expect(api.updateComponent.mock.calls[0][1]).toMatchObject({ statutoryBase: 'none' });

    await user.click(await screen.findByRole('button', { name: 'Edit component Special Allowance' }));
    await user.selectOptions(screen.getByLabelText('PF wage'), 'Auto (by name)');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateComponent).toHaveBeenCalledTimes(2));
    expect(api.updateComponent.mock.calls[1][1]).toMatchObject({ statutoryBase: null });
  });

  it('creates a DA component flagged DA', async () => {
    api.listComponents.mockResolvedValue({ success: true, data: [], pagination: { ...page, total: 0 } });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /new component/i }));
    await user.type(screen.getByLabelText('Name *'), 'Dearness Allowance');
    await user.type(screen.getByLabelText('Code *'), 'DA');
    await user.selectOptions(screen.getByLabelText('PF wage'), 'DA');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.createComponent).toHaveBeenCalledTimes(1));
    expect(api.createComponent.mock.calls[0][0]).toMatchObject({ name: 'Dearness Allowance', statutoryBase: 'da' });
  });
});
