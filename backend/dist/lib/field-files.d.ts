export type FieldFileKind = 'photo' | 'document';
/** Whose uploads a record may reference. */
export interface FileOwner {
    /** The caller's user id: only their own uploads are accepted. */
    userId: unknown;
    /** Stored references the record being edited already holds — accepted as they are. */
    keep?: Iterable<string | null | undefined>;
}
/** The storage key for a new field upload of `kind` with extension `ext` (e.g. `.jpg`). */
export declare function newFieldFileKey(kind: FieldFileKind, ext: string, year: number, month: number, random: string): string;
/** Remember that `userId` uploaded `key`. */
export declare function recordFieldUpload(key: string, kind: FieldFileKind, userId: unknown): Promise<void>;
/**
 * The stored `/uploads/<key>` reference for a key the client sent (a bare
 * key, or the stored form a signed link was turned into on the way in).
 * 400 `INVALID_FILE_KEY` unless it is an existing field upload of `kind`
 * (`'any'`: photo or document) that `owner.userId` uploaded — or a reference
 * in `owner.keep`.
 */
export declare function fieldFileRef(keyOrRef: string, kind: FieldFileKind | 'any', owner: FileOwner): Promise<string>;
/** `fieldFileRef` for each key, keeping their sequence. */
export declare function fieldFileRefs(keys: readonly string[], kind: FieldFileKind | 'any', owner: FileOwner): Promise<string[]>;
//# sourceMappingURL=field-files.d.ts.map