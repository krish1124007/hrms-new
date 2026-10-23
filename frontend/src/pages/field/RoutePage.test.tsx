import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldReportsApi, type DayRoute } from '@/lib/field-reports.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import RoutePage from './RoutePage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ title, children }: { title?: string; children?: ReactNode }) => (
    <div data-testid="marker" data-title={title}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polyline: ({ pathOptions }: { pathOptions?: { dashArray?: string } }) => (
    <div data-testid="leg-line" data-dashed={pathOptions?.dashArray ? 'yes' : 'no'} />
  ),
  useMap: () => ({
    fitBounds: vi.fn(),
    setView: vi.fn(),
    getContainer: () => document.createElement('div'),
    invalidateSize: vi.fn(),
  }),
}));

vi.mock('@/lib/field-reports.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field-reports.api')>();
  return {
    ...actual,
    fieldReportsApi: { ...actual.fieldReportsApi, teamStatus: vi.fn(), dayRoute: vi.fn() },
  };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const api = vi.mocked(fieldReportsApi);

const POINTS: DayRoute['points'] = [
  { lat: 19.0, lng: 72.8, at: '2026-10-22T03:30:00.000Z', kind: 'day_in' },
  { lat: 19.03, lng: 72.84, at: '2026-10-22T04:30:00.000Z', kind: 'visit_in', siteName: 'Acme Plant' },
  { lat: 19.031, lng: 72.841, at: '2026-10-22T05:30:00.000Z', kind: 'visit_out', siteName: 'Acme Plant' },
  { lat: 19.1, lng: 72.9, at: '2026-10-22T12:00:00.000Z', kind: 'day_out' },
];

function route(over: Partial<DayRoute> = {}): DayRoute {
  return {
    date: '2026-10-22',
    points: POINTS,
    legs: [
      { fromIndex: 0, toIndex: 1, distanceM: 5000, estimated: false },
      { fromIndex: 2, toIndex: 3, distanceM: 7500, estimated: false },
    ],
    totalKm: 12.5,
    estimated: false,
    ...over,
  };
}

function renderPage(url = '/field/routes?employeeId=e1&date=2026-10-22'): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <RoutePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(selfApi.profile).mockResolvedValue({ success: true, data: { _id: 'me' } } as never);
  api.teamStatus.mockResolvedValue({
    success: true,
    data: [
      {
        employee: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-1' },
        status: 'day_ended',
        currentVisit: null,
        lastPoint: POINTS[3],
        visitsToday: 1,
        kmToday: 12.5,
      },
    ],
  });
});

describe('RoutePage', () => {
  it("draws every point and leg and shows the server's total", async () => {
    api.dayRoute.mockResolvedValue({ success: true, data: route() });
    renderPage();
    const total = await screen.findByTestId('route-total-km');
    expect(total).toHaveTextContent('12.5 km');
    expect(api.dayRoute).toHaveBeenCalledWith('e1', '2026-10-22');
    expect(screen.getAllByTestId('marker')).toHaveLength(4);
    expect(screen.getAllByTestId('leg-line')).toHaveLength(2);
    const legs = screen.getByTestId('route-legs');
    expect(within(legs).getAllByRole('row')).toHaveLength(3); // header + 2 legs
    expect(legs).toHaveTextContent('Acme Plant');
    expect(screen.queryByText('Estimated')).not.toBeInTheDocument();
  });

  it('marks an estimated route and dashes its estimated legs', async () => {
    api.dayRoute.mockResolvedValue({
      success: true,
      data: route({
        legs: [
          { fromIndex: 0, toIndex: 1, distanceM: 5000, estimated: false },
          { fromIndex: 2, toIndex: 3, distanceM: 7500, estimated: true },
        ],
        estimated: true,
      }),
    });
    renderPage();
    expect(await screen.findByTestId('route-total-km')).toHaveTextContent('12.5 km');
    expect(screen.getAllByText('Estimated').length).toBeGreaterThanOrEqual(1);
    const lines = screen.getAllByTestId('leg-line');
    expect(lines.map((l) => l.dataset.dashed)).toEqual(['no', 'yes']);
  });

  it('says nothing was recorded on a day without points', async () => {
    api.dayRoute.mockResolvedValue({ success: true, data: route({ points: [], legs: [], totalKm: 0 }) });
    renderPage();
    expect(await screen.findByText('Nothing recorded')).toBeInTheDocument();
  });
});
