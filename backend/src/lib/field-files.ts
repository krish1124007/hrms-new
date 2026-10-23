/**
 * Files attached to field records (site photos, selfies, report photos and
 * documents) are uploaded first (POST /field/uploads/photo | /document →
 * `{ url, key }`) and then referenced by `key` in the record's body.
 *
 * A key is only accepted when it names a field upload that exists — never an
 * arbitrary storage key: the stored `/uploads/<key>` reference is signed into
 * a download link on every response, so accepting any key would hand out any
 * file (payslips, documents) to whoever names it.
 */
import { access } from 'node:fs/promises';
import { pathFor } from './local-storage.js';
import { AppError } from './errors.js';

export type FieldFileKind = 'photo' | 'document';

const FOLDER: Record<FieldFileKind, string> = {
  photo: 'field-photos',
  document: 'field-documents',
};

/** `field-<photos|documents>/YYYY/MM/<ms>-<12 hex><.ext>` — what the upload endpoints issue. */
const KEY_RE = /^field-(photos|documents)\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}\.[a-z0-9]{2,5}$/;

function invalidKey(): AppError {
  return new AppError('The file key is not a field upload — upload the file first', 400, 'INVALID_FILE_KEY');
}

/** The storage key for a new field upload of `kind` with extension `ext` (e.g. `.jpg`). */
export function newFieldFileKey(kind: FieldFileKind, ext: string, year: number, month: number, random: string): string {
  return `${FOLDER[kind]}/${year}/${String(month).padStart(2, '0')}/${Date.now()}-${random}${ext}`;
}

/**
 * The stored `/uploads/<key>` reference for a key the client sent (a bare
 * key, or the stored form a signed link was turned into on the way in).
 * 400 `INVALID_FILE_KEY` unless it is an existing field upload of `kind`
 * (`'any'`: photo or document).
 */
export async function fieldFileRef(keyOrRef: string, kind: FieldFileKind | 'any' = 'any'): Promise<string> {
  const key = keyOrRef.trim().replace(/^\/uploads\//, '');
  const match = KEY_RE.exec(key);
  if (!match) throw invalidKey();
  if (kind !== 'any' && `field-${match[1]}` !== FOLDER[kind]) throw invalidKey();
  try {
    await access(pathFor(key));
  } catch {
    throw invalidKey();
  }
  return `/uploads/${key}`;
}

/** `fieldFileRef` for each key, keeping their sequence. */
export async function fieldFileRefs(keys: readonly string[], kind: FieldFileKind | 'any' = 'any'): Promise<string[]> {
  return Promise.all(keys.map((k) => fieldFileRef(k, kind)));
}
