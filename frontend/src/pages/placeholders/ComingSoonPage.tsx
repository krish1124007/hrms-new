import type { ReactElement, ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

export interface ComingSoonPageProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  features?: string[];
}

export default function ComingSoonPage({
  title,
  description,
  icon: Icon = Rocket,
  features = [],
}: ComingSoonPageProps): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description ?? `The ${title} module is on our roadmap and launching soon.`}
      />

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10 blur-2xl" />
            <div className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <Icon className="size-10 text-primary" />
            </div>
          </div>

          <div className="max-w-md space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3" />
              Coming Soon
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {title} is on the way
            </h2>
            <p className="text-sm text-muted-foreground">
              We&rsquo;re building this module with the same attention to detail you&rsquo;ve come
              to expect. Check back soon for the official launch.
            </p>
          </div>

          {features.length > 0 && (
            <div className="w-full max-w-lg">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                What&rsquo;s planned
              </p>
              <ul className="grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="mr-2 size-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
