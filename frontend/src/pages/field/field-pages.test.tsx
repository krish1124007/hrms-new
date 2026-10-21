import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  fieldApi,
  type FieldVisit,
  type PaymentCollection,
  type ProductOrder,
} from '@/lib/field.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import { useAuthStore } from '@/stores/auth.store';
import CollectionsPage from './CollectionsPage';
import OrdersPage from './OrdersPage';
import VisitsPage from './VisitsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

// Leaflet needs a real layout engine; none of these tests looks at a map.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), getContainer: () => document.createElement('div'), invalidateSize: vi.fn() }),
}));

vi.mock('@/lib/field.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field.api')>();
  return {
    ...actual,
    fieldApi: {
      ...actual.fieldApi,
      listVisits: vi.fn(),
      todayVisits: vi.fn(),
      listPayments: vi.fn(),
      paymentsDaily: vi.fn(),
      paymentsOutstanding: vi.fn(),
      takeBackBounce: vi.fn(),
      listOrders: vi.fn(),
      getOrder: vi.fn(),
      orderReports: vi.fn(),
    },
  };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const api = vi.mocked(fieldApi);
const PAGE = { page: 1, limit: 20, total: 1, pages: 1 };

function signIn(permissions: string[], employeeId: string): void {
  useAuthStore.getState().setSession({
    user: { _id: `u-${employeeId}`, email: 'me@example.com', role: { slug: 'x', name: 'X', permissions } },
  });
  vi.mocked(selfApi.profile).mockResolvedValue({ success: true, data: { _id: employeeId } } as never);
}

function renderWithApp(ui: ReactNode): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  useAuthStore.getState().clear();
});

/* ── Visits ── */

const visit: FieldVisit = {
  _id: 'v1',
  employeeId: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar' },
  clientId: { _id: 'c1', name: 'Acme Traders' },
  purpose: 'sales',
  checkIn: { time: '2026-10-21T04:30:00.000Z' },
  checkOut: { time: '2026-10-21T05:15:00.000Z', notes: 'Asked for a quote on 40 units' },
  locationMissing: true,
  duration: 45,
  notes: 'Met the purchase manager',
  outcome: 'positive',
  photos: [],
  productsDiscussed: [],
  isPlanned: false,
  status: 'completed',
  createdAt: '2026-10-21T04:30:00.000Z',
  updatedAt: '2026-10-21T05:15:00.000Z',
};

describe('VisitsPage', () => {
  beforeEach(() => {
    signIn(['field-sales.view'], 'e1');
    api.listVisits.mockResolvedValue({ success: true, data: [visit], pagination: PAGE });
    api.todayVisits.mockResolvedValue({ success: true, data: [] });
  });

  it('shows the check-in and the check-out notes, and flags a check-in without GPS', async () => {
    renderWithApp(<VisitsPage />);
    const row = (await screen.findByText('Acme Traders')).closest('tr') as HTMLElement;
    expect(within(row).getByText('No GPS')).toBeInTheDocument();
    expect(within(row).getByText('Met the purchase manager')).toBeInTheDocument();
    expect(within(row).getByText('Asked for a quote on 40 units')).toBeInTheDocument();
    expect(within(row).getByText('In:')).toBeInTheDocument();
    expect(within(row).getByText('Out:')).toBeInTheDocument();
  });

  it('keeps Check in disabled while the browser is still finding the location', async () => {
    // A geolocation request that never answers: still locating.
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const user = userEvent.setup();
    renderWithApp(<VisitsPage />);
    await screen.findByText('Acme Traders');

    await user.click(screen.getByRole('button', { name: 'Check in' }));
    const dialog = await screen.findByRole('dialog', { name: /check in at a client/i });
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /locating/i })).toBeDisabled();
  });
});

/* ── Collections ── */

const payment = (over: Partial<PaymentCollection>): PaymentCollection => ({
  _id: 'p1',
  receiptNumber: 'RCPT-2026-00001',
  employeeId: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar' },
  clientId: { _id: 'c1', name: 'Acme Traders' },
  amount: 5000,
  method: 'cheque',
  collectedAt: '2026-10-21T05:00:00.000Z',
  status: 'collected',
  createdAt: '2026-10-21T05:00:00.000Z',
  ...over,
});

function conflict(message: string): AxiosError {
  return new AxiosError('Request failed with status code 400', AxiosError.ERR_BAD_REQUEST, undefined, null, {
    status: 400,
    statusText: 'Bad Request',
    data: { success: false, error: { code: 'OVERPAYMENT', message } },
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  } as AxiosResponse);
}

describe('CollectionsPage', () => {
  beforeEach(() => {
    api.paymentsDaily.mockResolvedValue({ success: true, data: { date: '2026-10-21', byMethod: [], totals: { count: 0, total: 0 } } });
    api.paymentsOutstanding.mockResolvedValue({ success: true, data: { total: 0, clients: [] } });
  });

  it('lets a field manager take a bounce back, and shows the refusal once when the order has no room', async () => {
    signIn(['field-sales.view', 'field-sales.manage'], 'm1');
    api.listPayments.mockResolvedValue({ success: true, data: [payment({ status: 'bounced' })], pagination: PAGE });
    api.takeBackBounce.mockRejectedValue(conflict('This change would take the order past its total'));
    const user = userEvent.setup();
    renderWithApp(<CollectionsPage />);

    const row = (await screen.findByText('RCPT-2026-00001')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Verify' })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: 'Take back bounce' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Take back bounce' }));

    await waitFor(() => expect(api.takeBackBounce).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('This change would take the order past its total');
  });

  it('offers a rep "Mark deposited" only once a manager has verified the payment', async () => {
    signIn(['field-sales.view'], 'e1');
    api.listPayments.mockResolvedValue({
      success: true,
      data: [
        payment({ _id: 'p1', receiptNumber: 'RCPT-1', status: 'collected' }),
        payment({ _id: 'p2', receiptNumber: 'RCPT-2', status: 'verified' }),
      ],
      pagination: PAGE,
    });
    const user = userEvent.setup();
    renderWithApp(<CollectionsPage />);

    const collected = (await screen.findByText('RCPT-1')).closest('tr') as HTMLElement;
    expect(within(collected).queryByRole('button', { name: 'More actions' })).toBeNull();
    const verified = screen.getByText('RCPT-2').closest('tr') as HTMLElement;
    await user.click(within(verified).getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Mark deposited']);
  });

  it('shows "Couldn\'t load" instead of ₹0 when today\'s totals fail', async () => {
    signIn(['field-sales.view'], 'e1');
    api.listPayments.mockResolvedValue({ success: true, data: [], pagination: { ...PAGE, total: 0 } });
    api.paymentsDaily.mockRejectedValue(conflict('Not allowed')); // a 4xx: no retries
    renderWithApp(<CollectionsPage />);
    expect(await screen.findAllByText("Couldn't load")).toHaveLength(2);
  });
});

/* ── Orders ── */

const order = (over: Partial<ProductOrder>): ProductOrder => ({
  _id: 'o1',
  orderNumber: 'ORD-2026-00001',
  employeeId: { _id: 'm1', firstName: 'Meera', lastName: 'Shah' },
  clientId: { _id: 'c1', name: 'Acme Traders' },
  items: [],
  subtotal: 1000,
  taxAmount: 180,
  totalAmount: 1180,
  status: 'pending',
  paymentStatus: 'pending',
  paidAmount: 0,
  createdAt: '2026-10-21T05:00:00.000Z',
  ...over,
});

describe('OrdersPage', () => {
  it("never offers a manager Confirm on their own order, nor Delete once it has payments", async () => {
    signIn(['field-sales.view', 'field-sales.manage'], 'm1');
    const own = order({ paymentStatus: 'partial', paidAmount: 500 });
    api.listOrders.mockResolvedValue({ success: true, data: [own], pagination: PAGE });
    api.getOrder.mockResolvedValue({ success: true, data: own });
    api.orderReports.mockResolvedValue({
      success: true,
      data: { from: '', to: '', byStatus: [], totals: { count: 1, total: 1180, paid: 500 } },
    });
    const user = userEvent.setup();
    renderWithApp(<OrdersPage />);

    await user.click(await screen.findByRole('button', { name: 'View order ORD-2026-00001' }));
    const dialog = await screen.findByRole('dialog', { name: /order ORD-2026-00001/i });
    await within(dialog).findByText('Acme Traders');
    expect(within(dialog).queryByRole('button', { name: /confirm/i })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /delete/i })).toBeNull();
    expect(within(dialog).getByRole('button', { name: /cancel order/i })).toBeInTheDocument();
  });
});
