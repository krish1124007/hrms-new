import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  payrollApi,
  type PayrollCycle,
  type PayrollCycleStatus,
  type PayrollRecord,
} from '@/lib/payroll.api';
import PayrollCycleDetailPage from './PayrollCycleDetailPage';
import PayrollDashboardPage from './PayrollDashboardPage';

// Only the HTTP calls are mocked; the module's constants stay real.
vi.mock('@/lib/payroll.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll.api')>()),
  payrollApi: {
    listCycles: vi.fn(),
    getCycle: vi.fn(),
    createCycle: vi.fn(),
    cycleRecords: vi.fn(),
    processCycle: vi.fn(),
    generatePayslips: vi.fn(),
    lockCycle: vi.fn(),
    markCyclePaid: vi.fn(),
    settleCycle: vi.fn(),
    updateCycleRecord: vi.fn(),
  },
}));

const api = vi.mocked(payrollApi);

const MINUTE = 60 * 1000;

function cycle(status: PayrollCycleStatus, over: Partial<PayrollCycle> = {}): PayrollCycle {
  return {
    _id: 'c1',
    month: 9,
    year: 2026,
    status,
    totalGross: 50000,
    totalDeductions: 5000,
    totalNet: 45000,
    employeeCount: 1,
    createdAt: '2026-10-01T04:00:00.000Z',
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

const record: PayrollRecord = {
  _id: 'r1',
  cycleId: 'c1',
  employeeId: { _id: 'e1', firstName: 'Asha', lastName: 'Rao', employeeId: 'EMP-001' },
  earnings: [],
  deductions: [],
  employerContributions: [],
  grossSalary: 50000,
  totalDeductions: 5000,
  netSalary: 45000,
  workingDays: 26,
  presentDays: 26,
  absentDays: 0,
  lopDays: 0,
  lopAmount: 0,
  overtimeHours: 0,
  overtimeAmount: 0,
  arrears: 0,
  advance: 0,
  expense: 0,
  reimbursements: 0,
  loanDeduction: 0,
  tds: 0,
  manualAdjustments: {
    arrears: null,
    advance: null,
    expense: null,
    reimbursements: null,
    loanDeduction: null,
    tds: null,
  },
  computed: { arrears: 0, advance: 0, expense: 0, reimbursements: 0, loanDeduction: 0, tds: 0 },
  paymentStatus: 'pending',
  bankDetails: {},
  createdAt: '2026-10-01T04:00:00.000Z',
  updatedAt: '2026-10-01T04:00:00.000Z',
};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderDetail(c: PayrollCycle): Promise<void> {
  api.getCycle.mockResolvedValue({ success: true, data: c });
  api.cycleRecords.mockResolvedValue({ success: true, data: [record] });
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/payroll/cycles/c1']}>
        <Routes>
          <Route path="/payroll/cycles/:id" element={<PayrollCycleDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'September 2026 payroll' });
  await screen.findByText('Asha Rao');
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cycle detail: which actions each status allows', () => {
  const cases: Array<{
    label: string;
    cycle: PayrollCycle;
    process: boolean;
    lock: boolean;
    markPaid: boolean;
    settle: boolean;
    edit: boolean;
  }> = [
    { label: 'draft', cycle: cycle('draft'), process: true, lock: false, markPaid: false, settle: false, edit: true },
    {
      label: 'processing (a run in progress)',
      cycle: cycle('processing', { updatedAt: new Date(Date.now() - 2 * MINUTE).toISOString() }),
      process: false,
      lock: false,
      markPaid: false,
      settle: false,
      edit: false,
    },
    {
      label: 'processing (stuck for more than 10 minutes)',
      cycle: cycle('processing', { updatedAt: new Date(Date.now() - 11 * MINUTE).toISOString() }),
      process: true,
      lock: false,
      markPaid: false,
      settle: false,
      edit: false,
    },
    { label: 'processed', cycle: cycle('processed'), process: true, lock: true, markPaid: false, settle: false, edit: true },
    { label: 'locked', cycle: cycle('locked'), process: false, lock: false, markPaid: true, settle: false, edit: false },
    { label: 'paid', cycle: cycle('paid'), process: false, lock: false, markPaid: false, settle: true, edit: false },
  ];

  it.each(cases)('$label', async (c) => {
    await renderDetail(c.cycle);

    const expectEnabled = (el: HTMLElement, on: boolean): void => {
      if (on) expect(el).toBeEnabled();
      else expect(el).toBeDisabled();
    };
    expectEnabled(button('Process'), c.process);
    expectEnabled(button('Lock'), c.lock);
    expectEnabled(button('Mark paid'), c.markPaid);
    if (c.settle) expect(button('Retry settlement')).toBeEnabled();
    else expect(screen.queryByRole('button', { name: 'Retry settlement' })).toBeNull();

    const row = screen.getByText('Asha Rao').closest('tr') as HTMLElement;
    expectEnabled(within(row).getByRole('button', { name: 'Edit adjustments' }), c.edit);

    // The status chip sits beside the title.
    expect(screen.getByTestId('cycle-status')).toHaveTextContent(c.cycle.status);
  });

  it('Process on a draft runs the cycle', async () => {
    api.processCycle.mockResolvedValue({ success: true, data: cycle('processed') });
    await renderDetail(cycle('draft'));

    await userEvent.setup().click(button('Process'));

    await waitFor(() => expect(api.processCycle).toHaveBeenCalledWith('c1'));
  });

  it('Lock on a processed cycle asks first, then locks', async () => {
    api.lockCycle.mockResolvedValue({ success: true, data: cycle('locked') });
    await renderDetail(cycle('processed'));
    const user = userEvent.setup();

    await user.click(button('Lock'));
    // Nothing happens until the dialog naming the period is confirmed.
    expect(api.lockCycle).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Lock September 2026?' })).toBeInTheDocument();
    await user.click(button('Lock September 2026'));

    await waitFor(() => expect(api.lockCycle).toHaveBeenCalledWith('c1'));
  });

  it('Lock does nothing when the confirmation is cancelled', async () => {
    await renderDetail(cycle('processed'));
    const user = userEvent.setup();

    await user.click(button('Lock'));
    await screen.findByRole('heading', { name: 'Lock September 2026?' });
    await user.click(button('Cancel'));

    expect(api.lockCycle).not.toHaveBeenCalled();
  });

  it('Mark paid on a locked cycle takes a payment reference', async () => {
    api.markCyclePaid.mockResolvedValue({
      success: true,
      data: cycle('paid'),
      settlement: { ok: true },
    });
    const user = userEvent.setup();
    await renderDetail(cycle('locked'));

    await user.click(button('Mark paid'));
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/payment reference/i), 'UTR123');
    await user.click(confirm);

    await waitFor(() => expect(api.markCyclePaid).toHaveBeenCalledWith('c1', { paymentRef: 'UTR123' }));
  });

  it('Retry settlement on a paid cycle settles again', async () => {
    api.settleCycle.mockResolvedValue({ success: true, data: { installmentsPaid: 1, claimsReimbursed: 0 } });
    await renderDetail(cycle('paid'));

    await userEvent.setup().click(button('Retry settlement'));

    await waitFor(() => expect(api.settleCycle).toHaveBeenCalledWith('c1'));
  });
});

describe('payroll dashboard: each row offers only what its status allows', () => {
  it('shows Process / Lock / Mark paid per status', async () => {
    api.listCycles.mockResolvedValue({
      success: true,
      data: [
        cycle('processing', { _id: 'c5', month: 5 }),
        cycle('paid', { _id: 'c4', month: 4 }),
        cycle('locked', { _id: 'c3', month: 3 }),
        cycle('processed', { _id: 'c2', month: 2 }),
        cycle('draft', { _id: 'c1', month: 1 }),
      ],
      pagination: { page: 1, limit: 12, total: 5, pages: 1 },
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <PayrollDashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const rowOf = async (period: string): Promise<HTMLElement> =>
      (await screen.findByText(period)).closest('tr') as HTMLElement;
    const actions = (row: HTMLElement): string[] =>
      ['Process', 'Lock', 'Mark paid'].filter((name) => within(row).queryByRole('button', { name }));

    expect(actions(await rowOf('January 2026'))).toEqual(['Process']);
    expect(actions(await rowOf('February 2026'))).toEqual(['Process', 'Lock']);
    expect(actions(await rowOf('March 2026'))).toEqual(['Mark paid']);
    expect(actions(await rowOf('April 2026'))).toEqual([]);
    expect(actions(await rowOf('May 2026'))).toEqual([]);
  });
});
