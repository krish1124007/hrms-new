import { useMemo, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function passwordStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[score] ?? 'Too weak' };
}

/** Five-bar strength hint shown under a new-password field (renders nothing when empty). */
export function PasswordStrengthMeter({ password }: { password: string }): ReactElement | null {
  const strength = useMemo(() => passwordStrength(password), [password]);
  if (!password) return null;
  return (
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
  );
}
