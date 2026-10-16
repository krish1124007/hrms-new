import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  /** Optional Lucide icon rendered next to the title. */
  icon?: LucideIcon;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon: Icon,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground transition-colors">
                  {b.label}
                </Link>
              ) : (
                <span className="text-foreground">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight className="size-3.5" />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <Icon className="size-5" aria-hidden />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </header>
  );
}
