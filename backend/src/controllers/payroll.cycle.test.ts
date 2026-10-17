/**
 * Payroll cycle lifecycle around the records (not the salary maths):
 *
 *   draft ─process─▶ processed ─lock─▶ locked ─markPaid─▶ paid
 *                     ▲   │ process (re-run) / edit
 *                     └───┘
 *
 * HR overrides live in `record.manualAdjustments` and survive a re-process;
 * a record is only reachable under its own cycle; the cycle's totals follow
 * its records; employees only ever see locked or paid payslips; the
 * statutory report sums lines by `statutoryType`.
 *
 * Cycles and records are written straight through the models where that is
 * the shortest way to a given state; everything under test goes over HTTP.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { User, type IUser } from '../models/user.model.js';
import { PayrollCycle, type IPayrollCycle, type PayrollCycleStatus } from '../models/payroll-cycle.model.js';
import { PayrollRecord, type IPayrollLine, type IPayrollRecord } from '../models/payroll-record.model.js';
import { settleCycle } from '../services/payroll-settlement.service.js';
import { payslipLines } from '../services/payslip-pdf.service.js';

vi.mock('../services/payroll-settlement.service.js', () => ({
  settleCycle: vi.fn(async () => undefined),
}));

const API = '/api/v1/payroll';
const round2 = (n: number): number => Math.round(n * 100) / 100;
const sum = (lines: Array<{ amount: number }>): number => round2(lines.reduce((s, l) => s + l.amount, 0));

let app: Express;

beforeEach(() => {
  app = createApp();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(settleCycle).mockClear();
});

interface Actor {
  user: IUser;
  auth: { Authorization: string };
}

async function actor(roleSlug: RoleSlug): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  return { user, auth: { Authorization: `Bearer ${token}` } };
}

async function staff(roleSlug: RoleSlug = 'employee'): Promise<Actor & { emp: IEmployee }> {
  const a = await actor(roleSlug);
  return { ...a, emp: await createEmployeeFor(a.user) };
}

let nextMonth = 1;
async function cycle(status: PayrollCycleStatus, fields: Partial<IPayrollCycle> = {}): Promise<IPayrollCycle> {
  const month = nextMonth;
  nextMonth = (nextMonth % 12) + 1;
  return PayrollCycle.create({ month, year: 2026, status, ...fields });
}

const line = (name: string, amount: number, statutoryType?: IPayrollLine['statutoryType']): IPayrollLine =>
  statutoryType ? { name, amount, statutoryType } : { name, amount };

/** A record whose lines add up to its totals: 30,000 basic less 1,800 PF. */
async function record(
  c: IPayrollCycle,
  employeeId: Types.ObjectId,
  fields: Partial<IPayrollRecord> = {},
): Promise<IPayrollRecord> {
  return PayrollRecord.create({
    cycleId: c._id,
    employeeId,
    earnings: [line('Basic', 30000)],
    deductions: [line('PF Employee', 1800, 'pf')],
    grossSalary: 30000,
    totalDeductions: 1800,
    netSalary: 28200,
    ...fields,
  });
}

const otherEmployeeId = (): Types.ObjectId => new Types.ObjectId();

/* ──────────────────────────────────────────────────────────── */

describe('POST /payroll/cycles/:id/process', () => {
  it.each(['paid', 'locked', 'processing'] as const)('refuses a %s cycle with 409 and leaves its records alone', async (status) => {
    const hr = await actor('hr_manager');
    const c = await cycle(status);
    const r = await record(c, otherEmployeeId(), { arrears: 0 });

    const res = await request(app).post(`${API}/cycles/${String(c._id)}/process`).set(hr.auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CYCLE_NOT_EDITABLE');
    expect((await PayrollCycle.findById(c._id).lean())!.status).toBe(status);
    expect(await PayrollRecord.countDocuments({ cycleId: c._id })).toBe(1);
    expect(await PayrollRecord.exists({ _id: r._id })).toBeTruthy();
  });

  it('re-processing a processed cycle keeps the HR override (arrears 500 and its line)', async () => {
    const hr = await actor('hr_manager');
    const { emp } = await staff();
    emp.salary.basic = 30000;
    await emp.save();
    const c = await cycle('draft');
    const id = String(c._id);

    expect((await request(app).post(`${API}/cycles/${id}/process`).set(hr.auth)).status).toBe(200);
    const first = (await PayrollRecord.findOne({ cycleId: c._id, employeeId: emp._id }).lean())!;
    expect(first.arrears).toBe(0);

    const patch = await request(app)
      .patch(`${API}/cycles/${id}/records/${String(first._id)}`)
      .set(hr.auth)
      .send({ arrears: 500 });
    expect(patch.status).toBe(200);
    expect(patch.body.data.arrears).toBe(500);
    expect(patch.body.data.earnings).toContainEqual(expect.objectContaining({ name: 'Arrears', amount: 500 }));

    const again = await request(app).post(`${API}/cycles/${id}/process`).set(hr.auth);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe('processed');

    const rebuilt = (await PayrollRecord.findOne({ cycleId: c._id, employeeId: emp._id }).lean())!;
    expect(String(rebuilt._id)).not.toBe(String(first._id)); // really rebuilt, not left alone
    expect(rebuilt.arrears).toBe(500);
    expect(rebuilt.manualAdjustments.arrears).toBe(500);
    expect(rebuilt.earnings).toContainEqual(expect.objectContaining({ name: 'Arrears', amount: 500 }));
    expect(rebuilt.grossSalary).toBe(round2(first.grossSalary + 500));
    expect(rebuilt.grossSalary).toBe(sum(rebuilt.earnings));
    expect(rebuilt.netSalary).toBe(round2(rebuilt.grossSalary - rebuilt.totalDeductions));

    const after = (await PayrollCycle.findById(c._id).lean())!;
    expect(after.totalGross).toBe(rebuilt.grossSalary);
    expect(after.totalNet).toBe(rebuilt.netSalary);
    expect(after.employeeCount).toBe(1);
  });

  it('re-applies every kind of override, each with its line, on re-process', async () => {
    const hr = await actor('hr_manager');
    const { emp } = await staff();
    emp.salary.basic = 30000;
    await emp.save();
    const c = await cycle('draft');
    const id = String(c._id);
    await request(app).post(`${API}/cycles/${id}/process`).set(hr.auth);
    const first = (await PayrollRecord.findOne({ cycleId: c._id }).lean())!;

    await request(app)
      .patch(`${API}/cycles/${id}/records/${String(first._id)}`)
      .set(hr.auth)
      .send({ advance: 1000, expense: 250, reimbursements: 300, loanDeduction: 700, tds: 1200, note: 'Sept fixes' })
      .expect(200);
    await request(app).post(`${API}/cycles/${id}/process`).set(hr.auth).expect(200);

    const r = (await PayrollRecord.findOne({ cycleId: c._id }).lean())!;
    expect(r).toMatchObject({ advance: 1000, expense: 250, reimbursements: 300, loanDeduction: 700, tds: 1200 });
    expect(r.manualAdjustments.note).toBe('Sept fixes');
    expect(r.earnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Expense', amount: 250 }),
        expect.objectContaining({ name: 'Reimbursements', amount: 300 }),
      ]),
    );
    expect(r.deductions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Advance', amount: 1000 }),
        expect.objectContaining({ name: 'Loan Deduction', amount: 700 }),
        expect.objectContaining({ name: 'TDS', amount: 1200, statutoryType: 'tds' }),
      ]),
    );
    expect(r.grossSalary).toBe(sum(r.earnings));
    expect(r.totalDeductions).toBe(sum(r.deductions));
    expect(r.netSalary).toBe(round2(r.grossSalary - r.totalDeductions));
  });

  it('puts the cycle back where it was when processing fails part-way', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');
    const r = await record(c, otherEmployeeId());
    vi.spyOn(Employee, 'find').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const res = await request(app).post(`${API}/cycles/${String(c._id)}/process`).set(hr.auth);

    expect(res.status).toBe(500);
    expect((await PayrollCycle.findById(c._id).lean())!.status).toBe('processed');
    expect(await PayrollRecord.exists({ _id: r._id })).toBeTruthy();
    // ...and it can be processed again rather than being stuck in `processing`.
    expect((await request(app).post(`${API}/cycles/${String(c._id)}/process`).set(hr.auth)).status).toBe(200);
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('PATCH /payroll/cycles/:id/records/:recordId', () => {
  it('404s a record addressed under a cycle it does not belong to', async () => {
    const hr = await actor('hr_manager');
    const mine = await cycle('processed');
    const other = await cycle('processed');
    const r = await record(mine, otherEmployeeId());

    const res = await request(app)
      .patch(`${API}/cycles/${String(other._id)}/records/${String(r._id)}`)
      .set(hr.auth)
      .send({ arrears: 500 });

    expect(res.status).toBe(404);
    const unchanged = (await PayrollRecord.findById(r._id).lean())!;
    expect(unchanged.arrears).toBe(0);
    expect(unchanged.manualAdjustments.arrears).toBeNull();
  });

  it.each(['locked', 'paid', 'processing'] as const)('refuses edits on a %s cycle with 409', async (status) => {
    const hr = await actor('hr_manager');
    const c = await cycle(status);
    const r = await record(c, otherEmployeeId());

    const res = await request(app)
      .patch(`${API}/cycles/${String(c._id)}/records/${String(r._id)}`)
      .set(hr.auth)
      .send({ arrears: 500 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CYCLE_NOT_EDITABLE');
    expect((await PayrollRecord.findById(r._id).lean())!.arrears).toBe(0);
  });

  it('after an edit the cycle totals equal the sum of its records', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed', { totalGross: 60000, totalDeductions: 3600, totalNet: 56400, employeeCount: 2 });
    const a = await record(c, otherEmployeeId());
    await record(c, otherEmployeeId(), {
      earnings: [line('Basic', 20000)],
      deductions: [],
      grossSalary: 20000,
      totalDeductions: 0,
      netSalary: 20000,
    });

    await request(app)
      .patch(`${API}/cycles/${String(c._id)}/records/${String(a._id)}`)
      .set(hr.auth)
      .send({ arrears: 1000, loanDeduction: 400 })
      .expect(200);

    const records = await PayrollRecord.find({ cycleId: c._id }).lean();
    const after = (await PayrollCycle.findById(c._id).lean())!;
    expect(after.totalNet).toBe(round2(records.reduce((s, r) => s + r.netSalary, 0)));
    expect(after.totalGross).toBe(round2(records.reduce((s, r) => s + r.grossSalary, 0)));
    expect(after.totalDeductions).toBe(round2(records.reduce((s, r) => s + r.totalDeductions, 0)));
    expect(after.totalNet).toBe(28200 + 1000 - 400 + 20000);
  });

  it('writes only manual adjustments: raw line arrays and computed fields are ignored', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');
    const r = await record(c, otherEmployeeId(), { overtimeAmount: 0, lateDeduction: 0 });

    const res = await request(app)
      .patch(`${API}/cycles/${String(c._id)}/records/${String(r._id)}`)
      .set(hr.auth)
      .send({
        earnings: [{ name: 'Basic', amount: 99999 }],
        deductions: [],
        overtimeAmount: 5000,
        lateDeduction: 300,
        arrears: 200,
      });

    expect(res.status).toBe(200);
    const after = (await PayrollRecord.findById(r._id).lean())!;
    expect(after.earnings).toEqual([
      expect.objectContaining({ name: 'Basic', amount: 30000 }),
      expect.objectContaining({ name: 'Arrears', amount: 200 }),
    ]);
    expect(after.deductions).toEqual([expect.objectContaining({ name: 'PF Employee', amount: 1800 })]);
    expect(after.overtimeAmount).toBe(0);
    expect(after.lateDeduction).toBe(0);
    expect(after).toMatchObject({ grossSalary: 30200, totalDeductions: 1800, netSalary: 28400 });
  });

  it('rejects a negative override with 400', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');
    const r = await record(c, otherEmployeeId());

    const res = await request(app)
      .patch(`${API}/cycles/${String(c._id)}/records/${String(r._id)}`)
      .set(hr.auth)
      .send({ arrears: -1 });

    expect(res.status).toBe(400);
  });

  it('null clears an override and drops its line', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');
    const r = await record(c, otherEmployeeId());
    const url = `${API}/cycles/${String(c._id)}/records/${String(r._id)}`;

    const set = await request(app).patch(url).set(hr.auth).send({ arrears: 500, tds: 900 });
    expect(set.status).toBe(200);
    expect(set.body.data.manualAdjustments).toMatchObject({ arrears: 500, tds: 900 });
    expect(set.body.data.earnings.map((l: IPayrollLine) => l.name)).toEqual(['Basic', 'Arrears']);
    expect(set.body.data.deductions.map((l: IPayrollLine) => l.name)).toEqual(['PF Employee', 'TDS']);

    const res = await request(app).patch(url).set(hr.auth).send({ arrears: null, tds: null });

    expect(res.status).toBe(200);
    const after = (await PayrollRecord.findById(r._id).lean())!;
    expect(after.manualAdjustments.arrears).toBeNull();
    expect(after.manualAdjustments.tds).toBeNull();
    expect(after.arrears).toBe(0);
    expect(after.tds).toBe(0);
    expect(after.earnings.map((l) => l.name)).toEqual(['Basic']);
    expect(after.deductions.map((l) => l.name)).toEqual(['PF Employee']);
    expect(after).toMatchObject({ grossSalary: 30000, totalDeductions: 1800, netSalary: 28200 });
  });

  it('a TDS override replaces the existing TDS line in place instead of adding a second', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');
    const r = await record(c, otherEmployeeId(), {
      deductions: [line('PF Employee', 1800, 'pf'), line('Income Tax', 900, 'tds'), line('P.Tax', 200, 'pt')],
      tds: 900,
      totalDeductions: 2900,
      netSalary: 27100,
    });

    await request(app)
      .patch(`${API}/cycles/${String(c._id)}/records/${String(r._id)}`)
      .set(hr.auth)
      .send({ tds: 1200 })
      .expect(200);

    const after = (await PayrollRecord.findById(r._id).lean())!;
    expect(after.deductions).toEqual([
      expect.objectContaining({ name: 'PF Employee', amount: 1800 }),
      expect.objectContaining({ name: 'Income Tax', amount: 1200, statutoryType: 'tds' }),
      expect.objectContaining({ name: 'P.Tax', amount: 200 }),
    ]);
    expect(after).toMatchObject({ tds: 1200, totalDeductions: 3200, netSalary: 26800 });
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('POST /payroll/cycles/:id/lock', () => {
  it.each(['draft', 'processing', 'locked', 'paid'] as const)('refuses to lock a %s cycle with 409', async (status) => {
    const hr = await actor('hr_manager');
    const c = await cycle(status);

    const res = await request(app).post(`${API}/cycles/${String(c._id)}/lock`).set(hr.auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CYCLE_NOT_EDITABLE');
    expect((await PayrollCycle.findById(c._id).lean())!.status).toBe(status);
  });

  it('locks a processed cycle and records who and when', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed');

    const res = await request(app).post(`${API}/cycles/${String(c._id)}/lock`).set(hr.auth);

    expect(res.status).toBe(200);
    const after = (await PayrollCycle.findById(c._id).lean())!;
    expect(after.status).toBe('locked');
    expect(after.lockedAt).toBeInstanceOf(Date);
    expect(String(after.lockedBy)).toBe(String(hr.user._id));
  });
});

describe('POST /payroll/cycles/:id/mark-paid', () => {
  it.each(['draft', 'processing', 'processed', 'paid'] as const)('refuses to mark a %s cycle paid with 409', async (status) => {
    const hr = await actor('hr_manager');
    const c = await cycle(status);
    const r = await record(c, otherEmployeeId());

    const res = await request(app)
      .post(`${API}/cycles/${String(c._id)}/mark-paid`)
      .set(hr.auth)
      .send({ paymentRef: 'NEFT-1' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CYCLE_NOT_EDITABLE');
    expect((await PayrollCycle.findById(c._id).lean())!.status).toBe(status);
    expect((await PayrollRecord.findById(r._id).lean())!.paymentStatus).toBe('pending');
    expect(settleCycle).not.toHaveBeenCalled();
  });

  it('pays a locked cycle: stamps paidAt/paidBy, marks every record paid, then settles', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('locked');
    const a = await record(c, otherEmployeeId());
    const b = await record(c, otherEmployeeId());

    const res = await request(app)
      .post(`${API}/cycles/${String(c._id)}/mark-paid`)
      .set(hr.auth)
      .send({ paymentRef: 'NEFT-42' });

    expect(res.status).toBe(200);
    const after = (await PayrollCycle.findById(c._id).lean())!;
    expect(after.status).toBe('paid');
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(String(after.paidBy)).toBe(String(hr.user._id));
    expect(after.paymentRef).toBe('NEFT-42');
    for (const r of [a, b]) {
      const paid = (await PayrollRecord.findById(r._id).lean())!;
      expect(paid.paymentStatus).toBe('paid');
      expect(paid.paymentRef).toBe('NEFT-42');
    }
    expect(settleCycle).toHaveBeenCalledTimes(1);
    const settled = vi.mocked(settleCycle).mock.calls[0]![0];
    expect(String(settled._id)).toBe(String(c._id));
    expect(settled.status).toBe('paid');
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('employee visibility: only locked or paid cycles', () => {
  it('my-payslips hides a processed cycle and shows locked and paid ones', async () => {
    const me = await staff();
    const processed = await cycle('processed');
    const locked = await cycle('locked');
    const paid = await cycle('paid');
    const draftRec = await record(processed, me.emp._id as Types.ObjectId);
    const lockedRec = await record(locked, me.emp._id as Types.ObjectId);
    const paidRec = await record(paid, me.emp._id as Types.ObjectId);

    const res = await request(app).get(`${API}/my-payslips`).set(me.auth);

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ _id: string }>).map((r) => r._id).sort();
    expect(ids).toEqual([String(lockedRec._id), String(paidRec._id)].sort());
    expect(ids).not.toContain(String(draftRec._id));
  });

  it('my-payslips/:id 404s the employee’s own record while its cycle is only processed', async () => {
    const me = await staff();
    const processed = await cycle('processed');
    const locked = await cycle('locked');
    const hidden = await record(processed, me.emp._id as Types.ObjectId);
    const shown = await record(locked, me.emp._id as Types.ObjectId);

    expect((await request(app).get(`${API}/my-payslips/${String(hidden._id)}`).set(me.auth)).status).toBe(404);
    const ok = await request(app).get(`${API}/my-payslips/${String(shown._id)}`).set(me.auth);
    expect(ok.status).toBe(200);
    expect(ok.body.data._id).toBe(String(shown._id));
  });

  it('payslip download 404s for the employee while the cycle is only processed', async () => {
    const me = await staff();
    const processed = await cycle('processed');
    const locked = await cycle('locked');
    const hidden = await record(processed, me.emp._id as Types.ObjectId, { payslipUrl: '/uploads/payslips/x/a.pdf' });
    const shown = await record(locked, me.emp._id as Types.ObjectId, { payslipUrl: '/uploads/payslips/x/b.pdf' });

    expect((await request(app).get(`${API}/records/${String(hidden._id)}/payslip`).set(me.auth)).status).toBe(404);
    expect((await request(app).get(`${API}/records/${String(shown._id)}/payslip`).set(me.auth)).status).toBe(200);
  });

  it('payroll staff still see a processed record', async () => {
    const hr = await actor('hr_manager');
    const someone = await staff();
    const c = await cycle('processed');
    const r = await record(c, someone.emp._id as Types.ObjectId);

    expect((await request(app).get(`${API}/records/${String(r._id)}`).set(hr.auth)).status).toBe(200);
    expect((await request(app).get(`${API}/my-payslips/${String(r._id)}`).set(hr.auth)).status).toBe(200);
  });

  it('privilege comes from the payroll.process permission, not the role slug', async () => {
    const someone = await staff();
    const c = await cycle('processed');
    const r = await record(c, someone.emp._id as Types.ObjectId);

    // An `employee`-role user granted payroll.process directly sees anybody's record...
    const granted = await staff();
    await User.updateOne({ _id: granted.user._id }, { $set: { customPermissions: ['payroll.process'] } });
    expect((await request(app).get(`${API}/my-payslips/${String(r._id)}`).set(granted.auth)).status).toBe(200);

    // ...while an HR executive (payroll.view only) is still limited to their own.
    const exec = await staff('hr_executive');
    expect((await request(app).get(`${API}/my-payslips/${String(r._id)}`).set(exec.auth)).status).toBe(403);
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('GET /payroll/reports/statutory', () => {
  it('sums lines by statutoryType, falling back to the name for legacy lines', async () => {
    const hr = await actor('hr_manager');
    const c = await cycle('processed', { month: 8, year: 2025 });
    await record(c, otherEmployeeId(), {
      deductions: [
        line('Provident Fund', 1800, 'pf'), // typed: the name alone would not match "PF"
        line('ESI Employee', 150), // legacy: no type, counted by name
        line('P.Tax', 200, 'pt'),
        line('Income Tax', 1200, 'tds'),
      ],
      employerContributions: [line('Employer Provident Fund', 1800, 'pf'), line('ESI Employer', 650)],
    });
    await record(c, otherEmployeeId(), {
      deductions: [line('PF Employee', 1440), line('ESIC Employee', 100), line('Professional Tax', 200)],
      employerContributions: [line('PF Employer', 1440), line('ESIC Employer', 433.33)],
    });

    const res = await request(app).get(`${API}/reports/statutory?year=2025&month=8`).set(hr.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({
      pfEmployee: 3240,
      pfEmployer: 3240,
      esicEmployee: 250,
      esicEmployer: 1083.33,
      professionalTax: 400,
      tds: 1200,
    });
    expect(res.body.data.records).toHaveLength(2);
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('payslipLines (what the PDF prints)', () => {
  it('adds rows for amounts a legacy record kept only as fields, so rows add up to the totals', () => {
    const legacy = {
      earnings: [line('Basic', 30000)],
      deductions: [line('PF Employee', 1800)],
      arrears: 500,
      reimbursements: 300,
      loanDeduction: 1000,
      overtimeAmount: 0,
      expense: 0,
      advance: 0,
      lateDeduction: 0,
      tds: 0,
      grossSalary: 30800,
      totalDeductions: 2800,
      netSalary: 28000,
    };

    const { earnings, deductions } = payslipLines(legacy);

    expect(earnings.map((l) => l.name)).toEqual(['Basic', 'Arrears', 'Reimbursements']);
    expect(deductions.map((l) => l.name)).toEqual(['PF Employee', 'Loan Deduction']);
    expect(sum(earnings)).toBe(legacy.grossSalary);
    expect(sum(deductions)).toBe(legacy.totalDeductions);
  });

  it('prints a current record’s lines as they are, without duplicating them', () => {
    const current = {
      earnings: [line('Basic', 30000), line('Over Time', 120), line('Arrears', 500)],
      deductions: [line('PF Employee', 1800, 'pf'), line('Income Tax', 900, 'tds'), line('Late Deduction', 250)],
      arrears: 500,
      reimbursements: 0,
      loanDeduction: 0,
      overtimeAmount: 120,
      expense: 0,
      advance: 0,
      lateDeduction: 250,
      tds: 900,
      grossSalary: 30620,
      totalDeductions: 2950,
      netSalary: 27670,
    };

    const { earnings, deductions } = payslipLines(current);

    expect(earnings).toEqual(current.earnings);
    expect(deductions).toEqual(current.deductions);
  });
});
