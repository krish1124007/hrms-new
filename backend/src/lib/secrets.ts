import fs from 'node:fs';
import path from 'node:path';
import { decryptString } from './crypto.js';
import { logger } from '../config/logger.js';

/**
 * Secrets-at-rest loader.
 *
 * Resolution order (first match wins):
 *   1. `<NAME>_FILE` env var points to a file on disk  → read file contents
 *      (standard Docker/Kubernetes secret-injection convention)
 *   2. `<NAME>_ENCRYPTED` env var                       → AES-256-GCM decrypt
 *      using ENCRYPTION_KEY (see lib/crypto.ts)
 *   3. `<NAME>` env var                                 → plaintext fallback,
 *      logs a warning in production
 *
 * Migration path from plaintext .env:
 *   a. Keep current `<NAME>` in .env during dev.
 *   b. For staging/prod, replace with `<NAME>_FILE=/run/secrets/<name>` and
 *      mount the secret via Docker/K8s/Vault agent sidecar.
 *   c. Or, for a lighter setup, use `<NAME>_ENCRYPTED=<base64>` and supply
 *      ENCRYPTION_KEY through a secure channel (KMS-wrapped DEK, etc.).
 *
 * This is a drop-in for `process.env.XXX` that adds the above capabilities
 * without changing how the rest of the code consumes secrets.
 */
export function loadSecret(name: string): string | undefined {
  const fileEnv = process.env[`${name}_FILE`];
  if (fileEnv) {
    try {
      return fs.readFileSync(path.resolve(fileEnv), 'utf8').trim();
    } catch (err) {
      logger.error({ err, name, file: fileEnv }, 'Failed to read secret from file');
      throw new Error(`Cannot read secret file for ${name}: ${fileEnv}`);
    }
  }

  const encEnv = process.env[`${name}_ENCRYPTED`];
  if (encEnv) {
    try {
      return decryptString(encEnv);
    } catch (err) {
      logger.error({ err, name }, 'Failed to decrypt secret');
      throw new Error(`Cannot decrypt secret ${name}_ENCRYPTED`);
    }
  }

  const plain = process.env[name];
  if (plain && process.env.NODE_ENV === 'production') {
    // Nudge operators toward a safer mechanism without breaking them
    logger.warn(
      { name },
      `Secret "${name}" is set in plaintext env in production — consider ${name}_FILE or ${name}_ENCRYPTED`,
    );
  }
  return plain;
}

/** Throws if the secret is missing. Use for secrets the app cannot run without. */
export function requireSecret(name: string): string {
  const val = loadSecret(name);
  if (!val) throw new Error(`Required secret "${name}" is not set`);
  return val;
}
