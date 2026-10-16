export interface PasswordCheckResult {
    ok: boolean;
    reason?: string;
    breached?: boolean;
    breachCount?: number;
}
/**
 * Validate the password meets our policy.
 */
export declare function validatePasswordStrength(password: string): PasswordCheckResult;
/**
 * Check the HaveIBeenPwned breach database using k-anonymity.
 *
 * Only the first 5 hex characters of the SHA-1 hash are sent; the
 * response contains all hashes with that prefix so we match locally.
 * Runs with a 3-second timeout — fails open if the service is down.
 */
export declare function checkPasswordBreached(password: string): Promise<{
    breached: boolean;
    count: number;
}>;
/**
 * Full password check — validates strength AND checks the breach database.
 * Call this on signup, password reset, and password change.
 */
export declare function validateNewPassword(password: string): Promise<PasswordCheckResult>;
/**
 * Reject the candidate if it matches any hash in the user's recent history.
 * Returns an updated `history` array (candidate prepended as new hash,
 * capped at `keep` entries) that the caller should persist.
 */
export declare function checkPasswordHistory(candidate: string, history: string[], keep?: number): Promise<{
    reused: boolean;
    nextHistory: string[];
    newHash: string;
}>;
//# sourceMappingURL=password-security.d.ts.map