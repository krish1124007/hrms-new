/**
 * Local filesystem storage — replaces S3/MinIO for self-hosted deployments.
 *
 * Files are written under `UPLOAD_DIR` (default `./uploads/`). `saveFile`
 * returns the stored reference `/uploads/<key>`; it is not served as-is — API
 * responses turn it into a short-lived signed /api/v1/files/<key> link.
 */
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR ?? './uploads');

if (!existsSync(UPLOAD_DIR)) {
  // eslint-disable-next-line no-console
  console.log(`[local-storage] creating upload dir: ${UPLOAD_DIR}`);
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Resolve `key` to an absolute path under UPLOAD_DIR, rejecting traversal. */
function safePath(key: string): string {
  const normalised = path.normalize(key).replace(/^[/\\]+/, '');
  const abs = path.resolve(UPLOAD_DIR, normalised);
  // Compare against the root *with* a trailing separator, so a sibling such
  // as `<UPLOAD_DIR>-old/` cannot pass as being inside it.
  if (abs !== UPLOAD_DIR && !abs.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error(`Refusing path traversal: ${key}`);
  }
  return abs;
}

/**
 * Save a buffer to local disk under `key`. Returns the stored reference
 * `/uploads/<key>` (signed on the way out by presignResponse).
 */
export async function saveFile(
  key: string,
  body: Buffer | Uint8Array,
  _contentType?: string,
): Promise<string> {
  const abs = safePath(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
  logger.debug({ key, bytes: body.byteLength }, 'local-storage: saved');
  return `/uploads/${key}`;
}

/** Read a file back as a Buffer. Throws if missing. */
export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(safePath(key));
}

/** Delete a file. No-op if it doesn't exist. */
export async function deleteFile(key: string): Promise<void> {
  try {
    await fs.unlink(safePath(key));
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).code !== 'ENOENT') throw err;
  }
}

/** Resolve a URL/key back to the on-disk path (used by backup-restore). */
export function pathFor(key: string): string {
  return safePath(key);
}

/** The configured upload root. */
export function uploadRoot(): string {
  return UPLOAD_DIR;
}
