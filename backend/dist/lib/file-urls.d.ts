/**
 * Absolute, signed download URL for a storage key or a stored `/uploads/<key>`
 * reference, valid for `ttlSeconds`.
 */
export declare function signFileUrl(keyOrUrl: string, ttlSeconds?: number): string;
/** Constant-time check of a link's signature; false once `exp` has passed. */
export declare function verifyFileSignature(key: string, exp: string, sig: string): boolean;
/**
 * The stored `/uploads/<key>` form of a signed link this server issued, or
 * null for anything else. A link up to an hour past its expiry still converts
 * (a client that held a form open past the TTL is posting back a reference it
 * was legitimately given); an older one does not.
 */
export declare function storedFormOfSignedUrl(value: string): string | null;
/** True for an authentic signed link that is past the post-back grace period. */
export declare function isStaleSignedUrl(value: string): boolean;
//# sourceMappingURL=file-urls.d.ts.map