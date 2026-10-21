import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idCardsApi, type IdCard } from '@/lib/id-cards.api';
import { employeesApi, type Employee } from '@/lib/systemcore.api';
import { COMPANY_NAME } from '@/config/brand';
import IDCardPage from './IDCardPage';

vi.mock('@/lib/id-cards.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/id-cards.api')>()),
  idCardsApi: { my: vi.fn(), generate: vi.fn() },
}));
vi.mock('@/lib/systemcore.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/systemcore.api')>()),
  employeesApi: { list: vi.fn() },
}));

const generate = vi.mocked(idCardsApi.generate);
const list = vi.mocked(employeesApi.list);

const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const card: IdCard = {
  employeeId: 'EMP-001',
  firstName: 'Asha',
  lastName: 'Rao',
  designation: 'Engineer',
  department: 'Operations',
  profileImage: null,
  bloodGroup: 'O+',
  joiningDate: '2024-04-01T00:00:00.000Z',
  validUntil: '2029-04-01T00:00:00.000Z',
  qr: QR,
  verifyUrl: 'https://hrms.example.com/verify/abc.def',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IDCardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({
    success: true,
    data: [
      {
        _id: 'e1',
        employeeId: 'EMP-001',
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@example.com',
        status: 'active',
        designation: { _id: 'd1', name: 'Engineer', level: 1 },
      } as Employee,
    ],
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  });
  generate.mockResolvedValue({
    success: true,
    data: { employee: card, generatedAt: '2026-10-21T06:00:00.000Z' },
  });
});

describe('IDCardPage', () => {
  it('renders the server-issued card with its scannable QR, not a decorative icon', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /Asha Rao/ }));

    expect(generate).toHaveBeenCalledWith('e1');
    const preview = await screen.findByTestId('id-card');
    const qr = await within(preview).findByRole('img', { name: /QR code/i });
    expect(qr).toHaveAttribute('src', QR);
    expect(preview.querySelector('svg.lucide-qr-code')).toBeNull();

    expect(within(preview).getByText(COMPANY_NAME)).toBeInTheDocument();
    expect(within(preview).getByText('EMP-001')).toBeInTheDocument();
    expect(preview.textContent).not.toMatch(/DD HRMS/);
  });

  it('only lists active employees to print cards for', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Asha Rao/ });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });
});
