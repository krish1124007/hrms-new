/**
 * Self-service profile (`/employees/me`), the employee directory, and the
 * restore view of soft-deleted employees.
 *
 *   • `/employees/me` is any logged-in user's own profile — never salary or
 *     bank details; a user with no employee record gets 404 NO_EMPLOYEE_PROFILE
 *     (not the old 403 / "Invalid _id: me" from `/:id`).
 *   • `PATCH /employees/me` edits only contact fields; anything else is 400.
 *   • `/employees/directory*` lists colleagues still employed, with contact
 *     fields only, to everyone.
 *   • `?includeDeleted=1` shows soft-deleted employees to `employees.delete`
 *     holders (who can restore them) and is ignored for everyone else.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { Shift } from '../models/shift.model.js';
import { User } from '../models/user.model.js';
import { signFileUrl } from '../lib/file-urls.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let app: Express;

beforeEach(() => {
  app = createApp();
});

/** An employee with no login of their own (saves a password hash). */
function colleague(overrides: Record<string, unknown> = {}): Promise<IEmployee> {
  const tag = Math.random().toString(36).slice(2, 10);
  return Employee.create({
    firstName: 'Col',
    lastName: `League${tag}`,
    email: `colleague.${tag}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...overrides,
  });
}

describe('GET /employees/me', () => {
  it("returns the caller's own profile with names resolved and no salary or bank details", async () => {
    const dept = await Department.create({ name: 'Sales', code: 'SAL' });
    const desig = await Designation.create({ name: 'Executive' });
    const shift = await Shift.create({ name: 'General', startTime: '09:30', endTime: '18:30' });
    const boss = await colleague({ firstName: 'Bina', lastName: 'Boss' });
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const me = await createEmployeeFor(user, {
      phone: '9876543210',
      department: dept._id,
      designation: desig._id,
      shift: shift._id,
      reportingManager: boss._id,
      profileImage: 'https://cdn.test/me.png',
      salary: { basic: 50000, hra: 20000 },
      bankDetails: { bankName: 'HDFC', accountNumber: '1234567890' },
      address: { current: { city: 'Surat' } },
      emergencyContact: { name: 'Mom', phone: '999' },
    });

    const res = await request(app).get('/api/v1/employees/me').set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data._id).toBe(String(me._id));
    expect(data.employeeId).toBe(me.employeeId);
    expect(data.phone).toBe('9876543210');
    expect(data.avatar).toBe('https://cdn.test/me.png');
    expect(data.status).toBe('active');
    expect(data.isFieldStaff).toBe(false);
    expect(data.department).toEqual({ _id: String(dept._id), name: 'Sales' });
    expect(data.designation).toEqual({ _id: String(desig._id), name: 'Executive' });
    expect(data.shift).toEqual({ _id: String(shift._id), name: 'General', startTime: '09:30', endTime: '18:30' });
    expect(data.reportingManager).toEqual({ _id: String(boss._id), firstName: 'Bina', lastName: 'Boss' });
    expect(data.address.current.city).toBe('Surat');
    expect(data.emergencyContact).toMatchObject({ name: 'Mom', phone: '999' });
    expect(data).toHaveProperty('joiningDate');
    expect(data).not.toHaveProperty('salary');
    expect(data).not.toHaveProperty('bankDetails');
    expect(data).not.toHaveProperty('documents');
    expect(JSON.stringify(data)).not.toContain('50000');
  });

  it('404 NO_EMPLOYEE_PROFILE for a user without an employee record (the seeded admin)', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });

    const res = await request(app).get('/api/v1/employees/me').set(auth(token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('PATCH /employees/me', () => {
  it('saves contact fields and returns the updated profile', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const me = await createEmployeeFor(user, {
      phone: '111',
      address: { current: { city: 'Surat' }, permanent: { city: 'Rajkot' } },
      emergencyContact: { name: 'Mom', relation: 'Mother', phone: '999' },
    });

    const res = await request(app)
      .patch('/api/v1/employees/me')
      .set(auth(token))
      .send({
        phone: '9876543210',
        personalEmail: 'Me@Personal.test',
        address: { current: { city: 'Ahmedabad', zip: '380001' } },
        emergencyContact: { phone: '888' },
        // An uploaded file is referenced by the signed link the API issued for it.
        avatar: signFileUrl('/uploads/avatars/me.png'),
      });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('9876543210');
    expect(res.body.data.personalEmail).toBe('me@personal.test');
    expect(res.body.data.avatar).toContain('/api/v1/files/avatars/me.png?exp=');
    expect(res.body.data).not.toHaveProperty('salary');

    const saved = await Employee.findById(me._id).lean().orFail();
    expect(saved.phone).toBe('9876543210');
    // Stored in its permanent form, so the reference never expires.
    expect(saved.profileImage).toBe('/uploads/avatars/me.png');
    expect((await User.findById(user._id).lean().orFail()).avatar).toBe('/uploads/avatars/me.png');
    // Only the given part of the address / contact changed.
    expect(saved.address.current).toMatchObject({ city: 'Ahmedabad', zip: '380001' });
    expect(saved.address.permanent).toMatchObject({ city: 'Rajkot' });
    expect(saved.emergencyContact).toMatchObject({ name: 'Mom', relation: 'Mother', phone: '888' });
  });

  it('400 for any field outside the contact fields — salary, department, status…', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const me = await createEmployeeFor(user, { salary: { basic: 1000 } });

    for (const body of [
      { salary: { basic: 999999 } },
      { phone: '1', department: '0123456789abcdef01234567' },
      { status: 'inactive' },
      { address: { current: { city: 'X' }, office: { city: 'Y' } } },
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).patch('/api/v1/employees/me').set(auth(token)).send(body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }

    const saved = await Employee.findById(me._id).lean().orFail();
    expect(saved.salary.basic).toBe(1000);
    expect(saved.phone).toBeUndefined();
    expect(saved.status).toBe('active');
  });

  it('404 NO_EMPLOYEE_PROFILE without an employee record', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const res = await request(app).patch('/api/v1/employees/me').set(auth(token)).send({ phone: '1' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('employee directory', () => {
  it('lists employed colleagues to an employee — never inactive or deleted ones, never salary', async () => {
    const sales = await Department.create({ name: 'Sales', code: 'SAL' });
    const ops = await Department.create({ name: 'Ops', code: 'OPS' });
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const me = await createEmployeeFor(user, { department: sales._id });
    const active = await colleague({ firstName: 'Asha', department: sales._id, phone: '555', salary: { basic: 77777 } });
    const opsPerson = await colleague({ firstName: 'Omar', department: ops._id });
    const inactive = await colleague({ firstName: 'Inez', status: 'inactive', department: sales._id });
    const deleted = await colleague({ firstName: 'Dora', department: sales._id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (deleted as any).softDelete();

    const res = await request(app).get('/api/v1/employees/directory').set(auth(token));

    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ _id: string }>).map((row) => row._id).sort();
    expect(ids).toEqual([String(me._id), String(active._id), String(opsPerson._id)].sort());
    expect(res.body.pagination).toMatchObject({ page: 1, total: 3 });
    const asha = res.body.data.find((row: { _id: string }) => row._id === String(active._id));
    expect(asha).toMatchObject({
      employeeId: active.employeeId,
      firstName: 'Asha',
      email: active.email,
      phone: '555',
      department: { _id: String(sales._id), name: 'Sales' },
    });
    expect(asha).not.toHaveProperty('salary');
    expect(asha).not.toHaveProperty('bankDetails');
    expect(JSON.stringify(res.body)).not.toContain('77777');
    expect(ids).not.toContain(String(inactive._id));
    expect(ids).not.toContain(String(deleted._id));

    const filtered = await request(app)
      .get('/api/v1/employees/directory')
      .query({ department: String(ops._id) })
      .set(auth(token));
    expect(filtered.body.data.map((row: { _id: string }) => row._id)).toEqual([String(opsPerson._id)]);

    const searched = await request(app)
      .get('/api/v1/employees/directory')
      .query({ search: 'ash' })
      .set(auth(token));
    expect(searched.body.data.map((row: { _id: string }) => row._id)).toEqual([String(active._id)]);
  });

  it('stats count employed people only, per department', async () => {
    const sales = await Department.create({ name: 'Sales', code: 'SAL' });
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await createEmployeeFor(user, { department: sales._id });
    await colleague({ department: sales._id });
    await colleague();
    await colleague({ status: 'terminated', department: sales._id });
    const gone = await colleague({ department: sales._id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (gone as any).softDelete();

    const res = await request(app).get('/api/v1/employees/directory/stats').set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    const salesRow = res.body.data.byDepartment.find(
      (row: { departmentId: string | null }) => row.departmentId === String(sales._id),
    );
    expect(salesRow).toEqual({ departmentId: String(sales._id), name: 'Sales', count: 2 });
    const unassigned = res.body.data.byDepartment.find(
      (row: { departmentId: string | null }) => row.departmentId === null,
    );
    expect(unassigned).toMatchObject({ count: 1 });
  });

  it('GET /directory/:id returns one colleague; 404 when inactive or deleted', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await createEmployeeFor(user);
    const active = await colleague({ salary: { basic: 55555 } });
    const inactive = await colleague({ status: 'resigned' });
    const deleted = await colleague();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (deleted as any).softDelete();

    const ok = await request(app).get(`/api/v1/employees/directory/${active._id}`).set(auth(token));
    expect(ok.status).toBe(200);
    expect(ok.body.data._id).toBe(String(active._id));
    expect(ok.body.data).not.toHaveProperty('salary');

    for (const gone of [inactive, deleted]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get(`/api/v1/employees/directory/${gone._id}`).set(auth(token));
      expect(res.status).toBe(404);
    }
    const bad = await request(app).get('/api/v1/employees/directory/not-an-id').set(auth(token));
    expect(bad.status).toBe(404);
  });

  it('works for a user without an employee record', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    await colleague();
    const res = await request(app).get('/api/v1/employees/directory').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('soft-deleted employees (?includeDeleted=1)', () => {
  it('GET /employees/:id shows a deleted employee to an employees.delete holder only', async () => {
    const gone = await colleague();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (gone as any).softDelete();
    const { token: hrManager } = await createUser({ roleSlug: 'hr_manager' });
    const { token: hrExecutive } = await createUser({ roleSlug: 'hr_executive' });

    const seen = await request(app)
      .get(`/api/v1/employees/${gone._id}`)
      .query({ includeDeleted: '1' })
      .set(auth(hrManager));
    expect(seen.status).toBe(200);
    expect(seen.body.data.isDeleted).toBe(true);
    expect(seen.body.data.deletedAt).toBeTruthy();

    const hidden = await request(app)
      .get(`/api/v1/employees/${gone._id}`)
      .query({ includeDeleted: '1' })
      .set(auth(hrExecutive));
    expect(hidden.status).toBe(404);

    const plain = await request(app).get(`/api/v1/employees/${gone._id}`).set(auth(hrManager));
    expect(plain.status).toBe(404);
  });

  it('GET /employees lists deleted employees alongside the rest for an employees.delete holder only', async () => {
    const kept = await colleague();
    const gone = await colleague();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (gone as any).softDelete();
    const { token: hrManager } = await createUser({ roleSlug: 'hr_manager' });
    const { token: hrExecutive } = await createUser({ roleSlug: 'hr_executive' });

    const all = await request(app)
      .get('/api/v1/employees')
      .query({ includeDeleted: '1' })
      .set(auth(hrManager));
    expect(all.status).toBe(200);
    const rows = all.body.data as Array<{ _id: string; isDeleted: boolean }>;
    expect(rows.map((row) => row._id).sort()).toEqual([String(kept._id), String(gone._id)].sort());
    expect(rows.find((row) => row._id === String(gone._id))?.isDeleted).toBe(true);
    expect(all.body.pagination.total).toBe(2);

    const ignored = await request(app)
      .get('/api/v1/employees')
      .query({ includeDeleted: '1' })
      .set(auth(hrExecutive));
    expect(ignored.status).toBe(200);
    expect(ignored.body.data.map((row: { _id: string }) => row._id)).toEqual([String(kept._id)]);

    const plain = await request(app).get('/api/v1/employees').set(auth(hrManager));
    expect(plain.body.data.map((row: { _id: string }) => row._id)).toEqual([String(kept._id)]);
  });
});
