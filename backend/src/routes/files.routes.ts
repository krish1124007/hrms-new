/**
 * GET /api/v1/files/<key>?exp=<unix>&sig=<hex> — streams a file from
 * UPLOAD_DIR to whoever holds a valid signed link (see lib/file-urls.ts).
 * Deliberately outside authMiddleware: the signature is the authorisation, so
 * links work in <a href>, <img src> and new tabs.
 */
import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import mime from 'mime-types';
import { logger } from '../config/logger.js';
import { asyncHandler } from '../lib/async-handler.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { verifyFileSignature } from '../lib/file-urls.js';
import { pathFor } from '../lib/local-storage.js';

const router = Router();

/** Types a browser may render in place; everything else is forced to download. */
const INLINE_TYPES = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/;

function invalidSignature(): AppError {
  return new AppError('File link is invalid or has expired', 401, 'INVALID_FILE_SIGNATURE');
}

/** RFC 6266 disposition: ASCII-safe `filename` plus a UTF-8 `filename*`. */
function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function serveFile(req: Request, res: Response): Promise<void> {
  let key: string;
  try {
    key = decodeURIComponent(req.path).replace(/^\/+/, '');
  } catch {
    throw invalidSignature(); // malformed escapes: no link we issued looks like this
  }
  const { exp, sig } = req.query;
  if (typeof exp !== 'string' || typeof sig !== 'string' || !verifyFileSignature(key, exp, sig)) {
    throw invalidSignature();
  }

  let abs: string;
  try {
    abs = pathFor(key); // throws when the key escapes UPLOAD_DIR
  } catch {
    throw new NotFoundError('File not found');
  }
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat?.isFile()) throw new NotFoundError('File not found');

  const stream = fs.createReadStream(abs);
  try {
    await once(stream, 'open');
  } catch (err) {
    throw (err as NodeJS.ErrnoException).code === 'ENOENT' ? new NotFoundError('File not found') : err;
  }

  const contentType = mime.lookup(key) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    contentDisposition(INLINE_TYPES.test(contentType) ? 'inline' : 'attachment', path.basename(key)),
  );
  res.setHeader('Cache-Control', 'private, no-store');

  // Once piping starts the status and headers are on their way: a late read
  // error can only cut the response short, not become an error envelope.
  stream.on('error', (err) => {
    logger.warn({ err, key }, 'files: read failed mid-stream');
    res.destroy(err);
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

router.get('/*key', asyncHandler(serveFile));

export default router;
