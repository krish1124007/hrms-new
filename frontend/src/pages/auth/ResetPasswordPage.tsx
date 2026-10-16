import { useMemo, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResetPassword } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type FormValues = z.infer<typeof schema>;

function passwordStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[score] ?? 'Too weak' };
}

export default function ResetPasswordPage(): ReactElement {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const reset = useResetPassword();
  const pwd = watch('password') ?? '';
  const strength = useMemo(() => passwordStrength(pwd), [pwd]);

  const onSubmit = (values: FormValues): void => {
    reset.mutate({ token, password: values.password });
  };

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Invalid link</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This password reset link is missing or invalid.
        </p>
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Set a new password</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Choose a strong password you haven't used before.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" {...register('password')} />
          {pwd && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      i < strength.score
                        ? strength.score <= 2
                          ? 'bg-destructive'
                          : strength.score <= 3
                            ? 'bg-warning'
                            : 'bg-success'
                        : 'bg-muted',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{strength.label}</p>
            </div>
          )}
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" {...register('confirm')} />
          {errors.confirm && (
            <p className="text-xs text-destructive">{errors.confirm.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={reset.isPending}>
          Reset password
        </Button>
      </form>
    </div>
  );
}
