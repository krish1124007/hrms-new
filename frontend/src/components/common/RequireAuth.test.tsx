import { render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, type AuthUser } from '@/lib/auth.api';
import { tokenStorage } from '@/lib/axios';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth.store';
import { RequireAuth } from './RequireAuth';

/** What a guarded page sees: the role slug and a couple of permission checks. */
function Probe() {
  const slug = useAuthStore((s) => s.user?.role?.slug);
  const { has } = usePermissions();
  return (
    <p>
      role:{slug} approve:{String(has('leaves.approve'))} assets:{String(has('assets.view'))}
    </p>
  );
}

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/leaves']}>
      <Routes>
        <Route
          path="/leaves"
          element={
            <RequireAuth fallback={<p>checking session</p>}>
              <Probe />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** A persisted session from before an admin changed this user's access. */
function seedStaleSession(id: string): AuthUser {
  const stale: AuthUser = {
    _id: id,
    email: `${id}@example.com`,
    role: { slug: 'employee', name: 'Employee', permissions: ['leaves.view'] },
  };
  tokenStorage.set('access', 'refresh');
  useAuthStore.getState().setSession({ user: stale });
  return stale;
}

function axiosFailure(status: number): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response = { status, statusText: '', data: {}, headers: {}, config } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response);
}

describe('RequireAuth session refresh', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
    tokenStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clear();
    tokenStorage.clear();
  });

  it('replaces a persisted role with the one /auth/me returns before rendering the page', async () => {
    seedStaleSession('u-promoted');
    let answer: (value: { user: AuthUser }) => void = () => undefined;
    const me = vi
      .spyOn(authApi, 'me')
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)));

    renderGuarded();
    // Nothing guarded renders on the stale permissions while the check runs.
    expect(screen.getByText('checking session')).toBeInTheDocument();
    expect(screen.queryByText(/role:/)).toBeNull();
    expect(me).toHaveBeenCalledTimes(1);

    answer({
      user: {
        _id: 'u-promoted',
        email: 'u-promoted@example.com',
        role: { slug: 'manager', name: 'Manager', permissions: ['leaves.view', 'leaves.approve'] },
        customPermissions: ['assets.view'],
      },
    });

    expect(await screen.findByText('role:manager approve:true assets:true')).toBeInTheDocument();
    const stored = useAuthStore.getState().user;
    expect(stored?.role?.slug).toBe('manager');
    expect(stored?.customPermissions).toEqual(['assets.view']);
  });

  it('drops permissions the server no longer grants', async () => {
    const stale = seedStaleSession('u-demoted');
    useAuthStore.getState().setSession({
      user: { ...stale, role: { slug: 'manager', name: 'Manager', permissions: ['leaves.approve'] } },
    });
    vi.spyOn(authApi, 'me').mockResolvedValue({
      user: { ...stale, role: { slug: 'employee', name: 'Employee', permissions: ['leaves.view'] } },
    });

    renderGuarded();
    expect(await screen.findByText('role:employee approve:false assets:false')).toBeInTheDocument();
  });

  it('signs out a user the server refuses (403: deactivated)', async () => {
    seedStaleSession('u-deactivated');
    vi.spyOn(authApi, 'me').mockRejectedValue(axiosFailure(403));

    renderGuarded();
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(tokenStorage.getAccess()).toBeNull();
  });

  it('keeps the cached session when the check cannot reach the server', async () => {
    seedStaleSession('u-offline');
    vi.spyOn(authApi, 'me').mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));

    renderGuarded();
    expect(await screen.findByText('role:employee approve:false assets:false')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('sends a signed-out visitor to /login without calling the API', async () => {
    const me = vi.spyOn(authApi, 'me');
    renderGuarded();
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(me).not.toHaveBeenCalled();
  });
});
