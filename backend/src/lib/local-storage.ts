/**
 * Local filesystem storage — replaces S3/MinIO for self-hosted deployments.
 *
 * Files are written under `UPLOAD_DIR` (default `./uploads/`) and served by
 * Express at `/uploads/<key>`. Returns the publicly-reachable URL the client
 * can fetch.
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
  if (!abs.startsWith(UPLOAD_DIR)) {
    throw new Error(`Refusing path traversal: ${key}`);
  }
  return abs;
}

/**
 * Save a buffer to local disk under `key`. Returns the public URL the
 * frontend can use to retrieve it (relative to API origin).
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

/** The configured upload root — used by Express static-serve. */
export function uploadRoot(): string {
  return UPLOAD_DIR;
}
