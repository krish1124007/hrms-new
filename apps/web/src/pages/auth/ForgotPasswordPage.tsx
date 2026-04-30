import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForgotPassword } from '@/hooks/use-auth';

const schema = z.object({ email: z.string().email() });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage(): ReactElement {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const forgot = useForgotPassword();

  const onSubmit = (values: FormValues): void => {
    forgot.mutate(values.email, { onSuccess: () => setSent(true) });
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
          <Mail className="size-6" />
        </div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Check your inbox</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          If an account exists for that email, we've sent a password reset link.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Forgot password?</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Enter your email and we'll send you a reset link.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
