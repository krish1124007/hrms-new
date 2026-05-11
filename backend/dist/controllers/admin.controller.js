import { z } from 'zod';
import { sendMail, verifyTransport } from '../services/email.service.js';
import { UnauthorizedError } from '../lib/errors.js';
export const testEmailSchema = z.object({
    to: z.string().email().optional(),
});
/**
 * Verifies the SMTP transport is configured + reachable, then optionally
 * sends a real test email. Admin-only.
 */
export async function testEmail(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = testEmailSchema.parse(req.body ?? {});
    // Default to the calling user's own email so the test is safe.
    const to = body.to ?? req.user.email;
    const verify = await verifyTransport();
    if (!verify.ok) {
        res.status(503).json({
            success: false,
            error: {
                code: 'EMAIL_TRANSPORT_UNAVAILABLE',
                message: verify.error ?? 'SMTP connection failed',
                details: { kind: verify.kind },
            },
        });
        return;
    }
    if (verify.kind === 'dev') {
        res.json({
            success: true,
            message: 'No email transport configured (dev mode). Set SMTP_HOST + credentials in apps/api/.env to send real emails.',
            data: { kind: 'dev', wouldSendTo: to },
        });
        return;
    }
    const ok = await sendMail({
        to,
        subject: 'DD HRMS — test email',
        html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #132446; margin: 0 0 12px;">Test email from DD HRMS</h2>
        <p style="color: #555; line-height: 1.5;">
          If you're seeing this, your SMTP configuration is working. Forgot-password
          emails, user invites, and other system notifications will be sent via this
          same transport.
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          Sent at ${new Date().toISOString()} • transport: ${verify.kind}
        </p>
      </div>
    `,
        text: `DD HRMS test email — sent at ${new Date().toISOString()} via ${verify.kind}.`,
    });
    if (!ok) {
        res.status(500).json({
            success: false,
            error: {
                code: 'EMAIL_SEND_FAILED',
                message: 'Transport accepted the connection but the send failed. Check API logs.',
            },
        });
        return;
    }
    res.json({
        success: true,
        message: `Test email sent to ${to}. Check your inbox (and spam folder).`,
        data: { kind: verify.kind, to },
    });
}
//# sourceMappingURL=admin.controller.js.map