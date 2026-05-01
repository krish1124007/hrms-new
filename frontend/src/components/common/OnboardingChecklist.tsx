import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/axios';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'ddhrms.onboarding.dismissed';

interface Task {
  id: string;
  label: string;
  description: string;
  done: boolean;
  cta: { label: string; to: string };
}

interface OnboardingStatus {
  userCount: number;
  departmentCount: number;
  employeeCount: number;
  shiftCount: number;
}

async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const [users, departments, employees, shifts] = await Promise.allSettled([
    api.get<{ pagination: { total: number } }>('/users?limit=1'),
    api.get<{ pagination: { total: number } }>('/departments?limit=1'),
    api.get<{ pagination: { total: number } }>('/employees?limit=1'),
    api.get<{ pagination: { total: number } }>('/shifts?limit=1'),
  ]);

  const total = (r: PromiseSettledResult<{ data?: unknown; pagination?: { total: number } } | unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.status === 'fulfilled' ? ((r.value as any)?.data?.pagination?.total ?? 0) : 0;

  return {
    userCount: total(users),
    departmentCount: total(departments),
    employeeCount: total(employees),
    shiftCount: total(shifts),
  };
}

export function OnboardingChecklist(): ReactElement | null {
  const { user } = useAuth();
  const isAdmin = user?.role?.slug === 'admin';

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [collapsed, setCollapsed] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: fetchOnboardingStatus,
    staleTime: 2 * 60_000,
    retry: 1,
    enabled: isAdmin && !dismissed,
    meta: { silent: true },
  });

  const tasks = useMemo<Task[]>(() => {
    if (!status) return [];
    return [
      {
        id: 'invite',
        label: 'Invite your team',
        description: 'Add at least one teammate so you\'re not working alone.',
        done: status.userCount > 1,
        cta: { label: 'Invite', to: '/users' },
      },
      {
        id: 'department',
        label: 'Create a department',
        description: 'Organise employees into departments for reporting structure.',
        done: status.departmentCount > 0,
        cta: { label: 'Add department', to: '/departments' },
      },
      {
        id: 'employee',
        label: 'Add your first employee',
        description: 'Employee records unlock payroll, attendance, and leave tracking.',
        done: status.employeeCount > 0,
        cta: { label: 'Add employee', to: '/employees/new' },
      },
      {
        id: 'shift',
        label: 'Set up an attendance shift',
        description: 'Define working hours so check-ins are scored correctly.',
        done: status.shiftCount > 0,
        cta: { label: 'Create shift', to: '/shifts' },
      },
    ];
  }, [status]);

  const completedCount = tasks.filter((t) => t.done).length;
  const totalCount = tasks.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  useEffect(() => {
    if (allDone) {
      const t = setTimeout(() => {
        localStorage.setItem(DISMISS_KEY, '1');
        setDismissed(true);
      }, 30_000);
      return () => clearTimeout(t);
    }
  }, [allDone]);

  if (dismissed || !isAdmin || isLoading || !status) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">
              {allDone ? 'You\'re all set!' : 'Get started'}
            </h3>
            <Badge variant="secondary">
              {completedCount}/{totalCount}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem(DISMISS_KEY, '1');
                setDismissed(true);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>

        {!collapsed && (
          <ul className="mt-4 space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                  t.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border',
                )}
              >
                {t.done ? (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      t.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {t.label}
                  </div>
                  {!t.done && (
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  )}
                </div>
                {!t.done && (
                  <Link to={t.cta.to}>
                    <Button size="sm" variant="outline">
                      {t.cta.label}
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
