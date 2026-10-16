/**
 * Test data factories. Everything is written through the real Mongoose models
 * so schema hooks (password hashing, employeeId generation, ...) run exactly
 * as they do in production.
 */
import { randomUUID } from 'node:crypto';
import { Role, DEFAULT_ROLES, type IRole } from '../models/role.model.js';
import { User, type IUser } from '../models/user.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';

export type RoleSlug = 'admin' | 'hr_manager' | 'hr_executive' | 'manager' | 'employee';

export const DEFAULT_TEST_PASSWORD = 'Passw0rd!Test#1';

/** Upsert one of the built-in roles (by slug) straight from DEFAULT_ROLES. */
export async function createRole(slug: RoleSlug): Promise<IRole> {
  const definition = DEFAULT_ROLES.find((role) => role.slug === slug);
  if (!definition) {
    throw new Error(`createRole: "${slug}" is not one of the DEFAULT_ROLES`);
  }
  return Role.findOneAndUpdate(
    { slug },
    { $set: definition },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).orFail();
}

/** Create an active user with the given role and a signed access token. */
export async function createUser(opts: {
  roleSlug: string;
  email?: string;
  password?: string;
}): Promise<{ user: IUser; token: string }> {
  const role = await createRole(opts.roleSlug as RoleSlug);
  const user = await User.create({
    email: opts.email ?? `${opts.roleSlug}.${randomUUID().slice(0, 8)}@test.local`,
    password: opts.password ?? DEFAULT_TEST_PASSWORD,
    firstName: 'Test',
    lastName: role.name,
    role: role._id,
    status: 'active',
    emailVerified: true,
  });
  return { user, token: user.generateAccessToken() };
}

/** Create the employee record linked to `user` (employeeId auto-generates). */
export async function createEmployeeFor(user: IUser): Promise<IEmployee> {
  return Employee.create({
    userId: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    joiningDate: new Date('2024-01-15'),
  });
}
