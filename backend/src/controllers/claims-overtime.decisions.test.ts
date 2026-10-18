/**
 * Expense-claim and overtime decisions: the approve route validates its body
 * and caps the accepted amount (payroll pays `acceptedAmount ?? amount`), a
 * decision is one conditional write — of two deciders racing, one wins and
 * the other is told 409 `DECIDED_MEANWHILE`, with one notification — nobody
 * reimburses their own claim, and an overtime request can only be withdrawn
 * while it is still pending.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { Model } from 'mongoose';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { ExpenseCategory, type IExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { Notification } from '../models/notification.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import type { IEmployee } from '../models/employee.model.js';
import type { IUser } from '../models/user.model.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(roleSlug: RoleSlug, fields: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  return { user, token, employee: await createEmployeeFor(user, fields) };
}

/**
 * Hold the first `count` `model.findById().exec()` reads until all of them
 * have returned, so every racer has read the pending record before any of
 * them writes — the race is forced, not hoped for.
 */
function holdReads(model: Model<never>, count = 2): void {
  const original = model.findById.bind(model) as unknown as (...args: unknown[]) => { exec: () => Promise<unknown> };
  let held = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(model, 'findById').mockImplementation(((...args: unknown[]) => {
    const query = original(...args);
    const exec = query.exec.bind(query);
    query.exec = async () => {
      const doc = await exec();
      if (held < count) {
        held += 1;
        if (held === count) release();
        await gate;
      }
      return doc;
    };
    return query;
  }) as never);
}

let app: Express;
let hr: Actor;
let otherHr: Actor;
let ann: Actor;

beforeEach(async () => {
  app = createApp();
  hr = await actor('hr_manager');
  otherHr = await actor('hr_executive');
  ann = await actor('employee');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('expense claims', () => {
  let category: IExpenseCategory;

  beforeEach(async () => {
    category = await ExpenseCategory.create({ name: 'Travel', code: 'TRV', requiresReceipt: false });
  });

  const claim = (owner: Actor = ann, fields: Record<string, unknown> = {}) =>
    ExpenseClaim.create({
      employeeId: owner.employee._id,
      category: category._id,
      amount: 1200,
      date: new Date('2026-10-10'),
      status: 'pending',
      ...fields,
    });
  const patch = (who: Actor, id: unknown, action: 'approve' | 'reject' | 'reimburse') =>
    request(app).patch(`/api/v1/expense-claims/requests/${String(id)}/${action}`).set(auth(who.token));
  const stored = async (id: unknown) => (await ExpenseClaim.findById(id).lean().exec())!;

  describe('approving', () => {
    it('a bodyless approve is validated, not a 500: the full amount is approved', async () => {
      const c = await claim();

      const res = await patch(hr, c._id, 'approve');

      expect(res.status).toBe(200);
      expect((await stored(c._id)).status).toBe('approved');
      expect((await stored(c._id)).acceptedAmount).toBeUndefined();
    });

    it('an accepted amount above the claimed amount is refused (400) and the claim stays pending', async () => {
      const c = await claim();

      const res = await patch(hr, c._id, 'approve').send({ acceptedAmount: 1500 });

      expect(res.status).toBe(400);
      expect((await stored(c._id)).status).toBe('pending');
      expect((await stored(c._id)).acceptedAmount).toBeUndefined();
    });

    it('a negative accepted amount is refused (400)', async () => {
      const c = await claim();

      const res = await patch(hr, c._id, 'approve').send({ acceptedAmount: -1 });

      expect(res.status).toBe(400);
      expect((await stored(c._id)).status).toBe('pending');
    });

    it('an accepted amount up to the claimed amount is stored', async () => {
      const lower = await claim();
      const full = await claim();

      expect((await patch(hr, lower._id, 'approve').send({ acceptedAmount: 1000 })).status).toBe(200);
      expect((await patch(hr, full._id, 'approve').send({ acceptedAmount: 1200 })).status).toBe(200);

      expect((await stored(lower._id)).acceptedAmount).toBe(1000);
      expect((await stored(full._id)).acceptedAmount).toBe(1200);
    });
  });

  describe('racing decisions', () => {
    it('an approve and a reject that both read the pending claim: one 200, one 409 DECIDED_MEANWHILE, one notification', async () => {
      const c = await claim();
      holdReads(ExpenseClaim as unknown as Model<never>);

      const [approve, reject] = await Promise.all([
        patch(hr, c._id, 'approve').send({}),
        patch(otherHr, c._id, 'reject').send({ reason: 'No bill' }),
      ]);
      vi.restoreAllMocks();

      expect([approve.status, reject.status].sort()).toEqual([200, 409]);
      const [winner, loser] = approve.status === 200 ? [approve, reject] : [reject, approve];
      expect(loser.body.error.code).toBe('DECIDED_MEANWHILE');
      const row = await stored(c._id);
      expect(row.status).toBe(winner === approve ? 'approved' : 'rejected');
      if (winner === approve) expect(row.rejectedReason).toBeUndefined();
      expect(await Notification.countDocuments({ userId: ann.user._id })).toBe(1);
    });

    it('two approvals racing: one 200, one 409, one notification', async () => {
      const c = await claim();
      holdReads(ExpenseClaim as unknown as Model<never>);

      const results = await Promise.all([
        patch(hr, c._id, 'approve').send({ acceptedAmount: 1000 }),
        patch(otherHr, c._id, 'approve').send({}),
      ]);
      vi.restoreAllMocks();

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await Notification.countDocuments({ userId: ann.user._id })).toBe(1);
    });
  });

  describe('reimbursing', () => {
    it('nobody reimburses their own claim: 403 SELF_APPROVAL, the claim stays approved', async () => {
      const own = await claim(hr, { status: 'approved' });

      const res = await patch(hr, own._id, 'reimburse').send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SELF_APPROVAL');
      expect((await stored(own._id)).status).toBe('approved');
      // Somebody else may.
      expect((await patch(otherHr, own._id, 'reimburse').send({})).status).toBe(200);
    });
  });
});

describe('overtime', () => {
  const pending = (owner: Actor = ann, fields: Record<string, unknown> = {}) =>
    OvertimeRequest.create({
      employee: owner.employee._id,
      date: new Date('2026-10-12'),
      hours: 2.5,
      reason: 'Month-end close',
      status: 'pending',
      ...fields,
    });
  const approve = (who: Actor, id: unknown) =>
    request(app).post(`/api/v1/overtime/${String(id)}/approve`).set(auth(who.token)).send({});
  const reject = (who: Actor, id: unknown) =>
    request(app).post(`/api/v1/overtime/${String(id)}/reject`).set(auth(who.token)).send({ reason: 'Not needed' });
  const withdraw = (who: Actor, id: unknown) => request(app).delete(`/api/v1/overtime/${String(id)}`).set(auth(who.token));

  describe('racing decisions', () => {
    it('an approve and a reject that both read the pending request: one 200, one 409 DECIDED_MEANWHILE, one notification', async () => {
      const ot = await pending();
      holdReads(OvertimeRequest as unknown as Model<never>);

      const [a, r] = await Promise.all([approve(hr, ot._id), reject(otherHr, ot._id)]);
      vi.restoreAllMocks();

      expect([a.status, r.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : r;
      expect(loser.body.error.code).toBe('DECIDED_MEANWHILE');
      const row = (await OvertimeRequest.findById(ot._id).lean().exec())!;
      expect(row.status).toBe(a.status === 200 ? 'approved' : 'rejected');
      if (a.status === 200) expect(row.rejectedReason).toBeUndefined();
      expect(await Notification.countDocuments({ userId: ann.user._id })).toBe(1);
    });
  });

  describe('withdrawing (DELETE)', () => {
    it('the owner withdraws a pending request', async () => {
      const ot = await pending();

      const res = await withdraw(ann, ot._id);

      expect(res.status).toBe(200);
      expect(await OvertimeRequest.findById(ot._id).exec()).toBeNull();
    });

    it('an approved or rejected request cannot be withdrawn — payroll pays approved overtime', async () => {
      const approved = await pending(ann, { status: 'approved' });
      const rejected = await pending(ann, { status: 'rejected', date: new Date('2026-10-13') });

      for (const ot of [approved, rejected]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await withdraw(ann, ot._id);
        expect(res.status).toBe(400);
        // eslint-disable-next-line no-await-in-loop
        expect(await OvertimeRequest.findById(ot._id).exec()).not.toBeNull();
      }
    });
  });
});
