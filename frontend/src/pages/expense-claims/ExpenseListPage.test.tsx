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
    points: [
      { lat: 19.0, lng: 72.8, at: '2026-10-22T03:30:00.000Z', kind: 'day_in' },
      { lat: 19.03, lng: 72.84, at: '2026-10-22T04:30:00.000Z', kind: 'visit_in', siteName: 'Acme Plant' },
      { lat: 19.031, lng: 72.841, at: '2026-10-22T05:30:00.000Z', kind: 'visit_out', siteName: 'Acme Plant' },
      { lat: 19.2, lng: 72.95, at: '2026-10-22T07:00:00.000Z', kind: 'visit_in', siteName: 'Depot 4' },
      { lat: 19.1, lng: 72.9, at: '2026-10-22T12:00:00.000Z', kind: 'day_out' },
    ],
    legs: [
      { fromIndex: 0, toIndex: 1, distanceM: 12_000, estimated: false },
      { fromIndex: 2, toIndex: 3, distanceM: 20_300, estimated: true },
      { fromIndex: 3, toIndex: 4, distanceM: 10_000, estimated: false },
    ],
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
      data: [{ ...travelClaim, visitId: 'v7' }],
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
    expect(value('Route')).toContain('Acme Plant → Depot 4');
    expect(value('Route')).toContain('5 points, 3 legs');

    const visit = screen.getByRole('link', { name: 'View visit' });
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
    // What the approver weighs: calculated vs claimed km, the estimate flag, vehicle, rate and reason.
    expect(breakdown).toHaveTextContent('42.3 km');
    expect(breakdown).toHaveTextContent('50.0 km');
    expect(breakdown).toHaveTextContent('Estimated');
    expect(breakdown).toHaveTextContent('Two-wheeler');
    expect(breakdown).toHaveTextContent('₹5 / km');
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
