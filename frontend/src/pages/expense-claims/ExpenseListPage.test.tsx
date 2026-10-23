import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expenseClaimsApi, type ExpenseClaim } from '@/lib/expense-claims.api';
import { createAppQueryClient } from '@/lib/query-client';
import ExpenseListPage from './ExpenseListPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));

vi.mock('@/lib/expense-claims.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/expense-claims.api')>();
  return { ...actual, expenseClaimsApi: { ...actual.expenseClaimsApi, list: vi.fn() } };
});

const list = vi.mocked(expenseClaimsApi.list);

const base: ExpenseClaim = {
  _id: 'c1',
  employeeId: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-1' },
  category: { _id: 'cat-ta', name: 'Travel allowance', code: 'TA' },
  amount: 250,
  currency: 'INR',
  date: '2026-10-22T00:00:00.000Z',
  receiptUrls: [],
  status: 'pending',
  createdAt: '2026-10-22T13:00:00.000Z',
  updatedAt: '2026-10-22T13:00:00.000Z',
};

const travelClaim: ExpenseClaim = {
  ...base,
  travel: {
    date: '2026-10-22',
    vehicleType: 'bike',
    ratePerKm: 5,
    computedKm: 42.3,
    claimedKm: 50,
    estimated: true,
    reason: 'Road closed, took the bypass',
  },
};

function renderPage(): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <ExpenseListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExpenseListPage — travel allowance', () => {
  it('shows the travel breakdown in the claim details', async () => {
    list.mockResolvedValue({
      success: true,
      data: [{ ...travelClaim, visitId: { _id: 'v7', site: { _id: 's1', name: 'Acme Plant' } } }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    } as never);
    renderPage();
    // The row already says how far.
    expect(await screen.findByText(/50 km · Two-wheeler/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /details/i }));
    const breakdown = await screen.findByTestId('travel-breakdown');
    const value = (label: string): string =>
      within(breakdown).getByText(label).nextElementSibling?.textContent ?? '';
    expect(value('Calculated')).toContain('42.3 km');
    expect(value('Calculated')).toContain('Estimated');
    expect(value('Claimed')).toContain('50.0 km');
    expect(value('Claimed')).toContain('+18 %');
    expect(value('Rate')).toContain('₹5 / km');
    expect(value('Vehicle')).toBe('Two-wheeler');
    expect(value('Reason')).toBe('Road closed, took the bypass');
    expect(value('Amount')).toContain('₹250');

    const visit = screen.getByRole('link', { name: /Acme Plant/ });
    expect(visit).toHaveAttribute('href', '/field/visits/v7');
  });

  it('shows the breakdown when approving a travel claim', async () => {
    list.mockResolvedValue({
      success: true,
      data: [travelClaim],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    } as never);
    renderPage();
    await screen.findByText(/50 km · Two-wheeler/);
    await userEvent.click(screen.getByTitle('Approve'));
    const breakdown = await screen.findByTestId('travel-breakdown');
    expect(breakdown).toHaveTextContent('42.3 km');
    expect(breakdown).toHaveTextContent('Road closed, took the bypass');
  });

  it('leaves ordinary claims as they were', async () => {
    list.mockResolvedValue({
      success: true,
      data: [{ ...base, category: { _id: 'cat-food', name: 'Food', code: 'FOOD' } }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    } as never);
    renderPage();
    await screen.findByText('Food');
    await userEvent.click(screen.getByRole('button', { name: /details/i }));
    expect(await screen.findByText('Expense claim')).toBeInTheDocument();
    expect(screen.queryByTestId('travel-breakdown')).not.toBeInTheDocument();
  });
});
