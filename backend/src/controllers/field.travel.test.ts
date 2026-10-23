/**
 * Travel allowance by km: the day's km (the legs between its check-in/out
 * points), one claim per employee per day into normal expense approval —
 * amount = round(km × the vehicle's ₹/km), category "Travel allowance"
 * (created on first use), a reason when the claimed km differs from the
 * computed km by more than 5 %, nothing to claim without a completed visit —
 * and the approver seeing computed vs claimed km. Also: an expense linked to
 * a visit (`visitId`).
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser } from '../test/factories.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { estimatedLegMeters } from '../services/google-maps.service.js';
import { updateFieldSettings } from '../services/field-settings.service.js';
import {
  PLACES,
  actor,
  auth,
  dayIn,
  dayLabel,
  dayOut,
  makeSite,
  visitAt,
  type Actor,
} from '../test/field-day-fixtures.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const DAY = '2026-10-15';
const km = (metres: number): number => Math.round(metres / 10) / 100;
/** home → Site A → home, straight line × 1.3 (no Google key in tests). */
const DAY_KM = km(estimatedLegMeters(PLACES.home, PLACES.siteA) * 2);

let app: Express;
let boss: Actor;
let asha: Actor;

beforeEach(async () => {
  app = createApp();
  boss = await actor('field_manager', { firstName: 'Boss' });
  asha = await actor('field_employee', { firstName: 'Asha', reportingManager: boss.employee._id, isFieldStaff: true });
  await updateFieldSettings({
    vehicles: [
      { type: 'bike', label: 'Two-wheeler', ratePerKm: 4 },
      { type: 'car', label: 'Car', ratePerKm: 9.5 },
      { type: 'other', label: 'Bus', ratePerKm: 0 },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fieldDay(who: Actor, day = DAY): Promise<void> {
  const siteA = await makeSite(`Site A ${day}`, PLACES.siteA);
  await dayIn(who, day, '09:00', PLACES.home);
  await visitAt(who, siteA, day, { in: '10:00', out: '11:00' });
  await dayOut(who, day, '18:00', PLACES.home);
}

const travelDay = (who: Actor, date = DAY) =>
  request(app).get('/api/v1/field/travel/day').query({ date }).set(auth(who.token));

const claim = (who: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/travel/claims').set(auth(who.token)).send({ date: DAY, ...body });

describe('GET /field/travel/day', () => {
  it('the day’s km, legs and whether a visit was completed; the claim once made', async () => {
    await fieldDay(asha);
    const before = await travelDay(asha);
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({
      date: DAY,
      totalKm: DAY_KM,
      estimated: true,
      hasCompletedVisit: true,
      claim: null,
    });
    expect(before.body.data.legs).toHaveLength(2);

    const made = await claim(asha, { vehicleType: 'bike' });
    expect(made.status).toBe(201);
    const after = await travelDay(asha);
    expect(after.body.data.claim).toEqual({
      _id: made.body.data._id,
      status: 'pending',
      km: DAY_KM,
      amount: Math.round(DAY_KM * 4),
    });
  });

  it('a day without visits: no km, no completed visit', async () => {
    const res = await travelDay(asha);
    expect(res.body.data).toMatchObject({ totalKm: 0, legs: [], hasCompletedVisit: false, claim: null });
  });

  it('needs an employee record', async () => {
    const hr = await createUser({ roleSlug: 'hr_executive' });
    const res = await request(app).get('/api/v1/field/travel/day').query({ date: DAY }).set(auth(hr.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('POST /field/travel/claims', () => {
  it('books km × rate (rounded) in "Travel allowance", pending approval; the approver sees computed and claimed km', async () => {
    await fieldDay(asha);
    const res = await claim(asha, { vehicleType: 'car' });
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data).toMatchObject({
      amount: Math.round(DAY_KM * 9.5),
      status: 'pending',
      currency: 'INR',
      employeeId: String(asha.employee._id),
      receiptUrls: [],
      travel: {
        date: DAY,
        vehicleType: 'car',
        ratePerKm: 9.5,
        computedKm: DAY_KM,
        claimedKm: DAY_KM,
        estimated: true,
      },
    });
    expect(data.travel).not.toHaveProperty('reason');
    expect(data.travel.legs).toHaveLength(2);
    expect(data.travel.points.map((p: { kind: string }) => p.kind)).toEqual(['day_in', 'visit_in', 'visit_out', 'day_out']);
    expect(new Date(data.date).toISOString()).toBe(dayLabel(DAY).toISOString());

    const categories = await ExpenseCategory.find({}).lean();
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ name: 'Travel allowance', requiresReceipt: false, isActive: true });
    expect(data.category).toMatchObject({ _id: String(categories[0]!._id), name: 'Travel allowance' });

    const list = await request(app).get('/api/v1/expense-claims/requests').set(auth(boss.token));
    expect(list.status).toBe(200);
    const row = list.body.data.find((c: { _id: string }) => c._id === data._id);
    expect(row.travel).toMatchObject({ computedKm: DAY_KM, claimedKm: DAY_KM, vehicleType: 'car', ratePerKm: 9.5 });
    expect(row.category.name).toBe('Travel allowance');

    const detail = await request(app).get(`/api/v1/expense-claims/requests/${data._id}`).set(auth(boss.token));
    expect(detail.body.data.travel).toMatchObject({ computedKm: DAY_KM, claimedKm: DAY_KM });
  });

  it('reuses an existing "Travel allowance" category', async () => {
    const existing = await ExpenseCategory.create({ name: 'Travel Allowance', code: 'TA', requiresReceipt: false });
    await fieldDay(asha);
    const res = await claim(asha, { vehicleType: 'bike' });
    expect(res.status).toBe(201);
    expect(res.body.data.category._id).toBe(String(existing._id));
    expect(await ExpenseCategory.countDocuments()).toBe(1);
  });

  it('one claim per employee per day: 409 TA_ALREADY_CLAIMED, also when two arrive at once; again after a rejection or withdrawal', async () => {
    await fieldDay(asha);
    const [a, b] = await Promise.all([claim(asha, { vehicleType: 'bike' }), claim(asha, { vehicleType: 'bike' })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe('TA_ALREADY_CLAIMED');
    expect(await ExpenseClaim.countDocuments()).toBe(1);

    const first = [a, b].find((r) => r.status === 201)!.body.data;
    const again = await claim(asha, { vehicleType: 'car' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TA_ALREADY_CLAIMED');

    const rejected = await request(app)
      .patch(`/api/v1/expense-claims/requests/${first._id}/reject`)
      .set(auth(boss.token))
      .send({ reason: 'Wrong vehicle' });
    expect(rejected.status).toBe(200);
    const second = await claim(asha, { vehicleType: 'car' });
    expect(second.status).toBe(201);

    const withdrawn = await request(app).delete(`/api/v1/expense-claims/requests/${second.body.data._id}`).set(auth(asha.token));
    expect(withdrawn.status).toBe(200);
    expect((await claim(asha, { vehicleType: 'bike' })).status).toBe(201);
    expect(await ExpenseCategory.countDocuments()).toBe(1);
  });

  it('another employee, or another day, is a separate claim', async () => {
    const bala = await actor('field_employee', { firstName: 'Bala', reportingManager: boss.employee._id });
    await fieldDay(asha);
    await fieldDay(bala);
    await fieldDay(asha, '2026-10-16');
    expect((await claim(asha, { vehicleType: 'bike' })).status).toBe(201);
    expect((await claim(bala, { vehicleType: 'bike' })).status).toBe(201);
    expect((await claim(asha, { vehicleType: 'bike', date: '2026-10-16' })).status).toBe(201);
  });

  it('claimed km more than 5 % off the computed km needs a reason (400 REASON_REQUIRED); the approver sees both', async () => {
    await fieldDay(asha);
    const more = Math.round(DAY_KM * 1.1 * 10) / 10;
    const refused = await claim(asha, { vehicleType: 'bike', km: more });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('REASON_REQUIRED');
    expect(await ExpenseClaim.countDocuments()).toBe(0);

    const ok = await claim(asha, { vehicleType: 'bike', km: more, reason: 'Road closed, took the long way' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.amount).toBe(Math.round(more * 4));
    expect(ok.body.data.travel).toMatchObject({
      computedKm: DAY_KM,
      claimedKm: more,
      reason: 'Road closed, took the long way',
    });
  });

  it('within 5 % no reason is needed', async () => {
    await fieldDay(asha);
    const close = Math.round(DAY_KM * 1.04 * 100) / 100;
    const res = await claim(asha, { vehicleType: 'bike', km: close });
    expect(res.status).toBe(201);
    expect(res.body.data.travel.claimedKm).toBe(close);
  });

  it('400 NO_FIELD_WORK without a completed visit that day', async () => {
    const none = await claim(asha, { vehicleType: 'bike' });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('NO_FIELD_WORK');

    const siteA = await makeSite('Site A', PLACES.siteA);
    await dayIn(asha, DAY, '09:00', PLACES.home);
    await visitAt(asha, siteA, DAY, { in: '10:00' });
    const open = await claim(asha, { vehicleType: 'bike', km: 12, reason: 'Went to site A' });
    expect(open.status).toBe(400);
    expect(open.body.error.code).toBe('NO_FIELD_WORK');

    await fieldDay(asha, '2026-10-14');
    expect((await claim(asha, { vehicleType: 'bike', km: 12, reason: 'x' })).body.error.code).toBe('NO_FIELD_WORK');
  });

  it('a vehicle without a rate (₹0/km) or not offered in the settings is refused', async () => {
    await fieldDay(asha);
    const free = await claim(asha, { vehicleType: 'other' });
    expect(free.status).toBe(400);
    expect(free.body.error.code).toBe('VEHICLE_RATE_NOT_SET');

    await updateFieldSettings({ vehicles: [{ type: 'bike', label: 'Two-wheeler', ratePerKm: 4 }] });
    const unknown = await claim(asha, { vehicleType: 'car' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('UNKNOWN_VEHICLE');
    expect(await ExpenseClaim.countDocuments()).toBe(0);
  });

  it('validates the body', async () => {
    expect((await claim(asha, { vehicleType: 'jet' })).status).toBe(400);
    expect((await claim(asha, { vehicleType: 'bike', km: -1 })).status).toBe(400);
    expect((await claim(asha, { vehicleType: 'bike', date: '15/10/2026' })).status).toBe(400);
  });

  it('a travel claim’s km and amount cannot be edited through the expense form; the description can', async () => {
    await fieldDay(asha);
    const made = await claim(asha, { vehicleType: 'bike' });
    const id = made.body.data._id as string;
    const edit = await request(app).patch(`/api/v1/expense-claims/requests/${id}`).set(auth(asha.token)).send({ amount: 9999 });
    expect(edit.status).toBe(400);
    expect(edit.body.error.code).toBe('TRAVEL_CLAIM_LOCKED');
    const note = await request(app)
      .patch(`/api/v1/expense-claims/requests/${id}`)
      .set(auth(asha.token))
      .send({ description: 'Visited Site A' });
    expect(note.status).toBe(200);
    expect(note.body.data.description).toBe('Visited Site A');
    expect(note.body.data.amount).toBe(made.body.data.amount);
  });
});

describe('expense linked to a visit (visitId)', () => {
  it('stores the visit id and returns it as an id; another employee’s visit is refused', async () => {
    const food = await ExpenseCategory.create({ name: 'Food', code: 'FOOD', requiresReceipt: false });
    const siteA = await makeSite('Site A', PLACES.siteA);
    const own = await visitAt(asha, siteA, DAY, { in: '10:00', out: '11:00' });
    const zed = await actor('field_employee', { firstName: 'Zed' });
    const theirs = await visitAt(zed, siteA, DAY, { in: '12:00', out: '12:30' });

    const body = (visitId: string) => ({
      category: String(food._id),
      amount: 180,
      date: DAY,
      description: 'Lunch at site',
      receiptUrls: [{ name: 'bill.jpg', fileUrl: 'https://example.com/bill.jpg' }],
      visitId,
    });
    const res = await request(app).post('/api/v1/expense-claims/requests').set(auth(asha.token)).send(body(String(own._id)));
    expect(res.status).toBe(201);
    expect(res.body.data.visitId).toBe(String(own._id));

    const mine = await request(app).get('/api/v1/expense-claims/requests/my').set(auth(asha.token));
    expect(mine.body.data[0].visitId).toBe(String(own._id));

    const bad = await request(app).post('/api/v1/expense-claims/requests').set(auth(asha.token)).send(body(String(theirs._id)));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_VISIT');
    expect((await request(app).post('/api/v1/expense-claims/requests').set(auth(asha.token)).send(body('nope'))).status).toBe(400);
  });
});
