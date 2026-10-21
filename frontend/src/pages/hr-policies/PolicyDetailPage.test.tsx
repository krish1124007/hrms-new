import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/lib/auth.api';
import { hrPoliciesApi, type HrPolicy } from '@/lib/hr-policies.api';
import { profileApi } from '@/lib/profile.api';
import { useAuthStore } from '@/stores/auth.store';
import PolicyDetailPage from './PolicyDetailPage';

vi.mock('@/lib/hr-policies.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hr-policies.api')>()),
  hrPoliciesApi: { get: vi.fn(), acknowledgements: vi.fn(), acknowledge: vi.fn() },
}));
vi.mock('@/lib/profile.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/profile.api')>()),
  profileApi: { me: vi.fn() },
}));

const api = vi.mocked(hrPoliciesApi);

const policy = {
  _id: 'p1',
  policyCode: 'POL-0001',
  title: 'Code of conduct',
  category: 'code_of_conduct',
  status: 'published',
  content: '## Behaviour\n\nBe **kind**.\n\n<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>',
  currentVersion: 2,
  versions: [],
  mandatory: true,
  acknowledgements: [
    {
      _id: 'a1',
      employee: { _id: 'emp-1', firstName: 'Asha', lastName: 'Rao', employeeId: 'EMP-001' },
      versionNumber: 1,
      acknowledgedAt: '2026-01-10T05:00:00.000Z',
    },
  ],
  tags: [],
  attachments: [],
  createdAt: '2026-01-01T05:00:00.000Z',
  updatedAt: '2026-10-01T05:00:00.000Z',
} as unknown as HrPolicy;

const employee: AuthUser = {
  _id: 'u1',
  email: 'asha@example.com',
  role: { slug: 'employee', name: 'Employee', permissions: ['policies.view'] },
};

function renderPage() {
  useAuthStore.setState({ user: employee, isAuthenticated: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hr-policies/p1']}>
        <Routes>
          <Route path="/hr-policies/:id" element={<PolicyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ success: true, data: policy });
  api.acknowledge.mockResolvedValue({ success: true, data: policy });
  vi.mocked(profileApi.me).mockResolvedValue({
    success: true,
    data: { _id: 'emp-1', employeeId: 'EMP-001', firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com' },
  });
});

describe('PolicyDetailPage for an employee', () => {
  it('shows no management actions and renders the Markdown sanitised', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Behaviour' })).toBeInTheDocument();
    expect(screen.getByText('kind', { selector: 'strong' })).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();

    for (const name of [/publish/i, /record acknowledgement/i, /archive/i, /edit/i, /delete/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    // Other people's acknowledgements are HR's business.
    expect(api.acknowledgements).not.toHaveBeenCalled();
    expect(screen.queryByText('Acknowledgement log')).toBeNull();
  });

  it('lets the employee acknowledge the new version themselves', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: /i have read and acknowledge/i });
    expect(screen.getByText(/You acknowledged v1; the policy has changed since/)).toBeInTheDocument();

    await userEvent.click(button);
    await waitFor(() => expect(api.acknowledge).toHaveBeenCalledWith('p1', { employee: undefined, comment: undefined }));
  });
});
