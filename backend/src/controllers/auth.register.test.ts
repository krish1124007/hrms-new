import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/user.model.js';

describe('public registration', () => {
  it('POST /auth/register no longer exists', async () => {
    const res = await request(createApp()).post('/api/v1/auth/register').send({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      password: 'Str0ng!Passw0rd',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(res.status).toBe(404);
    expect(await User.countDocuments()).toBe(0);
  });
});
