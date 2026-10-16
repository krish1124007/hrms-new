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
export declare function loadSecret(name: string): string | undefined;
/** Throws if the secret is missing. Use for secrets the app cannot run without. */
export declare function requireSecret(name: string): string;
//# sourceMappingURL=secrets.d.ts.map