import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { useResetPassword } from '@/hooks/use-auth';

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
          <PasswordStrengthMeter password={pwd} />
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
