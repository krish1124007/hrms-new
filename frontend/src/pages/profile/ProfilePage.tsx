import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Save, UserCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/auth.api';
import { tokenStorage } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';
import { getRoleBadge } from '@/lib/permissions';
import { cn } from '@/lib/utils';

interface ProfileFormValues {
  firstName: string;
  lastName: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ProfilePage(): ReactElement {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const roleBadge = getRoleBadge(user);

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
  });
  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  // Keep the form in sync if the user object updates (e.g. after a save).
  useEffect(() => {
    profileForm.reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    });
  }, [user, profileForm]);

  const updateProfile = useMutation({
    mutationFn: authApi.updateMyProfile,
    onSuccess: ({ user: updated }) => {
      setSession({ user: updated });
      toast.success('Profile updated');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to update profile'),
  });

  const changePassword = useMutation({
    mutationFn: authApi.changeMyPassword,
    onSuccess: () => {
      toast.success('Password changed. Please sign in again.');
      // The server bumps sessionVersion + revokes sessions, so the existing
      // tokens are now invalid. Bounce to /login proactively.
      tokenStorage.clear();
      clear();
      navigate('/login');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to change password'),
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const onSubmitProfile = profileForm.handleSubmit((values) => {
    updateProfile.mutate({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
    });
  });

  const onSubmitPassword = passwordForm.handleSubmit((values) => {
    if (values.newPassword !== values.confirmPassword) {
      passwordForm.setError('confirmPassword', { message: "Passwords don't match" });
      return;
    }
    changePassword.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Profile' }]}
      />

      {/* Identity card */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
          <Avatar
            name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'User'}
            size="lg"
          />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold text-foreground">
              {user?.firstName} {user?.lastName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
            <span
              className={cn(
                'mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                roleBadge.className,
              )}
            >
              {roleBadge.label}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="size-5" /> Profile information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitProfile} className="space-y-4">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...profileForm.register('firstName', { required: true })} />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...profileForm.register('lastName', { required: true })} />
              </div>
              <div>
                <Label htmlFor="email-readonly">Email</Label>
                <Input id="email-readonly" value={user?.email ?? ''} disabled />
                <p className="mt-1 text-xs text-muted-foreground">
                  Email is set by your administrator and can't be changed here.
                </p>
              </div>
              <Button type="submit" loading={updateProfile.isPending}>
                <Save className="size-4" /> Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" /> Change password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitPassword} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    {...passwordForm.register('currentPassword', { required: true })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showCurrent ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...passwordForm.register('newPassword', {
                      required: true,
                      minLength: { value: 8, message: 'At least 8 characters' },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordForm.formState.errors.newPassword && (
                  <p className="mt-1 text-xs text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...passwordForm.register('confirmPassword', { required: true })}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                You'll be signed out on this device after changing your password.
              </p>
              <Button type="submit" loading={changePassword.isPending}>
                <KeyRound className="size-4" /> Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
