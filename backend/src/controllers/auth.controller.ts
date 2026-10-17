import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { User } from '../models/user.model.js';
import { Session } from '../models/session.model.js';

import { env } from '../config/env.js';
import { setContext, runWithContext } from '../lib/async-context.js';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../lib/errors.js';
import { appBaseUrl } from '../lib/app-url.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { revokeToken, revokeAllUserTokens } from '../lib/token-blacklist.js';
import type { AcceptInviteInput, LoginInput } from '../validators/auth.validators.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const emailLower = body.email.toLowerCase();
  const ip = req.ip ?? 'unknown';

  const {
    isAccountLocked,
    trackLoginFailure,
    clearLoginFailures,
    lockAccount,
    getLockTTL,
  } = await import('../middleware/rate-limit.middleware.js');

  if (await isAccountLocked(emailLower, ip)) {
    const ttl = await getLockTTL(emailLower, ip);
    throw new UnauthorizedError(
      `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
    );
  }

  const user = await User.findOne({ email: emailLower })
    .select('+password')
    .populate('role')
    .exec();

  // Failures are tracked and locked per email+ip for unknown emails exactly as
  // for real ones, so neither the message nor the lockout timing reveals whether
  // an account exists. Spamming someone else's address only locks the attacker's
  // own IP; key growth is bounded by the per-IP authRateLimit.
  const recordFailure = async (reason: 'not_found' | 'bad_password'): Promise<never> => {
    const failures = await trackLoginFailure(emailLower, ip);
    const { loginAttempts } = await import('../lib/metrics.js');
    if (failures >= 5) {
      await lockAccount(emailLower, ip, 15);
      loginAttempts.labels('locked').inc();
    } else {
      loginAttempts.labels(reason).inc();
    }
    throw new UnauthorizedError('Invalid credentials');
  };

  if (!user) await recordFailure('not_found');
  const validUser = user!;
  const valid = await validUser.comparePassword(body.password);
  if (!valid) await recordFailure('bad_password');

  if (validUser.status !== 'active') throw new ForbiddenError(`User is ${validUser.status}`);

  await clearLoginFailures(emailLower, ip);
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
      html: `<p>Click the link below to reset your password (valid for 1 hour):</p><p><a href="${appBaseUrl()}/reset-password?token=${token}">Reset password</a></p>`,
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
    .select('+passwordHistory +password +passwordResetToken +passwordResetExpires')
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

/**
 * Activates an invited account: the e-mailed token proves the recipient owns
 * the address, the body supplies the password they chose. Returns the same
 * payload as `login`, so the SPA can drop the user straight into the app.
 */
export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body as AcceptInviteInput;

  const invalid = (): AppError =>
    new AppError('Invitation link is invalid or has already been used', 400, 'INVALID_INVITE');

  // Only an account still waiting for activation can be claimed this way: a
  // leftover verification token on an active user must never reset a password.
  const user = await User.findOne({ emailVerificationToken: token, status: 'invited' })
    .select('+emailVerificationToken +password')
    .exec();
  if (!user) throw invalid();

  const { validateNewPassword } = await import('../lib/password-security.js');
  const pwCheck = await validateNewPassword(password);
  if (!pwCheck.ok) {
    throw new AppError(pwCheck.reason ?? 'Password rejected', 400, 'WEAK_PASSWORD');
  }

  user.password = password;
  user.status = 'active';
  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.passwordChangedAt = new Date();
  user.lastLogin = new Date();
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  await persistSession(user, accessToken, refreshToken, req);

  setContext({ userId: String(user._id) });
  void audit({
    action: 'update',
    entity: 'User',
    entityId: String(user._id),
    metadata: { event: 'invite.accepted', sessionVersion: user.sessionVersion },
  });

  await user.populate('role');
  res.json({
    success: true,
    data: {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    },
  });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  const user = await User.findOne({ emailVerificationToken: token })
    .select('+emailVerificationToken')
    .exec();
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

/**
 * Update the currently logged-in user's own profile (name + avatar).
 * Email and role are intentionally not editable here — those go through
 * admin-only endpoints.
 */
export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const body = req.body as { firstName?: string; lastName?: string; avatar?: string };
  const update: Record<string, unknown> = {};
  if (body.firstName !== undefined) update.firstName = body.firstName;
  if (body.lastName !== undefined) update.lastName = body.lastName;
  if (body.avatar !== undefined) update.avatar = body.avatar;

  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
    .populate('role')
    .exec();
  if (!user) throw new NotFoundError('User not found');

  void audit({ action: 'update', entity: 'User', entityId: String(user._id), after: update });
  res.json({ success: true, data: { user } });
}

/**
 * Self-service password change. Requires the current password as a sanity
 * check before swapping in the new one — same pattern as `resetPassword` but
 * without the email-token round-trip.
 */
export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };

  const { validateNewPassword } = await import('../lib/password-security.js');
  const pwCheck = await validateNewPassword(newPassword);
  if (!pwCheck.ok) {
    throw new AppError(pwCheck.reason ?? 'Password rejected', 400, 'WEAK_PASSWORD');
  }

  const user = await User.findById(req.user._id)
    .select('+password +passwordHistory')
    .exec();
  if (!user) throw new NotFoundError('User not found');

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const { checkPasswordHistory } = await import('../lib/password-security.js');
  const history = [...(user.passwordHistory ?? []), user.password].filter(Boolean);
  const { reused, nextHistory } = await checkPasswordHistory(newPassword, history, 5);
  if (reused) {
    throw new AppError('You cannot reuse one of your last 5 passwords', 400, 'PASSWORD_REUSED');
  }

  user.passwordHistory = nextHistory;
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();

  await revokeAllUserTokens(String(user._id), user.sessionVersion);
  await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false }).exec();

  void audit({
    action: 'update',
    entity: 'User',
    entityId: String(user._id),
    metadata: { event: 'password.self-change', sessionVersion: user.sessionVersion },
  });

  res.json({
    success: true,
    message: 'Password changed. Please sign in again on this device.',
  });
}
