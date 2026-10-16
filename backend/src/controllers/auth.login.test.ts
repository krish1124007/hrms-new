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

  it('does not track failures for emails that do not exist', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await login(IP_A, 'nobody@test.local', 'whatever-123');
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid credentials');
    }

    expect(await redis.keys('login-fail:*')).toEqual([]);
    expect(await redis.keys('login-lock:*')).toEqual([]);
  });

  it('keys failure counters on email and ip', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'Keyed@Test.local' });
    await login(IP_A, user.email, 'definitely-wrong');

    expect(await redis.keys('login-fail:*')).toEqual([`login-fail:keyed@test.local:${IP_A}`]);
  });
});
