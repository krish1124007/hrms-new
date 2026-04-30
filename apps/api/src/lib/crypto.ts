import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY = createHash('sha256').update(env.ENCRYPTION_KEY).digest();

/**
 * Encrypt a UTF-8 string using AES-256-GCM. Returns a base64-encoded payload
 * of the form: iv | authTag | ciphertext.
 */
export function encryptString(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt a payload produced by `encryptString`.
 */
export function decryptString(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/**
 * Mask a key for display: shows last 4 chars only.
 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}
