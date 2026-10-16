/**
 * Encrypt a UTF-8 string using AES-256-GCM. Returns a base64-encoded payload
 * of the form: iv | authTag | ciphertext.
 */
export declare function encryptString(plain: string): string;
/**
 * Decrypt a payload produced by `encryptString`.
 */
export declare function decryptString(payload: string): string;
/**
 * Mask a key for display: shows last 4 chars only.
 */
export declare function maskKey(key: string): string;
//# sourceMappingURL=crypto.d.ts.map