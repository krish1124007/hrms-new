/**
 * Invite -> activation and password-reset links.
 *
 * Invited users used to receive /accept-invite/<token>, a link that matched no
 * page and no endpoint, and login refuses `status: 'invited'`, so they could
 * never activate. Reset mails pointed at /reset-password/<token> while the SPA
 * reads ?token=. These tests read the link back out of the mocked mailer, the
 * way a real recipient would, and follow it.
 */
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/user.model.js';
import { sendMail } from '../services/email.service.js';
import { createRole, createUser } from '../test/factories.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const STRONG = 'Strong#Passw0rd!';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The href of the link in the most recently captured e-mail. */
function lastMailedLink(): string {
  const calls = vi.mocked(sendMail).mock.calls;
  const html = calls[calls.length - 1]?.[0].html ?? '';
  const match = /href="([^"]+)"/.exec(html);
  if (!match) throw new Error('no link in the captured e-mail');
  return match[1] as string;
}

/** Admin invites a new employee; returns the invited address and the e-mailed token. */
async function inviteEmployee(email = 'newhire@test.local'): Promise<{ email: string; token: string }> {
  const { token: adminToken } = await createUser({ roleSlug: 'admin' });
  const role = await createRole('employee');
  const res = await request(createApp())
    .post('/api/v1/users')
    .set(auth(adminToken))
    .send({ email, firstName: 'New', lastName: 'Hire', roleId: String(role._id) });
  expect(res.status).toBe(201);

  const link = lastMailedLink();
  expect(link).toContain('/accept-invite?token=');
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('invite link carries no token');
  return { email, token };
}

describe('accept-invite', () => {
  beforeEach(() => {
    // validateNewPassword checks the HIBP breach list over the network (fails open).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });

  it('mails an /accept-invite?token= link on the configured public origin', async () => {
    await inviteEmployee();
    const link = lastMailedLink();
    expect(link).toMatch(/^http:\/\/localhost:5173\/accept-invite\?token=[a-f0-9]{64}$/);
  });

  it('activates the invited user, signs them in, and lets them log in afterwards', async () => {
    const { email, token } = await inviteEmployee();
    const app = createApp();

    // Until accepted the account is only invited, and the password the user is
    // about to choose is not yet valid for anything.
    expect((await User.findOne({ email }))?.status).toBe('invited');
    const before = await request(app).post('/api/v1/auth/login').send({ email, password: STRONG });
    expect(before.status).toBe(401);

    const res = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: STRONG });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toMatch(/password|emailVerificationToken/i);

    // The returned access token works.
    const me = await request(app).get('/api/v1/auth/me').set(auth(res.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);

    const stored = await User.findOne({ email }).select('+emailVerificationToken').lean();
    expect(stored?.status).toBe('active');
    expect(stored?.emailVerified).toBe(true);
    expect(stored?.emailVerificationToken).toBeUndefined();
    expect(stored?.sessionVersion).toBe(1);

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: STRONG });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toEqual(expect.any(String));
  });

  it('keeps an invited account out even when its password is known (login gates on status)', async () => {
    const { email } = await inviteEmployee();
    // Give the still-invited account a password we know, so the only thing
    // left to stop the login is the status check itself.
    const invited = await User.findOne({ email }).select('+password').orFail();
    invited.password = STRONG;
    await invited.save();
    expect(invited.status).toBe('invited');

    const login = await request(createApp()).post('/api/v1/auth/login').send({ email, password: STRONG });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toMatch(/invited/);
  });

  it('rejects a token that has already been used', async () => {
    const { token } = await inviteEmployee();
    const app = createApp();

    const first = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: STRONG });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: 'Another#Passw0rd2' });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_INVITE');
    expect(replay.body.error.message).toBe('Invitation link is invalid or has already been used');
  });

  it('no longer exposes GET /auth/verify-email, so an invite token cannot be consumed without activating', async () => {
    const { email, token } = await inviteEmployee();

    const res = await request(createApp()).get(`/api/v1/auth/verify-email/${token}`);
    expect(res.status).toBe(404);

    const stored = await User.findOne({ email }).select('+emailVerificationToken').lean();
    expect(stored?.status).toBe('invited');
    expect(stored?.emailVerificationToken).toBe(token);
  });

  it('rejects an unknown token', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/accept-invite')
      .send({ token: 'f'.repeat(64), password: STRONG });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
  });

  it('does not let an active user take over their account with a leftover verification token', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'active@test.local' });
    await User.updateOne({ _id: user._id }, { $set: { emailVerificationToken: 'leftover-token-0123456789' } });

    const res = await request(createApp())
      .post('/api/v1/auth/accept-invite')
      .send({ token: 'leftover-token-0123456789', password: STRONG });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INVITE');
  });

  it('refuses a weak password and leaves the invitation usable', async () => {
    const { email, token } = await inviteEmployee();
    const app = createApp();

    const weak = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token, password: 'password123' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');
    expect((await User.findOne({ email }))?.status).toBe('invited');

    const ok = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: STRONG });
    expect(ok.status).toBe(200);
  });

  it('validates the request body', async () => {
    const res = await request(createApp()).post('/api/v1/auth/accept-invite').send({ token: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('employee onboarding invite', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });

  it('mails an /accept-invite?token= link when HR creates an employee login without a password', async () => {
    const { token: adminToken } = await createUser({ roleSlug: 'admin' });
    await createRole('employee');
    const app = createApp();

    const created = await request(app)
      .post('/api/v1/employees')
      .set(auth(adminToken))
      .send({
        firstName: 'Onboard',
        lastName: 'Me',
        email: 'onboard@test.local',
        joiningDate: '2026-01-05',
        createUserAccount: true,
      });
    expect(created.status).toBe(201);

    const link = lastMailedLink();
    expect(link).toMatch(/^http:\/\/localhost:5173\/accept-invite\?token=[a-f0-9]{64}$/);
    const token = new URL(link).searchParams.get('token');

    const res = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: STRONG });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('onboard@test.local');
  });
});

describe('forgot-password link', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });

  it('mails a /reset-password?token= link that the reset endpoint accepts', async () => {
    const { user } = await createUser({ roleSlug: 'employee', email: 'forgot@test.local' });
    const app = createApp();

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(res.status).toBe(200);

    const link = lastMailedLink();
    expect(link).toMatch(/^http:\/\/localhost:5173\/reset-password\?token=[a-f0-9]{64}$/);
    const token = new URL(link).searchParams.get('token');

    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: STRONG });
    expect(reset.status).toBe(200);
  });
});
