/**
 * PF wage from salary-structure components flagged `statutoryBase`.
 *
 *  - A component flagged `statutoryBase: 'basic' | 'da'` is a PF wage
 *    whatever it is called.
 *  - Once any earning in the structure is flagged, only flagged components
 *    count; a "Basic Bonus" left unflagged is not a PF wage.
 *  - With no flag anywhere, the name match (Basic / Dearness / DA) still applies,
 *    and then the salary basic + DA.
 *
 * Reference month: September 2026 (no attendance rows → no loss of pay), PF
 * 12% up to the 15,000 wage ceiling (test env defaults).
 */
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser } from '../test/factories.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { PayrollCycle, type IPayrollCycle } from '../models/payroll-cycle.model.js';
import type { IPayrollLine } from '../models/payroll-record.model.js';
import { SalaryComponent } from '../models/salary-component.model.js';
import { SalaryStructure } from '../models/salary-structure.model.js';
import { invalidateWeekOffRule } from './week-off.service.js';
import { computeRecord, type PayrollComputeConfig } from './payroll-compute.service.js';

const cfg: PayrollComputeConfig = { freeLateDaysPerMonth: 3 };

const amountOf = (lines: IPayrollLine[], name: string): number | undefined =>
  lines.find((l) => l.name === name)?.amount;

beforeEach(() => {
  invalidateWeekOffRule();
});

let seq = 0;
async function makeEmployee(fields: Record<string, unknown>): Promise<IEmployee> {
  seq += 1;
  return Employee.create({
    firstName: 'Base',
    lastName: `Flag${seq}`,
    email: `base.flag.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...fields,
  });
}

async function september(): Promise<IPayrollCycle> {
  return PayrollCycle.create({ year: 2026, month: 9, status: 'draft' });
}

async function structure(
  components: Array<{ name: string; value: number; statutoryBase?: 'basic' | 'da' | null }>,
) {
  seq += 1;
  const entries = [];
  for (const [i, c] of components.entries()) {
    const comp = await SalaryComponent.create({
      name: c.name,
      code: `SB${seq}X${i}`,
      type: 'earning',
      statutoryBase: c.statutoryBase,
    });
    entries.push({ componentId: comp._id, calculationType: 'fixed', value: c.value });
  }
  return SalaryStructure.create({ name: `Statutory base ${seq}`, components: entries });
}

describe('PF wage and statutoryBase', () => {
  it('"Pay A" flagged statutoryBase basic, 20,000 → PF 1,800 although its name is not a basic', async () => {
    const s = await structure([
      { name: 'Pay A', value: 20000, statutoryBase: 'basic' },
      { name: 'HRA', value: 5000 },
    ]);
    // Without the flag PF would fall back to the salary basic: 12% of 10,000 = 1,200.
    const emp = await makeEmployee({ salary: { basic: 10000 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(amountOf(r.earnings, 'Pay A')).toBe(20000);
    expect(r.deductions).toContainEqual(
      expect.objectContaining({ name: 'PF Employee', amount: 1800, statutoryType: 'pf' }),
    );
    expect(r.employerContributions).toContainEqual(
      expect.objectContaining({ name: 'PF Employer', amount: 1800 }),
    );
  });

  it('once a component is flagged, only flagged ones count: an unflagged "Basic Bonus" is not a PF wage', async () => {
    const s = await structure([
      { name: 'Pay A', value: 8000, statutoryBase: 'basic' },
      { name: 'Cost of Living', value: 2000, statutoryBase: 'da' },
      { name: 'Basic Bonus', value: 3000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 0 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    // 12% of (8,000 + 2,000); the name match would have added the 3,000 bonus (→ 1,560).
    expect(amountOf(r.deductions, 'PF Employee')).toBe(1200);
  });

  it('with no flag in the structure the name match still applies', async () => {
    const s = await structure([
      { name: 'Basic Salary', value: 12000 },
      { name: 'Conveyance', value: 4000 },
    ]);
    const emp = await makeEmployee({ salary: { basic: 0 }, salaryStructureId: s._id });

    const r = (await computeRecord(emp, await september(), cfg))!;

    expect(amountOf(r.deductions, 'PF Employee')).toBe(1440);
  });
});

describe('statutoryBase on the salary component', () => {
  it('defaults to null and rejects anything but basic / da', async () => {
    const plain = await SalaryComponent.create({ name: 'Plain', code: 'PLAIN1', type: 'earning' });
    expect(plain.statutoryBase).toBeNull();

    await expect(
      SalaryComponent.create({ name: 'Bad', code: 'BAD1', type: 'earning', statutoryBase: 'gross' }),
    ).rejects.toThrow();
  });

  it('is accepted by POST and PATCH /payroll/components', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post('/api/v1/payroll/components')
      .set(auth)
      .send({ name: 'Pay A', code: 'PAYA', type: 'earning', statutoryBase: 'basic' });
    expect(created.status).toBe(201);
    expect(created.body.data.statutoryBase).toBe('basic');

    const id = created.body.data._id as string;
    const cleared = await request(app)
      .patch(`/api/v1/payroll/components/${id}`)
      .set(auth)
      .send({ statutoryBase: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.statutoryBase).toBeNull();

    const invalid = await request(app)
      .post('/api/v1/payroll/components')
      .set(auth)
      .send({ name: 'Pay B', code: 'PAYB', type: 'earning', statutoryBase: 'gross' });
    expect(invalid.status).toBe(400);
  });
});
