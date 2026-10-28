/**
 * Logins for employees who have none: the list (GET /employees/without-login),
 * one employee (POST /employees/:id/login) and many at once
 * (POST /employees/logins). The starting password is random, returned once,
 * and signs in straight away.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createRole, createUser } from '../test/factories.js';
import { auth } from '../test/field-fixtures.js';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { validatePasswordStrength } from '../lib/password-security.js';
import { startingPassword } from './employees.controller.js';

let app: Express;

beforeEach(async () => {
  app = createApp();
  await createRole('employee');
  await createRole('field_employee');
});

let seq = 0;
/** An employee record with no login, the way 56 of them were on the live server. */
async function employeeWithoutLogin(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return Employee.create({
    firstName: 'Akshay',
    lastName: `Chauhan${seq}`,
    email: `akshay.${seq}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...overrides,
  });
}

const signIn = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

describe('startingPassword', () => {
  it('is 10 characters, passes the strength rules and is different each time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pw = startingPassword();
      expect(pw).toHaveLength(10);
      expect(pw).not.toMatch(/[0O1lI]/);
      expect(validatePasswordStrength(pw).ok).toBe(true);
      seen.add(pw);
    }
    expect(seen.size).toBe(200);
  });
});

describe('POST /employees/:id/login', () => {
  it('HR Manager gives an employee a login; they sign in with the password it returns', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const akshay = await employeeWithoutLogin({ email: 'Chauhan.Akshay@Test.local' });

    const res = await request(app).post(`/api/v1/employees/${akshay._id}/login`).set(auth(hr.token));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'chauhan.akshay@test.local', role: 'Employee' });
    const { password } = res.body.data as { password: string };
    expect(password).toHaveLength(10);

    const linked = await Employee.findById(akshay._id).lean();
    const user = await User.findById(linked?.userId).lean();
    expect(user).toMatchObject({ status: 'active', emailVerified: true });

    const login = await signIn('chauhan.akshay@test.local', password);
    expect(login.status).toBe(200);
  });

  it('field staff get the Field Employee role', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const field = await employeeWithoutLogin({ isFieldStaff: true });
    const res = await request(app).post(`/api/v1/employees/${field._id}/login`).set(auth(hr.token));
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('Field Employee');
  });

  it('409 when the employee already has a login, or has left', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const akshay = await employeeWithoutLogin();
    expect((await request(app).post(`/api/v1/employees/${akshay._id}/login`).set(auth(hr.token))).status).toBe(201);
    const again = await request(app).post(`/api/v1/employees/${akshay._id}/login`).set(auth(hr.token));
    expect(again.status).toBe(409);

    const left = await employeeWithoutLogin({ status: 'resigned' });
    const res = await request(app).post(`/api/v1/employees/${left._id}/login`).set(auth(hr.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_EMPLOYED');
    expect(await User.countDocuments({ email: left.email })).toBe(0);
  });

  it('links an existing login with that e-mail that no employee owns, without changing its password', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const { user } = await createUser({ roleSlug: 'employee', email: 'loose@test.local' });
    const loose = await employeeWithoutLogin({ email: 'loose@test.local' });
    const res = await request(app).post(`/api/v1/employees/${loose._id}/login`).set(auth(hr.token));
    expect(res.status).toBe(201);
    expect(res.body.data.password).toBeUndefined();
    expect(String((await Employee.findById(loose._id).lean())?.userId)).toBe(String(user._id));
  });

  it("HR Manager cannot link an admin's login to an employee record", async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    await createUser({ roleSlug: 'admin', email: 'boss@test.local' });
    const decoy = await employeeWithoutLogin({ email: 'boss@test.local' });
    const res = await request(app).post(`/api/v1/employees/${decoy._id}/login`).set(auth(hr.token));
    expect(res.status).toBe(403);
    expect((await Employee.findById(decoy._id).lean())?.userId).toBeFalsy();
  });

  it('403 for someone who does not manage logins', async () => {
    const exec = await createUser({ roleSlug: 'hr_executive' });
    const akshay = await employeeWithoutLogin();
    const res = await request(app).post(`/api/v1/employees/${akshay._id}/login`).set(auth(exec.token));
    expect(res.status).toBe(403);
  });
});

describe('GET /employees/without-login and POST /employees/logins', () => {
  it('lists employed people without a login, then creates logins for all of them', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const a = await employeeWithoutLogin();
    const b = await employeeWithoutLogin({ status: 'onNotice' });
    await employeeWithoutLogin({ status: 'terminated' });

    const list = await request(app).get('/api/v1/employees/without-login').set(auth(hr.token));
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ _id: string }>).map((e) => e._id).sort()).toEqual(
      [String(a._id), String(b._id)].sort(),
    );

    const res = await request(app).post('/api/v1/employees/logins').set(auth(hr.token)).send({});
    expect(res.status).toBe(201);
    const { created, skipped } = res.body.data as {
      created: Array<{ email: string; password: string }>;
      skipped: unknown[];
    };
    expect(created).toHaveLength(2);
    expect(skipped).toHaveLength(0);
    // eslint-disable-next-line no-await-in-loop
    for (const c of created) expect((await signIn(c.email, c.password)).status).toBe(200);

    const after = await request(app).get('/api/v1/employees/without-login').set(auth(hr.token));
    expect(after.body.data).toHaveLength(0);
  });

  it('only the chosen employees; one that cannot be given a login is skipped with the reason', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const a = await employeeWithoutLogin();
    const left = await employeeWithoutLogin({ status: 'resigned' });
    const untouched = await employeeWithoutLogin();

    const res = await request(app)
      .post('/api/v1/employees/logins')
      .set(auth(hr.token))
      .send({ employeeIds: [String(a._id), String(left._id)] });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toHaveLength(1);
    expect(res.body.data.skipped).toEqual([
      expect.objectContaining({ employee: expect.objectContaining({ _id: String(left._id) }), reason: expect.stringMatching(/no longer employed/) }),
    ]);
    expect((await Employee.findById(untouched._id).lean())?.userId).toBeFalsy();
  });
});
