import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldApi, type FieldSettings, type Site, type Visit } from '@/lib/field.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import { useAuthStore } from '@/stores/auth.store';
import FieldSettingsPage from './FieldSettingsPage';
import SitesPage from './SitesPage';
import VisitDetailPage from './VisitDetailPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));

/** The pin picker's map-click handler, captured from `useMapEvents`. */
const leaflet = vi.hoisted(() => ({
  click: undefined as undefined | ((e: { latlng: { lat: number; lng: number } }) => void),
}));

// Leaflet needs a real layout engine; the tests drive the map through its event handlers.
vi.mock('react-leaflet', () => {
  const map = {
    fitBounds: vi.fn(),
    setView: vi.fn(),
    getContainer: () => document.createElement('div'),
    invalidateSize: vi.fn(),
    getZoom: () => 5,
    getBounds: () => ({ getWest: () => 68, getSouth: () => 8, getEast: () => 97, getNorth: () => 37 }),
  };
  return {
    MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Marker: () => null,
    Popup: () => null,
    Tooltip: () => null,
    Circle: () => null,
    CircleMarker: () => null,
    Polyline: () => null,
    useMap: () => map,
    useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) => {
      if (handlers.click) leaflet.click = handlers.click;
      return map;
    },
  };
});

vi.mock('@/lib/field.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field.api')>();
  return {
    ...actual,
    fieldApi: {
      ...actual.fieldApi,
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      listSites: vi.fn(),
      sitesMap: vi.fn(),
      createSite: vi.fn(),
      getVisit: vi.fn(),
    },
  };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const api = vi.mocked(fieldApi);

const settings: FieldSettings = {
  selfieRequired: true,
  defaultSiteRadiusM: 200,
  siteTypes: ['Client office', 'Project site', 'Other'],
  visitPurposes: ['Meeting', 'Inspection', 'Other'],
  shortVisitMinutes: 5,
  autoCloseTime: '23:30',
  offlineMaxAgeDays: 7,
  visitCountsAsAttendance: true,
  vehicles: [
    { type: 'bike', label: 'Two-wheeler', ratePerKm: 0 },
    { type: 'car', label: 'Car', ratePerKm: 0 },
  ],
  checklists: [],
};

function signIn(permissions: string[], employeeId: string): void {
  useAuthStore.getState().setSession({
    user: { _id: `u-${employeeId}`, email: 'me@example.com', role: { slug: 'x', name: 'X', permissions } },
  });
  vi.mocked(selfApi.profile).mockResolvedValue({ success: true, data: { _id: employeeId } } as never);
}

function renderWithApp(ui: ReactNode, path = '/'): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  leaflet.click = undefined;
  api.getSettings.mockResolvedValue({ success: true, data: settings });
});

afterEach(() => {
  useAuthStore.getState().clear();
});

/* ── Sites ── */

const createdSite: Site = {
  _id: 's1',
  name: 'Acme Plant',
  type: 'Project site',
  address: {},
  location: { lat: 19.076, lng: 72.8777 },
  radiusM: 150,
  contactName: '',
  contactPhone: '',
  notes: '',
  assignedTo: [],
  createdBy: { _id: 'm1', firstName: 'Meera', lastName: 'Shah' },
  createdVia: 'web',
  visitCount: 0,
};

describe('SitesPage — site form', () => {
  it('sends the name, type, the pin placed on the map and the radius', async () => {
    signIn(['field.view', 'field.manage'], 'm1');
    api.listSites.mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } });
    api.createSite.mockResolvedValue({ success: true, data: createdSite });
    const user = userEvent.setup();
    renderWithApp(<SitesPage />);

    await user.click(await screen.findByRole('button', { name: /new site/i }));
    const dialog = await screen.findByRole('dialog', { name: /new site/i });
    await user.type(within(dialog).getByLabelText(/^name/i), 'Acme Plant');
    await within(dialog).findByRole('option', { name: 'Project site' });
    await user.selectOptions(within(dialog).getByLabelText(/^type/i), 'Project site');

    // No pin yet: nothing to save.
    expect(within(dialog).getByRole('button', { name: /add site/i })).toBeDisabled();
    expect(within(dialog).getByLabelText(/radius/i)).toHaveValue(200);

    act(() => leaflet.click?.({ latlng: { lat: 19.076, lng: 72.8777 } }));
    expect(within(dialog).getByLabelText('Latitude')).toHaveValue('19.076000');
    expect(within(dialog).getByLabelText('Longitude')).toHaveValue('72.877700');

    const radius = within(dialog).getByLabelText(/radius/i);
    await user.clear(radius);
    await user.type(radius, '150');
    await user.click(within(dialog).getByRole('button', { name: /add site/i }));

    await waitFor(() => expect(api.createSite).toHaveBeenCalledTimes(1));
    expect(api.createSite).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRef: expect.any(String),
        name: 'Acme Plant',
        type: 'Project site',
        location: { lat: 19.076, lng: 72.8777 },
        radiusM: 150,
      }),
    );
  });
});

/* ── Visit detail ── */

const visit: Visit = {
  _id: 'v1',
  clientRef: 'c-1',
  employee: { _id: 'e1', firstName: 'Ravi', lastName: 'Kumar', employeeId: 'EMP-7' },
  site: {
    _id: 's1',
    name: 'Andheri Metro Site',
    type: 'Project site',
    location: { lat: 19.1197, lng: 72.8464 },
    radiusM: 200,
  },
  purpose: 'Inspection',
  status: 'completed',
  checkIn: { at: '2026-10-22T04:30:00.000Z', location: { lat: 19.1237, lng: 72.8464 }, accuracy: 12, distanceM: 450 },
  checkOut: { at: '2026-10-22T05:15:00.000Z', location: { lat: 19.1197, lng: 72.8465 }, distanceM: 15 },
  durationMinutes: 45,
  flags: {
    awayFromSite: true,
    noGps: false,
    noSelfie: true,
    shortVisit: false,
    autoClosed: false,
    syncedLate: true,
    capturedOffline: true,
  },
  report: {
    notes: 'Scaffolding on level 3 needs bracing.',
    photos: ['https://files.example/p1.jpg', 'https://files.example/p2.jpg'],
    documents: [{ url: 'https://files.example/d1.pdf', name: 'Inspection.pdf' }],
    peopleMet: [{ name: 'Anita Rao', designation: 'Site engineer', phone: '9800000000' }],
    outcome: 'follow_up',
    nextAction: 'Re-inspect after bracing',
    followUpDate: '2026-10-29',
    checklist: {
      checklistId: 'cl1',
      answers: [
        { itemId: 'i1', value: true },
        { itemId: 'i2', value: 'Fair' },
      ],
    },
    submittedAt: '2026-10-22T05:20:00.000Z',
  },
  createdAt: '2026-10-22T04:30:00.000Z',
};

describe('VisitDetailPage', () => {
  it('shows the work report sections and the visit flags', async () => {
    signIn(['field.view'], 'e9');
    api.getSettings.mockResolvedValue({
      success: true,
      data: {
        ...settings,
        checklists: [
          {
            _id: 'cl1',
            name: 'Site inspection',
            purpose: 'Inspection',
            items: [
              { _id: 'i1', label: 'Fire exits clear', kind: 'yes_no', required: true },
              { _id: 'i2', label: 'Housekeeping', kind: 'select', options: ['Good', 'Fair', 'Poor'], required: false },
            ],
          },
        ],
      },
    });
    api.getVisit.mockResolvedValue({ success: true, data: visit });
    renderWithApp(
      <Routes>
        <Route path="/field/visits/:id" element={<VisitDetailPage />} />
      </Routes>,
      '/field/visits/v1',
    );

    expect(await screen.findByRole('heading', { name: /work report/i })).toBeInTheDocument();
    expect(screen.getByText('Scaffolding on level 3 needs bracing.')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /report photo/i })).toHaveLength(2);
    expect(screen.getByRole('link', { name: /inspection\.pdf/i })).toHaveAttribute('href', 'https://files.example/d1.pdf');
    expect(screen.getByText('Anita Rao')).toBeInTheDocument();
    expect(screen.getByText(/site engineer/i)).toBeInTheDocument();
    expect(screen.getByText('Follow-up needed')).toBeInTheDocument();
    expect(screen.getByText('Re-inspect after bracing')).toBeInTheDocument();

    const checklist = screen.getByRole('table', { name: /site inspection/i });
    expect(within(within(checklist).getByText('Fire exits clear').closest('tr') as HTMLElement).getByText('Yes')).toBeInTheDocument();
    expect(within(within(checklist).getByText('Housekeeping').closest('tr') as HTMLElement).getByText('Fair')).toBeInTheDocument();

    const flags = screen.getByRole('list', { name: /flags/i });
    for (const label of ['Away from site', 'No selfie', 'Synced late', 'Captured offline']) {
      expect(within(flags).getByText(label)).toBeInTheDocument();
    }
    expect(within(flags).queryByText('Short visit')).toBeNull();
    expect(within(flags).queryByText('No GPS')).toBeNull();
    expect(screen.getByText(/450 m from the pin/i)).toBeInTheDocument();
  });
});

/* ── Settings ── */

describe('FieldSettingsPage — checklist builder', () => {
  it('adds a checklist with an item of each kind and saves it with the settings', async () => {
    signIn(['field.view', 'field.manage'], 'm1');
    api.updateSettings.mockImplementation(async (input) => ({ success: true, data: input }));
    const user = userEvent.setup();
    renderWithApp(<FieldSettingsPage />);

    await user.click(await screen.findByRole('button', { name: /add checklist/i }));
    const card = screen.getByRole('group', { name: /checklist 1/i });
    await user.type(within(card).getByLabelText('Checklist name'), 'Site inspection');
    await user.selectOptions(within(card).getByLabelText('Used for'), 'Inspection');

    const items: Array<[string, string]> = [
      ['yes_no', 'Fire exits clear'],
      ['text', 'Remarks'],
      ['number', 'Workers on site'],
      ['select', 'Housekeeping'],
      ['photo', 'Notice board'],
    ];
    for (const [i, [kind, label]] of items.entries()) {
      await user.click(within(card).getByRole('button', { name: /add item/i }));
      await user.type(within(card).getByLabelText(`Item ${i + 1} label`), label);
      await user.selectOptions(within(card).getByLabelText(`Item ${i + 1} type`), kind);
    }
    await user.type(within(card).getByLabelText('Item 4 options'), 'Good, Fair, Poor');
    await user.click(within(card).getByLabelText('Item 1 required'));

    await user.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledTimes(1));
    const saved = api.updateSettings.mock.calls[0][0];
    expect(saved).toMatchObject({ selfieRequired: true, defaultSiteRadiusM: 200, vehicles: settings.vehicles });
    expect(saved.checklists).toHaveLength(1);
    expect(saved.checklists[0]).toMatchObject({ name: 'Site inspection', purpose: 'Inspection' });
    expect(saved.checklists[0].items.map((i) => i.kind)).toEqual(['yes_no', 'text', 'number', 'select', 'photo']);
    expect(saved.checklists[0].items.map((i) => i.label)).toEqual(items.map(([, label]) => label));
    expect(saved.checklists[0].items[3].options).toEqual(['Good', 'Fair', 'Poor']);
    expect(saved.checklists[0].items[0].required).toBe(true);
    expect(saved.checklists[0].items[1].options).toBeUndefined();
  });
});
