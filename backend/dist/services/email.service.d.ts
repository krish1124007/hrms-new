import { type Transporter } from 'nodemailer';
/**
 * Email dispatcher with a tiered transport:
 *
 *   1. `RESEND_API_KEY` set → Resend HTTP API (modern SaaS default)
 *   2. `SMTP_HOST` set      → nodemailer SMTP (legacy/self-hosted)
 *   3. nothing set          → dev-mode: log the mail to stdout, return OK
 *                             (production: log an error, return false —
 *                             never report a mail as sent that was not)
 *
 * This means `sendMail()` never throws in dev (so BullMQ dunning jobs don't
 * retry endlessly) and is production-ready the moment a key is provided.
 * Failures are logged but do not propagate — the caller's business logic
 * should not depend on email delivery success for critical paths.
 */
export interface SendMailInput {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    tags?: Record<string, string>;
}
type MailTransport = {
    kind: 'resend';
} | {
    kind: 'smtp';
    transporter: Transporter;
} | {
    kind: 'dev';
};
/**
 * Send an email via the configured transport.
 *
 * Returns true on success / dev-noop, false if delivery failed or production
 * has no transport at all (errors are logged but never thrown — callers are
 * typically fire-and-forget).
 */
export declare function sendMail(input: SendMailInput): Promise<boolean>;
/**
 * Verify SMTP credentials by opening a connection and running EHLO+AUTH
 * without actually sending mail. Useful for the admin test-email endpoint.
 */
export declare function verifyTransport(): Promise<{
    ok: boolean;
    kind: MailTransport['kind'];
    error?: string;
}>;
export {};
//# sourceMappingURL=email.service.d.ts.map