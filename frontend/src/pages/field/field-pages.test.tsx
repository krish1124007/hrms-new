import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldApi, type FieldSettings, type FieldTask, type Site, type Visit, type VisitSchedule } from '@/lib/field.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import { employeesApi } from '@/lib/systemcore.api';
import { useAuthStore } from '@/stores/auth.store';
import FieldSettingsPage from './FieldSettingsPage';
import FieldTasksPage from './FieldTasksPage';
import PlanningPage from './PlanningPage';
import SiteDetailPage from './SiteDetailPage';
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
      getSite: vi.fn(),
      createSite: vi.fn(),
      updateSite: vi.fn(),
      getVisit: vi.fn(),
      listTasks: vi.fn(),
      createTask: vi.fn(),
      listSchedules: vi.fn(),
      updateSchedule: vi.fn(),
      deleteSchedule: vi.fn(),
    },
  };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));
vi.mock('@/lib/systemcore.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemcore.api')>();
  return { ...actual, employeesApi: { ...actual.employeesApi, list: vi.fn() } };
});

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

/** Signs in as the login `u-<employeeId>` whose employee record is `<employeeId>`. */
function signIn(permissions: string[], employeeId: string): void {
  useAuthStore.getState().setSession({
    user: { _id: `u-${employeeId}`, email: 'me@example.com', role: { slug: 'x', name: 'X', permissions } },
  });
  vi.mocked(selfApi.profile).mockResolvedValue({
    success: true,
    data: { _id: employeeId, firstName: 'Meera', lastName: 'Shah' },
  } as never);
}

const page = <T,>(data: T[]) => ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, pages: 1 } });

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
  api.listSites.mockResolvedValue(page([]));
  vi.mocked(employeesApi.list).mockResolvedValue(page([]) as never);
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

    // The server takes whole metres only.
    const radius = within(dialog).getByLabelText(/radius/i);
    await user.clear(radius);
    await user.type(radius, '150.5');
    expect(within(dialog).getByText(/whole number of metres/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /add site/i })).toBeDisabled();

    await user.clear(radius);
    await user.type(radius, '150');
    await user.click(within(dialog).getByRole('button', { name: /add site/i }));

    await waitFor(() => expect(api.createSite).toHaveBeenCalledTimes(1));
    expect(api.createSite).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Plant',
        type: 'Project site',
        location: { lat: 19.076, lng: 72.8777 },
        radiusM: 150,
      }),
    );
    // Without a clientRef the server records the site as added on the website, not pinned from the app.
    expect(api.createSite.mock.calls[0][0]).not.toHaveProperty('clientRef');
  });

  it('lets the person who pinned a site correct it, sending only what changed', async () => {
    // A Field Manager: field.view and employees.view, no field.manage.
    signIn(['field.view', 'employees.view'], 'e1');
    const recent = new Date(Date.now() - 3600_000).toISOString();
    const mine: Site = {
      ...createdSite,
      _id: 's1',
      name: 'Acme Plant',
      // Renamed by HR since: no longer one of the site types.
      type: 'Client office (old)',
      contactPhone: '9800000000',
      assignedTo: [{ _id: 'e1', firstName: 'Meera', lastName: 'Shah' }],
      createdBy: { _id: 'u-e1', firstName: 'Meera', lastName: 'Shah' },
      createdVia: 'mobile_pin',
      createdAt: recent,
    };
    const theirs: Site = { ...mine, _id: 's2', name: 'Depot 4', createdBy: { _id: 'u-e7', firstName: 'Asha', lastName: 'Rao' } };
    api.listSites.mockResolvedValue(page([mine, theirs]));
    api.updateSite.mockResolvedValue({ success: true, data: mine });
    const user = userEvent.setup();
    renderWithApp(<SitesPage />);

    // `createdBy` is a user id: matched against the signed-in user, not their employee record.
    await user.click(await screen.findByRole('button', { name: 'Actions for Acme Plant' }));
    expect(screen.queryByRole('button', { name: 'Actions for Depot 4' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: /edit acme plant/i });
    // Only a field manager reassigns: the assignees are shown, not offered.
    expect(within(dialog).getByTestId('site-assignees')).toHaveTextContent('Meera Shah');
    expect(within(dialog).queryByLabelText('Assigned to')).not.toBeInTheDocument();

    const phone = within(dialog).getByLabelText(/contact phone/i);
    await user.clear(phone);
    await user.type(phone, '9811111111');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateSite).toHaveBeenCalledTimes(1));
    // Not the untouched (since renamed) type, the pin, or the assignees.
    expect(api.updateSite).toHaveBeenCalledWith('s1', { contactPhone: '9811111111' });
  });
});

describe('SiteDetailPage — a site without a pin', () => {
  const unpinned: Site = { ...createdSite, _id: 's9', name: 'Old Client', type: 'Client office', location: null };

  it('says "No pin yet" instead of a map, and Edit is how the pin gets set', async () => {
    signIn(['field.view', 'field.manage'], 'm1');
    api.getSite.mockResolvedValue({ success: true, data: { ...unpinned, recentVisits: [] } });
    api.updateSite.mockResolvedValue({ success: true, data: unpinned });
    const user = userEvent.setup();
    renderWithApp(
      <Routes>
        <Route path="/field/sites/:id" element={<SiteDetailPage />} />
      </Routes>,
      '/field/sites/s9',
    );

    expect(await screen.findByTestId('site-no-pin')).toHaveTextContent('No pin yet');
    expect(screen.getAllByText('No pin yet').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('link', { name: /google maps/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit old client/i });
    expect(within(dialog).getByLabelText('Latitude')).toHaveValue('');
    expect(within(dialog).getByLabelText('Longitude')).toHaveValue('');
    expect(within(dialog).getByText(/has no pin yet/i)).toBeInTheDocument();

    act(() => leaflet.click?.({ latlng: { lat: 18.52, lng: 73.8567 } }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateSite).toHaveBeenCalledTimes(1));
    expect(api.updateSite).toHaveBeenCalledWith('s9', { location: { lat: 18.52, lng: 73.8567 } });
  });
});

/* ── Tasks ── */

describe('FieldTasksPage — a field.view holder', () => {
  const task = (id: string, title: string, assignedTo: FieldTask['assignedTo'], createdBy: string): FieldTask => ({
    _id: id,
    title,
    assignedTo,
    priority: 'medium',
    status: 'new',
    completionPhotos: [],
    createdBy,
    createdAt: '2026-10-22T04:30:00.000Z',
    updatedAt: '2026-10-22T04:30:00.000Z',
  });

  it("assigns tasks and manages their team's and their own, as the server allows", async () => {
    signIn(['field.view'], 'e1');
    api.listTasks.mockResolvedValue(
      page([
        // A direct report's task, given by HR: their manager manages it.
        task('t1', 'Fix pump', { _id: 'e2', firstName: 'Asha', lastName: 'Rao' }, 'u-hr'),
        // Given to me by HR: I accept and complete it, nothing more.
        task('t2', 'Audit depot', { _id: 'e1', firstName: 'Meera', lastName: 'Shah' }, 'u-hr'),
        // One I gave myself.
        task('t3', 'Survey site', { _id: 'e1', firstName: 'Meera', lastName: 'Shah' }, 'u-e1'),
      ]),
    );
    api.createTask.mockImplementation(async (input) => ({ success: true, data: task('t4', input.title, input.assignedTo, 'u-e1') }));
    const user = userEvent.setup();
    renderWithApp(<FieldTasksPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Fix pump' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancel task' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Actions for Audit depot' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Survey site' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new task/i }));
    const dialog = await screen.findByRole('dialog', { name: /new task/i });
    await user.type(within(dialog).getByLabelText(/title/i), 'Check meter');
    // Without the employee list, "Myself" is the one choice.
    await waitFor(() => expect(within(dialog).getByLabelText(/assign to/i)).toHaveDisplayValue(/myself/i));
    await user.click(within(dialog).getByRole('button', { name: /assign task/i }));

    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(1));
    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Check meter', assignedTo: 'e1' }));
  });
});

/* ── Recurring visits ── */

describe('PlanningPage — recurring visits', () => {
  const schedule: VisitSchedule = {
    _id: 'sc1',
    siteId: { _id: 's1', name: 'Acme Plant' },
    employeeId: { _id: 'e2', firstName: 'Asha', lastName: 'Rao' },
    // Removed from the visit purposes since.
    purpose: 'Site check (old)',
    rule: { freq: 'weekly', weekdays: [1], startDate: '2026-11-02' },
  };

  it('sends only the changed rule, and says what deleting does to planned visits', async () => {
    signIn(['field.view'], 'e1');
    api.listSchedules.mockResolvedValue(page([schedule]));
    api.updateSchedule.mockResolvedValue({ success: true, data: schedule });
    const user = userEvent.setup();
    renderWithApp(<PlanningPage />, '/field/planning?tab=recurring');

    await user.click(await screen.findByRole('button', { name: /actions for the recurring visit to acme plant/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: /edit recurring visit/i });
    expect(within(dialog).getByText(/visits from tomorrow on follow the new rule/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Thu' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateSchedule).toHaveBeenCalledTimes(1));
    // Not the untouched purpose (it would be refused), the site or the employee.
    expect(api.updateSchedule).toHaveBeenCalledWith('sc1', {
      rule: { freq: 'weekly', weekdays: [1, 4], startDate: '2026-11-02' },
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /edit recurring visit/i })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /actions for the recurring visit to acme plant/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: /delete this recurring visit/i });
    expect(confirm).toHaveTextContent(/planned visits from tomorrow on are removed/i);
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

  it("shows the employee's arrival note with the check-in, never as planning notes", async () => {
    signIn(['field.view'], 'e9');
    // Unplanned: the server keeps the check-in note as the visit's notes too.
    api.getVisit.mockResolvedValue({
      success: true,
      data: { ...visit, notes: 'Gate locked, waited 10 min', checkIn: { ...visit.checkIn!, notes: 'Gate locked, waited 10 min' } },
    });
    renderWithApp(
      <Routes>
        <Route path="/field/visits/:id" element={<VisitDetailPage />} />
      </Routes>,
      '/field/visits/v1',
    );
    const checkIn = (await screen.findByText('Check-in')).closest('div') as HTMLElement;
    expect(within(checkIn).getByText(/gate locked, waited 10 min/i)).toBeInTheDocument();
    expect(screen.queryByText('Planning notes')).toBeNull();
    expect(screen.getAllByText(/gate locked, waited 10 min/i)).toHaveLength(1);
  });

  it('shows the planner\'s notes and the arrival note of a planned visit apart', async () => {
    signIn(['field.view'], 'e9');
    api.getVisit.mockResolvedValue({
      success: true,
      data: { ...visit, plannedDate: '2026-10-22', notes: 'Bring the inspection forms', checkIn: { ...visit.checkIn!, notes: 'Gate locked' } },
    });
    renderWithApp(
      <Routes>
        <Route path="/field/visits/:id" element={<VisitDetailPage />} />
      </Routes>,
      '/field/visits/v1',
    );
    const planning = (await screen.findByText('Planning notes')).closest('div') as HTMLElement;
    expect(within(planning).getByText('Bring the inspection forms')).toBeInTheDocument();
    expect(within(screen.getByText('Check-in').closest('div') as HTMLElement).getByText(/gate locked/i)).toBeInTheDocument();
  });

  it('shows a dash for a report filed without an outcome', async () => {
    signIn(['field.view'], 'e9');
    api.getVisit.mockResolvedValue({
      success: true,
      data: { ...visit, report: { ...(visit.report as NonNullable<Visit['report']>), outcome: null } },
    });
    renderWithApp(
      <Routes>
        <Route path="/field/visits/:id" element={<VisitDetailPage />} />
      </Routes>,
      '/field/visits/v1',
    );
    const label = await screen.findByText('Outcome');
    expect(label.nextElementSibling).toHaveTextContent('—');
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

describe('FieldSettingsPage — vehicles', () => {
  it('keeps one rate per kind of vehicle, at most three, as the server does', async () => {
    signIn(['field.view', 'field.manage'], 'm1');
    const user = userEvent.setup();
    renderWithApp(<FieldSettingsPage />);

    // Two-wheeler and car are set: a new vehicle takes the kind not used yet.
    await user.click(await screen.findByRole('button', { name: /add vehicle/i }));
    expect(screen.getByLabelText('Vehicle 3 kind')).toHaveValue('other');
    expect(screen.getByLabelText('Vehicle 3 name')).toHaveValue('Other');
    expect(screen.getByRole('button', { name: /add vehicle/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Vehicle 3 kind'), 'car');
    expect(screen.getByText(/only one rate per kind of vehicle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Vehicle 3 kind'), 'other');
    expect(screen.queryByText(/only one rate per kind of vehicle/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled();
  });

  it('refuses a site type longer than the server takes', async () => {
    signIn(['field.view', 'field.manage'], 'm1');
    api.getSettings.mockResolvedValue({ success: true, data: { ...settings, siteTypes: ['Client office', 'x'.repeat(61)] } });
    renderWithApp(<FieldSettingsPage />);
    expect(await screen.findByText(/longer than 60 characters/i)).toBeInTheDocument();
  });
});
