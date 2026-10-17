/**
 * Statutory lines on processed payroll records:
 *
 *  - PF is on the basic + DA actually EARNED (pro-rated for loss of pay),
 *    capped at the wage ceiling;
 *  - ESI eligibility is decided once per contribution period (Apr–Sep,
 *    Oct–Mar) from the full-month gross, saved on `employee.statutory`, and
 *    kept for the rest of the period; the contribution is on the earned
 *    gross, the employee share rounded up to the rupee;
 *  - Professional Tax follows the employee's state (work location, else
 *    current address), the month and — in Maharashtra — gender; an unknown
 *    state pays none;
 *  - every statutory line carries its `statutoryType`.
 *
 * Cycles are processed over HTTP, exactly as HR does it.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type Gender, type IEmployee } from '../models/employee.model.js';
import { PayrollCycle } from '../models/payroll-cycle.model.js';
import { PayrollRecord, type IPayrollLine } from '../models/payroll-record.model.js';

vi.mock('../services/payroll-settlement.service.js', () => ({
  settleCycle: vi.fn(async () => undefined),
}));

const API = '/api/v1/payroll';

let app: Express;
beforeEach(() => {
  app = createApp();
});

async function hrAuth(): Promise<{ Authorization: string }> {
  const { token } = await createUser({ roleSlug: 'hr_manager' satisfies RoleSlug });
  return { Authorization: `Bearer ${token}` };
}

interface SalaryParts {
  basic: number;
  hra?: number;
  da?: number;
  specialAllowance?: number;
}

async function setSalary(emp: IEmployee, parts: SalaryParts): Promise<void> {
  emp.set('salary', {
    basic: parts.basic,
    hra: parts.hra ?? 0,
    da: parts.da ?? 0,
    specialAllowance: parts.specialAllowance ?? 0,
    otherAllowances: {},
    grossSalary: 0,
  });
  await emp.save(); // the pre-save hook totals the gross
}

async function employee(
  salary: SalaryParts,
  extra: { gender?: Gender; state?: string; workLocation?: string } = {},
): Promise<IEmployee> {
  const { user } = await createUser({ roleSlug: 'employee' });
  const emp = await createEmployeeFor(user);
  if (extra.gender) emp.gender = extra.gender;
  if (extra.state) emp.address = { current: { state: extra.state } };
  if (extra.workLocation) emp.workLocation = extra.workLocation;
  await setSalary(emp, salary);
  return emp;
}

/** The salary components for a monthly gross: basic 50%, HRA 20%, the rest allowance (whole rupees). */
function salaryOf(gross: number): SalaryParts {
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.2);
  return { basic, hra, specialAllowance: gross - basic - hra };
}

async function processMonth(
  auth: { Authorization: string },
  year: number,
  month: number,
): Promise<string> {
  const cycle = (await PayrollCycle.findOne({ year, month })) ?? (await PayrollCycle.create({ year, month, status: 'draft' }));
  const res = await request(app).post(`${API}/cycles/${String(cycle._id)}/process`).set(auth);
  expect(res.status).toBe(200);
  return String(cycle._id);
}

async function recordOf(cycleId: string, emp: IEmployee) {
  return (await PayrollRecord.findOne({ cycleId, employeeId: emp._id }).lean())!;
}

const lineOf = (lines: IPayrollLine[], statutoryType: NonNullable<IPayrollLine['statutoryType']>): IPayrollLine | undefined =>
  lines.find((l) => l.statutoryType === statutoryType);

const statutoryOf = async (emp: IEmployee) => (await Employee.findById(emp._id).lean())!.statutory;

describe('ESI — eligibility is fixed for the contribution period', () => {
  it('October 2026, gross 20,500: eligible, 154 (153.75 rounded up) + 666.25 employer, saved as 2026-H2', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(20500));
    expect((await Employee.findById(emp._id).lean())!.salary.grossSalary).toBe(20500);

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    expect(lineOf(record.deductions, 'esi')).toEqual(
      expect.objectContaining({ name: 'ESI Employee', amount: 154, statutoryType: 'esi' }),
    );
    expect(lineOf(record.employerContributions, 'esi')).toEqual(
      expect.objectContaining({ name: 'ESI Employer', amount: 666.25, statutoryType: 'esi' }),
    );
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });
  });

  it('a raise to 30,000 does not end eligibility before the period does: November still contributes', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(20500));
    await processMonth(hr, 2026, 10);

    await setSalary((await Employee.findById(emp._id))!, salaryOf(30000));
    const record = await recordOf(await processMonth(hr, 2026, 11), emp);

    expect(record.grossSalary).toBe(30000);
    expect(lineOf(record.deductions, 'esi')).toEqual(
      expect.objectContaining({ amount: 225, statutoryType: 'esi' }), // 30,000 × 0.75% = 225
    );
    expect(lineOf(record.employerContributions, 'esi')).toEqual(
      expect.objectContaining({ amount: 975, statutoryType: 'esi' }), // 30,000 × 3.25%
    );
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });
  });

  it('the same decision holds through March, then April starts a new period and decides again', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(20500));
    await processMonth(hr, 2026, 10);
    await setSalary((await Employee.findById(emp._id))!, salaryOf(30000));

    const march = await recordOf(await processMonth(hr, 2027, 3), emp);
    expect(lineOf(march.deductions, 'esi')!.amount).toBe(225);
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });

    const april = await recordOf(await processMonth(hr, 2027, 4), emp);
    expect(lineOf(april.deductions, 'esi')!.amount).toBe(0);
    expect(lineOf(april.employerContributions, 'esi')!.amount).toBe(0);
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2027-H1' });
  });

  it('an employee above the ceiling at the start of the period stays out of it, even if the gross later falls', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(30000));
    const first = await recordOf(await processMonth(hr, 2026, 10), emp);
    expect(lineOf(first.deductions, 'esi')!.amount).toBe(0);
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });

    await setSalary((await Employee.findById(emp._id))!, salaryOf(15000));
    const next = await recordOf(await processMonth(hr, 2026, 11), emp);
    expect(lineOf(next.deductions, 'esi')!.amount).toBe(0);
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });
  });

  it('re-processing a cycle keeps the period decision', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(20500));
    const id = await processMonth(hr, 2026, 10);
    const before = await statutoryOf(emp);

    expect(await processMonth(hr, 2026, 10)).toBe(id);

    expect(await statutoryOf(emp)).toEqual(before);
    expect(lineOf((await recordOf(id, emp)).deductions, 'esi')!.amount).toBe(154);
  });
});

describe('earned wages (loss of pay)', () => {
  /** 10 absent days of October 2026 (31 days): 21 paid. */
  async function absentTenDays(emp: IEmployee): Promise<void> {
    for (let day = 5; day <= 14; day += 1) {
      await Attendance.create({
        employeeId: emp._id,
        date: new Date(Date.UTC(2026, 9, day)),
        status: 'absent',
        source: 'auto_absent',
      });
    }
  }

  it('PF and ESI are on the earned basic + DA and the earned gross, not the full month', async () => {
    const hr = await hrAuth();
    // 10,000 basic + 2,000 DA + 4,000 HRA + 4,000 allowance = 20,000 a month.
    const emp = await employee({ basic: 10000, da: 2000, hra: 4000, specialAllowance: 4000 });
    await absentTenDays(emp);

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    // Earned: 6,774.19 basic + 1,354.84 DA (= 8,129.03) → PF 12% = 975.48.
    expect(lineOf(record.deductions, 'pf')).toEqual(
      expect.objectContaining({ name: 'PF Employee', amount: 975.48, statutoryType: 'pf' }),
    );
    expect(lineOf(record.employerContributions, 'pf')).toEqual(
      expect.objectContaining({ name: 'PF Employer', amount: 975.48, statutoryType: 'pf' }),
    );
    // Earned gross 13,548.39: ESI 101.61 → 102 up; employer 440.32. Eligible on the 20,000 full month.
    expect(record.grossSalary).toBe(13548.39);
    expect(lineOf(record.deductions, 'esi')).toEqual(expect.objectContaining({ amount: 102, statutoryType: 'esi' }));
    expect(lineOf(record.employerContributions, 'esi')).toEqual(
      expect.objectContaining({ amount: 440.32, statutoryType: 'esi' }),
    );
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });
  });

  it('PF is still capped when the earned basic is above the ceiling, and ESI is nil above it', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(50000)); // basic 25,000 → earned 16,935.48
    await absentTenDays(emp);

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    expect(lineOf(record.deductions, 'pf')!.amount).toBe(1800);
    expect(lineOf(record.employerContributions, 'pf')!.amount).toBe(1800);
    expect(lineOf(record.deductions, 'esi')!.amount).toBe(0);
    expect(await statutoryOf(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });
  });

  it('a full month of a basic under the ceiling pays PF on all of it', async () => {
    const hr = await hrAuth();
    const emp = await employee({ basic: 12000, hra: 6000, specialAllowance: 6000 });

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    expect(lineOf(record.deductions, 'pf')!.amount).toBe(1440);
  });
});

describe('Professional Tax', () => {
  it('February: a Maharashtra man on 30,000 pays 300', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(30000), { gender: 'male', state: 'Maharashtra' });

    const record = await recordOf(await processMonth(hr, 2027, 2), emp);

    expect(lineOf(record.deductions, 'pt')).toEqual(
      expect.objectContaining({ name: 'P.Tax', amount: 300, statutoryType: 'pt' }),
    );
  });

  it('a Maharashtra woman on 20,000 pays none — and the line is left off', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(20000), { gender: 'female', state: 'Maharashtra' });

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    expect(lineOf(record.deductions, 'pt')).toBeUndefined();
    expect(record.deductions.map((l) => l.name)).not.toContain('P.Tax');
  });

  it('a Maharashtra woman on 30,000 pays 200 outside February, 300 in it', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(30000), { gender: 'female', state: 'Maharashtra' });

    expect(lineOf((await recordOf(await processMonth(hr, 2026, 10), emp)).deductions, 'pt')!.amount).toBe(200);
    expect(lineOf((await recordOf(await processMonth(hr, 2027, 2), emp)).deductions, 'pt')!.amount).toBe(300);
  });

  it('follows the state: Gujarat 20,000 → 200 and 11,000 → none; Tamil Nadu 20,000 → 208', async () => {
    const hr = await hrAuth();
    const gujarat = await employee(salaryOf(20000), { state: 'Gujarat' });
    const lowGujarat = await employee(salaryOf(11000), { state: 'gujarat' });
    const tamilNadu = await employee(salaryOf(20000), { state: 'TN' });

    const id = await processMonth(hr, 2026, 10);

    expect(lineOf((await recordOf(id, gujarat)).deductions, 'pt')!.amount).toBe(200);
    expect(lineOf((await recordOf(id, lowGujarat)).deductions, 'pt')).toBeUndefined();
    expect(lineOf((await recordOf(id, tamilNadu)).deductions, 'pt')!.amount).toBe(208);
  });

  it('a work location that names a state wins over the address; a city does not count', async () => {
    const hr = await hrAuth();
    const posted = await employee(salaryOf(20000), { state: 'Maharashtra', workLocation: 'Tamil Nadu' });
    const inACity = await employee(salaryOf(20000), { state: 'Gujarat', workLocation: 'Ahmedabad office' });

    const id = await processMonth(hr, 2026, 10);

    expect(lineOf((await recordOf(id, posted)).deductions, 'pt')!.amount).toBe(208); // TN, not MH's 200
    expect(lineOf((await recordOf(id, inACity)).deductions, 'pt')!.amount).toBe(200); // falls back to the address (GJ)
  });

  it('no state on file, or one with no table, pays none', async () => {
    const hr = await hrAuth();
    const nowhere = await employee(salaryOf(50000));
    const delhi = await employee(salaryOf(50000), { state: 'Delhi' });

    const id = await processMonth(hr, 2026, 10);

    expect(lineOf((await recordOf(id, nowhere)).deductions, 'pt')).toBeUndefined();
    expect(lineOf((await recordOf(id, delhi)).deductions, 'pt')).toBeUndefined();
  });
});

describe('statutory line types', () => {
  it('every PF / ESI / PT line carries its statutoryType', async () => {
    const hr = await hrAuth();
    const emp = await employee(salaryOf(30000), { gender: 'male', state: 'Maharashtra' });

    const record = await recordOf(await processMonth(hr, 2026, 10), emp);

    expect(record.deductions.map((l) => [l.name, l.statutoryType])).toEqual(
      expect.arrayContaining([
        ['P.Tax', 'pt'],
        ['PF Employee', 'pf'],
        ['ESI Employee', 'esi'],
      ]),
    );
    expect(record.employerContributions.map((l) => [l.name, l.statutoryType])).toEqual([
      ['PF Employer', 'pf'],
      ['ESI Employer', 'esi'],
    ]);
  });
});
