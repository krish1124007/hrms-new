import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  signFileUrl,
  verifyFileSignature,
  storedFormOfSignedUrl,
  isStaleSignedUrl,
} from './file-urls.js';

/** Pull `{ key, exp, sig }` back out of a URL produced by signFileUrl. */
function parts(signed: string): { key: string; exp: string; sig: string } {
  const url = new URL(signed);
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/v1\/files\//, ''));
  return { key, exp: url.searchParams.get('exp') ?? '', sig: url.searchParams.get('sig') ?? '' };
}

describe('signFileUrl / verifyFileSignature', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a signature and strips /uploads/', () => {
    const signed = signFileUrl('/uploads/a/b.pdf');

    // Test env has no PUBLIC_BASE_URL and is not production → the API's own port.
    expect(signed.startsWith('http://localhost:4000/api/v1/files/a/b.pdf?exp=')).toBe(true);
    expect(signed).toContain('&sig=');
    expect(signed).not.toContain('/uploads/');

    const { key, exp, sig } = parts(signed);
    expect(key).toBe('a/b.pdf');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    const now = Math.floor(Date.now() / 1000);
    expect(Number(exp)).toBeGreaterThanOrEqual(now + 600 - 2);
    expect(Number(exp)).toBeLessThanOrEqual(now + 600);
    expect(verifyFileSignature(key, exp, sig)).toBe(true);
  });

  it('signs a bare key the same way and percent-encodes each path segment', () => {
    const signed = signFileUrl('docs/my file #1.pdf');
    expect(signed).toContain('/api/v1/files/docs/my%20file%20%231.pdf?exp=');
    const { key, exp, sig } = parts(signed);
    expect(key).toBe('docs/my file #1.pdf');
    expect(verifyFileSignature(key, exp, sig)).toBe(true);
  });

  it('rejects a tampered key', () => {
    const { exp, sig } = parts(signFileUrl('/uploads/a/b.pdf'));
    expect(verifyFileSignature('a/c.pdf', exp, sig)).toBe(false);
  });

  it('rejects a tampered expiry or signature', () => {
    const { key, exp, sig } = parts(signFileUrl('/uploads/a/b.pdf'));
    expect(verifyFileSignature(key, String(Number(exp) + 3600), sig)).toBe(false);
    expect(verifyFileSignature(key, exp, sig.replace(/^./, (c) => (c === '0' ? '1' : '0')))).toBe(false);
    expect(verifyFileSignature(key, exp, sig.slice(0, 10))).toBe(false);
    expect(verifyFileSignature(key, exp, '')).toBe(false);
    expect(verifyFileSignature(key, 'not-a-number', sig)).toBe(false);
  });

  it('rejects an expired signature', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { key, exp, sig } = parts(signFileUrl('/uploads/a/b.pdf', 60));
    expect(verifyFileSignature(key, exp, sig)).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'));
    expect(verifyFileSignature(key, exp, sig)).toBe(false);
  });
});

describe('storedFormOfSignedUrl', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A link signed at T with a 60 s TTL, read back `minutesPastExpiry` after it expired. */
  function signedThenAged(minutesPastExpiry: number): string {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const signed = signFileUrl('/uploads/docs/my file.pdf', 60);
    vi.setSystemTime(new Date(Date.parse('2026-01-01T00:01:00Z') + minutesPastExpiry * 60_000));
    return signed;
  }

  it('turns an authentic signed URL back into its /uploads/ stored form within its lifetime', () => {
    const signed = signFileUrl('/uploads/docs/my file.pdf');
    expect(storedFormOfSignedUrl(signed)).toBe('/uploads/docs/my file.pdf');
  });

  it('still converts a link that expired less than an hour ago (form held open past the TTL)', () => {
    const signed = signedThenAged(30);
    const { key, exp, sig } = parts(signed);
    expect(verifyFileSignature(key, exp, sig)).toBe(false);
    expect(storedFormOfSignedUrl(signed)).toBe('/uploads/docs/my file.pdf');
  });

  it('refuses a link that expired more than an hour ago (no resurrecting old links)', () => {
    const signed = signedThenAged(120);
    expect(storedFormOfSignedUrl(signed)).toBeNull();
    expect(isStaleSignedUrl(signed)).toBe(true);
  });

  it('isStaleSignedUrl is false for live, in-grace, forged and unrelated strings', () => {
    expect(isStaleSignedUrl(signFileUrl('/uploads/docs/a.pdf'))).toBe(false);
    expect(isStaleSignedUrl(signedThenAged(30))).toBe(false);
    const old = signedThenAged(120);
    expect(isStaleSignedUrl(old.replace('my%20file.pdf', 'other.pdf'))).toBe(false);
    expect(isStaleSignedUrl('plain text')).toBe(false);
  });

  it('returns null for forged, unsigned or unrelated strings', () => {
    const signed = signFileUrl('/uploads/docs/a.pdf');
    expect(storedFormOfSignedUrl(signed.replace('docs/a.pdf', 'backups/db.tar.gz'))).toBeNull();
    expect(storedFormOfSignedUrl('http://localhost:4000/api/v1/files/docs/a.pdf')).toBeNull();
    expect(storedFormOfSignedUrl('https://example.com/a.pdf')).toBeNull();
    expect(storedFormOfSignedUrl('plain text')).toBeNull();
  });
});
