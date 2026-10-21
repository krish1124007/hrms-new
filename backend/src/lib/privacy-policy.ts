/**
 * The public privacy policy page (GET /api/v1/privacy-policy) — the URL the
 * app-store listings link to. Contact address: SUPPORT_EMAIL, else COMPANY_EMAIL.
 */
import { env } from '../config/env.js';

export const APP_NAME = 'D-HRMS';
export const COMPANY_NAME = 'Dharmesh Deshani Group of Companies';

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The contact address the page shows: SUPPORT_EMAIL, else COMPANY_EMAIL, else none. */
export function privacyContactEmail(): string | null {
  return env.SUPPORT_EMAIL || env.COMPANY_EMAIL || null;
}

export function privacyPolicyHtml(contactEmail: string | null): string {
  const contact = contactEmail
    ? `<p>E-mail: <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></p>`
    : '<p>Contact your HR department.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy - ${APP_NAME}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.7; padding: 40px; max-width: 900px; margin: auto; color: #222; }
    h1, h2 { color: #111; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>

  <p>
    ${APP_NAME} is the human-resources system of ${COMPANY_NAME} ("we", "our", "us"),
    used by its employees on the web and in the ${APP_NAME} mobile app. This policy explains
    what information the system collects, how it is used and how it is protected.
  </p>

  <h2>Information We Collect</h2>
  <ul>
    <li>Employee details: name, e-mail, phone number, department, designation, address, emergency contact, bank and statutory details needed for payroll</li>
    <li>Attendance, leave, overtime, expense and payroll records</li>
    <li>Location: when you check in or out, and — for field staff on duty — during field visits and live tracking</li>
    <li>Photos taken at attendance check-in where required, and files you attach to requests and documents</li>
    <li>Sign-in credentials (passwords are stored only as one-way hashes) and the device information needed to send notifications</li>
  </ul>

  <h2>How We Use Information</h2>
  <ul>
    <li>Running HR operations: attendance, leave, payroll, expenses and field sales</li>
    <li>Sending notifications and e-mails about your requests and payslips</li>
    <li>Keeping the system secure and diagnosing errors</li>
  </ul>

  <h2>Data Sharing</h2>
  <p>
    We do not sell, trade or rent personal information. Data is processed by the services that run
    ${APP_NAME}: our servers, the e-mail delivery service, push notifications (Firebase Cloud Messaging)
    and error monitoring (Sentry), each only for that purpose.
  </p>

  <h2>Data Security</h2>
  <p>
    Access is limited by role and permission, connections are encrypted, and sensitive fields such as
    bank and PAN details are encrypted at rest.
  </p>

  <h2>Your Rights</h2>
  <p>You may ask for a copy of your data, or for it to be corrected or deleted, by contacting us.</p>

  <h2>Changes to This Policy</h2>
  <p>We may update this policy from time to time; changes are posted on this page.</p>

  <h2>Contact Us</h2>
  ${contact}

  <p>Last updated: October 2026</p>
</body>
</html>`;
}
