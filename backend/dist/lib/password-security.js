import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
/**
 * Password security utilities.
 *
 * - Checks passwords against the HaveIBeenPwned breach database using
 *   the k-anonymity API (only the first 5 chars of the SHA-1 hash are sent,
 *   so the password itself never leaves our server).
 * - Enforces minimum strength requirements.
 */
const MIN_LENGTH = 8;
const COMMON_PASSWORDS = new Set([
    'password', 'password123', '12345678', 'qwerty123', 'letmein',
    'welcome123', 'admin123', 'iloveyou', 'monkey123', 'sunshine',
    'passw0rd', 'master123', 'football', '111111111', '00000000',
]);
/**
 * Validate the password meets our policy.
 */
export function validatePasswordStrength(password) {
    if (!password || password.length < MIN_LENGTH) {
        return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return { ok: false, reason: 'Password is too common — please choose something unique' };
    }
    // Require a mix of character types
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (!hasLetter || !hasDigit) {
        return { ok: false, reason: 'Password must contain both letters and numbers' };
    }
    return { ok: true };
}
/**
 * Check the HaveIBeenPwned breach database using k-anonymity.
 *
 * Only the first 5 hex characters of the SHA-1 hash are sent; the
 * response contains all hashes with that prefix so we match locally.
 * Runs with a 3-second timeout — fails open if the service is down.
 */
export async function checkPasswordBreached(password) {
    try {
        const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = sha1.slice(0, 5);
        const suffix = sha1.slice(5);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            signal: controller.signal,
            headers: { 'Add-Padding': 'true' },
        });
        clearTimeout(timeout);
        if (!res.ok)
            return { breached: false, count: 0 };
        const text = await res.text();
        for (const line of text.split('\n')) {
            const [hashSuffix, countStr] = line.split(':');
            if (hashSuffix?.trim() === suffix) {
                return { breached: true, count: parseInt(countStr ?? '0', 10) };
            }
        }
        return { breached: false, count: 0 };
    }
    catch {
        // Network error / timeout → fail open (don't block signup on outage)
        return { breached: false, count: 0 };
    }
}
/**
 * Full password check — validates strength AND checks the breach database.
 * Call this on signup, password reset, and password change.
 */
export async function validateNewPassword(password) {
    const strength = validatePasswordStrength(password);
    if (!strength.ok)
        return strength;
    const breach = await checkPasswordBreached(password);
    if (breach.breached && breach.count > 100) {
        return {
            ok: false,
            breached: true,
            breachCount: breach.count,
            reason: `This password has appeared in ${breach.count.toLocaleString()} data breaches. Please choose a different password.`,
        };
    }
    return { ok: true };
}
/**
 * Reject the candidate if it matches any hash in the user's recent history.
 * Returns an updated `history` array (candidate prepended as new hash,
 * capped at `keep` entries) that the caller should persist.
 */
export async function checkPasswordHistory(candidate, history, keep = 5) {
    for (const oldHash of history) {
        // eslint-disable-next-line no-await-in-loop
        const match = await bcrypt.compare(candidate, oldHash);
        if (match) {
            return { reused: true, nextHistory: history, newHash: '' };
        }
    }
    const newHash = await bcrypt.hash(candidate, 12);
    const nextHistory = [newHash, ...history].slice(0, keep);
    return { reused: false, nextHistory, newHash };
}
//# sourceMappingURL=password-security.js.map