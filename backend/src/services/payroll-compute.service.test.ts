/**
 * Payroll computation (`payroll-compute.service.ts`) and what happens on
 * pay-out (`payroll-settlement.service.ts`).
 *
 *  - Pay covers the paid window: joining date (or the 1st) to exit date (or
 *    the last day); every earning is pro-rated by days paid / days in month.
 *  - Days paid = window days − loss of pay, and loss of pay comes from the
 *    attendance rows (absent, unpaid leave, half days not on paid leave)
 *    plus approved unpaid leave days that have no row yet.
 *  - A salary structure, when assigned, decides the earning lines.
 *  - Loan EMIs due in the month, approved expense claims and the declared
 *    monthly TDS are computed; HR overrides win; paying the cycle settles
 *    what the records counted, once.
 *
 * Reference month: September 2026 — 30 days, Tue 1 … Wed 30. Default
 * week-off rule (every Sunday + the 4th Saturday): Sun 6/13/20/27 and Sat 26
 * are off; Sat 19 (3rd Saturday) is a working day.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { logger } from '../config/logger.js';
import { createUser } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim, type IExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import { Loan, type ILoan } from '../models/loan.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { PayrollCycle, type IPayrollCycle } from '../models/payroll-cycle.model.js';
import { PayrollRecord, type IPayrollLine } from '../models/payroll-record.model.js';
import { SalaryComponent } from '../models/salary-component.model.js';
import { SalaryStructure } from '../models/salary-structure.model.js';
import { invalidateWeekOffRule } from './week-off.service.js';
import { payslipLines } from './payslip-pdf.service.js';
import {
  computeRecord,
  dayTally,
  earningsFor,
  paidWindow,
  type PayrollComputeConfig,
} from './payroll-compute.service.js';
import { settleCycle } from './payroll-settlement.service.js';

const API = '/api/v1';
const cfg: PayrollComputeConfig = { freeLateDaysPerMonth: 3 };

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const amountOf = (lines: IPayrollLine[], name: string): number | undefined =>
  lines.find((l) => l.name === name)?.amount;

let app: Express;
let auth: { Authorization: string };

beforeEach(async () => {
  invalidateWeekOffRule();
  app = createApp();
  const { token } = await createUser({ roleSlug: 'admin' });
  auth = { Authorization: `Bearer ${token}` };
});

afterEach(() => {
  vi.restoreAllMocks();
});

let seq = 0;
async function makeEmployee(fields: Record<string, unknown> = {}): Promise<IEmployee> {
  seq += 1;
  return Employee.create({
    firstName: 'Pay',
    lastName: `Calc${seq}`,
    email: `pay.calc.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    salary: { basic: 30000 },
    ...fields,
  });
}

async function september(): Promise<IPayrollCycle> {
  return PayrollCycle.create({ year: 2026, month: 9, status: 'draft' });
}

async function leaveType(paid: boolean): Promise<ILeaveType> {
  return LeaveType.create({
    name: paid ? 'Casual Leave' : 'Leave Without Pay',
    code: paid ? 'CL' : 'LWP',
    daysAllowed: 12,
    paidLeave: paid,
  });
}

async function approvedLeave(emp: IEmployee, type: ILeaveType, from: string, to: string, days: number, isHalfDay = false) {
  return LeaveRequest.create({
    employeeId: emp._id,
    leaveTypeId: type._id,
    startDate: label(from),
    endDate: label(to),
    days,
    isHalfDay,
    reason: 'test',
    status: 'approved',
  });
}

let loanSeq = 0;
/** An active, interest-free loan with one instalment due on the 1st of each month given. */
async function loanFor(emp: IEmployee, dueMonths: string[], emi = 2000): Promise<ILoan> {
  const total = emi * dueMonths.length;
  loanSeq += 1;
  return Loan.create({
    loanNumber: `LN-${String(loanSeq).padStart(5, '0')}`,
    employee: emp._id,
    principalAmount: total,
    interestRate: 0,
    tenureMonths: dueMonths.length,
    emiAmount: emi,
    totalPayable: total,
    totalInterest: 0,
    status: 'active',
    installments: dueMonths.map((m, i) => ({
      installmentNumber: i + 1,
      dueDate: label(`${m}-01`),
      amount: emi,
      principalAmount: emi,
      interestAmount: 0,
    })),
    outstandingPrincipal: total,
    outstandingTotal: total,
    totalPaid: 0,
  });
}

/** Loads `salaryStructureId` with its components, the way processCycle loads employees. */
async function populateStructure(emp: IEmployee): Promise<void> {
  await emp.populate({ path: 'salaryStructureId', populate: { path: 'components.componentId' } });
}

let categoryId: Types.ObjectId | undefined;
async function claimFor(emp: IEmployee, fields: Partial<Record<keyof IExpenseClaim, unknown>>): Promise<IExpenseClaim> {
  if (!categoryId || !(await ExpenseCategory.exists({ _id: categoryId }))) {
    categoryId = (await ExpenseCategory.create({ name: 'Travel', code: `TRV${seq}` }))._id as Types.ObjectId;
  }
  return ExpenseClaim.create({
    employeeId: emp._id,
    category: categoryId,
    date: label('2026-08-20'),
    status: 'approved',
    ...fields,
  });
}

/* ── HTTP helpers: the cycle is driven exactly as HR drives it ── */

async function processCycle(c: IPayrollCycle): Promise<void> {
  const res = await request(app).post(`${API}/payroll/cycles/${String(c._id)}/process`).set(auth);
  expect(res.status).toBe(200);
}

async function payCycle(c: IPayrollCycle): Promise<request.Response> {
  await request(app).post(`${API}/payroll/cycles/${String(c._id)}/lock`).set(auth).expect(200);
  const res = await request(app)
    .post(`${API}/payroll/cycles/${String(c._id)}/mark-paid`)
    .set(auth)
    .send({ paymentRef: 'NEFT-SEP', paidAt: '2026-10-01T06:00:00.000Z' });
  expect(res.status).toBe(200);
  return res;
}

async function recordOf(c: IPayrollCycle, emp: IEmployee) {
  return PayrollRecord.findOne({ cycleId: c._id, employeeId: emp._id }).lean();
}

/* ──────────────────────────────────────────────────────────── */

describe('paidWindow', () => {
  it('a joiner on the 20th of a 30-day month is paid Sep 20–30: 11 calendar days', () => {
    const w = paidWindow({ joiningDate: new Date('2026-09-20'), status: 'active' }, 2026, 9);
    expect(w).toEqual({ start: label('2026-09-20'), end: label('2026-09-30'), calendarDays: 11, monthDays: 30 });
  });

  it('a leaver who exits on the 10th is paid Sep 1–10', () => {
    const w = paidWindow({ joiningDate: new Date('2024-01-15'), exitDate: new Date('2026-09-10'), status: 'resigned' }, 2026, 9);
    expect(w).toEqual({ start: label('2026-09-01'), end: label('2026-09-10'), calendarDays: 10, monthDays: 30 });
  });

  it('has no window for someone who left last month, joins next month, or left without an exit date', () => {
    expect(paidWindow({ joiningDate: new Date('2024-01-15'), exitDate: new Date('2026-08-25'), status: 'resigned' }, 2026, 9)).toBeNull();
    expect(paidWindow({ joiningDate: new Date('2026-10-05'), status: 'active' }, 2026, 9)).toBeNull();
    expect(paidWindow({ joiningDate: new Date('2024-01-15'), status: 'terminated' }, 2026, 9)).toBeNull();
  });

  it('a date stored at IST midnight lands on the day it names', () => {
    // 2026-09-20 00:00 IST is 2026-09-19T18:30Z.
    const w = paidWindow({ joiningDate: new Date('2026-09-19T18:30:00.000Z'), status: 'active' }, 2026, 9);
    expect(w).toMatchObject({ start: label('2026-09-20'), calendarDays: 11 });
  });
});

describe('days paid', () => {
  it('a joiner on the 20th with no rows: daysPaid 11, basic 30,000 → Basic 11,000', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-09-20') });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.daysPaid).toBe(11);
    expect(r.lopDays).toBe(0);
    expect(amountOf(r.earnings, 'Basic')).toBe(11000);
    expect(r.grossSalary).toBe(11000);
    // PF on the earned basic: 12% of 11,000.
    expect(r.deductions).toContainEqual(expect.objectContaining({ name: 'PF Employee', amount: 1320, statutoryType: 'pf' }));
  });

  it('a leaver whose exit date is the 10th: daysPaid 10, Basic 10,000', async () => {
    const emp = await makeEmployee({ status: 'resigned', exitDate: new Date('2026-09-10') });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.daysPaid).toBe(10);
    expect(amountOf(r.earnings, 'Basic')).toBe(10000);
  });

  it('someone who left last month gets nothing computed', async () => {
    const emp = await makeEmployee({ status: 'resigned', exitDate: new Date('2026-08-25') });

    expect(await computeRecord(emp, await september(), cfg)).toBeNull();
  });

  it('a full month with 2 auto-absent rows and 1 unpaid-leave row: lopDays 3, daysPaid 27', async () => {
    const emp = await makeEmployee();
    const lwp = await leaveType(false);
    const leave = await approvedLeave(emp, lwp, '2026-09-15', '2026-09-15', 1);
    await Attendance.create([
      { employeeId: emp._id, date: label('2026-09-08'), status: 'absent', source: 'auto_absent' },
      { employeeId: emp._id, date: label('2026-09-09'), status: 'absent', source: 'auto_absent' },
      {
        employeeId: emp._id,
        date: label('2026-09-15'),
        status: 'absent',
        source: 'leave',
        isPaidLeave: false,
        leaveRequestId: leave._id,
      },
    ]);
    const c = await september();

    const tally = await dayTally(emp._id as Types.ObjectId, paidWindow(emp, 2026, 9)!);
    expect(tally).toMatchObject({ absent: 2, unpaidLeave: 1, lopDays: 3 });

    const r = (await computeRecord(emp, c, cfg))!;
    expect(r.lopDays).toBe(3);
    expect(r.daysPaid).toBe(27);
    expect(amountOf(r.earnings, 'Basic')).toBe(27000);
    expect(r.lopAmount).toBe(3000);
  });

  it('counts a punched paid-leave day once', async () => {
    const emp = await makeEmployee();
    const cl = await leaveType(true);
    const leave = await approvedLeave(emp, cl, '2026-09-16', '2026-09-16', 1);
    // The employee punched in on a day of approved paid leave: one row, tagged as paid leave.
    await Attendance.create({
      employeeId: emp._id,
      date: label('2026-09-16'),
      status: 'present',
      checkIn: { time: new Date('2026-09-16T04:00:00.000Z') },
      isPaidLeave: true,
      leaveRequestId: leave._id,
    });

    const tally = await dayTally(emp._id as Types.ObjectId, paidWindow(emp, 2026, 9)!);
    expect(tally).toMatchObject({ present: 0, paidLeave: 1, lopDays: 0 });

    const r = (await computeRecord(emp, await september(), cfg))!;
    expect(r).toMatchObject({ daysPaid: 30, lopDays: 0, presentDays: 0, paidLeaveDays: 1 });
    expect(amountOf(r.earnings, 'Basic')).toBe(30000);
  });

  it('approved unpaid leave with no rows costs its working days, and a stamped day is counted once', async () => {
    const emp = await makeEmployee();
    const lwp = await leaveType(false);
    // Fri 18 → Mon 21: Fri 18, Sat 19 (3rd Saturday) and Mon 21 are working days; Sun 20 is off.
    const leave = await approvedLeave(emp, lwp, '2026-09-18', '2026-09-21', 3);
    await Attendance.create({
      employeeId: emp._id,
      date: label('2026-09-18'),
      status: 'absent',
      source: 'leave',
      isPaidLeave: false,
      leaveRequestId: leave._id,
    });

    const tally = await dayTally(emp._id as Types.ObjectId, paidWindow(emp, 2026, 9)!);

    expect(tally).toMatchObject({ unpaidLeave: 3, lopDays: 3 });
  });

  it('a half day costs half a day unless it is paid leave', async () => {
    const emp = await makeEmployee();
    await Attendance.create([
      { employeeId: emp._id, date: label('2026-09-02'), status: 'half_day' },
      { employeeId: emp._id, date: label('2026-09-03'), status: 'half_day', isPaidLeave: true, leaveRequestId: new Types.ObjectId(), source: 'leave' },
      { employeeId: emp._id, date: label('2026-09-04'), status: 'on_leave', isPaidLeave: true, leaveRequestId: new Types.ObjectId(), source: 'leave' },
      { employeeId: emp._id, date: label('2026-09-06'), status: 'weekend' },
    ]);

    const tally = await dayTally(emp._id as Types.ObjectId, paidWindow(emp, 2026, 9)!);

    expect(tally).toMatchObject({ halfDay: 2, paidLeave: 1, weeklyOff: 1, lopDays: 0.5 });
    expect((await computeRecord(emp, await september(), cfg))!.daysPaid).toBe(29.5);
  });

  it('rows outside the paid window do not count', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-09-20') });
    await Attendance.create({ employeeId: emp._id, date: label('2026-09-10'), status: 'absent', source: 'auto_absent' });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r).toMatchObject({ daysPaid: 11, lopDays: 0 });
  });
});

let structureSeq = 0;
async function structure(components: Array<{ code: string; name: string; type?: string; calculationType: string; value: number }>) {
  structureSeq += 1;
  const docs = [];
  for (const c of components) {
    const comp = await SalaryComponent.create({ name: c.name, code: `${c.code}${structureSeq}`, type: c.type ?? 'earning' });
    docs.push({ componentId: comp._id, calculationType: c.calculationType, value: c.value });
  }
  return SalaryStructure.create({ name: `Structure ${structureSeq}`, components: docs });
}

describe('earnings from a salary structure', () => {

  it('basic 20,000 + HRA 40% of basic + fixed 2,000 → lines 20,000 / 8,000 / 2,000', async () => {
    const s = await structure([
      { code: 'BASIC', name: 'Basic', calculationType: 'percentage_of_basic', value: 100 },
      { code: 'HRA', name: 'HRA', calculationType: 'percentage_of_basic', value: 40 },
      { code: 'CONV', name: 'Conveyance', calculationType: 'fixed', value: 2000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 20000 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.earnings.map((l) => [l.name, l.amount])).toEqual([
      ['Basic', 20000],
      ['HRA', 8000],
      ['Conveyance', 2000],
    ]);
    expect(r.earnings.every((l) => l.componentId)).toBe(true);
    expect(r.fullMonthGross).toBe(30000);
    expect(r.grossSalary).toBe(30000);
  });

  it('pro-rates every structure earning, fixed ones included, by days paid', async () => {
    const s = await structure([
      { code: 'BASIC', name: 'Basic', calculationType: 'percentage_of_basic', value: 100 },
      { code: 'CONV', name: 'Conveyance', calculationType: 'fixed', value: 2000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 20000 }, salaryStructureId: s._id });
    await populateStructure(emp);

    expect(earningsFor(emp, 15, 30).map((l) => [l.name, l.amount])).toEqual([
      ['Basic', 10000],
      ['Conveyance', 1000],
    ]);
  });

  it('percentage_of_gross is on the salary components, never on the stored grossSalary', async () => {
    const s = await structure([
      { code: 'BASIC', name: 'Basic', calculationType: 'percentage_of_basic', value: 100 },
      { code: 'BONUS', name: 'Bonus', calculationType: 'percentage_of_gross', value: 10 },
    ]);
    // Components total 25,000; the import's otherAllowances stash inflates the stored gross.
    const emp = await makeEmployee({
      salary: { basic: 20000, hra: 5000, otherAllowances: { employeePf: 1800, ctc: 40000 } },
      salaryStructureId: s._id,
    });
    expect(emp.salary.grossSalary).toBe(66800);

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(amountOf(r.earnings, 'Bonus')).toBe(2500);
  });

  it('without a structure: Basic, HRA, DA and Other Allowance from the employee salary', async () => {
    const emp = await makeEmployee({ salary: { basic: 20000, hra: 8000, da: 1000, specialAllowance: 3000 } });

    expect(earningsFor(emp, 30, 30).map((l) => [l.name, l.amount])).toEqual([
      ['Basic', 20000],
      ['HRA', 8000],
      ['DA', 1000],
      ['Other Allowance', 3000],
    ]);
  });

  it('a structure component named "Arrears" stays on the payslip next to the Arrears override', async () => {
    const s = await structure([
      { code: 'BASIC', name: 'Basic', calculationType: 'percentage_of_basic', value: 100 },
      { code: 'ARR', name: 'Arrears', calculationType: 'fixed', value: 1000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 30000 }, salaryStructureId: s._id });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    expect(rec.earnings.map((l) => [l.name, l.amount])).toEqual([
      ['Basic', 30000],
      ['Arrears', 1000],
    ]);
    expect(rec.grossSalary).toBe(31000);

    const res = await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ arrears: 500 });

    expect(res.status).toBe(200);
    const after = (await recordOf(c, emp))!;
    expect(after.earnings.map((l) => [l.name, l.amount, !!l.componentId])).toEqual([
      ['Basic', 30000, true],
      ['Arrears', 1000, true],
      ['Arrears', 500, false],
    ]);
    expect(after.grossSalary).toBe(31500);
    // The PDF prints exactly these rows, and they add up to the gross.
    const printed = payslipLines(after).earnings;
    expect(printed).toHaveLength(3);
    expect(printed.reduce((sum, l) => sum + l.amount, 0)).toBe(31500);
  });

  it('PF is on the structure’s basic / DA lines: Basic 20,000 (salary basic 10,000) → PF 1,800', async () => {
    const s = await structure([
      { code: 'BASIC', name: 'Basic Salary', calculationType: 'fixed', value: 20000 },
      { code: 'HRA', name: 'HRA', calculationType: 'fixed', value: 5000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 10000 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.deductions).toContainEqual(expect.objectContaining({ name: 'PF Employee', amount: 1800, statutoryType: 'pf' }));
    expect(r.employerContributions).toContainEqual(expect.objectContaining({ name: 'PF Employer', amount: 1800 }));
  });

  it('PF falls back to the salary basic + DA when no structure line is a basic or DA', async () => {
    const s = await structure([{ code: 'CONS', name: 'Consolidated Pay', calculationType: 'fixed', value: 20000 }]);
    const emp = await makeEmployee({ salary: { basic: 10000, da: 1000 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    // 12% of 11,000.
    expect(r.deductions).toContainEqual(expect.objectContaining({ name: 'PF Employee', amount: 1320 }));
  });
});

describe('overtime', () => {
  it('is paid on the full-month basis: a joiner on the 30th earns the same for 2 h as a full-month employee', async () => {
    const joiner = await makeEmployee({ joiningDate: new Date('2026-09-30') });
    const fullMonth = await makeEmployee();
    for (const emp of [joiner, fullMonth]) {
      await OvertimeRequest.create({ employee: emp._id, date: label('2026-09-30'), hours: 2, reason: 'month end', status: 'approved' });
    }
    const c = await september();

    const j = (await computeRecord(joiner, c, cfg))!;
    const f = (await computeRecord(fullMonth, c, cfg))!;

    // 30,000 × 120 min / (30 days × 480 min).
    expect(f.overtimeAmount).toBe(250);
    expect(j.overtimeAmount).toBe(250);
    expect(j.daysPaid).toBe(1);
    expect(j.earnings).toContainEqual({ name: 'Over Time', amount: 250 });
  });
});

describe('TDS', () => {
  it('tdsMonthly 1,200 → a TDS line of 1,200 typed tds', async () => {
    const emp = await makeEmployee({ salary: { basic: 30000, tdsMonthly: 1200 } });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.deductions).toContainEqual({ name: 'TDS', amount: 1200, statutoryType: 'tds' });
    expect(r.tds).toBe(1200);
    // P.Tax 200 (Maharashtra, the company state) + PF 1,800 + ESI 0 + TDS 1,200.
    expect(r.totalDeductions).toBe(3200);
    expect(r.netSalary).toBe(26800);
  });

  it('an HR override replaces it; clearing the override restores the declared figure', async () => {
    const emp = await makeEmployee({ salary: { basic: 30000, tdsMonthly: 1200 } });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    const url = `${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`;

    const set = await request(app).patch(url).set(auth).send({ tds: 500 });
    expect(set.body.data.deductions).toContainEqual(expect.objectContaining({ name: 'TDS', amount: 500, statutoryType: 'tds' }));

    const cleared = await request(app).patch(url).set(auth).send({ tds: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.tds).toBe(1200);
    expect(cleared.body.data.deductions).toContainEqual(expect.objectContaining({ name: 'TDS', amount: 1200, statutoryType: 'tds' }));
    expect(cleared.body.data.totalDeductions).toBe(3200);
  });
});

describe('who is in the cycle', () => {
  it('active and on-notice staff and this month’s leavers; not last month’s leavers or next month’s joiners', async () => {
    const active = await makeEmployee();
    const onNotice = await makeEmployee({ status: 'onNotice', exitDate: new Date('2026-10-15') });
    const leftThisMonth = await makeEmployee({ status: 'resigned', exitDate: new Date('2026-09-10') });
    const leftLastMonth = await makeEmployee({ status: 'resigned', exitDate: new Date('2026-08-25') });
    const joinsNextMonth = await makeEmployee({ joiningDate: new Date('2026-10-05') });
    const c = await september();

    await processCycle(c);

    expect((await recordOf(c, active))!.daysPaid).toBe(30);
    expect((await recordOf(c, onNotice))!.daysPaid).toBe(30);
    const leaver = (await recordOf(c, leftThisMonth))!;
    expect(leaver.daysPaid).toBe(10);
    expect(amountOf(leaver.earnings, 'Basic')).toBe(10000);
    expect(await recordOf(c, leftLastMonth)).toBeNull();
    expect(await recordOf(c, joinsNextMonth)).toBeNull();
    expect((await PayrollCycle.findById(c._id).lean())!.employeeCount).toBe(3);
  });
});

describe('loan EMIs', () => {
  it('deducts the instalment due in the month; paying the cycle marks it paid, once', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09', '2026-10']);
    const c = await september();

    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    expect(rec.loanDeduction).toBe(2000);
    expect(rec.deductions).toContainEqual(expect.objectContaining({ name: 'Loan Deduction', amount: 2000 }));
    expect(rec.totalDeductions).toBe(4000); // P.Tax 200 + PF 1,800 + loan 2,000
    expect(rec.netSalary).toBe(26000);

    const paid = await payCycle(c);
    expect(paid.body.settlement).toEqual({ ok: true, installmentsPaid: 1, claimsReimbursed: 0 });

    const after = (await Loan.findById(loan._id).lean())!;
    expect(after.installments[0]).toMatchObject({ status: 'paid', paidAmount: 2000 });
    expect(after.installments[0]!.paidOn).toEqual(new Date('2026-10-01T06:00:00.000Z'));
    expect(String(after.installments[0]!.payrollCycleId)).toBe(String(c._id));
    expect(after.installments[1]).toMatchObject({ status: 'scheduled', paidAmount: 0 });
    expect(after).toMatchObject({ status: 'active', totalPaid: 2000, outstandingTotal: 2000, outstandingPrincipal: 2000 });

    // Settling again changes nothing.
    expect(await settleCycle((await PayrollCycle.findById(c._id))!)).toEqual({ installmentsPaid: 0, claimsReimbursed: 0 });
    expect((await Loan.findById(loan._id).lean())!).toMatchObject({ totalPaid: 2000, outstandingTotal: 2000 });
  });

  it('closes the loan when its last instalment settles', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09'], 1500);
    const c = await september();

    await processCycle(c);
    await payCycle(c);

    const after = (await Loan.findById(loan._id).lean())!;
    expect(after).toMatchObject({ status: 'closed', totalPaid: 1500, outstandingTotal: 0, outstandingPrincipal: 0 });
    expect(after.closedAt).toBeInstanceOf(Date);
  });

  it('ignores instalments of loans that are not active and instalments already paid', async () => {
    const emp = await makeEmployee();
    const pending = await loanFor(emp, ['2026-09']);
    await Loan.updateOne({ _id: pending._id }, { $set: { status: 'approved' } });
    const settled = await loanFor(emp, ['2026-09'], 700);
    await Loan.updateOne({ _id: settled._id }, { $set: { 'installments.0.status': 'paid', 'installments.0.paidAmount': 700 } });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(r.loanDeduction).toBe(0);
    expect(r.settlement.loanInstallments).toEqual([]);
  });
});

describe('expense claim reimbursements', () => {
  it('two approved claims (1,500 and 500 accepted at 400) → reimbursements 1,900, both reimbursed on pay-out', async () => {
    const emp = await makeEmployee();
    const a = await claimFor(emp, { amount: 1500 });
    const b = await claimFor(emp, { amount: 500, acceptedAmount: 400 });
    const pending = await claimFor(emp, { amount: 999, status: 'pending' });
    const done = await claimFor(emp, { amount: 300, status: 'reimbursed', reimbursedAt: new Date('2026-08-30') });
    const c = await september();

    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    expect(rec.reimbursements).toBe(1900);
    expect(rec.earnings).toContainEqual(expect.objectContaining({ name: 'Reimbursements', amount: 1900 }));
    expect(rec.grossSalary).toBe(31900);

    const paid = await payCycle(c);
    expect(paid.body.settlement).toEqual({ ok: true, installmentsPaid: 0, claimsReimbursed: 2 });

    for (const claim of [a, b]) {
      const after = (await ExpenseClaim.findById(claim._id).lean())!;
      expect(after.status).toBe('reimbursed');
      expect(after.reimbursedAt).toEqual(new Date('2026-10-01T06:00:00.000Z'));
      expect(String(after.payrollCycleId)).toBe(String(c._id));
      expect(after.reimbursementRef).toBe('PAYROLL-2026-09');
    }
    expect((await ExpenseClaim.findById(pending._id).lean())!.status).toBe('pending');
    expect((await ExpenseClaim.findById(done._id).lean())!.payrollCycleId).toBeUndefined();
  });

  it('a claim already counted by another unpaid cycle is not counted again', async () => {
    const emp = await makeEmployee();
    await claimFor(emp, { amount: 1500 });
    const august = await PayrollCycle.create({ year: 2026, month: 8, status: 'draft' });
    await processCycle(august);
    expect((await recordOf(august, emp))!.reimbursements).toBe(1500);

    const c = await september();
    await processCycle(c);

    expect((await recordOf(c, emp))!.reimbursements).toBe(0);
  });
});

describe('re-process after settlement', () => {
  it('does not double-settle: settling again pays nothing, the cycle cannot be re-processed, the next month counts neither the paid EMI nor the reimbursed claims', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09', '2026-10']);
    await claimFor(emp, { amount: 1500 });
    await claimFor(emp, { amount: 500, acceptedAmount: 400 });
    const c = await september();
    await processCycle(c);
    await payCycle(c);

    const again = await request(app).post(`${API}/payroll/cycles/${String(c._id)}/settle`).set(auth);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ installmentsPaid: 0, claimsReimbursed: 0 });
    expect((await request(app).post(`${API}/payroll/cycles/${String(c._id)}/process`).set(auth)).status).toBe(409);
    expect((await Loan.findById(loan._id).lean())!).toMatchObject({ totalPaid: 2000, outstandingTotal: 2000 });

    const october = await PayrollCycle.create({ year: 2026, month: 10, status: 'draft' });
    await processCycle(october);
    const next = (await recordOf(october, emp))!;
    expect(next.reimbursements).toBe(0);
    expect(next.loanDeduction).toBe(2000);
    expect(next.settlement.loanInstallments.map((i) => String(i.installmentId))).toEqual([
      String((await Loan.findById(loan._id).lean())!.installments[1]!._id),
    ]);
  });
});

describe('HR overrides and settlement', () => {
  it('an override of 0 keeps the EMI and the claims out of this pay-out', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09']);
    const claim = await claimFor(emp, { amount: 1500 });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;

    const patched = await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ loanDeduction: 0, reimbursements: 0 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.deductions.map((l: IPayrollLine) => l.name)).not.toContain('Loan Deduction');
    expect(patched.body.data.earnings.map((l: IPayrollLine) => l.name)).not.toContain('Reimbursements');

    const paid = await payCycle(c);

    expect(paid.body.settlement).toEqual({ ok: true, installmentsPaid: 0, claimsReimbursed: 0 });
    expect((await Loan.findById(loan._id).lean())!.installments[0]).toMatchObject({ status: 'scheduled', paidAmount: 0 });
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');
  });

  it('a part override pays that much into the instalment', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09']);
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ loanDeduction: 1500 })
      .expect(200);

    await payCycle(c);

    const after = (await Loan.findById(loan._id).lean())!;
    expect(after.installments[0]).toMatchObject({ status: 'partial', paidAmount: 1500 });
    expect(after).toMatchObject({ status: 'active', totalPaid: 1500, outstandingTotal: 500 });

    // A retry does not pay the instalment's remaining 500 out of the same deduction.
    expect(await settleCycle((await PayrollCycle.findById(c._id))!)).toEqual({ installmentsPaid: 0, claimsReimbursed: 0 });
    expect((await Loan.findById(loan._id).lean())!.installments[0]).toMatchObject({ status: 'partial', paidAmount: 1500 });
  });

  it('a part override reimburses only the claims it covers whole, and a retry reimburses no more', async () => {
    const emp = await makeEmployee();
    const first = await claimFor(emp, { amount: 1500, date: label('2026-08-10') });
    const second = await claimFor(emp, { amount: 400, date: label('2026-08-20') });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ reimbursements: 1500 })
      .expect(200);

    const paid = await payCycle(c);

    expect(paid.body.settlement).toEqual({ ok: true, installmentsPaid: 0, claimsReimbursed: 1 });
    expect((await ExpenseClaim.findById(first._id).lean())!.status).toBe('reimbursed');
    expect((await ExpenseClaim.findById(second._id).lean())!.status).toBe('approved');

    expect(await settleCycle((await PayrollCycle.findById(c._id))!)).toEqual({ installmentsPaid: 0, claimsReimbursed: 0 });
    expect((await ExpenseClaim.findById(second._id).lean())!.status).toBe('approved');
  });

  it('logs a warning when the reimbursements cannot be applied to the claims in full', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ reimbursements: 1000 })
      .expect(200);
    const warn = vi.spyOn(logger, 'warn');

    await payCycle(c);

    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: String(rec._id), unapplied: 1000 }),
      expect.any(String),
    );
  });

  it('clearing an override puts the computed EMI and reimbursements back', async () => {
    const emp = await makeEmployee();
    await loanFor(emp, ['2026-09']);
    await claimFor(emp, { amount: 1500 });
    const c = await september();
    await processCycle(c);
    const rec = (await recordOf(c, emp))!;
    const url = `${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`;
    await request(app).patch(url).set(auth).send({ loanDeduction: 0, reimbursements: 0 }).expect(200);

    const res = await request(app).patch(url).set(auth).send({ loanDeduction: null, reimbursements: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ loanDeduction: 2000, reimbursements: 1500, grossSalary: 31500 });
    expect(res.body.data.deductions).toContainEqual(expect.objectContaining({ name: 'Loan Deduction', amount: 2000 }));
    expect(res.body.data.earnings).toContainEqual(expect.objectContaining({ name: 'Reimbursements', amount: 1500 }));
  });
});

describe('settlement failures and retries', () => {
  it('mark-paid still succeeds when settlement fails; POST /settle retries it', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const c = await september();
    await processCycle(c);
    vi.spyOn(ExpenseClaim, 'updateOne').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const paid = await payCycle(c);

    expect(paid.body.data.status).toBe('paid');
    expect(paid.body.settlement).toEqual({ ok: false });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ cycleId: String(c._id) }), expect.any(String));
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');

    const retry = await request(app).post(`${API}/payroll/cycles/${String(c._id)}/settle`).set(auth);

    expect(retry.status).toBe(200);
    expect(retry.body.data).toEqual({ installmentsPaid: 0, claimsReimbursed: 1 });
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('reimbursed');
  });

  it('POST /settle refuses a cycle that is not paid', async () => {
    const c = await PayrollCycle.create({ year: 2026, month: 9, status: 'locked' });

    const res = await request(app).post(`${API}/payroll/cycles/${String(c._id)}/settle`).set(auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CYCLE_NOT_EDITABLE');
  });

  it('POST /settle needs payroll.process', async () => {
    const { token } = await createUser({ roleSlug: 'hr_executive' });
    const c = await PayrollCycle.create({ year: 2026, month: 9, status: 'paid' });

    const res = await request(app)
      .post(`${API}/payroll/cycles/${String(c._id)}/settle`)
      .set({ Authorization: `Bearer ${token}` });

    expect(res.status).toBe(403);
  });
});

describe('items held until settled', () => {
  it('(a) a paid cycle whose settlement failed still holds its claim: the next month does not count it, and it is reimbursed once', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const sep = await september();
    await processCycle(sep);
    vi.spyOn(ExpenseClaim, 'updateOne').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    expect((await payCycle(sep)).body.settlement).toEqual({ ok: false });

    const oct = await PayrollCycle.create({ year: 2026, month: 10, status: 'draft' });
    await processCycle(oct);
    expect((await recordOf(oct, emp))!.reimbursements).toBe(0);
    const manual = await request(app)
      .patch(`${API}/expense-claims/requests/${String(claim._id)}/reimburse`)
      .set(auth)
      .send({ reimbursementRef: 'CASH-1' });
    expect(manual.status).toBe(409);
    expect(manual.body.error.code).toBe('CLAIM_IN_PAYROLL');

    const retry = await request(app).post(`${API}/payroll/cycles/${String(sep._id)}/settle`).set(auth);
    expect(retry.body.data).toEqual({ installmentsPaid: 0, claimsReimbursed: 1 });
    const after = (await ExpenseClaim.findById(claim._id).lean())!;
    expect(after.status).toBe('reimbursed');
    expect(String(after.payrollCycleId)).toBe(String(sep._id));
    expect((await recordOf(sep, emp))!.settlement.settledAt).toBeInstanceOf(Date);

    // October, re-processed after the settlement, still does not pay it.
    await processCycle(oct);
    expect((await recordOf(oct, emp))!.reimbursements).toBe(0);
  });

  it('the same holds for a loan instalment', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09']);
    const sep = await september();
    await processCycle(sep);
    vi.spyOn(Loan, 'findById').mockImplementationOnce(() => {
      throw new Error('db down');
    });
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    expect((await payCycle(sep)).body.settlement).toEqual({ ok: false });

    const manual = await request(app)
      .post(`${API}/loans/${String(loan._id)}/payments`)
      .set(auth)
      .send({ installmentId: String(loan.installments[0]!._id), amount: 2000 });
    expect(manual.status).toBe(409);
    expect(manual.body.error.code).toBe('INSTALLMENT_IN_PAYROLL');

    await request(app).post(`${API}/payroll/cycles/${String(sep._id)}/settle`).set(auth).expect(200);
    expect((await Loan.findById(loan._id).lean())!).toMatchObject({ status: 'closed', totalPaid: 2000 });
  });

  it('(b) an override of 0 does not release the claim to the next month; clearing it then pays it once', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const sep = await september();
    await processCycle(sep);
    const sepUrl = `${API}/payroll/cycles/${String(sep._id)}/records/${String((await recordOf(sep, emp))!._id)}`;
    await request(app).patch(sepUrl).set(auth).send({ reimbursements: 0 }).expect(200);

    const oct = await PayrollCycle.create({ year: 2026, month: 10, status: 'draft' });
    await processCycle(oct);
    expect((await recordOf(oct, emp))!.reimbursements).toBe(0);

    const cleared = await request(app).patch(sepUrl).set(auth).send({ reimbursements: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.reimbursements).toBe(1500);

    await payCycle(sep);
    const after = (await ExpenseClaim.findById(claim._id).lean())!;
    expect(after.status).toBe('reimbursed');
    expect(String(after.payrollCycleId)).toBe(String(sep._id));
  });

  it('clearing an override is refused (409 ITEM_HELD) while another cycle holds the item', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const sep = await september();
    await processCycle(sep);
    const sepRecord = (await recordOf(sep, emp))!;
    const sepUrl = `${API}/payroll/cycles/${String(sep._id)}/records/${String(sepRecord._id)}`;
    await request(app).patch(sepUrl).set(auth).send({ reimbursements: 0 }).expect(200);
    // September falls back to draft (a run that failed part-way): its records no longer hold anything.
    await PayrollCycle.updateOne({ _id: sep._id }, { $set: { status: 'draft' } });
    const oct = await PayrollCycle.create({ year: 2026, month: 10, status: 'draft' });
    await processCycle(oct);
    expect((await recordOf(oct, emp))!.reimbursements).toBe(1500);

    const cleared = await request(app).patch(sepUrl).set(auth).send({ reimbursements: null });
    expect(cleared.status).toBe(409);
    expect(cleared.body.error.code).toBe('ITEM_HELD');
    expect(cleared.body.error.message).toContain('October 2026');
    const unchanged = (await recordOf(sep, emp))!;
    expect(unchanged.reimbursements).toBe(0);
    expect(unchanged.manualAdjustments.reimbursements).toBe(0);
    // Setting an amount would pay it just the same.
    expect((await request(app).patch(sepUrl).set(auth).send({ reimbursements: 1500 })).status).toBe(409);

    await payCycle(oct);
    const after = (await ExpenseClaim.findById(claim._id).lean())!;
    expect(after.status).toBe('reimbursed');
    expect(String(after.payrollCycleId)).toBe(String(oct._id));
  });
});

describe('manual payments of what payroll is about to pay', () => {
  it('a claim a payroll record holds cannot be reimbursed by hand until that record is settled', async () => {
    const emp = await makeEmployee();
    const claim = await claimFor(emp, { amount: 1500 });
    const c = await september();
    await processCycle(c);
    const url = `${API}/expense-claims/requests/${String(claim._id)}/reimburse`;

    const refused = await request(app).patch(url).set(auth).send({ reimbursementRef: 'CASH-1' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('CLAIM_IN_PAYROLL');
    expect(refused.body.error.message).toContain('September 2026');
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');

    // Taking it out of the payroll (override 0) does not release it: the record still holds it…
    const rec = (await recordOf(c, emp))!;
    await request(app)
      .patch(`${API}/payroll/cycles/${String(c._id)}/records/${String(rec._id)}`)
      .set(auth)
      .send({ reimbursements: 0 })
      .expect(200);
    expect((await request(app).patch(url).set(auth).send({ reimbursementRef: 'CASH-1' })).status).toBe(409);

    // …until the cycle is paid and settled (which, at 0, reimbursed nothing).
    await payCycle(c);
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');
    expect((await request(app).patch(url).set(auth).send({ reimbursementRef: 'CASH-1' })).status).toBe(200);
  });

  it('an instalment in an unpaid payroll cannot also be paid by hand', async () => {
    const emp = await makeEmployee();
    const loan = await loanFor(emp, ['2026-09']);
    const c = await september();
    await processCycle(c);

    const res = await request(app)
      .post(`${API}/loans/${String(loan._id)}/payments`)
      .set(auth)
      .send({ installmentId: String(loan.installments[0]!._id), amount: 2000 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSTALLMENT_IN_PAYROLL');
    expect((await Loan.findById(loan._id).lean())!.totalPaid).toBe(0);
  });
});

describe('POST /payroll/structures/:id/assign', () => {
  it('stores the structure on each employee', async () => {
    const s = await SalaryStructure.create({ name: 'Staff' });
    const a = await makeEmployee();
    const b = await makeEmployee();

    const res = await request(app)
      .post(`${API}/payroll/structures/${String(s._id)}/assign`)
      .set(auth)
      .send({ employeeIds: [String(a._id), String(b._id)] });

    expect(res.status).toBe(200);
    expect(res.body.data.assigned).toBe(2);
    for (const e of [a, b]) {
      expect(String((await Employee.findById(e._id).lean())!.salaryStructureId)).toBe(String(s._id));
    }
  });

  it('404s an unknown structure and assigns nothing', async () => {
    const a = await makeEmployee();

    const res = await request(app)
      .post(`${API}/payroll/structures/${new Types.ObjectId().toHexString()}/assign`)
      .set(auth)
      .send({ employeeIds: [String(a._id)] });

    expect(res.status).toBe(404);
    expect((await Employee.findById(a._id).lean())!.salaryStructureId).toBeUndefined();
  });
});
