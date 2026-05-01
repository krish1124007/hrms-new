import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Mail, Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SignupSuccessPage(): ReactElement {
  const [params] = useSearchParams();
  const slug = params.get('slug') ?? 'your-workspace';
  const email = params.get('email') ?? '';
  const name = params.get('name') ?? slug;

  const steps = [
    {
      icon: CheckCircle2,
      title: 'Workspace Created',
      description: `"${name}" has been registered successfully.`,
      status: 'done' as const,
    },
    {
      icon: Clock,
      title: 'Subdomain Setup (In Progress)',
      description: `Our team is provisioning ${slug}.ddhrms.com with your dedicated server.`,
      status: 'active' as const,
    },
    {
      icon: Mail,
      title: 'Welcome Email',
      description: `We'll email login instructions to ${email || 'your inbox'} within 24 hours.`,
      status: 'pending' as const,
    },
    {
      icon: Shield,
      title: 'You Sign In',
      description: `Once setup is complete, visit your subdomain and sign in with the credentials you just created.`,
      status: 'pending' as const,
    },
  ];

  return (
    <div>
      {/* Celebration header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-8" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">You're all set!</h1>
        <p className="text-sm text-muted-foreground">
          Your workspace has been registered. Here's what happens next.
        </p>
      </div>

      {/* Workspace URL preview */}
      <div className="mb-8 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Your workspace URL
        </p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">
          {slug}.ddhrms.com
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          This URL will be active once setup is complete.
        </p>
      </div>

      {/* Onboarding steps */}
      <ol className="mb-8 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <div
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                step.status === 'done'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : step.status === 'active'
                    ? 'bg-primary/10 text-primary ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <step.icon className="size-5" />
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-foreground">{step.title}</p>
                {step.status === 'active' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    In progress
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Info box */}
      <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
        <p className="mb-1 text-sm font-semibold text-foreground">Need to reach us?</p>
        <p className="text-xs text-muted-foreground">
          For urgent setup requests or questions, email{' '}
          <a href="mailto:onboarding@ddhrms.com" className="font-medium text-primary hover:underline">
            onboarding@ddhrms.com
          </a>{' '}
          with your workspace name.
        </p>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/login">Back to Sign In</Link>
        </Button>
      </div>
    </div>
  );
}
