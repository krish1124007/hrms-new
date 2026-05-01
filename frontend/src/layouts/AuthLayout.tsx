import type { ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import { CalendarOff, ClipboardCheck, FileText, Users } from 'lucide-react';

const HIGHLIGHTS: { icon: typeof Users; title: string; copy: string }[] = [
  {
    icon: Users,
    title: 'Employee directory',
    copy: 'Profiles, departments, designations, reporting trees — all in one place.',
  },
  {
    icon: ClipboardCheck,
    title: 'Attendance & payroll',
    copy: 'Geofence + QR + face check-ins flow straight into monthly payroll runs.',
  },
  {
    icon: CalendarOff,
    title: 'Leaves & holidays',
    copy: 'Apply, approve and balance — with company-wide visibility.',
  },
  {
    icon: FileText,
    title: 'Documents & policies',
    copy: 'Onboarding files, HR policies, payslips, and ID cards — always to hand.',
  },
];

export function AuthLayout(): ReactElement {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: form column */}
      <div className="flex items-center justify-center px-6 py-12">
        <Outlet />
      </div>

      {/* Right: marketing hero — hidden on small screens */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-primary to-blue-700 lg:block">
        {/* Soft blobs */}
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -left-24 top-16 size-96 rounded-full bg-white/25 blur-3xl" />
          <div className="absolute bottom-12 right-0 size-[28rem] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute left-1/3 top-1/2 size-72 rounded-full bg-blue-300/20 blur-3xl" />
        </div>

        {/* Content */}
        <div className="relative flex h-full flex-col justify-between px-12 py-12 text-primary-foreground">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="DD HRMS"
              className="size-10 rounded-xl ring-1 ring-white/20"
            />
            <div className="text-base font-semibold tracking-tight">DD HRMS</div>
          </div>

          {/* Headline + bullets */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold leading-[1.1] tracking-tight">
                Run your people<br />operations end&#8209;to&#8209;end.
              </h2>
              <p className="mt-3 max-w-md text-base text-primary-foreground/85">
                Hiring to retirement, attendance to payroll — every HR workflow
                for Dharmesh Deshani Group of Companies, in one platform.
              </p>
            </div>

            <ul className="space-y-3.5">
              {HIGHLIGHTS.map(({ icon: Icon, title, copy }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-sm text-primary-foreground/75">{copy}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Footnote */}
          <p className="text-xs text-primary-foreground/60">
            © {new Date().getFullYear()} Dharmesh Deshani Group of Companies. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
