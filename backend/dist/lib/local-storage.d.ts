/**
 * Save a buffer to local disk under `key`. Returns the public URL the
 * frontend can use to retrieve it (relative to API origin).
 */
export declare function saveFile(key: string, body: Buffer | Uint8Array, _contentType?: string): Promise<string>;
/** Read a file back as a Buffer. Throws if missing. */
export declare function readFile(key: string): Promise<Buffer>;
/** Delete a file. No-op if it doesn't exist. */
export declare function deleteFile(key: string): Promise<void>;
/** Resolve a URL/key back to the on-disk path (used by backup-restore). */
export declare function pathFor(key: string): string;
/** The configured upload root — used by Express static-serve. */
export declare function uploadRoot(): string;
//# sourceMappingURL=local-storage.d.ts.map