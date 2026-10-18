import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi, type Attendance } from '@/lib/attendance.api';
import RegularizationsPage from './RegularizationsPage';

vi.mock('@/lib/attendance.api', () => ({
  attendanceApi: {
    listRegularizations: vi.fn(),
    decideRegularization: vi.fn(),
  },
}));

const list = vi.mocked(attendanceApi.listRegularizations);
const decide = vi.mocked(attendanceApi.decideRegularization);

function row(over: Partial<Attendance> & Pick<Attendance, '_id'>): Attendance {
  return {
    employeeId: { _id: 'e1', firstName: 'Asha', lastName: 'Rao', employeeId: 'EMP-001' },
    date: '2026-10-15T00:00:00.000Z',
    breaks: [],
    totalWorkingHours: 0,
    overtimeHours: 0,
    status: 'absent',
    lateBy: 0,
    earlyLeaveBy: 0,
    isRegularized: false,
    createdAt: '2026-10-15T18:30:00.000Z',
    updatedAt: '2026-10-16T04:00:00.000Z',
    ...over,
  };
}

const withTimes = row({
  _id: 'att-1',
  regularization: {
    requestedAt: '2026-10-16T04:00:00.000Z',
    reason: 'Biometric was down',
    status: 'pending',
    requestedCheckIn: '2026-10-15T03:30:00.000Z',
    requestedCheckOut: '2026-10-15T12:30:00.000Z',
  },
});

const reasonOnly = row({
  _id: 'att-2',
  employeeId: { _id: 'e2', firstName: 'Vikram', lastName: 'Shah', employeeId: 'EMP-002' },
  regularization: {
    requestedAt: '2026-10-16T05:00:00.000Z',
    reason: 'Client visit all day',
    status: 'pending',
  },
});

function page(data: Attendance[]) {
  return { success: true, data, pagination: { page: 1, limit: 20, total: data.length, pages: 1 } };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/attendance/regularizations']}>
        <RegularizationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RegularizationsPage', () => {
  beforeEach(() => {
    list.mockReset();
    decide.mockReset();
  });

  it('lists the pending queue: who, which day, the punches asked for and the reason', async () => {
    list.mockResolvedValue(page([withTimes, reasonOnly]));

    renderPage();

    const asha = (await screen.findByText('Asha Rao')).closest('tr') as HTMLElement;
    expect(within(asha).getByText('EMP-001')).toBeInTheDocument();
    expect(within(asha).getByText('Biometric was down')).toBeInTheDocument();
    expect(within(asha).getByText(/^in /i)).toBeInTheDocument();
    expect(within(asha).getByText(/^out /i)).toBeInTheDocument();

    const vikram = screen.getByText('Vikram Shah').closest('tr') as HTMLElement;
    expect(within(vikram).getByText(/reason only/i)).toBeInTheDocument();
    expect(within(vikram).getByText('Client visit all day')).toBeInTheDocument();

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1 }));
  });

  it('approve sends that row to the API and reloads the queue', async () => {
    list.mockResolvedValueOnce(page([withTimes, reasonOnly])).mockResolvedValue(page([reasonOnly]));
    decide.mockResolvedValue({ success: true, data: withTimes });
    const user = userEvent.setup();

    renderPage();
    const asha = (await screen.findByText('Asha Rao')).closest('tr') as HTMLElement;
    await user.click(within(asha).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith('att-1', 'approved'));
    expect(decide).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Asha Rao')).toBeNull());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('reject sends rejected for that row', async () => {
    list.mockResolvedValue(page([withTimes, reasonOnly]));
    decide.mockResolvedValue({ success: true, data: reasonOnly });
    const user = userEvent.setup();

    renderPage();
    const vikram = (await screen.findByText('Vikram Shah')).closest('tr') as HTMLElement;
    await user.click(within(vikram).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(decide).toHaveBeenCalledWith('att-2', 'rejected'));
  });

  it('a request decided meanwhile (409) reloads the queue instead of leaving a stale row', async () => {
    list.mockResolvedValueOnce(page([withTimes])).mockResolvedValue(page([]));
    decide.mockRejectedValue({
      response: { status: 409, data: { error: { code: 'DECIDED_MEANWHILE', message: 'decided meanwhile' } } },
    });
    const user = userEvent.setup();

    renderPage();
    const asha = (await screen.findByText('Asha Rao')).closest('tr') as HTMLElement;
    await user.click(within(asha).getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no regularization requests/i)).toBeInTheDocument();
  });

  it('the decided tabs ask for that status and offer no actions', async () => {
    list.mockResolvedValue(page([withTimes, reasonOnly]));
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Asha Rao');
    list.mockResolvedValue(
      page([
        { ...withTimes, regularization: { ...withTimes.regularization!, status: 'approved' } },
      ]),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'approved');

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'approved', page: 1 })),
    );
    await waitFor(() => expect(screen.queryByText('Vikram Shah')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});
