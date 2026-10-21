import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldApi, type FieldClient, type Product } from '@/lib/field.api';
import { priceOrder } from '@/lib/order-pricing';
import { OrderForm } from './OrderForm';

vi.mock('@/lib/field.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field.api')>();
  return {
    ...actual,
    fieldApi: {
      ...actual.fieldApi,
      listProducts: vi.fn(),
      listClients: vi.fn(),
      createOrder: vi.fn(),
    },
  };
});

const listProducts = vi.mocked(fieldApi.listProducts);
const listClients = vi.mocked(fieldApi.listClients);
const createOrder = vi.mocked(fieldApi.createOrder);

const product = (p: Partial<Product> & Pick<Product, '_id' | 'name' | 'sku' | 'price' | 'gstRate'>): Product => ({
  category: 'General',
  unit: 'pcs',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...p,
});

// The Task 4 example: 1000 @ 18% × 2, and 500 @ 5% × 1 with a 10% discount.
const widget = product({ _id: 'p1', name: 'Widget', sku: 'WID-1', price: 1000, gstRate: 18 });
const gadget = product({ _id: 'p2', name: 'Gadget', sku: 'GAD-1', price: 500, gstRate: 5 });

const client: FieldClient = {
  _id: 'c1',
  name: 'Acme Traders',
  category: 'A',
  tags: [],
  totalOrders: 0,
  totalPayments: 0,
  outstandingAmount: 0,
  notes: [],
  status: 'active',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function renderForm(onDone = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OrderForm onDone={onDone} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return { onDone };
}

beforeEach(() => {
  vi.clearAllMocks();
  listProducts.mockResolvedValue({
    success: true,
    data: [widget, gadget],
    pagination: { page: 1, limit: 50, total: 2, pages: 1 },
  });
  listClients.mockResolvedValue({
    success: true,
    data: [client],
    pagination: { page: 1, limit: 50, total: 1, pages: 1 },
  });
  createOrder.mockImplementation(async (input) => ({
    success: true,
    data: {
      _id: 'o1',
      orderNumber: 'ORD-2026-00001',
      employeeId: 'e1',
      clientId: input.clientId,
      items: [],
      subtotal: 2450,
      taxAmount: 382.5,
      totalAmount: 2832.5,
      status: 'pending',
      paymentStatus: 'pending',
      paidAmount: 0,
      createdAt: '2026-10-21T06:00:00.000Z',
    },
  }));
});

describe('priceOrder (mirror of the backend formula)', () => {
  it('prices the Task 4 example to 2450 / 382.5 / 2832.5', () => {
    const r = priceOrder([
      { unitPrice: 1000, gstRate: 18, quantity: 2, discountPercent: 0 },
      { unitPrice: 500, gstRate: 5, quantity: 1, discountPercent: 10 },
    ]);
    expect(r.subtotal).toBe(2450);
    expect(r.gstTotal).toBe(382.5);
    expect(r.total).toBe(2832.5);
    expect(r.discountTotal).toBe(50);
    expect(r.lines.map((l) => l.lineTotal)).toEqual([2360, 472.5]);
  });

  it('rounds each step to paise like the server', () => {
    // 3 × 33.33 = 99.99; −7.5% → 92.49; 18% GST → 16.65; line 109.14
    const r = priceOrder([{ unitPrice: 33.33, gstRate: 18, quantity: 3, discountPercent: 7.5 }]);
    expect(r.lines[0]).toMatchObject({ lineSubtotal: 92.49, lineGst: 16.65, lineTotal: 109.14 });
  });
});

describe('OrderForm', () => {
  it('shows live totals from the catalogue and sends only productId/quantity/discountPercent', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();

    await screen.findByRole('option', { name: /Acme Traders/ });
    await user.selectOptions(screen.getByLabelText('Client'), 'c1');

    const catalogue = await screen.findByTestId('catalogue-results');
    await user.click(await within(catalogue).findByRole('button', { name: /Widget/ }));
    await user.click(within(catalogue).getByRole('button', { name: /Gadget/ }));

    const qty = screen.getByLabelText('Quantity for Widget');
    await user.clear(qty);
    await user.type(qty, '2');
    const disc = screen.getByLabelText('Discount % for Gadget');
    await user.clear(disc);
    await user.type(disc, '10');

    expect(screen.getByTestId('order-subtotal')).toHaveTextContent('2,450.00');
    expect(screen.getByTestId('order-gst')).toHaveTextContent('382.50');
    expect(screen.getByTestId('order-total')).toHaveTextContent('2,832.50');

    await user.click(screen.getByRole('button', { name: /Place order/ }));

    expect(createOrder).toHaveBeenCalledTimes(1);
    const [input, idempotencyKey] = createOrder.mock.calls[0];
    expect(input.clientId).toBe('c1');
    expect(input.items).toEqual([
      { productId: 'p1', quantity: 2, discountPercent: 0 },
      { productId: 'p2', quantity: 1, discountPercent: 10 },
    ]);
    for (const item of input.items) {
      expect(Object.keys(item).sort()).toEqual(['discountPercent', 'productId', 'quantity']);
    }
    // Money is computed by the server; the request carries none.
    expect(JSON.stringify(input)).not.toMatch(/unitPrice|total|gst|subtotal|price/i);
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('will not submit without a client or with a non-positive quantity', async () => {
    const user = userEvent.setup();
    renderForm();
    const catalogue = await screen.findByTestId('catalogue-results');
    await user.click(await within(catalogue).findByRole('button', { name: /Widget/ }));
    const submit = screen.getByRole('button', { name: /Place order/ });
    expect(submit).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Client'), 'c1');
    expect(submit).toBeEnabled();

    const qty = screen.getByLabelText('Quantity for Widget');
    await user.clear(qty);
    await user.type(qty, '0');
    expect(submit).toBeDisabled();
  });
});
