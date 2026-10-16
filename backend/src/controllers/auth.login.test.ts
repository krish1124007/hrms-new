import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { redis } from '../config/redis.js';
import { createUser, DEFAULT_TEST_PASSWORD } from '../test/factories.js';

const IP_A = '203.0.113.5';
const IP_B = '203.0.113.6';

function login(ip: string, email: string, password: string) {
  return request(createApp())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password });
}

describe('login lockout', () => {
  it('locks an account for the offending IP only, so an attacker cannot lock out the real user', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'victim@test.local' });

    for (let i = 0; i < 5; i++) {
      const res = await login(IP_A, user.email, 'definitely-wrong');
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid credentials');
    }

    const locked = await login(IP_A, user.email, 'definitely-wrong');
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toMatch(/Account locked/);

    // Even the correct password is refused from the locked IP...
    const stillLocked = await login(IP_A, user.email, DEFAULT_TEST_PASSWORD);
    expect(stillLocked.status).toBe(401);
    expect(stillLocked.body.error.message).toMatch(/Account locked/);

    // ...but the genuine user, coming from a different IP, can still sign in.
    const ok = await login(IP_B, user.email, DEFAULT_TEST_PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
  });

  it('treats unknown emails exactly like real ones, so lockout cannot reveal whether an account exists', async () => {
    const email = 'nobody@test.local';

    for (let i = 0; i < 5; i++) {
      const res = await login(IP_A, email, 'whatever-123');
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid credentials');
    }

    expect(await redis.keys('login-fail:*')).toEqual([`login-fail:${email}:${IP_A}`]);
    expect(await redis.keys('login-lock:*')).toEqual([`login-lock:${email}:${IP_A}`]);

    const locked = await login(IP_A, email, 'whatever-123');
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toMatch(/Account locked/);
  });

  it('returns the same message and status for unknown and existing accounts before and at lockout', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'real@test.local' });

    const unknown = await login(IP_A, 'ghost@test.local', 'wrong-password-1');
    const wrongPassword = await login(IP_A, user.email, 'wrong-password-1');
    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body.error.message).toBe('Invalid credentials');
    expect(wrongPassword.body.error.message).toBe('Invalid credentials');

    for (let i = 0; i < 4; i++) {
      await login(IP_A, 'ghost@test.local', 'wrong-password-1');
      await login(IP_A, user.email, 'wrong-password-1');
    }

    const lockedUnknown = await login(IP_A, 'ghost@test.local', 'wrong-password-1');
    const lockedReal = await login(IP_A, user.email, 'wrong-password-1');
    expect(lockedUnknown.status).toBe(lockedReal.status);
    expect(lockedUnknown.body.error.message).toBe(lockedReal.body.error.message);
    expect(lockedReal.body.error.message).toMatch(/Account locked/);
  });

  it('keys failure counters on email and ip', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'Keyed@Test.local' });
    await login(IP_A, user.email, 'definitely-wrong');

    expect(await redis.keys('login-fail:*')).toEqual([`login-fail:keyed@test.local:${IP_A}`]);
  });
});
