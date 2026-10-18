/**
 * Transactional e-mails for HR events: a decision on a request, and a payslip
 * becoming available. Pure renderers — `{ subject, html, text }` for the
 * caller to pass to `sendMail` — so there is nothing to mock and nothing to
 * await. Links are app paths ("/overtime"); they are made absolute here.
 */
import { appBaseUrl } from '../lib/app-url.js';
import { cycleLabel } from '../lib/payroll-cycle.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** One heading, one paragraph, one button — the whole body of these mails. */
function render(subject: string, body: string, link: string, linkLabel: string): RenderedEmail {
  const url = `${appBaseUrl()}${link}`;
  return {
    subject,
    html:
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;max-width:560px">` +
      `<h2 style="margin:0 0 16px;font-size:20px">${escapeHtml(subject)}</h2>` +
      `<p style="margin:0 0 24px;line-height:1.5">${escapeHtml(body)}</p>` +
      `<a href="${escapeHtml(url)}" style="display:inline-block;background:#18181b;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none">${escapeHtml(linkLabel)}</a>` +
      `</div>`,
    text: `${subject}\n\n${body}\n\n${linkLabel}: ${url}`,
  };
}

/** "Your overtime request was approved" — the title is the subject, `body` the sentence under it. */
export function decisionEmail(input: { title: string; body: string; link: string }): RenderedEmail {
  return render(input.title, input.body, input.link, 'View details');
}

/** "Your payslip for October 2026 is ready" — `month` is 1-12. */
export function payslipReadyEmail(input: { month: number; year: number; link: string }): RenderedEmail {
  const period = cycleLabel(input);
  return render(
    `Your payslip for ${period} is ready`,
    `Your payslip for ${period} is now available. You can view and download it from your payslips.`,
    input.link,
    'View your payslips',
  );
}
