import { type ReactElement } from 'react';
import { Mail, Phone, Globe, Clock, LifeBuoy, ChevronRight } from 'lucide-react';

/**
 * Public, no-auth support page for the D-HRMS mobile app.
 *
 * This is linked as the "Support URL" in App Store Connect / Google Play, so it
 * MUST be reachable without logging in. Keep it self-contained (no dashboard
 * layout, no auth store) so app-store reviewers and end users can open it
 * directly.
 *
 * Update the CONTACT values below with your real support details.
 */
const CONTACT = {
  appName: 'D-HRMS',
  company: 'DDIPL',
  email: 'info@dharmeshdeshani.com',
  phone: '+91 92130 17921',
  website: 'https://hrms.ddipl.org',
  hours: 'Monday – Saturday, 10:00 AM – 6:00 PM IST',
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I log in?',
    a: 'Use the employee credentials provided by your organization’s HR/admin team. If you don’t have an account, please contact your HR department — D-HRMS accounts are created only by your employer.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'Tap “Forgot Password” on the login screen and follow the reset link sent to your registered email. If you don’t receive it, contact support using the details below.',
  },
  {
    q: 'Face / GPS attendance is not working.',
    a: 'Make sure you have granted the app Camera and Location permissions in your phone settings, and that you have an active internet connection. Then restart the app and try again.',
  },
  {
    q: 'My payslip / leave balance looks wrong.',
    a: 'Payroll and leave data is managed by your HR team. Please raise the discrepancy with your HR/admin, who can correct it from the D-HRMS web dashboard.',
  },
  {
    q: 'How do I delete my account or data?',
    a: 'D-HRMS accounts are managed by your employer. To request account or data deletion, contact your HR department or email us at the address below.',
  },
];

export default function SupportPage(): ReactElement {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-12">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <LifeBuoy className="size-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{CONTACT.appName} Support</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Need help with the {CONTACT.appName} app? We’re here for you. Reach out using the
            options below or browse the common questions.
          </p>
        </div>

        {/* Contact cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`mailto:${CONTACT.email}`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Email us</div>
              <div className="text-sm text-muted-foreground break-all">{CONTACT.email}</div>
            </div>
          </a>

          <a
            href={`tel:${CONTACT.phone.replace(/\s+/g, '')}`}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <Phone className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Call us</div>
              <div className="text-sm text-muted-foreground">{CONTACT.phone}</div>
            </div>
          </a>

          <a
            href={CONTACT.website}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <Globe className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Website</div>
              <div className="text-sm text-muted-foreground break-all">{CONTACT.website}</div>
            </div>
          </a>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold">Support hours</div>
              <div className="text-sm text-muted-foreground">{CONTACT.hours}</div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Frequently asked questions</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {FAQS.map((item) => (
              <details key={item.q} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                  {item.q}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <p>
            {CONTACT.appName} is an enterprise HR application intended for employees of
            organizations using the {CONTACT.appName} platform.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} {CONTACT.company}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
