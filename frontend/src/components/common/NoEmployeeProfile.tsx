import type { ReactElement, ReactNode } from 'react';
import { UserX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';

/**
 * Said instead of a silent empty list when the signed-in user has no
 * employee record — e.g. the seeded admin opening My Attendance.
 */
export function NoEmployeeProfileNotice({ feature }: { feature: string }): ReactElement {
  return (
    <EmptyState
      icon={UserX}
      title="No employee profile"
      description={`Your login is not linked to an employee record, so there is no ${feature} to show. Ask HR to link your account to an employee profile.`}
    />
  );
}

/**
 * Renders `children` unless the API says the user has no employee profile,
 * in which case it renders the notice. Any other outcome of the profile
 * lookup (including an error) renders `children` as before.
 */
export function RequireEmployeeProfile({
  feature,
  children,
}: {
  /** What the page would show, e.g. "attendance" — finishes the sentence. */
  feature: string;
  children: ReactNode;
}): ReactElement {
  const { noProfile, isLoading } = useMyEmployeeProfile();
  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (noProfile) return <NoEmployeeProfileNotice feature={feature} />;
  return <>{children}</>;
}
