import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { DEFAULT_ROLES, Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { createRole, createUser, createEmployeeFor } from './factories.js';

describe('test environment', () => {
  it('is pinned before config/env parses process.env', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('error');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.UPLOAD_DIR).toBe(path.join(os.tmpdir(), 'hrms-test-uploads'));
    // Pinned to blank (not left unset) so a developer's .env cannot enable real mail.
    expect(env.RESEND_API_KEY).toBe('');
    expect(env.SMTP_HOST).toBe('');
    expect(env.SMTP_USER).toBe('');
    expect(env.SMTP_PASS).toBe('');
    expect(env.JWT_SECRET).not.toBe(env.JWT_REFRESH_SECRET);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.ENCRYPTION_KEY.length).toBeGreaterThanOrEqual(32);
  });
});

describe('test factories', () => {
  it('createRole upserts the built-in role definition exactly once', async () => {
    const first = await createRole('hr_manager');
    const second = await createRole('hr_manager');
    const definition = DEFAULT_ROLES.find((role) => role.slug === 'hr_manager');

    expect(second._id.equals(first._id)).toBe(true);
    expect(await Role.countDocuments({ slug: 'hr_manager' })).toBe(1);
    expect(first.permissions).toEqual(definition?.permissions);
  });

  it('createUser returns a token that the auth middleware accepts', async () => {
    const { user, token } = await createUser({ roleSlug: 'admin' });

    const res = await request(createApp()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('createUser rejects a role slug that is not a default role', async () => {
    await expect(createUser({ roleSlug: 'superhero' })).rejects.toThrow(/DEFAULT_ROLES/);
  });

  it('createEmployeeFor links an employee with a generated employeeId to the user', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(user);

    expect(employee.userId?.equals(user._id)).toBe(true);
    expect(employee.employeeId).toMatch(/^EMP\d{6}$/);
  });
});

describe('per-test isolation', () => {
  // These two tests are order-dependent on purpose: the second proves the
  // afterEach hook in setup.ts wiped what the first one wrote.
  it('writes to Mongo and Redis', async () => {
    await createUser({ roleSlug: 'employee' });
    await redis.set('isolation-probe', '1');

    expect(await User.countDocuments()).toBe(1);
    expect(await redis.get('isolation-probe')).toBe('1');
  });

  it('starts the next test with empty collections and an empty Redis', async () => {
    expect(await User.countDocuments()).toBe(0);
    expect(await Role.countDocuments()).toBe(0);
    expect(await redis.get('isolation-probe')).toBeNull();
  });
});
