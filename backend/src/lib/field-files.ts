/**
 * Files attached to field records (site photos, selfies, report photos and
 * documents) are uploaded first (POST /field/uploads/photo | /document →
 * `{ url, key }`) and then referenced by `key` in the record's body.
 *
 * A key is only accepted when it names a field upload that exists — never an
 * arbitrary storage key: the stored `/uploads/<key>` reference is signed into
 * a download link on every response, so accepting any key would hand out any
 * file (payslips, documents) to whoever names it — and only when the caller
 * uploaded it themselves (`fielduploads` records the uploader), so nobody can
 * attach a colleague's photo. A reference the record being edited already
 * holds is accepted as it is (`owner.keep`). A selfie can serve one check-in
 * only — the unique `selfie_single_use` index on visits enforces it in the
 * visit write itself. There is no time window: offline photos are uploaded
 * long after they were taken.
 *
 * Keys uploaded before uploads had an owner have no `fielduploads` record:
 * the records holding them still read them, but they cannot be attached anew.
 */
import { access } from 'node:fs/promises';
import { Types } from 'mongoose';
import { pathFor } from './local-storage.js';
import { AppError } from './errors.js';
import { FieldUpload } from '../models/field-upload.model.js';

export type FieldFileKind = 'photo' | 'document';

/** Whose uploads a record may reference. */
export interface FileOwner {
  /** The caller's user id: only their own uploads are accepted. */
  userId: unknown;
  /** Stored references the record being edited already holds — accepted as they are. */
  keep?: Iterable<string | null | undefined>;
}

const FOLDER: Record<FieldFileKind, string> = {
  photo: 'field-photos',
  document: 'field-documents',
};

/** `field-<photos|documents>/YYYY/MM/<ms>-<12 hex><.ext>` — what the upload endpoints issue. */
const KEY_RE = /^field-(photos|documents)\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}\.[a-z0-9]{2,5}$/;

function invalidKey(): AppError {
  return new AppError('The file key is not a field upload — upload the file first', 400, 'INVALID_FILE_KEY');
}

function notYours(): AppError {
  return new AppError('This file was not uploaded by you — upload it first', 400, 'INVALID_FILE_KEY');
}

/** The storage key for a new field upload of `kind` with extension `ext` (e.g. `.jpg`). */
export function newFieldFileKey(kind: FieldFileKind, ext: string, year: number, month: number, random: string): string {
  return `${FOLDER[kind]}/${year}/${String(month).padStart(2, '0')}/${Date.now()}-${random}${ext}`;
}

const userObjectId = (userId: unknown): Types.ObjectId | null =>
  userId && Types.ObjectId.isValid(String(userId)) ? new Types.ObjectId(String(userId)) : null;

/** Remember that `userId` uploaded `key`. */
export async function recordFieldUpload(key: string, kind: FieldFileKind, userId: unknown): Promise<void> {
  const uploader = userObjectId(userId);
  if (!uploader) throw new AppError('Sign in to upload files', 401, 'UNAUTHORIZED');
  await FieldUpload.create({ key, kind, uploadedBy: uploader });
}

const bareKey = (keyOrRef: string): string => keyOrRef.trim().replace(/^\/uploads\//, '');

/** The key of `keyOrRef` after the format and kind checks (400 `INVALID_FILE_KEY`). */
function checkedKey(keyOrRef: string, kind: FieldFileKind | 'any'): string {
  const key = bareKey(keyOrRef);
  const match = KEY_RE.exec(key);
  if (!match) throw invalidKey();
  if (kind !== 'any' && `field-${match[1]}` !== FOLDER[kind]) throw invalidKey();
  return key;
}

function keptRefs(owner: FileOwner): Set<string> {
  const refs = new Set<string>();
  for (const ref of owner.keep ?? []) if (typeof ref === 'string' && ref) refs.add(`/uploads/${bareKey(ref)}`);
  return refs;
}

async function assertOnDisk(key: string): Promise<void> {
  try {
    await access(pathFor(key));
  } catch {
    throw invalidKey();
  }
}

/**
 * The stored `/uploads/<key>` reference for a key the client sent (a bare
 * key, or the stored form a signed link was turned into on the way in).
 * 400 `INVALID_FILE_KEY` unless it is an existing field upload of `kind`
 * (`'any'`: photo or document) that `owner.userId` uploaded — or a reference
 * in `owner.keep`.
 */
export async function fieldFileRef(keyOrRef: string, kind: FieldFileKind | 'any', owner: FileOwner): Promise<string> {
  const key = checkedKey(keyOrRef, kind);
  const ref = `/uploads/${key}`;
  if (keptRefs(owner).has(ref)) return ref;
  const uploader = userObjectId(owner.userId);
  if (!uploader) throw notYours();
  const mine = await FieldUpload.exists({ key, uploadedBy: uploader }).exec();
  if (!mine) throw (await FieldUpload.exists({ key }).exec()) ? notYours() : invalidKey();
  await assertOnDisk(key);
  return ref;
}

/** `fieldFileRef` for each key, keeping their sequence. */
export async function fieldFileRefs(keys: readonly string[], kind: FieldFileKind | 'any', owner: FileOwner): Promise<string[]> {
  return Promise.all(keys.map((k) => fieldFileRef(k, kind, owner)));
}
