import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * JWT revocation list — Redis-backed, TTL-aware.
 *
 * Why two mechanisms?
 *   - `jti` blacklist: per-token revocation (e.g. single logout).
 *     Only the specific token is invalidated.
 *   - `sessionVersion` (`sv` claim on JWT): bulk revoke ALL tokens for a
 *     user (password change, "log out everywhere", admin forced logout).
 *     Auth middleware compares `token.sv` against `user.sessionVersion`;
 *     mismatch → reject.
 *
 * Both fail OPEN by design: if Redis is down, we don't lock users out.
 * The sessionVersion check in Mongo still works as a backstop.
 */

const PREFIX = 'jwt:revoked:';

/** Add a JWT's `jti` to the blacklist until its original `exp`. */
export async function revokeToken(jti: string, expSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(1, expSeconds - now);
  try {
    await redis.set(`${PREFIX}${jti}`, '1', 'EX', ttl);
  } catch (err) {
    logger.warn({ err, jti }, 'Failed to write to token blacklist — fail open');
  }
}

/** Fast existence check: true = revoked, false = still valid (or Redis down). */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const hit = await redis.get(`${PREFIX}${jti}`);
    return hit === '1';
  } catch (err) {
    logger.warn({ err, jti }, 'Blacklist check failed — fail open');
    return false;
  }
}

/**
 * Bulk-revoke all tokens for a user by bumping their sessionVersion.
 * Also writes a marker key so middleware can check without a DB hit.
 *
 * Call this from:
 *   - Password change / reset
 *   - "Log out everywhere"
 *   - Admin suspending a user
 *   - Detected compromise
 */
export async function revokeAllUserTokens(
  userId: string,
  newSessionVersion: number,
): Promise<void> {
  try {
    // 7-day TTL — long enough to cover a refresh token's lifespan
    await redis.set(`jwt:sv:${userId}`, String(newSessionVersion), 'EX', 7 * 24 * 3600);
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to mark sessionVersion — fail open');
  }
}

/** Read cached sessionVersion (avoid DB round-trip on every request). */
export async function getCachedSessionVersion(userId: string): Promise<number | null> {
  try {
    const val = await redis.get(`jwt:sv:${userId}`);
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}
