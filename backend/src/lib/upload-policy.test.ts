import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { uploadFileFilter } from './upload-policy.js';

/** Runs the multer filter and reports whether the file was accepted. */
function accepts(originalname: string, mimetype: string): boolean {
  const cb = vi.fn();
  uploadFileFilter({} as Request, { originalname, mimetype } as Express.Multer.File, cb);
  const [err, ok] = cb.mock.calls[0] ?? [];
  return !err && ok === true;
}

describe('uploadFileFilter', () => {
  it('accepts the photo formats phones send (HEIC/HEIF) alongside the usual ones', () => {
    expect(accepts('IMG_0001.HEIC', 'image/heic')).toBe(true);
    expect(accepts('IMG_0002.heif', 'image/heif')).toBe(true);
    expect(accepts('receipt.jpg', 'image/jpeg')).toBe(true);
    expect(accepts('payslip.pdf', 'application/pdf')).toBe(true);
  });

  it('still refuses executable or markup content and mismatched types', () => {
    expect(accepts('evil.html', 'text/html')).toBe(false);
    expect(accepts('logo.svg', 'image/svg+xml')).toBe(false);
    expect(accepts('IMG.heic', 'text/html')).toBe(false);
    expect(accepts('run.exe', 'image/heic')).toBe(false);
  });
});
