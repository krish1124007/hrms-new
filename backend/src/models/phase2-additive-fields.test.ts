/**
 * Phase 2 added fields to live collections with autoIndex off and no
 * migration. These tests pin the contract that makes that safe: documents
 * written before the fields existed still load, new documents get the
 * documented defaults, and nothing new is required.
 */
import { describe, it, expect } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { Attendance } from './attendance.model.js';
import { AttendanceConfig } from './attendance-config.model.js';
import { Employee } from './employee.model.js';
import { PayrollRecord } from './payroll-record.model.js';
import { PayrollCycle } from './payroll-cycle.model.js';
import { Holiday } from './holiday.model.js';
import { updateConfigSchema } from '../controllers/attendance.controller.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../controllers/employees.controller.js';

const oid = () => new Types.ObjectId();

describe('Attendance additive fields', () => {
  it('a row written before the new fields existed loads with source=punch', async () => {
    const employeeId = oid();
    // Raw insert: bypasses Mongoose defaults, exactly like a pre-existing row.
    await mongoose.connection.collection('attendances').insertOne({
      employeeId,
      date: new Date(2026, 9, 5),
      status: 'present',
      isDeleted: false,
    });
    const row = await Attendance.findOne({ employeeId }).exec();
    expect(row).not.toBeNull();
    expect(row!.source).toBe('punch');
    expect(row!.leaveRequestId).toBeUndefined();
    expect(row!.isPaidLeave).toBeUndefined();
  });

  it('accepts every source value and rejects an unknown one', async () => {
    for (const source of [
      'punch',
      'leave',
      'auto_absent',
      'auto_checkout',
      'regularization',
      'correction',
    ] as const) {
      const row = new Attendance({ employeeId: oid(), date: new Date(2026, 9, 5), source });
      expect(row.validateSync()).toBeUndefined();
    }
    const bad = new Attendance({ employeeId: oid(), date: new Date(2026, 9, 5), source: 'bogus' });
    expect(bad.validateSync()?.errors.source).toBeDefined();
  });

  it('stores leave linkage and requested regularization punch times', async () => {
    const leaveRequestId = oid();
    const requestedCheckIn = new Date(2026, 9, 5, 9, 30);
    const requestedCheckOut = new Date(2026, 9, 5, 18, 30);
    const row = await Attendance.create({
      employeeId: oid(),
      date: new Date(2026, 9, 5),
      status: 'on_leave',
      leaveRequestId,
      isPaidLeave: true,
      source: 'leave',
      regularization: { reason: 'forgot to punch', requestedCheckIn, requestedCheckOut },
    });
    const found = await Attendance.findById(row._id).lean().exec();
    expect(String(found!.leaveRequestId)).toBe(String(leaveRequestId));
    expect(found!.isPaidLeave).toBe(true);
    expect(found!.regularization!.requestedCheckIn).toEqual(requestedCheckIn);
    expect(found!.regularization!.requestedCheckOut).toEqual(requestedCheckOut);
  });
});

describe('AttendanceConfig.expenseBeforeCheckout', () => {
  it('defaults to "all" on a fresh config and on a legacy config without the key', async () => {
    const fresh = await AttendanceConfig.create({ enabledMethods: ['manual'] });
    expect(fresh.settings.expenseBeforeCheckout).toBe('all');

    await mongoose.connection.collection('attendanceconfigs').deleteMany({});
    await mongoose.connection
      .collection('attendanceconfigs')
      .insertOne({ enabledMethods: ['manual'], settings: { lateMarkAfterMinutes: 10 } });
    const legacy = await AttendanceConfig.findOne({}).exec();
    expect(legacy!.settings.expenseBeforeCheckout).toBe('all');
  });

  it('is accepted by the updateConfig zod schema and rejects unknown modes', () => {
    const ok = updateConfigSchema.safeParse({
      enabledMethods: ['manual'],
      settings: { expenseBeforeCheckout: 'field' },
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.settings?.expenseBeforeCheckout).toBe('field');

    const bad = updateConfigSchema.safeParse({
      enabledMethods: ['manual'],
      settings: { expenseBeforeCheckout: 'sometimes' },
    });
    expect(bad.success).toBe(false);
  });
});

describe('Employee additive fields', () => {
  const base = {
    firstName: 'Asha',
    lastName: 'Patel',
    email: 'asha@test.local',
    joiningDate: new Date(2026, 0, 1),
  };

  it('new employees default isFieldStaff=false, tdsMonthly=0, no structure, no statutory block', async () => {
    const emp = await Employee.create(base);
    expect(emp.isFieldStaff).toBe(false);
    expect(emp.salary.tdsMonthly).toBe(0);
    expect(emp.salaryStructureId).toBeUndefined();
    expect(emp.statutory).toBeUndefined();
  });

  it('a legacy employee row (no new fields) still loads', async () => {
    const _id = oid();
    await mongoose.connection.collection('employees').insertOne({
      _id,
      employeeId: 'EMP900001',
      firstName: 'Old',
      lastName: 'Row',
      email: 'old@test.local',
      joiningDate: new Date(2020, 0, 1),
      salary: { basic: 1000, hra: 0, da: 0, specialAllowance: 0, otherAllowances: {}, grossSalary: 1000 },
      isDeleted: false,
    });
    const emp = await Employee.findById(_id).exec();
    expect(emp).not.toBeNull();
    expect(emp!.isFieldStaff).toBe(false);
    expect(emp!.salary.tdsMonthly).toBe(0);
  });

  it('persists salaryStructureId and the statutory flags', async () => {
    const salaryStructureId = oid();
    const emp = await Employee.create({
      ...base,
      email: 'b@test.local',
      isFieldStaff: true,
      salaryStructureId,
      salary: { basic: 10000, tdsMonthly: 250 },
      statutory: { esiEligible: true, esiPeriodKey: '2026-04' },
    });
    const found = await Employee.findById(emp._id).lean().exec();
    expect(found!.isFieldStaff).toBe(true);
    expect(String(found!.salaryStructureId)).toBe(String(salaryStructureId));
    expect(found!.salary.tdsMonthly).toBe(250);
    expect(found!.statutory?.esiEligible).toBe(true);
    expect(found!.statutory?.esiPeriodKey).toBe('2026-04');
  });

  it('create/update zod schemas accept the new keys', () => {
    const id = '0123456789abcdef01234567';
    const created = createEmployeeSchema.safeParse({
      ...base,
      isFieldStaff: true,
      salaryStructureId: id,
      salary: { basic: '1000', tdsMonthly: '125.5' },
    });
    expect(created.success).toBe(true);
    if (created.success) {
      expect(created.data.isFieldStaff).toBe(true);
      expect(created.data.salaryStructureId).toBe(id);
      expect(created.data.salary?.tdsMonthly).toBe(125.5);
    }

    const cleared = updateEmployeeSchema.safeParse({ salaryStructureId: null });
    expect(cleared.success).toBe(true);

    expect(createEmployeeSchema.safeParse({ ...base, salaryStructureId: 'not-an-id' }).success).toBe(
      false,
    );
    expect(
      createEmployeeSchema.safeParse({ ...base, salary: { tdsMonthly: -1 } }).success,
    ).toBe(false);
  });
});

describe('PayrollRecord additive fields', () => {
  it('defaults tds=0 and every manual adjustment to null ("not overridden")', async () => {
    const rec = await PayrollRecord.create({ cycleId: oid(), employeeId: oid() });
    expect(rec.tds).toBe(0);
    const m = rec.manualAdjustments;
    expect(m.arrears).toBeNull();
    expect(m.advance).toBeNull();
    expect(m.expense).toBeNull();
    expect(m.reimbursements).toBeNull();
    expect(m.loanDeduction).toBeNull();
    expect(m.tds).toBeNull();
    expect(m.note).toBeUndefined();
  });

  it('a legacy record without the new fields loads with the same defaults', async () => {
    const _id = oid();
    await mongoose.connection.collection('payrollrecords').insertOne({
      _id,
      cycleId: oid(),
      employeeId: oid(),
      earnings: [{ name: 'Basic', amount: 1000 }],
      deductions: [],
      isDeleted: false,
    });
    const rec = await PayrollRecord.findById(_id).exec();
    expect(rec).not.toBeNull();
    expect(rec!.tds).toBe(0);
    expect(rec!.manualAdjustments.tds).toBeNull();
    expect(rec!.earnings[0].statutoryType).toBeUndefined();
  });

  it('keeps a 0 override distinct from "not overridden" and validates statutoryType', async () => {
    const rec = await PayrollRecord.create({
      cycleId: oid(),
      employeeId: oid(),
      deductions: [{ name: 'PF', amount: 1800, statutoryType: 'pf' }],
      manualAdjustments: { advance: 0, note: 'waived' },
    });
    const found = await PayrollRecord.findById(rec._id).lean().exec();
    expect(found!.manualAdjustments.advance).toBe(0);
    expect(found!.manualAdjustments.arrears).toBeNull();
    expect(found!.manualAdjustments.note).toBe('waived');
    expect(found!.deductions[0].statutoryType).toBe('pf');

    const bad = new PayrollRecord({
      cycleId: oid(),
      employeeId: oid(),
      deductions: [{ name: 'X', amount: 1, statutoryType: 'gst' }],
    });
    expect(bad.validateSync()).toBeDefined();
  });
});

describe('PayrollCycle lock/pay audit fields', () => {
  it('are optional and round-trip', async () => {
    const plain = await PayrollCycle.create({ month: 10, year: 2026 });
    expect(plain.lockedAt).toBeUndefined();
    expect(plain.lockedBy).toBeUndefined();
    expect(plain.paidBy).toBeUndefined();

    const lockedBy = oid();
    const paidBy = oid();
    const lockedAt = new Date(2026, 10, 1);
    const cycle = await PayrollCycle.create({
      month: 9,
      year: 2026,
      lockedAt,
      lockedBy,
      paidAt: lockedAt,
      paidBy,
    });
    const found = await PayrollCycle.findById(cycle._id).lean().exec();
    expect(String(found!.lockedBy)).toBe(String(lockedBy));
    expect(String(found!.paidBy)).toBe(String(paidBy));
    expect(found!.lockedAt).toEqual(lockedAt);
  });
});

describe('Holiday unique (date, name) index', () => {
  const date = new Date(2026, 9, 20);

  it('is partial on live rows: a soft-deleted holiday can be added again, a live duplicate cannot', async () => {
    await Holiday.syncIndexes();

    const first = await Holiday.create({ name: 'Diwali', date, type: 'public' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (first as any).softDelete();

    // Same name + date as a soft-deleted row: allowed.
    const second = await Holiday.create({ name: 'Diwali', date, type: 'public' });
    expect(second._id).toBeDefined();

    // Same name + date as a live row: duplicate key.
    await expect(Holiday.create({ name: 'Diwali', date, type: 'public' })).rejects.toMatchObject({
      code: 11000,
    });

    // A different name on the same date is unaffected.
    await expect(Holiday.create({ name: 'Govardhan Puja', date, type: 'public' })).resolves.toBeDefined();
  });

  it('is defined as a partial unique index on isDeleted:false', async () => {
    await Holiday.syncIndexes();
    const indexes = await Holiday.collection.indexes();
    const idx = indexes.find((i) => i.key && i.key.date === 1 && i.key.name === 1);
    expect(idx).toBeDefined();
    expect(idx!.unique).toBe(true);
    expect(idx!.partialFilterExpression).toEqual({ isDeleted: false });
  });
});
