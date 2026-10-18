import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { payrollApi, type PayrollCycle, type PayrollRecord } from '@/lib/payroll.api';
import { RecordAdjustmentsDialog } from './RecordAdjustmentsDialog';

// Only the HTTP call is mocked; the module's constants stay real.
vi.mock('@/lib/payroll.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payroll.api')>()),
  payrollApi: { updateCycleRecord: vi.fn() },
}));

const update = vi.mocked(payrollApi.updateCycleRecord);

const cycle = (status: PayrollCycle['status']): PayrollCycle => ({
  _id: 'c1',
  month: 9,
  year: 2026,
  status,
  totalGross: 0,
  totalDeductions: 0,
  totalNet: 0,
  employeeCount: 1,
  createdAt: '2026-10-01T04:00:00.000Z',
  updatedAt: '2026-10-01T04:00:00.000Z',
});

const record: PayrollRecord = {
  _id: 'r1',
  cycleId: 'c1',
  employeeId: { _id: 'e1', firstName: 'Asha', lastName: 'Rao', employeeId: 'EMP-001' },
  earnings: [],
  deductions: [],
  employerContributions: [],
  grossSalary: 50500,
  totalDeductions: 5000,
  netSalary: 45500,
  workingDays: 26,
  presentDays: 26,
  absentDays: 0,
  lopDays: 0,
  lopAmount: 0,
  overtimeHours: 0,
  overtimeAmount: 0,
  arrears: 500,
  advance: 0,
  expense: 0,
  reimbursements: 1200,
  loanDeduction: 0,
  tds: 0,
  // HR set arrears; everything else is the computed figure.
  manualAdjustments: {
    arrears: 500,
    advance: null,
    expense: null,
    reimbursements: null,
    loanDeduction: null,
    tds: null,
    note: 'Back pay for August',
  },
  computed: { arrears: 0, advance: 0, expense: 0, reimbursements: 1200, loanDeduction: 0, tds: 0 },
  paymentStatus: 'pending',
  bankDetails: {},
  createdAt: '2026-10-01T04:00:00.000Z',
  updatedAt: '2026-10-01T04:00:00.000Z',
};

function renderDialog(status: PayrollCycle['status'] = 'processed', onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RecordAdjustmentsDialog record={record} cycle={cycle(status)} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('RecordAdjustmentsDialog', () => {
  // A block body: a function returned from beforeEach would run as a cleanup hook.
  beforeEach(() => {
    update.mockReset();
  });

  it('starts from the overrides, showing the computed figure behind each field', () => {
    renderDialog();
    expect(screen.getByLabelText('Arrears')).toHaveValue(500);
    // Not overridden: empty, with the computed figure as the hint.
    expect(screen.getByLabelText('Reimbursements')).toHaveValue(null);
    expect(screen.getByLabelText('Reimbursements')).toHaveAttribute('placeholder', expect.stringContaining('1,200'));
    expect(screen.getByLabelText('Note')).toHaveValue('Back pay for August');
    expect(screen.queryByLabelText(/overtime/i)).toBeNull();
    expect(screen.getByTestId('cycle-status')).toHaveTextContent('processed');
  });

  it('sends only the fields that changed; an emptied field is null (back to computed), never ""', async () => {
    update.mockResolvedValue({ success: true, data: record });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.clear(screen.getByLabelText('Arrears'));
    await user.type(screen.getByLabelText('Advance'), '1000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('c1', 'r1', { arrears: null, advance: 1000 }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('"Use computed" clears an override', async () => {
    update.mockResolvedValue({ success: true, data: record });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Use computed arrears' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', 'r1', { arrears: null }));
  });

  it('a cleared note is sent as null', async () => {
    update.mockResolvedValue({ success: true, data: record });
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Note'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', 'r1', { note: null }));
  });

  it('nothing changed: Save is disabled', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('rejects a negative amount without calling the API', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('TDS'), '-5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/cannot be negative/i)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows the ITEM_HELD conflict in the dialog and keeps it open', async () => {
    update.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: {
            code: 'ITEM_HELD',
            message: 'Expense claim EXP-12 is held by the August 2026 cycle until it is paid',
          },
        },
      },
    });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.type(screen.getByLabelText('Reimbursements'), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/held by the August 2026 cycle/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a locked cycle is read-only', () => {
    renderDialog('locked');
    expect(screen.getByLabelText('Arrears')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
