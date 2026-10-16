/** Add a JWT's `jti` to the blacklist until its original `exp`. */
export declare function revokeToken(jti: string, expSeconds: number): Promise<void>;
/** Fast existence check: true = revoked, false = still valid (or Redis down). */
export declare function isTokenRevoked(jti: string): Promise<boolean>;
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
export declare function revokeAllUserTokens(userId: string, newSessionVersion: number): Promise<void>;
/** Read cached sessionVersion (avoid DB round-trip on every request). */
export declare function getCachedSessionVersion(userId: string): Promise<number | null>;
//# sourceMappingURL=token-blacklist.d.ts.map