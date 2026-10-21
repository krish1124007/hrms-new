import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import { fieldApi, type LiveLocation } from '@/lib/field.api';
import { LIVE_POLL_MS } from '@/hooks/use-live-locations';
import { LiveMap } from './LiveMap';

// Leaflet needs a real layout engine; the map itself is not under test here,
// only which markers LiveMap asks it to draw.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({
    position,
    title,
    children,
  }: {
    position: [number, number];
    title?: string;
    children?: ReactNode;
  }) => (
    <div data-testid="marker" data-title={title} data-lat={position[0]} data-lng={position[1]}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), getZoom: () => 5 }),
}));

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler[]>();
const fakeSocket = {
  on: vi.fn((event: string, fn: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    return fakeSocket;
  }),
  off: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  removeAllListeners: vi.fn(),
  active: true,
  connected: false,
};
function emit(event: string, ...args: unknown[]): void {
  for (const fn of handlers.get(event) ?? []) fn(...args);
}

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket) }));

vi.mock('@/lib/field.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field.api')>();
  return { ...actual, fieldApi: { ...actual.fieldApi, liveTracking: vi.fn() } };
});

const liveTracking = vi.mocked(fieldApi.liveTracking);
const ioMock = vi.mocked(io);

const rep = (over: Partial<LiveLocation> & Pick<LiveLocation, 'employeeId' | 'name'>): LiveLocation => ({
  employeeCode: 'EMP-1',
  avatar: null,
  lat: 19,
  lng: 72.8,
  accuracy: 10,
  speed: null,
  heading: null,
  battery: null,
  recordedAt: '2026-10-21T05:40:00.000Z',
  onVisit: null,
  ...over,
});

function renderMap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LiveMap />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const markerFor = (title: string): HTMLElement | undefined =>
  screen.queryAllByTestId('marker').find((m) => m.dataset.title === title);

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  localStorage.setItem('opencore.accessToken', 'access-123');
  liveTracking.mockResolvedValue({
    success: true,
    data: [
      rep({ employeeId: 'e1', name: 'Ravi Kumar', lat: 19.01, lng: 72.81 }),
      rep({
        employeeId: 'e2',
        name: 'Asha Rao',
        lat: 19.2,
        lng: 72.95,
        onVisit: { visitId: 'v1', clientId: 'c1', clientName: 'Acme Traders' },
      }),
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('LiveMap', () => {
  it('draws one marker per rep from GET /field/tracking/live', async () => {
    renderMap();
    expect(await screen.findAllByTestId('marker')).toHaveLength(2);
    expect(markerFor('Ravi Kumar')).toHaveAttribute('data-lat', '19.01');
    expect(markerFor('Asha Rao')).toHaveAttribute('data-lng', '72.95');
    expect(within(screen.getByTestId('rep-list')).getByText(/Acme Traders/)).toBeInTheDocument();
  });

  it('opens the /field-tracking namespace with the stored access token', async () => {
    renderMap();
    await screen.findAllByTestId('marker');
    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, opts] = ioMock.mock.calls[0] as [string, { auth: unknown }];
    expect(url).toMatch(/\/field-tracking$/);
    // A callback, so every reconnect reads the current (possibly refreshed) token.
    const auth = opts.auth as (cb: (data: object) => void) => void;
    const cb = vi.fn();
    auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: 'access-123' });
  });

  it('moves a marker and adds new reps on a socket location:update', async () => {
    renderMap();
    await screen.findAllByTestId('marker');

    act(() => emit('connect'));
    expect(await screen.findByText(/^Live$/)).toBeInTheDocument();

    act(() =>
      emit('location:update', {
        employeeId: 'e1',
        name: 'Ravi Kumar',
        avatar: null,
        lat: 19.3,
        lng: 72.99,
        accuracy: 6,
        recordedAt: '2026-10-21T05:45:00.000Z',
      }),
    );
    // React Query notifies observers on the next tick.
    await waitFor(() => expect(markerFor('Ravi Kumar')).toHaveAttribute('data-lat', '19.3'));
    expect(markerFor('Ravi Kumar')).toHaveAttribute('data-lng', '72.99');

    act(() =>
      emit('location:update', {
        employeeId: 'e3',
        name: 'New Rep',
        avatar: null,
        lat: 18.5,
        lng: 73.8,
        accuracy: 9,
        recordedAt: '2026-10-21T05:46:00.000Z',
      }),
    );
    await waitFor(() => expect(screen.getAllByTestId('marker')).toHaveLength(3));
    // The visit context from the poll survives a socket update of another rep.
    expect(within(screen.getByTestId('rep-list')).getByText(/Acme Traders/)).toBeInTheDocument();
  });

  it('ignores an update older than the point it already shows', async () => {
    renderMap();
    await screen.findAllByTestId('marker');
    act(() =>
      emit('location:update', {
        employeeId: 'e1',
        name: 'Ravi Kumar',
        avatar: null,
        lat: 1,
        lng: 1,
        accuracy: 6,
        recordedAt: '2026-10-21T05:00:00.000Z',
      }),
    );
    // A newer update for another rep, to know the cache has been notified.
    act(() =>
      emit('location:update', {
        employeeId: 'e2',
        name: 'Asha Rao',
        avatar: null,
        lat: 20,
        lng: 73,
        accuracy: 6,
        recordedAt: '2026-10-21T05:50:00.000Z',
      }),
    );
    await waitFor(() => expect(markerFor('Asha Rao')).toHaveAttribute('data-lat', '20'));
    expect(markerFor('Ravi Kumar')).toHaveAttribute('data-lat', '19.01');
  });

  it('falls back to polling every 30 s when the socket cannot connect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderMap();
    await screen.findAllByTestId('marker');
    expect(liveTracking).toHaveBeenCalledTimes(1);

    act(() => emit('connect_error', new Error('INVALID_TOKEN')));
    expect(await screen.findByText(/Polling every 30 s/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS + 50);
    });
    expect(LIVE_POLL_MS).toBe(30_000);
    expect(liveTracking.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
