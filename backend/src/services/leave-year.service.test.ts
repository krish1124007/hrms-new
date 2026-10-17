/**
 * Leave year lifecycle: opening a year (allocation + carry-forward) and the
 * pro-rata allocation a mid-year joiner gets.
 *
 * Before this, balances never rolled over — December's balance vanished on
 * 1 January, `carryForward` was never read — and anyone who joined mid-year
 * was handed a full year's quota the first time they applied.
 */
import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';
import { allocateForEmployee, openLeaveYear, proRataAllocation } from './leave-year.service.js';
import { logger } from '../config/logger.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';

let seq = 0;
async function makeEmployee(fields: Partial<Record<keyof IEmployee, unknown>> = {}): Promise<IEmployee> {
  seq += 1;
  return Employee.create({
    firstName: 'Year',
    lastName: `Open${seq}`,
    email: `year.open.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...fields,
  });
}

async function makeType(fields: Partial<Record<keyof ILeaveType, unknown>> = {}): Promise<ILeaveType> {
  return LeaveType.create({
    name: 'Casual Leave',
    code: `T${new Types.ObjectId().toHexString().slice(-6)}`,
    daysAllowed: 12,
    ...fields,
  });
}

async function balanceOf(emp: IEmployee, type: ILeaveType, year: number) {
  return LeaveBalance.findOne({ employeeId: emp._id, leaveTypeId: type._id, year }).lean().exec();
}

async function seedBalance(
  emp: IEmployee,
  type: ILeaveType,
  year: number,
  fields: { allocated?: number; used?: number; carried?: number; adjusted?: number },
) {
  return LeaveBalance.create({ employeeId: emp._id, leaveTypeId: type._id, year, ...fields });
}

describe('proRataAllocation', () => {
  it('prorates by the months left, counting the joining month', () => {
    expect(proRataAllocation(12, new Date('2026-07-15'), 2026)).toBe(6);
  });

  it('gives the full allowance to anyone who joined before the year', () => {
    expect(proRataAllocation(12, new Date('2025-03-01'), 2026)).toBe(12);
    expect(proRataAllocation(12, new Date('2025-12-31'), 2026)).toBe(12);
  });

  it('January is 12/12 and December is 1/12, rounded half-up to 0.5', () => {
    expect(proRataAllocation(12, new Date('2026-01-01'), 2026)).toBe(12);
    expect(proRataAllocation(12, new Date('2026-01-31'), 2026)).toBe(12);
    expect(proRataAllocation(15, new Date('2026-12-20'), 2026)).toBe(1.5); // 1.25 → 1.5
    expect(proRataAllocation(12, new Date('2026-12-20'), 2026)).toBe(1);
  });

  it('rounds to the nearest half day', () => {
    // October: 3/12 of 10 = 2.5 exactly
    expect(proRataAllocation(10, new Date('2026-10-01'), 2026)).toBe(2.5);
    // September: 4/12 of 10 = 3.33 → 3.5
    expect(proRataAllocation(10, new Date('2026-09-10'), 2026)).toBe(3.5);
    // February: 11/12 of 10 = 9.17 → 9
    expect(proRataAllocation(10, new Date('2026-02-10'), 2026)).toBe(9);
    // March: 10/12 of 7 = 5.83 → 6
    expect(proRataAllocation(7, new Date('2026-03-10'), 2026)).toBe(6);
    // A quota too small to pro-rate to anything rounds to 0.
    expect(proRataAllocation(1, new Date('2026-12-01'), 2026)).toBe(0);
  });

  it('reads the joining month in the business timezone, not the server timezone', () => {
    // 01:30 IST on 1 July — June 30 in UTC.
    expect(proRataAllocation(12, new Date('2026-06-30T20:00:00.000Z'), 2026)).toBe(6);
    // 01:30 IST on 1 January 2026 — still 31 Dec 2025 in UTC (before the year either way).
    expect(proRataAllocation(12, new Date('2025-12-31T20:00:00.000Z'), 2026)).toBe(12);
  });

  it('allocates nothing for a year the employee has not joined yet', () => {
    expect(proRataAllocation(12, new Date('2027-03-01'), 2026)).toBe(0);
  });

  it('a zero allowance stays zero', () => {
    expect(proRataAllocation(0, new Date('2026-03-01'), 2026)).toBe(0);
  });
});

describe('allocateForEmployee', () => {
  it('creates a balance for every active paid leave type and returns how many', async () => {
    const emp = await makeEmployee();
    const cl = await makeType({ daysAllowed: 12 });
    const sl = await makeType({ name: 'Sick Leave', daysAllowed: 8 });
    const lwp = await makeType({ name: 'Leave Without Pay', daysAllowed: 0, paidLeave: false });
    const retired = await makeType({ name: 'Retired Leave', daysAllowed: 3, isActive: false });

    expect(await allocateForEmployee(emp, 2026)).toBe(2);

    expect((await balanceOf(emp, cl, 2026))?.allocated).toBe(12);
    expect((await balanceOf(emp, sl, 2026))?.allocated).toBe(8);
    expect(await balanceOf(emp, lwp, 2026)).toBeNull();
    expect(await balanceOf(emp, retired, 2026)).toBeNull();
  });

  it('treats a type whose code says unpaid as unpaid even if the flag was never cleared', async () => {
    const emp = await makeEmployee();
    const lwp = await makeType({ name: 'Loss of Pay', code: 'LOP', daysAllowed: 30 });

    expect(await allocateForEmployee(emp, 2026)).toBe(0);

    expect(await balanceOf(emp, lwp, 2026)).toBeNull();
  });

  it('two allocations at once create the balance once', async () => {
    const emp = await makeEmployee();
    await makeType();

    const created = await Promise.all([allocateForEmployee(emp, 2026), allocateForEmployee(emp, 2026)]);

    expect(created.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await LeaveBalance.countDocuments({ employeeId: emp._id })).toBe(1);
  });

  it('pro-rates a mid-year joiner', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-07-15') });
    const cl = await makeType({ daysAllowed: 12 });

    await allocateForEmployee(emp, 2026);

    expect((await balanceOf(emp, cl, 2026))?.allocated).toBe(6);
  });

  it('never overwrites an existing balance (HR may have set it by hand)', async () => {
    const emp = await makeEmployee();
    const cl = await makeType({ daysAllowed: 12 });
    await seedBalance(emp, cl, 2026, { allocated: 20, used: 4, adjusted: 1 });

    expect(await allocateForEmployee(emp, 2026)).toBe(0);

    const bal = await balanceOf(emp, cl, 2026);
    expect(bal).toMatchObject({ allocated: 20, used: 4, adjusted: 1 });
  });

  it('is idempotent', async () => {
    const emp = await makeEmployee();
    await makeType();
    expect(await allocateForEmployee(emp, 2026)).toBe(1);
    expect(await allocateForEmployee(emp, 2026)).toBe(0);
    expect(await LeaveBalance.countDocuments({ employeeId: emp._id })).toBe(1);
  });

  it('creates nothing when the pro-rated allocation is zero, so HR can still set one later', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-12-05') });
    const zero = await makeType({ name: 'Manual Leave', daysAllowed: 0 });
    const one = await makeType({ name: 'Floater', daysAllowed: 1 });

    expect(await allocateForEmployee(emp, 2026)).toBe(0);

    expect(await balanceOf(emp, zero, 2026)).toBeNull();
    expect(await balanceOf(emp, one, 2026)).toBeNull();
  });

  it('allocates nothing for a year before the employee joined', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2027-03-01') });
    await makeType();
    expect(await allocateForEmployee(emp, 2026)).toBe(0);
  });
});

describe('openLeaveYear', () => {
  async function company() {
    const cl = await makeType({ name: 'Casual Leave', daysAllowed: 12 });
    const el = await makeType({
      name: 'Earned Leave',
      daysAllowed: 15,
      carryForward: { enabled: true, maxDays: 5 },
    });
    const lwp = await makeType({ name: 'Leave Without Pay', daysAllowed: 0, paidLeave: false });
    const alice = await makeEmployee();
    const bob = await makeEmployee();
    return { cl, el, lwp, alice, bob };
  }

  it('creates balances for every active employee × paid type and skips unpaid types', async () => {
    const { cl, el, lwp, alice, bob } = await company();

    const counts = await openLeaveYear(2027);

    expect(counts).toEqual({ created: 4, carried: 0, skipped: 0 });
    for (const emp of [alice, bob]) {
      expect((await balanceOf(emp, cl, 2027))?.allocated).toBe(12);
      expect((await balanceOf(emp, el, 2027))?.allocated).toBe(15);
      expect(await balanceOf(emp, lwp, 2027)).toBeNull();
    }
  });

  it('carries min(remaining, maxDays) into the new year for types with carry-forward', async () => {
    const { cl, el, alice, bob } = await company();
    // Alice: 15 allocated, 8 used → 7 remaining; cap is 5 → carries 5.
    await seedBalance(alice, el, 2026, { allocated: 15, used: 8 });
    // Bob: 15 + 2 carried + 1 adjusted − 15 used → 3 remaining, under the cap → carries 3.
    await seedBalance(bob, el, 2026, { allocated: 15, carried: 2, adjusted: 1, used: 15 });
    // Casual leave has no carry-forward: its unused days lapse.
    await seedBalance(alice, cl, 2026, { allocated: 12, used: 1 });

    const counts = await openLeaveYear(2027);

    expect(counts).toEqual({ created: 4, carried: 2, skipped: 0 });
    expect((await balanceOf(alice, el, 2027))).toMatchObject({ allocated: 15, carried: 5 });
    expect((await balanceOf(bob, el, 2027))).toMatchObject({ allocated: 15, carried: 3 });
    expect((await balanceOf(alice, cl, 2027))).toMatchObject({ allocated: 12, carried: 0 });
  });

  it('never carries a negative balance', async () => {
    const { el, alice } = await company();
    await seedBalance(alice, el, 2026, { allocated: 15, used: 17 });

    await openLeaveYear(2027);

    expect((await balanceOf(alice, el, 2027))?.carried).toBe(0);
  });

  it('carries nothing for an employee with no previous-year balance', async () => {
    const { el, alice } = await company();

    const counts = await openLeaveYear(2027);

    expect(counts.carried).toBe(0);
    expect((await balanceOf(alice, el, 2027))?.carried).toBe(0);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const { el, alice } = await company();
    await seedBalance(alice, el, 2026, { allocated: 15, used: 8 });

    await openLeaveYear(2027);
    const before = await LeaveBalance.find({ year: 2027 }).sort({ employeeId: 1, leaveTypeId: 1 }).lean().exec();

    const second = await openLeaveYear(2027);
    const after = await LeaveBalance.find({ year: 2027 }).sort({ employeeId: 1, leaveTypeId: 1 }).lean().exec();

    expect(second).toEqual({ created: 0, carried: 0, skipped: 4 });
    expect(after).toEqual(before);
    expect((await balanceOf(alice, el, 2027))?.carried).toBe(5);
  });

  it('keeps an allocation HR already set, and still carries into it', async () => {
    const { el, alice } = await company();
    await seedBalance(alice, el, 2026, { allocated: 15, used: 12 });
    await seedBalance(alice, el, 2027, { allocated: 20 });

    const counts = await openLeaveYear(2027);

    expect(counts).toEqual({ created: 3, carried: 1, skipped: 1 });
    expect(await balanceOf(alice, el, 2027)).toMatchObject({ allocated: 20, carried: 3 });
  });

  it('leaves an existing carried figure alone', async () => {
    const { el, alice } = await company();
    await seedBalance(alice, el, 2026, { allocated: 15, used: 0 });
    await seedBalance(alice, el, 2027, { allocated: 15, carried: 2 });

    await openLeaveYear(2027);

    expect((await balanceOf(alice, el, 2027))?.carried).toBe(2);
  });

  it('skips inactive and deleted employees', async () => {
    const { cl, alice } = await company();
    const resigned = await makeEmployee({ status: 'resigned' });
    const deleted = await makeEmployee();
    await Employee.updateOne({ _id: deleted._id }, { $set: { isDeleted: true } }).setOptions({ withDeleted: true });

    await openLeaveYear(2027);

    expect(await balanceOf(alice, cl, 2027)).not.toBeNull();
    expect(await LeaveBalance.countDocuments({ employeeId: resigned._id })).toBe(0);
    expect(await LeaveBalance.countDocuments({ employeeId: deleted._id })).toBe(0);
  });

  it('pro-rates an employee who joins during the year being opened', async () => {
    const { cl } = await company();
    const joiner = await makeEmployee({ joiningDate: new Date('2027-04-01') });

    await openLeaveYear(2027);

    expect((await balanceOf(joiner, cl, 2027))?.allocated).toBe(9);
  });

  it('can be limited to some employees', async () => {
    const { cl, alice, bob } = await company();

    const counts = await openLeaveYear(2027, { employeeIds: [String(alice._id)] });

    expect(counts.created).toBe(2);
    expect(await balanceOf(alice, cl, 2027)).not.toBeNull();
    expect(await balanceOf(bob, cl, 2027)).toBeNull();
  });

  it('keeps going past one employee that fails, then reports it', async () => {
    const { cl, alice, bob } = await company();
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const real = LeaveBalance.create.bind(LeaveBalance) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(LeaveBalance, 'create').mockImplementation(((doc: { employeeId: Types.ObjectId }, ...rest: unknown[]) => {
      if (String(doc.employeeId) === String(alice._id)) return Promise.reject(new Error('boom'));
      return real(doc, ...rest);
    }) as never);

    await expect(openLeaveYear(2027)).rejects.toThrow(/1 employee/);
    spy.mockRestore();

    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ employeeId: String(alice._id) }), expect.any(String));
    logged.mockRestore();
    expect(await balanceOf(bob, cl, 2027)).not.toBeNull();
    expect(await balanceOf(alice, cl, 2027)).toBeNull();
    // Re-running completes what was left — the run is safe to repeat.
    const rerun = await openLeaveYear(2027);
    expect(rerun.created).toBe(2);
    expect(await balanceOf(alice, cl, 2027)).not.toBeNull();
  });
});
