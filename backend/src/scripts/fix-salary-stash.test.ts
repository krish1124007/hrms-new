/**
 * fix-salary-stash: the CSV seed / import scripts parked statutory figures
 * (PF, ESIC, PT, net pay, CTC) in `salary.otherAllowances`, and the employee
 * pre-save hook folded them into `grossSalary`. The script removes those keys
 * and recomputes `grossSalary` — reporting only by default, writing with --apply.
 */
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Employee } from '../models/employee.model.js';
import { runFixSalaryStash, STASHED_KEYS } from './fix-salary-stash.js';

let seq = 0;
async function employeeWith(otherAllowances: Record<string, number>, extra: Record<string, unknown> = {}) {
  seq += 1;
  return Employee.create({
    firstName: 'Stash',
    lastName: `Case${seq}`,
    email: `stash.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    salary: { basic: 10000, hra: 4000, da: 0, specialAllowance: 6000, otherAllowances },
    ...extra,
  });
}

const salaryOf = async (id: unknown) =>
  (await Employee.findById(id).setOptions({ withDeleted: true }).lean().orFail().exec()).salary;

function capture(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (line) => lines.push(line) };
}

describe('fix-salary-stash', () => {
  it('lists every stashed key the seed and import scripts wrote', () => {
    expect([...STASHED_KEYS].sort()).toEqual(
      ['ctc', 'employeeEsic', 'employeePf', 'employerEsic', 'employerPf', 'net', 'netPay', 'professionalTax', 'pt'].sort(),
    );
  });

  it('dry run (the default) reports the change and writes nothing', async () => {
    const emp = await employeeWith({ employeePf: 1800, ctc: 30000, travel: 500 });
    const before = await salaryOf(emp._id);
    // The pre-save hook folded the stash into the gross: 20,000 + 1,800 + 30,000 + 500.
    expect(before.grossSalary).toBe(52300);

    const out = capture();
    const result = await runFixSalaryStash([], out.print);

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      id: String(emp._id),
      removed: { employeePf: 1800, ctc: 30000 },
      otherAllowancesAfter: { travel: 500 },
      grossBefore: 52300,
      grossAfter: 20500,
    });

    const report = out.lines.join('\n');
    expect(report).toMatch(/dry run/i);
    expect(report).toContain(emp.employeeId);
    expect(report).toContain('employeePf=1800');
    expect(report).toContain('ctc=30000');
    expect(report).toContain('52300 → 20500');

    expect(await salaryOf(emp._id)).toEqual(before);
  });

  it('--apply leaves { travel: 500 } and grossSalary 20,500; a second run finds nothing', async () => {
    const emp = await employeeWith({ employeePf: 1800, ctc: 30000, travel: 500 });

    const out = capture();
    const result = await runFixSalaryStash(['--apply'], out.print);

    expect(result.applied).toBe(true);
    expect(result.changes).toHaveLength(1);
    const after = await salaryOf(emp._id);
    expect(after.otherAllowances).toEqual({ travel: 500 });
    expect(after.grossSalary).toBe(20500);
    expect(after.basic).toBe(10000);
    expect(out.lines.join('\n')).toMatch(/applied/i);

    const again = await runFixSalaryStash(['--apply'], capture().print);
    expect(again.changes).toHaveLength(0);
  });

  it('cleans every stashed key, soft-deleted employees included, and leaves clean employees alone', async () => {
    const all = await employeeWith({
      employeePf: 1,
      employeeEsic: 2,
      employerPf: 3,
      employerEsic: 4,
      pt: 5,
      professionalTax: 6,
      net: 7,
      netPay: 8,
      ctc: 9,
    });
    const gone = await employeeWith({ pt: 200, net: 19800 });
    await Employee.updateOne({ _id: gone._id }, { $set: { isDeleted: true, deletedAt: new Date() } }).exec();
    const clean = await employeeWith({ travel: 300 });
    const cleanBefore = await Employee.findById(clean._id).lean().orFail().exec();

    const result = await runFixSalaryStash(['--apply'], capture().print);

    expect(result.changes.map((c) => c.id).sort()).toEqual([String(all._id), String(gone._id)].sort());
    expect((await salaryOf(all._id)).otherAllowances).toEqual({});
    expect((await salaryOf(all._id)).grossSalary).toBe(20000);
    expect((await salaryOf(gone._id)).grossSalary).toBe(20000);
    expect(await Employee.findById(clean._id).lean().orFail().exec()).toEqual(cleanBefore);
  });

  it('rejects an unknown argument instead of silently doing a dry run', async () => {
    await expect(runFixSalaryStash(['--aply'], capture().print)).rejects.toThrow(/--aply/);
  });
});
