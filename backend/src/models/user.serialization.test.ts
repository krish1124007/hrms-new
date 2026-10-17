import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../app.js';
import { User } from './user.model.js';
import { sendMail } from '../services/email.service.js';
import { createUser, createRole, DEFAULT_TEST_PASSWORD } from '../test/factories.js';

vi.mock('../services/email.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.service.js')>()),
  sendMail: vi.fn(async () => true),
}));

const SECRET_FIELDS = [
  'password',
  'passwordHistory',
  'refreshTokens',
  'emailVerificationToken',
  'passwordResetToken',
  'passwordResetExpires',
] as const;

const RESET_TOKEN = 'reset-token-0123456789abcdef0123456789abcdef';
const VERIFY_TOKEN = 'verify-token-0123456789abcdef0123456789abcd';

/** Every object key found anywhere in `value` (depth-first). */
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => allKeys(item, into));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      allKeys(child, into);
    }
  }
  return into;
}

function expectNoSecrets(body: unknown): void {
  const keys = allKeys(body);
  for (const field of SECRET_FIELDS) {
    expect(keys.has(field), `response leaked "${field}"`).toBe(false);
  }
  const text = JSON.stringify(body);
  expect(text).not.toContain(RESET_TOKEN);
  expect(text).not.toContain(VERIFY_TOKEN);
}

/** The reset token the app e-mailed, read back out of the mocked mailer. */
function emailedResetToken(): string {
  const calls = vi.mocked(sendMail).mock.calls;
  const html = calls[calls.length - 1]?.[0].html ?? '';
  const match = /reset-password\/([a-f0-9]+)/.exec(html);
  if (!match) throw new Error('no reset link in the captured e-mail');
  return match[1] as string;
}

describe('user serialization hides credentials and tokens', () => {
  beforeEach(() => {
    // resetPassword checks the HIBP breach list over the network (fails open).
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seedTokens() {
    const { token } = await createUser({ roleSlug: 'admin' });
    const { user: target } = await createUser({ roleSlug: 'employee' });
    await User.updateOne(
      { _id: target._id },
      {
        $set: {
          passwordResetToken: RESET_TOKEN,
          passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
          emailVerificationToken: VERIFY_TOKEN,
          passwordHistory: ['$2a$12$historyhashhistoryhashhistoryhashhistoryhashhistoryhash'],
          refreshTokens: [
            { token: 'refresh-token-value', expiresAt: new Date(Date.now() + 86_400_000) },
          ],
        },
      },
    );
    return { adminToken: token, target };
  }

  it('GET /users/:id omits every secret field', async () => {
    const { adminToken, target } = await seedTokens();

    // Sanity: the secrets really are stored — they are just never selected.
    const raw = await User.findById(target._id)
      .select('+passwordResetToken +passwordResetExpires +emailVerificationToken')
      .exec();
    expect(raw?.passwordResetToken).toBe(RESET_TOKEN);

    const res = await request(createApp())
      .get(`/api/v1/users/${String(target._id)}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(target.email);
    expectNoSecrets(res.body);
  });

  it('GET /users (list) omits every secret field', async () => {
    const { adminToken } = await seedTokens();

    const res = await request(createApp())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expectNoSecrets(res.body);
  });

  it('GET /auth/me omits every secret field', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetToken: RESET_TOKEN,
          passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
          emailVerificationToken: VERIFY_TOKEN,
        },
      },
    );

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${user.generateAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
    expectNoSecrets(res.body);
  });

  it('POST /users (invite) does not echo the verification token back to the inviter', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const role = await createRole('employee');

    const res = await request(createApp())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'invitee@test.local',
        firstName: 'In',
        lastName: 'Vitee',
        roleId: String(role._id),
      });

    expect(res.status).toBe(201);
    expectNoSecrets(res.body);

    // The token does exist, and it went to the invitee by e-mail only.
    const stored = await User.findOne({ email: 'invitee@test.local' })
      .select('+emailVerificationToken')
      .exec();
    expect(stored?.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is not selected by default and not present in toJSON / toObject output', async () => {
    const { target } = await seedTokens();

    const plain = await User.findById(target._id).exec();
    expect(plain?.passwordResetToken).toBeUndefined();
    expect(plain?.passwordResetExpires).toBeUndefined();
    expect(plain?.emailVerificationToken).toBeUndefined();

    const full = await User.findById(target._id)
      .select(
        '+password +passwordHistory +refreshTokens +passwordResetToken +passwordResetExpires +emailVerificationToken',
      )
      .exec();
    // Everything is loaded on the document itself...
    expect(full?.password).toBeTruthy();
    expect(full?.passwordResetToken).toBe(RESET_TOKEN);
    expect(full?.refreshTokens).toHaveLength(1);

    // ...but none of it survives serialization.
    const json = JSON.parse(JSON.stringify(full)) as Record<string, unknown>;
    const obj = full?.toObject() as Record<string, unknown>;
    for (const field of SECRET_FIELDS) {
      expect(json, `toJSON leaked ${field}`).not.toHaveProperty(field);
      expect(obj, `toObject leaked ${field}`).not.toHaveProperty(field);
    }
    expect(json.email).toBe(target.email);
  });

  it('keeps the password-reset flow working end to end', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const app = createApp();

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    expect(forgot.status).toBe(200);
    const token = emailedResetToken();

    const newPassword = 'Brand-New#Passw0rd-2026';
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();

    // The old password no longer works...
    const old = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_TEST_PASSWORD });
    expect(old.status).toBe(401);

    // ...and the token was consumed: it is gone from the record and cannot be replayed.
    const stored = await User.findById(user._id)
      .select('+passwordResetToken +passwordResetExpires')
      .exec();
    expect(stored?.passwordResetToken).toBeUndefined();
    expect(stored?.passwordResetExpires).toBeUndefined();

    const replay = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Another-New#Passw0rd-2027' });
    expect(replay.status).toBe(401);
  });

  it('keeps email verification working and consumes the token', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerified: false, emailVerificationToken: VERIFY_TOKEN } },
    );
    const app = createApp();

    const ok = await request(app).get(`/api/v1/auth/verify-email/${VERIFY_TOKEN}`);
    expect(ok.status).toBe(200);

    const stored = await User.findById(user._id).select('+emailVerificationToken').exec();
    expect(stored?.emailVerified).toBe(true);
    expect(stored?.emailVerificationToken).toBeUndefined();

    const replay = await request(app).get(`/api/v1/auth/verify-email/${VERIFY_TOKEN}`);
    expect(replay.status).toBe(404);
  });
});
