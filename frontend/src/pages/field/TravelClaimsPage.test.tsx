import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fieldReportsApi, type TravelDay } from '@/lib/field-reports.api';
import { createAppQueryClient } from '@/lib/query-client';
import { selfApi } from '@/lib/self.api';
import TravelClaimsPage from './TravelClaimsPage';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

vi.mock('@/lib/field-reports.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/field-reports.api')>();
  return {
    ...actual,
    fieldReportsApi: {
      ...actual.fieldReportsApi,
      travelDay: vi.fn(),
      vehicles: vi.fn(),
      createTravelClaim: vi.fn(),
    },
  };
});
vi.mock('@/lib/self.api', () => ({ selfApi: { profile: vi.fn() } }));

const api = vi.mocked(fieldReportsApi);

function day(over: Partial<TravelDay> = {}): TravelDay {
  return {
    date: '2026-10-22',
    totalKm: 40,
    estimated: false,
    points: [
      { lat: 19.0, lng: 72.8, at: '2026-10-22T03:30:00.000Z', kind: 'day_in' },
      { lat: 19.3, lng: 72.9, at: '2026-10-22T05:30:00.000Z', kind: 'visit_in', siteName: 'Acme Plant' },
    ],
    legs: [{ fromIndex: 0, toIndex: 1, distanceM: 40_000, estimated: false }],
    hasCompletedVisit: true,
    claim: null,
    ...over,
  };
}

function renderPage(url = '/field/travel?date=2026-10-22'): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <TravelClaimsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(selfApi.profile).mockResolvedValue({
    success: true,
    data: { _id: 'me', firstName: 'Ravi', lastName: 'Kumar' },
  } as never);
  api.vehicles.mockResolvedValue([
    { type: 'bike', label: 'Two-wheeler', ratePerKm: 5 },
    { type: 'car', label: 'Car', ratePerKm: 12 },
  ]);
  api.travelDay.mockResolvedValue({ success: true, data: day() });
  api.createTravelClaim.mockResolvedValue({ success: true, data: { _id: 'x1' } } as never);
});

async function ready(): Promise<HTMLInputElement> {
  const km = (await screen.findByLabelText(/kilometres/i)) as HTMLInputElement;
  await waitFor(() => expect(screen.getByRole('option', { name: /Two-wheeler/ })).toBeInTheDocument());
  return km;
}

describe('TravelClaimsPage', () => {
  it('claims the calculated km without a reason', async () => {
    renderPage();
    const km = await ready();
    expect(km).toHaveValue(40);
    expect(api.travelDay).toHaveBeenCalledWith('2026-10-22');
    await userEvent.selectOptions(screen.getByLabelText(/vehicle/i), 'bike');
    expect(screen.getByTestId('claim-amount')).toHaveTextContent('₹200');

    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^submit$/i }));
    await waitFor(() => expect(api.createTravelClaim).toHaveBeenCalledTimes(1));
    // The km is left out, so the server uses its own calculation.
    expect(api.createTravelClaim).toHaveBeenCalledWith({ date: '2026-10-22', vehicleType: 'bike' });
  });

  it('requires a reason when the km differs from the calculation by more than 5 %', async () => {
    renderPage();
    const km = await ready();
    await userEvent.selectOptions(screen.getByLabelText(/vehicle/i), 'bike');
    await userEvent.clear(km);
    await userEvent.type(km, '50');

    expect(await screen.findByText(/more than 5 %/i)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /submit claim/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/reason/i), 'Road closed, took the bypass');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await userEvent.click(await screen.findByRole('button', { name: /^submit$/i }));
    await waitFor(() =>
      expect(api.createTravelClaim).toHaveBeenCalledWith({
        date: '2026-10-22',
        vehicleType: 'bike',
        km: 50,
        reason: 'Road closed, took the bypass',
      }),
    );
  });

  it('accepts a small correction (within 5 %) without a reason', async () => {
    renderPage();
    const km = await ready();
    await userEvent.selectOptions(screen.getByLabelText(/vehicle/i), 'car');
    await userEvent.clear(km);
    await userEvent.type(km, '41.5');
    expect(screen.queryByText(/more than 5 %/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-amount')).toHaveTextContent('₹498');
    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^submit$/i }));
    await waitFor(() =>
      expect(api.createTravelClaim).toHaveBeenCalledWith({ date: '2026-10-22', vehicleType: 'car', km: 41.5 }),
    );
  });

  it('shows the existing claim instead of the form', async () => {
    api.travelDay.mockResolvedValue({
      success: true,
      data: day({ claim: { _id: 'c1', status: 'pending', km: 40, amount: 200 } }),
    });
    renderPage();
    expect(await screen.findByText(/already claimed/i)).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
  });

  it('explains that a day without a completed visit cannot be claimed', async () => {
    api.travelDay.mockResolvedValue({ success: true, data: day({ hasCompletedVisit: false }) });
    renderPage();
    expect(await screen.findByText(/no completed visit/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
  });

  it('offers no claim while no vehicle has a rate, and says to set it in Field settings', async () => {
    api.vehicles.mockResolvedValue([
      { type: 'bike', label: 'Two-wheeler', ratePerKm: 0 },
      { type: 'car', label: 'Car', ratePerKm: 0 },
    ]);
    renderPage();
    expect(await screen.findByText(/vehicle rates are not set yet/i)).toBeInTheDocument();
    expect(screen.getByText(/set the vehicle rates in Field settings/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit claim/i })).not.toBeInTheDocument();
  });

  it('does not let a vehicle without a rate be picked', async () => {
    api.vehicles.mockResolvedValue([
      { type: 'bike', label: 'Two-wheeler', ratePerKm: 5 },
      { type: 'car', label: 'Car', ratePerKm: 0 },
    ]);
    renderPage();
    await ready();
    expect(screen.getByRole('option', { name: /Car — rate not set/ })).toBeDisabled();
    expect(screen.getByTestId('unrated-vehicles')).toHaveTextContent(/No rate per km is set for Car/);
    expect(screen.getByTestId('unrated-vehicles')).toHaveTextContent(/Field settings/);
  });

  it('never offers a ₹0 claim', async () => {
    renderPage();
    const km = await ready();
    await userEvent.selectOptions(screen.getByLabelText(/vehicle/i), 'bike');
    await userEvent.clear(km);
    await userEvent.type(km, '0');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Did not travel');
    expect(screen.getByTestId('claim-amount')).toHaveTextContent('₹0');
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing to claim/i);
    expect(screen.getByRole('button', { name: /submit claim/i })).toBeDisabled();
  });

  it('says in plain words why the server refused the claim, and reloads the rates', async () => {
    const { toast } = await import('sonner');
    api.createTravelClaim.mockRejectedValue(
      new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { success: false, error: { code: 'VEHICLE_RATE_NOT_SET', message: 'raw server text' } },
      }),
    );
    renderPage();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(/vehicle/i), 'bike');
    await userEvent.click(screen.getByRole('button', { name: /submit claim/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^submit$/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/rate per km .* Field settings/i)),
    );
    await waitFor(() => expect(api.vehicles).toHaveBeenCalledTimes(2));
  });
});
