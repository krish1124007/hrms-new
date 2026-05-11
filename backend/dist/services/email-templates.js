/**
 * Email templates — renders common transactional emails as inline HTML.
 *
 * No template engine, just tagged templates for simplicity + compile-time
 * safety. For rich HTML campaigns, consider MJML or React Email later.
 */
import { sendMail } from './email.service.js';
import { env } from '../config/env.js';
const BASE_URL = env.CORS_ORIGIN ?? 'https://ddhrms.com';
/** Minimal HTML shell shared by every email */
function wrap(bodyHtml) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DD HRMS</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e4e4e7">
          <strong style="font-size:18px;letter-spacing:-0.02em">DD HRMS</strong>
        </td></tr>
        <tr><td style="padding:32px">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a">
          Sent by DD HRMS · <a href="${BASE_URL}" style="color:#4f46e5;text-decoration:none">${BASE_URL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
// ─── Templates ───
export async function sendWelcomeEmail(to, firstName, tenantSlug) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">Welcome to DD HRMS, ${firstName}!</h2>
    <p>Your workspace <strong>${tenantSlug}</strong> is being set up. Our team will email login details within 24 hours.</p>
    <p style="margin-top:24px">
      <a href="${BASE_URL}/login" style="display:inline-block;background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Go to sign in</a>
    </p>
    <p style="color:#71717a;margin-top:24px;font-size:14px">Need help? Reply to this email or contact support@ddhrms.com</p>
  `);
    await sendMail({ to, subject: 'Welcome to DD HRMS', html });
}
export async function sendTrialExpiringEmail(to, firstName, daysLeft) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">Your trial ends in ${daysLeft} days</h2>
    <p>Hi ${firstName},</p>
    <p>Your DD HRMS trial expires in ${daysLeft} days. Upgrade now to keep your data and avoid interruption.</p>
    <p style="margin-top:24px">
      <a href="${BASE_URL}/billing/plans" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Choose a plan</a>
    </p>
  `);
    await sendMail({ to, subject: `Your DD HRMS trial ends in ${daysLeft} days`, html });
}
export async function sendPaymentFailedEmail(to, firstName, amount) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px;color:#dc2626">Payment failed</h2>
    <p>Hi ${firstName},</p>
    <p>We couldn't process your payment of <strong>₹${amount.toLocaleString()}</strong>. We'll retry automatically over the next few days, but you can update your payment method now to avoid service interruption.</p>
    <p style="margin-top:24px">
      <a href="${BASE_URL}/billing/current" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Update payment method</a>
    </p>
  `);
    await sendMail({ to, subject: 'Action required: Payment failed', html });
}
export async function sendInvoiceEmail(to, firstName, invoiceNumber, pdfUrl, amount) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">Your invoice ${invoiceNumber}</h2>
    <p>Hi ${firstName},</p>
    <p>Thanks for your payment! Your invoice for <strong>₹${amount.toLocaleString()}</strong> is ready.</p>
    <p style="margin-top:24px">
      <a href="${pdfUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Download PDF</a>
    </p>
  `);
    await sendMail({ to, subject: `Invoice ${invoiceNumber} · ₹${amount.toLocaleString()}`, html });
}
export async function sendPasswordResetEmail(to, resetLink) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">Reset your password</h2>
    <p>Click below to set a new password. This link expires in 1 hour.</p>
    <p style="margin-top:24px">
      <a href="${resetLink}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Reset password</a>
    </p>
    <p style="color:#71717a;margin-top:24px;font-size:14px">If you didn't request this, you can safely ignore this email.</p>
  `);
    await sendMail({ to, subject: 'Reset your DD HRMS password', html });
}
export async function sendTicketUpdateEmail(to, ticketNumber, subject, agentReply) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">New reply on ticket ${ticketNumber}</h2>
    <p style="color:#71717a;margin:0 0 16px">Re: ${subject}</p>
    <div style="background:#fafafa;border-left:3px solid #4f46e5;padding:12px 16px;margin:16px 0;font-size:14px">
      ${agentReply}
    </div>
    <p style="margin-top:24px">
      <a href="${BASE_URL}/support/tickets/${ticketNumber}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View ticket</a>
    </p>
  `);
    await sendMail({ to, subject: `[${ticketNumber}] ${subject}`, html });
}
export async function sendAnnouncementEmail(to, title, bodyHtml) {
    const html = wrap(`
    <h2 style="margin:0 0 16px;font-size:22px">${title}</h2>
    <div style="font-size:15px;line-height:1.6">${bodyHtml}</div>
    <p style="color:#71717a;margin-top:24px;font-size:12px">
      You're receiving this because you're an admin on a DD HRMS workspace.
    </p>
  `);
    await sendMail({ to, subject: title, html });
}
//# sourceMappingURL=email-templates.js.map