import 'dotenv/config';
import { z } from 'zod';
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().url().default('mongodb://localhost:27017/hrms'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    /**
     * Local upload directory. Generated/uploaded files (payslip PDFs, backup
     * tarballs, document attachments) are written here and served at /uploads/*
     * by Express.
     */
    UPLOAD_DIR: z.string().default('./uploads'),
    MEILISEARCH_HOST: z.string().url().default('http://localhost:7700'),
    MEILISEARCH_API_KEY: z.string().default('masterKey'),
    RESEND_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('no-reply@example.com'),
    COMPANY_NAME: z.string().default('Company'),
    COMPANY_EMAIL: z.string().optional(),
    COMPANY_STATE_CODE: z.string().default('MH'),
    COMPANY_GSTIN: z.string().default('27AAAAA0000A1Z5'),
    GST_RATE_PERCENT: z.coerce.number().default(18),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    ENCRYPTION_KEY: z
        .string()
        .min(32, 'ENCRYPTION_KEY must be at least 32 characters')
        .default('dev_only_encryption_key_change_me_please_32_chars'),
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
const WEAK_SECRETS = [
    'replace_me_with_a_long_random_string_min_32_chars',
    'replace_me_with_a_different_long_random_string_min_32',
    'change_me',
    'dev_only_encryption_key_change_me_please_32_chars',
    'changeme123',
];
if (env.NODE_ENV === 'production') {
    const issues = [];
    if (WEAK_SECRETS.includes(env.JWT_SECRET))
        issues.push('JWT_SECRET');
    if (WEAK_SECRETS.includes(env.JWT_REFRESH_SECRET))
        issues.push('JWT_REFRESH_SECRET');
    if (WEAK_SECRETS.includes(env.ENCRYPTION_KEY))
        issues.push('ENCRYPTION_KEY');
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET)
        issues.push('JWT_SECRET === JWT_REFRESH_SECRET (must differ)');
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
//# sourceMappingURL=env.js.map