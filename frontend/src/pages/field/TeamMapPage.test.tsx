import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldReportsApi, type TeamStatusRow } from '@/lib/field-reports.api';
import { TEAM_POLL_MS } from '@/hooks/use-field-reports';
import { createAppQueryClient } from '@/lib/query-client';
import TeamMapPage from './TeamMapPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Leaflet needs a real layout engine; only which markers the page asks for is under test.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, title, children }: { position: [number, number]; title?: string; children?: ReactNode }) => (
    <div data-testid="marker" data-title={title} data-lat={position[0]} data-lng={position[1]}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  useMap: () => ({
    fitBounds: vi.fn(),
    setView: vi.fn(),
    getContainer: () => document.createElement('div'),
    invalidateSize: vi.fn(),
  }),
}));

vi.mock('@/lib/field-reports.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field-reports.api')>();
  return { ...actual, fieldReportsApi: { ...actual.fieldReportsApi, teamStatus: vi.fn() } };
});

const teamStatus = vi.mocked(fieldReportsApi.teamStatus);

const emp = (id: string, firstName: string, lastName: string) => ({
  _id: id,
  firstName,
  lastName,
  employeeId: `EMP-${id}`,
});

const ROWS: TeamStatusRow[] = [
  {
    employee: emp('e1', 'Ravi', 'Kumar'),
    status: 'at_site',
    currentVisit: { _id: 'v1', site: { _id: 's1', name: 'Acme Plant' }, since: '2026-10-23T05:00:00.000Z' },
    lastPoint: { lat: 19.01, lng: 72.81, at: '2026-10-23T05:00:00.000Z', kind: 'visit_in', siteName: 'Acme Plant' },
    visitsToday: 2,
    kmToday: 14.2,
  },
  {
    employee: emp('e2', 'Asha', 'Rao'),
    status: 'between_sites',
    currentVisit: null,
    lastPoint: { lat: 19.2, lng: 72.95, at: '2026-10-23T06:10:00.000Z', kind: 'visit_out', siteName: 'Depot 4' },
    visitsToday: 1,
    kmToday: 6,
  },
  {
    employee: emp('e3', 'Neel', 'Shah'),
    status: 'day_ended',
    currentVisit: null,
    lastPoint: { lat: 18.5, lng: 73.8, at: '2026-10-23T12:00:00.000Z', kind: 'day_out' },
    visitsToday: 3,
    kmToday: 22,
  },
  {
    employee: emp('e4', 'Meera', 'Iyer'),
    status: 'not_started',
    currentVisit: null,
    lastPoint: null,
    visitsToday: 0,
    kmToday: 0,
  },
];

function renderPage(): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <TeamMapPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowFor = (name: string): HTMLElement => {
  const list = screen.getByTestId('team-list');
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(name));
  if (!item) throw new Error(`No row for ${name}`);
  return item;
};

beforeEach(() => {
  vi.clearAllMocks();
  teamStatus.mockResolvedValue({ success: true, data: ROWS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TeamMapPage', () => {
  it('draws one marker per employee with a last point, at that point', async () => {
    renderPage();
    const markers = await screen.findAllByTestId('marker');
    expect(markers).toHaveLength(3);
    const ravi = markers.find((m) => m.dataset.title === 'Ravi Kumar');
    expect(ravi).toHaveAttribute('data-lat', '19.01');
    expect(ravi).toHaveAttribute('data-lng', '72.81');
    expect(markers.some((m) => m.dataset.title === 'Meera Iyer')).toBe(false);
  });

  it('shows each employee with the right status chip', async () => {
    renderPage();
    await screen.findAllByTestId('marker');
    expect(within(rowFor('Ravi Kumar')).getByTestId('status-chip')).toHaveTextContent('At Acme Plant');
    expect(within(rowFor('Asha Rao')).getByTestId('status-chip')).toHaveTextContent('Between sites');
    expect(within(rowFor('Neel Shah')).getByTestId('status-chip')).toHaveTextContent('Day ended');
    expect(within(rowFor('Meera Iyer')).getByTestId('status-chip')).toHaveTextContent('Not started');
    // The last point is named, and someone with none says so.
    expect(rowFor('Asha Rao')).toHaveTextContent(/Visit check-out.*Depot 4/);
    expect(rowFor('Meera Iyer')).toHaveTextContent(/No check-in yet/);
  });

  it('asks for today’s status and refreshes it every 60 s, with no live connection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    await screen.findAllByTestId('marker');
    expect(teamStatus).toHaveBeenCalledTimes(1);
    expect(teamStatus.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TEAM_POLL_MS + 50);
    });
    expect(TEAM_POLL_MS).toBe(60_000);
    expect(teamStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('says so when nobody is in scope instead of an empty map', async () => {
    teamStatus.mockResolvedValue({ success: true, data: [] });
    renderPage();
    expect(await screen.findByText('No one to show')).toBeInTheDocument();
  });

  it('shows the error with a retry when the status cannot be loaded', async () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    teamStatus.mockRejectedValue(
      new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, null, {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
        data: { success: false, error: { code: 'FORBIDDEN', message: 'Field access needed' } },
      } as AxiosResponse),
    );
    renderPage();
    expect(await screen.findByText('Field access needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
