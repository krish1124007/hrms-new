import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Email dispatcher with a tiered transport:
 *
 *   1. `RESEND_API_KEY` set → Resend HTTP API (modern SaaS default)
 *   2. `SMTP_HOST` set      → nodemailer SMTP (legacy/self-hosted)
 *   3. nothing set          → dev-mode: log the mail to stdout, return OK
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

type MailTransport =
  | { kind: 'resend' }
  | { kind: 'smtp'; transporter: Transporter }
  | { kind: 'dev' };

function resolveTransport(): MailTransport {
  if (env.RESEND_API_KEY) return { kind: 'resend' };
  if (env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
      // Hardening: fail within 10s instead of hanging workers
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    return { kind: 'smtp', transporter };
  }
  return { kind: 'dev' };
}

const transport = resolveTransport();

logger.info({ transport: transport.kind }, 'email transport initialised');

async function sendViaResend(input: SendMailInput): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

/**
 * Send an email via the configured transport.
 *
 * Returns true on success / dev-noop, false if delivery failed (errors are
 * logged but never thrown — callers are typically fire-and-forget).
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  try {
    if (transport.kind === 'dev') {
      logger.info(
        { to: input.to, subject: input.subject, tags: input.tags },
        '[email:dev] would send mail (no transport configured)',
      );
      return true;
    }
    if (transport.kind === 'resend') {
      await sendViaResend(input);
      logger.info(
        { to: input.to, subject: input.subject, transport: 'resend' },
        'email sent',
      );
      return true;
    }
    const info = await transport.transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    logger.info(
      {
        to: input.to,
        subject: input.subject,
        transport: 'smtp',
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      },
      'email sent',
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (err as any)?.message ?? String(err);
    logger.error(
      { err, to: input.to, subject: input.subject, errorMessage: msg },
      'sendMail failed',
    );
    return false;
  }
}

/**
 * Verify SMTP credentials by opening a connection and running EHLO+AUTH
 * without actually sending mail. Useful for the admin test-email endpoint.
 */
export async function verifyTransport(): Promise<{
  ok: boolean;
  kind: MailTransport['kind'];
  error?: string;
}> {
  try {
    if (transport.kind === 'dev') return { ok: true, kind: 'dev' };
    if (transport.kind === 'resend') {
      // Resend has no verify endpoint; treat as ok if key present.
      return { ok: true, kind: 'resend' };
    }
    await transport.transporter.verify();
    return { ok: true, kind: 'smtp' };
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ok: false, kind: transport.kind, error: (err as any)?.message ?? String(err) };
  }
}
