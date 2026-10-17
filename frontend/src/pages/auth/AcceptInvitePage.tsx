import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrengthMeter } from '@/components/common/PasswordStrengthMeter';
import { useAcceptInvite } from '@/hooks/use-auth';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters').max(128, 'At most 128 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type FormValues = z.infer<typeof schema>;

interface ApiErrorShape {
  response?: { data?: { error?: { code?: string; message?: string } } };
}

function apiError(err: unknown): { code?: string; message: string } {
  const body = (err as ApiErrorShape | null)?.response?.data?.error;
  return {
    code: body?.code,
    message: body?.message ?? 'Could not activate your account. Please try again.',
  };
}

function BackToSignIn(): ReactElement {
  return (
    <Link to="/login" className="text-sm font-medium text-primary hover:underline">
      Back to sign in
    </Link>
  );
}

function InvalidInvite({ message }: { message: string }): ReactElement {
  return (
    <div className="mx-auto w-full max-w-sm text-center">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">Invitation not valid</h1>
      <p className="mb-6 text-sm text-muted-foreground">{message}</p>
      <BackToSignIn />
    </div>
  );
}

/**
 * Landing page for the invitation email (`/accept-invite?token=…`). The
 * invited user picks their first password; the API activates the account and
 * returns a session, so they land on the dashboard already signed in.
 */
export default function AcceptInvitePage(): ReactElement {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const accept = useAcceptInvite();
  const pwd = watch('password') ?? '';

  if (!token) {
    return <InvalidInvite message="This invitation link is missing its token. Open the link from your invitation email again, or ask your HR administrator to re-send it." />;
  }

  const error = accept.isError ? apiError(accept.error) : null;
  // A bad or already-used token cannot be fixed by retrying the form.
  if (error?.code === 'INVALID_INVITE') {
    return <InvalidInvite message={error.message} />;
  }

  const onSubmit = (values: FormValues): void => {
    accept.mutate({ token, password: values.password });
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Activate your account</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Choose a password to finish setting up your DD HRMS account.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="leading-relaxed">{error.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            {...register('password')}
          />
          <PasswordStrengthMeter password={pwd} />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
          {errors.confirm && (
            <p className="text-xs text-destructive">{errors.confirm.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={accept.isPending}>
          Activate account
        </Button>
      </form>

      <p className="mt-8 text-center">
        <BackToSignIn />
      </p>
    </div>
  );
}
