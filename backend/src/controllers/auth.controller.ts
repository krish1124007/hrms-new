import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { User } from '../models/user.model.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';
import { Session } from '../models/session.model.js';

import { env } from '../config/env.js';
import { setContext, runWithContext } from '../lib/async-context.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../lib/errors.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { revokeToken, revokeAllUserTokens } from '../lib/token-blacklist.js';
import { withTransaction } from '../lib/transaction.js';
import type { RegisterInput, LoginInput } from '../validators/auth.validators.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function ensureDefaultRoles(): Promise<Map<string, Types.ObjectId>> {
  const bySlug = new Map<string, Types.ObjectId>();
  for (const r of DEFAULT_ROLES) {
    let role = await Role.findOne({ slug: r.slug }).exec();
    if (!role) {
      role = await Role.create({ ...r });
    }
    bySlug.set(role.slug, role._id as Types.ObjectId);
  }
  return bySlug;
}

async function persistSession(
  user: { _id: unknown },
  accessToken: string,
  refreshToken: string,
  req: Request,
): Promise<void> {
  await Session.create({
    userId: user._id,
    accessToken,
    refreshToken,
    device: req.header('user-agent'),
    ip: req.ip,
    userAgent: req.header('user-agent'),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    isActive: true,
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterInput;

  if (env.NODE_ENV === 'production') {
    if (body.acceptTerms !== true || body.acceptPrivacy !== true) {
      throw new AppError(
        'You must accept the Terms of Service and Privacy Policy to continue',
        400,
        'CONSENT_REQUIRED',
      );
    }
  }

  const { validateNewPassword } = await import('../lib/password-security.js');
  const pwCheck = await validateNewPassword(body.password);
  if (!pwCheck.ok) {
    throw new AppError(pwCheck.reason ?? 'Password rejected', 400, 'WEAK_PASSWORD');
  }

  const { user, verificationToken, accessToken, refreshToken } = await withTransaction(
    async (session) => {
      const roles = await ensureDefaultRoles();
      const adminRoleId = roles.get('admin') ?? roles.values().next().value;
      if (!adminRoleId) throw new AppError('Failed to seed roles', 500);

      const existingQuery = User.findOne({ email: body.email.toLowerCase() });
      if (session) existingQuery.session(session);
      const existing = await existingQuery.exec();
      if (existing) throw new ConflictError('Email already registered');

      const verToken = randomBytes(32).toString('hex');
      const [createdUser] = await User.create(
        [
          {
            email: body.email,
            password: body.password,
            firstName: body.firstName,
            lastName: body.lastName,
            role: adminRoleId,
            status: 'active',
            emailVerified: false,
            emailVerificationToken: verToken,
            consents: {
              termsOfService: body.acceptTerms === true,
              privacyPolicy: body.acceptPrivacy === true,
              marketing: body.marketingOptIn ?? false,
              analytics: false,
              recordedAt: new Date(),
              ip: req.ip,
              userAgent: req.header('user-agent'),
              documentVersions: {
                ...(body.termsVersion ? { termsOfService: body.termsVersion } : {}),
                ...(body.privacyVersion ? { privacyPolicy: body.privacyVersion } : {}),
              },
            },
          },
        ],
        { session },
      );

      setContext({ userId: String(createdUser._id) });
      const accessTok = createdUser.generateAccessToken();
      const refreshTok = createdUser.generateRefreshToken();
      await persistSession(createdUser, accessTok, refreshTok, req);

      return {
        user: createdUser,
        verificationToken: verToken,
        accessToken: accessTok,
        refreshToken: refreshTok,
      };
    },
  );

  void sendMail({
    to: user.email,
    subject: 'Welcome — verify your email',
    html: `<p>Hi ${user.firstName},</p><p>Please verify your email by clicking the link below:</p><p><a href="${env.CORS_ORIGIN}/verify-email/${verificationToken}">Verify email</a></p>`,
  });

  void audit({ action: 'create', entity: 'User', entityId: String(user._id) });

  res.status(201).json({
    success: true,
    data: {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken,
      refreshToken,
    },
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const emailLower = body.email.toLowerCase();

  const {
    isAccountLocked,
    trackLoginFailure,
    clearLoginFailures,
    lockAccount,
    getLockTTL,
  } = await import('../middleware/rate-limit.middleware.js');

  if (await isAccountLocked(emailLower)) {
    const ttl = await getLockTTL(emailLower);
    throw new UnauthorizedError(
      `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
    );
  }

  const user = await User.findOne({ email: emailLower })
    .select('+password')
    .populate('role')
    .exec();

  const recordFailure = async (reason: 'not_found' | 'bad_password'): Promise<never> => {
    const failures = await trackLoginFailure(emailLower);
    if (failures >= 5) {
      await lockAccount(emailLower, 15);
      const { loginAttempts } = await import('../lib/metrics.js');
      loginAttempts.labels('locked').inc();
    } else {
      const { loginAttempts } = await import('../lib/metrics.js');
      loginAttempts.labels(reason).inc();
    }
    throw new UnauthorizedError('Invalid credentials');
  };

  if (!user) await recordFailure('not_found');
  const validUser = user!;
  const valid = await validUser.comparePassword(body.password);
  if (!valid) await recordFailure('bad_password');

  if (validUser.status !== 'active') throw new ForbiddenError(`User is ${validUser.status}`);

  await clearLoginFailures(emailLower);
  const { loginAttempts } = await import('../lib/metrics.js');
  loginAttempts.labels('success').inc();

  validUser.lastLogin = new Date();
  await validUser.save();

  const accessToken = validUser.generateAccessToken();
  const refreshToken = validUser.generateRefreshToken();
  await persistSession(validUser, accessToken, refreshToken, req);

  setContext({ userId: String(validUser._id) });
  void audit({ action: 'login', entity: 'User', entityId: String(validUser._id) });

  res.json({
    success: true,
    data: {
      user: {
        _id: validUser._id,
        email: validUser.email,
        firstName: validUser.firstName,
        lastName: validUser.lastName,
        role: validUser.role,
      },
      accessToken,
      refreshToken,
    },
  });
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: oldToken } = req.body as { refreshToken: string };

  let decoded: { sub: string; type?: string };
  try {
    decoded = jwt.verify(oldToken, env.JWT_REFRESH_SECRET) as typeof decoded;
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
  if (decoded.type !== 'refresh') throw new UnauthorizedError('Invalid token type');

  const session = await Session.findOne({ refreshToken: oldToken, isActive: true }).exec();
  if (!session) throw new UnauthorizedError('Session not found or revoked');

  await runWithContext({ userId: decoded.sub }, async () => {
    const user = await User.findById(decoded.sub).exec();
    if (!user) throw new UnauthorizedError('User not found');

    const newAccess = user.generateAccessToken();
    const newRefresh = user.generateRefreshToken();

    session.refreshToken = newRefresh;
    session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await session.save();

    res.json({
      success: true,
      data: { accessToken: newAccess, refreshToken: newRefresh },
    });
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = (req.body ?? {}) as { refreshToken?: string };
  if (token) {
    await Session.updateOne({ refreshToken: token }, { isActive: false }).exec();
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
        jti?: string;
        exp?: number;
      };
      if (decoded.jti && decoded.exp) {
        await revokeToken(decoded.jti, decoded.exp);
      }
    } catch {
      // already expired / malformed
    }
  }
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const accessPayload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as {
        jti?: string;
        exp?: number;
      };
      if (accessPayload.jti && accessPayload.exp) {
        await revokeToken(accessPayload.jti, accessPayload.exp);
      }
    } catch {
      /* noop */
    }
  }
  if (req.user) {
    void audit({ action: 'logout', entity: 'User', entityId: String(req.user._id) });
  }
  res.json({ success: true, message: 'Logged out' });
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const user = await User.findById(req.user._id).exec();
  if (!user) throw new NotFoundError('User not found');

  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();
  await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false }).exec();
  await revokeAllUserTokens(String(user._id), user.sessionVersion);

  void audit({
    action: 'logout',
    entity: 'User',
    entityId: String(user._id),
    metadata: { event: 'logout.all-sessions', sessionVersion: user.sessionVersion },
  });

  res.json({ success: true, message: 'All sessions revoked. Other devices must log in again.' });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };

  const user = await User.findOne({ email: email.toLowerCase() }).exec();
  if (user) {
    const token = randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    void sendMail({
      to: user.email,
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${env.CORS_ORIGIN}/reset-password/${token}">Reset password</a></p>`,
    });
  }
  res.json({ success: true, message: 'If an account exists, a reset email has been sent' });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as { token: string; password: string };

  const { validateNewPassword } = await import('../lib/password-security.js');
  const pwCheck = await validateNewPassword(password);
  if (!pwCheck.ok) {
    throw new AppError(pwCheck.reason ?? 'Password rejected', 400, 'WEAK_PASSWORD');
  }

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  })
    .select('+passwordHistory +password')
    .exec();
  if (!user) throw new UnauthorizedError('Invalid or expired reset token');

  const { checkPasswordHistory } = await import('../lib/password-security.js');
  const history = [...(user.passwordHistory ?? []), user.password].filter(Boolean);
  const { reused, nextHistory } = await checkPasswordHistory(password, history, 5);
  if (reused) {
    throw new AppError(
      'You cannot reuse one of your last 5 passwords',
      400,
      'PASSWORD_REUSED',
    );
  }

  user.passwordHistory = nextHistory;
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = new Date();
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();

  await revokeAllUserTokens(String(user._id), user.sessionVersion);
  await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false }).exec();

  void audit({
    action: 'update',
    entity: 'User',
    entityId: String(user._id),
    metadata: { event: 'password.reset', sessionVersion: user.sessionVersion },
  });

  res.json({
    success: true,
    message: 'Password reset successful. All existing sessions have been revoked.',
  });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const user = await User.findOne({ emailVerificationToken: token }).exec();
  if (!user) throw new NotFoundError('Invalid verification token');

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();

  res.json({ success: true, message: 'Email verified' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  res.json({
    success: true,
    data: { user: req.user },
  });
}
