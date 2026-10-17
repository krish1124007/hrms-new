/**
 * Absolute, signed download URL for a storage key or a stored `/uploads/<key>`
 * reference, valid for `ttlSeconds`.
 */
export declare function signFileUrl(keyOrUrl: string, ttlSeconds?: number): string;
/** Constant-time check of a link's signature; false once `exp` has passed. */
export declare function verifyFileSignature(key: string, exp: string, sig: string): boolean;
/**
 * The stored `/uploads/<key>` form of a signed link this server issued, or
 * null for anything else. Expiry is ignored: a client that held a form open
 * past the TTL is still posting back a reference it was legitimately given.
 */
export declare function storedFormOfSignedUrl(value: string): string | null;
//# sourceMappingURL=file-urls.d.ts.map