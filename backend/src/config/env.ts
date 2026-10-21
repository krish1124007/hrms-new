import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Interface the HTTP server binds to. The default (all interfaces) keeps
   * local development and containers working; set HOST=127.0.0.1 behind nginx
   * on the same machine so the API is reachable only through the proxy.
   */
  HOST: z.string().default('0.0.0.0'),

  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/hrms'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  /**
   * Local upload directory. Generated/uploaded files (payslip PDFs, document
   * attachments) are written here. Nothing in it is served publicly: the API
   * hands out short-lived signed links to /api/v1/files/*.
   */
  UPLOAD_DIR: z.string().default('./uploads'),

  /**
   * Database backup tarballs. Must be outside UPLOAD_DIR: backups are never
   * signed into file links, only streamed by GET /api/v1/backups/:id/download
   * (permission `backups.manage`). Created on demand.
   */
  BACKUP_DIR: z.string().default('./backups'),

  /**
   * The only database a backup may be restored into (a throwaway scratch DB,
   * never prod). Must name a database other than MONGODB_URI's. Unset: the
   * restore endpoint answers 400 RESTORE_TARGET_NOT_CONFIGURED.
   */
  BACKUP_SCRATCH_MONGO_URI: z.string().url().optional(),

  /**
   * Public origin that signed file links are built on. Defaults to CORS_ORIGIN
   * in production (nginx proxies /api/v1 on the web origin) and to the API's
   * own http://localhost:PORT elsewhere.
   */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** Lifetime of a signed file link, in seconds. */
  FILE_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  MEILISEARCH_HOST: z.string().url().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string().default('masterKey'),

  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@example.com'),
  /**
   * Production refuses to boot without a mail transport (RESEND_API_KEY or
   * SMTP_HOST) because invitations and password resets could never be
   * delivered. Set to "true" to boot anyway, with e-mail disabled.
   */
  ALLOW_NO_MAIL: z.enum(['true', 'false']).default('false'),

  COMPANY_NAME: z.string().default('Company'),
  COMPANY_EMAIL: z.string().optional(),
  /** Contact address on the public privacy policy (GET /api/v1/privacy-policy); falls back to COMPANY_EMAIL. */
  SUPPORT_EMAIL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().email('SUPPORT_EMAIL must be an e-mail address').optional(),
  ),
  /**
   * The company's state: the seller state on GST invoices, and the Professional
   * Tax state of an employee with no state on file (payroll).
   */
  COMPANY_STATE_CODE: z.string().default('MH'),
  COMPANY_GSTIN: z.string().default('27AAAAA0000A1Z5'),
  GST_RATE_PERCENT: z.coerce.number().default(18),

  /**
   * Payroll statutory rules (see lib/statutory.ts). PF is `PF_RATE_PERCENT` of
   * the earned basic + DA up to `PF_WAGE_CEILING`; ESI applies while the
   * full-month gross is within `ESI_WAGE_CEILING` (decided once per
   * Apr–Sep / Oct–Mar contribution period).
   */
  PF_WAGE_CEILING: z.coerce.number().positive().default(15000),
  PF_RATE_PERCENT: z.coerce.number().min(0).max(100).default(12),
  ESI_WAGE_CEILING: z.coerce.number().positive().default(21000),
  ESI_EMPLOYEE_PERCENT: z.coerce.number().min(0).max(100).default(0.75),
  ESI_EMPLOYER_PERCENT: z.coerce.number().min(0).max(100).default(3.25),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Serve Swagger UI (/api/docs) and the OpenAPI JSON (/api/docs.json) in
   * production. Always on outside production. Off by default: the spec is a
   * complete inventory of the API surface.
   */
  ENABLE_API_DOCS: z.enum(['true', 'false']).default('false'),
  /**
   * Shared secret for /api/metrics. Requests from a non-loopback address must
   * send it as `X-Metrics-Token`; loopback callers need nothing. Unset: only
   * loopback may scrape.
   */
  METRICS_TOKEN: z.preprocess(
    // A blank `METRICS_TOKEN=` line in .env means "not configured".
    (value) => (value === '' ? undefined : value),
    z.string().min(16, 'METRICS_TOKEN must be at least 16 characters').optional(),
  ),

  ENCRYPTION_KEY: z
    .string()
    .min(32, 'ENCRYPTION_KEY must be at least 32 characters')
    .default('dev_only_encryption_key_change_me_please_32_chars'),

  /**
   * Path to a Firebase service-account JSON (Firebase console → Project
   * settings → Service accounts). Set: every in-app notification is also
   * pushed through FCM to the user's registered phones. Unset or blank: push
   * is a silent no-op.
   */
  FIREBASE_SERVICE_ACCOUNT_PATH: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().optional(),
  ),

  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

const WEAK_SECRETS = [
  'replace_me_with_a_long_random_string_min_32_chars',
  'replace_me_with_a_different_long_random_string_min_32',
  'change_me',
  'dev_only_encryption_key_change_me_please_32_chars',
  'changeme123',
];

if (env.NODE_ENV === 'production') {
  const issues: string[] = [];
  if (WEAK_SECRETS.includes(env.JWT_SECRET)) issues.push('JWT_SECRET');
  if (WEAK_SECRETS.includes(env.JWT_REFRESH_SECRET)) issues.push('JWT_REFRESH_SECRET');
  if (WEAK_SECRETS.includes(env.ENCRYPTION_KEY)) issues.push('ENCRYPTION_KEY');
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) issues.push('JWT_SECRET === JWT_REFRESH_SECRET (must differ)');
  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Weak/placeholder secrets detected in production:');
    // eslint-disable-next-line no-console
    issues.forEach((i) => console.error('  •', i));
    // eslint-disable-next-line no-console
    console.error('\nGenerate strong secrets:  openssl rand -hex 64');
    process.exit(1);
  }
}

if (env.NODE_ENV === 'development') {
  if (WEAK_SECRETS.includes(env.JWT_SECRET) || WEAK_SECRETS.includes(env.JWT_REFRESH_SECRET)) {
    // eslint-disable-next-line no-console
    console.warn('WARNING: Using placeholder JWT secrets. Run: openssl rand -hex 64');
  }
}
